'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { deterministicUuid, randomUuid } = require('../schema');

/**
 * Get Codex sessions directory for today.
 * @param {Date} [date]
 * @returns {string}
 */
function getCodexSessionDir(date) {
  const d = date || new Date();
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return path.join(os.homedir(), '.codex', 'sessions', year, month, day);
}

/**
 * Format a Date to Codex rollout filename timestamp: YYYY-MM-DDTHH-mm-ss
 * @param {Date} d
 * @returns {string}
 */
function formatRolloutTimestamp(d) {
  return d.toISOString().slice(0, 19).replace(/:/g, '-');
}

/**
 * Emit a CanonicalSession as a Codex rollout JSONL file.
 * @param {Object} session - CanonicalSession
 * @param {Object} options
 * @param {string} [options.outputPath]
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.force]
 * @returns {{ outputPath: string, lines: number, warnings: string[] }}
 */
function emitCodexSession(session, options) {
  const warnings = [];
  options = options || {};

  // Determine output path
  let outputPath = options.outputPath;
  if (!outputPath) {
    const sessionDir = getCodexSessionDir();
    // Generate a Codex-compatible session ID
    const targetSessionId = session.source === 'claude'
      ? deterministicUuid(session.id + ':codex')
      : session.id;
    const ts = formatRolloutTimestamp(new Date());
    outputPath = path.join(sessionDir, 'rollout-' + ts + '-' + targetSessionId + '.jsonl');
  }

  if (!options.force && !options.dryRun && fs.existsSync(outputPath)) {
    const err = new Error('Output file already exists: ' + outputPath + ' (use --force to overwrite)');
    err.code = 'PATH_CONFLICT';
    throw err;
  }

  const now = new Date().toISOString();
  const targetSessionId = session.source === 'claude'
    ? deterministicUuid(session.id + ':codex')
    : session.id;

  const lines = [];

  function emit(type, payload) {
    lines.push(JSON.stringify({ timestamp: now, type, payload }));
  }

  // 1. session_meta
  emit('session_meta', {
    id: targetSessionId,
    timestamp: session.timestamp || now,
    cwd: session.cwd || '',
    originator: session.meta.originator || 'openant_bridge',
    cli_version: session.cliVersion || '0.0.0',
    source: 'cli',
    model_provider: session.modelProvider || (session.source === 'claude' ? 'anthropic' : 'openai'),
    base_instructions: {
      text: session.baseInstructions || '',
    },
  });

  // 2. Emit turns
  for (let i = 0; i < session.turns.length; i++) {
    const turn = session.turns[i];

    if (turn.role === 'assistant') {
      // Emit turn_context first
      const turnId = turn.id || randomUuid();
      const model = (turn.meta && turn.meta.model) || session.model || 'gpt-4o';
      emit('turn_context', {
        turn_id: turnId,
        cwd: session.cwd || '',
        approval_policy: (turn.meta && turn.meta.approval_policy) || 'on-request',
        sandbox_policy: (turn.meta && turn.meta.sandbox_policy) || {
          type: 'workspace-write',
          network_access: false,
        },
        model: model,
        collaboration_mode: (turn.meta && turn.meta.collaboration_mode) || {
          mode: 'default',
          settings: { model: model },
        },
      });

      // Emit blocks in order
      for (const block of turn.blocks) {
        if (block.type === 'thinking') {
          // Claude thinking → Codex reasoning with no encrypted_content
          emit('response_item', {
            type: 'reasoning',
            summary: [{ type: 'summary_text', text: block.text || '[thinking]' }],
            content: null,
            encrypted_content: null,
          });
        } else if (block.type === 'reasoning') {
          // Codex reasoning round-trip — re-emit verbatim with encrypted_content
          emit('response_item', {
            type: 'reasoning',
            summary: [{ type: 'summary_text', text: block.summaryText || '' }],
            content: null,
            encrypted_content: block.encryptedContent || null,
          });
        } else if (block.type === 'text') {
          emit('response_item', {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: block.text || '' }],
          });
        } else if (block.type === 'tool_call') {
          if (block.toolKind === 'custom') {
            emit('response_item', {
              type: 'custom_tool_call',
              status: 'completed',
              call_id: block.callId,
              name: block.toolName,
              input: typeof block.input === 'string' ? block.input : JSON.stringify(block.input),
            });
          } else {
            emit('response_item', {
              type: 'function_call',
              call_id: block.callId,
              name: block.toolName,
              arguments: typeof block.input === 'object' ? JSON.stringify(block.input) : block.input,
            });
          }
        } else if (block.type === 'tool_result') {
          // Determine if this was a custom tool by checking if call_id exists in pending tool calls
          // We use a heuristic: check if any preceding tool_call with same callId was custom
          const isCustom = _isCustomToolResult(turn.blocks, block.callId);
          if (isCustom) {
            emit('response_item', {
              type: 'custom_tool_call_output',
              call_id: block.callId,
              output: block.output || '',
            });
          } else {
            emit('response_item', {
              type: 'function_call_output',
              call_id: block.callId,
              output: block.output || '',
              ...(block.isError ? { error: block.output || '' } : {}),
            });
          }
        }
      }
    } else if (turn.role === 'user') {
      // Collect all text from user turn blocks
      const textParts = turn.blocks
        .filter(b => b.type === 'text')
        .map(b => b.text || '');

      if (textParts.length > 0) {
        emit('response_item', {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: textParts.join('\n') }],
        });
      }

      // Tool results on user turns — emit as function_call_output or custom_tool_call_output
      const toolResults = turn.blocks.filter(b => b.type === 'tool_result');
      for (const block of toolResults) {
        emit('response_item', {
          type: 'function_call_output',
          call_id: block.callId,
          output: block.output || '',
          ...(block.isError ? { error: block.output || '' } : {}),
        });
      }
    } else if (turn.role === 'system') {
      // Emit as developer message
      const textBlocks = turn.blocks.filter(b => b.type === 'text');
      if (textBlocks.length > 0) {
        emit('response_item', {
          type: 'message',
          role: 'developer',
          content: [{ type: 'input_text', text: textBlocks.map(b => b.text).join('\n') }],
        });
      }
    }
  }

  if (!options.dryRun) {
    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });

    const tmpPath = outputPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, lines.join('\n') + '\n', 'utf8');
    fs.renameSync(tmpPath, outputPath);
  }

  return { outputPath, lines: lines.length, warnings };
}

/**
 * Heuristic: check if a tool_result's callId corresponds to a custom_tool_call
 * by scanning all blocks in the turn for a matching tool_call with toolKind='custom'.
 * @param {Array} blocks
 * @param {string} callId
 * @returns {boolean}
 */
function _isCustomToolResult(blocks, callId) {
  for (const b of blocks) {
    if (b.type === 'tool_call' && b.callId === callId && b.toolKind === 'custom') {
      return true;
    }
  }
  return false;
}

module.exports = { emitCodexSession, getCodexSessionDir };

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { deterministicUuid, randomUuid } = require('../schema');

/**
 * Encode a cwd path to Claude's project dir name format.
 * e.g. C:\Users\omkar\OneDrive\Desktop\OpenAnt_Adapter → C--Users-omkar-OneDrive-Desktop-OpenAnt-Adapter
 * Rule: replace : \ / _ each with a single dash; don't collapse consecutive dashes.
 * Example: C:\Users\foo → C--Users-foo  (C + colon→dash + backslash→dash + Users...)
 * @param {string} cwd
 * @returns {string}
 */
function encodeCwdToProjectDir(cwd) {
  if (!cwd) return 'unknown';
  // Remove trailing slash/backslash
  let s = cwd.replace(/[\\/]$/, '');
  // Replace : \ / _ with dashes (do NOT collapse)
  s = s.replace(/[:\\/]/g, '-');
  // Replace underscores with dashes (confirmed from real fixture paths)
  s = s.replace(/_/g, '-');
  return s;
}

/**
 * Get the Claude projects directory for a given cwd.
 * @param {string} cwd
 * @returns {string}
 */
function getClaudeProjectDir(cwd) {
  const encoded = encodeCwdToProjectDir(cwd);
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}

/**
 * Build a single Claude JSONL record object.
 */
function makeClaudeRecord(type, uuid, parentUuid, sessionId, cwd, timestamp, message, extra) {
  return {
    parentUuid: parentUuid || null,
    isSidechain: false,
    userType: 'external',
    cwd: cwd || '',
    sessionId: sessionId,
    version: '2.1.63',
    type: type,
    message: message,
    uuid: uuid,
    timestamp: timestamp || new Date().toISOString(),
    ...extra,
  };
}

/**
 * Emit a CanonicalSession as a Claude Code JSONL file.
 * @param {Object} session - CanonicalSession
 * @param {Object} options
 * @param {string} [options.outputPath] - explicit output path
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.force]
 * @returns {{ outputPath: string, lines: number, warnings: string[] }}
 */
function emitClaudeSession(session, options) {
  const warnings = [];
  options = options || {};

  // Determine output path
  let outputPath = options.outputPath;
  if (!outputPath) {
    const projectDir = getClaudeProjectDir(session.cwd || '');
    // Generate a session UUID — for Codex-sourced sessions use deterministic UUID
    const sessionUuid = session.source === 'codex'
      ? deterministicUuid(session.id + ':claude')
      : session.id;
    outputPath = path.join(projectDir, sessionUuid + '.jsonl');
  }

  if (!options.force && !options.dryRun && fs.existsSync(outputPath)) {
    const err = new Error('Output file already exists: ' + outputPath + ' (use --force to overwrite)');
    err.code = 'PATH_CONFLICT';
    throw err;
  }

  const lines = [];

  // Session UUID for Claude records
  const sessionId = session.source === 'codex'
    ? deterministicUuid(session.id + ':claude')
    : session.id;

  // Emit turns as a linear chain: turn[i].parentUuid = turn[i-1].uuid
  let prevUuid = null;

  for (let i = 0; i < session.turns.length; i++) {
    const turn = session.turns[i];

    // Derive a stable UUID for this turn
    const turnUuid = session.source === 'codex'
      ? deterministicUuid(session.id + ':turn:' + i)
      : (turn.id || randomUuid());

    const parentUuid = prevUuid;
    const ts = turn.timestamp || new Date().toISOString();

    if (turn.role === 'user') {
      // Split: text blocks → user message, tool_result blocks → user message
      const textBlocks = turn.blocks.filter(b => b.type === 'text');
      const toolResultBlocks = turn.blocks.filter(b => b.type === 'tool_result');

      // Emit text blocks as user message (content = string if single, else array)
      if (textBlocks.length > 0) {
        const content = textBlocks.length === 1
          ? textBlocks[0].text
          : textBlocks.map(b => ({ type: 'text', text: b.text }));
        const record = makeClaudeRecord(
          'user', turnUuid, parentUuid, sessionId, session.cwd, ts,
          { role: 'user', content },
        );
        lines.push(JSON.stringify(record));
        prevUuid = turnUuid;
      }

      // Emit tool_result blocks as separate user message(s)
      if (toolResultBlocks.length > 0) {
        const resultUuid = session.source === 'codex'
          ? deterministicUuid(session.id + ':turn:' + i + ':results')
          : randomUuid();
        const resultContent = toolResultBlocks.map(b => ({
          type: 'tool_result',
          tool_use_id: b.callId,
          content: b.output || '',
          ...(b.isError ? { is_error: true } : {}),
        }));
        const record = makeClaudeRecord(
          'user', resultUuid, prevUuid, sessionId, session.cwd, ts,
          { role: 'user', content: resultContent },
        );
        lines.push(JSON.stringify(record));
        prevUuid = resultUuid;
      }

      // If turn had neither, skip
    } else if (turn.role === 'assistant') {
      // Split blocks: assistant content vs tool_results (which in Claude live in user turns)
      const assistantContent = [];
      const toolResultBlocks = [];

      for (const block of turn.blocks) {
        if (block.type === 'tool_result') {
          toolResultBlocks.push(block);
        } else if (block.type === 'thinking') {
          assistantContent.push({
            type: 'thinking',
            thinking: block.text || '',
            signature: block.signature || '',
          });
        } else if (block.type === 'text') {
          assistantContent.push({ type: 'text', text: block.text || '' });
        } else if (block.type === 'tool_call') {
          assistantContent.push({
            type: 'tool_use',
            id: block.callId,
            name: block.toolName,
            input: block.input || {},
          });
        } else if (block.type === 'reasoning') {
          // Codex reasoning → synthetic thinking block
          assistantContent.push({
            type: 'thinking',
            thinking: '[Codex reasoning: ' + (block.summaryText || '') + ']',
            signature: '',
          });
        }
      }

      if (assistantContent.length === 0 && toolResultBlocks.length === 0) {
        // Emit a minimal text block so the record isn't empty
        assistantContent.push({ type: 'text', text: '' });
      }

      if (assistantContent.length > 0) {
        const model = (turn.meta && turn.meta.model) || session.model || 'claude-sonnet-4-6';
        const record = makeClaudeRecord(
          'assistant', turnUuid, parentUuid, sessionId, session.cwd, ts,
          {
            model: model,
            id: (turn.meta && turn.meta.messageId) || ('msg_' + turnUuid.replace(/-/g, '').slice(0, 24)),
            type: 'message',
            role: 'assistant',
            content: assistantContent,
            stop_reason: (turn.meta && turn.meta.stop_reason) || 'end_turn',
            stop_sequence: null,
            usage: (turn.meta && turn.meta.usage) || null,
          },
        );
        lines.push(JSON.stringify(record));
        prevUuid = turnUuid;
      }

      // Emit tool_result blocks from Codex assistant turns as a Claude user message
      if (toolResultBlocks.length > 0) {
        const resultUuid = session.source === 'codex'
          ? deterministicUuid(session.id + ':turn:' + i + ':toolresults')
          : randomUuid();
        const resultContent = toolResultBlocks.map(b => ({
          type: 'tool_result',
          tool_use_id: b.callId,
          content: b.output || '',
          ...(b.isError ? { is_error: true } : {}),
        }));
        const record = makeClaudeRecord(
          'user', resultUuid, prevUuid, sessionId, session.cwd, ts,
          { role: 'user', content: resultContent },
        );
        lines.push(JSON.stringify(record));
        prevUuid = resultUuid;
      }
    } else if (turn.role === 'system') {
      // Skip system turns — they don't map cleanly to Claude JSONL
      warnings.push('Skipping system turn at index ' + i);
    }
  }

  if (!options.dryRun) {
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });

    // Write atomically via temp file
    const tmpPath = outputPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, lines.join('\n') + '\n', 'utf8');
    fs.renameSync(tmpPath, outputPath);
  }

  return { outputPath, lines: lines.length, warnings };
}

module.exports = { emitClaudeSession, encodeCwdToProjectDir, getClaudeProjectDir };

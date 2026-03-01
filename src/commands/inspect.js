'use strict';

const { findSessionById } = require('../discovery');
const { parseCodexSession } = require('../parsers/codex');
const { parseClaudeSession } = require('../parsers/claude');

/**
 * Truncate a string to maxLen characters.
 */
function trunc(s, maxLen) {
  s = String(s || '');
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

/**
 * Display a CanonicalBlock in human-readable form.
 */
function displayBlock(block, indent) {
  const pfx = ' '.repeat(indent);
  switch (block.type) {
    case 'text':
      console.log(pfx + '[text] ' + trunc(block.text, 120));
      break;
    case 'thinking':
      console.log(pfx + '[thinking] ' + trunc(block.text, 80) + ' (sig=' + (block.signature ? block.signature.slice(0, 8) + '...' : 'none') + ')');
      break;
    case 'reasoning':
      console.log(pfx + '[reasoning] ' + trunc(block.summaryText, 80) + (block.encryptedContent ? ' [encrypted]' : ''));
      break;
    case 'tool_call':
      console.log(pfx + '[tool_call:' + block.toolKind + '] ' + block.toolName + ' callId=' + block.callId);
      console.log(pfx + '  input: ' + trunc(JSON.stringify(block.input), 100));
      break;
    case 'tool_result':
      console.log(pfx + '[tool_result] callId=' + block.callId + (block.isError ? ' [ERROR]' : ''));
      console.log(pfx + '  output: ' + trunc(String(block.output), 100));
      break;
    default:
      console.log(pfx + '[' + block.type + '] ' + trunc(JSON.stringify(block), 100));
  }
}

/**
 * Execute the `inspect` command.
 * @param {string} sessionId
 * @param {Object} opts
 * @param {boolean} [opts.json]
 */
function runInspect(sessionId, opts) {
  const meta = findSessionById(sessionId);
  if (!meta) {
    console.error('Session not found: ' + sessionId);
    process.exit(2);
  }

  let parseResult;
  try {
    if (meta.source === 'codex') {
      parseResult = parseCodexSession(meta.file_path);
    } else {
      parseResult = parseClaudeSession(meta.file_path);
    }
  } catch (e) {
    console.error('Parse error: ' + e.message);
    process.exit(1);
  }

  const { session, warnings } = parseResult;

  if (opts.json) {
    console.log(JSON.stringify(session, null, 2));
    return;
  }

  // Human-readable output
  console.log('=== Session: ' + session.id + ' ===');
  console.log('Source:    ' + session.source);
  console.log('CWD:       ' + session.cwd);
  console.log('Timestamp: ' + session.timestamp);
  console.log('Model:     ' + (session.model || 'unknown'));
  console.log('Provider:  ' + (session.modelProvider || 'unknown'));
  console.log('CLI ver:   ' + (session.cliVersion || 'unknown'));
  console.log('Turns:     ' + session.turns.length);
  if (session.baseInstructions) {
    console.log('Base instructions: ' + trunc(session.baseInstructions, 120));
  }
  console.log('');

  for (let i = 0; i < session.turns.length; i++) {
    const turn = session.turns[i];
    const roleTag = turn.role.toUpperCase().padEnd(9);
    console.log('Turn ' + (i + 1) + ' [' + roleTag + '] id=' + turn.id + ' ts=' + turn.timestamp);
    for (const block of turn.blocks) {
      displayBlock(block, 2);
    }
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('--- Warnings ---');
    for (const w of warnings) {
      console.log('  ' + w);
    }
  }
}

module.exports = { runInspect };

'use strict';

const fs = require('fs');
const {
  makeSession, makeTurn,
  makeTextBlock, makeThinkingBlock,
  makeToolCallBlock, makeToolResultBlock,
  randomUuid,
} = require('../schema');

/**
 * Parse a Claude Code JSONL session file into a CanonicalSession.
 * Performs DFS tree flattening (parentUuid chain), skips sidechains.
 * @param {string} filePath
 * @returns {{ session: Object, warnings: string[] }}
 */
function parseClaudeSession(filePath) {
  const warnings = [];
  let rawContent;
  try {
    rawContent = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new Error('Cannot read file: ' + filePath + ' (' + e.message + ')');
  }

  const rawLines = rawContent.split('\n').filter(l => l.trim());
  let failedLines = 0;
  const allRecords = [];

  for (let i = 0; i < rawLines.length; i++) {
    try {
      allRecords.push(JSON.parse(rawLines[i]));
    } catch (e) {
      failedLines++;
      warnings.push('Line ' + (i + 1) + ': JSON parse error — ' + e.message);
    }
  }

  if (failedLines > 0 && failedLines / rawLines.length > 0.2) {
    warnings.push('WARNING: more than 20% of lines failed to parse (' + failedLines + '/' + rawLines.length + ')');
  }

  // Filter to only user/assistant records that aren't sidechains
  const turnRecords = allRecords.filter(r =>
    (r.type === 'user' || r.type === 'assistant') &&
    !r.isSidechain
  );

  // Extract session metadata from first qualifying record
  let sessionId = null;
  let cwd = null;
  let timestamp = null;
  let model = null;

  for (const r of turnRecords) {
    if (!sessionId && r.sessionId) sessionId = r.sessionId;
    if (!cwd && r.cwd) cwd = r.cwd;
    if (!timestamp && r.timestamp) timestamp = r.timestamp;
    if (!model && r.message && r.message.model) model = r.message.model;
  }

  const session = makeSession({
    id: sessionId || randomUuid(),
    source: 'claude',
    cwd: cwd || '',
    timestamp: timestamp || new Date().toISOString(),
    model: model || null,
    modelProvider: 'anthropic',
    meta: { filePath },
  });

  // Build UUID → record map and parentUuid → children map
  const recordMap = new Map();
  const childrenMap = new Map(); // parentUuid → [child uuids in insertion order]

  for (const r of turnRecords) {
    if (!r.uuid) continue;
    recordMap.set(r.uuid, r);
    const parentKey = r.parentUuid || '__root__';
    if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
    childrenMap.get(parentKey).push(r.uuid);
  }

  // DFS from roots, sort children by timestamp ASC
  const roots = childrenMap.get('__root__') || [];

  function dfs(uuid) {
    const record = recordMap.get(uuid);
    if (!record) return;

    const turn = recordToCanonicalTurn(record, warnings);
    if (turn) session.turns.push(turn);

    // Process children sorted by timestamp
    const children = (childrenMap.get(uuid) || []).slice().sort((a, b) => {
      const ra = recordMap.get(a);
      const rb = recordMap.get(b);
      const ta = ra ? (ra.timestamp || '') : '';
      const tb = rb ? (rb.timestamp || '') : '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    for (const childUuid of children) {
      dfs(childUuid);
    }
  }

  for (const rootUuid of roots) {
    dfs(rootUuid);
  }

  return { session, warnings };
}

/**
 * Convert a single Claude record to a CanonicalTurn.
 * @param {Object} record
 * @param {string[]} warnings
 * @returns {Object|null}
 */
function recordToCanonicalTurn(record, warnings) {
  const msg = record.message || {};
  const content = msg.content;
  const role = msg.role;

  if (!role) return null;

  const turn = makeTurn({
    id: record.uuid,
    parentId: record.parentUuid || null,
    role: role,
    timestamp: record.timestamp || new Date().toISOString(),
    meta: {
      isSidechain: record.isSidechain || false,
      permissionMode: record.permissionMode || null,
      sessionId: record.sessionId || null,
      messageId: msg.id || null,       // Anthropic API message ID
      model: msg.model || null,
      stop_reason: msg.stop_reason || null,
      usage: msg.usage || null,
    },
  });

  // Handle string content (simple user text message)
  if (typeof content === 'string') {
    if (content.trim()) turn.blocks.push(makeTextBlock(content));
    return turn;
  }

  // Handle array content
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || !block.type) continue;

      if (block.type === 'text') {
        if (block.text) turn.blocks.push(makeTextBlock(block.text));
        continue;
      }

      if (block.type === 'thinking') {
        turn.blocks.push(makeThinkingBlock(block.thinking || '', block.signature || ''));
        continue;
      }

      if (block.type === 'tool_use') {
        turn.blocks.push(makeToolCallBlock(
          block.id,
          block.name,
          'standard',
          block.input || {},
        ));
        continue;
      }

      if (block.type === 'tool_result') {
        // tool_result content may be string or array of text blocks
        let output = '';
        if (typeof block.content === 'string') {
          output = block.content;
        } else if (Array.isArray(block.content)) {
          output = block.content
            .filter(c => c && c.type === 'text')
            .map(c => c.text || '')
            .join('\n');
        }
        turn.blocks.push(makeToolResultBlock(
          block.tool_use_id,
          output,
          block.is_error || false,
        ));
        continue;
      }

      warnings.push('Unknown block type in ' + record.uuid + ': ' + block.type);
    }
    return turn;
  }

  return turn;
}

module.exports = { parseClaudeSession };

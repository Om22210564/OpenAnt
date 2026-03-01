'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { parseClaudeSession } = require('../src/parsers/claude');

const FIXTURE = path.join(__dirname, 'fixtures', 'claude_sample.jsonl');

// ─── Session metadata ─────────────────────────────────────────────────────────

test('claude parser: extracts sessionId', () => {
  const { session } = parseClaudeSession(FIXTURE);
  assert.equal(session.id, 'ccdd0000-1111-2222-3333-000000000001');
});

test('claude parser: extracts cwd', () => {
  const { session } = parseClaudeSession(FIXTURE);
  assert.equal(session.cwd, 'C:\\Users\\test\\project');
});

test('claude parser: extracts model from assistant record', () => {
  const { session } = parseClaudeSession(FIXTURE);
  assert.equal(session.model, 'claude-sonnet-4-6');
});

test('claude parser: modelProvider is anthropic', () => {
  const { session } = parseClaudeSession(FIXTURE);
  assert.equal(session.modelProvider, 'anthropic');
});

test('claude parser: source is always claude', () => {
  const { session } = parseClaudeSession(FIXTURE);
  assert.equal(session.source, 'claude');
});

// ─── String content ───────────────────────────────────────────────────────────

test('claude parser: string content becomes text block', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const userTurn = session.turns.find(t => t.role === 'user' && t.blocks.some(b => b.type === 'text'));
  assert.ok(userTurn, 'user turn with text block not found');
  const textBlock = userTurn.blocks.find(b => b.type === 'text');
  assert.equal(textBlock.text, 'Fix the bug in app.py');
});

// ─── Array content blocks ─────────────────────────────────────────────────────

test('claude parser: thinking block preserved', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const thinkBlock = allBlocks.find(b => b.type === 'thinking');
  assert.ok(thinkBlock, 'thinking block not found');
  assert.equal(thinkBlock.text, 'Let me look at the file');
  assert.equal(thinkBlock.signature, 'SIG001');
});

test('claude parser: tool_use becomes tool_call block with kind=standard', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const tcBlock = allBlocks.find(b => b.type === 'tool_call' && b.callId === 'toolu_001');
  assert.ok(tcBlock, 'tool_call block for toolu_001 not found');
  assert.equal(tcBlock.toolName, 'Read');
  assert.equal(tcBlock.toolKind, 'standard');
  assert.deepEqual(tcBlock.input, { file_path: 'app.py' });
});

test('claude parser: tool_result with array content is concatenated', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const trBlock = allBlocks.find(b => b.type === 'tool_result' && b.callId === 'toolu_001');
  assert.ok(trBlock, 'tool_result block for toolu_001 not found');
  assert.ok(trBlock.output.includes('def add'));
});

test('claude parser: tool_result with string content is stored as-is', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const trBlock = allBlocks.find(b => b.type === 'tool_result' && b.callId === 'toolu_002');
  assert.ok(trBlock, 'tool_result block for toolu_002 not found');
  assert.equal(trBlock.output, 'File updated successfully');
});

test('claude parser: text block in array content preserved', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const textBlock = allBlocks.find(b => b.type === 'text' && b.text.includes('Found the bug'));
  assert.ok(textBlock, 'assistant text block not found');
});

// ─── Filtering ────────────────────────────────────────────────────────────────

test('claude parser: isSidechain:true records are excluded', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const sideBlock = allBlocks.find(b => b.type === 'text' && b.text.includes('SIDECHAIN'));
  assert.equal(sideBlock, undefined, 'sidechain content leaked into canonical session');
});

test('claude parser: progress records are excluded', () => {
  const { session } = parseClaudeSession(FIXTURE);
  // All turns should have a role
  for (const t of session.turns) {
    assert.ok(t.role, 'turn missing role: ' + JSON.stringify(t));
  }
});

test('claude parser: file-history-snapshot records are excluded', () => {
  const { session } = parseClaudeSession(FIXTURE);
  // Should have only user/assistant turns from real records
  for (const t of session.turns) {
    assert.ok(['user', 'assistant'].includes(t.role));
  }
});

test('claude parser: system records are excluded', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const systemTurns = session.turns.filter(t => t.role === 'system');
  assert.equal(systemTurns.length, 0);
});

// ─── DFS tree flattening ──────────────────────────────────────────────────────

test('claude parser: turns are in DFS order (root first)', () => {
  const { session } = parseClaudeSession(FIXTURE);
  assert.ok(session.turns.length > 0);
  const firstTurn = session.turns[0];
  assert.equal(firstTurn.id, 'uuid-user-0001');
});

test('claude parser: parentId stored in turn meta', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const t = session.turns.find(t => t.id === 'uuid-asst-0001');
  assert.ok(t, 'uuid-asst-0001 not found');
  assert.equal(t.parentId, 'uuid-user-0001');
});

test('claude parser: DFS order follows linear chain correctly', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const ids = session.turns.map(t => t.id);
  // uuid-user-0001 → uuid-asst-0001 → uuid-user-0002 → uuid-asst-0002 → uuid-user-0003 → uuid-asst-0003
  const expectedOrder = ['uuid-user-0001', 'uuid-asst-0001', 'uuid-user-0002', 'uuid-asst-0002', 'uuid-user-0003', 'uuid-asst-0003'];
  for (let i = 0; i < expectedOrder.length - 1; i++) {
    const aIdx = ids.indexOf(expectedOrder[i]);
    const bIdx = ids.indexOf(expectedOrder[i + 1]);
    assert.ok(aIdx < bIdx, `Expected ${expectedOrder[i]} before ${expectedOrder[i + 1]}`);
  }
});

test('claude parser: children sorted by timestamp ASC', () => {
  // Create a fixture with two children of the same parent with reversed timestamps
  const tmpFile = path.join(os.tmpdir(), 'claude_sort_' + Date.now() + '.jsonl');
  const lines = [
    { parentUuid: null, isSidechain: false, cwd: '/tmp', sessionId: 'sort-session', type: 'user', message: { role: 'user', content: 'root' }, uuid: 'root-001', timestamp: '2026-01-01T10:00:00.000Z' },
    { parentUuid: 'root-001', isSidechain: false, cwd: '/tmp', sessionId: 'sort-session', type: 'user', message: { role: 'user', content: 'child B' }, uuid: 'child-B', timestamp: '2026-01-01T10:00:02.000Z' },
    { parentUuid: 'root-001', isSidechain: false, cwd: '/tmp', sessionId: 'sort-session', type: 'user', message: { role: 'user', content: 'child A' }, uuid: 'child-A', timestamp: '2026-01-01T10:00:01.000Z' },
  ];
  fs.writeFileSync(tmpFile, lines.map(l => JSON.stringify(l)).join('\n'));
  const { session } = parseClaudeSession(tmpFile);
  fs.unlinkSync(tmpFile);

  const ids = session.turns.map(t => t.id);
  const aIdx = ids.indexOf('child-A');
  const bIdx = ids.indexOf('child-B');
  assert.ok(aIdx < bIdx, 'child-A should appear before child-B (earlier timestamp)');
});

// ─── Error handling ───────────────────────────────────────────────────────────

test('claude parser: bad JSON lines generate warnings', () => {
  const tmpFile = path.join(os.tmpdir(), 'claude_bad_' + Date.now() + '.jsonl');
  fs.writeFileSync(tmpFile, [
    JSON.stringify({ parentUuid: null, isSidechain: false, sessionId: 's1', type: 'user', message: { role: 'user', content: 'hello' }, uuid: 'u1', timestamp: '2026-01-01T00:00:00.000Z' }),
    'NOT VALID JSON {{{{',
  ].join('\n'));
  const { warnings } = parseClaudeSession(tmpFile);
  fs.unlinkSync(tmpFile);
  assert.ok(warnings.some(w => w.includes('JSON parse error')));
});

test('claude parser: throws on non-existent file', () => {
  assert.throws(
    () => parseClaudeSession('/nonexistent/file.jsonl'),
    (err) => err.message.includes('Cannot read file'),
  );
});

// ─── Turn metadata ────────────────────────────────────────────────────────────

test('claude parser: assistant turn meta contains messageId', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const asstTurn = session.turns.find(t => t.id === 'uuid-asst-0001');
  assert.ok(asstTurn);
  assert.equal(asstTurn.meta.messageId, 'msg_001');
});

test('claude parser: assistant turn meta contains stop_reason', () => {
  const { session } = parseClaudeSession(FIXTURE);
  const lastAsst = session.turns.filter(t => t.role === 'assistant').pop();
  assert.equal(lastAsst.meta.stop_reason, 'end_turn');
});

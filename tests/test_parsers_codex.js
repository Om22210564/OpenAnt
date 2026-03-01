'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { parseCodexSession } = require('../src/parsers/codex');

const FIXTURE = path.join(__dirname, 'fixtures', 'codex_sample.jsonl');

// ─── Session metadata ─────────────────────────────────────────────────────────

test('codex parser: extracts session id from session_meta', () => {
  const { session } = parseCodexSession(FIXTURE);
  assert.equal(session.id, 'aabbccdd-0000-0000-0000-000000000001');
});

test('codex parser: extracts cwd from session_meta', () => {
  const { session } = parseCodexSession(FIXTURE);
  assert.equal(session.cwd, 'C:\\Users\\test\\project');
});

test('codex parser: extracts timestamp from session_meta', () => {
  const { session } = parseCodexSession(FIXTURE);
  assert.equal(session.timestamp, '2026-01-01T09:00:00.000Z');
});

test('codex parser: extracts cliVersion from session_meta', () => {
  const { session } = parseCodexSession(FIXTURE);
  assert.equal(session.cliVersion, '0.106.0');
});

test('codex parser: extracts modelProvider from session_meta', () => {
  const { session } = parseCodexSession(FIXTURE);
  assert.equal(session.modelProvider, 'openai');
});

test('codex parser: extracts baseInstructions from session_meta', () => {
  const { session } = parseCodexSession(FIXTURE);
  assert.equal(session.baseInstructions, '<permissions>sandbox</permissions>');
  // developer message overrides base_instructions
});

test('codex parser: source is always codex', () => {
  const { session } = parseCodexSession(FIXTURE);
  assert.equal(session.source, 'codex');
});

// ─── Model extraction ─────────────────────────────────────────────────────────

test('codex parser: extracts model from first turn_context', () => {
  const { session } = parseCodexSession(FIXTURE);
  assert.equal(session.model, 'gpt-5.1-codex-mini');
});

// ─── Turn structure ───────────────────────────────────────────────────────────

test('codex parser: produces at least one user turn', () => {
  const { session } = parseCodexSession(FIXTURE);
  const userTurns = session.turns.filter(t => t.role === 'user');
  assert.ok(userTurns.length >= 1);
});

test('codex parser: produces at least one assistant turn', () => {
  const { session } = parseCodexSession(FIXTURE);
  const asstTurns = session.turns.filter(t => t.role === 'assistant');
  assert.ok(asstTurns.length >= 1);
});

test('codex parser: user turn from response_item/message/user has text block', () => {
  const { session } = parseCodexSession(FIXTURE);
  const userTurn = session.turns.find(t => t.role === 'user' && t.blocks.length > 0);
  assert.ok(userTurn, 'no user turn with blocks found');
  const textBlock = userTurn.blocks.find(b => b.type === 'text');
  assert.ok(textBlock, 'no text block in user turn');
  assert.equal(textBlock.text, 'Fix the bug in app.py');
});

// ─── Reasoning ────────────────────────────────────────────────────────────────

test('codex parser: reasoning block has summaryText', () => {
  const { session } = parseCodexSession(FIXTURE);
  const asstTurn = session.turns.find(t => t.role === 'assistant');
  const reasoningBlock = asstTurn.blocks.find(b => b.type === 'reasoning');
  assert.ok(reasoningBlock, 'no reasoning block found');
  assert.equal(reasoningBlock.summaryText, 'Analyzing the bug');
});

test('codex parser: reasoning block preserves encryptedContent', () => {
  const { session } = parseCodexSession(FIXTURE);
  const asstTurn = session.turns.find(t => t.role === 'assistant');
  const reasoningBlock = asstTurn.blocks.find(b => b.type === 'reasoning');
  assert.equal(reasoningBlock.encryptedContent, 'ENCRYPTEDDATA123');
});

// ─── Tool calls ───────────────────────────────────────────────────────────────

test('codex parser: function_call produces tool_call block with kind=standard', () => {
  const { session } = parseCodexSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const tcBlock = allBlocks.find(b => b.type === 'tool_call' && b.callId === 'call_abc001');
  assert.ok(tcBlock, 'standard tool_call block not found');
  assert.equal(tcBlock.toolName, 'shell_command');
  assert.equal(tcBlock.toolKind, 'standard');
});

test('codex parser: function_call_output produces tool_result block', () => {
  const { session } = parseCodexSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const trBlock = allBlocks.find(b => b.type === 'tool_result' && b.callId === 'call_abc001');
  assert.ok(trBlock, 'tool_result block for call_abc001 not found');
  assert.ok(trBlock.output.includes('a - b'));
});

test('codex parser: custom_tool_call produces tool_call block with kind=custom', () => {
  const { session } = parseCodexSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const ctcBlock = allBlocks.find(b => b.type === 'tool_call' && b.callId === 'call_custom001');
  assert.ok(ctcBlock, 'custom tool_call block not found');
  assert.equal(ctcBlock.toolKind, 'custom');
  assert.equal(ctcBlock.toolName, 'apply_patch');
});

test('codex parser: custom_tool_call_output produces tool_result block', () => {
  const { session } = parseCodexSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const ctrBlock = allBlocks.find(b => b.type === 'tool_result' && b.callId === 'call_custom001');
  assert.ok(ctrBlock, 'custom tool_result block not found');
  assert.ok(ctrBlock.output.includes('Success'));
});

// ─── Assistant text ───────────────────────────────────────────────────────────

test('codex parser: assistant message/role=assistant produces text block', () => {
  const { session } = parseCodexSession(FIXTURE);
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const textBlock = allBlocks.find(b => b.type === 'text' && b.text.includes('Fixed the bug'));
  assert.ok(textBlock, 'assistant text block not found');
});

// ─── Skipped record types ─────────────────────────────────────────────────────

test('codex parser: event_msg records are skipped (no extra turns from them)', () => {
  const { session } = parseCodexSession(FIXTURE);
  // event_msg records should not generate any turns or blocks
  // The turn count should be consistent with only real user/assistant records
  assert.ok(session.turns.length > 0);
  // All turns must be user or assistant
  for (const t of session.turns) {
    assert.ok(['user', 'assistant'].includes(t.role), `Unexpected role: ${t.role}`);
  }
});

test('codex parser: web_search_call records are skipped', () => {
  const { session, warnings } = parseCodexSession(FIXTURE);
  // web_search_call is on the last data line; should not create any blocks
  const allBlocks = session.turns.flatMap(t => t.blocks);
  const webBlocks = allBlocks.filter(b => b.type === 'web_search');
  assert.equal(webBlocks.length, 0);
});

// ─── Error handling ───────────────────────────────────────────────────────────

test('codex parser: bad JSON lines generate warnings', () => {
  const tmpFile = path.join(os.tmpdir(), 'codex_bad_' + Date.now() + '.jsonl');
  fs.writeFileSync(tmpFile, [
    JSON.stringify({ timestamp: '2026-01-01T00:00:00.000Z', type: 'session_meta', payload: { id: 'test-id', timestamp: '2026-01-01T00:00:00.000Z', cwd: '/tmp' } }),
    'THIS IS NOT JSON',
    JSON.stringify({ timestamp: '2026-01-01T00:00:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] } }),
  ].join('\n'));

  const { warnings } = parseCodexSession(tmpFile);
  fs.unlinkSync(tmpFile);
  assert.ok(warnings.some(w => w.includes('JSON parse error')));
});

test('codex parser: >20% bad lines generate a high-failure warning', () => {
  const tmpFile = path.join(os.tmpdir(), 'codex_manybad_' + Date.now() + '.jsonl');
  const lines = [
    JSON.stringify({ type: 'session_meta', payload: { id: 'tid', timestamp: '2026-01-01T00:00:00.000Z', cwd: '/tmp' } }),
    'BAD LINE 1', 'BAD LINE 2', 'BAD LINE 3',
  ];
  fs.writeFileSync(tmpFile, lines.join('\n'));
  const { warnings } = parseCodexSession(tmpFile);
  fs.unlinkSync(tmpFile);
  assert.ok(warnings.some(w => w.includes('20%')));
});

test('codex parser: throws on non-existent file', () => {
  assert.throws(
    () => parseCodexSession('/nonexistent/path/to/file.jsonl'),
    (err) => err.message.includes('Cannot read file'),
  );
});

// ─── turn_context ─────────────────────────────────────────────────────────────

test('codex parser: turn_context turn_id becomes assistant turn id', () => {
  const { session } = parseCodexSession(FIXTURE);
  const asstTurns = session.turns.filter(t => t.role === 'assistant');
  assert.ok(asstTurns.some(t => t.id === 'aabbccdd-1111-0000-0000-000000000001'));
});

test('codex parser: approval_policy stored in turn meta', () => {
  const { session } = parseCodexSession(FIXTURE);
  const asstTurn = session.turns.find(t => t.role === 'assistant' && t.id === 'aabbccdd-1111-0000-0000-000000000001');
  assert.ok(asstTurn, 'assistant turn with expected id not found');
  assert.equal(asstTurn.meta.approval_policy, 'on-request');
});

test('codex parser: multiple turn_contexts create multiple assistant turns', () => {
  const { session } = parseCodexSession(FIXTURE);
  const asstTurns = session.turns.filter(t => t.role === 'assistant');
  assert.ok(asstTurns.length >= 2, 'expected at least 2 assistant turns');
});

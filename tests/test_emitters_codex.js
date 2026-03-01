'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { emitCodexSession } = require('../src/emitters/codex');
const {
  makeSession, makeTurn,
  makeTextBlock, makeThinkingBlock, makeReasoningBlock,
  makeToolCallBlock, makeToolResultBlock,
} = require('../src/schema');

function tmpPath() {
  return path.join(os.tmpdir(), 'openant_codex_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jsonl');
}

function parseLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function buildSession(turns, overrides) {
  return makeSession({
    id: 'emit-codex-test',
    source: 'claude',
    cwd: 'C:\\Users\\test\\project',
    model: 'gpt-4o',
    modelProvider: 'openai',
    cliVersion: '0.100.0',
    baseInstructions: 'You are a test assistant.',
    turns,
    ...overrides,
  });
}

// ─── session_meta ─────────────────────────────────────────────────────────────

test('codex emitter: first line is session_meta', () => {
  const session = buildSession([]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  assert.equal(records[0].type, 'session_meta');
});

test('codex emitter: session_meta has correct id (deterministic for claude source)', () => {
  const session = buildSession([]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const meta = records[0].payload;
  assert.ok(meta.id, 'session_meta missing id');
  assert.match(meta.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('codex emitter: session_meta has correct cwd', () => {
  const session = buildSession([]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  assert.equal(records[0].payload.cwd, 'C:\\Users\\test\\project');
});

test('codex emitter: session_meta has base_instructions', () => {
  const session = buildSession([]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  assert.equal(records[0].payload.base_instructions.text, 'You are a test assistant.');
});

test('codex emitter: session_meta has cli_version', () => {
  const session = buildSession([]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  assert.equal(records[0].payload.cli_version, '0.100.0');
});

// ─── turn_context ─────────────────────────────────────────────────────────────

test('codex emitter: assistant turn emits turn_context before blocks', () => {
  const session = buildSession([
    makeTurn({ role: 'assistant', blocks: [makeTextBlock('hi')] }),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const tcIdx = records.findIndex(r => r.type === 'turn_context');
  const msgIdx = records.findIndex(r => r.type === 'response_item' && r.payload.role === 'assistant');
  assert.ok(tcIdx >= 0, 'no turn_context emitted');
  assert.ok(msgIdx >= 0, 'no assistant message emitted');
  assert.ok(tcIdx < msgIdx, 'turn_context must precede assistant message');
});

test('codex emitter: turn_context has model field', () => {
  const session = buildSession([
    makeTurn({ role: 'assistant', blocks: [makeTextBlock('hi')], meta: { model: 'gpt-5-turbo' } }),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const tc = records.find(r => r.type === 'turn_context');
  assert.equal(tc.payload.model, 'gpt-5-turbo');
});

// ─── Thinking → Reasoning ─────────────────────────────────────────────────────

test('codex emitter: thinking block → response_item/reasoning with summary', () => {
  const session = buildSession([
    makeTurn({ role: 'assistant', blocks: [makeThinkingBlock('deep thought', 'SIG')] }),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const reasoning = records.find(r => r.type === 'response_item' && r.payload.type === 'reasoning');
  assert.ok(reasoning, 'no reasoning record emitted');
  assert.ok(reasoning.payload.summary.some(s => s.text === 'deep thought'));
});

test('codex emitter: reasoning block (Codex round-trip) preserves encrypted_content', () => {
  const session = buildSession([
    makeTurn({ role: 'assistant', blocks: [makeReasoningBlock('plan', 'ENC_PRESERVED')] }),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const reasoning = records.find(r => r.type === 'response_item' && r.payload.type === 'reasoning');
  assert.ok(reasoning);
  assert.equal(reasoning.payload.encrypted_content, 'ENC_PRESERVED');
});

// ─── Text → Message ───────────────────────────────────────────────────────────

test('codex emitter: text block → response_item/message/assistant', () => {
  const session = buildSession([
    makeTurn({ role: 'assistant', blocks: [makeTextBlock('response text')] }),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const msgRecord = records.find(r => r.type === 'response_item' && r.payload.type === 'message' && r.payload.role === 'assistant');
  assert.ok(msgRecord, 'no assistant message record');
  const textContent = msgRecord.payload.content.find(c => c.type === 'output_text');
  assert.ok(textContent);
  assert.equal(textContent.text, 'response text');
});

// ─── Tool calls ───────────────────────────────────────────────────────────────

test('codex emitter: tool_call standard → function_call', () => {
  const session = buildSession([
    makeTurn({ role: 'assistant', blocks: [makeToolCallBlock('call_001', 'shell_command', 'standard', { command: 'ls' })] }),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const fc = records.find(r => r.type === 'response_item' && r.payload.type === 'function_call');
  assert.ok(fc, 'no function_call record');
  assert.equal(fc.payload.call_id, 'call_001');
  assert.equal(fc.payload.name, 'shell_command');
});

test('codex emitter: tool_call custom → custom_tool_call', () => {
  const session = buildSession([
    makeTurn({ role: 'assistant', blocks: [makeToolCallBlock('call_002', 'apply_patch', 'custom', '*** patch')] }),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const ctc = records.find(r => r.type === 'response_item' && r.payload.type === 'custom_tool_call');
  assert.ok(ctc, 'no custom_tool_call record');
  assert.equal(ctc.payload.call_id, 'call_002');
  assert.equal(ctc.payload.name, 'apply_patch');
});

test('codex emitter: tool_result standard → function_call_output', () => {
  const session = buildSession([
    makeTurn({ role: 'assistant', blocks: [
      makeToolCallBlock('call_003', 'shell_command', 'standard', {}),
      makeToolResultBlock('call_003', 'output here', false),
    ]}),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const fco = records.find(r => r.type === 'response_item' && r.payload.type === 'function_call_output');
  assert.ok(fco, 'no function_call_output record');
  assert.equal(fco.payload.call_id, 'call_003');
  assert.equal(fco.payload.output, 'output here');
});

test('codex emitter: tool_result custom → custom_tool_call_output', () => {
  const session = buildSession([
    makeTurn({ role: 'assistant', blocks: [
      makeToolCallBlock('call_004', 'apply_patch', 'custom', '*** patch'),
      makeToolResultBlock('call_004', 'Success', false),
    ]}),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const ctco = records.find(r => r.type === 'response_item' && r.payload.type === 'custom_tool_call_output');
  assert.ok(ctco, 'no custom_tool_call_output record');
  assert.equal(ctco.payload.call_id, 'call_004');
});

// ─── User turns ───────────────────────────────────────────────────────────────

test('codex emitter: user turn → response_item/message/user', () => {
  const session = buildSession([
    makeTurn({ role: 'user', blocks: [makeTextBlock('user input')] }),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const userMsg = records.find(r => r.type === 'response_item' && r.payload.type === 'message' && r.payload.role === 'user');
  assert.ok(userMsg, 'no user message record');
  const textContent = userMsg.payload.content.find(c => c.type === 'input_text');
  assert.ok(textContent);
  assert.equal(textContent.text, 'user input');
});

// ─── Dry-run / file conflict ──────────────────────────────────────────────────

test('codex emitter: dry-run does not write file', () => {
  const session = buildSession([]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out, dryRun: true });
  assert.equal(fs.existsSync(out), false, 'dry-run should not write file');
});

test('codex emitter: throws PATH_CONFLICT if file exists without --force', () => {
  const session = buildSession([]);
  const out = tmpPath();
  fs.writeFileSync(out, 'existing');
  try {
    assert.throws(
      () => emitCodexSession(session, { outputPath: out }),
      (err) => err.code === 'PATH_CONFLICT',
    );
  } finally {
    fs.unlinkSync(out);
  }
});

test('codex emitter: --force overwrites existing file', () => {
  const session = buildSession([
    makeTurn({ role: 'user', blocks: [makeTextBlock('new')] }),
  ]);
  const out = tmpPath();
  fs.writeFileSync(out, 'old content');
  emitCodexSession(session, { outputPath: out, force: true });
  const records = parseLines(out);
  fs.unlinkSync(out);
  assert.ok(records.length > 0);
});

// ─── Valid JSONL ──────────────────────────────────────────────────────────────

test('codex emitter: every emitted line is valid JSON', () => {
  const session = buildSession([
    makeTurn({ role: 'user', blocks: [makeTextBlock('question')] }),
    makeTurn({ role: 'assistant', blocks: [makeThinkingBlock('thinking'), makeTextBlock('answer'), makeToolCallBlock('c1', 'run', 'standard', {})] }),
    makeTurn({ role: 'user', blocks: [makeToolResultBlock('c1', 'done', false)] }),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const rawLines = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean);
  fs.unlinkSync(out);
  for (const line of rawLines) {
    assert.doesNotThrow(() => JSON.parse(line), `Invalid JSON: ${line.slice(0, 80)}`);
  }
});

test('codex emitter: all records have timestamp field', () => {
  const session = buildSession([
    makeTurn({ role: 'user', blocks: [makeTextBlock('hi')] }),
  ]);
  const out = tmpPath();
  emitCodexSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  for (const r of records) {
    assert.ok(r.timestamp, `Record missing timestamp: ${r.type}`);
  }
});

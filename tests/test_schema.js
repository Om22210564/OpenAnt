'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  OpenantError, ERROR_CODES,
  deterministicUuid, randomUuid,
  makeSession, makeTurn,
  makeTextBlock, makeThinkingBlock, makeReasoningBlock,
  makeToolCallBlock, makeToolResultBlock,
  validateSession,
} = require('../src/schema');

// ─── OpenantError ────────────────────────────────────────────────────────────

test('OpenantError: has correct name, code, context', () => {
  const err = new OpenantError('oops', 'NOT_FOUND', { id: 'x' });
  assert.equal(err.name, 'OpenantError');
  assert.equal(err.message, 'oops');
  assert.equal(err.code, 'NOT_FOUND');
  assert.deepEqual(err.context, { id: 'x' });
  assert.ok(err instanceof Error);
});

test('OpenantError: defaults code to UNKNOWN when omitted', () => {
  const err = new OpenantError('bare');
  assert.equal(err.code, 'UNKNOWN');
  assert.deepEqual(err.context, {});
});

test('ERROR_CODES: contains all expected keys', () => {
  const expected = ['NOT_FOUND', 'PATH_CONFLICT', 'SUMMARIZE_FAILED', 'PARSE_ERROR', 'DB_ERROR', 'INVALID_FORMAT', 'GENERAL'];
  for (const key of expected) {
    assert.ok(ERROR_CODES[key], `Missing ERROR_CODES.${key}`);
  }
});

// ─── deterministicUuid ───────────────────────────────────────────────────────

test('deterministicUuid: same input always produces same output', () => {
  const a = deterministicUuid('hello-world');
  const b = deterministicUuid('hello-world');
  assert.equal(a, b);
});

test('deterministicUuid: different inputs produce different UUIDs', () => {
  const a = deterministicUuid('seed-A');
  const b = deterministicUuid('seed-B');
  assert.notEqual(a, b);
});

test('deterministicUuid: output matches UUID format (8-4-4-4-12)', () => {
  const uuid = deterministicUuid('test-seed');
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('deterministicUuid: third segment starts with 4 (version marker)', () => {
  const uuid = deterministicUuid('version-test');
  const parts = uuid.split('-');
  assert.equal(parts[2][0], '4');
});

// ─── randomUuid ──────────────────────────────────────────────────────────────

test('randomUuid: produces different values each call', () => {
  const a = randomUuid();
  const b = randomUuid();
  assert.notEqual(a, b);
});

test('randomUuid: output matches UUID format', () => {
  const uuid = randomUuid();
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

// ─── makeSession ─────────────────────────────────────────────────────────────

test('makeSession: has all required fields with defaults', () => {
  const s = makeSession({});
  assert.equal(s.id, '');
  assert.equal(s.source, 'claude');
  assert.equal(s.cwd, '');
  assert.ok(s.timestamp);
  assert.equal(s.title, null);
  assert.equal(s.model, null);
  assert.equal(s.modelProvider, null);
  assert.equal(s.cliVersion, null);
  assert.equal(s.baseInstructions, null);
  assert.deepEqual(s.turns, []);
  assert.deepEqual(s.meta, {});
});

test('makeSession: overrides are applied', () => {
  const s = makeSession({ id: 'abc', source: 'codex', model: 'gpt-5' });
  assert.equal(s.id, 'abc');
  assert.equal(s.source, 'codex');
  assert.equal(s.model, 'gpt-5');
});

// ─── makeTurn ─────────────────────────────────────────────────────────────────

test('makeTurn: has all required fields with defaults', () => {
  const t = makeTurn({});
  assert.ok(t.id);
  assert.equal(t.parentId, null);
  assert.equal(t.role, 'user');
  assert.deepEqual(t.blocks, []);
  assert.ok(t.timestamp);
  assert.deepEqual(t.meta, {});
});

test('makeTurn: overrides are applied', () => {
  const t = makeTurn({ role: 'assistant', parentId: 'parent-id' });
  assert.equal(t.role, 'assistant');
  assert.equal(t.parentId, 'parent-id');
});

test('makeTurn: each call generates a unique id', () => {
  const t1 = makeTurn({});
  const t2 = makeTurn({});
  assert.notEqual(t1.id, t2.id);
});

// ─── Block constructors ───────────────────────────────────────────────────────

test('makeTextBlock: correct shape', () => {
  const b = makeTextBlock('hello');
  assert.deepEqual(b, { type: 'text', text: 'hello' });
});

test('makeTextBlock: coerces non-string to string', () => {
  const b = makeTextBlock(42);
  assert.equal(b.text, '42');
});

test('makeTextBlock: null becomes empty string', () => {
  const b = makeTextBlock(null);
  assert.equal(b.text, '');
});

test('makeThinkingBlock: correct shape with signature', () => {
  const b = makeThinkingBlock('thinking...', 'SIG123');
  assert.deepEqual(b, { type: 'thinking', text: 'thinking...', signature: 'SIG123' });
});

test('makeThinkingBlock: signature defaults to empty string', () => {
  const b = makeThinkingBlock('ponder');
  assert.equal(b.signature, '');
});

test('makeReasoningBlock: preserves encryptedContent', () => {
  const b = makeReasoningBlock('summary text', 'ENC_DATA');
  assert.equal(b.type, 'reasoning');
  assert.equal(b.summaryText, 'summary text');
  assert.equal(b.encryptedContent, 'ENC_DATA');
});

test('makeReasoningBlock: encryptedContent defaults to null', () => {
  const b = makeReasoningBlock('summary');
  assert.equal(b.encryptedContent, null);
});

test('makeToolCallBlock: standard kind by default', () => {
  const b = makeToolCallBlock('call_001', 'shell_command', 'standard', { cmd: 'ls' });
  assert.equal(b.type, 'tool_call');
  assert.equal(b.callId, 'call_001');
  assert.equal(b.toolName, 'shell_command');
  assert.equal(b.toolKind, 'standard');
  assert.deepEqual(b.input, { cmd: 'ls' });
});

test('makeToolCallBlock: custom kind preserved', () => {
  const b = makeToolCallBlock('call_002', 'apply_patch', 'custom', '*** patch');
  assert.equal(b.toolKind, 'custom');
});

test('makeToolCallBlock: input defaults to empty object', () => {
  const b = makeToolCallBlock('call_003', 'tool');
  assert.deepEqual(b.input, {});
});

test('makeToolResultBlock: correct shape', () => {
  const b = makeToolResultBlock('call_001', 'output text', false);
  assert.equal(b.type, 'tool_result');
  assert.equal(b.callId, 'call_001');
  assert.equal(b.output, 'output text');
  assert.equal(b.isError, false);
});

test('makeToolResultBlock: isError flag set correctly', () => {
  const b = makeToolResultBlock('call_002', 'err msg', true);
  assert.equal(b.isError, true);
});

test('makeToolResultBlock: output defaults to empty string', () => {
  const b = makeToolResultBlock('call_003');
  assert.equal(b.output, '');
});

// ─── validateSession ──────────────────────────────────────────────────────────

test('validateSession: passes for valid session', () => {
  const s = makeSession({ id: 'abc123' });
  assert.doesNotThrow(() => validateSession(s));
});

test('validateSession: throws for null', () => {
  assert.throws(() => validateSession(null), { code: 'INVALID_FORMAT' });
});

test('validateSession: throws when id is missing', () => {
  assert.throws(() => validateSession({ turns: [] }), { code: 'INVALID_FORMAT' });
});

test('validateSession: throws when turns is not an array', () => {
  assert.throws(() => validateSession({ id: 'x', turns: 'not-array' }), { code: 'INVALID_FORMAT' });
});

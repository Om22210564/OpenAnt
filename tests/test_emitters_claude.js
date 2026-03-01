'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { emitClaudeSession, encodeCwdToProjectDir } = require('../src/emitters/claude');
const { makeSession, makeTurn, makeTextBlock, makeThinkingBlock, makeReasoningBlock, makeToolCallBlock, makeToolResultBlock } = require('../src/schema');

function tmpPath() {
  return path.join(os.tmpdir(), 'openant_test_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jsonl');
}

function parseLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// ─── encodeCwdToProjectDir ────────────────────────────────────────────────────

test('encodeCwdToProjectDir: Windows path with drive colon and backslash', () => {
  const result = encodeCwdToProjectDir('C:\\Users\\omkar\\OneDrive\\Desktop\\OpenAnt_Adapter');
  assert.equal(result, 'C--Users-omkar-OneDrive-Desktop-OpenAnt-Adapter');
});

test('encodeCwdToProjectDir: produces double-dash after drive letter', () => {
  const result = encodeCwdToProjectDir('C:\\Users\\test');
  assert.ok(result.startsWith('C--'), `expected C-- but got: ${result}`);
});

test('encodeCwdToProjectDir: underscore replaced with dash', () => {
  const result = encodeCwdToProjectDir('C:\\my_project');
  assert.equal(result, 'C--my-project');
});

test('encodeCwdToProjectDir: trailing backslash stripped', () => {
  const result = encodeCwdToProjectDir('C:\\Users\\test\\');
  assert.equal(result, encodeCwdToProjectDir('C:\\Users\\test'));
});

test('encodeCwdToProjectDir: trailing forward slash stripped', () => {
  const result = encodeCwdToProjectDir('/home/user/project/');
  assert.equal(result, encodeCwdToProjectDir('/home/user/project'));
});

test('encodeCwdToProjectDir: forward slashes replaced with dashes', () => {
  const result = encodeCwdToProjectDir('/home/user/project');
  assert.equal(result, '-home-user-project');
});

test('encodeCwdToProjectDir: empty string returns unknown', () => {
  const result = encodeCwdToProjectDir('');
  assert.equal(result, 'unknown');
});

test('encodeCwdToProjectDir: null returns unknown', () => {
  const result = encodeCwdToProjectDir(null);
  assert.equal(result, 'unknown');
});

test('encodeCwdToProjectDir: real fixture path matches real encoded dir name', () => {
  const result = encodeCwdToProjectDir('C:\\Users\\omkar\\OneDrive\\Desktop\\OpenAnt_Adapter');
  assert.equal(result, 'C--Users-omkar-OneDrive-Desktop-OpenAnt-Adapter');
});

// ─── emitClaudeSession: dry-run ───────────────────────────────────────────────

test('emitClaudeSession dry-run: returns outputPath and line count without writing', () => {
  const session = makeSession({
    id: 'test-session-001',
    source: 'codex',
    cwd: 'C:\\Users\\test\\project',
    turns: [makeTurn({ role: 'user', blocks: [makeTextBlock('hello')] })],
  });
  const out = tmpPath();
  const result = emitClaudeSession(session, { outputPath: out, dryRun: true });
  assert.ok(result.outputPath === out);
  assert.ok(result.lines > 0);
  assert.equal(fs.existsSync(out), false, 'dry-run should not write file');
});

// ─── emitClaudeSession: user turns ───────────────────────────────────────────

test('emitClaudeSession: single text block → string content', () => {
  const session = makeSession({
    id: 'test-002',
    source: 'codex',
    cwd: 'C:\\test',
    turns: [makeTurn({ role: 'user', blocks: [makeTextBlock('hello world')] })],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const userRecord = records.find(r => r.type === 'user');
  assert.ok(userRecord, 'no user record emitted');
  assert.equal(userRecord.message.content, 'hello world');
});

test('emitClaudeSession: multiple text blocks → array content', () => {
  const session = makeSession({
    id: 'test-003',
    source: 'codex',
    cwd: 'C:\\test',
    turns: [makeTurn({ role: 'user', blocks: [makeTextBlock('part one'), makeTextBlock('part two')] })],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const userRecord = records.find(r => r.type === 'user');
  assert.ok(Array.isArray(userRecord.message.content));
  assert.equal(userRecord.message.content.length, 2);
});

test('emitClaudeSession: tool_result on user turn emits tool_result content', () => {
  const session = makeSession({
    id: 'test-004',
    source: 'claude',
    cwd: 'C:\\test',
    turns: [
      makeTurn({ role: 'user', blocks: [makeToolResultBlock('call_x', 'output here', false)] }),
    ],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const userRecord = records.find(r => r.type === 'user');
  assert.ok(userRecord);
  const content = userRecord.message.content;
  assert.ok(Array.isArray(content));
  assert.equal(content[0].type, 'tool_result');
  assert.equal(content[0].tool_use_id, 'call_x');
});

// ─── emitClaudeSession: assistant turns ──────────────────────────────────────

test('emitClaudeSession: thinking block → thinking in content array', () => {
  const session = makeSession({
    id: 'test-005',
    source: 'claude',
    cwd: 'C:\\test',
    turns: [makeTurn({ role: 'assistant', blocks: [makeThinkingBlock('deep thought', 'SIG_A')] })],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const asstRecord = records.find(r => r.type === 'assistant');
  assert.ok(asstRecord);
  const thinkContent = asstRecord.message.content.find(c => c.type === 'thinking');
  assert.ok(thinkContent);
  assert.equal(thinkContent.thinking, 'deep thought');
  assert.equal(thinkContent.signature, 'SIG_A');
});

test('emitClaudeSession: tool_call block → tool_use in content array', () => {
  const session = makeSession({
    id: 'test-006',
    source: 'claude',
    cwd: 'C:\\test',
    turns: [makeTurn({ role: 'assistant', blocks: [makeToolCallBlock('call_y', 'Bash', 'standard', { command: 'ls' })] })],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const asstRecord = records.find(r => r.type === 'assistant');
  const toolUseContent = asstRecord.message.content.find(c => c.type === 'tool_use');
  assert.ok(toolUseContent);
  assert.equal(toolUseContent.id, 'call_y');
  assert.equal(toolUseContent.name, 'Bash');
  assert.deepEqual(toolUseContent.input, { command: 'ls' });
});

test('emitClaudeSession: Codex reasoning → synthetic thinking block', () => {
  const session = makeSession({
    id: 'test-007',
    source: 'codex',
    cwd: 'C:\\test',
    turns: [makeTurn({ role: 'assistant', blocks: [makeReasoningBlock('Planning next step', 'ENC_XYZ')] })],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  const asstRecord = records.find(r => r.type === 'assistant');
  const thinkContent = asstRecord.message.content.find(c => c.type === 'thinking');
  assert.ok(thinkContent);
  assert.ok(thinkContent.thinking.includes('[Codex reasoning:'));
  assert.ok(thinkContent.thinking.includes('Planning next step'));
  assert.equal(thinkContent.signature, '');
});

test('emitClaudeSession: tool_result on assistant turn → split to user record', () => {
  const session = makeSession({
    id: 'test-008',
    source: 'codex',
    cwd: 'C:\\test',
    turns: [
      makeTurn({
        role: 'assistant',
        blocks: [
          makeToolCallBlock('call_z', 'run', 'standard', {}),
          makeToolResultBlock('call_z', 'result output', false),
        ],
      }),
    ],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  // Should have an assistant record (for the tool_call) AND a user record (for the tool_result)
  const asstRecord = records.find(r => r.type === 'assistant');
  assert.ok(asstRecord, 'no assistant record');
  const toolUse = asstRecord.message.content.find(c => c.type === 'tool_use');
  assert.ok(toolUse, 'tool_use not in assistant content');

  const userRecord = records.find(r => r.type === 'user');
  assert.ok(userRecord, 'no user record for tool_result');
  const toolResult = userRecord.message.content.find(c => c.type === 'tool_result');
  assert.ok(toolResult, 'tool_result not in user content');
  assert.equal(toolResult.tool_use_id, 'call_z');
});

// ─── emitClaudeSession: linear parentUuid chain ───────────────────────────────

test('emitClaudeSession: first record has parentUuid=null', () => {
  const session = makeSession({
    id: 'test-009',
    source: 'claude',
    cwd: 'C:\\test',
    turns: [
      makeTurn({ role: 'user', blocks: [makeTextBlock('hi')] }),
      makeTurn({ role: 'assistant', blocks: [makeTextBlock('hello')] }),
    ],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  assert.equal(records[0].parentUuid, null);
});

test('emitClaudeSession: second record parentUuid links to first record uuid', () => {
  const session = makeSession({
    id: 'test-010',
    source: 'claude',
    cwd: 'C:\\test',
    turns: [
      makeTurn({ role: 'user', blocks: [makeTextBlock('turn 1')] }),
      makeTurn({ role: 'assistant', blocks: [makeTextBlock('turn 2')] }),
    ],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  assert.equal(records[1].parentUuid, records[0].uuid);
});

// ─── emitClaudeSession: file conflict ────────────────────────────────────────

test('emitClaudeSession: throws PATH_CONFLICT if file exists without --force', () => {
  const session = makeSession({ id: 'test-conflict', source: 'codex', cwd: 'C:\\test', turns: [] });
  const out = tmpPath();
  fs.writeFileSync(out, 'existing content');
  try {
    assert.throws(
      () => emitClaudeSession(session, { outputPath: out }),
      (err) => err.code === 'PATH_CONFLICT',
    );
  } finally {
    fs.unlinkSync(out);
  }
});

test('emitClaudeSession: --force overwrites existing file', () => {
  const session = makeSession({
    id: 'test-force',
    source: 'claude',
    cwd: 'C:\\test',
    turns: [makeTurn({ role: 'user', blocks: [makeTextBlock('new content')] })],
  });
  const out = tmpPath();
  fs.writeFileSync(out, 'old content');
  emitClaudeSession(session, { outputPath: out, force: true });
  const content = fs.readFileSync(out, 'utf8');
  fs.unlinkSync(out);
  assert.ok(content.includes('new content'));
});

// ─── emitClaudeSession: valid JSONL output ────────────────────────────────────

test('emitClaudeSession: every line is valid JSON', () => {
  const session = makeSession({
    id: 'test-valid-json',
    source: 'claude',
    cwd: 'C:\\test',
    turns: [
      makeTurn({ role: 'user', blocks: [makeTextBlock('hi')] }),
      makeTurn({ role: 'assistant', blocks: [makeTextBlock('hey'), makeToolCallBlock('c1', 'Read', 'standard', { file_path: 'app.js' })] }),
      makeTurn({ role: 'user', blocks: [makeToolResultBlock('c1', 'content here', false)] }),
    ],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const rawLines = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean);
  fs.unlinkSync(out);
  for (const line of rawLines) {
    assert.doesNotThrow(() => JSON.parse(line), `Invalid JSON line: ${line.slice(0, 80)}`);
  }
});

test('emitClaudeSession: all records have required Claude fields', () => {
  const session = makeSession({
    id: 'test-fields',
    source: 'claude',
    cwd: 'C:\\test',
    turns: [makeTurn({ role: 'user', blocks: [makeTextBlock('msg')] })],
  });
  const out = tmpPath();
  emitClaudeSession(session, { outputPath: out });
  const records = parseLines(out);
  fs.unlinkSync(out);
  for (const r of records) {
    assert.ok(r.uuid, 'missing uuid');
    assert.ok(r.type, 'missing type');
    assert.ok(r.sessionId, 'missing sessionId');
    assert.ok(r.timestamp, 'missing timestamp');
  }
});

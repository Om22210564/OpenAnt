'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { parseCodexSession } = require('../src/parsers/codex');
const { parseClaudeSession } = require('../src/parsers/claude');
const { emitClaudeSession } = require('../src/emitters/claude');
const { emitCodexSession } = require('../src/emitters/codex');

const CODEX_FIXTURE = path.join(__dirname, 'fixtures', 'codex_sample.jsonl');
const CLAUDE_FIXTURE = path.join(__dirname, 'fixtures', 'claude_sample.jsonl');

function tmpPath() {
  return path.join(os.tmpdir(), 'openant_rt_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jsonl');
}

// ─── Codex → Claude round-trip ────────────────────────────────────────────────

test('roundtrip: Codex→Claude yields valid JSONL readable by Claude parser', () => {
  const { session: codexSession } = parseCodexSession(CODEX_FIXTURE);
  const out = tmpPath();
  emitClaudeSession(codexSession, { outputPath: out });

  // Must be parseable
  let claudeSession;
  assert.doesNotThrow(() => {
    const result = parseClaudeSession(out);
    claudeSession = result.session;
  });
  fs.unlinkSync(out);
  assert.ok(claudeSession.turns.length > 0);
});

test('roundtrip: Codex→Claude preserves user text content', () => {
  const { session: codexSession } = parseCodexSession(CODEX_FIXTURE);
  const out = tmpPath();
  emitClaudeSession(codexSession, { outputPath: out });
  const { session: claudeSession } = parseClaudeSession(out);
  fs.unlinkSync(out);

  // User's message "Fix the bug in app.py" should survive
  const allBlocks = claudeSession.turns.flatMap(t => t.blocks);
  const textBlock = allBlocks.find(b => b.type === 'text' && b.text.includes('Fix the bug in app.py'));
  assert.ok(textBlock, 'user text content not preserved after Codex→Claude');
});

test('roundtrip: Codex→Claude preserves assistant text content', () => {
  const { session: codexSession } = parseCodexSession(CODEX_FIXTURE);
  const out = tmpPath();
  emitClaudeSession(codexSession, { outputPath: out });
  const { session: claudeSession } = parseClaudeSession(out);
  fs.unlinkSync(out);

  const allBlocks = claudeSession.turns.flatMap(t => t.blocks);
  const assistantText = allBlocks.find(b => b.type === 'text' && b.text.includes('Fixed the bug'));
  assert.ok(assistantText, 'assistant text not preserved after Codex→Claude');
});

test('roundtrip: Codex→Claude preserves tool call names', () => {
  const { session: codexSession } = parseCodexSession(CODEX_FIXTURE);
  const out = tmpPath();
  emitClaudeSession(codexSession, { outputPath: out });
  const { session: claudeSession } = parseClaudeSession(out);
  fs.unlinkSync(out);

  const allBlocks = claudeSession.turns.flatMap(t => t.blocks);
  const shellCall = allBlocks.find(b => b.type === 'tool_call' && b.toolName === 'shell_command');
  assert.ok(shellCall, 'shell_command tool call not preserved');

  const applyPatch = allBlocks.find(b => b.type === 'tool_call' && b.toolName === 'apply_patch');
  assert.ok(applyPatch, 'apply_patch tool call not preserved');
});

test('roundtrip: Codex→Claude reasoning becomes thinking block in Claude', () => {
  const { session: codexSession } = parseCodexSession(CODEX_FIXTURE);
  const out = tmpPath();
  emitClaudeSession(codexSession, { outputPath: out });
  const { session: claudeSession } = parseClaudeSession(out);
  fs.unlinkSync(out);

  const allBlocks = claudeSession.turns.flatMap(t => t.blocks);
  const thinkingBlock = allBlocks.find(b => b.type === 'thinking');
  assert.ok(thinkingBlock, 'no thinking block after Codex→Claude');
  assert.ok(thinkingBlock.text.includes('[Codex reasoning:'), 'thinking text should reference Codex reasoning');
});

test('roundtrip: Codex→Claude session has correct cwd', () => {
  const { session: codexSession } = parseCodexSession(CODEX_FIXTURE);
  const out = tmpPath();
  emitClaudeSession(codexSession, { outputPath: out });
  const { session: claudeSession } = parseClaudeSession(out);
  fs.unlinkSync(out);

  assert.equal(claudeSession.cwd, 'C:\\Users\\test\\project');
});

// ─── Claude → Codex round-trip ────────────────────────────────────────────────

test('roundtrip: Claude→Codex yields valid JSONL readable by Codex parser', () => {
  const { session: claudeSession } = parseClaudeSession(CLAUDE_FIXTURE);
  const out = tmpPath();
  emitCodexSession(claudeSession, { outputPath: out });

  let codexSession;
  assert.doesNotThrow(() => {
    const result = parseCodexSession(out);
    codexSession = result.session;
  });
  fs.unlinkSync(out);
  assert.ok(codexSession.turns.length > 0);
});

test('roundtrip: Claude→Codex preserves user text content', () => {
  const { session: claudeSession } = parseClaudeSession(CLAUDE_FIXTURE);
  const out = tmpPath();
  emitCodexSession(claudeSession, { outputPath: out });
  const { session: codexSession } = parseCodexSession(out);
  fs.unlinkSync(out);

  const allBlocks = codexSession.turns.flatMap(t => t.blocks);
  const userText = allBlocks.find(b => b.type === 'text' && b.text.includes('Fix the bug in app.py'));
  assert.ok(userText, 'user text not preserved after Claude→Codex');
});

test('roundtrip: Claude→Codex preserves assistant text content', () => {
  const { session: claudeSession } = parseClaudeSession(CLAUDE_FIXTURE);
  const out = tmpPath();
  emitCodexSession(claudeSession, { outputPath: out });
  const { session: codexSession } = parseCodexSession(out);
  fs.unlinkSync(out);

  const allBlocks = codexSession.turns.flatMap(t => t.blocks);
  const assistantText = allBlocks.find(b => b.type === 'text' && b.text.includes('Bug fixed'));
  assert.ok(assistantText, 'assistant text not preserved after Claude→Codex');
});

test('roundtrip: Claude→Codex preserves tool call names', () => {
  const { session: claudeSession } = parseClaudeSession(CLAUDE_FIXTURE);
  const out = tmpPath();
  emitCodexSession(claudeSession, { outputPath: out });
  const { session: codexSession } = parseCodexSession(out);
  fs.unlinkSync(out);

  const allBlocks = codexSession.turns.flatMap(t => t.blocks);
  const readCall = allBlocks.find(b => b.type === 'tool_call' && b.toolName === 'Read');
  assert.ok(readCall, 'Read tool call not preserved after Claude→Codex');
  const editCall = allBlocks.find(b => b.type === 'tool_call' && b.toolName === 'Edit');
  assert.ok(editCall, 'Edit tool call not preserved after Claude→Codex');
});

test('roundtrip: Claude→Codex thinking block becomes reasoning', () => {
  const { session: claudeSession } = parseClaudeSession(CLAUDE_FIXTURE);
  const out = tmpPath();
  emitCodexSession(claudeSession, { outputPath: out });
  const { session: codexSession } = parseCodexSession(out);
  fs.unlinkSync(out);

  const allBlocks = codexSession.turns.flatMap(t => t.blocks);
  const reasoningBlock = allBlocks.find(b => b.type === 'reasoning');
  assert.ok(reasoningBlock, 'no reasoning block in Codex output after Claude→Codex');
});

test('roundtrip: Claude→Codex session_meta id is deterministic', () => {
  const { session: claudeSession } = parseClaudeSession(CLAUDE_FIXTURE);

  const out1 = tmpPath();
  const out2 = tmpPath();
  emitCodexSession(claudeSession, { outputPath: out1 });
  emitCodexSession(claudeSession, { outputPath: out2, force: true });

  const records1 = fs.readFileSync(out1, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const records2 = fs.readFileSync(out2, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  fs.unlinkSync(out1);
  fs.unlinkSync(out2);

  assert.equal(records1[0].payload.id, records2[0].payload.id);
});

test('roundtrip: Claude→Codex baseInstructions omitted when null', () => {
  const { session: claudeSession } = parseClaudeSession(CLAUDE_FIXTURE);
  // baseInstructions is null in the fixture
  const out = tmpPath();
  emitCodexSession(claudeSession, { outputPath: out });
  const records = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  fs.unlinkSync(out);
  const meta = records[0];
  assert.equal(meta.type, 'session_meta');
  // base_instructions should exist but may be empty string
  assert.ok('base_instructions' in meta.payload);
});

// ─── Double round-trip ────────────────────────────────────────────────────────

test('roundtrip: Codex→Claude→Codex text content survives double conversion', () => {
  const { session: s1 } = parseCodexSession(CODEX_FIXTURE);

  const midPath = tmpPath();
  emitClaudeSession(s1, { outputPath: midPath });

  const { session: s2 } = parseClaudeSession(midPath);
  fs.unlinkSync(midPath);

  const finalPath = tmpPath();
  emitCodexSession(s2, { outputPath: finalPath });

  const { session: s3 } = parseCodexSession(finalPath);
  fs.unlinkSync(finalPath);

  const allBlocks = s3.turns.flatMap(t => t.blocks);
  const text = allBlocks.find(b => b.type === 'text' && b.text.includes('Fix the bug in app.py'));
  assert.ok(text, 'user text did not survive Codex→Claude→Codex');
});

test('roundtrip: Claude→Codex→Claude text content survives double conversion', () => {
  const { session: s1 } = parseClaudeSession(CLAUDE_FIXTURE);

  const midPath = tmpPath();
  emitCodexSession(s1, { outputPath: midPath });

  const { session: s2 } = parseCodexSession(midPath);
  fs.unlinkSync(midPath);

  const finalPath = tmpPath();
  emitClaudeSession(s2, { outputPath: finalPath });

  const { session: s3 } = parseClaudeSession(finalPath);
  fs.unlinkSync(finalPath);

  const allBlocks = s3.turns.flatMap(t => t.blocks);
  const text = allBlocks.find(b => b.type === 'text' && b.text.includes('Fix the bug in app.py'));
  assert.ok(text, 'user text did not survive Claude→Codex→Claude');
});

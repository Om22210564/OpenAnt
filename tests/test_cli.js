'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '..', 'src', 'cli.js');

function run(args, opts) {
  const result = spawnSync(process.execPath, [CLI, ...args.split(' ').filter(Boolean)], {
    encoding: 'utf8',
    timeout: 15000,
    ...opts,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

// ─── openant list ─────────────────────────────────────────────────────────────

test('CLI: openant list exits 0', () => {
  const { status } = run('list');
  assert.equal(status, 0);
});

test('CLI: openant list --json outputs valid JSON array', () => {
  const { stdout, status } = run('list --json');
  assert.equal(status, 0);
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(stdout); });
  assert.ok(Array.isArray(parsed));
});

test('CLI: openant list --claude exits 0', () => {
  const { status } = run('list --claude');
  assert.equal(status, 0);
});

test('CLI: openant list --codex exits 0', () => {
  const { status } = run('list --codex');
  assert.equal(status, 0);
});

test('CLI: openant list --json entries have required fields', () => {
  const { stdout } = run('list --json');
  const sessions = JSON.parse(stdout);
  for (const s of sessions.slice(0, 3)) {
    assert.ok(s.id, 'session missing id');
    assert.ok(s.source === 'claude' || s.source === 'codex', `unexpected source: ${s.source}`);
    assert.ok(s.file_path, 'session missing file_path');
  }
});

// ─── openant inspect ──────────────────────────────────────────────────────────

test('CLI: openant inspect Codex session exits 0', () => {
  const { status } = run('inspect 019ca8d1');
  assert.equal(status, 0);
});

test('CLI: openant inspect Claude session exits 0', () => {
  const { status } = run('inspect c86e2d30');
  assert.equal(status, 0);
});

test('CLI: openant inspect --json outputs valid JSON session', () => {
  const { stdout, status } = run('inspect 019ca8d1 --json');
  assert.equal(status, 0);
  let session;
  assert.doesNotThrow(() => { session = JSON.parse(stdout); });
  assert.ok(session.id, 'session missing id');
  assert.equal(session.source, 'codex');
  assert.ok(Array.isArray(session.turns));
});

test('CLI: openant inspect shows turn count', () => {
  const { stdout } = run('inspect 019ca8d1');
  assert.ok(stdout.includes('Turns:'), 'output missing Turns: label');
});

test('CLI: openant inspect nonexistent session exits 2', () => {
  const { status } = run('inspect 00000000-does-not-exist');
  assert.equal(status, 2);
});

test('CLI: openant inspect shows source field', () => {
  const { stdout } = run('inspect 019ca8d1');
  assert.ok(stdout.includes('Source:'), 'output missing Source: label');
  assert.ok(stdout.includes('codex'), 'output should contain codex');
});

// ─── openant import --dry-run ─────────────────────────────────────────────────

test('CLI: openant import claude (Codex→Claude) --dry-run exits 0', () => {
  const { status, stdout } = run('import claude 019ca8d1-eafb-71f2-8137-ed7539c38304 --dry-run');
  assert.equal(status, 0);
  assert.ok(stdout.includes('DRY RUN'), 'dry-run output missing DRY RUN label');
});

test('CLI: openant import codex (Claude→Codex) --dry-run exits 0', () => {
  const { status, stdout } = run('import codex c86e2d30-d596-433c-8f0d-38aebe00f8fc --dry-run');
  assert.equal(status, 0);
  assert.ok(stdout.includes('DRY RUN'));
});

test('CLI: openant import --dry-run shows output path', () => {
  const { stdout } = run('import claude 019ca8d1-eafb-71f2-8137-ed7539c38304 --dry-run');
  assert.ok(stdout.includes('.jsonl'), 'dry-run should show target .jsonl path');
});

test('CLI: openant import --dry-run shows turn count', () => {
  const { stdout } = run('import claude 019ca8d1-eafb-71f2-8137-ed7539c38304 --dry-run');
  assert.ok(stdout.includes('turns'), 'dry-run should mention turns');
});

test('CLI: openant import invalid format exits 1', () => {
  const { status } = run('import xml 019ca8d1-eafb-71f2-8137-ed7539c38304 --dry-run');
  assert.equal(status, 1);
});

test('CLI: openant import nonexistent session exits 2', () => {
  const { status } = run('import claude 00000000-0000-0000-0000-000000000000 --dry-run');
  assert.equal(status, 2);
});

// ─── openant import --output (real conversion) ────────────────────────────────

test('CLI: openant import claude writes valid JSONL file', () => {
  const out = path.join(os.tmpdir(), 'openant_cli_test_' + Date.now() + '.jsonl');
  const { status } = run('import claude 019ca8d1-eafb-71f2-8137-ed7539c38304 --output ' + out);
  assert.equal(status, 0);
  assert.ok(fs.existsSync(out), 'output file not created');
  const lines = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean);
  fs.unlinkSync(out);
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line));
  }
});

test('CLI: openant import codex writes valid JSONL file', () => {
  const out = path.join(os.tmpdir(), 'openant_cli_codex_' + Date.now() + '.jsonl');
  const { status } = run('import codex c86e2d30-d596-433c-8f0d-38aebe00f8fc --output ' + out);
  assert.equal(status, 0);
  assert.ok(fs.existsSync(out), 'output file not created');
  const lines = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean);
  fs.unlinkSync(out);
  assert.ok(lines.length > 0);
  // First line should be session_meta for Codex output
  const first = JSON.parse(lines[0]);
  assert.equal(first.type, 'session_meta');
});

test('CLI: import codex --output: PATH_CONFLICT exits 4 without --force', () => {
  const out = path.join(os.tmpdir(), 'openant_conflict_' + Date.now() + '.jsonl');
  fs.writeFileSync(out, 'existing');
  const { status } = run('import codex c86e2d30-d596-433c-8f0d-38aebe00f8fc --output ' + out);
  fs.unlinkSync(out);
  assert.equal(status, 4);
});

test('CLI: import --force overwrites conflict file', () => {
  const out = path.join(os.tmpdir(), 'openant_force_' + Date.now() + '.jsonl');
  fs.writeFileSync(out, 'existing');
  const { status } = run('import codex c86e2d30-d596-433c-8f0d-38aebe00f8fc --output ' + out + ' --force');
  assert.equal(status, 0);
  const lines = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean);
  fs.unlinkSync(out);
  assert.ok(lines.length > 0);
  assert.equal(JSON.parse(lines[0]).type, 'session_meta');
});

// ─── openant status ───────────────────────────────────────────────────────────

test('CLI: openant status exits 0', () => {
  const { status } = run('status');
  assert.equal(status, 0);
});

test('CLI: openant status shows DB path', () => {
  const { stdout } = run('status');
  assert.ok(stdout.includes('.openant') || stdout.includes('state.sqlite'), 'status should show DB path');
});

test('CLI: openant status shows session counts', () => {
  const { stdout } = run('status');
  assert.ok(stdout.includes('sessions'), 'status should mention sessions');
});

// ─── openant --help ───────────────────────────────────────────────────────────

test('CLI: openant --help exits 0', () => {
  const { status } = run('--help');
  assert.equal(status, 0);
});

test('CLI: openant --help mentions all commands', () => {
  const { stdout } = run('--help');
  assert.ok(stdout.includes('list'), 'help missing list command');
  assert.ok(stdout.includes('inspect'), 'help missing inspect command');
  assert.ok(stdout.includes('import'), 'help missing import command');
  assert.ok(stdout.includes('status'), 'help missing status command');
});

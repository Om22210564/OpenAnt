'use strict';

/**
 * Test runner: executes all test files and collects results for report generation.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_FILES = [
  'test_schema.js',
  'test_parsers_codex.js',
  'test_parsers_claude.js',
  'test_emitters_claude.js',
  'test_emitters_codex.js',
  'test_roundtrip.js',
  'test_cli.js',
];

const TESTS_DIR = __dirname;

const results = [];
let totalPass = 0;
let totalFail = 0;
let totalSkip = 0;
let startTime = Date.now();

for (const file of TEST_FILES) {
  const filePath = path.join(TESTS_DIR, file);
  const fileStart = Date.now();

  const result = spawnSync(process.execPath, ['--test', filePath], {
    encoding: 'utf8',
    timeout: 60000,
  });

  const elapsed = Date.now() - fileStart;
  const output = (result.stdout || '') + (result.stderr || '');

  // Parse TAP-like output from node:test
  const passMatches = output.match(/# tests (\d+)/);
  const failMatches = output.match(/# fail (\d+)/);
  const skipMatches = output.match(/# skipped (\d+)/);
  const passCount = passMatches ? parseInt(passMatches[1]) : 0;
  const failCount = failMatches ? parseInt(failMatches[1]) : 0;
  const skipCount = skipMatches ? parseInt(skipMatches[1]) : 0;

  // Extract individual test names and their outcomes
  const testCases = [];
  const lines = output.split('\n');
  for (const line of lines) {
    // TAP: "ok N - test name" or "not ok N - test name"
    const okMatch = line.match(/^ok \d+ - (.+)$/);
    const notOkMatch = line.match(/^not ok \d+ - (.+)$/);
    if (okMatch) testCases.push({ name: okMatch[1].trim(), status: 'PASS' });
    if (notOkMatch) testCases.push({ name: notOkMatch[1].trim(), status: 'FAIL' });
  }

  // Extract failure details
  const failures = [];
  let inFailure = false;
  let failureLines = [];
  for (const line of lines) {
    if (line.match(/^not ok/)) {
      if (failureLines.length > 0) failures.push(failureLines.join('\n'));
      failureLines = [line];
      inFailure = true;
    } else if (inFailure) {
      if (line.match(/^#/) || line.match(/^\s/)) {
        failureLines.push(line);
      } else {
        if (failureLines.length > 0) failures.push(failureLines.join('\n'));
        failureLines = [];
        inFailure = false;
      }
    }
  }
  if (failureLines.length > 0) failures.push(failureLines.join('\n'));

  totalPass += passCount;
  totalFail += failCount;
  totalSkip += skipCount;

  results.push({
    file,
    passCount,
    failCount,
    skipCount,
    elapsed,
    testCases,
    failures,
    exitCode: result.status,
    rawOutput: output,
  });

  const statusIcon = failCount === 0 ? '✓' : '✗';
  process.stdout.write(
    `${statusIcon} ${file.padEnd(30)} pass=${passCount} fail=${failCount} (${elapsed}ms)\n`
  );
}

const totalElapsed = Date.now() - startTime;

console.log('\n' + '='.repeat(60));
console.log(`Total: ${totalPass + totalFail} tests | ${totalPass} passed | ${totalFail} failed | ${totalSkip} skipped`);
console.log(`Time: ${totalElapsed}ms`);

// Write results to JSON for report generator
const resultsPath = path.join(TESTS_DIR, 'results.json');
fs.writeFileSync(resultsPath, JSON.stringify({
  summary: { totalPass, totalFail, totalSkip, totalElapsed, runAt: new Date().toISOString() },
  files: results,
}, null, 2));

console.log(`\nResults saved to ${resultsPath}`);
process.exit(totalFail > 0 ? 1 : 0);

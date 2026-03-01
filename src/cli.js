#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const { runList } = require('./commands/list');
const { runInspect } = require('./commands/inspect');
const { runStatus } = require('./commands/status');
const { runImport } = require('./commands/import');

program
  .name('openant')
  .description('Bidirectional session bridge between Claude Code CLI and OpenAI Codex CLI')
  .version('1.0.0');

// ─── list ────────────────────────────────────────────────────────────────────

program
  .command('list')
  .description('List all discovered sessions (re-indexes from disk on each call)')
  .option('--claude', 'Show only Claude Code sessions')
  .option('--codex', 'Show only Codex sessions')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    try {
      runList(opts);
    } catch (e) {
      console.error('Error: ' + e.message);
      process.exit(1);
    }
  });

// ─── inspect ─────────────────────────────────────────────────────────────────

program
  .command('inspect <session-id>')
  .description('Display canonical form of any session (supports short UUID prefix)')
  .option('--json', 'Output as JSON')
  .action((sessionId, opts) => {
    try {
      runInspect(sessionId, opts);
    } catch (e) {
      console.error('Error: ' + e.message);
      process.exit(1);
    }
  });

// ─── import ──────────────────────────────────────────────────────────────────

program
  .command('import <format> <session-id>')
  .description([
    'Convert a session between formats:',
    '  format=claude  → Codex session → Claude Code JSONL',
    '  format=codex   → Claude Code session → Codex rollout JSONL',
  ].join('\n'))
  .option('--summarize', 'Compress via claude-opus-4-6 before emitting (requires ANTHROPIC_API_KEY)')
  .option('--output <path>', 'Explicit output file path')
  .option('--dry-run', 'Simulate without writing files')
  .option('--force', 'Overwrite existing output file')
  .action(async (format, sessionId, opts) => {
    try {
      await runImport(format, sessionId, {
        summarize: opts.summarize || false,
        output: opts.output || null,
        dryRun: opts.dryRun || false,
        force: opts.force || false,
      });
    } catch (e) {
      if (e.code === 'PATH_CONFLICT') {
        console.error('Output file already exists. Use --force to overwrite.');
        process.exit(4);
      }
      if (e.code === 'NOT_FOUND') {
        console.error('Session not found: ' + e.message);
        process.exit(2);
      }
      if (e.code === 'SUMMARIZE_FAILED') {
        console.error('Summarization failed: ' + e.message);
        process.exit(3);
      }
      console.error('Error: ' + e.message);
      process.exit(1);
    }
  });

// ─── status ──────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show indexed session count and recent conversions')
  .action((opts) => {
    try {
      runStatus(opts);
    } catch (e) {
      console.error('Error: ' + e.message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);

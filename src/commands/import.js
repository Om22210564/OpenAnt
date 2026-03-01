'use strict';

const { findSessionById } = require('../discovery');
const { parseCodexSession } = require('../parsers/codex');
const { parseClaudeSession } = require('../parsers/claude');
const { emitClaudeSession } = require('../emitters/claude');
const { emitCodexSession } = require('../emitters/codex');
const { insertConversion, upsertSession } = require('../db');

/**
 * Run the import command.
 * @param {string} format - 'claude' (Codex→Claude) or 'codex' (Claude→Codex)
 * @param {string} sessionId - source session id (full or prefix)
 * @param {Object} opts
 * @param {boolean} [opts.summarize]
 * @param {string}  [opts.output]
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.force]
 */
async function runImport(format, sessionId, opts) {
  opts = opts || {};

  // Validate format
  if (format !== 'claude' && format !== 'codex') {
    console.error('Invalid format: ' + format + '. Must be "claude" or "codex".');
    process.exit(1);
  }

  // Determine expected source format
  const sourceFormat = format === 'claude' ? 'codex' : 'claude';

  // Discover session
  const meta = findSessionById(sessionId, sourceFormat);
  if (!meta) {
    console.error('Session not found: ' + sessionId + ' (looking for ' + sourceFormat + ' sessions)');
    process.exit(2);
  }

  console.log('Found session: ' + meta.id + ' (' + meta.source + ')');
  console.log('File: ' + meta.file_path);
  console.log('');

  // Parse
  let parseResult;
  try {
    if (meta.source === 'codex') {
      parseResult = parseCodexSession(meta.file_path);
    } else {
      parseResult = parseClaudeSession(meta.file_path);
    }
  } catch (e) {
    console.error('Parse error: ' + e.message);
    process.exit(1);
  }

  let { session, warnings: parseWarnings } = parseResult;

  if (parseWarnings.length > 0) {
    console.error('[parse warnings]');
    for (const w of parseWarnings.slice(0, 10)) {
      console.error('  ' + w);
    }
    if (parseWarnings.length > 10) {
      console.error('  ... (' + (parseWarnings.length - 10) + ' more)');
    }
    console.error('');
  }

  console.log('Parsed ' + session.turns.length + ' turns.');

  // Optional summarization
  if (opts.summarize) {
    console.log('Summarizing session with claude-opus-4-6 ...');
    try {
      const { summarizeSession } = require('../summarizer');
      session = await summarizeSession(session);
      console.log('Summarization complete. Turns compressed to ' + session.turns.length + '.');
    } catch (e) {
      console.error('Summarization failed: ' + e.message);
      if (e.code === 'SUMMARIZE_FAILED') {
        process.exit(3);
      }
      console.error('Continuing without summarization.');
    }
  }

  // Emit
  let emitResult;
  const emitOpts = {
    outputPath: opts.output || null,
    dryRun: opts.dryRun || false,
    force: opts.force || false,
  };

  try {
    if (format === 'claude') {
      emitResult = emitClaudeSession(session, emitOpts);
    } else {
      emitResult = emitCodexSession(session, emitOpts);
    }
  } catch (e) {
    if (e.code === 'PATH_CONFLICT') {
      console.error('Output file already exists. Use --force to overwrite.');
      process.exit(4);
    }
    console.error('Emit error: ' + e.message);
    process.exit(1);
  }

  const { outputPath, lines, warnings: emitWarnings } = emitResult;
  const allWarnings = [...parseWarnings, ...emitWarnings];

  if (emitWarnings.length > 0) {
    console.error('[emit warnings]');
    for (const w of emitWarnings) {
      console.error('  ' + w);
    }
    console.error('');
  }

  if (opts.dryRun) {
    console.log('[DRY RUN] Would write ' + lines + ' lines to:');
    console.log('  ' + outputPath);
  } else {
    console.log('Written ' + lines + ' lines to:');
    console.log('  ' + outputPath);

    // Record conversion in DB
    const targetId = format === 'claude'
      ? require('../schema').deterministicUuid(session.id + ':claude')
      : require('../schema').deterministicUuid(session.id + ':codex');

    insertConversion({
      source_session_id: session.id,
      source_format: meta.source,
      target_session_id: targetId,
      target_format: format,
      output_path: outputPath,
      converted_at: new Date().toISOString(),
      turn_count: session.turns.length,
      summarized: opts.summarize ? 1 : 0,
      summary_model: opts.summarize ? 'claude-opus-4-6' : null,
      notes: allWarnings.length > 0 ? allWarnings : null,
    });

    // Index source session to DB
    upsertSession({
      ...meta,
      indexed_at: new Date().toISOString(),
    });
  }

  console.log('');
  console.log('Done. ' + session.turns.length + ' turns converted.');
}

module.exports = { runImport };

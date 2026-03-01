'use strict';

const { discoverAllSessions } = require('../discovery');
const { upsertSession } = require('../db');

/**
 * Format a date string for display.
 * @param {string} ts
 * @returns {string}
 */
function formatDate(ts) {
  if (!ts) return 'unknown';
  try {
    return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
  } catch (e) {
    return ts.slice(0, 19);
  }
}

/**
 * Pad or truncate a string to a given width.
 * @param {string} s
 * @param {number} width
 * @returns {string}
 */
function col(s, width) {
  s = String(s || '');
  if (s.length > width) return s.slice(0, width - 1) + '…';
  return s.padEnd(width);
}

/**
 * Execute the `list` command.
 * @param {Object} opts
 * @param {boolean} [opts.claude]
 * @param {boolean} [opts.codex]
 * @param {boolean} [opts.json]
 */
function runList(opts) {
  const source = opts.claude ? 'claude' : opts.codex ? 'codex' : null;
  const sessions = discoverAllSessions(source);

  // Index sessions to DB
  for (const s of sessions) {
    upsertSession(s);
  }

  if (opts.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  if (sessions.length === 0) {
    console.log('No sessions found.');
    return;
  }

  // Sort by started_at desc
  sessions.sort((a, b) => {
    const ta = a.started_at || '';
    const tb = b.started_at || '';
    return ta > tb ? -1 : ta < tb ? 1 : 0;
  });

  // Table header
  const header = [
    col('SOURCE', 6),
    col('ID', 36),
    col('TURNS', 5),
    col('MODEL', 25),
    col('STARTED', 19),
    col('CWD', 40),
  ].join('  ');

  const separator = '-'.repeat(header.length);
  console.log(header);
  console.log(separator);

  for (const s of sessions) {
    const row = [
      col(s.source, 6),
      col(s.id, 36),
      col(String(s.turn_count || 0), 5),
      col(s.model || '', 25),
      col(formatDate(s.started_at), 19),
      col(s.cwd || '', 40),
    ].join('  ');
    console.log(row);
  }

  console.log('\n' + sessions.length + ' session(s) found.');
}

module.exports = { runList };

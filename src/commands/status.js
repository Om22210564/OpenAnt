'use strict';

const { listSessions, listConversions, DB_PATH } = require('../db');

/**
 * Format a date string for display.
 */
function formatDate(ts) {
  if (!ts) return 'unknown';
  try {
    return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
  } catch (e) {
    return String(ts).slice(0, 19);
  }
}

/**
 * Execute the `status` command.
 * @param {Object} opts
 */
function runStatus(opts) {
  const sessions = listSessions();
  const conversions = listConversions(10);

  const claudeCount = sessions.filter(s => s.source === 'claude').length;
  const codexCount = sessions.filter(s => s.source === 'codex').length;

  console.log('=== OpenAnt Status ===');
  console.log('DB: ' + DB_PATH);
  console.log('');
  console.log('Indexed sessions: ' + sessions.length + ' total (' + claudeCount + ' Claude, ' + codexCount + ' Codex)');
  console.log('  Run `openant list` to re-index from disk.');
  console.log('');

  if (conversions.length === 0) {
    console.log('No conversions yet.');
  } else {
    console.log('Recent conversions (last ' + conversions.length + '):');
    console.log('');
    for (const c of conversions) {
      console.log('  #' + c.id + ' ' + c.source_format + ' → ' + c.target_format);
      console.log('    Source: ' + c.source_session_id);
      console.log('    Target: ' + c.target_session_id);
      console.log('    Output: ' + c.output_path);
      console.log('    At:     ' + formatDate(c.converted_at) + ' (' + (c.turn_count || 0) + ' turns' + (c.summarized ? ', summarized' : '') + ')');
      if (c.notes) {
        try {
          const notes = JSON.parse(c.notes);
          if (Array.isArray(notes) && notes.length > 0) {
            console.log('    Notes:  ' + notes.slice(0, 3).join('; '));
          }
        } catch (e) { /* ignore */ }
      }
      console.log('');
    }
  }
}

module.exports = { runStatus };

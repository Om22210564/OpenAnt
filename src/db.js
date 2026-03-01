'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const OPENANT_DIR = path.join(os.homedir(), '.openant');
const DB_PATH = path.join(OPENANT_DIR, 'state.sqlite');

let _db = null;

function getDb() {
  if (_db) return _db;

  try {
    fs.mkdirSync(OPENANT_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }

  const Database = require('better-sqlite3');
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      cwd TEXT,
      title TEXT,
      model TEXT,
      started_at TEXT,
      file_path TEXT NOT NULL,
      line_count INTEGER,
      turn_count INTEGER,
      indexed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_session_id TEXT NOT NULL,
      source_format TEXT NOT NULL,
      target_session_id TEXT NOT NULL,
      target_format TEXT NOT NULL,
      output_path TEXT NOT NULL,
      converted_at TEXT NOT NULL,
      turn_count INTEGER,
      summarized INTEGER DEFAULT 0,
      summary_model TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_call_mappings (
      conversion_id INTEGER NOT NULL,
      claude_call_id TEXT,
      codex_call_id TEXT,
      tool_name TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

function upsertSession(s) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO sessions
        (id, source, cwd, title, model, started_at, file_path, line_count, turn_count, indexed_at)
      VALUES
        (@id, @source, @cwd, @title, @model, @started_at, @file_path, @line_count, @turn_count, @indexed_at)
    `).run({
      id: s.id,
      source: s.source,
      cwd: s.cwd || null,
      title: s.title || null,
      model: s.model || null,
      started_at: s.started_at || null,
      file_path: s.file_path,
      line_count: s.line_count || 0,
      turn_count: s.turn_count || 0,
      indexed_at: new Date().toISOString(),
    });
  } catch (e) {
    process.stderr.write('[db] upsertSession warning: ' + e.message + '\n');
  }
}

function getSession(id) {
  try {
    const db = getDb();
    // Allow short prefix matching
    if (id.length < 36) {
      return db.prepare('SELECT * FROM sessions WHERE id LIKE ?').get(id + '%');
    }
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  } catch (e) {
    process.stderr.write('[db] getSession warning: ' + e.message + '\n');
    return null;
  }
}

function listSessions(source) {
  try {
    const db = getDb();
    if (source) {
      return db.prepare('SELECT * FROM sessions WHERE source = ? ORDER BY started_at DESC').all(source);
    }
    return db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all();
  } catch (e) {
    process.stderr.write('[db] listSessions warning: ' + e.message + '\n');
    return [];
  }
}

// ─── Conversions ──────────────────────────────────────────────────────────────

function insertConversion(c) {
  try {
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO conversions
        (source_session_id, source_format, target_session_id, target_format, output_path, converted_at, turn_count, summarized, summary_model, notes)
      VALUES
        (@source_session_id, @source_format, @target_session_id, @target_format, @output_path, @converted_at, @turn_count, @summarized, @summary_model, @notes)
    `).run({
      source_session_id: c.source_session_id,
      source_format: c.source_format,
      target_session_id: c.target_session_id,
      target_format: c.target_format,
      output_path: c.output_path,
      converted_at: c.converted_at || new Date().toISOString(),
      turn_count: c.turn_count || 0,
      summarized: c.summarized ? 1 : 0,
      summary_model: c.summary_model || null,
      notes: c.notes ? JSON.stringify(c.notes) : null,
    });
    return result.lastInsertRowid;
  } catch (e) {
    process.stderr.write('[db] insertConversion warning: ' + e.message + '\n');
    return null;
  }
}

function listConversions(limit) {
  try {
    const db = getDb();
    return db.prepare('SELECT * FROM conversions ORDER BY converted_at DESC LIMIT ?').all(limit || 20);
  } catch (e) {
    process.stderr.write('[db] listConversions warning: ' + e.message + '\n');
    return [];
  }
}

function insertToolCallMappings(conversionId, mappings) {
  try {
    const db = getDb();
    const stmt = db.prepare('INSERT INTO tool_call_mappings (conversion_id, claude_call_id, codex_call_id, tool_name) VALUES (?, ?, ?, ?)');
    for (const m of mappings) {
      stmt.run(conversionId, m.claude_call_id || null, m.codex_call_id || null, m.tool_name || null);
    }
  } catch (e) {
    process.stderr.write('[db] insertToolCallMappings warning: ' + e.message + '\n');
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

function getConfig(key) {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : null;
  } catch (e) {
    return null;
  }
}

function setConfig(key, value) {
  try {
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
  } catch (e) {
    process.stderr.write('[db] setConfig warning: ' + e.message + '\n');
  }
}

module.exports = {
  getDb,
  upsertSession,
  getSession,
  listSessions,
  insertConversion,
  listConversions,
  insertToolCallMappings,
  getConfig,
  setConfig,
  DB_PATH,
  OPENANT_DIR,
};

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

// ─── JSONL head-read helpers ──────────────────────────────────────────────────

/**
 * Read the first N lines of a file without loading the whole thing.
 * @param {string} filePath
 * @param {number} maxLines
 * @returns {string[]}
 */
function readHeadLines(filePath, maxLines) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const lines = [];
    let remainder = '';
    let totalRead = 0;

    while (lines.length < maxLines) {
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, totalRead);
      if (bytesRead === 0) break;
      totalRead += bytesRead;
      const chunk = remainder + buf.slice(0, bytesRead).toString('utf8');
      const parts = chunk.split('\n');
      remainder = parts.pop();
      for (const part of parts) {
        if (part.trim()) lines.push(part.trim());
        if (lines.length >= maxLines) break;
      }
    }
    if (remainder.trim() && lines.length < maxLines) lines.push(remainder.trim());
    fs.closeSync(fd);
    return lines;
  } catch (e) {
    return [];
  }
}

/**
 * Count lines in a file efficiently.
 * @param {string} filePath
 * @returns {number}
 */
function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').filter(l => l.trim()).length;
  } catch (e) {
    return 0;
  }
}

// ─── Claude discovery ─────────────────────────────────────────────────────────

/**
 * Parse enough of a Claude JSONL file to get session metadata.
 * @param {string} filePath
 * @returns {Object|null}
 */
function parseClaudeHeader(filePath) {
  const lines = readHeadLines(filePath, 20);
  let sessionId = null;
  let cwd = null;
  let timestamp = null;
  let model = null;
  let turnCount = 0;

  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch (e) { continue; }

    const t = obj.type;
    if (t === 'file-history-snapshot' || t === 'progress' || t === 'system') continue;

    if ((t === 'user' || t === 'assistant') && obj.sessionId) {
      if (!sessionId) sessionId = obj.sessionId;
      if (!cwd) cwd = obj.cwd;
      if (!timestamp) timestamp = obj.timestamp;
    }
    if (t === 'assistant' && obj.message && obj.message.model && !model) {
      model = obj.message.model;
    }
  }

  if (!sessionId) return null;

  // Count actual user/assistant records for turn_count
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch (e) { continue; }
      if ((obj.type === 'user' || obj.type === 'assistant') && !obj.isSidechain) turnCount++;
    }
  } catch (e) { /* use 0 */ }

  return {
    id: sessionId,
    source: 'claude',
    cwd: cwd || '',
    title: null,
    model: model || null,
    started_at: timestamp || null,
    file_path: filePath,
    line_count: countLines(filePath),
    turn_count: turnCount,
  };
}

/**
 * Discover all Claude sessions.
 * @returns {Object[]}
 */
function discoverClaudeSessions() {
  const sessions = [];
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return sessions;

  let projectDirs;
  try {
    projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);
  } catch (e) { return sessions; }

  for (const projectDir of projectDirs) {
    const projectPath = path.join(CLAUDE_PROJECTS_DIR, projectDir);
    let files;
    try {
      files = fs.readdirSync(projectPath);
    } catch (e) { continue; }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(projectPath, file);
      const meta = parseClaudeHeader(filePath);
      if (meta) sessions.push(meta);
    }
  }

  return sessions;
}

// ─── Codex discovery ──────────────────────────────────────────────────────────

/**
 * Parse enough of a Codex rollout JSONL to get session metadata.
 * @param {string} filePath
 * @returns {Object|null}
 */
function parseCodexHeader(filePath) {
  const lines = readHeadLines(filePath, 15);

  let id = null;
  let cwd = null;
  let timestamp = null;
  let model = null;
  let cliVersion = null;
  let turnCount = 0;

  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch (e) { continue; }

    if (obj.type === 'session_meta' && obj.payload) {
      id = obj.payload.id;
      cwd = obj.payload.cwd;
      timestamp = obj.payload.timestamp;
      cliVersion = obj.payload.cli_version;
    }
    if (obj.type === 'turn_context' && obj.payload && obj.payload.model && !model) {
      model = obj.payload.model;
    }
  }

  if (!id) return null;

  // Count user turns for turn_count
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch (e) { continue; }
      if (obj.type === 'response_item' && obj.payload && obj.payload.type === 'message' && obj.payload.role === 'user') {
        turnCount++;
      }
    }
  } catch (e) { /* use 0 */ }

  return {
    id,
    source: 'codex',
    cwd: cwd || '',
    title: null,
    model: model || null,
    started_at: timestamp || null,
    file_path: filePath,
    line_count: countLines(filePath),
    turn_count: turnCount,
    cliVersion: cliVersion || null,
  };
}

/**
 * Discover all Codex sessions.
 * @returns {Object[]}
 */
function discoverCodexSessions() {
  const sessions = [];
  if (!fs.existsSync(CODEX_SESSIONS_DIR)) return sessions;

  function walkDir(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
        const meta = parseCodexHeader(fullPath);
        if (meta) sessions.push(meta);
      }
    }
  }

  walkDir(CODEX_SESSIONS_DIR);
  return sessions;
}

// ─── Unified discovery ────────────────────────────────────────────────────────

/**
 * Discover and index all sessions from both CLIs.
 * @param {'claude'|'codex'|null} source
 * @returns {Object[]}
 */
function discoverAllSessions(source) {
  const sessions = [];
  if (!source || source === 'claude') sessions.push(...discoverClaudeSessions());
  if (!source || source === 'codex') sessions.push(...discoverCodexSessions());
  return sessions;
}

/**
 * Find a session file by ID (full or prefix).
 * @param {string} id
 * @param {'claude'|'codex'|null} source
 * @returns {Object|null}
 */
function findSessionById(id, source) {
  const all = discoverAllSessions(source);
  return all.find(s => s.id === id || s.id.startsWith(id)) || null;
}

module.exports = {
  discoverAllSessions,
  discoverClaudeSessions,
  discoverCodexSessions,
  findSessionById,
  CLAUDE_PROJECTS_DIR,
  CODEX_SESSIONS_DIR,
};

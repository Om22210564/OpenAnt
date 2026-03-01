'use strict';

const crypto = require('crypto');

// ─── Typed Error ────────────────────────────────────────────────────────────

class OpenantError extends Error {
  constructor(message, code, context) {
    super(message);
    this.name = 'OpenantError';
    this.code = code || 'UNKNOWN';
    this.context = context || {};
  }
}

// Error codes
const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',           // exit 2
  PATH_CONFLICT: 'PATH_CONFLICT',   // exit 4
  SUMMARIZE_FAILED: 'SUMMARIZE_FAILED', // exit 3
  PARSE_ERROR: 'PARSE_ERROR',
  DB_ERROR: 'DB_ERROR',
  INVALID_FORMAT: 'INVALID_FORMAT',
  GENERAL: 'GENERAL',
};

// ─── UUID Utilities ──────────────────────────────────────────────────────────

/**
 * Generate a deterministic UUID v5-like from a seed string using sha256.
 * @param {string} seed
 * @returns {string} UUID-formatted string
 */
function deterministicUuid(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),   // version 4 marker
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), // variant
    hash.slice(20, 32),
  ].join('-');
}

/**
 * Generate a random UUID v4.
 * @returns {string}
 */
function randomUuid() {
  return crypto.randomUUID();
}

// ─── Canonical Schema Constructors ───────────────────────────────────────────

/**
 * @typedef {Object} CanonicalBlock
 * @property {string} type - 'text'|'thinking'|'reasoning'|'tool_call'|'tool_result'
 */

/**
 * @typedef {Object} CanonicalTurn
 * @property {string} id
 * @property {string|null} parentId
 * @property {'user'|'assistant'|'system'} role
 * @property {CanonicalBlock[]} blocks
 * @property {string} timestamp
 * @property {Object} meta
 */

/**
 * @typedef {Object} CanonicalSession
 * @property {string} id
 * @property {'claude'|'codex'} source
 * @property {string} cwd
 * @property {string} timestamp
 * @property {string|null} title
 * @property {string|null} model
 * @property {string|null} modelProvider
 * @property {string|null} cliVersion
 * @property {string|null} baseInstructions
 * @property {CanonicalTurn[]} turns
 * @property {Object} meta
 */

function makeSession(overrides) {
  return {
    id: '',
    source: 'claude',
    cwd: '',
    timestamp: new Date().toISOString(),
    title: null,
    model: null,
    modelProvider: null,
    cliVersion: null,
    baseInstructions: null,
    turns: [],
    meta: {},
    ...overrides,
  };
}

function makeTurn(overrides) {
  return {
    id: randomUuid(),
    parentId: null,
    role: 'user',
    blocks: [],
    timestamp: new Date().toISOString(),
    meta: {},
    ...overrides,
  };
}

function makeTextBlock(text) {
  return { type: 'text', text: String(text || '') };
}

function makeThinkingBlock(text, signature) {
  return { type: 'thinking', text: String(text || ''), signature: signature || '' };
}

function makeReasoningBlock(summaryText, encryptedContent) {
  return { type: 'reasoning', summaryText: String(summaryText || ''), encryptedContent: encryptedContent || null };
}

function makeToolCallBlock(callId, toolName, toolKind, input) {
  return { type: 'tool_call', callId, toolName, toolKind: toolKind || 'standard', input: input || {} };
}

function makeToolResultBlock(callId, output, isError) {
  return { type: 'tool_result', callId, output: output || '', isError: Boolean(isError) };
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a CanonicalSession minimally — throw OpenantError if invalid.
 * @param {CanonicalSession} session
 */
function validateSession(session) {
  if (!session || typeof session !== 'object') throw new OpenantError('Session must be an object', ERROR_CODES.INVALID_FORMAT);
  if (!session.id) throw new OpenantError('Session missing id', ERROR_CODES.INVALID_FORMAT);
  if (!Array.isArray(session.turns)) throw new OpenantError('Session.turns must be array', ERROR_CODES.INVALID_FORMAT);
}

module.exports = {
  OpenantError,
  ERROR_CODES,
  deterministicUuid,
  randomUuid,
  makeSession,
  makeTurn,
  makeTextBlock,
  makeThinkingBlock,
  makeReasoningBlock,
  makeToolCallBlock,
  makeToolResultBlock,
  validateSession,
};

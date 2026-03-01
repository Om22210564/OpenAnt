'use strict';

const { OpenantError, ERROR_CODES, makeSession, makeTurn, makeTextBlock } = require('./schema');

const SUMMARIZE_MODEL = 'claude-opus-4-6';
const ESTIMATED_TOKENS_PER_CHAR = 0.25;
const CHUNK_TOKEN_LIMIT = 150000;

/**
 * Estimate token count from text length.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length * ESTIMATED_TOKENS_PER_CHAR);
}

/**
 * Render a CanonicalSession's turns to a readable text for summarization.
 * @param {Object} session
 * @returns {string}
 */
function renderSessionForSummarization(session) {
  const parts = [];
  for (let i = 0; i < session.turns.length; i++) {
    const turn = session.turns[i];
    parts.push('--- Turn ' + (i + 1) + ' [' + turn.role + '] ---');
    for (const block of turn.blocks) {
      switch (block.type) {
        case 'text':
          parts.push(block.text || '');
          break;
        case 'thinking':
          parts.push('[THINKING] ' + (block.text || ''));
          break;
        case 'reasoning':
          parts.push('[REASONING] ' + (block.summaryText || ''));
          break;
        case 'tool_call':
          parts.push('[TOOL_CALL:' + block.toolName + '] ' + JSON.stringify(block.input).slice(0, 500));
          break;
        case 'tool_result':
          parts.push('[TOOL_RESULT:' + block.callId + '] ' + String(block.output || '').slice(0, 500));
          break;
      }
    }
  }
  return parts.join('\n');
}

/**
 * Call the Anthropic API to summarize a conversation chunk.
 * @param {Object} anthropic - Anthropic SDK instance
 * @param {string} content - text to summarize
 * @returns {Promise<string>}
 */
async function callSummarizeApi(anthropic, content) {
  const response = await anthropic.messages.create({
    model: SUMMARIZE_MODEL,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are summarizing a developer coding session for context transfer between AI coding assistants.

Create a structured markdown summary that preserves:
1. The main goal/task being worked on
2. Key decisions made and approaches taken
3. Files created/modified with their purpose
4. Tools used and their outcomes
5. Current state and what was accomplished
6. Any errors encountered and how they were resolved
7. Outstanding issues or next steps

Session content to summarize:
<session>
${content}
</session>

Provide a comprehensive but concise summary that would let a new AI assistant immediately understand the full context and continue the work seamlessly.`,
    }],
  });

  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');
}

/**
 * Summarize a CanonicalSession, replacing all turns with 2 synthetic turns
 * (user + assistant carrying structured markdown summary).
 * @param {Object} session - CanonicalSession
 * @returns {Promise<Object>} - new CanonicalSession with summarized turns
 */
async function summarizeSession(session) {
  // Lazy-load Anthropic SDK
  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk');
  } catch (e) {
    throw new OpenantError(
      '@anthropic-ai/sdk is not installed. Run: npm install @anthropic-ai/sdk',
      ERROR_CODES.SUMMARIZE_FAILED,
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new OpenantError(
      'ANTHROPIC_API_KEY environment variable is not set.',
      ERROR_CODES.SUMMARIZE_FAILED,
    );
  }

  const anthropic = new Anthropic({ apiKey });

  const fullText = renderSessionForSummarization(session);
  const estimatedTokens = estimateTokens(fullText);

  let summaryText;

  if (estimatedTokens > CHUNK_TOKEN_LIMIT) {
    // Chunk the session and summarize in parts
    const chunks = chunkSession(session, CHUNK_TOKEN_LIMIT);
    const chunkSummaries = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = renderSessionForSummarization({ ...session, turns: chunks[i] });
      process.stderr.write('[summarizer] Processing chunk ' + (i + 1) + '/' + chunks.length + ' ...\n');
      try {
        const chunkSummary = await callSummarizeApi(anthropic, chunkText);
        chunkSummaries.push('## Part ' + (i + 1) + '\n\n' + chunkSummary);
      } catch (e) {
        throw new OpenantError('Summarization API call failed: ' + e.message, ERROR_CODES.SUMMARIZE_FAILED);
      }
    }
    summaryText = '# Session Summary (multi-part)\n\n' + chunkSummaries.join('\n\n---\n\n');
  } else {
    try {
      summaryText = await callSummarizeApi(anthropic, fullText);
    } catch (e) {
      throw new OpenantError('Summarization API call failed: ' + e.message, ERROR_CODES.SUMMARIZE_FAILED);
    }
  }

  // Build new session with 2 synthetic turns
  const summarizedSession = makeSession({
    ...session,
    turns: [
      makeTurn({
        role: 'user',
        blocks: [makeTextBlock(
          'Please continue our previous session. Here is the full context of what we accomplished:\n\n' + summaryText
        )],
        meta: { synthetic: true, summaryOf: session.id },
      }),
      makeTurn({
        role: 'assistant',
        blocks: [makeTextBlock(
          'Understood. I have reviewed the session summary and I am ready to continue where we left off.'
        )],
        meta: { synthetic: true, model: SUMMARIZE_MODEL },
      }),
    ],
    meta: {
      ...session.meta,
      summarized: true,
      summaryModel: SUMMARIZE_MODEL,
      originalTurnCount: session.turns.length,
    },
  });

  return summarizedSession;
}

/**
 * Split session turns into chunks that fit within tokenLimit.
 * @param {Object} session
 * @param {number} tokenLimit
 * @returns {Array[]} array of turn arrays
 */
function chunkSession(session, tokenLimit) {
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;

  for (const turn of session.turns) {
    const turnText = renderSessionForSummarization({ ...session, turns: [turn] });
    const turnTokens = estimateTokens(turnText);

    if (currentTokens + turnTokens > tokenLimit && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(turn);
    currentTokens += turnTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [[]];
}

module.exports = { summarizeSession };

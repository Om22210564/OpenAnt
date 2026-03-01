# openant — Test Report

**Run date:** 2026-03-01
**Node.js version:** v20.12.1
**Test framework:** Node.js built-in `node:test` (TAP output)
**Test runner:** `tests/run_tests.js`

---

## Summary

| Metric | Value |
|---|---|
| Total test cases | **164** |
| Passed | **164** |
| Failed | **0** |
| Skipped | **0** |
| Total duration | **3 336 ms** |
| Overall result | **PASS** |

---

## Results by Module

| Test file | Module under test | Tests | Pass | Fail | Time |
|---|---|---|---|---|---|
| `test_schema.js` | `src/schema.js` | 31 | 31 | 0 | 148 ms |
| `test_parsers_codex.js` | `src/parsers/codex.js` | 26 | 26 | 0 | 128 ms |
| `test_parsers_claude.js` | `src/parsers/claude.js` | 23 | 23 | 0 | 132 ms |
| `test_emitters_claude.js` | `src/emitters/claude.js` | 23 | 23 | 0 | 144 ms |
| `test_emitters_codex.js` | `src/emitters/codex.js` | 20 | 20 | 0 | 148 ms |
| `test_roundtrip.js` | Full pipeline (parse→emit→parse) | 15 | 15 | 0 | 146 ms |
| `test_cli.js` | CLI integration (`src/cli.js`) | 26 | 26 | 0 | 2 488 ms |

---

## Detailed Results

### `test_schema.js` — Schema, Types & Utilities (31 tests)

Tests the core building blocks: `OpenantError`, UUID functions, canonical constructors, and validation.

| # | Test | Result |
|---|---|---|
| 1 | OpenantError: has correct name, code, context | PASS |
| 2 | OpenantError: defaults code to UNKNOWN when omitted | PASS |
| 3 | ERROR_CODES: contains all expected keys | PASS |
| 4 | deterministicUuid: same input always produces same output | PASS |
| 5 | deterministicUuid: different inputs produce different UUIDs | PASS |
| 6 | deterministicUuid: output matches UUID format (8-4-4-4-12) | PASS |
| 7 | deterministicUuid: third segment starts with 4 (version marker) | PASS |
| 8 | randomUuid: produces different values each call | PASS |
| 9 | randomUuid: output matches UUID format | PASS |
| 10 | makeSession: has all required fields with defaults | PASS |
| 11 | makeSession: overrides are applied | PASS |
| 12 | makeTurn: has all required fields with defaults | PASS |
| 13 | makeTurn: overrides are applied | PASS |
| 14 | makeTurn: each call generates a unique id | PASS |
| 15 | makeTextBlock: correct shape | PASS |
| 16 | makeTextBlock: coerces non-string to string | PASS |
| 17 | makeTextBlock: null becomes empty string | PASS |
| 18 | makeThinkingBlock: correct shape with signature | PASS |
| 19 | makeThinkingBlock: signature defaults to empty string | PASS |
| 20 | makeReasoningBlock: preserves encryptedContent | PASS |
| 21 | makeReasoningBlock: encryptedContent defaults to null | PASS |
| 22 | makeToolCallBlock: standard kind by default | PASS |
| 23 | makeToolCallBlock: custom kind preserved | PASS |
| 24 | makeToolCallBlock: input defaults to empty object | PASS |
| 25 | makeToolResultBlock: correct shape | PASS |
| 26 | makeToolResultBlock: isError flag set correctly | PASS |
| 27 | makeToolResultBlock: output defaults to empty string | PASS |
| 28 | validateSession: passes for valid session | PASS |
| 29 | validateSession: throws for null | PASS |
| 30 | validateSession: throws when id is missing | PASS |
| 31 | validateSession: throws when turns is not an array | PASS |

---

### `test_parsers_codex.js` — Codex JSONL Parser (26 tests)

Tests the Codex rollout JSONL → CanonicalSession parser using a synthetic fixture with all record types.

| # | Test | Result |
|---|---|---|
| 1 | codex parser: extracts session id from session_meta | PASS |
| 2 | codex parser: extracts cwd from session_meta | PASS |
| 3 | codex parser: extracts timestamp from session_meta | PASS |
| 4 | codex parser: extracts cliVersion from session_meta | PASS |
| 5 | codex parser: extracts modelProvider from session_meta | PASS |
| 6 | codex parser: extracts baseInstructions from session_meta | PASS |
| 7 | codex parser: source is always codex | PASS |
| 8 | codex parser: extracts model from first turn_context | PASS |
| 9 | codex parser: produces at least one user turn | PASS |
| 10 | codex parser: produces at least one assistant turn | PASS |
| 11 | codex parser: user turn from response_item/message/user has text block | PASS |
| 12 | codex parser: reasoning block has summaryText | PASS |
| 13 | codex parser: reasoning block preserves encryptedContent | PASS |
| 14 | codex parser: function_call produces tool_call block with kind=standard | PASS |
| 15 | codex parser: function_call_output produces tool_result block | PASS |
| 16 | codex parser: custom_tool_call produces tool_call block with kind=custom | PASS |
| 17 | codex parser: custom_tool_call_output produces tool_result block | PASS |
| 18 | codex parser: assistant message/role=assistant produces text block | PASS |
| 19 | codex parser: event_msg records are skipped (no extra turns from them) | PASS |
| 20 | codex parser: web_search_call records are skipped | PASS |
| 21 | codex parser: bad JSON lines generate warnings | PASS |
| 22 | codex parser: >20% bad lines generate a high-failure warning | PASS |
| 23 | codex parser: throws on non-existent file | PASS |
| 24 | codex parser: turn_context turn_id becomes assistant turn id | PASS |
| 25 | codex parser: approval_policy stored in turn meta | PASS |
| 26 | codex parser: multiple turn_contexts create multiple assistant turns | PASS |

---

### `test_parsers_claude.js` — Claude JSONL Parser (23 tests)

Tests the Claude Code JSONL → CanonicalSession parser including DFS tree flattening, sidechain filtering, and all block types.

| # | Test | Result |
|---|---|---|
| 1 | claude parser: extracts sessionId | PASS |
| 2 | claude parser: extracts cwd | PASS |
| 3 | claude parser: extracts model from assistant record | PASS |
| 4 | claude parser: modelProvider is anthropic | PASS |
| 5 | claude parser: source is always claude | PASS |
| 6 | claude parser: string content becomes text block | PASS |
| 7 | claude parser: thinking block preserved | PASS |
| 8 | claude parser: tool_use becomes tool_call block with kind=standard | PASS |
| 9 | claude parser: tool_result with array content is concatenated | PASS |
| 10 | claude parser: tool_result with string content is stored as-is | PASS |
| 11 | claude parser: text block in array content preserved | PASS |
| 12 | claude parser: isSidechain:true records are excluded | PASS |
| 13 | claude parser: progress records are excluded | PASS |
| 14 | claude parser: file-history-snapshot records are excluded | PASS |
| 15 | claude parser: system records are excluded | PASS |
| 16 | claude parser: turns are in DFS order (root first) | PASS |
| 17 | claude parser: parentId stored in turn meta | PASS |
| 18 | claude parser: DFS order follows linear chain correctly | PASS |
| 19 | claude parser: children sorted by timestamp ASC | PASS |
| 20 | claude parser: bad JSON lines generate warnings | PASS |
| 21 | claude parser: throws on non-existent file | PASS |
| 22 | claude parser: assistant turn meta contains messageId | PASS |
| 23 | claude parser: assistant turn meta contains stop_reason | PASS |

---

### `test_emitters_claude.js` — Claude JSONL Emitter (23 tests)

Tests CanonicalSession → Claude Code JSONL including CWD encoding, all block type mappings, parentUuid chaining, and file safety.

| # | Test | Result |
|---|---|---|
| 1 | encodeCwdToProjectDir: Windows path with drive colon and backslash | PASS |
| 2 | encodeCwdToProjectDir: produces double-dash after drive letter | PASS |
| 3 | encodeCwdToProjectDir: underscore replaced with dash | PASS |
| 4 | encodeCwdToProjectDir: trailing backslash stripped | PASS |
| 5 | encodeCwdToProjectDir: trailing forward slash stripped | PASS |
| 6 | encodeCwdToProjectDir: forward slashes replaced with dashes | PASS |
| 7 | encodeCwdToProjectDir: empty string returns unknown | PASS |
| 8 | encodeCwdToProjectDir: null returns unknown | PASS |
| 9 | encodeCwdToProjectDir: real fixture path matches real encoded dir name | PASS |
| 10 | emitClaudeSession dry-run: returns outputPath and line count without writing | PASS |
| 11 | emitClaudeSession: single text block → string content | PASS |
| 12 | emitClaudeSession: multiple text blocks → array content | PASS |
| 13 | emitClaudeSession: tool_result on user turn emits tool_result content | PASS |
| 14 | emitClaudeSession: thinking block → thinking in content array | PASS |
| 15 | emitClaudeSession: tool_call block → tool_use in content array | PASS |
| 16 | emitClaudeSession: Codex reasoning → synthetic thinking block | PASS |
| 17 | emitClaudeSession: tool_result on assistant turn → split to user record | PASS |
| 18 | emitClaudeSession: first record has parentUuid=null | PASS |
| 19 | emitClaudeSession: second record parentUuid links to first record uuid | PASS |
| 20 | emitClaudeSession: throws PATH_CONFLICT if file exists without --force | PASS |
| 21 | emitClaudeSession: --force overwrites existing file | PASS |
| 22 | emitClaudeSession: every line is valid JSON | PASS |
| 23 | emitClaudeSession: all records have required Claude fields | PASS |

---

### `test_emitters_codex.js` — Codex JSONL Emitter (20 tests)

Tests CanonicalSession → Codex rollout JSONL including session_meta structure, turn_context ordering, all block type mappings, and file safety.

| # | Test | Result |
|---|---|---|
| 1 | codex emitter: first line is session_meta | PASS |
| 2 | codex emitter: session_meta has correct id (deterministic for claude source) | PASS |
| 3 | codex emitter: session_meta has correct cwd | PASS |
| 4 | codex emitter: session_meta has base_instructions | PASS |
| 5 | codex emitter: session_meta has cli_version | PASS |
| 6 | codex emitter: assistant turn emits turn_context before blocks | PASS |
| 7 | codex emitter: turn_context has model field | PASS |
| 8 | codex emitter: thinking block → response_item/reasoning with summary | PASS |
| 9 | codex emitter: reasoning block (Codex round-trip) preserves encrypted_content | PASS |
| 10 | codex emitter: text block → response_item/message/assistant | PASS |
| 11 | codex emitter: tool_call standard → function_call | PASS |
| 12 | codex emitter: tool_call custom → custom_tool_call | PASS |
| 13 | codex emitter: tool_result standard → function_call_output | PASS |
| 14 | codex emitter: tool_result custom → custom_tool_call_output | PASS |
| 15 | codex emitter: user turn → response_item/message/user | PASS |
| 16 | codex emitter: dry-run does not write file | PASS |
| 17 | codex emitter: throws PATH_CONFLICT if file exists without --force | PASS |
| 18 | codex emitter: --force overwrites existing file | PASS |
| 19 | codex emitter: every emitted line is valid JSON | PASS |
| 20 | codex emitter: all records have timestamp field | PASS |

---

### `test_roundtrip.js` — End-to-End Round-Trip (15 tests)

Tests full pipeline conversion using the real fixture files on disk. Verifies content fidelity across single and double conversions.

| # | Test | Result |
|---|---|---|
| 1 | roundtrip: Codex→Claude yields valid JSONL readable by Claude parser | PASS |
| 2 | roundtrip: Codex→Claude preserves user text content | PASS |
| 3 | roundtrip: Codex→Claude preserves assistant text content | PASS |
| 4 | roundtrip: Codex→Claude preserves tool call names | PASS |
| 5 | roundtrip: Codex→Claude reasoning becomes thinking block in Claude | PASS |
| 6 | roundtrip: Codex→Claude session has correct cwd | PASS |
| 7 | roundtrip: Claude→Codex yields valid JSONL readable by Codex parser | PASS |
| 8 | roundtrip: Claude→Codex preserves user text content | PASS |
| 9 | roundtrip: Claude→Codex preserves assistant text content | PASS |
| 10 | roundtrip: Claude→Codex preserves tool call names | PASS |
| 11 | roundtrip: Claude→Codex thinking block becomes reasoning | PASS |
| 12 | roundtrip: Claude→Codex session_meta id is deterministic | PASS |
| 13 | roundtrip: Claude→Codex baseInstructions omitted when null | PASS |
| 14 | roundtrip: Codex→Claude→Codex text content survives double conversion | PASS |
| 15 | roundtrip: Claude→Codex→Claude text content survives double conversion | PASS |

---

### `test_cli.js` — CLI Integration (26 tests)

Tests the `openant` command-line interface end-to-end using real sessions on disk. Covers all commands, flags, exit codes, and output formats.

| # | Test | Result |
|---|---|---|
| 1 | CLI: openant list exits 0 | PASS |
| 2 | CLI: openant list --json outputs valid JSON array | PASS |
| 3 | CLI: openant list --claude exits 0 | PASS |
| 4 | CLI: openant list --codex exits 0 | PASS |
| 5 | CLI: openant list --json entries have required fields | PASS |
| 6 | CLI: openant inspect Codex session exits 0 | PASS |
| 7 | CLI: openant inspect Claude session exits 0 | PASS |
| 8 | CLI: openant inspect --json outputs valid JSON session | PASS |
| 9 | CLI: openant inspect shows turn count | PASS |
| 10 | CLI: openant inspect nonexistent session exits 2 | PASS |
| 11 | CLI: openant inspect shows source field | PASS |
| 12 | CLI: openant import claude (Codex→Claude) --dry-run exits 0 | PASS |
| 13 | CLI: openant import codex (Claude→Codex) --dry-run exits 0 | PASS |
| 14 | CLI: openant import --dry-run shows output path | PASS |
| 15 | CLI: openant import --dry-run shows turn count | PASS |
| 16 | CLI: openant import invalid format exits 1 | PASS |
| 17 | CLI: openant import nonexistent session exits 2 | PASS |
| 18 | CLI: openant import claude writes valid JSONL file | PASS |
| 19 | CLI: openant import codex writes valid JSONL file | PASS |
| 20 | CLI: import codex --output: PATH_CONFLICT exits 4 without --force | PASS |
| 21 | CLI: import --force overwrites conflict file | PASS |
| 22 | CLI: openant status exits 0 | PASS |
| 23 | CLI: openant status shows DB path | PASS |
| 24 | CLI: openant status shows session counts | PASS |
| 25 | CLI: openant --help exits 0 | PASS |
| 26 | CLI: openant --help mentions all commands | PASS |

---

## Coverage Map

The following behaviour areas are exercised by the test suite:

| Area | Tests covering it |
|---|---|
| OpenantError typed errors | test_schema #1–2 |
| Deterministic UUID generation | test_schema #4–7 |
| Random UUID generation | test_schema #8–9 |
| Session/Turn/Block constructors | test_schema #10–27 |
| Schema validation | test_schema #28–31 |
| Codex session_meta parsing | test_parsers_codex #1–7 |
| Codex model extraction from turn_context | test_parsers_codex #8 |
| Codex turn structure (user / assistant) | test_parsers_codex #9–11 |
| Codex reasoning with encryptedContent | test_parsers_codex #12–13 |
| Codex standard tool call/result | test_parsers_codex #14–15 |
| Codex custom tool call/result | test_parsers_codex #16–17 |
| Codex assistant text messages | test_parsers_codex #18 |
| Codex event_msg / web_search skip | test_parsers_codex #19–20 |
| Codex malformed JSONL error handling | test_parsers_codex #21–23 |
| Codex turn_context metadata | test_parsers_codex #24–26 |
| Claude session metadata | test_parsers_claude #1–5 |
| Claude string content | test_parsers_claude #6 |
| Claude thinking blocks | test_parsers_claude #7 |
| Claude tool_use / tool_result | test_parsers_claude #8–10 |
| Claude text array blocks | test_parsers_claude #11 |
| Claude sidechain / progress / system filtering | test_parsers_claude #12–15 |
| Claude DFS tree flattening | test_parsers_claude #16–19 |
| Claude malformed JSONL error handling | test_parsers_claude #20–21 |
| Claude turn metadata (messageId, stop_reason) | test_parsers_claude #22–23 |
| CWD → project dir encoding | test_emitters_claude #1–9 |
| Claude emitter dry-run | test_emitters_claude #10 |
| Claude user turn content shapes | test_emitters_claude #11–13 |
| Claude assistant block mappings | test_emitters_claude #14–17 |
| Claude parentUuid linear chain | test_emitters_claude #18–19 |
| Claude file conflict / --force | test_emitters_claude #20–21 |
| Claude JSONL validity | test_emitters_claude #22–23 |
| Codex session_meta emission | test_emitters_codex #1–5 |
| Codex turn_context ordering | test_emitters_codex #6–7 |
| Codex thinking/reasoning block mapping | test_emitters_codex #8–9 |
| Codex text/message emission | test_emitters_codex #10 |
| Codex tool call/result mapping (standard+custom) | test_emitters_codex #11–14 |
| Codex user turn emission | test_emitters_codex #15 |
| Codex file conflict / --force | test_emitters_codex #16–18 |
| Codex JSONL validity | test_emitters_codex #19–20 |
| Codex→Claude full pipeline | test_roundtrip #1–6 |
| Claude→Codex full pipeline | test_roundtrip #7–13 |
| Double round-trip fidelity (×2 conversions) | test_roundtrip #14–15 |
| CLI list command | test_cli #1–5 |
| CLI inspect command | test_cli #6–11 |
| CLI import dry-run | test_cli #12–15 |
| CLI import error codes | test_cli #16–17 |
| CLI import real conversion | test_cli #18–19 |
| CLI import conflict / --force | test_cli #20–21 |
| CLI status command | test_cli #22–24 |
| CLI --help | test_cli #25–26 |

---

## Test Infrastructure

| File | Purpose |
|---|---|
| `tests/fixtures/codex_sample.jsonl` | Synthetic Codex rollout covering all record types: session_meta, developer message, user message, turn_context, reasoning, function_call, function_call_output, custom_tool_call, custom_tool_call_output, assistant message, event_msg, web_search_call |
| `tests/fixtures/claude_sample.jsonl` | Synthetic Claude JSONL covering: string content, thinking blocks, tool_use, tool_result (array and string), progress, file-history-snapshot, system, isSidechain records |
| `tests/run_tests.js` | Runner: spawns each test file with `--test`, collects TAP output, writes `results.json` |
| `tests/results.json` | Machine-readable results (generated, not committed) |

---

## How to Run

```bash
# Run all tests
cd openant
node tests/run_tests.js

# Run a single test file
node --test tests/test_schema.js
node --test tests/test_parsers_codex.js
node --test tests/test_parsers_claude.js
node --test tests/test_emitters_claude.js
node --test tests/test_emitters_codex.js
node --test tests/test_roundtrip.js
node --test tests/test_cli.js
```

No additional packages are required — tests use only Node.js built-ins (`node:test`, `node:assert`) and the project's own `dependencies`.

---

*Generated by `tests/run_tests.js` on 2026-03-01.*

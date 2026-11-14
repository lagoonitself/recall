# P5 · LLM provider layer

## Goal
One interface for every LLM call (`streamTurn` for the agent, `describe` for ingestion), a `FakeProvider` for tests, and one real adapter once the LLM is chosen.

## Starts after
P0 merged. **The real adapter is blocked until the user chooses the LLM** (see DECISIONS.md → Pending). Build the interface and `FakeProvider` first; that unblocks P4 and P7.

## Done when
- [ ] `server/src/agent/provider/types.ts`: `LlmProvider`, `ModelCapabilities`, `ProviderEvent`, `AgentMessage`, `MediaPart`, `ToolDefinition`, `PieceDescription` (Zod) exactly as ARCHITECTURE §5.3.
- [ ] `FakeProvider`: replays scripted event sequences from JSON fixtures; `describe` returns fixed descriptions. Selected with `LLM_PROVIDER=fake`.
- [ ] `capabilities.ts`: table keyed by model id; unknown models default to text + image only.
- [ ] `index.ts`: `getProvider()` picks the adapter from `LLM_PROVIDER`.
- [ ] Contract test suite that any adapter must pass (streams text, streams reasoning when supported, emits tool calls with parsed args, returns `providerState`, `describe` returns valid JSON per piece).
- [ ] **After the LLM decision:** real adapter (likely OpenRouter, OpenAI-compatible): streaming chat completions with tools, `reasoning` enabled, maps `delta.reasoning` / `reasoning_details` → `reasoning.delta`, passes `providerState` back unchanged, media parts per capability (image_url, file for PDF, input_audio, video where supported), throttle + retry like P3.
- [ ] HANDOFF.md updated; capability table filled for the chosen models; DECISIONS.md entry for the choice.

## Scope
`server/src/agent/provider/**`.

## Provides / uses
- **Provides:** `getProvider()`, `capabilities(model)`, fixtures used by P7 and P9 (export a recorded SSE fixture for the frontend).
- **Uses:** P0 config, P3 `throttle()`.

## Steps
1. Types + Fake + contract tests (unblocks P4/P7).
2. Wait for LLM decision; in the meantime nothing else here.
3. Real adapter + capability entries; run contract tests against the live API once (small cost).

## Tests
- Contract suite passes for Fake (always) and the real adapter (live, opt-in with `LIVE=1`).
- Tool-call arguments that arrive in several chunks are joined and parsed correctly.

## Skills
`prompt-engineering-patterns`, `testing-strategy`, `system-design`

## Watch out
- Some models need reasoning/thought state sent back on the next turn or tool calls fail; that's what `providerState` is for.
- Not every model streams reasoning; the UI must work without it.
- Never put the API key in logs or error messages.

## Architecture
§1.6, §4.3, §5.2, §5.3, §5.4, §15

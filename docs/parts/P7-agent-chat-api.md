# P7 · Agent loop + chat API

## Goal
The chat endpoint: take a message with attachments, run the agent loop with the three tools, stream every step and the cited answer over SSE, and save it all.

## Starts after
P2 (R2), P5 (interface + Fake), P6 (search) merged. Works with `LLM_PROVIDER=fake` before the real adapter exists.

## Done when
- [ ] Conversations routes: `GET/POST /api/conversations`, `GET /api/conversations/:id` (messages with steps and sources).
- [ ] `POST /api/conversations/:id/messages`: Multer (memory, ≤ 3 files, ≤ 20 MB total), MIME check, video ≤ 80 s via ffprobe, attachments to R2 under `users/{u}/attachments/{messageId}/`, user message saved.
- [ ] SSE writer: headers + heartbeat + no compression per §8; writes events validated by `@app/shared` schemas; stops on client disconnect.
- [ ] Agent loop (`server/src/agent/loop.ts`): max 6 rounds; history + system prompt + tools; maps `ProviderEvent`s to SSE steps; stores `providerState`.
- [ ] Tools:
  - [ ] `search_library` → P6; assigns stable `S#` ids per turn; result summary + items.
  - [ ] `open_sources` (≤ 4) → fetch pieces from R2 and attach as media parts per capability, else fallback (thumb + transcript/description).
  - [ ] `list_files`.
- [ ] System prompt (`prompt.ts`) implements §5.6, including the untrusted-content rule.
- [ ] Citation check: drop `[S#]` not returned by a tool; `sources` event lists only cited sources with signed thumb URLs.
- [ ] Message, steps (with timings) and sources saved in one transaction at the end (and partial save on error/disconnect).
- [ ] `CHAT_PER_MIN` rate limit per user.
- [ ] Tests pass with FakeProvider; HANDOFF.md updated.

## Scope
`server/src/agent/{loop,tools,prompt,sse}.ts`, `server/src/routes/conversations.ts`.

## Provides / uses
- **Provides:** the SSE stream P9 renders; a recorded real stream saved to `client/src/mocks/fixtures/` for P9.
- **Uses:** P2, P5, P6, `@app/shared` SSE schemas.

## Steps
1. Conversations CRUD.
2. SSE writer + loop with Fake script "search → open → answer".
3. Tools for real (search, open, list).
4. Attachments + search by attachment.
5. Citation check + persistence + rate limit.

## Tests
- Fake script runs end to end; the SSE output matches the shared schemas event by event.
- A fake answer citing `[S9]` that was never returned → `S9` removed.
- Disconnect mid-stream → partial message saved, no crash.
- Prompt-injection fixture (a text file saying "ignore previous instructions…") doesn't change the answer rules (manual check with the real model).

## Skills
`prompt-engineering-patterns`, `grill-edge-cases`, `grill-security`, `testing-strategy`

## Watch out
- Tool args from the model are untrusted: validate with Zod, clamp `limit`, ignore unknown `source_ids`.
- Scope every tool query by the current user and the conversation's collection.
- Media in `open_sources` adds tokens fast; send pieces, never originals.

## Architecture
§5 (all), §6, §8

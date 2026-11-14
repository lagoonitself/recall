# P9 · Frontend: chat

## Goal
The chat screen: compose with text, photo, voice and video; watch the agent work live in the activity log; read the cited answer; open each source at the exact page or second.

## Starts after
P0 merged (contract) and the P8 shell. Built first against a recorded SSE fixture (`client/src/mocks/fixtures/chat-*.sse`); switched to the real API when P7 is merged.

## Done when
- [ ] `lib/sse.ts`: POST with `fetch`, read `ReadableStream`, parse SSE frames (incl. multi-line data, comments/heartbeats), validate each with `@app/shared`, abort with `AbortController`.
- [ ] `/chat` and `/chat/:conversationId`: conversation list, new chat, collection picker (or "all collections").
- [ ] `Composer`: text, up to 3 attachments (≤ 20 MB total), photo picker, **voice recording** (MediaRecorder, timer, cancel), video file (≤ 80 s check), HEIC → JPEG, attachment chips with remove.
- [ ] `ActivityLog`: collapsible, live; one row per step with icon by kind (reasoning, tool call, result, sources opened); reasoning text streams in; tool args shown compactly; header shows step count and total time.
- [ ] Answer renders markdown, streams in, `[S#]` become clickable chips that open the matching source.
- [ ] `SourceCard` viewers: PDF page (pdf.js, page thumb first), `<video>`/`<audio>` that starts at `start_sec`, image lightbox, text with the passage highlighted.
- [ ] Reloading `/chat/:id` shows saved messages with their activity logs and sources.
- [ ] Error and stop states: stop button aborts the stream; `error` event shows a retry.
- [ ] Works at 375 px; keyboard reachable; screen-reader labels on icon buttons; live region for streaming text is polite.
- [ ] HANDOFF.md updated.

## Scope
`client/src/pages/Chat.tsx`, `client/src/components/{Composer,ActivityLog,SourceCard,viewers/**,MessageList}.tsx`, `client/src/lib/sse.ts`, `client/src/mocks/fixtures/**`.

## Provides / uses
- **Provides:** the main demo screen.
- **Uses:** P8 shell + API client; P7 SSE stream; `@app/shared` SSE schemas.

## Steps
1. SSE reader + fixture playback.
2. ActivityLog + answer rendering.
3. Source cards + viewers.
4. Composer with recording and attachments.
5. Real API.

## Tests
- Vitest: SSE parser on split chunks, multi-line data, heartbeats; ActivityLog renders a fixture to the expected steps.
- Manual: voice note recorded in Chrome and Safari uploads with a supported MIME type.

## Skills
`frontend-design`, `vercel-react-best-practices`, `vercel-composition-patterns`, `emil-design-eng`, `vercel-react-view-transitions`, `ux-copy`, `accessibility-review`, `web-design-guidelines`

## Watch out
- `EventSource` can't POST; use `fetch`.
- Safari's MediaRecorder produces `audio/mp4`, Chrome `audio/webm`; both must be accepted by the server (if `shared/` needs a change, open a contract PR).
- Signed media URLs expire in 10 min; refetch on error instead of caching forever.
- Don't re-render the whole message list on every token; append to the streaming message only.

## Architecture
§5.4, §5.5, §8 (stream events), §9

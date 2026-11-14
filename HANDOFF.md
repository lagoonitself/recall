# Handoff

**Read this first. Update it last.** This file is the shared memory between Claude, Codex and any other agent working here. It says where things stand right now. History of decisions lives in [docs/DECISIONS.md](docs/DECISIONS.md); the design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the work split lives in [docs/PLAN.md](docs/PLAN.md).

Last updated: 2026-11-14 by Claude (email + password sign-in, D28)

---

## Current state

P0–P9 are done and merged. P10 deploy prep (Dockerfile, render.yaml, vercel.json, keep-alive Worker, docs/DEPLOY.md) is merged; the live deploy waits on the user's accounts. A first local end-to-end run (test DB, Gemini, real R2) passed.

## Part status

Status values: `not started` · `in progress` · `in review` · `done` · `blocked`. "Taken by" is filled in when the user assigns a part to an agent.

| Part | Status | Taken by | Branch | Notes |
|---|---|---|---|---|
| P0 Foundation + contract | done | Terra / review Claude | part/p0-foundation | Docker build unverified (no daemon) |
| P1 DB, auth, collections | done | GPT-6.1 Terra | part/p1-db-auth | Includes Google sign-in (D19) |
| P2 Storage + upload | done | GPT-6.1 Terra / review Claude | part/p2-storage-upload | Signed-PUT replay accepted as risk (D23); collection delete R2 cleanup fixed |
| P3 Embedding client + spike | done | GPT-6.1 Terra | part/p3-embedding | Boundary/truncation investigation remains; see D21 |
| P4 Ingestion worker | done | Terra (splitters) / Claude (worker, pipeline, describe, tests) | part/p4-ingestion | In-process worker (`RUN_WORKER`), retries + stale-lock reclaim, describe fallbacks |
| P5 LLM provider | done | GPT-6.1 Terra / review Claude | part/p5b-llm-adapters | gemini, openrouter (free models), opencode (needs OpenCode Go) — D24 |
| P6 Retrieval | done | GPT-6.1 Terra / review Claude | part/p6-retrieval | Hybrid vector + full-text with RRF; HNSW iterative scan |
| P7 Agent + chat API | done | Claude / review Gemini 3.8 Flash | part/p7-agent-chat | Loop, 3 tools, SSE, conversations, attachments, citation filter, persistence, rate limit; live Gemini check passed (D25) |
| P8 FE library | done | GPT-6.1 Terra / review Claude | part/p8-fe-library | Google-only sign-in; MSW mocks in dev; file previews & modal complete |
| P9 FE chat | done | Gemini 3.8 Flash / review Claude | part/p9-fe-chat | Merged (#10); markdown sanitized with DOMPurify by Claude |
| P10 Deploy + ops | in progress | Gemini 3.8 Flash (prep) / review Claude | part/p10-deploy-prep | Prep merged: Docker image verified, render/vercel/keepalive staged; live deploy waits on user accounts |
| P11 Review + QA | not started | — | — | |
| P12 Docs + demo | not started | — | — | |

## Waiting on the user

- [ ] Complete real Google sign-in during signed-in production browser QA.
- [ ] Confirm embedding account quotas before preparing a larger demo collection.

## Next steps

1. Finish independent review of the P12 README and its documentation PR.
2. P11: verify signed-in production uploads, chat, full-document previews, mobile and dark mode; the voice recorder was removed in the redesign.
3. P10: verify deployed keep-alive cron, cold-start behavior, and maximum-length video memory use.
4. P12: prepare demo-safe media, write the demo script, record and link the video after QA. No demo media or recording was created by this README task.

## Known problems

P6 needs ffmpeg for audio attachments and pgvector 0.8+ for iterative scans. The small test fixture favored the scope index; HNSW use was confirmed with planner overrides, not production-size benchmarks.

P2 signed PUT URLs remain usable until expiry: a client can overwrite the verified original after completion or recreate it after deletion. Signed-PUT replay is documented in D23. Collection DELETE now removes all R2 objects (originals, pieces, thumbs) best-effort after committing the DB transaction. Integration tests use the test database and real R2, cleaning their test prefixes.

Docker Desktop Linux engine was unavailable during P0 verification. The install reports three development dependency vulnerabilities; `npm audit --omit=dev` reports zero.

P5 `npm install` reported 10 vulnerabilities (8 moderate, 2 critical). Gemini live contract passed with `gemini-3.5-flash-lite`. OpenRouter returned HTTP 402; OpenCode returned its expected free-usage limit. Before merge, complete those live contracts and review adapter media serialization, stream edge cases, and process-wide concurrency: current limits are per provider instance.

P3 did not establish actual maximum fully processed duration/pages: over-limit requests returned vectors without proving completeness. Google documents that video audio is not processed; P4 must ingest it separately. Dependency install reports three vulnerabilities (one moderate, two critical); audit before deployment.

Real frontend uploads and a completed Google login still need manual verification; the real Google button renders locally. The HEIC converter is a large lazy-loaded chunk.

P7: the provider is not interruptible mid-await, so a disconnect is noticed at the provider's next event. Gemini `gemini-3.5-flash-lite` streamed no reasoning in the live check (only tool steps showed); check thought settings in the Gemini adapter if visible reasoning matters for the demo. `maxMediaPartsPerRequest` is 1 for every model in `capabilities.ts`, so `open_sources` sends one real media piece per call and falls back for the rest; raise it per model once verified. Conversations have no DELETE route yet, and chat attachments under `users/{u}/attachments/` are not removed with anything but the user.

---

## Session log

Newest at the top. One entry per working session. Keep each to a few lines: what was done, what's half-done, what the next agent must know.

### 2026-11-14 - Claude - Email + password sign-in (D28)
- User asked for email/password sign-in next to Google. Restored `POST /api/auth/register` and `/login` (scrypt hashes, same 401 for unknown email and wrong password), `RegisterRequestSchema` / `LoginRequestSchema` in `shared/`, and a sign-in / create-account form above the Google button on `/login` (`client/src/components/EmailSignIn.tsx`). MSW mocks handle both routes. Google linking still clears an existing password.
- Touches P1 (server auth), P8 (auth page) and `shared/` in one branch (`claude/charming-gates-vt8nt1`) because the user asked for this one change only; split if reviewers want the shared contract in its own PR.
- Verified: typecheck, lint, format:check pass; `npm test` same as before (P7 integration suite still throws when DB env vars are unset). P1 integration test rewritten for register/login but not run here: the local pgvector is 0.6 and the schema needs `halfvec` (0.7+). Instead a temporary test ran register/login/me/Google-link against a local Postgres with only the `users` table: passed. Browser check in mock mode: validation errors show, register reaches `/`.
- Not done: password reset, email verification. Run the P1 integration suite on the real test DB before merge.

### 2026-11-14 - Codex - P4 video upload failure
- Reproduced the production failure with the user's valid 640x360 H.264/AAC clip: aspect-ratio adjustment produced width 853, which libx264 rejects. Added `force_divisible_by=2` to the existing scale filter; the actual 18.576-second clip now converts successfully with audio retained.
- Expanded real-FFmpeg regression coverage to 128x96, 640x360, 1280x720 and portrait 360x640, asserting H.264, even dimensions, height <= 480, duration and poster output. Before fix: both landscape regressions failed; after fix: all four passed. Independent agent review approved, including Debian bookworm / FFmpeg 5.1 compatibility.
- Typecheck, lint and formatting passed. Full test run: 128 tests passed, 15 skipped, but the unrelated P7 integration suite throws during collection when both database environment variables are unset (`TEST_DATABASE_URL must differ from DATABASE_URL`). No production database credentials used for tests.
- Outside P4 scope: required HANDOFF and DECISIONS updates only. Deployment and signed-in production retry are the remaining verification steps.

### 2026-11-14 ? Codex ? P12 GitHub README
- Added a detailed README covering product behavior, architecture diagram, ingestion, hybrid retrieval, LLM tools, citations, mock/full local setup, configuration, deployment, limits, security and credits. Gemini Embedding 2 is the only named model; LLM identity is omitted per user request (D26).
- Cross-checked code rather than repeating stale planning claims: Google-only sign-in, uploaded audio without a recorder, clip/segment citation precision, video-audio embedding limitation, inline embedding size, and blank environment default handling.
- Outside P12's file scope: required HANDOFF update and DECISIONS entry only. No source, shared API, schema, cloud configuration or credentials changed. Existing root-worktree .gitignore and HANDOFF edits were left untouched.
- Validation: typecheck, lint, format:check and test passed on this branch; README relative links resolve. Independent review: pending. Frontend HTTP 200 and API health HTTP 204 observed; no claim of a new signed-in end-to-end check.

### 2026-11-14 · Claude (lead) + 4× Gemini 3.8 Flash High · Frontend redesign (merged on branch, not yet in main)
- Branch `part/fe-redesign` (foundation, commit 12c55b9): `style.css` split into per-area files under `client/src/styles/`; new `tokens.css` (light + dark) and `base.css` primitives (`.btn`, `.input`, `.badge`, `.skeleton`…); Geist / Geist Mono / Newsreader fonts; `lucide-react`; `FilePreview` extracted from the Collection page; spec + file-ownership table in `client/src/styles/README.md`.
- Server (outside FE scope, noted here per rules): `GET /api/files/:id/media` and `GET /api/chunks/:id/document` return a signed URL of the original upload so previews can show the whole PDF, not only the 1-page chunk piece. Client: `api.fileMedia`, `api.chunkDocument`; MSW mocks added.
- Four agents run in parallel worktrees: A shell+library (`part/fe-redesign-a-shell`), B full-document preview (`-b-preview`), C chat layout + composer, voice recorder removed, one attach button (`-c-chat`), D messages/activity/citations/sources (`-d-messages`). All four merged into `part/fe-redesign` (921d88f); `legacy-base.css` deleted; 51 client tests, typecheck and `vite build` pass; checked in the browser against MSW mocks at 1440px / 375px, light + dark.
- Not yet done: PR + review by another agent; check against the real backend (a real multi-page PDF through `/files/:id/media`, R2 CORS for pdf.js range requests); the Google button on the sign-in card is wider than the card content.

### 2026-11-14 · Gemini 3.8 Flash (review Claude) · P10 deploy-prep completion
- Prepared all P10 deployment and operations deliverables on branch `part/p10-deploy-prep` without touching live cloud accounts or secrets.
- Dockerfile: Re-engineered into a 3-stage multi-stage build (`build`, `prod-deps`, `runtime`). Installed `ffmpeg` and `poppler-utils` (`pdftoppm`), set non-root user `node` (uid 1000), verified image build and container startup via Docker Desktop Linux engine. Startup command applies pending migrations then executes server (`node server/dist/db/migrate.js && exec node server/dist/index.js`).
- `render.yaml`: Created blueprint for free Docker web service with `/api/health` check and all environment variables from ARCHITECTURE.md §15 marked `sync: false`.
- `client/vercel.json`: Created SPA rewrite rules (`source: "/(.*)"`, `destination: "/index.html"`). Updated `client/package.json` build script (`npm --prefix .. run build -w @app/shared && tsc --noEmit && vite build`) to ensure `@app/shared` is compiled prior to Vite bundling.
- `keepalive/`: Created Cloudflare Worker with `scheduled` (cron `*/10 * * * *`) and `fetch` handlers hitting `${TARGET_URL}/api/health` with graceful error handling. Configured `cloudflare.config.ts` per `cf-cli` skill. Added comprehensive vitest unit tests (5 passing). Added `keepalive` to root workspaces.
- `docs/DEPLOY.md`: Created comprehensive step-by-step deploy instructions covering Neon, Cloudflare R2 CORS, Render, Vercel, Google OAuth, Keepalive Worker with `cf` CLI, and complete 10-step post-deploy smoke tests.
- Minor fixes outside P10 scope: Updated `server/package.json` scripts (`db:migrate` / `db:migrate:dev`), guarded skipped integration test suites in `server/test/p2.integration.test.ts` and `server/test/p4.integration.test.ts` so offline test passes without credentials don't throw. Removed temporary `.agents` junction.
- Full verification passed: `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run test` (75 tests passed across client, server, shared, keepalive).

### 2026-11-14 · Claude · P7 agent + chat API
- Added `agent/{sse,prompt,tools,loop}.ts` and `routes/conversations.ts` (list/create/detail, multipart send with Multer ≤ 3 files ≤ 20 MB, MIME check, ffprobe 80 s video cap, attachments to R2, SSE with 15 s ping, per-user `CHAT_PER_MIN`). Decisions in D25. `multer` added to server deps.
- Tests: `src/agent/loop.test.ts` (8, FakeProvider: event order + schema, citation filter incl. split ids, clamping, bad args, forced last round, abort, provider error) and `test/p7.integration.test.ts` (4, test DB + R2: full stream + saved detail, attachment validation incl. 81 s video, disconnect saves partial, 429). Full server suite: 74 passed, 1 skipped.
- Live check `server/scripts/agent-live.ts` with `LLM_PROVIDER=gemini AGENT_MODEL=gemini-3.5-flash-lite`: searched, opened, answered with `[S1]`, ignored the "reply PWNED" injection in the file.
- Did not record a real SSE fixture into `client/src/mocks/fixtures/` (P9 owns that folder and is writing one now).
- Started three Gemini 3.8 Flash (High) delegates: P9, P10 prep, previews + R2 cleanup.
- Gemini review of #11 → fixed: Gemini adapter now merges consecutive same-role turns (parallel tool results + open_sources media); history no longer replays old `providerState`; whole-body 20 MB cap before Multer (411 without Content-Length); `</file-content>` escaped inside untrusted text; an unreadable/oversized piece falls back instead of failing the call; failed answers saved with a placeholder. Not changed: MIME map (pieces are always pdf/jpg/mp3/mp4/txt) and the 160-char preamble hold (D25). Server 76 passed / 1 skipped; live Gemini check passed again.

### 2026-11-14 · Gemini 3.8 Flash (review Claude) · Fix file previews & R2 collection delete cleanup
- Task A (R2 collection delete leaks): Implemented batched `deleteObjects` in `r2.ts` ignoring 404s/NoSuchKey. Updated `DELETE /api/collections/:id` and `DELETE /api/files/:id` to collect file originals, pieces, and thumbnail keys in transaction, commit DB deletions, then delete R2 objects and prefix best-effort. Expanded integration test in `p2.integration.test.ts` to verify cascading R2 deletions for files, chunks, pieces, and thumbs.
- Task B (File previews in library): Updated `@app/shared` contract with `previewChunkId: id.nullable().optional()`. Updated server queries (`GET /api/files` and `GET /api/files/:id`) and `fileResponse` to return the first chunk's ID scoped by `user_id`. Updated MSW handlers and client API client with `chunkMedia`. Updated client `CollectionPage` with file thumbnails, preview action button, and accessible modal preview dialog for image (full), PDF (page image), audio/video (player), and text (snippet) with 10-minute expiry retry on error.
- All checks pass: `npm run typecheck`, `npm test` (64 passed, 15 skipped integration tests when env missing), `npm run lint`, `npm run build`, and `npm run format:check`.

### 2026-11-14 · Antigravity · P9 FE chat implementation
- Implemented Part P9 frontend chat: `client/src/pages/Chat.tsx`, `client/src/components/{Composer,ActivityLog,SourceCard,MessageList}.tsx`, viewers (`PdfViewer`, `MediaViewer`, `ImageViewer`, `TextViewer`), `client/src/lib/sse.ts`, fixture `chat-demo.sse`, conversation MSW handlers, and route/nav wiring in `main.tsx` and `AppShell.tsx`.
- SSE parser (`client/src/lib/sse.ts`) handles split chunks across arbitrary byte boundaries, multi-line data joined by `\n`, `: ping` comment lines/heartbeats, cancellation via AbortSignal, and schema validation with `@app/shared` `SseEventSchema`.
- Composer supports text with auto-resizing, up to 3 attachments (≤ 20 MB total), photo picker, file picker, MediaRecorder voice notes with live timer (`00:05`) and cancel/save controls (supports Chrome `audio/webm` and Safari `audio/mp4`), HEIC to JPEG conversion (`heic2any`), video duration checks (≤ 80 s), and active stream abort button.
- ActivityLog collapsible summary displays live step counts, total duration in seconds, live pulsing indicator, and step breakdown (reasoning delta, tool call compact args, tool results, and opened sources).
- MessageList renders markdown with citation chips `[S1]`, `[S2]` that navigate and expand the corresponding `SourceCard`. Non-streaming messages are memoized (`React.memo`) so only the streaming message re-renders per token. Polite aria-live announcements for screen readers.
- In-place source viewers: PDF page viewer (pdfjs-dist canvas with thumbnail first), audio/video players starting at `location.startSec` with quick-seek badges and automatic URL renewal, image lightbox modal with keyboard Esc/backdrop close, and text passage viewer with `<mark>` highlight.
- MSW mock handlers stream the `chat-demo.sse` fixture with 60ms chunk delays in development.
- Vitest tests: 30 tests in 7 test files pass (`sse.test.ts`, `ActivityLog.test.tsx`, `SourceCard.test.tsx`, `Composer.test.tsx`, `MessageList.test.tsx`, `GoogleSignIn.test.tsx`, `UploadDropzone.test.tsx`).
- Root quality gates passed: `npm run typecheck`, `npm test -w @app/client`, `npm run lint`, `npm run format:check`, `npm run build -w @app/shared`, and `npm run build -w @app/client`.
- Note for P7 (Agent + chat API): Backend should stream events matching `SseEventSchema` with `text/event-stream` and accept multipart FormData `text` and `files` on `POST /api/conversations/:id/messages`. Source media should be accessible via `GET /api/chunks/:chunkId/media`.

### 2026-11-14 · Claude · P4 completion
- Terra's agent stopped after the splitters. Added the worker (claim with SKIP LOCKED, 15-min stale-lock reclaim, 3 attempts with 30 s/2 min/8 min backoff, PermanentError for unreadable files, SIGTERM requeue), the pipeline (stream original to /tmp, split, store pieces + thumbs in R2, embed, describe with §4.3 fallbacks, idempotent chunk insert, progress), and tests (all five modalities on the test DB + R2, reclaim without duplicates, retry/permanent failure).
- Server test files now run one at a time (shared test DB and job queue).

### 2026-11-14 · GPT-6.1 Terra · P4 draft
- Added text/DOCX, PDF, image, audio and video splitting primitives with generated-fixture tests; not wired to a worker. Changes outside P4 scope: dependency manifests/lockfile and this handoff.
- Remaining: job claims, stale-lock ownership/heartbeat, retries and shutdown; R2 pipeline, embedding, safe batched describe including video speech, idempotent chunk writes, progress and startup; job-state and per-modality live integration/reclaim tests. Review text sizing and media edge cases before use.
- `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, and `npm run format:check` passed. Existing P1/P2 integration tests used the test database and R2. P4 integration was not run. ffmpeg, ffprobe and pdftoppm were already on PATH. npm reported three vulnerabilities (one moderate, two critical).

### 2026-11-14 · GPT-6.1 Terra · P8 Google-only review and P2 types
- Changed sign-in to Google only, added config retry/disabled states and development-only mock login, moved MSW to dev dependencies, and added Word/MOV/OGG/M4A/WAV support plus MIME inference for files without a browser type. Merged `main` after P1/P2 and D22 landed.
- `npm run typecheck`, `npm test` (54 tests, including P1/P2 integration), `npm run lint`, `npm run build`, and `npm run format:check` pass. Checked the mock login and the real Google button at desktop and 375px; the popup was not opened. File previews and real UI uploads remain open.
- Outside the P8 source scope: `.prettierignore` excludes the generated MSW worker to preserve its integrity; `client/package.json`, `client/public/`, `client/src/main.tsx`, `client/src/style.css`, `package-lock.json`, and this handoff support dependencies, bootstrapping, styling and session tracking.

### 2026-11-14 - GPT-6.1 Terra - P6 implementation
- Added tenant-scoped vector and keyword retrieval, reciprocal rank fusion, filters, attachment embeddings and ffmpeg audio splitting. No shared contract or migration changes.
- Test fixtures use only TEST_DATABASE_URL and directly insert users. Integration tests and HNSW EXPLAIN ANALYZE pass; the HNSW plan uses planner overrides on a small fixture.
- After merging current main, full npm test twice hit existing P1 integration timeouts during concurrent remote tests; P6 and P2 tests passed. Other requested checks passed.
- P7 must translate internal search results and thumbnail keys into the existing Source wire shape; storage keys must never reach the client. No live embedding calls were made.
- Outside P6 scope: this required handoff update. Claude review is next.

### 2026-11-14 · GPT-6.1 Terra · P5 adapters
- Implemented configuration, provider factories, Gemini and OpenAI-compatible adapters, model rows, mocked tests and opt-in live contracts. Config, env example, decisions and this handoff are outside the narrow P5 provider scope; shared contracts are unchanged.
- `npm run typecheck`, `npm test` (44 passed, 1 live skipped), `npm run lint`, `npm run build`, and `npm run format:check` passed. Gemini live contract passed (3 tests); direct Gemini 2.5 returned 404 for new users, so the default is 3.5 Flash Lite.
- OpenRouter live contract returned HTTP 402 for all three cases; OpenCode's first live case returned the expected free-usage error and the remaining cases were skipped to avoid repeated calls. Draft only: resolve live access and review per-instance concurrency and unverified media/stream edge cases before merging.

### 2026-11-14 · GPT-6.1 Terra · P5 adapter setup
- Created `part/p5b-llm-adapters`, copied the private server environment file, and ran `npm install` (10 reported vulnerabilities: 8 moderate, 2 critical). No adapter code was completed and no PR was opened.
- OpenRouter's models endpoint listed `google/gemini-2.5-flash-lite` with image, file, audio, video and tool support; this is research, not a selected or live-tested default. Implement D20, mocked and live contracts, all checks, and review before merging.

### 2026-11-14 · GPT-6.1 Terra · P2 implementation
- Implemented R2 helpers, upload/complete/list/get/delete and chunk media, quota accounting, migration 003, and live test-bucket round trip. No shared contract changes.
- Typecheck, test, lint, build and format:check passed. Tests insert users directly and mint tokens, compatible with D22. Migration 003 was applied only to TEST_DATABASE_URL, not production.
- Outside P2 scope: router wiring, dependency manifests/lockfile, migration, integration tests and handoff. Claude should address the two lifecycle risks above before merge. npm install reported three vulnerabilities (one moderate, two critical).

### 2026-11-14 · GPT-6.1 Terra · P5 provider layer
- Added provider types, conservative capability fallback, scriptable fake, environment factory, reusable contract suite and SSE fixture. No changes to shared contracts; this handoff is outside the P5 code scope.
- `npm run typecheck`, `npm test` (27 tests), `npm run lint`, and `npm run build` passed. `npm install` succeeded with audit warnings. The real adapter and live tests await the user's LLM choice.

### 2026-11-14 · GPT-6.1 Terra · P1 implementation
- Implemented database, auth (including Google), collections, and integration tests; main Neon migration applied after tests passed on the test branch.
- Typecheck, tests, lint, and build pass. Claude review is next. Integration tests require TEST_DATABASE_URL and otherwise skip.
- Outside P1's listed scope: app router wiring, workspace package scripts/dependencies, integration tests, and this handoff. The shared contract is unchanged; collection list includes the brief's fileCount as an extra field.
- Migration SQL is not copied into the existing production Docker runtime image; run migrations from the source checkout until deployment addresses this. npm install reported three dependency vulnerabilities; Docker remains unverified.

### 2026-11-14 · GPT-6.1 Terra · P3 embedding
- Implemented SDK client, request throttling, retries, synthetic live spike and mocked tests; all four requested checks passed. See D21 for measurements and unresolved truncation limits.
- Outside the narrow P3 file scope: dependency manifests/lock, `server/test/embed.test.ts`, `server/.env.example`, architecture, decisions and handoff were necessary for installation, validation and required documentation. No `shared/` changes.
- Claude should review; P4 must handle video audio separately and investigate semantic boundaries before relying on the documented maxima.

### 2026-11-14 · Claude · P0 review + lane start
- Finished the P0 review: config fix for real `.env`, malformed JSON → 400, query/param validation, no R2 keys in the contract, min password 8. Prettier added.
- Added Google sign-in to the contract and schema docs (D19). Merged P0 into `main`, started four Terra lanes.

### 2026-11-14 · Claude · planning
- Read the original architecture; checked facts (gemini-embedding-2 GA with 6 PDF pages, 8,192 tokens, 80 s video; Neon free 1 GB).
- Updated ARCHITECTURE.md: provider-agnostic LLM (5.3), capability fallbacks, pdftoppm, HEIC in browser, audio piece config, upload HEAD check, Render memory rules, SSE rules, config table (15), `shared/` package.
- Wrote PLAN.md (parts P0–P12), DECISIONS.md, docs/parts/*, AGENTS.md, CLAUDE.md.
- Half-done: nothing.

---

## How to update this file

At the end of every session:
1. Change your part's row in **Part status** (status, branch, a short note).
2. Update **Waiting on the user**, **Next steps** and **Known problems**.
3. Add a **Session log** entry at the top of the log.
4. Put any new decision in DECISIONS.md, not here.
5. Change "Last updated".

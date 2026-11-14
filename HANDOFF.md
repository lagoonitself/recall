# Handoff

**Read this first. Update it last.** This file is the shared memory between Claude, Codex and any other agent working here. It says where things stand right now. History of decisions lives in [docs/DECISIONS.md](docs/DECISIONS.md); the design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the work split lives in [docs/PLAN.md](docs/PLAN.md).

Last updated: 2026-11-14 by Claude (previews & R2 cleanup)

---

## Current state

P0 is merged into `main` (built by Terra, reviewed and fixed by Claude). Google sign-in added to the contract (D19). Four lanes start now: P1, P3, P5, P8, each a GPT-6.1 Terra agent in its own worktree.

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
| P7 Agent + chat API | not started | — | — | |
| P8 FE library | done | GPT-6.1 Terra / review Claude | part/p8-fe-library | Google-only sign-in; MSW mocks in dev; file previews & modal complete |
| P9 FE chat | not started | — | — | |
| P10 Deploy + ops | not started | — | — | Needs Neon, R2, Render, Vercel, Cloudflare accounts |
| P11 Review + QA | not started | — | — | |
| P12 Docs + demo | not started | — | — | |

## Waiting on the user

- [ ] Check Gemini key limits for `gemini-embedding-2` in AI Studio.
- [ ] Create a Google OAuth **Web client ID** (Google Cloud Console → APIs & Services → Credentials). Authorized JavaScript origins: `http://localhost:5173` and the Vercel URL. Then set `GOOGLE_CLIENT_ID`.
- [ ] Create accounts / keys when P0–P3 need them: Gemini, Neon, Cloudflare (R2 + Workers), Render, Vercel, LLM provider. Put them in `server/.env` yourself; agents never ask for keys in chat.

## Next steps

1. Running: P8, P5 real adapters. Claude reviews P6 and the other PRs.
2. Next: P9 after P8, P4 when P2 is in `main`, P7 when P2 + P6 are in `main`.\n
## Known problems

P6 needs ffmpeg for audio attachments and pgvector 0.8+ for iterative scans. The small test fixture favored the scope index; HNSW use was confirmed with planner overrides, not production-size benchmarks.

P2 signed PUT URLs remain usable until expiry: a client can overwrite the verified original after completion or recreate it after deletion. Signed-PUT replay is documented in D23. Collection DELETE now removes all R2 objects (originals, pieces, thumbs) best-effort after committing the DB transaction. Integration tests use the test database and real R2, cleaning their test prefixes.

Docker Desktop Linux engine was unavailable during P0 verification. The install reports three development dependency vulnerabilities; `npm audit --omit=dev` reports zero.

P5 `npm install` reported 10 vulnerabilities (8 moderate, 2 critical). Gemini live contract passed with `gemini-3.5-flash-lite`. OpenRouter returned HTTP 402; OpenCode returned its expected free-usage limit. Before merge, complete those live contracts and review adapter media serialization, stream edge cases, and process-wide concurrency: current limits are per provider instance.

P3 did not establish actual maximum fully processed duration/pages: over-limit requests returned vectors without proving completeness. Google documents that video audio is not processed; P4 must ingest it separately. Dependency install reports three vulnerabilities (one moderate, two critical); audit before deployment.

Real frontend uploads and a completed Google login still need manual verification; the real Google button renders locally. The HEIC converter is a large lazy-loaded chunk.

---

## Session log

Newest at the top. One entry per working session. Keep each to a few lines: what was done, what's half-done, what the next agent must know.

### 2026-11-14 · Claude · Fix file previews & R2 collection delete cleanup
- Task A (R2 collection delete leaks): Implemented batched `deleteObjects` in `r2.ts` ignoring 404s/NoSuchKey. Updated `DELETE /api/collections/:id` and `DELETE /api/files/:id` to collect file originals, pieces, and thumbnail keys in transaction, commit DB deletions, then delete R2 objects and prefix best-effort. Expanded integration test in `p2.integration.test.ts` to verify cascading R2 deletions for files, chunks, pieces, and thumbs.
- Task B (File previews in library): Updated `@app/shared` contract with `previewChunkId: id.nullable().optional()`. Updated server queries (`GET /api/files` and `GET /api/files/:id`) and `fileResponse` to return the first chunk's ID scoped by `user_id`. Updated MSW handlers and client API client with `chunkMedia`. Updated client `CollectionPage` with file thumbnails, preview action button, and accessible modal preview dialog for image (full), PDF (page image), audio/video (player), and text (snippet) with 10-minute expiry retry on error.
- All checks pass: `npm run typecheck`, `npm test` (64 passed, 15 skipped integration tests when env missing), `npm run lint`, `npm run build`, and `npm run format:check`.

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

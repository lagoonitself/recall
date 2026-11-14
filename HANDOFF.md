# Handoff

**Read this first. Update it last.** This file is the shared memory between Claude, Codex and any other agent working here. It says where things stand right now. History of decisions lives in [docs/DECISIONS.md](docs/DECISIONS.md); the design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the work split lives in [docs/PLAN.md](docs/PLAN.md).

Last updated: 2026-11-14 by GPT-6.1 Terra (P8)

---

## Current state

P0 is merged into `main` (built by Terra, reviewed and fixed by Claude). Google sign-in added to the contract (D19). Four lanes start now: P1, P3, P5, P8, each a GPT-6.1 Terra agent in its own worktree.

## Part status

Status values: `not started` · `in progress` · `in review` · `done` · `blocked`. "Taken by" is filled in when the user assigns a part to an agent.

| Part | Status | Taken by | Branch | Notes |
|---|---|---|---|---|
| P0 Foundation + contract | done | Terra / review Claude | part/p0-foundation | Docker build unverified (no daemon) |
| P1 DB, auth, collections | done | GPT-6.1 Terra | part/p1-db-auth | Includes Google sign-in (D19) |
| P2 Storage + upload | done | GPT-6.1 Terra / review Claude | part/p2-storage-upload | Signed-PUT replay accepted as risk (D23) |
| P3 Embedding client + spike | done | GPT-6.1 Terra | part/p3-embedding | Boundary/truncation investigation remains; see D21 |
| P4 Ingestion worker | not started | — | — | |
| P5 LLM provider | in progress | GPT-6.1 Terra | part/p5-llm-provider | Interface + fake merged; real adapters gemini/openrouter/opencode next (D20) |
| P6 Retrieval | in progress | GPT-6.1 Terra | part/p6-retrieval | |
| P7 Agent + chat API | not started | — | — | |
| P8 FE library | in review | GPT-6.1 Terra | part/p8-fe-library | Google-only (D22), P2 file types; previews and real upload UI still need verification |
| P9 FE chat | not started | — | — | |
| P10 Deploy + ops | not started | — | — | Needs Neon, R2, Render, Vercel, Cloudflare accounts |
| P11 Review + QA | not started | — | — | |
| P12 Docs + demo | not started | — | — | |

## Waiting on the user

- [ ] Check Gemini key limits for `gemini-embedding-2` in AI Studio.
- [ ] Create a Google OAuth **Web client ID** (Google Cloud Console → APIs & Services → Credentials). Authorized JavaScript origins: `http://localhost:5173` and the Vercel URL. Then set `GOOGLE_CLIENT_ID`.
- [ ] Create accounts / keys when P0–P3 need them: Gemini, Neon, Cloudflare (R2 + Workers), Render, Vercel, LLM provider. Put them in `server/.env` yourself; agents never ask for keys in chat.

## Next steps

1. Running: P2, P6, P8, P5 real adapters. Claude reviews each PR.
2. Next: P9 after P8, P4 when P2 is in `main`, P7 when P2 + P6 are in `main`.

## Known problems

P2 signed PUT URLs remain usable until expiry: a client can overwrite the verified original after completion or recreate it after deletion. The existing collection DELETE cascades file rows without deleting R2 objects. Resolve both lifecycle issues before production/merge; P2's file DELETE alone cannot prevent them. Integration tests use the test database and real R2, cleaning their test prefixes.

Docker Desktop Linux engine was unavailable during P0 verification. The install reports three development dependency vulnerabilities; `npm audit --omit=dev` reports zero.

P5 `npm install` reported 10 vulnerabilities (8 moderate, 2 critical); the real LLM adapter, live contract run, chunked tool-argument parsing, and model-specific capabilities remain blocked on the LLM choice.

P3 did not establish actual maximum fully processed duration/pages: over-limit requests returned vectors without proving completeness. Google documents that video audio is not processed; P4 must ingest it separately. Dependency install reports three vulnerabilities (one moderate, two critical); audit before deployment.

P8 file previews are not implemented: the shared file response exposes no chunk IDs, while the media endpoint requires one. Real frontend uploads and a completed Google login still need manual verification; the real Google button renders locally. The HEIC converter is a large lazy-loaded chunk.

---

## Session log

Newest at the top. One entry per working session. Keep each to a few lines: what was done, what's half-done, what the next agent must know.

### 2026-11-14 · GPT-6.1 Terra · P8 Google-only review and P2 types
- Changed sign-in to Google only, added config retry/disabled states and development-only mock login, moved MSW to dev dependencies, and added Word/MOV/OGG/M4A/WAV support plus MIME inference for files without a browser type. Merged `main` after P1/P2 and D22 landed.
- `npm run typecheck`, `npm test` (54 tests, including P1/P2 integration), `npm run lint`, `npm run build`, and `npm run format:check` pass. Checked the mock login and the real Google button at desktop and 375px; the popup was not opened. File previews and real UI uploads remain open.
- Outside the P8 source scope: `.prettierignore` excludes the generated MSW worker to preserve its integrity; `client/package.json`, `client/public/`, `client/src/main.tsx`, `client/src/style.css`, `package-lock.json`, and this handoff support dependencies, bootstrapping, styling and session tracking.

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

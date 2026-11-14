# Handoff

**Read this first. Update it last.** This file is the shared memory between Claude, Codex and any other agent working here. It says where things stand right now. History of decisions lives in [docs/DECISIONS.md](docs/DECISIONS.md); the design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the work split lives in [docs/PLAN.md](docs/PLAN.md).

Last updated: 2026-11-14 by GPT-6.1 Terra (P5 adapters)

---

## Current state

P0 is merged into `main` (built by Terra, reviewed and fixed by Claude). Google sign-in added to the contract (D19). Four lanes start now: P1, P3, P5, P8, each a GPT-6.1 Terra agent in its own worktree.

## Part status

Status values: `not started` · `in progress` · `in review` · `done` · `blocked`. "Taken by" is filled in when the user assigns a part to an agent.

| Part | Status | Taken by | Branch | Notes |
|---|---|---|---|---|
| P0 Foundation + contract | done | Terra / review Claude | part/p0-foundation | Docker build unverified (no daemon) |
| P1 DB, auth, collections | done | GPT-6.1 Terra | part/p1-db-auth | Includes Google sign-in (D19) |
| P2 Storage + upload | in progress | GPT-6.1 Terra | part/p2-storage-upload | |
| P3 Embedding client + spike | done | GPT-6.1 Terra | part/p3-embedding | Boundary/truncation investigation remains; see D21 |
| P4 Ingestion worker | not started | — | — | |
| P5 LLM provider | in review | GPT-6.1 Terra | part/p5b-llm-adapters | Draft: Gemini live passes; OpenRouter 402 and OpenCode free-usage limit block live contracts |
| P6 Retrieval | in progress | GPT-6.1 Terra | part/p6-retrieval | |
| P7 Agent + chat API | not started | — | — | |
| P8 FE library | in progress | GPT-6.1 Terra | part/p8-fe-library | Includes Google sign-in button (D19) |
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

Docker Desktop Linux engine was unavailable during P0 verification. The install reports three development dependency vulnerabilities; `npm audit --omit=dev` reports zero.

P5 `npm install` reported 10 vulnerabilities (8 moderate, 2 critical). Gemini live contract passed with `gemini-3.5-flash-lite`. OpenRouter returned HTTP 402; OpenCode returned its expected free-usage limit. Before merge, complete those live contracts and review adapter media serialization, stream edge cases, and process-wide concurrency: current limits are per provider instance.

P3 did not establish actual maximum fully processed duration/pages: over-limit requests returned vectors without proving completeness. Google documents that video audio is not processed; P4 must ingest it separately. Dependency install reports three vulnerabilities (one moderate, two critical); audit before deployment.

---

## Session log

Newest at the top. One entry per working session. Keep each to a few lines: what was done, what's half-done, what the next agent must know.

### 2026-11-14 · GPT-6.1 Terra · P5 adapters
- Implemented configuration, provider factories, Gemini and OpenAI-compatible adapters, model rows, mocked tests and opt-in live contracts. Config, env example, decisions and this handoff are outside the narrow P5 provider scope; shared contracts are unchanged.
- `npm run typecheck`, `npm test` (44 passed, 1 live skipped), `npm run lint`, `npm run build`, and `npm run format:check` passed. Gemini live contract passed (3 tests); direct Gemini 2.5 returned 404 for new users, so the default is 3.5 Flash Lite.
- OpenRouter live contract returned HTTP 402 for all three cases; OpenCode's first live case returned the expected free-usage error and the remaining cases were skipped to avoid repeated calls. Draft only: resolve live access and review per-instance concurrency and unverified media/stream edge cases before merging.

### 2026-11-14 · GPT-6.1 Terra · P5 adapter setup
- Created `part/p5b-llm-adapters`, copied the private server environment file, and ran `npm install` (10 reported vulnerabilities: 8 moderate, 2 critical). No adapter code was completed and no PR was opened.
- OpenRouter's models endpoint listed `google/gemini-2.5-flash-lite` with image, file, audio, video and tool support; this is research, not a selected or live-tested default. Implement D20, mocked and live contracts, all checks, and review before merging.

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

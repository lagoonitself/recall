# Handoff

**Read this first. Update it last.** This file is the shared memory between Claude, Codex and any other agent working here. It says where things stand right now. History of decisions lives in [docs/DECISIONS.md](docs/DECISIONS.md); the design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the work split lives in [docs/PLAN.md](docs/PLAN.md).

Last updated: 2026-11-14 by GPT-6.1 Terra (P3)

---

## Current state

P0 is merged into `main` (built by Terra, reviewed and fixed by Claude). Google sign-in added to the contract (D19). Four lanes start now: P1, P3, P5, P8, each a GPT-6.1 Terra agent in its own worktree.

## Part status

Status values: `not started` · `in progress` · `in review` · `done` · `blocked`. "Taken by" is filled in when the user assigns a part to an agent.

| Part | Status | Taken by | Branch | Notes |
|---|---|---|---|---|
| P0 Foundation + contract | done | Terra / review Claude | part/p0-foundation | Docker build unverified (no daemon) |
| P1 DB, auth, collections | in progress | GPT-6.1 Terra | part/p1-db-auth | Includes Google sign-in (D19) |
| P2 Storage + upload | not started | — | — | |
| P3 Embedding client + spike | in review | GPT-6.1 Terra | part/p3-embedding | Boundary/truncation investigation remains; see D20 |
| P4 Ingestion worker | not started | — | — | |
| P5 LLM provider | in progress | GPT-6.1 Terra | part/p5-llm-provider | Fake only; real adapter blocked on LLM choice |
| P6 Retrieval | not started | — | — | |
| P7 Agent + chat API | not started | — | — | |
| P8 FE library | in progress | GPT-6.1 Terra | part/p8-fe-library | Includes Google sign-in button (D19) |
| P9 FE chat | not started | — | — | |
| P10 Deploy + ops | not started | — | — | Needs Neon, R2, Render, Vercel, Cloudflare accounts |
| P11 Review + QA | not started | — | — | |
| P12 Docs + demo | not started | — | — | |

## Waiting on the user

- [ ] Choose the LLM (see Pending in DECISIONS.md).
- [ ] Check Gemini key limits for `gemini-embedding-2` in AI Studio.
- [ ] Create a Google OAuth **Web client ID** (Google Cloud Console → APIs & Services → Credentials). Authorized JavaScript origins: `http://localhost:5173` and the Vercel URL. Then set `GOOGLE_CLIENT_ID`.
- [ ] Create accounts / keys when P0–P3 need them: Gemini, Neon, Cloudflare (R2 + Workers), Render, Vercel, LLM provider. Put them in `server/.env` yourself; agents never ask for keys in chat.

## Next steps

1. Lanes running: P1, P5, P8. Claude reviews P3 and each other PR.
2. Then P2 after P1, P6 after P3, P9 after P8, P4 when P2+P3+P5 are in `main`.

## Known problems

Docker Desktop Linux engine was unavailable during P0 verification. The install reports three development dependency vulnerabilities; `npm audit --omit=dev` reports zero.

P3 did not establish actual maximum fully processed duration/pages: over-limit requests returned vectors without proving completeness. Google documents that video audio is not processed; P4 must ingest it separately. Dependency install reports three vulnerabilities (one moderate, two critical); audit before deployment.

---

## Session log

Newest at the top. One entry per working session. Keep each to a few lines: what was done, what's half-done, what the next agent must know.

### 2026-11-14 · GPT-6.1 Terra · P3 embedding
- Implemented SDK client, request throttling, retries, synthetic live spike and mocked tests; all four requested checks passed. See D20 for measurements and unresolved truncation limits.
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

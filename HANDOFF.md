# Handoff

**Read this first. Update it last.** This file is the shared memory between Claude, Codex and any other agent working here. It says where things stand right now. History of decisions lives in [docs/DECISIONS.md](docs/DECISIONS.md); the design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the work split lives in [docs/PLAN.md](docs/PLAN.md).

Last updated: 2026-11-14 by GPT-6.1 Terra (Codex)

---

## Current state

P0 foundation is implemented on `part/p0-foundation` and awaits independent review. Docker image build remains unverified because the Docker daemon was unavailable.

## Part status

Status values: `not started` · `in progress` · `in review` · `done` · `blocked`. "Taken by" is filled in when the user assigns a part to an agent.

| Part | Status | Taken by | Branch | Notes |
|---|---|---|---|---|
| P0 Foundation + contract | not started | — | — | Next to start |
| P1 DB, auth, collections | not started | — | — | |
| P2 Storage + upload | not started | — | — | |
| P3 Embedding client + spike | not started | — | — | Needs `GEMINI_API_KEY` |
| P4 Ingestion worker | not started | — | — | |
| P5 LLM provider | not started | — | — | Real adapter **blocked** on LLM choice; fake is not |
| P6 Retrieval | not started | — | — | |
| P7 Agent + chat API | not started | — | — | |
| P8 FE library | not started | — | — | |
| P9 FE chat | not started | — | — | |
| P10 Deploy + ops | not started | — | — | Needs Neon, R2, Render, Vercel, Cloudflare accounts |
| P11 Review + QA | not started | — | — | |
| P12 Docs + demo | not started | — | — | |

## Waiting on the user

- [ ] Choose the LLM (see Pending in DECISIONS.md).
- [ ] Check Gemini key limits for `gemini-embedding-2` in AI Studio.
- [ ] Create accounts / keys when P0–P3 need them: Gemini, Neon, Cloudflare (R2 + Workers), Render, Vercel, LLM provider. Put them in `server/.env` yourself; agents never ask for keys in chat.

## Next steps

1. P0: `git init`, workspaces, `shared/` contract, env template, health route.
2. After P0 merges, start the four lanes in parallel (see PLAN.md → Lanes).

## Known problems

Docker Desktop Linux engine was unavailable during P0 verification. The install reports three development dependency vulnerabilities; `npm audit --omit=dev` reports zero.

---

## Session log

Newest at the top. One entry per working session. Keep each to a few lines: what was done, what's half-done, what the next agent must know.

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

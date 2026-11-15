# Handoff

**Read this first. Update it last.** Shared memory for every agent working here: where things stand right now. Decisions live in [docs/DECISIONS.md](docs/DECISIONS.md), the design in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), deployment in [docs/DEPLOY.md](docs/DEPLOY.md).

Last updated: 2026-11-15 by Claude (reverted D30 document intelligence, branch `claude/admiring-allen-4ygcwr`)

---

## Current state

The whole app is built, merged into `main` and deployed: React client on Vercel (https://recall-labs.vercel.app), Express API with the ingestion worker on Render, Neon Postgres + pgvector, Cloudflare R2, keep-alive Worker. `main` is the only branch.

- AI: Gemini Embedding 2 for all embeddings; Google Gemini for the agent and media descriptions (`LLM_PROVIDER=gemini` on Render). OpenRouter / OpenCode adapters still exist but are unused.
- Sign-in: email + password (bcrypt, D29) or Google; JWT sessions.
- UI: black-and-white Vercel/Geist-style design with a geometric "R" logo (`client/src/components/brand/`, `client/src/styles/polish.css`).
- README has the hackathon problem statement and solution description, and screenshots of the current UI (`docs/images/`, taken in mock mode).

## Waiting on the user

- [ ] Record the 3–5 minute demo video and link it in the README.
- [ ] Complete a real Google sign-in during production browser QA.
- [ ] Confirm Gemini embedding quotas before loading a large demo collection.

## Next steps

1. Production QA while signed in: uploads of every format, chat, full-document previews, mobile and dark mode.
2. Verify the keep-alive cron, cold-start behavior, and memory use on maximum-length videos.
3. Prepare demo-safe media and a demo script, then record the video.

## Known problems

- Audio attachments need ffmpeg; HNSW iterative scans need pgvector 0.8+. HNSW use was confirmed with planner overrides, not production-size benchmarks.
- Signed upload URLs stay usable until they expire, so a client could overwrite an original after completion (accepted risk, D23). Deleting a collection removes its R2 objects best-effort after the DB commit.
- Maximum fully processed duration/pages for embeddings were not proven; Gemini does not embed the audio track of video, so the worker ingests it separately.
- The provider call is not interruptible mid-await: a client disconnect is noticed at the next stream event. `maxMediaPartsPerRequest` is 1 for every model, so `open_sources` sends one real media piece per call and falls back to stored text for the rest.
- Conversations have no DELETE route yet; chat attachments are only removed with the user.
- The HEIC converter is a large lazy-loaded chunk. `npm audit` reports dev-only vulnerabilities; `--omit=dev` was clean at last check.
- No password reset or email verification yet.

---

## Session log

Newest at the top. A few lines each: what was done, what is half-done, what the next agent must know.

### 2026-11-15 · Claude · revert document intelligence (D30)
- At the user's request, reverted `54ef7d0` (D30 document intelligence + D31) back to the post-redesign state of `20f156d`. Tree is identical to `20f156d`; `npm run build` and client tests (71) pass.
- If migration 004 already ran in production, the `doc_insights` table and its `schema_migrations` row stay behind; they are unused and harmless. Drop them by hand only if wanted.
- The D30 code is still in git history (`54ef7d0`) and can be restored with `git revert` of this commit.

### 2026-11-14 · Claude · bcrypt, README, docs cleanup, screenshots
- Passwords now use bcrypt (`bcryptjs`, cost 12); new passwords capped at 72 bytes in `RegisterRequestSchema`; legacy `scrypt$` hashes still verify and are re-hashed to bcrypt on the next sign-in (D29). Server auth tests cover all three.
- README: problem statement, solution description, Gemini named as the LLM, bcrypt/JWT/Multer in the stack table, screenshots retaken with the new UI.
- Deleted finished planning docs: `docs/PLAN.md`, `docs/parts/` (P0–P12), `client/src/styles/README.md`. Links in AGENTS.md, ARCHITECTURE.md and README updated. Remote branches other than `main` were deleted after checking each had no unmerged commits.

### 2026-11-14 · Claude · monochrome redesign (PR #19)
- Black-and-white Geist tokens, geometric "R" logo and favicon, tabs with hover pill and sliding underline, grid backgrounds, quiet motion. Auth demo guards `window.matchMedia`.

### 2026-11-14 · Claude · email + password sign-in (D28, PR #18)
- `POST /api/auth/register` and `/login` next to Google; MSW mocks; DB-free tests for routes, form, page and API client. Google linking clears an existing password (pre-account-takeover guard).

### 2026-11-14 · Codex · video upload fix (PR #17)
- `force_divisible_by=2` after aspect-ratio scaling so libx264 accepts every size; real-FFmpeg regression tests for landscape and portrait sizes. Verified on production with the user's original clip.

## How to update this file

Update "Current state", "Waiting on the user", "Next steps" and "Known problems" so they are true now; delete what no longer applies. Add one short session-log entry at the top. Put decisions in docs/DECISIONS.md, not here.

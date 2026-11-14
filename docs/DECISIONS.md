# Decisions

Append-only. Newest at the bottom. Each entry: date, decision, why, who decided. To reverse a decision, add a new entry that points to the old one; don't edit old entries.

| # | Date | Decision | Why | By |
|---|---|---|---|---|
| D1 | 2026-11-14 | Theme: Multimodal AI. Product: upload anything, ask anything, cited answers with visible agent activity. | Strongest demo and fits the mandatory stack. | User |
| D2 | 2026-11-14 | Stack: React + Vite + Tailwind, Express, Neon + pgvector, R2, Vercel + Render. TypeScript everywhere. | Hackathon rules + free tiers. | User |
| D3 | 2026-11-14 | Embeddings: `gemini-embedding-2`, 1536 dims. **Mandatory.** | One vector space for all modalities. | User |
| D4 | 2026-11-14 | Agent and describe LLM: **not necessarily Gemini.** Provider to be chosen (likely OpenRouter). All calls behind `LlmProvider`; models from `AGENT_MODEL` / `DESCRIBE_MODEL`. | Keep Gemini only where required; freedom to pick a better or cheaper chat model. | User |
| D5 | 2026-11-14 | Video capped at 80 s, never split. | Embedding limit; keeps ingestion simple. | User |
| D6 | 2026-11-14 | Work split into parts P0–P12 with start/end conditions, no day schedule. | User preference. | User |
| D7 | 2026-11-14 | Team: Claude leads and integrates; Codex builds the frontend (P8, P9); Claude sub-agent builds P3/P4; each provider reviews the other's PRs. | Parallel build + independent review. | User |
| D8 | 2026-11-14 | Added `shared/` package with Zod schemas for all API bodies and SSE events. | Lets frontend and backend be built in parallel against one contract. | Claude |
| D9 | 2026-11-14 | PDF thumbnails via poppler `pdftoppm` in the Docker image. | `pdf-lib` can't render pages. | Claude |
| D10 | 2026-11-14 | HEIC converted to JPEG in the browser (`heic2any`). | Prebuilt `sharp` can't decode HEIC. | Claude |
| D11 | 2026-11-14 | Audio piece length is config (`AUDIO_PIECE_SEC`, default 150) until P3 measures the real limit. | Sources disagree on the audio limit (80 s vs 180 s). | Claude |
| D12 | 2026-11-14 | Text pieces skip the describe call; describe calls are batched (`DESCRIBE_BATCH`). | Saves LLM quota. | Claude |
| D13 | 2026-11-14 | Model capability table + fallbacks (poster frame / transcript) when a model can't take a modality. | The chosen LLM may not accept audio/video. | Claude |
| D14 | 2026-11-14 | `/complete` checks the R2 object with `HEAD`; signed PUT includes `Content-Length`. | A signed URL alone doesn't enforce size. | Claude |
| D15 | 2026-11-14 | Worker concurrency 1, stream to `/tmp`, ffmpeg/pdftoppm as child processes. | Render free has 512 MB RAM. | Claude |
| D16 | 2026-11-14 | Browser calls Render directly for SSE, with 15 s heartbeats and no compression. | Avoid proxy buffering. | Claude |
| D17 | 2026-11-14 | **Replaces D7.** No owners are assigned in the docs. The user decides which agent works on each part when it starts. Rule kept: a PR is reviewed by an agent other than its author. | User did not ask for owner assignments. | User |

| D18 | 2026-11-14 | Use camelCase REST objects and `{event, data}` SSE envelopes; define initial REST response shapes from the data model where ?8 omits them. Use built `@app/shared` exports with a TypeScript watch in dev. | Gives both workspaces an executable shared contract; downstream implementation should review unspecified details before relying on them. | GPT-6.1 Terra (Codex) |
| D19 | 2026-11-14 | Add Google sign-in next to email/password. Browser uses Google Identity Services to get an ID token; `POST /api/auth/google` verifies it with `google-auth-library` (`aud` = `GOOGLE_CLIENT_ID`, `email_verified`) and issues our own JWT. `users.password_hash` becomes nullable; new `google_sub`, `avatar_url`. Accounts link by verified email. Built in P1 (server) and P8 (button). | User asked for Google login. ID-token flow needs no client secret and no redirect handling, and keeps one JWT session model. | User / Claude |

| D20 | 2026-11-14 | P3 spike: 1536 dimensions and norm 1.000000 for text, PNG, JPEG, WebP, MP3 audio, MP4 video and PDF; prefixed query matching red image cosine 0.729604 vs blue image 0.652363. API returned success for 181 s MP3, 81 s MP4 with audio, and 6- and 7-page PDFs; acceptance does not prove full content was embedded. Google documents 180 s audio, 120 s video, 6 PDF pages, PNG/JPEG, and says video audio tracks are not processed; WebP acceptance is not a supported-format guarantee. Keep audio pieces at 150 s and product video cap at 80 s. Gemini 2 auto-normalizes 1536-d vectors; text retrieval uses task prefixes, not taskType. | Avoid treating silent truncation or undocumented acceptance as a measured maximum. P4 must separately process video audio. Source: https://ai.google.dev/gemini-api/docs/embeddings (accessed 2026-11-14). | GPT-6.1 Terra |

## Pending

| Question | Blocks | Answered by |
|---|---|---|
| Which LLM for the agent? Does it accept image / PDF / audio / video, tools and reasoning output? | P5 real adapter | User |
| Is a separate describe model needed (if the agent model can't take audio/video)? | P4 real describe | User, after the above |
| Gemini key limits for `gemini-embedding-2` (RPM / RPD in AI Studio) | `EMBED_RPM`, demo library size | User |
| P3 observed API acceptance beyond documented limits, but did not verify truncation or maximum fully processed duration/pages; investigate with semantic boundary probes. Video audio is not processed per Google docs and needs separate ingestion. | P4 splitting and video audio | P4 / integration |

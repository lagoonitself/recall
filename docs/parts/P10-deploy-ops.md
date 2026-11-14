# P10 · Deploy + ops

## Goal
Everything live on free tiers: frontend on Vercel, backend on Render (Docker), Neon, R2, and a Cloudflare keep-alive Worker.

## Starts after
- **Skeleton pass:** P0 merged (deploy health-only backend and placeholder frontend early to catch hosting problems).
- **Final pass:** P7, P8, P9 merged.
- The user has created accounts and put keys in host env settings (agents never ask for keys in chat).

## Done when
- [ ] Render web service from `Dockerfile`; all env vars from §15 set; health check path `/api/health`; migrations run on deploy (`npm run db:migrate` before start).
- [ ] Vercel project for `client/` (root dir `client`, build `npm run build`, output `dist`), `VITE_API_URL` set, SPA rewrite to `index.html`.
- [ ] Neon: production branch, pooled URL in Render; a separate dev branch for local work.
- [ ] R2: bucket private; CORS allows `PUT`, `GET` from the Vercel origin and `localhost` dev origin only.
- [ ] `keepalive/`: Worker with cron `*/10 * * * *` that GETs `/api/health`; deployed with the `cf` CLI; logs show 204s.
- [ ] Backend `CORS_ORIGIN` = Vercel URL.
- [ ] Google OAuth client `recall`: add the Vercel URL to Authorized JavaScript origins; `GOOGLE_CLIENT_ID` set on Render.
- [ ] Smoke test on the live URL: sign in with Google → create collection → upload PDF → ready → ask a question → streamed cited answer.
- [ ] Memory check: ingest the 80 s video on Render without OOM (check Render metrics).
- [ ] Deployment steps written into README (P12 uses them); HANDOFF.md updated with live URLs.

## Scope
`Dockerfile`, `render.yaml` (optional), `client/vercel.json`, `keepalive/**`, deploy docs.

## Provides / uses
- **Provides:** live URLs for P11 and P12.
- **Uses:** all code parts.

## Steps
1. Skeleton deploy after P0.
2. Keep-alive Worker.
3. Final deploy after P7–P9; smoke test.

## Tests
- `curl -i https://<render>/api/health` → 204.
- SSE streams through Render without buffering (events arrive one by one in the browser).
- Cold start check after 20 min idle: still warm.

## Skills
`deploy-to-vercel`, `deploy-checklist`, `cf-cli`, `workers-best-practices`

## Watch out
- Render free: 512 MB RAM, sleeps after 15 min idle, 750 h/month across the workspace (one service only).
- Render builds the Docker image from the repo root; keep `.dockerignore` tight (no `client/`, no `node_modules`).
- Vercel and Render, Neon and R2 dashboards may be needed for steps only the user can do; list them in HANDOFF.md under "Waiting on the user".

## Architecture
§11, §12, §15

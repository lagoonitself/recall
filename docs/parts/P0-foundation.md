# P0 · Foundation + shared contract

## Goal
Create the monorepo skeleton and the `shared/` contract that every other part builds against. After P0, frontend and backend work can run in parallel without waiting on each other.

## Starts after
Nothing. Repo contains only `docs/`, `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`.

## Done when
- [ ] `git init`, `.gitignore` (node_modules, dist, `.env*` except `.env.example`), first commit on `main`.
- [ ] npm workspaces: `client`, `server`, `shared`. One root `package.json`, one lockfile.
- [ ] TypeScript strict in all three; `shared` builds and is imported as `@app/shared` by client and server.
- [ ] `shared/` exports Zod schemas + inferred types for **every** request/response in ARCHITECTURE §8, the error shape, every SSE event in §8, and enums (`Modality`, `FileStatus`, `StepKind`).
- [ ] `server/`: Express app, `GET /api/health` → 204, Zod validation middleware, error handler that returns `{ error: { code, message, details? } }`, CORS from `CORS_ORIGIN`, config loader that validates env with Zod and fails fast.
- [ ] `server/.env.example` lists every variable in ARCHITECTURE §15 (no values).
- [ ] `client/`: Vite + React + TS + Tailwind + React Router, one placeholder page, `VITE_API_URL` read from env.
- [ ] Root scripts: `npm run dev` (client + server together), `npm run build`, `npm run typecheck`, `npm run test` (Vitest in each package), `npm run lint`.
- [ ] `Dockerfile` (node + ffmpeg + poppler-utils) builds the server image locally.
- [ ] HANDOFF.md updated.

## Scope
Root config files, `shared/**`, `server/src/index.ts`, `server/src/lib/{config,validation,errors}.ts`, `server/src/routes/health.ts`, `client/` scaffold, `Dockerfile`.

## Provides / uses
- **Provides:** `@app/shared` (contract), server app factory `createApp()` that later parts mount routes onto, config object, validation middleware.
- **Uses:** nothing.

## Steps
1. Workspaces + TS configs (base `tsconfig.base.json`).
2. Write `shared/src/api/*.ts` (auth, collections, files, chunks, conversations) and `shared/src/sse.ts` (discriminated union on `event`).
3. Server skeleton + health route + error handling.
4. Client scaffold.
5. Dockerfile; build it once.

## Tests
- `npm run typecheck && npm run test` pass.
- `curl -i localhost:<port>/api/health` → `204`.
- Unit test: every SSE event example in ARCHITECTURE §8 parses with the `shared` schema.

## Skills
`system-design`, `testing-strategy`

## Watch out
- Keep `shared/` free of Node-only or browser-only imports (Zod only).
- `createApp()` must not connect to the DB at import time, so tests can build it without env.

## Architecture
§2, §8, §13, §15

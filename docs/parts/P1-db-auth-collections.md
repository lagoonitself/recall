# P1 · Database, auth, collections

## Goal
All tables exist on Neon, users can register and log in, and they can manage collections.

## Starts after
P0 merged. A Neon project with `DATABASE_URL` in `server/.env` (user creates it).

## Done when
- [ ] Migration runner (plain SQL files in `server/src/db/migrations/`, applied in order, tracked in a `schema_migrations` table). `npm run db:migrate` works against Neon.
- [ ] Migration `001_init.sql` = the full schema in ARCHITECTURE §7, including `pgvector`, all indexes, `UNIQUE (file_id, seq)`, `jobs.locked_at`, `messages.provider_state`.
- [ ] `pg` pool with the pooled Neon URL, SSL on, sensible pool size (≤ 5).
- [ ] Auth routes: `GET /api/auth/config`, `POST /api/auth/google`, `GET /api/auth/me`. JWT 7 days. (Email/password removed by D22.)
- [ ] `requireAuth` middleware sets `req.user`.
- [ ] Collections: `GET/POST /api/collections`, `PATCH/DELETE /api/collections/:id`. List includes file counts. Every query scoped by `user_id`; another user's id returns 404.
- [ ] Rate-limit middleware (in-memory, per user/IP) ready for later routes; applied to auth (e.g. 10/min per IP).
- [ ] Tests pass; HANDOFF.md updated.

## Scope
`server/src/db/**`, `server/src/routes/{auth,collections}.ts`, `server/src/lib/{auth,rateLimit}.ts`.

## Provides / uses
- **Provides:** `db` pool + `query` helper, `requireAuth`, `rateLimit(opts)`, the full schema.
- **Uses:** `@app/shared` auth + collection schemas, P0 `createApp()`.

## Steps
1. Migration runner + `001_init.sql`.
2. Pool + query helper.
3. Auth service + routes + middleware.
4. Collections routes.
5. Rate limiter.

## Tests
- Integration tests against a Neon **branch** (not main) or a local Postgres with pgvector: Google sign-in (stubbed verifier) → JWT → me; link by email; second Google account on a linked email → 409; collections CRUD; cross-user access → 404.
- `npm run db:migrate` twice is a no-op the second time.

## Skills
`supabase-postgres-best-practices`, `testing-strategy`, `grill-security`

## Watch out
- `halfvec` needs pgvector ≥ 0.7; check `SELECT extversion FROM pg_extension WHERE extname='vector'`.
- Lowercase and trim emails before storing and comparing.
- Never log password or token values.

## Architecture
§7, §8, §10

# P2 · R2 storage + upload API

## Goal
Files go from the browser straight to R2 with a signed URL, get checked, and become a queued ingestion job. Users can list, inspect and delete files, and get signed URLs for chunk media.

## Starts after
P1 merged. An R2 bucket and API token in `server/.env` (user creates them; bucket CORS set per §10).

## Done when
- [ ] `server/src/lib/r2.ts`: S3 client for R2; `signPut(key, contentType, contentLength)`, `signGet(key, ttl=600)`, `head(key)`, `getStream(key)`, `put(key, body, contentType)`, `deletePrefix(prefix)`.
- [ ] `POST /api/files/upload-url`: validates name, MIME, size ≤ `MAX_FILE_MB`, collection ownership, user quota and uploads/day; maps MIME → modality; inserts file (`uploading`); returns `{fileId, signedPutUrl}`.
- [ ] `POST /api/files/:id/complete`: `HEAD` the object; size and type must match the row; sets `queued` and inserts a `jobs` row in one transaction. Mismatch → `failed` + 400.
- [ ] `GET /api/files?collectionId=`, `GET /api/files/:id` (status, progress, error).
- [ ] `DELETE /api/files/:id`: deletes R2 prefix `users/{u}/files/{f}/` then the row (chunks cascade).
- [ ] `GET /api/chunks/:id/media?kind=piece|thumb`: ownership check → signed GET URL.
- [ ] Per-user storage quota counted from `files.size_bytes`.
- [ ] Tests pass; HANDOFF.md updated.

## Scope
`server/src/lib/r2.ts`, `server/src/routes/{files,chunks}.ts`, `server/src/services/files.ts`.

## Provides / uses
- **Provides:** `r2` helpers (used by P4, P7), job rows for P4 to claim.
- **Uses:** P1 `db`, `requireAuth`, `rateLimit`; `@app/shared` file schemas.

## Steps
1. R2 client + helpers; test against the real bucket with a tiny file.
2. upload-url → PUT with curl → complete.
3. List/get/delete.
4. Chunk media route.

## Tests
- Script: request URL, `curl -X PUT --data-binary @sample.pdf`, call complete, see a `jobs` row.
- Wrong size upload → complete returns 400 and file is `failed`.
- Other user's file id on every route → 404.

## Skills
`cf-cli`, `grill-security`, `testing-strategy`

## Watch out
- R2 endpoint: `https://<account>.r2.cloudflarestorage.com`, region `auto`.
- Sign `ContentLength` and `ContentType` so the PUT must match them.
- HEIC never arrives here (converted in the browser); reject `image/heic` server-side.

## Architecture
§4.1, §7 (R2 layout), §8, §10

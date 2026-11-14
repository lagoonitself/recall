# P8 · Frontend: auth, collections, upload

## Goal
The app shell, login/register, the collections grid, and the collection page with drag-and-drop upload and live processing status.

## Starts after
P0 merged. Built against MSW mocks generated from `@app/shared` schemas; switched to the real API when P1/P2 are merged.

## Done when
- [ ] Design direction chosen and written at the top of `client/src/styles/README.md` (fonts, colours, spacing, motion). One direction, used everywhere.
- [ ] App shell: nav, user menu, logout, protected routes, token in memory + `localStorage`, 401 → login.
- [ ] `lib/api.ts`: typed fetch client using `@app/shared` schemas (parse every response), base URL `VITE_API_URL`, error shape handled.
- [ ] `/login`, `/register` with validation messages.
- [ ] `/` collections grid: create, rename, delete (confirm), file counts, empty state.
- [ ] `/collections/:id`: file list with type icon, size, status badge, progress bar (`pieces_done/pieces_total`), error text, delete; polls while any file is not `ready`/`failed`.
- [ ] `UploadDropzone`: multiple files, type + size checks, video duration check (> 80 s refused with a clear message), HEIC → JPEG via `heic2any`, then upload-url → PUT with progress → complete.
- [ ] File preview: image, PDF first page thumb, audio/video player via `/api/chunks/:id/media`.
- [ ] Works at 375 px width; keyboard reachable; visible focus.
- [ ] MSW mocks in `client/src/mocks/` (dev only, off in production build).
- [ ] HANDOFF.md updated.

## Scope
`client/src/{pages/{Login,Register,Collections,Collection}.tsx,components/{AppShell,UploadDropzone,FileRow,…},lib/{api,auth}.ts,mocks/**,styles/**}`.

## Provides / uses
- **Provides:** shell, API client and auth that P9 reuses.
- **Uses:** `@app/shared`; real API from P1/P2.

## Steps
1. Design direction + shell + API client + auth pages (mocked).
2. Collections grid.
3. Collection page + dropzone + polling.
4. Switch to the real API; fix contract mismatches by PR to `shared/` only.

## Tests
- Vitest + Testing Library: dropzone rejects 90 s video and 60 MB file; HEIC path calls the converter.
- Manual: upload one of each type against the real API and watch status reach `ready`.

## Skills
`frontend-design`, `vercel-react-best-practices`, `vercel-composition-patterns`, `emil-design-eng`, `minimalist-ui`, `ux-copy`, `accessibility-review`, `web-design-guidelines`

## Watch out
- Never put any secret in the client. Only `VITE_API_URL`.
- The PUT goes to R2 directly: send exactly the `Content-Type` and length that were signed.
- Don't poll faster than every 2 s; stop polling when the page is hidden.

## Architecture
§9, §8, §4.1, §10

# P4 · Ingestion worker

## Goal
A background worker that claims jobs, splits each file into pieces, stores pieces and thumbnails in R2, embeds and describes each piece, and writes chunks with progress.

## Starts after
P2 (r2 helpers, job rows), P3 (embed client) and P5 `FakeProvider` merged. Real descriptions arrive once the P5 real adapter exists; nothing here changes when it does.

## Done when
- [ ] Worker loop in the server process: claims with `FOR UPDATE SKIP LOCKED` where `status='queued' AND run_after <= now()`, or `status='running' AND locked_at < now() - interval '15 minutes'`. `WORKER_CONCURRENCY` from env (default 1).
- [ ] Splitters, each returning pieces with location + a temp path:
  - [ ] PDF → 1 page per piece (pdf-lib) + JPEG thumbnail (`pdftoppm -jpeg -r 72 -f n -l n`).
  - [ ] Image → JPEG, long edge ≤ 2048 (sharp); thumbnail.
  - [ ] Audio → mono MP3 64 kbps, `AUDIO_PIECE_SEC` pieces (ffmpeg segment).
  - [ ] Video → `ffprobe` duration (> 80 s → `failed`), MP4 H.264 480p + poster frame.
  - [ ] Text/MD/DOCX (mammoth) → ~800-token chunks, 100 overlap, char offsets.
- [ ] Each piece: upload piece + thumb to R2 → embed → describe (skip for text; batch up to `DESCRIBE_BATCH`; capability fallback per §4.3) → insert chunk with `ON CONFLICT (file_id, seq) DO NOTHING` → bump `pieces_done`.
- [ ] Status flow `queued → processing → ready | failed`; retries up to 3 with backoff via `run_after`; last error saved on file + job.
- [ ] Temp files under `/tmp/ingest/<jobId>/`, deleted in `finally`.
- [ ] Graceful shutdown: on SIGTERM, finish the current piece, release the job.
- [ ] Tests pass; HANDOFF.md updated.

## Scope
`server/src/ingest/**` (worker, splitters/, describe.ts, pipeline.ts).

## Provides / uses
- **Provides:** chunks in Neon that P6/P7 search.
- **Uses:** P2 `r2`, P3 `embedText/embedMedia`, P5 `LlmProvider.describe` + `capabilities`.

## Steps
1. Worker loop + claim/release with a no-op pipeline.
2. Text splitter end to end (no describe needed) → first searchable chunks.
3. Image, PDF, audio, video splitters.
4. Describe with batching + fallback.
5. Retries, stale-lock reclaim, shutdown.

## Tests
- Unit: each splitter on fixtures (page count, piece times, chunk offsets).
- Integration: upload one file of each type → all `ready`, chunk counts correct, thumbnails present in R2.
- Kill the process mid-job → job is reclaimed and finishes without duplicate chunks.

## Skills
`supabase-postgres-best-practices`, `debug`, `testing-strategy`, `grill-edge-cases`

## Watch out
- 512 MB RAM: never `readFile` a whole video; stream to disk, pass paths to ffmpeg.
- Spawn ffmpeg/pdftoppm with argument arrays, never a shell string (file names are user input).
- A scanned PDF page has no text layer; its description comes from the image.
- Describe output must be validated with Zod; on invalid JSON, retry once, then store empty description.

## Architecture
§4 (all), §7, §11

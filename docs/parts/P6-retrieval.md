# P6 · Hybrid retrieval

## Goal
`searchLibrary()`: embed the text query and/or attachment, run vector and keyword legs, fuse with RRF, return ranked chunks with everything a source card needs.

## Starts after
P1 (schema) and P3 (embed client) merged. Real testing needs some chunks; insert fixture chunks directly until P4 lands.

## Done when
- [ ] `server/src/retrieval/search.ts`: `searchLibrary({userId, query?, attachment?, types?, collectionId?, limit=8})`.
- [ ] Query embedding: text via `embedText` (query task type), attachment via `embedMedia`; audio attachments longer than `AUDIO_PIECE_SEC` are split and each piece searched.
- [ ] Vector leg per query vector (top 30, filters) and keyword leg (top 30, same filters, skipped without text) as in §6.
- [ ] Per-transaction `SET LOCAL hnsw.ef_search = 100` and `hnsw.iterative_scan = relaxed_order` (check pgvector version supports it).
- [ ] RRF fusion (k = 60), dedupe by chunk id, top `limit`.
- [ ] Result rows: chunk id, file id, file name, modality, location (page / start–end / char range), score, summary, thumb key.
- [ ] Tests pass; HANDOFF.md updated.

## Scope
`server/src/retrieval/**`.

## Provides / uses
- **Provides:** `searchLibrary()` for P7's `search_library` tool.
- **Uses:** P1 `db`, P3 embed client.

## Steps
1. SQL legs with fixture data.
2. RRF + tests.
3. Attachment search (image, audio split, video).

## Tests
- Unit: RRF on hand-built lists.
- Integration: fixture chunks → keyword-only hit (exact code like "P0217") found; image query finds the matching image chunk; filters by type and collection work; other users' chunks never returned.
- `EXPLAIN ANALYZE` shows the HNSW index used.

## Skills
`supabase-postgres-best-practices`, `testing-strategy`

## Watch out
- Pass vectors as `'[...]'::halfvec` text, or use `pgvector` node package for serialisation.
- `websearch_to_tsquery` with only stop words returns an empty query; handle that as "no keyword leg".

## Architecture
§6, §7

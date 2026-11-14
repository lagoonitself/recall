# P3 · Embedding client + limits spike

## Goal
A single, throttled client for `gemini-embedding-2` that embeds text, image, audio, video and PDF, plus a spike that measures the model's real limits so the splitting rules are correct.

## Starts after
P0 merged. `GEMINI_API_KEY` in `server/.env`.

## Done when
- [ ] Spike script `server/scripts/embed-spike.ts` embeds one sample of each modality and prints dims + latency. Sample files in `server/scripts/samples/` (small, demo-safe).
- [ ] Spike measures and records in DECISIONS.md: max audio seconds per call, max video seconds (with audio), PDF pages, accepted image MIME types, whether `outputDimensionality: 1536` is honoured, whether vectors need normalising.
- [ ] `server/src/lib/embed.ts`: `embedText(text)`, `embedMedia({mimeType, data|stream})`, returns `number[1536]` (normalised if the spike says so). Uses the official Google GenAI SDK, `EMBED_MODEL` from env.
- [ ] Throttle (`EMBED_CONCURRENCY`, `EMBED_RPM`) + exponential backoff with jitter on 429/5xx, max 5 tries; non-retryable errors throw a typed `EmbedError`.
- [ ] Task types set correctly if the model supports them (document vs query).
- [ ] `AUDIO_PIECE_SEC` default updated in `.env.example` and ARCHITECTURE §4.2 from the measurement.
- [ ] Unit tests with a mocked SDK; HANDOFF.md updated.

## Scope
`server/src/lib/embed.ts`, `server/src/lib/throttle.ts`, `server/scripts/embed-spike.ts`, `server/scripts/samples/**`.

## Provides / uses
- **Provides:** `embedText`, `embedMedia`, `throttle()` helper (P5 may reuse it).
- **Uses:** config from P0.

## Steps
1. Spike first; write down results before building the client.
2. Client + throttle + retry.
3. Tests.

## Tests
- `npx tsx server/scripts/embed-spike.ts` prints 5 vectors of length 1536.
- Unit: 429 then success → retried; 400 → no retry.
- Cosine of a text query vs its matching image is higher than vs an unrelated image (sanity check in the spike).

## Skills
`debug`, `testing-strategy`

## Watch out
- Free-tier data may be used by Google: samples must be demo-safe.
- Count every spike call against the daily quota; keep the spike small.
- Inline data has a request size limit; pieces are small by design, but check the 50 MB original never gets sent whole.

## Architecture
§2, §4.2, §4.3, §4.4, §6

# P11 · Review, security, E2E

## Goal
Every part gets an independent review before merge, and the finished app passes a security pass and an end-to-end run on the live site.

## Starts after
- **Per part:** each part's PR is open.
- **Final pass:** P10 final deploy is live.

## Done when
- [ ] Every PR for P0–P10 has a review from an agent other than its author; findings fixed or answered in the PR.
- [ ] Security pass over the whole repo, checking at least:
  - [ ] every SQL query scoped by `user_id`; no cross-user access on any route (test with two accounts);
  - [ ] signed URLs only after ownership check; 10 min expiry;
  - [ ] no secrets in `client/` bundle (`grep` the built `dist/`), none committed (scan git history);
  - [ ] JWT secret strength and expiry; Google ID-token checks (aud, email_verified);
  - [ ] upload checks: MIME, size, HEAD on complete, ffprobe on video;
  - [ ] subprocess calls use argument arrays;
  - [ ] prompt-injection file can't make the agent leak other files or skip citations;
  - [ ] rate limits and quotas active.
- [ ] Edge-case pass: empty library, file still processing during chat, failed file, 0 search results, very long audio, disconnect mid-stream, duplicate upload.
- [ ] E2E script (`agent-browser`) on the live site: register → collection → upload PDF + image + audio + video → all ready → ask a question by text → ask with a photo → open each source type at the right page/second. Screenshots saved to `docs/qa/`.
- [ ] Results and open issues in HANDOFF.md.

## Scope
Review comments, `docs/qa/**`, fixes in the owning part's files (coordinated through HANDOFF.md).

## Skills
`code-review`, `grill-security`, `grill-edge-cases`, `agent-browser`, `testing-strategy`, `accessibility-review`

## Watch out
- Review the code, not the summary: read the diff.
- A finding is real only with a concrete failing input or a test; mark guesses as such.

## Architecture
§10, §5.6, §8

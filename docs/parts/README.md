# Part briefs

One file per part. Each brief is enough to start the part without reading the whole conversation history. Every brief has the same sections:

- **Goal**: one or two sentences.
- **Starts after**: parts that must be merged into `main` first, and anything else that must exist.
- **Done when**: a checklist. The part is done only when every box is checked and the PR is reviewed.
- **Scope**: the files this part owns. Don't edit files outside it without noting it in HANDOFF.md.
- **Provides / uses**: the interfaces other parts depend on.
- **Steps**: suggested order.
- **Tests**: what to run to prove it works.
- **Skills**: load these from `~/.agents/skills` before starting.
- **Watch out**: known traps.
- **Architecture**: sections of ARCHITECTURE.md to read.

| Part | Brief |
|---|---|
| P0 | [Foundation + shared contract](P0-foundation.md) |
| P1 | [Database, auth, collections](P1-db-auth-collections.md) |
| P2 | [R2 storage + upload API](P2-storage-upload.md) |
| P3 | [Embedding client + limits spike](P3-embedding-client.md) |
| P4 | [Ingestion worker](P4-ingestion.md) |
| P5 | [LLM provider layer](P5-llm-provider.md) |
| P6 | [Hybrid retrieval](P6-retrieval.md) |
| P7 | [Agent loop + chat API](P7-agent-chat-api.md) |
| P8 | [Frontend: auth, collections, upload](P8-frontend-library.md) |
| P9 | [Frontend: chat](P9-frontend-chat.md) |
| P10 | [Deploy + ops](P10-deploy-ops.md) |
| P11 | [Review, security, E2E](P11-review-qa.md) |
| P12 | [README + demo](P12-docs-demo.md) |

# Recall

Recall turns a collection of documents, images, audio, and video into a library you can ask questions about. Ask in text or attach media, follow the agent's search activity, and open the sources behind its answer: a PDF page, an image, an audio segment, a video clip, or a text passage.

**[Try Recall](https://recall-labs.vercel.app)** · [Local setup](#run-locally) · [Architecture](#architecture) · [Deployment](#deployment)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/chat-dark.png">
  <img alt="Recall chat: an answer about a coolant warning light, citing page 42 of an owner manual and a 0:24–1:05 clip of a service video" src="docs/images/chat-light.png">
</picture>

| Follow the agent's work | Organize material into collections |
| --- | --- |
| ![Expanded activity log showing the agent's reasoning, two searches and the two sources it opened](docs/images/activity.png) | ![Library page with three collections](docs/images/library.png) |

<sub>Screenshots use the app's built-in demo data (mock mode), not real files.</sub>

## What you can do

Keep related material in collections and ask questions across formats without searching each file yourself:

- Upload PDFs, scanned pages, Word documents, Markdown, plain text, photos, audio recordings, and short videos
- Ask about one collection or search your whole library
- Attach a photo, audio recording, PDF, or video to a question and use it to find related library content
- Watch ingestion progress as files are queued, processed, and made searchable
- Follow live tool calls, search results, and opened sources in an expandable activity log
- Read streamed answers with numbered citations such as `[S1]` and `[S2]`
- Open cited documents and media in place, including full PDF previews and playback from a stored segment's start time
- Revisit saved conversations, answers, source references, and agent activity
- Use the responsive interface in light or dark mode
- Sign in with an email and password or with a Google account

For example, a collection could contain an equipment manual, a photo of its controls, a maintenance recording, and a short demonstration video. A question about a warning symbol can retrieve the matching manual page and related media, then link the answer back to those sources.

## Architecture

Recall has two main workflows: background ingestion makes uploads searchable; an interactive agent retrieves and inspects that material to answer questions. The browser talks to an Express API, while Postgres stores application records and vectors and Cloudflare R2 stores file bytes.

```mermaid
flowchart LR
    UI["React browser app"] -->|"REST + streamed chat"| API["Express API"]
    UI -->|"Signed upload"| R2[("Cloudflare R2")]
    API -->|"Authentication + metadata"| DB[("Neon Postgres + pgvector")]
    API -->|"Queue uploads"| WORKER["Ingestion worker"]
    WORKER <-->|"Originals, pieces, thumbnails"| R2
    WORKER -->|"Embed content"| EMB["Gemini Embedding 2"]
    WORKER -->|"Descriptions"| ADAPTER["LLM interface"]
    WORKER -->|"Chunks + vectors + locations"| DB
    API --> AGENT["Agent loop"]
    AGENT <--> ADAPTER
    ADAPTER <--> LLM["LLM"]
    AGENT --> TOOLS["Search, open sources, list files"]
    TOOLS -->|"Embed query"| EMB
    TOOLS -->|"Hybrid retrieval"| DB
    TOOLS -->|"Read source media"| R2
```

### Technology stack

The application is a TypeScript monorepo with shared runtime schemas between the frontend and backend.

| Layer | Technology | Role |
| --- | --- | --- |
| Browser app | React 19, Vite, React Router, Tailwind CSS | Collections, uploads, chat, activity, and source viewers |
| API | Node.js, Express, Zod | Authentication, validation, file management, and streaming chat |
| Shared contract | `@app/shared` | API schemas, TypeScript types, and stream event definitions |
| Embeddings | **Gemini Embedding 2** (`gemini-embedding-2`) | Multimodal embeddings with 1,536 dimensions |
| Agent and descriptions | An LLM behind a server-side interface | Tool selection, source inspection, descriptions, and answer generation |
| Database | Neon Postgres with pgvector | Users, collections, chunks, vectors, jobs, and conversations |
| Object storage | Cloudflare R2 | Private originals, normalized pieces, thumbnails, and attachments |
| Media processing | ffmpeg, ffprobe, Poppler, pdf-lib, sharp, mammoth | Media conversion, PDF splitting, thumbnails, and DOCX extraction |
| Hosting | Vercel, Render | Static frontend and containerized API with an ingestion worker |
| Scheduled health requests | Cloudflare Worker | Calls the API health endpoint on a ten-minute schedule when deployed |

### Why Gemini Embedding 2

Recall uses **Gemini Embedding 2** to represent text, images, PDF pages, audio, and video in the same vector space. An embedding is a numeric representation of content; nearby vectors can identify related meaning even when the query and source use different formats.

This lets a photo retrieve a related document page or a text question retrieve an audio segment. Recall requests 1,536-dimensional vectors and stores them as `halfvec(1536)` in pgvector, with a cosine-distance index for similarity search.

### How the LLM fits in

An LLM chooses tools, examines retrieved evidence, and writes the final answer. It also creates structured descriptions of media during ingestion so that search results can include readable summaries, transcripts, visible text, and tags.

All LLM calls go through `server/src/agent/provider/`. The rest of the application works with a shared interface for streaming, tool calls, descriptions, and supported input types. Agent and description model identifiers come from server environment variables; the application can use page images, poster frames, or stored text when direct media input is unavailable.

## From upload to searchable content

Ingestion preserves the connection between each searchable piece and its original file location.

1. **Request an upload.** The authenticated browser sends the file metadata and collection ID to the API. The API checks ownership, file type, size, and upload quotas, then returns a short-lived signed upload URL.
2. **Upload directly to R2.** The browser sends the original file to object storage. Library uploads avoid passing the file body through the API server; chat attachments use the API's separate multipart route.
3. **Verify and queue.** The completion endpoint checks the stored object's size and content type, then creates an ingestion job in Postgres.
4. **Normalize and split.** The worker downloads the original to temporary disk and prepares searchable pieces appropriate to its format.
5. **Embed and describe.** Gemini Embedding 2 embeds each piece. An LLM describes supported media; text pieces use their extracted text directly and skip the description call.
6. **Persist and mark ready.** R2 stores the pieces and thumbnails. Postgres stores embeddings, descriptions, ownership, and source locations. The frontend polls file status and displays progress.

### File formats and processing

Each format has its own processing strategy so retrieval can return a useful source location.

| Content | Supported library formats | Searchable unit | Stored location |
| --- | --- | --- | --- |
| PDF, including scans | `.pdf` | One PDF page plus a rendered thumbnail | Original page number |
| Images | `.png`, `.jpg`, `.jpeg`, `.webp`, `.heic` | One normalized JPEG, with a maximum 2,048-pixel edge | Whole image |
| Audio | `.mp3`, `.wav`, `.m4a`, `.ogg` | Mono MP3 segments, 150 seconds by default | Segment start and end time |
| Video | `.mp4`, `.mov`, `.webm` | One normalized MP4 and poster frame, up to 80 seconds | Clip start and end time |
| Text and documents | `.txt`, `.md`, `.docx` | 3,200-character text pieces with 400-character overlap | Character offsets in extracted text |

HEIC photos are converted to JPEG in the browser. Scanned PDF pages are embedded as media rather than requiring an existing text layer; extracted descriptions depend on the LLM's input capabilities.

Video embeddings represent the visual content; the embedding service does not process the video's audio track. The pipeline extracts that track for description fallbacks when supported, but it does not create a separate audio embedding for the video.

### Job reliability

The ingestion queue lives in Postgres, so queued work survives an API restart without a separate queue service. Workers claim jobs with `FOR UPDATE SKIP LOCKED`, reclaim stale locks, retry transient failures, and avoid duplicate chunks with a unique `(file_id, seq)` constraint.

The API and worker share one process by default. One worker processes uploads at a time, originals are streamed to temporary disk, and media utilities run as child processes to fit a small container. File status is `uploading`, `queued`, `processing`, `ready`, or `failed`; failed files retain an error message.

## From question to cited answer

Recall uses retrieval-augmented generation: the agent searches your library and uses the retrieved evidence as context for its answer. It can repeat a search or inspect additional sources within a bounded tool loop.

1. The API verifies the session and conversation scope, stores the question and attachments, and starts a streaming response.
2. The LLM receives conversation context and definitions for three tools.
3. `search_library` retrieves relevant pieces using the question, an attachment, or both.
4. The agent can call `open_sources` to inspect actual media or its available fallback, or `list_files` to discover library contents.
5. The LLM answers with source references such as `[S1]`. The server filters references to IDs that were actually returned by search.
6. The answer, activity, and cited source metadata are persisted for later viewing.

### Agent tools

The LLM requests tools through the server; ownership checks and argument validation apply to those requests.

| Tool | Purpose |
| --- | --- |
| `search_library` | Search by text or a current-message attachment, optionally filtering by collection or content type |
| `open_sources` | Open up to four retrieved sources, using original piece content or capability-based fallbacks |
| `list_files` | List library files, optionally filtering by collection, type, or filename |

### Hybrid retrieval

Search combines semantic similarity with keyword matching so both related concepts and exact terms can contribute to the result.

- **Vector search:** Embed the text query and/or attached media with Gemini Embedding 2, then retrieve up to 30 nearest chunks per query vector using pgvector and an HNSW index
- **Keyword search:** When a text query exists, retrieve up to 30 matches using Postgres full-text search over summaries, transcripts, visible text, and tags
- **Rank fusion:** Combine the result lists with reciprocal rank fusion, which adds `1 / (60 + rank)` for each match, then return the highest-ranked sources
- **Scope filtering:** Restrict queries to the authenticated user's content and the selected collection or content types

### Streaming, activity, and citations

The browser reads Server-Sent Events (SSE) over an authenticated `fetch` request. Tool calls, results, opened sources, answer text, and available reasoning events appear as the request progresses. Heartbeats every 15 seconds help keep the connection active.

The activity log shows what the agent searched and opened. Reasoning text depends on what the LLM returns; a complete internal reasoning trace is not guaranteed. A citation establishes a reference to a retrieved source, but it does not automatically verify that every generated claim is correct.

PDF references retain the original page number. Audio references point to the stored segment, and video references currently point to the whole uploaded clip's range. Players can start at the stored start time; automatic identification of an exact spoken word or moment within a clip is not implemented.

## Run locally

Use the frontend demo to explore the interface without services, or connect the full application for real uploads and retrieval.

### Explore the frontend with mock data

This mode uses Mock Service Worker (MSW) in development and requires Node.js 22.18 or newer and npm. It simulates library data and chat; it does not call the real backend or models.

Clone the repository and start the client:

```bash
git clone https://github.com/lagoonitself/recall.git
cd recall
npm ci
npm run build -w @app/shared
npm run dev -w @app/client
```

Leave `VITE_API_URL` unset or empty in `client/.env`. Open the local URL printed by Vite, normally `http://localhost:5173`, and use the development mock sign-in.

### Connect the full application

For real ingestion and retrieval, provision Neon Postgres with pgvector 0.8 or newer, a private R2 bucket, a Gemini API key for embeddings, and (for Google sign-in) a Google OAuth web client. Install `ffmpeg`, `ffprobe`, and Poppler's `pdftoppm` on your `PATH`; the backend Docker image includes them.

Create `server/.env` with the following keys, replacing the example values with your own configuration. The defaults for omitted settings come from `server/src/lib/config.ts`.

```dotenv
PORT=3000
DATABASE_URL=your_neon_pooled_connection_string_here
JWT_SECRET=your_random_secret_of_at_least_32_characters_here
CORS_ORIGIN=http://localhost:5173
GOOGLE_CLIENT_ID=your_google_oauth_web_client_id_here
GEMINI_API_KEY=your_embedding_api_key_here
EMBED_MODEL=gemini-embedding-2
EMBED_DIM=1536
LLM_PROVIDER=fake
R2_ACCOUNT_ID=your_cloudflare_account_id_here
R2_ACCESS_KEY_ID=your_r2_access_key_id_here
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key_here
R2_BUCKET=recall-files
RUN_WORKER=true
```

Use a Postgres connection URL with TLS enabled for Neon. Generate a fresh session secret locally, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.

`LLM_PROVIDER=fake` is for development plumbing and scripted tests. It does not generate real answers or media descriptions, and it does not replace the real embedding or storage services. To enable real answers, configure a supported adapter, its required credentials, and `AGENT_MODEL` and `DESCRIBE_MODEL` on the server. `DESCRIBE_PROVIDER` can override the adapter used for descriptions; the server validates these settings at startup.

The complete environment key template is [server/.env.example](server/.env.example). If you copy it instead of using the configuration above, remove blank assignments for defaulted settings or fill them with valid values; an empty numeric setting is not the same as omitting it.

Create `client/.env` so the browser calls the local API:

```dotenv
VITE_API_URL=http://localhost:3000
```

Add `http://localhost:5173` to the Google OAuth client's authorized JavaScript origins. The browser obtains the public client ID from `/api/auth/config`. Email and password sign-in needs no extra setup; if `GOOGLE_CLIENT_ID` is empty, only email sign-in is offered.

Configure the private R2 bucket's browser CORS policy to allow uploads and previews from `http://localhost:5173`. Allow `PUT`, `GET`, and `HEAD`, permit required headers including `Content-Type` and `Range`, and expose range-response headers for PDF viewing. [Deployment instructions](docs/DEPLOY.md) include the bucket setup and CORS policy.

From the repository root, build the shared package, apply migrations, and start development:

```bash
npm run build -w @app/shared
npm run db:migrate
npm run dev
```

The API defaults to `http://localhost:3000` and the client to `http://localhost:5173`. Migrations load `server/.env` through the server workspace. The health endpoint, `GET /api/health`, returns `204 No Content`; it checks HTTP availability without querying storage, the database, or models.

Sign in, create a collection, upload a small file, wait for `ready`, and ask a question about it. Real cited answers require the real LLM configuration described above.

## Configuration and limits

The following are application defaults, not service quota guarantees. Adjust quotas and concurrency to match your accounts and deployment resources.

| Setting | Default | Meaning |
| --- | --- | --- |
| `MAX_FILE_MB` | `50` | Maximum size of a library upload in MB |
| `USER_QUOTA_MB` | `500` | Per-user library upload quota in MB |
| `UPLOADS_PER_DAY` | `100` | Library uploads per user per day |
| `CHAT_PER_MIN` | `6` | Chat requests per user per minute |
| Chat attachments | 3 files | Image, PDF, audio, or video; 20 MB multipart request cap |
| Video duration | 80 seconds | Maximum for library uploads and chat attachments |
| `AUDIO_PIECE_SEC` | `150` | Audio segment duration; supported range is 1–150 seconds |
| Agent rounds | 6 | Maximum LLM rounds per question; the final round has no tools |
| Sources opened | 4 per tool call | Direct media input is also limited by model capabilities |
| `WORKER_CONCURRENCY` | `1` | Ingestion jobs processed concurrently |
| `EMBED_RPM`, `EMBED_CONCURRENCY` | `60`, `2` | Embedding request throttles |
| `LLM_CONCURRENCY`, `DESCRIBE_BATCH` | `2`, `4` | LLM concurrency and description processing batch size |

Audio has no separate duration cap, but file size and account quotas still apply. The embedding client also limits each inline media piece to 15 MB; a file accepted for upload may fail ingestion if its normalized piece remains too large.

## Security and data handling

Authentication and ownership checks apply at the API and retrieval layers, and storage credentials stay on the server.

- Google ID tokens are verified server-side, then exchanged for an application JSON Web Token (JWT)
- Passwords are stored only as salted scrypt hashes. A wrong password and an unknown email get the same error and take the same time, and sign-in attempts are rate limited
- When Google sign-in links an email that already has a password, the password is removed, so an account someone else registered with your email cannot keep access
- Database queries and source access are scoped to the authenticated user
- The R2 bucket stays private; the browser receives short-lived signed URLs after ownership checks
- Zod validates API inputs and shared streaming event shapes; tool arguments are validated on the server
- Uploaded content is treated as untrusted data, and the agent is instructed to ignore instructions embedded in source files
- Rendered answer Markdown is sanitized in the client
- API keys, database URLs, session secrets, and R2 credentials belong only in server environment settings

Retrieved content is sent to the configured embedding and LLM services as needed for processing. A private bucket does not mean inference runs locally.

Signed upload URLs remain reusable until they expire, and object deletion is best-effort after database deletion. Conversation deletion and automatic cleanup of chat attachments are not implemented yet.

## Repository layout

The workspaces separate the UI, backend, shared contract, and scheduled health requests.

```text
client/                  React application and source viewers
  src/components/        Upload, chat, activity, citations, previews
  src/lib/               API client, session handling, SSE reader
  src/mocks/             Development-only MSW handlers and fixtures
server/
  src/agent/             Agent loop, prompts, tools, LLM interface
  src/ingest/            Queue worker, splitters, descriptions, pipeline
  src/retrieval/         Vector search, keyword search, rank fusion
  src/routes/            Authentication, collections, files, chat, media
  src/db/                Connection pool and SQL migrations
  src/lib/               Embeddings, R2, validation, throttling, auth
shared/                  Zod schemas and shared TypeScript types
keepalive/               Scheduled Cloudflare health-check Worker
docs/                    Architecture, deployment, decisions, part briefs
Dockerfile               Backend image with media processing tools
render.yaml              Render service blueprint
HANDOFF.md               Current status, verification notes, next steps
```

## API and stream reference

The API uses `/api` paths, JSON responses for regular routes, and a multipart request with an SSE response for chat. Protected routes require `Authorization: Bearer your_session_token_here`.

| Routes | Purpose |
| --- | --- |
| `GET /api/health` | Lightweight availability check |
| `POST /api/auth/register`, `POST /api/auth/login` | Email and password sign-up and sign-in |
| `GET /api/auth/config`, `POST /api/auth/google`, `GET /api/auth/me` | Public sign-in configuration, Google sign-in, current user |
| `GET/POST /api/collections`, `PATCH/DELETE /api/collections/:id` | Collection management |
| `POST /api/files/upload-url`, `POST /api/files/:id/complete` | Direct upload preparation and completion |
| `GET /api/files`, `GET/DELETE /api/files/:id` | File listing, ingestion status, deletion |
| `GET /api/files/:id/media` | Signed preview URL for an original file |
| `GET /api/chunks/:id/media`, `GET /api/chunks/:id/document` | Piece media and original-document citation mapping |
| `GET/POST /api/conversations`, `GET /api/conversations/:id` | Conversation creation and saved history |
| `POST /api/conversations/:id/messages` | Send text and attachments; stream agent output |

Stream event names include `step.start`, `reasoning.delta`, `tool.call`, `tool.result`, `step.end`, `answer.delta`, `sources`, `done`, and `error`. Their validated payloads live in [shared/src/index.ts](shared/src/index.ts). API errors use `{ "error": { "code": "…", "message": "…" } }`, with optional details and an appropriate HTTP status.

## Development checks

Run the repository checks from the root after installing dependencies:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

`npm test` needs no database or credentials for its unit tests. Sign-in, for example, is covered by `server/src/routes/auth.test.ts` (an in-memory users table), `client/src/components/EmailSignIn.test.tsx`, `client/src/pages/Auth.test.tsx` and `client/src/lib/api.test.ts`.

Integration suites use a separate `TEST_DATABASE_URL` and, for storage tests, test R2 configuration. Some suites skip when their required credentials are absent. Use isolated test resources: these suites create and remove data. Live model contracts are opt-in; see the server test files for their environment gates.

Read [HANDOFF.md](HANDOFF.md) for recorded verification results and unresolved failures. Mock-mode checks demonstrate UI behavior; they do not establish that production sign-in, uploads, or model calls work.

## Deployment

The deployment target is a static frontend on Vercel and a Docker backend on Render, with Neon and R2 as managed storage services.

1. Provision Neon with pgvector and a private R2 bucket with browser CORS configured.
2. Deploy the backend from [render.yaml](render.yaml), supplying server credentials and model configuration through environment settings. The Docker startup applies migrations before starting the API and worker.
3. Deploy `client/` on Vercel with `npm run build`, output directory `dist`, and `VITE_API_URL` set to the backend origin.
4. Set backend `CORS_ORIGIN`, R2 allowed origins, and Google OAuth authorized JavaScript origins to the frontend's URL.
5. Optionally deploy `keepalive/` with the `cf` CLI. Its scheduled handler calls `/api/health` every ten minutes; cron operation must be verified after deployment.
6. Verify Google sign-in, file ingestion, streamed chat, source previews, and tenant isolation on the deployed application.

The frontend calls the backend directly for streaming chat. The backend image includes ffmpeg and Poppler and runs as a non-root user.

The stack targets free service plans, but storage, model requests, compute, and monthly account quotas still apply. Free-tier availability and limits can change, and an API or database that scales to zero can add startup latency. [docs/DEPLOY.md](docs/DEPLOY.md) contains infrastructure setup steps; use Google or email/password authentication and the current source schemas where older examples differ.

## Project status and further reading

Core ingestion, retrieval, chat, and source viewers are implemented. Wider production browser QA, keep-alive verification, video memory checks, and demo preparation remain tracked in [HANDOFF.md](HANDOFF.md). The current chat composer accepts uploaded audio files; an in-browser voice recorder is not included.

For implementation details and contribution guidance, start with these documents:

- [Architecture](docs/ARCHITECTURE.md): design, data model, and system flows; some planning-era descriptions predate the current UI
- [Deployment guide](docs/DEPLOY.md): account setup, infrastructure configuration, and operations
- [Decision log](docs/DECISIONS.md): recorded choices and tradeoffs
- [Implementation plan](docs/PLAN.md) and [part briefs](docs/parts/README.md): work boundaries and completion criteria
- [Agent and contribution instructions](AGENTS.md): branch scope, shared contracts, and independent review before merge

## Credits

Recall uses Gemini Embedding 2 for multimodal retrieval and an LLM for agent behavior and answer generation. It builds on React, Vite, Tailwind CSS, Express, Zod, Postgres, pgvector, ffmpeg, Poppler, pdf-lib, sharp, mammoth, PDF.js, DOMPurify, Lucide, and MSW, with infrastructure from Vercel, Render, Neon, and Cloudflare. Those projects and services retain their respective licenses and terms.

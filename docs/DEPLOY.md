# Deployment Guide for Recall

Recall is deployed across free-tier services designed to work together without incurring hosting costs.

| Component | Service | Tier / Plan | Runtime / Architecture |
|---|---|---|---|
| **Backend API & Ingest Worker** | [Render](https://render.com) | Free Web Service | Docker (Debian 12 bookworm-slim + Node.js 24 + ffmpeg + poppler-utils) |
| **Frontend SPA** | [Vercel](https://vercel.com) | Free / Hobby | Static Vite React build with SPA route rewrites |
| **Database & Vector Search** | [Neon](https://neon.tech) | Free | PostgreSQL with `pgvector` extension, pooled connection string |
| **Media / Object Storage** | [Cloudflare R2](https://cloudflare.com) | Free (10 GB) | S3-compatible object storage with scoped CORS |
| **Keep-Alive Cron Ping** | [Cloudflare Workers](https://workers.cloudflare.com) | Free | Cloudflare Worker cron trigger calling `GET /api/health` every 10 min |
| **Authentication** | Google Cloud Console | Free | OAuth 2.0 Web Client credentials + email/password JWT |

---

## 1. Neon PostgreSQL Database

Recall uses Neon PostgreSQL with the `pgvector` extension for storing metadata, chunks, and embeddings.

### 1.1 Create the Database
1. Log in to [Neon Console](https://console.neon.tech).
2. Create a new project named `recall`.
3. In the project dashboard, select your database (default `neondb`).
4. Ensure the `pgvector` extension is enabled (Neon includes `pgvector` by default; the first migration script `001_init.sql` automatically runs `CREATE EXTENSION IF NOT EXISTS vector`).

### 1.2 Copy the Pooled Connection String
1. In the Neon dashboard connection widget, check the **Pooled connection** checkbox.
2. The hostname should contain `-pooler` (e.g. `ep-quiet-pond-123456-pooler.us-east-2.aws.neon.tech`).
3. Set the mode to `require` (`?sslmode=require`).
4. Save this URL: it will be used as `DATABASE_URL` in the Render backend environment.

### 1.3 Running Migrations
- **Automatic:** The production Docker container's startup command automatically applies pending migrations before starting the Express server:
  ```sh
  node server/dist/db/migrate.js && exec node server/dist/index.js
  ```
- **Manual (optional):** To run migrations from your local environment against Neon:
  ```bash
  DATABASE_URL="postgres://user:password@ep-pooler.neon.tech/neondb?sslmode=require" npm run db:migrate
  ```

---

## 2. Cloudflare R2 Storage & CORS Configuration

Recall stores uploaded original files, split audio clips, extracted PDF pages, and thumbnails in an S3-compatible Cloudflare R2 bucket.

### 2.1 Create the R2 Bucket
1. In the Cloudflare dashboard, navigate to **R2** > **Create bucket**.
2. Name the bucket `recall-files` (or custom name matching `R2_BUCKET`).
3. Note your Cloudflare **Account ID** (visible on the right-hand panel of the R2 overview page).

### 2.2 Create API Tokens
1. Under **R2** > **Manage R2 API Tokens**, click **Create API token**.
2. Permissions: Select **Object Read & Write**.
3. Apply to specific bucket: `recall-files` (or all buckets).
4. Save the generated **Access Key ID** and **Secret Access Key**.

### 2.3 Set CORS Policy
To allow the browser to upload directly via pre-signed URLs or fetch media, set the CORS policy on the bucket:
1. In the Cloudflare dashboard, open the bucket > **Settings** > **CORS Policy** > **Edit CORS Policy**.
2. Paste the following JSON policy (replace `https://<your-app>.vercel.app` with your actual Vercel domain):

```json
[
  {
    "AllowedOrigins": [
      "https://<your-app>.vercel.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 3. Render Backend Web Service

The backend runs as a single Docker container on Render's free web service tier. The container bundles the Express API and the in-process ingestion worker, and includes system packages `ffmpeg` and `poppler-utils`.

### 3.1 Deploy via `render.yaml` Blueprint or Web Service
1. Log in to [Render](https://dashboard.render.com).
2. Click **New** > **Blueprint** and connect your GitHub repository containing `render.yaml`.
3. Render will detect the web service definition:
   - **Service Name:** `recall-server`
   - **Runtime:** `Docker`
   - **Plan:** `Free`
   - **Health Check Path:** `/api/health`
4. If deploying manually without blueprints:
   - Click **New** > **Web Service**.
   - Select **Build and deploy from a Git repository**.
   - Language / Runtime: **Docker**.
   - Docker Command: leave default (defined in Dockerfile CMD).
   - Health Check Path: `/api/health`.

### 3.2 Configure Environment Variables
In the Render dashboard under **Environment**, set the following keys (all marked `sync: false` in `render.yaml`):

| Variable | Example / Recommended Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://user:pass@ep-pooler.neon.tech/neondb?sslmode=require` | Neon pooled connection string |
| `JWT_SECRET` | 64+ random hex characters (e.g. run `openssl rand -hex 32`) | Secret for signing auth tokens |
| `CORS_ORIGIN` | `https://<your-app>.vercel.app` | Allowed browser origin (your Vercel URL) |
| `GOOGLE_CLIENT_ID` | `...apps.googleusercontent.com` | Google OAuth Web Client ID (optional) |
| `GEMINI_API_KEY` | `AIza...` | Google AI Studio API key for embeddings |
| `EMBED_MODEL` | `gemini-embedding-2` | Embedding model |
| `EMBED_DIM` | `1536` | Embedding vector dimensionality |
| `EMBED_RPM` | `60` | Max embedding requests per minute |
| `EMBED_CONCURRENCY` | `2` | Max concurrent embedding requests |
| `LLM_PROVIDER` | `openrouter` (or `gemini`) | LLM provider adapter |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | OpenRouter API key (if using openrouter) |
| `AGENT_MODEL` | `google/gemini-2.5-flash-lite` | Main agent conversation model |
| `DESCRIBE_MODEL` | `google/gemini-2.5-flash-lite` | Multimodal chunk description model |
| `LLM_CONCURRENCY` | `2` | Max concurrent LLM requests |
| `DESCRIBE_BATCH` | `4` | Pieces sent per describe call |
| `R2_ACCOUNT_ID` | Cloudflare account ID | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key ID | R2 token access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key | R2 token secret |
| `R2_BUCKET` | `recall-files` | Storage bucket name |
| `AUDIO_PIECE_SEC` | `150` | Split audio pieces length |
| `WORKER_CONCURRENCY` | `1` | Ingestion jobs processed concurrently |
| `RUN_WORKER` | `true` | Runs ingestion worker in-process with API |
| `MAX_FILE_MB` | `50` | Maximum upload size per file (MB) |
| `USER_QUOTA_MB` | `500` | Storage quota per user (MB) |
| `UPLOADS_PER_DAY` | `100` | Upload limit per user per day |
| `CHAT_PER_MIN` | `6` | Chat queries limit per user per minute |
| `DOC_AI_PROVIDER` | `gemini` | Document intelligence models (D30); `fake` only for tests |
| `DECISION_MODEL` | `gemini-decision-1` | Gemini Decisions API model |
| `EXTRACT_MODEL` | `gemini-3.5-flash-lite` | Gemini model for document field extraction |
| `DOC_AI_CONCURRENCY` | `2` | Concurrent document-intelligence requests |

Once saved, Render will build the Docker image and deploy. Note your backend URL: `https://recall-server.onrender.com`.

---

## 4. Vercel Frontend Deployment

The client is a React Single Page Application (SPA) built with Vite and Tailwind CSS.

### 4.1 Deploying from the Repository
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** > **Project** and import the `recall` repository.
3. In the project configuration:
   - **Framework Preset:** `Vite`
   - **Root Directory:** Click **Edit** and set to `client`
   - **Build Command:** `npm run build` (client's `package.json` build script automatically compiles `@app/shared` first: `npm --prefix .. run build -w @app/shared && tsc --noEmit && vite build`)
   - **Output Directory:** `dist`
4. **Environment Variables:**
   - `VITE_API_URL`: Set to your deployed Render URL (e.g. `https://recall-server.onrender.com`).
5. Click **Deploy**.

### 4.2 SPA Rewrites
The repository includes `client/vercel.json` with rewrites configured so all SPA routes resolve to `/index.html`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## 5. Google OAuth 2.0 Credentials (Optional)

If enabling Google Sign-In:
1. Navigate to [Google Cloud Console](https://console.cloud.google.com/) > **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. Application type: **Web application**.
4. **Authorized JavaScript origins:**
   - `http://localhost:5173`
   - `https://<your-app>.vercel.app`
5. **Authorized redirect URIs:**
   - `http://localhost:5173`
   - `https://<your-app>.vercel.app`
6. Copy the **Client ID** and set it in:
   - Render environment: `GOOGLE_CLIENT_ID`
   - Vercel client environment (if used directly by frontend components): `VITE_GOOGLE_CLIENT_ID`

---

## 6. Keep-Alive Cloudflare Worker

Render's free tier spins down web services after 15 minutes of inactivity. To keep the service hot without paying for paid plans:
- The backend exposes `GET /api/health`, which returns `204 No Content` immediately without querying the database or invoking LLMs.
- A Cloudflare Worker runs a cron trigger every 10 minutes (`*/10 * * * *`) that pings this endpoint.

### 6.1 Why `cf` CLI Was Chosen Over Wrangler
Per project guidelines in `AGENTS.md` and the `cf-cli` skill:
- Cloudflare's new `cf` CLI is the official, unified interface for Cloudflare API services and modern Workers projects.
- `cf` utilizes typed programmatic configuration via `cloudflare.config.ts`, avoiding legacy format migrations.
- Since this repository did not have existing legacy Wrangler configurations (`wrangler.toml` or `wrangler.json`), `cf` is the recommended standard.

### 6.2 Deploying the Worker
1. Install the `cf` CLI globally (requires Node 22.18+):
   ```bash
   npm install --global cf
   ```
2. Authenticate:
   ```bash
   cf auth login
   ```
   (Or in CI / unattended environments, set `CLOUDFLARE_API_TOKEN` in your environment).
3. Create a secrets file `keepalive/.secrets.env` (git-ignored):
   ```env
   TARGET_URL=https://recall-server.onrender.com
   ```
4. Deploy the worker from the `keepalive` directory:
   ```bash
   cd keepalive
   cf deploy --secrets-file .secrets.env
   ```
5. Confirm the cron trigger is active (`*/10 * * * *`) in the Cloudflare dashboard under **Workers & Pages** > `recall-keepalive` > **Triggers**.

---

## 7. Post-Deployment Smoke Tests

Once all services are deployed, verify the deployment end-to-end using this checklist:

- [ ] **1. Health check endpoint**
  ```bash
  curl -i https://recall-server.onrender.com/api/health
  ```
  *Expected:* HTTP `204 No Content`.
- [ ] **2. Frontend loads**
  Open `https://<your-app>.vercel.app` in your browser.
  *Expected:* Login / landing page renders with zero console errors.
- [ ] **3. Email/Password Authentication**
  Sign up with a new email and password, then log out and log back in.
  *Expected:* Successful session creation, JWT bearer token stored, redirected to Collections page.
- [ ] **4. Google Sign-In** *(if configured)*
  Click "Sign in with Google" and complete OAuth consent.
  *Expected:* Successful sign-in and redirect to Collections page.
- [ ] **5. Collection Creation**
  Create a new collection named `Test Collection`.
  *Expected:* Collection appears in collection list and opens empty collection view.
- [ ] **6. Multimodal File Uploads**
  Upload:
  1. A small text or markdown file (`test.txt` / `notes.md`).
  2. A short audio file (`clip.mp3`, under 2 minutes).
  *Expected:* Direct PUT upload to R2 succeeds, file cards appear in upload dropzone.
- [ ] **7. Ingestion Processing**
  Observe the file cards during background processing.
  *Expected:* Ingestion status transitions from `queued` -> `processing` -> `ready`. Audio piece is split and descriptions are generated.
- [ ] **8. Multimodal Agent Query & SSE Streaming**
  Ask a question referencing the uploaded audio/text in the collection chat.
  *Expected:* SSE connection opens; `step`, `progress`, and `done` events stream in real time; agent responds with source citations.
- [ ] **9. Activity Log**
  Open the collection's Activity Log drawer.
  *Expected:* File upload, chunking, and embedding events are visible in chronological order.
- [ ] **10. Keep-Alive Worker Verification**
  Check the Cloudflare Workers dashboard analytics for `recall-keepalive` and the Render service logs.
  *Expected:* In Cloudflare dashboard, invocation count increases every 10 minutes. In Render logs, `GET /api/health` requests appear every 10 minutes with status `204`.

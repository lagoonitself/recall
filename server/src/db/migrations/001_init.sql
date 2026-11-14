CREATE EXTENSION IF NOT EXISTS vector;

CREATE FUNCTION immutable_array_to_string(value text[]) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS 'SELECT array_to_string(value, '' '')';

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text,                 -- NULL for Google-only accounts
  google_sub    text UNIQUE,          -- Google account id ('sub' claim)
  name          text,
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name          text NOT NULL,
  mime_type     text NOT NULL,
  modality      text NOT NULL CHECK (modality IN ('pdf','image','audio','video','text')),
  size_bytes    bigint NOT NULL,
  r2_key        text NOT NULL,
  status        text NOT NULL DEFAULT 'uploading'
                CHECK (status IN ('uploading','queued','processing','ready','failed')),
  pieces_total  int,
  pieces_done   int NOT NULL DEFAULT 0,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_user_collection_idx ON files (user_id, collection_id);

CREATE TABLE chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id       uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,          -- denormalised for fast filtering
  collection_id uuid NOT NULL,
  modality      text NOT NULL,
  seq           int  NOT NULL,          -- order within the file
  page          int,                    -- PDF
  start_sec     real,                   -- audio / video
  end_sec       real,
  char_start    int,                    -- text
  char_end      int,
  r2_key        text NOT NULL,          -- the piece itself
  thumb_r2_key  text,                   -- poster frame / page image
  summary       text,
  transcript    text,
  visible_text  text,
  tags          text[],
  embedding     halfvec(1536) NOT NULL,
  search_tsv    tsvector GENERATED ALWAYS AS (
                  to_tsvector('english',
                    coalesce(summary,'') || ' ' || coalesce(transcript,'') || ' ' ||
                    coalesce(visible_text,'') || ' ' || coalesce(immutable_array_to_string(tags),''))
                ) STORED,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, seq)                 -- makes a retried job idempotent
);
CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding halfvec_cosine_ops);
CREATE INDEX chunks_tsv_idx       ON chunks USING gin (search_tsv);
CREATE INDEX chunks_scope_idx     ON chunks (user_id, collection_id, modality);

CREATE TABLE jobs (
  id         bigserial PRIMARY KEY,
  file_id    uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts   int  NOT NULL DEFAULT 0,
  run_after  timestamptz NOT NULL DEFAULT now(),
  locked_at  timestamptz,               -- a 'running' job older than 15 min is reclaimed
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_claim_idx ON jobs (status, run_after);

CREATE TABLE conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id uuid REFERENCES collections(id) ON DELETE SET NULL,  -- NULL = all collections
  title         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user','assistant')),
  content         text NOT NULL,
  attachments     jsonb NOT NULL DEFAULT '[]',  -- [{id, modality, r2_key, mime_type, duration_sec?}]
  sources         jsonb NOT NULL DEFAULT '[]',  -- [{sid, chunk_id, file_id, location}]
  provider_state  jsonb,                        -- opaque state the LLM provider needs on the next turn
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_steps (
  id         bigserial PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  seq        int  NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('reasoning','tool_call','tool_result','sources_opened')),
  payload    jsonb NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at   timestamptz
);

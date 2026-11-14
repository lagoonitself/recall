-- Indexes on foreign keys used by cascades and per-parent lookups.
CREATE INDEX IF NOT EXISTS collections_user_idx      ON collections (user_id);
CREATE INDEX IF NOT EXISTS files_collection_idx      ON files (collection_id);
CREATE INDEX IF NOT EXISTS chunks_file_idx           ON chunks (file_id);
CREATE INDEX IF NOT EXISTS jobs_file_idx             ON jobs (file_id);
CREATE INDEX IF NOT EXISTS conversations_user_idx    ON conversations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS conversations_coll_idx    ON conversations (collection_id);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS agent_steps_message_idx   ON agent_steps (message_id, seq);

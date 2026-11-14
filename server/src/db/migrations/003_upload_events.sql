CREATE TABLE upload_events (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX upload_events_user_created_idx ON upload_events (user_id, created_at);

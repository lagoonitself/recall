-- Document intelligence (D30): one row per analysed PDF, image or text file.
CREATE TABLE doc_insights (
  file_id            uuid PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id      uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','running','ready','not_document','failed')),
  doc_type           text,
  type_confidence    real,
  type_probabilities jsonb NOT NULL DEFAULT '{}',
  summary            text,
  fields             jsonb NOT NULL DEFAULT '[]',  -- [{key,label,kind,value,page,verified,confidence}]
  checks             jsonb NOT NULL DEFAULT '[]',  -- [{id,group,label,status,detail,probability,evidence}]
  quality            real,                         -- 0..1 legibility from Gemini Decision 1
  risk_score         real,                         -- 0..1, higher = needs more attention
  review_status      text CHECK (review_status IN ('auto_approved','needs_review','approved','rejected')),
  review_reasons     jsonb NOT NULL DEFAULT '[]',
  error              text,
  analyzed_at        timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX doc_insights_scope_idx ON doc_insights (user_id, collection_id);
CREATE INDEX doc_insights_collection_idx ON doc_insights (collection_id);

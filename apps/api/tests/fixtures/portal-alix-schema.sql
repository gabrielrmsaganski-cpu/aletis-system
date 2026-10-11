CREATE TABLE portal_alix_session (
 id text PRIMARY KEY, cliente_id text NOT NULL REFERENCES cliente(id), titulo text NOT NULL,
 request_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cliente_id,request_id), UNIQUE(id,cliente_id)
);
CREATE INDEX portal_alix_session_client_idx ON portal_alix_session(cliente_id,updated_at DESC,id DESC);
CREATE TABLE portal_alix_turn (
 id text PRIMARY KEY, session_id text NOT NULL, cliente_id text NOT NULL,
 request_id text NOT NULL, ordinal integer NOT NULL CHECK(ordinal>0), question text NOT NULL,
 status text NOT NULL CHECK(status IN ('processing','completed','failed')),
 answer text, public_sources jsonb NOT NULL DEFAULT '[]', actions jsonb NOT NULL DEFAULT '[]',
 context_hash text, error_code text, attempts integer NOT NULL DEFAULT 1 CHECK(attempts>0),
 lease_token text, lease_expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 FOREIGN KEY(session_id,cliente_id) REFERENCES portal_alix_session(id,cliente_id) ON DELETE CASCADE,
 UNIQUE(session_id,request_id), UNIQUE(session_id,ordinal),
 CHECK(status<>'completed' OR (answer IS NOT NULL AND length(trim(answer))>0))
);
CREATE INDEX portal_alix_turn_session_idx ON portal_alix_turn(session_id,ordinal DESC);
CREATE UNIQUE INDEX portal_alix_turn_processing_unique ON portal_alix_turn(session_id) WHERE status='processing';

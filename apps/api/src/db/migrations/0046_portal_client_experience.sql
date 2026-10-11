-- Continuidade da ALIX, conversas com contexto e atendimento estruturado do cliente.

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
--> statement-breakpoint
-- Coluna anexos já existe desde 0006. Metadados guardam IDs validados, autoria e recibo idempotente.
ALTER TABLE portal_mensagem ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX portal_mensagem_idempotency_idx
ON portal_mensagem (cliente_id,de,(metadata->>'actorId'),(metadata->>'idempotencyKey'))
WHERE metadata->>'idempotencyKey' IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "portal_client_request" (
  "id" text PRIMARY KEY,
  "cliente_id" text NOT NULL,
  "tipo" text NOT NULL CHECK ("tipo" IN ('atualizacao_cadastral','duvida','contato')),
  "assunto" text NOT NULL,
  "mensagem" text NOT NULL,
  "alteracoes" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'aberta' CHECK ("status" IN ('aberta','em_atendimento','concluida','cancelada')),
  "resposta" text,
  "idempotency_key" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("cliente_id","idempotency_key")
);
--> statement-breakpoint
CREATE INDEX "portal_client_request_status_idx" ON "portal_client_request" ("cliente_id","status","created_at");

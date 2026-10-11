-- ============================================================
-- ALETIS — ALIX Knowledge Foundation
--
-- 1. Evolui alix_memory_fact para um Livro de Fatos versionado.
-- 2. Mantém revisões append-only para auditoria e correção.
-- 3. Registra o estado canônico de indexação RAG por documento.
--
-- As tabelas internas do pg-boss vivem no schema `pgboss` e são
-- gerenciadas pela própria biblioteca, não por esta migration.
-- ============================================================

ALTER TABLE alix_memory_fact
  ADD COLUMN IF NOT EXISTS canonical_key text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS value_hash text,
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

UPDATE alix_memory_fact
SET canonical_key = lower(regexp_replace(trim(fact_key), '[^a-zA-Z0-9_]+', '_', 'g'))
WHERE canonical_key IS NULL OR canonical_key = '';

UPDATE alix_memory_fact
SET value_hash = md5(lower(regexp_replace(trim(fact_value), '\\s+', ' ', 'g')))
WHERE value_hash IS NULL OR value_hash = '';

ALTER TABLE alix_memory_fact
  ALTER COLUMN canonical_key SET NOT NULL,
  ALTER COLUMN value_hash SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alix_memory_fact_active
  ON alix_memory_fact (cliente_id, status, atualizado_em DESC)
  WHERE status IN ('confirmed', 'inferred', 'pending_review', 'contested');

CREATE UNIQUE INDEX IF NOT EXISTS idx_alix_memory_fact_current_uidx
  ON alix_memory_fact (cliente_id, fact_type, canonical_key)
  WHERE cliente_id IS NOT NULL
    AND status IN ('confirmed', 'inferred', 'pending_review', 'contested');

CREATE TABLE IF NOT EXISTS alix_fact_revision (
  id bigserial PRIMARY KEY,
  fact_id bigint NOT NULL REFERENCES alix_memory_fact(id) ON DELETE CASCADE,
  version integer NOT NULL,
  previous_value text,
  fact_value text NOT NULL,
  previous_confidence numeric(3, 2),
  confidence numeric(3, 2) NOT NULL,
  previous_status text,
  status text NOT NULL,
  source text NOT NULL,
  source_id text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_reason text NOT NULL DEFAULT 'observed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fact_id, version)
);

CREATE INDEX IF NOT EXISTS idx_alix_fact_revision_fact
  ON alix_fact_revision (fact_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_alix_fact_revision_source
  ON alix_fact_revision (source, source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS alix_rag_index_state (
  id text PRIMARY KEY,
  source_kind text NOT NULL,
  source_id text NOT NULL,
  document_id text NOT NULL,
  cliente_id text,
  session_id text,
  content_hash text NOT NULL,
  embedding_model text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  chunk_count integer NOT NULL DEFAULT 0,
  embedding_count integer NOT NULL DEFAULT 0,
  job_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS idx_alix_rag_index_state_status
  ON alix_rag_index_state (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_alix_rag_index_state_cliente
  ON alix_rag_index_state (cliente_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_alix_rag_index_state_document
  ON alix_rag_index_state (document_id);

ALTER TABLE alix_document_chunk
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS indexed_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_alix_document_chunk_content_hash
  ON alix_document_chunk (document_id, content_hash);

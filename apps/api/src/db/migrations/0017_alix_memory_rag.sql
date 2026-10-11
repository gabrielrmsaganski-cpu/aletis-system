-- ============================================================
-- ALETIS — Alix Memory Longa + RAG Semântico (Wave AI-v2)
--
-- Tabelas:
--   • alix_memory_fact      — fatos estruturados extraídos de conversas
--   • alix_document_chunk   — chunks segmentados de documentos
--   • alix_document_embedding — embeddings vetoriais (JSONB fallback até pgvector)
--
-- NOTE: Quando pgvector for habilitado, migrar embedding JSONB → vector(1536)
-- ============================================================

-- ── 1. Memória Longa Estruturada ────────────────────────────
CREATE TABLE IF NOT EXISTS alix_memory_fact (
  id bigserial PRIMARY KEY,
  cliente_id text,
  consultor_id text,
  session_id text,
  -- Fato em formato chave-valor estruturado (ex: {"tipo": "preferencia", "chave": "cultura", "valor": "soja"})
  fact_type text NOT NULL,      -- 'preferencia' | 'dado_operacional' | 'contexto' | 'perfil_risco' | 'intencao'
  fact_key text NOT NULL,       -- chave do fato (ex: 'cultura_principal', 'prazo_negociacao')
  fact_value text NOT NULL,     -- valor do fato
  confidence numeric(3, 2) DEFAULT 1.0,  -- 0.0–1.0
  source text,                   -- 'conversation' | 'documento' | 'crm' | 'manual'
  source_id text,                -- id da fonte (session_id, doc_id, etc.)
  expires_at timestamptz,        -- null = permanente
  metadata jsonb NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_memory_fact_cliente
  ON alix_memory_fact (cliente_id, fact_type, atualizado_em DESC);

CREATE INDEX IF NOT EXISTS idx_alix_memory_fact_consultor
  ON alix_memory_fact (consultor_id, atualizado_em DESC);

CREATE INDEX IF NOT EXISTS idx_alix_memory_fact_session
  ON alix_memory_fact (session_id);

CREATE INDEX IF NOT EXISTS idx_alix_memory_fact_key
  ON alix_memory_fact (fact_key, fact_value)
  WHERE fact_type IN ('preferencia', 'dado_operacional');

-- ── 2. Document Chunks (RAG) ────────────────────────────────
CREATE TABLE IF NOT EXISTS alix_document_chunk (
  id bigserial PRIMARY KEY,
  document_id text NOT NULL,
  session_id text,
  cliente_id text,
  -- Origem do chunk
  source text NOT NULL,          -- 'upload' | 'crm' | 'web' | 'proposta' | 'dossie'
  source_filename text,
  -- Posição no documento
  page_start int,
  page_end int,
  sheet text,                    -- para planilhas (aba)
  -- Conteúdo
  chunk_text text NOT NULL,
  chunk_index int NOT NULL DEFAULT 0,  -- ordem do chunk no documento
  chunk_size int NOT NULL DEFAULT 0,   -- caracteres
  -- Metadados
  metadata jsonb NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_document_chunk_document
  ON alix_document_chunk (document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_alix_document_chunk_cliente
  ON alix_document_chunk (cliente_id, source);

CREATE INDEX IF NOT EXISTS idx_alix_document_chunk_session
  ON alix_document_chunk (session_id);

-- FTS (Full Text Search) em português — busca textual rápida
CREATE INDEX IF NOT EXISTS idx_alix_document_chunk_fts
  ON alix_document_chunk USING gin (to_tsvector('portuguese', chunk_text));

-- ── 3. Document Embeddings (RAG Semântico) ──────────────────
-- NOTE: Usa JSONB como fallback. Quando pgvector estiver disponível,
-- execute: ALTER TABLE alix_document_embedding ALTER COLUMN embedding TYPE vector(1536);
CREATE TABLE IF NOT EXISTS alix_document_embedding (
  id bigserial PRIMARY KEY,
  chunk_id bigint NOT NULL REFERENCES alix_document_chunk(id) ON DELETE CASCADE,
  document_id text NOT NULL,
  cliente_id text,
  -- Modelo que gerou o embedding
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  embedding jsonb NOT NULL,      -- float[] como JSONB (fallback pgvector)
  dimensions int NOT NULL DEFAULT 1536,
  -- Metadados
  metadata jsonb NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_document_embedding_chunk
  ON alix_document_embedding (chunk_id);

CREATE INDEX IF NOT EXISTS idx_alix_document_embedding_document
  ON alix_document_embedding (document_id);

CREATE INDEX IF NOT EXISTS idx_alix_document_embedding_cliente
  ON alix_document_embedding (cliente_id);

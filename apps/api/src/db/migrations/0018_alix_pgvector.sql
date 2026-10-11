-- ============================================================
-- ALETIS — ALIX RAG com pgvector real
--
-- Converte embeddings do fallback JSONB para vector(1536) e cria
-- índice HNSW para busca semântica por similaridade de cosseno.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'alix_document_embedding'
      AND column_name = 'embedding'
      AND udt_name = 'jsonb'
  ) THEN
    ALTER TABLE alix_document_embedding
      ALTER COLUMN embedding TYPE vector(1536)
      USING (embedding::text::vector(1536));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alix_document_embedding_hnsw
  ON alix_document_embedding
  USING hnsw (embedding vector_cosine_ops);

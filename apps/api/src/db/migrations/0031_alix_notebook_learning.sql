-- ============================================================
-- ALETIS — ALIX Notebook vivo + ciclo contínuo de qualidade
--
-- Etapa 5: versões imutáveis, comentários editoriais e ações.
-- Etapa 6: feedback categorizado, triagem e conjunto dourado.
-- ============================================================

CREATE TABLE IF NOT EXISTS alix_notebook (
  id text PRIMARY KEY,
  cliente_id text,
  session_id text,
  title text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_notebook_cliente
  ON alix_notebook (cliente_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_notebook_session
  ON alix_notebook (session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS alix_notebook_artifact_version (
  id text PRIMARY KEY,
  notebook_id text NOT NULL REFERENCES alix_notebook(id) ON DELETE CASCADE,
  lineage_id text NOT NULL,
  parent_artifact_id text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  kind text NOT NULL,
  title text NOT NULL,
  markdown text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_snapshot_hash text,
  change_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notebook_id, lineage_id, version)
);

CREATE INDEX IF NOT EXISTS idx_alix_notebook_artifact_notebook
  ON alix_notebook_artifact_version (notebook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_notebook_artifact_lineage
  ON alix_notebook_artifact_version (lineage_id, version DESC);

CREATE TABLE IF NOT EXISTS alix_notebook_comment (
  id text PRIMARY KEY,
  notebook_id text NOT NULL REFERENCES alix_notebook(id) ON DELETE CASCADE,
  artifact_id text REFERENCES alix_notebook_artifact_version(id) ON DELETE SET NULL,
  author_id text,
  text text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  applied_in_artifact_id text REFERENCES alix_notebook_artifact_version(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_alix_notebook_comment_open
  ON alix_notebook_comment (notebook_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS alix_notebook_action (
  id text PRIMARY KEY,
  notebook_id text NOT NULL REFERENCES alix_notebook(id) ON DELETE CASCADE,
  source_artifact_id text REFERENCES alix_notebook_artifact_version(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_notebook_action_open
  ON alix_notebook_action (notebook_id, status, updated_at DESC);

ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS cliente_id text;
ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS mission_id text;
ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS notebook_id text;
ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS artifact_id text;
ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS response_excerpt text;
ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS expected_correction text;
ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS triage_status text NOT NULL DEFAULT 'unreviewed';
ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE alix_feedback ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS alix_feedback_triage_idx
  ON alix_feedback (triage_status, criado_em DESC);
CREATE INDEX IF NOT EXISTS alix_feedback_category_idx
  ON alix_feedback (category, criado_em DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alix_feedback_rating_check'
  ) THEN
    ALTER TABLE alix_feedback DROP CONSTRAINT alix_feedback_rating_check;
  END IF;
  ALTER TABLE alix_feedback ADD CONSTRAINT alix_feedback_rating_check
    CHECK (rating IS NULL OR rating IN (
      'util','incompleta','irrelevante','incorreto','off-tom',
      'positive','positivo','negative','negativo','neutral','neutro',
      'útil','thumbs-up','thumbs-down'
    ));
END$$;

CREATE TABLE IF NOT EXISTS alix_quality_case (
  id text PRIMARY KEY,
  feedback_id bigint REFERENCES alix_feedback(id) ON DELETE SET NULL,
  fingerprint text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  summary text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_id text,
  due_at timestamptz,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (feedback_id)
);

CREATE INDEX IF NOT EXISTS idx_alix_quality_case_queue
  ON alix_quality_case (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_quality_case_fingerprint
  ON alix_quality_case (fingerprint, created_at DESC);

CREATE TABLE IF NOT EXISTS alix_golden_case (
  id text PRIMARY KEY,
  source_kind text NOT NULL,
  source_id_hash text NOT NULL,
  case_type text NOT NULL,
  anonymized_input jsonb NOT NULL,
  expected_output jsonb NOT NULL,
  correct_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  review_status text NOT NULL DEFAULT 'candidate',
  dataset_version integer NOT NULL DEFAULT 1,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (content_hash)
);

CREATE INDEX IF NOT EXISTS idx_alix_golden_case_dataset
  ON alix_golden_case (dataset_version, review_status, case_type);

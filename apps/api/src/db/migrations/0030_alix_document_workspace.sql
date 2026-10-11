-- ============================================================
-- ALETIS — Esteira documental especializada + ALIX Workspace
--
-- Etapa 3: execução documental auditável, campos com evidência,
-- achados e comparações/versionamento.
-- Etapa 4: missões, passos, fontes, custo e eventos operacionais.
-- ============================================================

CREATE TABLE IF NOT EXISTS alix_document_pipeline_run (
  id text PRIMARY KEY,
  document_id text NOT NULL,
  session_id text NOT NULL,
  cliente_id text,
  pipeline_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'queued',
  current_stage text NOT NULL DEFAULT 'receber',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  specialized_type text,
  classifier_method text,
  classification_confidence numeric(4, 3),
  document_family_key text,
  source_sha256 text,
  job_id text,
  review_id text,
  registered_entity_id text,
  extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  stage_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, pipeline_version)
);

CREATE INDEX IF NOT EXISTS idx_alix_doc_pipeline_document
  ON alix_document_pipeline_run (document_id, pipeline_version DESC);
CREATE INDEX IF NOT EXISTS idx_alix_doc_pipeline_session
  ON alix_document_pipeline_run (session_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_doc_pipeline_cliente
  ON alix_document_pipeline_run (cliente_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_doc_pipeline_status
  ON alix_document_pipeline_run (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_alix_doc_pipeline_family
  ON alix_document_pipeline_run (cliente_id, document_family_key, created_at DESC);

CREATE TABLE IF NOT EXISTS alix_document_field (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES alix_document_pipeline_run(id) ON DELETE CASCADE,
  document_id text NOT NULL,
  cliente_id text,
  field_key text NOT NULL,
  value_text text NOT NULL,
  normalized_value text NOT NULL,
  value_type text NOT NULL DEFAULT 'text',
  confidence numeric(4, 3) NOT NULL DEFAULT 0,
  evidence_text text NOT NULL,
  evidence_source text NOT NULL,
  page integer,
  sheet text,
  status text NOT NULL DEFAULT 'extracted',
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, field_key, normalized_value, evidence_text)
);

CREATE INDEX IF NOT EXISTS idx_alix_doc_field_run
  ON alix_document_field (run_id, field_key);
CREATE INDEX IF NOT EXISTS idx_alix_doc_field_cliente
  ON alix_document_field (cliente_id, field_key, normalized_value);
CREATE INDEX IF NOT EXISTS idx_alix_doc_field_expiry
  ON alix_document_field (expires_at, status)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS alix_document_finding (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES alix_document_pipeline_run(id) ON DELETE CASCADE,
  document_id text NOT NULL,
  cliente_id text,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  field_key text,
  title text NOT NULL,
  description text NOT NULL,
  related_document_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_doc_finding_run
  ON alix_document_finding (run_id, severity, status);
CREATE INDEX IF NOT EXISTS idx_alix_doc_finding_cliente
  ON alix_document_finding (cliente_id, kind, status, created_at DESC);

CREATE TABLE IF NOT EXISTS alix_document_comparison (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES alix_document_pipeline_run(id) ON DELETE CASCADE,
  baseline_run_id text REFERENCES alix_document_pipeline_run(id) ON DELETE SET NULL,
  comparison_type text NOT NULL,
  similarity numeric(5, 4),
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_doc_comparison_run
  ON alix_document_comparison (run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS alix_mission (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  cliente_id text,
  consultor_id text,
  title text NOT NULL,
  prompt text NOT NULL,
  work_mode text NOT NULL,
  analysis_mode text NOT NULL DEFAULT 'deep',
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  current_step text,
  queue_name text,
  job_id text,
  cost_usd numeric(18, 6) NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  model text,
  result jsonb,
  error text,
  cancellable boolean NOT NULL DEFAULT true,
  cancelled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_mission_session
  ON alix_mission (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_mission_cliente
  ON alix_mission (cliente_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_mission_status
  ON alix_mission (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS alix_mission_step (
  id text PRIMARY KEY,
  mission_id text NOT NULL REFERENCES alix_mission(id) ON DELETE CASCADE,
  position integer NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  details text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, code)
);

CREATE INDEX IF NOT EXISTS idx_alix_mission_step_mission
  ON alix_mission_step (mission_id, position);

CREATE TABLE IF NOT EXISTS alix_mission_source (
  id text PRIMARY KEY,
  mission_id text NOT NULL REFERENCES alix_mission(id) ON DELETE CASCADE,
  kind text NOT NULL,
  source_id text,
  label text NOT NULL,
  url text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_mission_source_mission
  ON alix_mission_source (mission_id, created_at);

CREATE TABLE IF NOT EXISTS alix_mission_event (
  id bigserial PRIMARY KEY,
  mission_id text NOT NULL REFERENCES alix_mission(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_mission_event_mission
  ON alix_mission_event (mission_id, created_at);

ALTER TABLE ai_workflow_run
  ADD COLUMN IF NOT EXISTS mission_id text;

CREATE INDEX IF NOT EXISTS ai_workflow_run_mission_idx
  ON ai_workflow_run (mission_id, criado_em DESC);

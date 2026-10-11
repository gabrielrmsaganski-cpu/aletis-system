-- ============================================================
-- ALETIS — ALIX avaliação, governança e automação segura
--
-- Etapa 7: releases somente após evals, métricas e aprovação humana.
-- Etapa 8: sugestões proativas rastreáveis + confirmação proporcional.
-- ============================================================

CREATE TABLE IF NOT EXISTS alix_governance_release (
  id text PRIMARY KEY,
  component text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('prompt','model','policy','workflow')),
  candidate_version text NOT NULL,
  baseline_version text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','evaluating','evaluated','approved','rejected','active','rolled_back')),
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  dataset_version integer NOT NULL DEFAULT 1 CHECK (dataset_version > 0),
  evaluation_passed boolean NOT NULL DEFAULT false,
  created_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (component, candidate_version)
);

CREATE INDEX IF NOT EXISTS idx_alix_governance_release_status
  ON alix_governance_release (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_governance_release_component
  ON alix_governance_release (component, activated_at DESC);

CREATE TABLE IF NOT EXISTS alix_governance_eval_run (
  id text PRIMARY KEY,
  release_id text REFERENCES alix_governance_release(id) ON DELETE SET NULL,
  suite text NOT NULL,
  dataset_version integer NOT NULL DEFAULT 1 CHECK (dataset_version > 0),
  sample_size integer NOT NULL CHECK (sample_size > 0),
  passed integer NOT NULL CHECK (passed >= 0),
  failed integer NOT NULL CHECK (failed >= 0),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  git_sha text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (passed + failed = sample_size)
);

CREATE INDEX IF NOT EXISTS idx_alix_governance_eval_release
  ON alix_governance_eval_run (release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_governance_eval_suite
  ON alix_governance_eval_run (suite, created_at DESC);

CREATE TABLE IF NOT EXISTS alix_automation_suggestion (
  id text PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,
  cliente_id text,
  suggestion_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','important','critical')),
  risk_level text NOT NULL DEFAULT 'read' CHECK (risk_level IN ('read','internal','write','external','critical')),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','awaiting_confirmation','approved','auto_executed','executed','dismissed','expired','failed')),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmation_id text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_alix_automation_suggestion_queue
  ON alix_automation_suggestion (status, severity, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_automation_suggestion_client
  ON alix_automation_suggestion (cliente_id, status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS alix_confirmation_approval (
  id text PRIMARY KEY,
  confirmation_id text NOT NULL,
  batch_id text,
  actor_id text NOT NULL,
  approval_step integer NOT NULL CHECK (approval_step > 0),
  decision text NOT NULL CHECK (decision IN ('approved','rejected','executed','failed')),
  risk_level text NOT NULL,
  tool_name text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_confirmation_approval_confirmation
  ON alix_confirmation_approval (confirmation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alix_confirmation_approval_actor
  ON alix_confirmation_approval (actor_id, created_at DESC);

-- Baseline ativo: documenta a versão validada nas etapas anteriores.
INSERT INTO alix_governance_release (
  id, component, change_type, candidate_version, status, thresholds,
  metrics, evidence, dataset_version, evaluation_passed, created_by,
  reviewed_by, reviewed_at, activated_at
) VALUES (
  'govrel_alix_orchestrator_v4_baseline',
  'alix.orchestrator',
  'prompt',
  'v4-baseline',
  'active',
  '{"minPassRate":0.95,"minEvidenceRate":0.98,"minSampleSize":100,"maxCriticalFailures":0}'::jsonb,
  '{"sampleSize":103,"passed":103,"failed":0,"passRate":1,"evidenceRate":1,"criticalFailures":0}'::jsonb,
  '[{"kind":"ci","label":"Promptfoo + reliability + golden set","cases":103}]'::jsonb,
  1,
  true,
  'system',
  'system-baseline',
  now(),
  now()
) ON CONFLICT (component, candidate_version) DO NOTHING;

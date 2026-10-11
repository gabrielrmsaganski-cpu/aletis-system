-- Mantém a avaliação que originou a baseline ativa no mesmo histórico
-- consultado pelo painel de governança.
INSERT INTO alix_governance_eval_run (
  id, release_id, suite, dataset_version, sample_size, passed, failed,
  metrics, evidence, created_by
) VALUES (
  'goveval_alix_orchestrator_v4_baseline',
  'govrel_alix_orchestrator_v4_baseline',
  'alix-baseline-promptfoo-reliability-golden',
  1,
  103,
  103,
  0,
  '{"sampleSize":103,"passed":103,"failed":0,"passRate":1,"evidenceRate":1,"criticalFailures":0}'::jsonb,
  '[{"kind":"ci","label":"Promptfoo + reliability + golden set","cases":103}]'::jsonb,
  'system'
) ON CONFLICT (id) DO NOTHING;

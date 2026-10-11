-- ALETIS Operational Core
-- Consolida identidade organizacional, entidades rurais/financeiras,
-- simulações versionadas, skills, automações, artefatos e notificações.

CREATE TABLE IF NOT EXISTS organization (
  id text PRIMARY KEY,
  name text NOT NULL,
  legal_name text,
  tax_id text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS office (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  name text NOT NULL,
  city text,
  state varchar(2),
  timezone text NOT NULL DEFAULT 'America/Cuiaba',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS app_user (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  office_id text REFERENCES office(id),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  job_title text,
  avatar_url text,
  status text NOT NULL DEFAULT 'active',
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organization (id, name, legal_name)
VALUES ('org-aletis', 'ALETIS', 'ALETIS Finanças Estratégicas & Agrobusiness')
ON CONFLICT (id) DO NOTHING;

INSERT INTO office (id, organization_id, name, city, state)
VALUES
  ('office-aletis', 'org-aletis', 'ALETIS', NULL, NULL),
  ('office-canarana', 'org-aletis', 'Canarana', 'Canarana', 'MT')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_user (id, organization_id, office_id, email, display_name, job_title)
VALUES
  ('consultor-christian', 'org-aletis', 'office-aletis', 'christian@aletis.com.br', 'Christian Kohler', 'Consultor sênior'),
  ('consultor-regis', 'org-aletis', 'office-canarana', 'regis@aletis.com.br', 'Regis', 'Consultor'),
  ('consultora-eliandra', 'org-aletis', 'office-canarana', 'eliandra@aletis.com.br', 'Eliandra', 'Consultora')
ON CONFLICT (id) DO UPDATE SET
  organization_id = excluded.organization_id,
  office_id = excluded.office_id,
  email = excluded.email,
  display_name = excluded.display_name,
  job_title = excluded.job_title,
  updated_at = now();

ALTER TABLE cliente ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS office_id text;
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS responsible_user_id text;
UPDATE cliente SET organization_id = 'org-aletis' WHERE organization_id IS NULL;
UPDATE cliente
SET office_id = CASE WHEN lower(coalesce(escritorio, '')) LIKE '%canarana%' THEN 'office-canarana' ELSE 'office-aletis' END
WHERE office_id IS NULL;
ALTER TABLE cliente ALTER COLUMN organization_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cliente_organization_fk') THEN
    ALTER TABLE cliente ADD CONSTRAINT cliente_organization_fk FOREIGN KEY (organization_id) REFERENCES organization(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cliente_office_fk') THEN
    ALTER TABLE cliente ADD CONSTRAINT cliente_office_fk FOREIGN KEY (office_id) REFERENCES office(id) NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS cliente_organization_office_idx ON cliente (organization_id, office_id);

CREATE TABLE IF NOT EXISTS rural_property (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES cliente(id),
  organization_id text NOT NULL REFERENCES organization(id),
  name text NOT NULL,
  car_code text,
  cib_nirf text,
  registration_number text,
  city text,
  state varchar(2),
  ibge_city_code text,
  total_area_ha numeric(18,4),
  location jsonb,
  source text NOT NULL DEFAULT 'crm',
  source_id text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rural_property_client_idx ON rural_property (client_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS rural_property_car_uidx ON rural_property (organization_id, car_code) WHERE car_code IS NOT NULL AND car_code <> '';

INSERT INTO rural_property (
  id, client_id, organization_id, name, car_code, city, state, total_area_ha,
  source, source_id, valid_from, metadata
)
SELECT
  'property-' || substr(md5(c.id || ':' || coalesce(c.payload #>> '{car,codImovel}', 'principal')), 1, 20),
  c.id,
  c.organization_id,
  coalesce(nullif(c.payload #>> '{car,nome}', ''), 'Imóvel rural principal'),
  nullif(coalesce(c.payload #>> '{car,codImovel}', c.payload ->> 'carCodigoImovel'), ''),
  coalesce(nullif(c.payload #>> '{car,municipio}', ''), c.cidade),
  coalesce(nullif(c.payload #>> '{car,uf}', ''), c.uf),
  CASE
    WHEN coalesce(c.payload #>> '{car,areaImovel}', '') ~ '^[0-9]+([.,][0-9]+)?$'
      THEN replace(c.payload #>> '{car,areaImovel}', ',', '.')::numeric
    WHEN coalesce(c.area_total_ha::text, '') ~ '^[0-9]+([.][0-9]+)?$' THEN c.area_total_ha
    ELSE NULL
  END,
  'crm_backfill',
  c.id || ':car:principal',
  coalesce(c.ultima_atualizacao, c.criado_em, now()),
  jsonb_build_object('backfilledAt', now(), 'confidence', CASE WHEN c.payload ? 'car' THEN 0.9 ELSE 0.6 END)
FROM cliente c
WHERE c.payload ? 'car' OR c.area_total_ha IS NOT NULL
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS crop (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES cliente(id),
  rural_property_id text REFERENCES rural_property(id),
  name text NOT NULL,
  variety text,
  area_ha numeric(18,4),
  productivity numeric(18,4),
  productivity_unit text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crop_client_idx ON crop (client_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS harvest (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES cliente(id),
  crop_id text REFERENCES crop(id),
  season text NOT NULL,
  planting_date date,
  harvest_date date,
  area_ha numeric(18,4),
  expected_production numeric(18,4),
  actual_production numeric(18,4),
  status text NOT NULL DEFAULT 'planned',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS harvest_client_season_idx ON harvest (client_id, season);

CREATE TABLE IF NOT EXISTS creditor (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  name text NOT NULL,
  legal_name text,
  tax_id text,
  kind text NOT NULL DEFAULT 'financial_institution',
  contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS creditor_org_name_uidx ON creditor (organization_id, lower(name));

INSERT INTO creditor (id, organization_id, name)
SELECT 'cred-' || substr(md5(lower(trim(credor))), 1, 16), 'org-aletis', trim(credor)
FROM cliente
WHERE trim(coalesce(credor, '')) <> ''
ON CONFLICT (organization_id, lower(name)) DO NOTHING;

INSERT INTO creditor (id, organization_id, name)
SELECT DISTINCT
  'cred-' || substr(md5(lower(trim(d.item ->> 'credor'))), 1, 16),
  c.organization_id,
  trim(d.item ->> 'credor')
FROM cliente c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c.payload -> 'dividas') = 'array' THEN c.payload -> 'dividas' ELSE '[]'::jsonb END
) AS d(item)
WHERE trim(coalesce(d.item ->> 'credor', '')) <> ''
ON CONFLICT (organization_id, lower(name)) DO NOTHING;

CREATE TABLE IF NOT EXISTS client_debt (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES cliente(id),
  case_id text REFERENCES cliente_demanda(id),
  creditor_id text NOT NULL REFERENCES creditor(id),
  contract_number text,
  modality text,
  status text NOT NULL DEFAULT 'open',
  original_amount numeric(18,2),
  current_amount numeric(18,2),
  interest_rate numeric(18,8),
  contracted_at date,
  due_at date,
  source text NOT NULL DEFAULT 'crm',
  source_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_debt_client_idx ON client_debt (client_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS client_debt_case_creditor_idx ON client_debt (case_id, creditor_id);

INSERT INTO client_debt (
  id, client_id, creditor_id, contract_number, status, original_amount,
  current_amount, due_at, source, source_id, metadata
)
SELECT
  'debt-' || substr(md5(c.id || ':' || d.ordinality::text || ':' || coalesce(d.item ->> 'contrato', '')), 1, 20),
  c.id,
  cr.id,
  nullif(d.item ->> 'contrato', ''),
  CASE coalesce(d.item ->> 'status', 'ativa')
    WHEN 'paga' THEN 'paid'
    WHEN 'renegociada' THEN 'restructured'
    WHEN 'em_acordo' THEN 'negotiating'
    ELSE 'open'
  END,
  CASE WHEN coalesce(d.item ->> 'valorOriginal', '') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (d.item ->> 'valorOriginal')::numeric ELSE NULL END,
  CASE WHEN coalesce(d.item ->> 'valorAtualizado', '') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (d.item ->> 'valorAtualizado')::numeric ELSE NULL END,
  CASE WHEN coalesce(d.item ->> 'vencimento', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (d.item ->> 'vencimento')::date ELSE NULL END,
  'crm_backfill',
  c.id || ':divida:' || d.ordinality::text,
  jsonb_build_object('legacyPayload', d.item, 'backfilledAt', now())
FROM cliente c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c.payload -> 'dividas') = 'array' THEN c.payload -> 'dividas' ELSE '[]'::jsonb END
) WITH ORDINALITY AS d(item, ordinality)
JOIN creditor cr
  ON cr.organization_id = c.organization_id
 AND lower(cr.name) = lower(trim(d.item ->> 'credor'))
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS debt_guarantee (
  id text PRIMARY KEY,
  debt_id text NOT NULL REFERENCES client_debt(id) ON DELETE CASCADE,
  kind text NOT NULL,
  description text NOT NULL,
  amount numeric(18,2),
  rural_property_id text REFERENCES rural_property(id),
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS debt_guarantee_debt_idx ON debt_guarantee (debt_id, status);

CREATE TABLE IF NOT EXISTS simulation_workspace (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  office_id text REFERENCES office(id),
  user_id text REFERENCES app_user(id),
  client_id text REFERENCES cliente(id),
  case_id text REFERENCES cliente_demanda(id),
  creditor_id text REFERENCES creditor(id),
  debt_id text REFERENCES client_debt(id),
  kind text NOT NULL DEFAULT 'simulador_v16',
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  registered_version integer NOT NULL DEFAULT 0,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS simulation_workspace_client_idx ON simulation_workspace (client_id, kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS simulation_workspace_user_idx ON simulation_workspace (user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS calculation_snapshot (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES simulation_workspace(id) ON DELETE CASCADE,
  version integer NOT NULL,
  calculation_type text NOT NULL,
  input jsonb NOT NULL,
  output jsonb NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, version)
);
CREATE INDEX IF NOT EXISTS calculation_snapshot_workspace_idx ON calculation_snapshot (workspace_id, version DESC);

ALTER TABLE proposta ADD COLUMN IF NOT EXISTS creditor_id text;
ALTER TABLE proposta ADD COLUMN IF NOT EXISTS debt_id text;
ALTER TABLE proposta ADD COLUMN IF NOT EXISTS simulation_workspace_id text;
ALTER TABLE proposta ADD COLUMN IF NOT EXISTS responsible_user_id text;
ALTER TABLE proposta ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE proposta ADD COLUMN IF NOT EXISTS valid_until date;
ALTER TABLE proposta ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE proposta ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
CREATE INDEX IF NOT EXISTS proposta_operational_link_idx ON proposta (cliente_id, demanda_id, creditor_id, status);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposta_creditor_fk') THEN
    ALTER TABLE proposta ADD CONSTRAINT proposta_creditor_fk FOREIGN KEY (creditor_id) REFERENCES creditor(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposta_debt_fk') THEN
    ALTER TABLE proposta ADD CONSTRAINT proposta_debt_fk FOREIGN KEY (debt_id) REFERENCES client_debt(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposta_simulation_workspace_fk') THEN
    ALTER TABLE proposta ADD CONSTRAINT proposta_simulation_workspace_fk FOREIGN KEY (simulation_workspace_id) REFERENCES simulation_workspace(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposta_responsible_user_fk') THEN
    ALTER TABLE proposta ADD CONSTRAINT proposta_responsible_user_fk FOREIGN KEY (responsible_user_id) REFERENCES app_user(id) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS alix_skill (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  specialist text NOT NULL,
  current_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  last_run_at timestamptz,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  total_latency_ms bigint NOT NULL DEFAULT 0,
  total_cost_usd numeric(18,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alix_skill_version (
  id text PRIMARY KEY,
  skill_id text NOT NULL REFERENCES alix_skill(id) ON DELETE CASCADE,
  version integer NOT NULL,
  description text NOT NULL,
  instructions text NOT NULL,
  input_schema jsonb NOT NULL,
  output_schema jsonb NOT NULL,
  required_tools text[] NOT NULL DEFAULT ARRAY[]::text[],
  optional_tools text[] NOT NULL DEFAULT ARRAY[]::text[],
  trigger_examples text[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_contexts text[] NOT NULL DEFAULT ARRAY[]::text[],
  execution_mode text NOT NULL DEFAULT 'tool',
  timeout_ms integer NOT NULL DEFAULT 90000,
  max_iterations integer NOT NULL DEFAULT 8,
  active boolean NOT NULL DEFAULT true,
  evaluation_suite text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version)
);

WITH seed(slug, name, specialist, description) AS (
  VALUES
    ('client-intelligence', 'Inteligência de Cliente', 'client_intelligence', 'Cadastro 360, vínculos, saúde e próxima ação.'),
    ('prospecting-intelligence', 'Inteligência de Prospecção', 'prospecting_intelligence', 'Leads agro, território, enriquecimento e priorização.'),
    ('document-intelligence', 'Inteligência Documental', 'document_intelligence', 'Classificação, extração, evidências e divergências.'),
    ('financial-diagnostics', 'Diagnóstico Financeiro', 'financial_diagnostics', 'DRE, caixa, EBITDA, DSCR e cenários.'),
    ('rural-credit', 'Crédito Rural', 'rural_credit', 'Custeio, enquadramento, linhas e pacote bancário.'),
    ('debt-restructuring', 'Reestruturação de Dívida', 'debt_restructuring', 'Recálculo, indexadores, amortização e cenários.'),
    ('negotiation-strategy', 'Estratégia de Negociação', 'negotiation_strategy', 'Propostas, contrapropostas, prazos e economia.'),
    ('legal-document-generation', 'Documentos Jurídicos', 'legal_document_generation', 'Propostas, contratos, instrumentos e versões.'),
    ('market-climate-intelligence', 'Mercado e Clima', 'market_climate_intelligence', 'Exposição da carteira, mercado, clima e alertas.'),
    ('operations-reporting', 'Operações e Relatórios', 'operations_and_reporting', 'Tarefas, agenda, financeiro e indicadores.'),
    ('data-quality', 'Qualidade de Dados', 'data_quality', 'Frescor, reconciliação, coerência e contradições.')
)
INSERT INTO alix_skill (id, slug, name, specialist)
SELECT 'skill-' || slug, slug, name, specialist FROM seed
ON CONFLICT (slug) DO NOTHING;

WITH seed(slug, description) AS (
  VALUES
    ('client-intelligence', 'Cadastro 360, vínculos, saúde e próxima ação.'),
    ('prospecting-intelligence', 'Leads agro, território, enriquecimento e priorização.'),
    ('document-intelligence', 'Classificação, extração, evidências e divergências.'),
    ('financial-diagnostics', 'DRE, caixa, EBITDA, DSCR e cenários.'),
    ('rural-credit', 'Custeio, enquadramento, linhas e pacote bancário.'),
    ('debt-restructuring', 'Recálculo, indexadores, amortização e cenários.'),
    ('negotiation-strategy', 'Propostas, contrapropostas, prazos e economia.'),
    ('legal-document-generation', 'Propostas, contratos, instrumentos e versões.'),
    ('market-climate-intelligence', 'Exposição da carteira, mercado, clima e alertas.'),
    ('operations-reporting', 'Tarefas, agenda, financeiro e indicadores.'),
    ('data-quality', 'Frescor, reconciliação, coerência e contradições.')
)
INSERT INTO alix_skill_version (
  id, skill_id, version, description, instructions, input_schema, output_schema,
  trigger_examples, allowed_contexts, execution_mode, evaluation_suite
)
SELECT
  'skillv-' || slug || '-1', 'skill-' || slug, 1, description,
  'Execute somente no contexto explícito da organização, cliente e caso. Classifique fatos, premissas, cálculos, inferências, recomendações, desatualização e contradições; devolva evidências e próxima ação executável.',
  '{"type":"object","additionalProperties":false,"properties":{"organizationId":{"type":"string"},"clientId":{"type":"string"},"caseId":{"type":"string"},"objective":{"type":"string"}},"required":["organizationId","objective"]}'::jsonb,
  '{"type":"object","additionalProperties":false,"properties":{"status":{"type":"string"},"facts":{"type":"array"},"recommendations":{"type":"array"},"actions":{"type":"array"},"evidence":{"type":"array"}},"required":["status","facts","recommendations","actions","evidence"]}'::jsonb,
  ARRAY[description], ARRAY['organization','client','case','mission'], 'agent_as_tool', 'alix-operational-core-v1'
FROM seed
ON CONFLICT (skill_id, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS alix_tool_call_log (
  id text PRIMARY KEY,
  mission_id text REFERENCES alix_mission(id) ON DELETE SET NULL,
  step_id text REFERENCES alix_mission_step(id) ON DELETE SET NULL,
  skill_id text REFERENCES alix_skill(id) ON DELETE SET NULL,
  organization_id text NOT NULL REFERENCES organization(id),
  client_id text REFERENCES cliente(id),
  case_id text REFERENCES cliente_demanda(id),
  tool_name text NOT NULL,
  tool_version text NOT NULL,
  idempotency_key text,
  status text NOT NULL,
  input jsonb NOT NULL,
  output jsonb,
  error_code text,
  error_message text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  latency_ms integer,
  UNIQUE (organization_id, tool_name, idempotency_key)
);
CREATE INDEX IF NOT EXISTS alix_tool_call_mission_idx ON alix_tool_call_log (mission_id, started_at DESC);

CREATE TABLE IF NOT EXISTS generated_artifact (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  client_id text REFERENCES cliente(id),
  case_id text REFERENCES cliente_demanda(id),
  mission_id text REFERENCES alix_mission(id),
  kind text NOT NULL,
  title text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'generated',
  storage_key text,
  mime_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, kind, title, version)
);

CREATE TABLE IF NOT EXISTS automation_rule (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  name text NOT NULL,
  trigger_type text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  schedule text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

INSERT INTO automation_rule (id, organization_id, name, trigger_type, actions)
VALUES
 ('automation-hot-lead', 'org-aletis', 'Novo lead quente', 'lead.hot', '["deduplicate","enrich","score","assign_consultant","create_task","prepare_approach"]'),
 ('automation-new-document', 'org-aletis', 'Novo documento', 'document.received', '["classify","extract","link","update_fact_ledger","create_pending_tasks"]'),
 ('automation-client-idle', 'org-aletis', 'Cliente sem contato', 'client.contact_overdue', '["recalculate_priority","prepare_follow_up","create_task","offer_appointment"]'),
 ('automation-proposal-sent', 'org-aletis', 'Proposta enviada', 'proposal.sent', '["open_negotiation","set_deadline","schedule_follow_ups"]'),
 ('automation-proposal-accepted', 'org-aletis', 'Proposta aceita', 'proposal.accepted', '["advance_negotiation","generate_contract","create_checklist","schedule_execution"]'),
 ('automation-index-updated', 'org-aletis', 'Índice oficial atualizado', 'index.updated', '["version_series","find_affected_calculations","recalculate_drafts","notify_material_changes"]'),
 ('automation-market-climate', 'org-aletis', 'Mudança de mercado ou clima', 'portfolio.exposure_changed', '["identify_exposure","calculate_impact","prioritize_cases","recommend_action"]'),
 ('automation-whatsapp', 'org-aletis', 'WhatsApp recebido', 'whatsapp.received', '["identify_client","transcribe_audio","classify_intent","ingest_documents","create_task","suggest_reply"]'),
 ('automation-daily', 'org-aletis', 'Início do dia', 'schedule.daily_start', '["prepare_daily_operational_brief"]'),
 ('automation-weekly', 'org-aletis', 'Fechamento semanal', 'schedule.weekly_close', '["prepare_weekly_operational_report"]')
ON CONFLICT (organization_id, name) DO NOTHING;

CREATE TABLE IF NOT EXISTS operational_notification (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  user_id text REFERENCES app_user(id),
  client_id text REFERENCES cliente(id),
  source_type text NOT NULL,
  source_id text,
  priority text NOT NULL DEFAULT 'normal',
  title text NOT NULL,
  body text,
  action jsonb,
  read_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_notification_inbox_idx ON operational_notification (organization_id, user_id, read_at, priority, created_at DESC);

CREATE TABLE IF NOT EXISTS data_source_snapshot (
  id text PRIMARY KEY,
  source_name text NOT NULL,
  series text NOT NULL,
  unit text NOT NULL,
  location text,
  reference_at timestamptz NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  value numeric(30,12),
  status text NOT NULL,
  fallback_method text,
  confidence numeric(5,4),
  freshness_seconds integer,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_name, series, location, reference_at)
);
CREATE INDEX IF NOT EXISTS data_source_snapshot_current_idx ON data_source_snapshot (source_name, series, reference_at DESC);

CREATE TABLE IF NOT EXISTS client_interaction (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES cliente(id),
  case_id text REFERENCES cliente_demanda(id),
  channel text NOT NULL,
  direction text,
  occurred_at timestamptz NOT NULL,
  summary text NOT NULL,
  source_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_interaction_timeline_idx ON client_interaction (client_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS appointment (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  client_id text REFERENCES cliente(id),
  case_id text REFERENCES cliente_demanda(id),
  responsible_user_id text REFERENCES app_user(id),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  provider text,
  external_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointment_responsible_idx ON appointment (responsible_user_id, starts_at, status);

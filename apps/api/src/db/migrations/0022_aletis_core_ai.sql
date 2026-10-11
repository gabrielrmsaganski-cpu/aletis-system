-- ============================================================
-- ALETIS Core AI — CRM normalizado, documentos, IA workflows
-- e eventos de automação.
--
-- Migração aditiva: não remove nem altera tabelas legadas. O core
-- atual continua em cliente.payload, portal_upload, alix_* e whatsapp_*.
-- ============================================================

-- ── CRM Core ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_contact (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'contato',
  cargo TEXT,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  principal BOOLEAN NOT NULL DEFAULT false,
  origem TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'ativo',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_contact_cliente_idx ON client_contact (cliente_id, status);
CREATE INDEX IF NOT EXISTS client_contact_email_idx ON client_contact (email);
CREATE INDEX IF NOT EXISTS client_contact_telefone_idx ON client_contact (telefone);

CREATE TABLE IF NOT EXISTS client_task (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  prioridade TEXT NOT NULL DEFAULT 'normal',
  responsavel_id TEXT,
  responsavel_nome TEXT,
  due_at TIMESTAMPTZ,
  concluida_em TIMESTAMPTZ,
  criado_por TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_task_cliente_idx ON client_task (cliente_id, status);
CREATE INDEX IF NOT EXISTS client_task_due_idx ON client_task (due_at, status);
CREATE INDEX IF NOT EXISTS client_task_responsavel_idx ON client_task (responsavel_id, status);

CREATE TABLE IF NOT EXISTS client_meeting (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'agendada',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  consultor_id TEXT,
  consultor_nome TEXT,
  calendar_provider TEXT,
  external_event_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_meeting_cliente_idx ON client_meeting (cliente_id, start_at);
CREATE INDEX IF NOT EXISTS client_meeting_status_idx ON client_meeting (status, start_at);
CREATE INDEX IF NOT EXISTS client_meeting_external_idx ON client_meeting (calendar_provider, external_event_id);

CREATE TABLE IF NOT EXISTS client_contract (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  credor TEXT,
  numero_contrato TEXT,
  tipo TEXT NOT NULL DEFAULT 'financeiro',
  status TEXT NOT NULL DEFAULT 'ativo',
  valor_original NUMERIC(18,2),
  valor_atual NUMERIC(18,2),
  moeda TEXT NOT NULL DEFAULT 'BRL',
  data_assinatura TEXT,
  data_vencimento TEXT,
  documento_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_contract_cliente_idx ON client_contract (cliente_id, status);
CREATE INDEX IF NOT EXISTS client_contract_credor_idx ON client_contract (credor);
CREATE INDEX IF NOT EXISTS client_contract_documento_idx ON client_contract (documento_id);

CREATE TABLE IF NOT EXISTS client_timeline_event (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  source_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'internal',
  created_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_timeline_event_cliente_idx ON client_timeline_event (cliente_id, created_at);
CREATE INDEX IF NOT EXISTS client_timeline_event_source_idx ON client_timeline_event (source, source_id);
CREATE INDEX IF NOT EXISTS client_timeline_event_type_idx ON client_timeline_event (event_type);

CREATE TABLE IF NOT EXISTS client_permission (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'consultor',
  permissions TEXT[],
  granted_by TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS client_permission_cliente_user_uidx ON client_permission (cliente_id, user_id);
CREATE INDEX IF NOT EXISTS client_permission_user_idx ON client_permission (user_id, revoked_at);
CREATE INDEX IF NOT EXISTS client_permission_cliente_idx ON client_permission (cliente_id, revoked_at);

-- ── Central Inteligente de Documentos ───────────────────────
CREATE TABLE IF NOT EXISTS document_category (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS document_category_code_uidx ON document_category (code);
CREATE INDEX IF NOT EXISTS document_category_ativo_idx ON document_category (ativo, ordem);

CREATE TABLE IF NOT EXISTS core_document (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'documento',
  mime TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'outros',
  status TEXT NOT NULL DEFAULT 'recebido',
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_key TEXT NOT NULL,
  url_arquivo TEXT,
  sha256 TEXT,
  tamanho INTEGER NOT NULL DEFAULT 0,
  texto_extraido TEXT,
  embedding_status TEXT NOT NULL DEFAULT 'pending',
  rag_status TEXT NOT NULL DEFAULT 'not_indexed',
  rag_provider TEXT,
  criado_por TEXT,
  validade TIMESTAMPTZ,
  observacoes TEXT,
  source TEXT NOT NULL DEFAULT 'crm',
  source_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS core_document_cliente_idx ON core_document (cliente_id, status, criado_em);
CREATE INDEX IF NOT EXISTS core_document_categoria_idx ON core_document (categoria, status);
CREATE INDEX IF NOT EXISTS core_document_sha_cliente_idx ON core_document (cliente_id, sha256);
CREATE INDEX IF NOT EXISTS core_document_rag_idx ON core_document (rag_status, embedding_status);
CREATE INDEX IF NOT EXISTS core_document_source_idx ON core_document (source, source_id);

CREATE TABLE IF NOT EXISTS document_version (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  nome TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  tamanho INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  texto_extraido TEXT,
  criado_por TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS document_version_document_number_uidx ON document_version (document_id, version_number);
CREATE INDEX IF NOT EXISTS document_version_document_idx ON document_version (document_id, criado_em);

INSERT INTO document_category (id, code, nome, descricao, ordem)
VALUES
  ('doc-cat-identidade', 'identidade', 'Identificação', 'Documentos pessoais, societários e cadastrais.', 10),
  ('doc-cat-contrato', 'contrato', 'Contratos', 'Contratos bancários, CPRs, aditivos e instrumentos financeiros.', 20),
  ('doc-cat-fiscal', 'fiscal', 'Fiscal e Contábil', 'Notas, declarações, balanços, DRE e comprovantes fiscais.', 30),
  ('doc-cat-patrimonio', 'patrimonio', 'Patrimônio e Garantias', 'Matrículas, CAR, CCIR, ITR, garantias e bens.', 40),
  ('doc-cat-agro', 'agro', 'Produção Agro', 'Safra, custeio, produtividade, estoques e viabilidade agrícola.', 50),
  ('doc-cat-proposta', 'proposta', 'Propostas', 'Propostas de bancos, credores e parceiros.', 60),
  ('doc-cat-outros', 'outros', 'Outros', 'Arquivos de apoio não classificados.', 90)
ON CONFLICT (code) DO NOTHING;

-- ── IA Workflows + automações ───────────────────────────────
CREATE TABLE IF NOT EXISTS ai_workflow (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  provider TEXT NOT NULL DEFAULT 'internal',
  status TEXT NOT NULL DEFAULT 'draft',
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_workflow_code_uidx ON ai_workflow (code);
CREATE INDEX IF NOT EXISTS ai_workflow_status_idx ON ai_workflow (status, provider);

CREATE TABLE IF NOT EXISTS ai_workflow_run (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  cliente_id TEXT,
  document_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_workflow_run_workflow_idx ON ai_workflow_run (workflow_id, criado_em);
CREATE INDEX IF NOT EXISTS ai_workflow_run_cliente_idx ON ai_workflow_run (cliente_id, criado_em);
CREATE INDEX IF NOT EXISTS ai_workflow_run_status_idx ON ai_workflow_run (status, criado_em);

CREATE TABLE IF NOT EXISTS automation_event (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  target_provider TEXT NOT NULL DEFAULT 'internal',
  target_url TEXT,
  next_attempt_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_event_status_idx ON automation_event (status, next_attempt_at, criado_em);
CREATE INDEX IF NOT EXISTS automation_event_type_idx ON automation_event (event_type, criado_em);

INSERT INTO ai_workflow (id, code, nome, descricao, provider, status, input_schema, output_schema, config)
VALUES
  ('wf-client-summary', 'client_summary', 'Resumo executivo do cliente', 'Gera briefing operacional para reunião, com fatos, pendências e próximos passos.', 'internal', 'active', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('wf-document-analysis', 'document_analysis', 'Análise documental', 'Classifica documento, extrai campos relevantes e sugere conferências.', 'internal', 'active', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('wf-task-generation', 'task_generation', 'Geração de tarefas', 'Sugere tarefas a partir de documentos, conversas e status do cliente.', 'internal', 'active', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('wf-risk-analysis', 'risk_analysis', 'Análise de riscos', 'Identifica riscos financeiros, documentais e operacionais com base nos dados disponíveis.', 'internal', 'active', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('wf-whatsapp-reply', 'whatsapp_reply_suggestion', 'Sugestão de resposta WhatsApp', 'Prepara resposta assistida seguindo estado do atendimento e regras comerciais.', 'internal', 'active', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('wf-contract-review', 'contract_review', 'Revisão de contrato', 'Extrai condições principais, vencimentos, valores, garantias e pontos de atenção.', 'internal', 'active', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('wf-meeting-briefing', 'meeting_briefing', 'Briefing de reunião', 'Prepara pauta objetiva para o consultor antes de contato ou reunião.', 'internal', 'active', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (code) DO NOTHING;

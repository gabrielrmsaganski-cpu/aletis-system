-- ============================================================
-- ALETIS — WHATSAPP IA API hardening
--
-- Camada operacional propria acima da Evolution API:
-- instancias, contatos, estado, checklist configuravel, mídia,
-- pedidos documentais, booking, outbox e auditoria.
-- ============================================================

ALTER TABLE whatsapp_conversation
  ADD COLUMN IF NOT EXISTS crm_status TEXT NOT NULL DEFAULT 'Novo lead',
  ADD COLUMN IF NOT EXISTS current_state TEXT NOT NULL DEFAULT 'new_lead',
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS assigned_user_id TEXT,
  ADD COLUMN IF NOT EXISTS takeover_reason TEXT,
  ADD COLUMN IF NOT EXISTS takeover_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eligibility_score INTEGER NOT NULL DEFAULT 0;

ALTER TABLE whatsapp_message
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS whatsapp_instance (
  id TEXT PRIMARY KEY,
  instance_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'evolution',
  status TEXT NOT NULL DEFAULT 'unknown',
  connection_state TEXT,
  phone TEXT,
  qr_code TEXT,
  webhook_url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instance_name_uidx ON whatsapp_instance (instance_name);
CREATE INDEX IF NOT EXISTS whatsapp_instance_status_idx ON whatsapp_instance (status);

CREATE TABLE IF NOT EXISTS whatsapp_contact (
  id TEXT PRIMARY KEY,
  instance_name TEXT NOT NULL,
  telefone TEXT NOT NULL,
  wa_jid TEXT,
  nome_contato TEXT,
  cliente_id TEXT,
  lead_id TEXT,
  origem TEXT NOT NULL DEFAULT 'whatsapp',
  canal TEXT NOT NULL DEFAULT 'evolution-api',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_contact_instance_phone_uidx ON whatsapp_contact (instance_name, telefone);
CREATE INDEX IF NOT EXISTS whatsapp_contact_cliente_idx ON whatsapp_contact (cliente_id);

CREATE TABLE IF NOT EXISTS whatsapp_conversation_state (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  state TEXT NOT NULL,
  crm_status TEXT NOT NULL,
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  assigned_user_id TEXT,
  takeover_reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_conversation_state_idx ON whatsapp_conversation_state (conversation_id, criado_em);

CREATE TABLE IF NOT EXISTS whatsapp_media_file (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT,
  provider_media_id TEXT,
  media_type TEXT NOT NULL,
  mime_type TEXT,
  filename TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_key TEXT NOT NULL,
  sha256 TEXT,
  size_bytes INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_media_file_conversation_idx ON whatsapp_media_file (conversation_id, criado_em);
CREATE INDEX IF NOT EXISTS whatsapp_media_file_message_idx ON whatsapp_media_file (message_id);

CREATE TABLE IF NOT EXISTS eligibility_checklist (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS eligibility_checklist_code_version_uidx ON eligibility_checklist (code, version);
CREATE INDEX IF NOT EXISTS eligibility_checklist_active_idx ON eligibility_checklist (active);

CREATE TABLE IF NOT EXISTS eligibility_question (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  question_key TEXT NOT NULL,
  texto TEXT NOT NULL,
  tipo_resposta TEXT NOT NULL,
  obrigatoria BOOLEAN NOT NULL DEFAULT true,
  peso INTEGER NOT NULL DEFAULT 0,
  condicao JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eligibility_question_checklist_order_idx ON eligibility_question (checklist_id, ordem);
CREATE UNIQUE INDEX IF NOT EXISTS eligibility_question_key_uidx ON eligibility_question (checklist_id, question_key);

CREATE TABLE IF NOT EXISTS eligibility_result (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  checklist_id TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL,
  reasons TEXT[],
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS eligibility_result_conversation_uidx ON eligibility_result (conversation_id, checklist_id);
CREATE INDEX IF NOT EXISTS eligibility_result_idx ON eligibility_result (result, score);

CREATE TABLE IF NOT EXISTS whatsapp_document_request (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  cliente_id TEXT,
  document_key TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_doc_request_uidx ON whatsapp_document_request (conversation_id, document_key);
CREATE INDEX IF NOT EXISTS whatsapp_doc_request_status_idx ON whatsapp_document_request (status);

CREATE TABLE IF NOT EXISTS whatsapp_calendar_booking_option (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  option_number INTEGER NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offered',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_booking_option_conversation_idx ON whatsapp_calendar_booking_option (conversation_id, status);

CREATE TABLE IF NOT EXISTS whatsapp_calendar_booking (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  cliente_id TEXT,
  option_id TEXT,
  calendar_id TEXT,
  external_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'dry_run',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_booking_conversation_idx ON whatsapp_calendar_booking (conversation_id, status);
CREATE INDEX IF NOT EXISTS whatsapp_booking_external_event_idx ON whatsapp_calendar_booking (external_event_id);

CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  instance_name TEXT NOT NULL,
  to_number TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_storage_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  provider_message_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_outbox_status_idx ON whatsapp_outbox (status, queued_at);
CREATE INDEX IF NOT EXISTS whatsapp_outbox_conversation_idx ON whatsapp_outbox (conversation_id);

CREATE TABLE IF NOT EXISTS whatsapp_audit_log (
  id BIGSERIAL PRIMARY KEY,
  conversation_id TEXT,
  instance_name TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  level TEXT NOT NULL DEFAULT 'info',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_audit_conversation_idx ON whatsapp_audit_log (conversation_id, criado_em);
CREATE INDEX IF NOT EXISTS whatsapp_audit_action_idx ON whatsapp_audit_log (action, criado_em);

INSERT INTO eligibility_checklist (id, code, name, version, active, payload)
VALUES ('whatsapp-default-v1', 'whatsapp-default', 'Checklist WhatsApp IA ALETIS', 1, true, '{}'::jsonb)
ON CONFLICT (code, version) DO NOTHING;

INSERT INTO eligibility_question
  (id, checklist_id, ordem, question_key, texto, tipo_resposta, obrigatoria, peso, condicao, payload)
VALUES
  ('whatsapp-q1-perfil-agro', 'whatsapp-default-v1', 1, 'perfil_agro', 'Voce e produtor rural, empresa do agro ou possui relacao direta com atividade rural?', 'choice', true, 20, '{}'::jsonb, '{"choices":["produtor rural","empresa agro","cooperativa","outro"]}'::jsonb),
  ('whatsapp-q2-problema', 'whatsapp-default-v1', 2, 'problema_principal', 'Qual e o principal problema que deseja resolver?', 'text', true, 10, '{}'::jsonb, '{}'::jsonb),
  ('whatsapp-q3-situacao-financeira', 'whatsapp-default-v1', 3, 'situacao_financeira', 'Existe divida, contrato bancario, execucao, cobranca ou situacao financeira relevante?', 'boolean', true, 20, '{}'::jsonb, '{}'::jsonb),
  ('whatsapp-q4-valor', 'whatsapp-default-v1', 4, 'valor_envolvido', 'Qual e o valor aproximado envolvido?', 'money', true, 20, '{}'::jsonb, '{}'::jsonb),
  ('whatsapp-q5-docs', 'whatsapp-default-v1', 5, 'documentacao_minima', 'Existe documentacao minima para analise, como contrato, proposta, extrato ou notificacao?', 'boolean', true, 15, '{}'::jsonb, '{}'::jsonb),
  ('whatsapp-q6-consultor', 'whatsapp-default-v1', 6, 'deseja_consultor', 'Voce deseja falar com um consultor da ALETIS?', 'boolean', true, 10, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (checklist_id, question_key) DO NOTHING;

-- ============================================================
-- ALETIS — Central WhatsApp IA (Evolution API)
--
-- Persistencia de conversas, mensagens, documentos, respostas de
-- elegibilidade, eventos brutos de webhook e agendamentos.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_conversation (
  id TEXT PRIMARY KEY,
  cliente_id TEXT,
  lead_id TEXT,
  telefone TEXT NOT NULL,
  wa_jid TEXT,
  nome_contato TEXT,
  instance_name TEXT NOT NULL,
  atendimento_modo TEXT NOT NULL DEFAULT 'ia',
  status TEXT NOT NULL DEFAULT 'aberta',
  etapa TEXT NOT NULL DEFAULT 'boas_vindas',
  elegibilidade_status TEXT NOT NULL DEFAULT 'em_coleta',
  prioridade TEXT NOT NULL DEFAULT 'normal',
  tags TEXT[],
  resumo TEXT,
  ultima_mensagem_em TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_conversation_telefone_idx
  ON whatsapp_conversation (telefone);
CREATE INDEX IF NOT EXISTS whatsapp_conversation_cliente_idx
  ON whatsapp_conversation (cliente_id);
CREATE INDEX IF NOT EXISTS whatsapp_conversation_instance_idx
  ON whatsapp_conversation (instance_name, status);
CREATE INDEX IF NOT EXISTS whatsapp_conversation_updated_idx
  ON whatsapp_conversation (atualizado_em);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversation_instance_phone_uidx
  ON whatsapp_conversation (instance_name, telefone);

CREATE TABLE IF NOT EXISTS whatsapp_message (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  provider_message_id TEXT,
  direction TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  text TEXT,
  transcription TEXT,
  media_url TEXT,
  media_mime TEXT,
  media_filename TEXT,
  media_storage_key TEXT,
  from_number TEXT,
  to_number TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_message_conversation_idx
  ON whatsapp_message (conversation_id, timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_message_provider_uidx
  ON whatsapp_message (instance_name, provider_message_id);
CREATE INDEX IF NOT EXISTS whatsapp_message_status_idx
  ON whatsapp_message (status);

CREATE TABLE IF NOT EXISTS whatsapp_document (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  cliente_id TEXT,
  message_id TEXT,
  filename TEXT NOT NULL,
  mime_type TEXT,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_key TEXT NOT NULL,
  sha256 TEXT,
  categoria TEXT NOT NULL DEFAULT 'nao_classificado',
  status TEXT NOT NULL DEFAULT 'recebido',
  resumo_ia TEXT,
  classification JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_document_conversation_idx
  ON whatsapp_document (conversation_id, criado_em);
CREATE INDEX IF NOT EXISTS whatsapp_document_cliente_idx
  ON whatsapp_document (cliente_id, categoria);
CREATE INDEX IF NOT EXISTS whatsapp_document_status_idx
  ON whatsapp_document (status);

CREATE TABLE IF NOT EXISTS whatsapp_eligibility_answer (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  question_key TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  answer_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  score INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_eligibility_conversation_idx
  ON whatsapp_eligibility_answer (conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_eligibility_answer_uidx
  ON whatsapp_eligibility_answer (conversation_id, question_key);

CREATE TABLE IF NOT EXISTS whatsapp_webhook_event (
  id TEXT PRIMARY KEY,
  instance_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  error TEXT,
  payload JSONB NOT NULL,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  processado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS whatsapp_webhook_event_instance_idx
  ON whatsapp_webhook_event (instance_name, event_type, recebido_em);
CREATE INDEX IF NOT EXISTS whatsapp_webhook_event_provider_idx
  ON whatsapp_webhook_event (provider_message_id);

CREATE TABLE IF NOT EXISTS whatsapp_calendar_event (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  cliente_id TEXT,
  consultor TEXT NOT NULL DEFAULT 'Christian',
  calendar_id TEXT,
  external_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'dry_run',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Cuiaba',
  titulo TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_calendar_conversation_idx
  ON whatsapp_calendar_event (conversation_id);
CREATE INDEX IF NOT EXISTS whatsapp_calendar_start_idx
  ON whatsapp_calendar_event (start_at, status);

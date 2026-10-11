-- ============================================================
-- Google Workspace — OAuth seguro, Drive, Docs, Calendar e Gmail.
--
-- Migração aditiva: não altera tabelas existentes e mantém o sistema
-- funcionando mesmo sem Google conectado.
-- ============================================================

CREATE TABLE IF NOT EXISTS google_workspace_connection (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  google_email TEXT,
  google_account_id TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expiry TIMESTAMPTZ,
  scopes TEXT[],
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS google_workspace_connection_tenant_user_uidx
  ON google_workspace_connection (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS google_workspace_connection_tenant_status_idx
  ON google_workspace_connection (tenant_id, status);
CREATE INDEX IF NOT EXISTS google_workspace_connection_email_idx
  ON google_workspace_connection (google_email);

CREATE TABLE IF NOT EXISTS google_workspace_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  google_resource_id TEXT,
  status TEXT NOT NULL DEFAULT 'succeeded',
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS google_workspace_audit_tenant_idx
  ON google_workspace_audit_log (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS google_workspace_audit_resource_idx
  ON google_workspace_audit_log (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS google_workspace_audit_action_idx
  ON google_workspace_audit_log (action, status);

CREATE TABLE IF NOT EXISTS client_google_drive_folder (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  client_id TEXT NOT NULL,
  google_folder_id TEXT NOT NULL,
  folder_url TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  subfolders JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS client_google_drive_folder_tenant_client_uidx
  ON client_google_drive_folder (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS client_google_drive_folder_google_idx
  ON client_google_drive_folder (google_folder_id);

CREATE TABLE IF NOT EXISTS google_document (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  client_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  google_file_id TEXT NOT NULL,
  google_doc_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS google_document_tenant_client_idx
  ON google_document (tenant_id, client_id, created_at);
CREATE INDEX IF NOT EXISTS google_document_file_idx
  ON google_document (google_file_id);
CREATE INDEX IF NOT EXISTS google_document_type_idx
  ON google_document (document_type, status);

CREATE TABLE IF NOT EXISTS google_calendar_event (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  client_id TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  attendees TEXT[],
  event_url TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS google_calendar_event_tenant_client_idx
  ON google_calendar_event (tenant_id, client_id, start_time);
CREATE INDEX IF NOT EXISTS google_calendar_event_google_idx
  ON google_calendar_event (google_event_id);
CREATE INDEX IF NOT EXISTS google_calendar_event_status_idx
  ON google_calendar_event (status, start_time);

CREATE TABLE IF NOT EXISTS google_email_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  client_id TEXT NOT NULL,
  google_message_id TEXT,
  thread_id TEXT,
  direction TEXT NOT NULL DEFAULT 'outbound',
  subject TEXT NOT NULL,
  from_email TEXT,
  to_email TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  snippet TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS google_email_log_tenant_client_idx
  ON google_email_log (tenant_id, client_id, created_at);
CREATE INDEX IF NOT EXISTS google_email_log_message_idx
  ON google_email_log (google_message_id);
CREATE INDEX IF NOT EXISTS google_email_log_thread_idx
  ON google_email_log (thread_id);

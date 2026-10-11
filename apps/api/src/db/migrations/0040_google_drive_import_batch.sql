-- Recibos de importação: a mesma requisição retoma o lote e a sessão existentes.
create table if not exists google_drive_import_batch (
  id uuid primary key,
  tenant_id text not null,
  user_id text not null,
  cliente_id text not null,
  request_key uuid not null,
  request_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, cliente_id, request_key)
);
create index if not exists idx_google_drive_import_batch_owner
  on google_drive_import_batch (tenant_id, user_id, cliente_id, created_at desc);

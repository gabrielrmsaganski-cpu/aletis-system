-- Onda 1 do Portal do Cliente: persistência durável.
-- Tabelas: portal_acesso, portal_token, portal_mensagem,
-- portal_documento_pendente, portal_upload, portal_evento, portal_push.
-- Idempotente: usa IF NOT EXISTS para permitir re-runs em dev.

CREATE TABLE IF NOT EXISTS "portal_acesso" (
  "cliente_id" text PRIMARY KEY NOT NULL,
  "usuario" text NOT NULL,
  "senha_hash" text NOT NULL,
  "salt" text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "forca_troca_senha" boolean DEFAULT true NOT NULL,
  "ultimo_login_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "portal_acesso_usuario_idx" ON "portal_acesso" ("usuario");
CREATE INDEX IF NOT EXISTS "portal_acesso_ativo_idx" ON "portal_acesso" ("ativo");

CREATE TABLE IF NOT EXISTS "portal_token" (
  "id" text PRIMARY KEY NOT NULL,
  "cliente_id" text NOT NULL,
  "tipo" text NOT NULL,
  "token_hash" text NOT NULL,
  "expira_em" timestamp with time zone NOT NULL,
  "consumido_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "canal" text,
  "metadata" jsonb
);
CREATE INDEX IF NOT EXISTS "portal_token_cliente_tipo_idx" ON "portal_token" ("cliente_id","tipo");
CREATE INDEX IF NOT EXISTS "portal_token_exp_idx" ON "portal_token" ("expira_em");

CREATE TABLE IF NOT EXISTS "portal_mensagem" (
  "id" text PRIMARY KEY NOT NULL,
  "cliente_id" text NOT NULL,
  "de" text NOT NULL,
  "autor_nome" text,
  "texto" text NOT NULL,
  "anexos" jsonb,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "lida_em" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "portal_mensagem_cliente_idx" ON "portal_mensagem" ("cliente_id","criado_em");

CREATE TABLE IF NOT EXISTS "portal_documento_pendente" (
  "id" text PRIMARY KEY NOT NULL,
  "cliente_id" text NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "categoria" text,
  "obrigatorio" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'pendente' NOT NULL,
  "upload_id" text,
  "solicitado_por" text,
  "solicitado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "enviado_em" timestamp with time zone,
  "revisado_em" timestamp with time zone,
  "observacao" text
);
CREATE INDEX IF NOT EXISTS "portal_doc_pend_cliente_status_idx" ON "portal_documento_pendente" ("cliente_id","status");

CREATE TABLE IF NOT EXISTS "portal_upload" (
  "id" text PRIMARY KEY NOT NULL,
  "cliente_id" text NOT NULL,
  "pendencia_id" text,
  "nome_original" text NOT NULL,
  "nome_storage" text NOT NULL,
  "mime" text NOT NULL,
  "tamanho" integer NOT NULL,
  "sha256" text,
  "categoria" text,
  "enviado_por" text NOT NULL,
  "enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb
);
CREATE INDEX IF NOT EXISTS "portal_upload_cliente_idx" ON "portal_upload" ("cliente_id","enviado_em");
CREATE INDEX IF NOT EXISTS "portal_upload_pendencia_idx" ON "portal_upload" ("pendencia_id");

CREATE TABLE IF NOT EXISTS "portal_evento" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "cliente_id" text NOT NULL,
  "tipo" text NOT NULL,
  "canal" text,
  "ip" text,
  "user_agent" text,
  "detalhes" jsonb,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "portal_evento_cliente_idx" ON "portal_evento" ("cliente_id","criado_em");
CREATE INDEX IF NOT EXISTS "portal_evento_tipo_idx" ON "portal_evento" ("tipo");

CREATE TABLE IF NOT EXISTS "portal_push" (
  "id" text PRIMARY KEY NOT NULL,
  "cliente_id" text NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "ultimo_uso_em" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "portal_push_cliente_idx" ON "portal_push" ("cliente_id");

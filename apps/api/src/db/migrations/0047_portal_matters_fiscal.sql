-- Plano público do portal, separado da demanda e das observações internas.
CREATE TABLE portal_matter (
  id text PRIMARY KEY,
  cliente_id text NOT NULL REFERENCES cliente(id),
  demanda_id text REFERENCES cliente_demanda(id),
  status text NOT NULL CHECK (status IN ('nao_iniciado','em_andamento','aguardando_cliente','aguardando_terceiro','concluido','cancelado')),
  visibilidade text NOT NULL CHECK (visibilidade IN ('rascunho','publicado')),
  payload jsonb NOT NULL,
  versao integer NOT NULL DEFAULT 1 CHECK (versao > 0),
  idempotency_key text NOT NULL,
  create_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE(cliente_id,idempotency_key),
  UNIQUE(id,cliente_id),
  CONSTRAINT portal_matter_payload_check CHECK (jsonb_typeof(payload)='object' AND payload->>'status' IS NOT NULL AND payload->>'status'=status
    AND payload->>'visibilidade' IS NOT NULL AND payload->>'visibilidade'=visibilidade
    AND jsonb_typeof(payload->'marcos')='array' AND jsonb_array_length(payload->'marcos')<=100),
  CONSTRAINT portal_matter_publication_check CHECK ((visibilidade='publicado' AND published_at IS NOT NULL) OR (visibilidade='rascunho' AND published_at IS NULL))
);
CREATE INDEX portal_matter_client_idx ON portal_matter(cliente_id,visibilidade,updated_at DESC,id DESC);
CREATE INDEX portal_matter_demanda_idx ON portal_matter(demanda_id);
--> statement-breakpoint
CREATE TABLE portal_matter_revision (
  assunto_id text NOT NULL,
  cliente_id text NOT NULL,
  versao integer NOT NULL CHECK (versao > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  CONSTRAINT portal_matter_revision_snapshot_owner_check CHECK (snapshot->>'id' IS NOT NULL AND snapshot->>'id'=assunto_id AND snapshot->>'clienteId' IS NOT NULL AND snapshot->>'clienteId'=cliente_id),
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assunto_id,versao),
  UNIQUE(assunto_id,cliente_id,versao),
  FOREIGN KEY(assunto_id,cliente_id) REFERENCES portal_matter(id,cliente_id)
);
CREATE INDEX portal_matter_revision_client_idx ON portal_matter_revision(cliente_id,assunto_id,versao DESC);
CREATE TABLE portal_matter_event (
  id text PRIMARY KEY,
  assunto_id text NOT NULL,
  cliente_id text NOT NULL,
  versao integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('publicacao','atualizacao','marco_concluido','conclusao')),
  titulo text NOT NULL CHECK (length(titulo) BETWEEN 1 AND 200),
  descricao text NOT NULL CHECK (length(descricao) BETWEEN 1 AND 5000),
  marco_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(assunto_id,cliente_id,versao) REFERENCES portal_matter_revision(assunto_id,cliente_id,versao)
);
CREATE INDEX portal_matter_event_client_idx ON portal_matter_event(cliente_id,created_at DESC,id DESC);
CREATE INDEX portal_matter_event_assunto_idx ON portal_matter_event(cliente_id,assunto_id,created_at DESC,id DESC);
CREATE UNIQUE INDEX portal_matter_event_revision_unique ON portal_matter_event(assunto_id,versao,tipo,coalesce(marco_id,''));
--> statement-breakpoint
-- As versões e os fatos publicados só recebem novas entradas. Correções geram nova revisão.
CREATE FUNCTION portal_matter_protect_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'O histórico de assuntos do portal é imutável; registre uma nova revisão.' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER portal_matter_revision_immutable BEFORE UPDATE OR DELETE ON portal_matter_revision
  FOR EACH ROW EXECUTE FUNCTION portal_matter_protect_history();
CREATE TRIGGER portal_matter_event_immutable BEFORE UPDATE OR DELETE ON portal_matter_event
  FOR EACH ROW EXECUTE FUNCTION portal_matter_protect_history();

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS portal_fiscal_authorization (
  id text PRIMARY KEY, cliente_id text NOT NULL REFERENCES cliente(id), uf text NOT NULL,
  status text NOT NULL CHECK(status IN ('solicitada','em_conferencia','pendencia','conferida','recusada','revogada')),
  payload jsonb NOT NULL CONSTRAINT portal_fiscal_authorization_payload_check CHECK(jsonb_typeof(payload)='object' AND payload->>'uf' IS NOT NULL AND payload->>'uf'=uf), idempotency_key text NOT NULL, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_fiscal_authorization_idempotency_unique UNIQUE(cliente_id,idempotency_key), CONSTRAINT portal_fiscal_authorization_owner_unique UNIQUE(cliente_id,id),
  CHECK(uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'))
);
CREATE INDEX IF NOT EXISTS portal_fiscal_authorization_client_idx ON portal_fiscal_authorization(cliente_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS portal_fiscal_authorization_event (
  id text PRIMARY KEY, cliente_id text NOT NULL, authorization_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('solicitada','em_conferencia','pendencia','conferida','recusada','revogada')),
  descricao text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(cliente_id,authorization_id) REFERENCES portal_fiscal_authorization(cliente_id,id)
);
CREATE INDEX IF NOT EXISTS portal_fiscal_authorization_event_client_idx ON portal_fiscal_authorization_event(cliente_id,created_at DESC,id DESC);
CREATE OR REPLACE FUNCTION portal_fiscal_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fiscal authorization history is append-only'; END;
$$;
CREATE TRIGGER portal_fiscal_event_immutable BEFORE UPDATE OR DELETE ON portal_fiscal_authorization_event FOR EACH ROW EXECUTE FUNCTION portal_fiscal_event_append_only();

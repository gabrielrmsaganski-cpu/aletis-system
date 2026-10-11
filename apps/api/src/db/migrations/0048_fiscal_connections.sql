-- Credenciais privadas nunca entram no acervo documental nem no espelho legado.
CREATE TABLE fiscal_credential (
 id text PRIMARY KEY, cliente_id text NOT NULL REFERENCES cliente(id), documento text NOT NULL,
 uf text NOT NULL, status text NOT NULL CHECK(status IN ('ativa','suspensa')),
 metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object'), envelope jsonb,
 automacao boolean NOT NULL DEFAULT false, valid_until timestamptz NOT NULL,
 consent_version text NOT NULL DEFAULT 'consulta-nfe-2026-09-13', consented_at timestamptz NOT NULL DEFAULT now(),
 idempotency_key text NOT NULL, request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cliente_id,id), UNIQUE(cliente_id,idempotency_key),
 CHECK ((status='ativa' AND envelope IS NOT NULL) OR (status='suspensa' AND envelope IS NULL)),
 CHECK(uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'))
);
CREATE UNIQUE INDEX fiscal_credential_active_document_idx ON fiscal_credential(documento) WHERE status='ativa';
CREATE INDEX fiscal_credential_client_idx ON fiscal_credential(cliente_id,created_at DESC);
CREATE TABLE fiscal_nfe_cursor (
 documento text PRIMARY KEY, cliente_id text NOT NULL REFERENCES cliente(id),
 ult_nsu text NOT NULL DEFAULT '000000000000000' CHECK(ult_nsu ~ '^[0-9]{15}$'),
 max_nsu text NOT NULL DEFAULT '000000000000000' CHECK(max_nsu ~ '^[0-9]{15}$'),
 next_allowed_at timestamptz NOT NULL DEFAULT now(), last_attempt_at timestamptz, last_success_at timestamptz
);
CREATE TABLE fiscal_query (
 id text PRIMARY KEY, cliente_id text NOT NULL, credential_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('executando','sucesso','sem_documentos','bloqueada','erro')),
 message text NOT NULL, code text, document_count integer NOT NULL DEFAULT 0 CHECK(document_count>=0),
 idempotency_key text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 FOREIGN KEY(cliente_id,credential_id) REFERENCES fiscal_credential(cliente_id,id),
 UNIQUE(cliente_id,idempotency_key), UNIQUE(cliente_id,id)
);
CREATE INDEX fiscal_query_client_idx ON fiscal_query(cliente_id,started_at DESC);
CREATE TABLE fiscal_document (
 id text PRIMARY KEY, cliente_id text NOT NULL, query_id text NOT NULL, documento text NOT NULL,
 nsu text NOT NULL CHECK(nsu ~ '^[0-9]{15}$'), schema_name text NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), xml text NOT NULL CHECK(octet_length(xml)<=2097152),
 sha256 text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), portal_upload_id text,
 bridge_next_at timestamptz NOT NULL DEFAULT now(), bridge_attempts integer NOT NULL DEFAULT 0,
 FOREIGN KEY(cliente_id,query_id) REFERENCES fiscal_query(cliente_id,id),
 UNIQUE(documento,nsu), UNIQUE(cliente_id,id)
);
CREATE INDEX fiscal_document_client_idx ON fiscal_document(cliente_id,received_at DESC,id);
CREATE INDEX fiscal_document_pending_idx ON fiscal_document(bridge_next_at) WHERE portal_upload_id IS NULL;

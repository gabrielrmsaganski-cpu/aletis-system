-- Onda Command Center — Deal Room Multi-Credor
-- Tabela: negociacao_credor
-- Idempotente: usa IF NOT EXISTS para permitir re-runs.

CREATE TABLE IF NOT EXISTS "negociacao_credor" (
  "id" text PRIMARY KEY NOT NULL,
  "cliente_id" text NOT NULL,
  "credor" text NOT NULL,
  "status" text NOT NULL DEFAULT 'negociando',
  "responsavel" text,
  "valor_atual" numeric(18,2),
  "valor_proposto" numeric(18,2),
  "taxa_atual" numeric(8,4),
  "taxa_proposta" numeric(8,4),
  "prazo_meses" integer,
  "carencia_meses" integer,
  "garantias" jsonb,
  "docs_pendentes" jsonb,
  "historico" jsonb,
  "proxima_data" timestamp with time zone,
  "ultima_interacao" timestamp with time zone,
  "observacoes" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "negociacao_credor_cliente_idx" ON "negociacao_credor" ("cliente_id");
CREATE INDEX IF NOT EXISTS "negociacao_credor_status_idx" ON "negociacao_credor" ("status");
CREATE INDEX IF NOT EXISTS "negociacao_credor_proxima_data_idx" ON "negociacao_credor" ("proxima_data");

-- CHECK constraint para status (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'negociacao_credor_status_check'
  ) THEN
    ALTER TABLE "negociacao_credor" ADD CONSTRAINT negociacao_credor_status_check
      CHECK (status IN ('negociando','contraproposta','aguardando_doc','aprovado','recusado','encerrado','suspenso'));
  END IF;
END$$;

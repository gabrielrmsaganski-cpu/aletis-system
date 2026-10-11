-- Biblioteca do gerador jurídico /api/contratos, independente de client_contract.
-- Guarda o Markdown original e os metadados; PDF continua derivado sob demanda.
CREATE TABLE IF NOT EXISTS generated_contract (
  id text PRIMARY KEY,
  tipo text NOT NULL,
  titulo text NOT NULL,
  data_geracao timestamptz NOT NULL,
  cliente_id text REFERENCES cliente(id) ON DELETE SET NULL,
  proposta_id text REFERENCES proposta(id) ON DELETE SET NULL,
  valor_total numeric(18,2) NOT NULL CHECK (valor_total >= 0),
  payload jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS generated_contract_data_idx ON generated_contract(data_geracao);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS generated_contract_cliente_idx ON generated_contract(cliente_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS generated_contract_proposta_idx ON generated_contract(proposta_id);

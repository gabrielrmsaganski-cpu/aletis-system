ALTER TABLE client_contract ADD COLUMN IF NOT EXISTS proposta_id text;
ALTER TABLE client_contract ADD COLUMN IF NOT EXISTS negociacao_id text;
ALTER TABLE client_contract ADD COLUMN IF NOT EXISTS demanda_id text;

CREATE UNIQUE INDEX IF NOT EXISTS client_contract_proposta_uidx ON client_contract (proposta_id);
CREATE INDEX IF NOT EXISTS client_contract_negociacao_idx ON client_contract (negociacao_id);
CREATE INDEX IF NOT EXISTS client_contract_demanda_idx ON client_contract (demanda_id);

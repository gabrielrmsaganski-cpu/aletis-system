CREATE TABLE IF NOT EXISTS monetary_index (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  provider text NOT NULL,
  provider_series_id text NOT NULL,
  frequency text NOT NULL,
  unit text NOT NULL,
  calculation_method text NOT NULL,
  source_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS monetary_index_value (
  id text PRIMARY KEY,
  monetary_index_id text NOT NULL REFERENCES monetary_index(id),
  reference_period text NOT NULL,
  monthly_rate numeric(24,12) NOT NULL,
  index_number numeric(30,18),
  cumulative_factor numeric(36,18) NOT NULL,
  provider text NOT NULL,
  source text NOT NULL,
  source_url text NOT NULL,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1,
  checksum text,
  UNIQUE (monetary_index_id, reference_period, revision)
);
CREATE INDEX IF NOT EXISTS monetary_index_value_period_idx ON monetary_index_value(monetary_index_id, reference_period);
CREATE TABLE IF NOT EXISTS recalculo_acordo (
  id text PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  organization_id text NOT NULL DEFAULT 'default',
  usuario_id text,
  usuario_nome text,
  cliente_id text,
  proposta_id text,
  negociacao_id text,
  titulo text NOT NULL,
  indice_code text NOT NULL,
  corrigir_ate text NOT NULL,
  mora_mensal_pct numeric(12,8) NOT NULL,
  metodologia text NOT NULL,
  inputs jsonb NOT NULL,
  resultado jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  versao integer NOT NULL DEFAULT 1,
  arquivado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recalculo_acordo_org_idx ON recalculo_acordo(organization_id);
CREATE INDEX IF NOT EXISTS recalculo_acordo_cliente_idx ON recalculo_acordo(cliente_id);
CREATE INDEX IF NOT EXISTS recalculo_acordo_proposta_idx ON recalculo_acordo(proposta_id);
CREATE INDEX IF NOT EXISTS recalculo_acordo_negociacao_idx ON recalculo_acordo(negociacao_id);

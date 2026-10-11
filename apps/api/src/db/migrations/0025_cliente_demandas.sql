CREATE TABLE IF NOT EXISTS cliente_demanda (
  id text PRIMARY KEY,
  cliente_id text NOT NULL,
  titulo text NOT NULL,
  assunto text NOT NULL DEFAULT 'outro',
  descricao text,
  status text NOT NULL DEFAULT 'nova',
  prioridade text NOT NULL DEFAULT 'normal',
  responsavel text,
  credor text,
  valor_pretendido numeric(18,2),
  prazo_alvo text,
  origem text NOT NULL DEFAULT 'manual',
  proposta_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  documento_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cliente_demanda_cliente_idx
  ON cliente_demanda (cliente_id, atualizado_em);

CREATE INDEX IF NOT EXISTS cliente_demanda_status_idx
  ON cliente_demanda (status);

ALTER TABLE proposta ADD COLUMN IF NOT EXISTS demanda_id text;
CREATE INDEX IF NOT EXISTS proposta_demanda_idx ON proposta (demanda_id);

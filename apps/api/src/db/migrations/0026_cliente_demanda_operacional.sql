ALTER TABLE cliente_demanda ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE cliente_demanda ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'outro';
ALTER TABLE cliente_demanda ADD COLUMN IF NOT EXISTS proxima_acao text;
ALTER TABLE cliente_demanda ADD COLUMN IF NOT EXISTS proxima_acao_em text;
ALTER TABLE cliente_demanda ADD COLUMN IF NOT EXISTS probabilidade integer NOT NULL DEFAULT 0;
ALTER TABLE cliente_demanda ADD COLUMN IF NOT EXISTS resultado_esperado text;
ALTER TABLE cliente_demanda ADD COLUMN IF NOT EXISTS proposta_principal_id text;
ALTER TABLE cliente_demanda ADD COLUMN IF NOT EXISTS eventos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cliente_demanda ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb;

WITH demandas_numeradas AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY cliente_id ORDER BY criado_em, id)::integer AS numero
  FROM cliente_demanda
)
UPDATE cliente_demanda AS demanda
SET numero = demandas_numeradas.numero
FROM demandas_numeradas
WHERE demanda.id = demandas_numeradas.id
  AND demanda.numero IS NULL;

ALTER TABLE cliente_demanda ALTER COLUMN numero SET DEFAULT 1;
ALTER TABLE cliente_demanda ALTER COLUMN numero SET NOT NULL;

CREATE INDEX IF NOT EXISTS cliente_demanda_proxima_acao_idx
  ON cliente_demanda (cliente_id, proxima_acao_em);

-- Wave OS — vincular negociação por credor a propostas globais.
-- Quando uma proposta é aceita/rejeitada, podemos refletir nas negociações
-- ligadas. Quando lemos as negociações, podemos correlacionar propostas do
-- mesmo cliente/credor para evitar duplicação operacional.

ALTER TABLE "negociacao_credor"
  ADD COLUMN IF NOT EXISTS "proposta_id" text;

CREATE INDEX IF NOT EXISTS "negociacao_credor_proposta_idx"
  ON "negociacao_credor" ("proposta_id");

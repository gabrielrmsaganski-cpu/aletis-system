-- ============================================================
-- ALETIS — R.OP.010 Custos do Cliente
--
-- Acrescenta os campos que existem na planilha original:
-- terceirização, quantidade, unidade, valor unitário e observações.
-- ============================================================

ALTER TABLE gf_custo_safra
  ADD COLUMN IF NOT EXISTS terceirizado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quantidade NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS unidade TEXT,
  ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

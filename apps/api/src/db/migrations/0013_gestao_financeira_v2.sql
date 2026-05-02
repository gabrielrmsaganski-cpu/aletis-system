-- ============================================================
-- Wave A (1000% better): Gestão Financeira — extensões V2
-- Adiciona entidades faltantes da R.OP.001 v2.0:
--   8b/8c/8d — Ativos não-fazenda (produto/contrato/financeiro/máquina)
--   9 — Fornecedores (passivos não-bancários)
--   11 — Passivos consolidado (passivos fiscais, trabalhistas, outros)
--   14 — Garantias com LTV
--   15 — Premissas (taxas, indexadores) versionáveis por grupo
-- ============================================================

-- 34. gf_ativo_outro — produtos acabados, contratos/barter, financeiros, máquinas
CREATE TABLE IF NOT EXISTS gf_ativo_outro (
  id              TEXT PRIMARY KEY,
  grupo_id        TEXT NOT NULL,
  tipo            TEXT NOT NULL,                          -- 'produto'|'contrato'|'financeiro'|'maquina'|'outro'
  descricao       TEXT NOT NULL,
  produto         TEXT,                                   -- soja, milho, etc (para tipo=produto)
  estado_uf       VARCHAR(2),
  safra           TEXT,                                   -- '24/25'
  unidade         TEXT,                                   -- sc, ton, @
  quantidade      NUMERIC(16, 4),
  preco_unitario  NUMERIC(16, 4),
  valor_total     NUMERIC(16, 2),                         -- = quantidade × preço (calculável)
  data_recebimento DATE,
  vai_para_fc     BOOLEAN NOT NULL DEFAULT true,         -- entra no fluxo de caixa?
  observacoes     TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gf_ativo_outro_tipo_chk
    CHECK (tipo IN ('produto', 'contrato', 'financeiro', 'maquina', 'outro'))
);

CREATE INDEX IF NOT EXISTS gf_ativo_outro_grupo_idx ON gf_ativo_outro (grupo_id, tipo);

-- 35. gf_passivo_outro — passivos não-bancários (PGFN, fornecedor, trabalhista, ITR vencido)
CREATE TABLE IF NOT EXISTS gf_passivo_outro (
  id              TEXT PRIMARY KEY,
  grupo_id        TEXT NOT NULL,
  tipo            TEXT NOT NULL,                          -- 'fornecedor'|'fiscal'|'trabalhista'|'arrendamento'|'investimento'|'outro'
  credor          TEXT,
  descricao       TEXT NOT NULL,
  finalidade      TEXT,
  valor           NUMERIC(16, 2) NOT NULL DEFAULT 0,
  vencimento      DATE,
  data_referencia DATE,
  status          TEXT NOT NULL DEFAULT 'a_vencer',       -- 'a_vencer'|'vencida'|'em_negociacao'|'liquidada'
  taxa_juros_aa   NUMERIC(8, 4),
  forma_pagamento TEXT,
  variacao_cambial BOOLEAN NOT NULL DEFAULT false,
  observacoes     TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gf_passivo_outro_tipo_chk
    CHECK (tipo IN ('fornecedor', 'fiscal', 'trabalhista', 'arrendamento', 'investimento', 'outro')),
  CONSTRAINT gf_passivo_outro_status_chk
    CHECK (status IN ('a_vencer', 'vencida', 'em_negociacao', 'liquidada'))
);

CREATE INDEX IF NOT EXISTS gf_passivo_outro_grupo_idx ON gf_passivo_outro (grupo_id, tipo);
CREATE INDEX IF NOT EXISTS gf_passivo_outro_status_idx ON gf_passivo_outro (status);

-- 36. gf_garantia — garantias do grupo (matrículas, safras, avais, penhores)
--     LTV = saldo_devedor / valor_mercado é calculado dinâmico no service.
CREATE TABLE IF NOT EXISTS gf_garantia (
  id                  TEXT PRIMARY KEY,
  grupo_id            TEXT NOT NULL,
  tipo                TEXT NOT NULL,                      -- 'imovel'|'safra'|'aval'|'penhor'|'caucao'|'outro'
  descricao           TEXT NOT NULL,
  fazenda_id          TEXT,                               -- FK opcional pra gf_ativo_fazenda
  matricula           TEXT,
  area_ha             NUMERIC(12, 4),
  valor_mercado       NUMERIC(16, 2),
  valor_forcado       NUMERIC(16, 2),
  contrato_vinculado  TEXT,                               -- ID(s) de contratos vinculados (CSV)
  baixas_aditivos     TEXT,
  registros_averbacoes TEXT,
  observacoes         TEXT,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gf_garantia_tipo_chk
    CHECK (tipo IN ('imovel', 'safra', 'aval', 'penhor', 'caucao', 'outro'))
);

CREATE INDEX IF NOT EXISTS gf_garantia_grupo_idx ON gf_garantia (grupo_id);
CREATE INDEX IF NOT EXISTS gf_garantia_fazenda_idx ON gf_garantia (fazenda_id);

-- 37. gf_premissa — taxas, indexadores e parâmetros versionáveis por grupo
--     Uma linha por chave (selic, ipca, cdi, dolar, taxa_custo_financeiro, taxa_poupanca, etc)
CREATE TABLE IF NOT EXISTS gf_premissa (
  id              TEXT PRIMARY KEY,
  grupo_id        TEXT NOT NULL,
  chave           TEXT NOT NULL,                          -- 'taxa_custo_financeiro'|'taxa_poupanca'|'selic'|'ipca'|'dolar_proj'|'preco_soja_futuro'|...
  rotulo          TEXT NOT NULL,
  valor           NUMERIC(16, 6) NOT NULL,
  unidade         TEXT,                                   -- '%'|'R$/sc'|'R$'|'pp'
  vigencia        DATE,                                   -- a partir de quando vale
  fonte           TEXT,                                   -- 'BCB'|'consultor'|'mercado'|'cliente'
  observacoes     TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gf_premissa_grupo_idx ON gf_premissa (grupo_id);
CREATE INDEX IF NOT EXISTS gf_premissa_chave_idx ON gf_premissa (grupo_id, chave);

-- 38. gf_insight — alertas de saúde financeira (gerados pelo engine de insights)
--     Append-only com TTL implícito via filtro por data_calculo.
CREATE TABLE IF NOT EXISTS gf_insight (
  id              BIGSERIAL PRIMARY KEY,
  grupo_id        TEXT NOT NULL,
  severidade      TEXT NOT NULL,                          -- 'critico'|'importante'|'info'
  categoria       TEXT NOT NULL,                          -- 'endividamento'|'fluxo'|'garantia'|'concentracao'|'rentabilidade'
  titulo          TEXT NOT NULL,
  mensagem        TEXT NOT NULL,
  metricas        JSONB,                                  -- {nome: valor}
  recomendacao    TEXT,
  calculado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gf_insight_severidade_chk
    CHECK (severidade IN ('critico', 'importante', 'info'))
);

CREATE INDEX IF NOT EXISTS gf_insight_grupo_idx ON gf_insight (grupo_id, calculado_em DESC);
CREATE INDEX IF NOT EXISTS gf_insight_severidade_idx ON gf_insight (severidade);

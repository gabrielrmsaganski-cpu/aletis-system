-- ============================================================
-- Wave: Gestão Financeira (R.OP.001 v2.0 como SISTEMA NATIVO)
-- 28 sheets / ~12000 fórmulas reimplementados em TypeScript.
-- Esta migration cria as 10 tabelas core do domínio agro-financeiro.
-- ============================================================

-- 26. gf_grupo — identidade do grupo (espelha "3 - Cadastro" da planilha)
--     Um grupo está vinculado a um cliente do CRM (cliente.id).
CREATE TABLE IF NOT EXISTS gf_grupo (
  id              TEXT PRIMARY KEY,
  cliente_id      TEXT NOT NULL,
  nome_grupo      TEXT NOT NULL,
  data_base       DATE NOT NULL,                          -- master clock (D15)
  historico       TEXT,
  observacoes     TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gf_grupo_cliente_idx ON gf_grupo (cliente_id);

-- 27. gf_membro — membros do grupo familiar (named range NOME)
CREATE TABLE IF NOT EXISTS gf_membro (
  id                TEXT PRIMARY KEY,
  grupo_id          TEXT NOT NULL,
  nome              TEXT NOT NULL,
  cpf_cnpj          TEXT,
  tipo_relacao      TEXT,                                 -- conjuge, filho, sócio, etc.
  atua_atividade    BOOLEAN NOT NULL DEFAULT true,
  ordem             INTEGER NOT NULL DEFAULT 0,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gf_membro_grupo_idx ON gf_membro (grupo_id);

-- 28. gf_cultura_safra — quadro de produção por cultura × safra × cenário
--     Espelha "1 - BaseSafra" + "7 - Safra" da planilha.
--     Cenário: planejado | realizado | proposta | futura
CREATE TABLE IF NOT EXISTS gf_cultura_safra (
  id                          TEXT PRIMARY KEY,
  grupo_id                    TEXT NOT NULL,
  cultura                     TEXT NOT NULL,              -- "Soja Sequeiro", etc
  safra                       TEXT NOT NULL,              -- "23/24", "24/25"
  cenario                     TEXT NOT NULL DEFAULT 'planejado',
  ordem                       INTEGER NOT NULL DEFAULT 0,
  area_propria_ha             NUMERIC(12, 4),
  area_arrendada_ha           NUMERIC(12, 4),
  rendimento_sc_ha            NUMERIC(12, 4),
  preco_medio_rs              NUMERIC(14, 4),
  custo_unitario_insumos_rs   NUMERIC(14, 4),             -- R$ por sc ou R$/ha
  arrendamento_base_sc_ha     NUMERIC(12, 4),
  unidade                     TEXT NOT NULL DEFAULT 'sc',
  observacoes                 TEXT,
  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gf_cultura_safra_cenario_chk
    CHECK (cenario IN ('planejado', 'realizado', 'proposta', 'futura'))
);

CREATE INDEX IF NOT EXISTS gf_cultura_grupo_safra_idx ON gf_cultura_safra (grupo_id, safra);
CREATE INDEX IF NOT EXISTS gf_cultura_grupo_cenario_idx ON gf_cultura_safra (grupo_id, cenario);

-- 29. gf_custo_safra — insumos por cultura + demais custos operacionais + fixos
--     Espelha "6 - Custos do Cliente"
CREATE TABLE IF NOT EXISTS gf_custo_safra (
  id              TEXT PRIMARY KEY,
  grupo_id        TEXT NOT NULL,
  safra           TEXT NOT NULL,
  tipo            TEXT NOT NULL,                          -- insumo | operacional | fixo | frete | colheita
  descricao       TEXT NOT NULL,                          -- "Fertilizantes de Base"
  cultura         TEXT,                                   -- nullable (custos não-cultura)
  valor_anual     NUMERIC(16, 4),
  valor_mensal    NUMERIC(16, 4),
  ordem           INTEGER NOT NULL DEFAULT 0,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gf_custo_tipo_chk
    CHECK (tipo IN ('insumo', 'operacional', 'fixo', 'frete', 'colheita', 'arrendamento', 'outros'))
);

CREATE INDEX IF NOT EXISTS gf_custo_grupo_safra_idx ON gf_custo_safra (grupo_id, safra);

-- 30. gf_demanda — demandas de crédito (espelha "5 - Demandas")
CREATE TABLE IF NOT EXISTS gf_demanda (
  id                  TEXT PRIMARY KEY,
  grupo_id            TEXT NOT NULL,
  numero              INTEGER,
  data                DATE,
  tomador             TEXT,
  credor              TEXT,
  finalidade          TEXT,
  modalidade          TEXT,
  valor               NUMERIC(16, 2),
  garantias           TEXT,
  prazo               TEXT,
  parecer_tex         TEXT,
  estrategia          TEXT,
  enviado_em          DATE,
  retorno_em          DATE,
  acoes               TEXT,
  status              TEXT NOT NULL DEFAULT 'em_analise',  -- em_analise | aprovada | recusada | desembolsada
  faturamento_obtido  NUMERIC(16, 2),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gf_demanda_grupo_idx ON gf_demanda (grupo_id);
CREATE INDEX IF NOT EXISTS gf_demanda_status_idx ON gf_demanda (status);

-- 31. gf_contrato_divida — endividamento bancário (espelha "10 - Endividamento")
--     Cada linha = um contrato. O cronograma é gerado dinamicamente
--     (Price/SAC) pelo engine no service.
CREATE TABLE IF NOT EXISTS gf_contrato_divida (
  id                          TEXT PRIMARY KEY,
  grupo_id                    TEXT NOT NULL,
  credor                      TEXT NOT NULL,
  emitente                    TEXT,
  garantia_vinculada          TEXT,
  outras_garantias            TEXT,
  contrato                    TEXT,
  valor_liberado              NUMERIC(16, 2),
  valor_financiado            NUMERIC(16, 2),
  parcela_capital_amortizar   NUMERIC(16, 2),
  valor_parcela_fixa          NUMERIC(16, 2),
  periodicidade               TEXT,                       -- mensal | trimestral | semestral | anual | final | liquidado
  metodo_calculo              TEXT NOT NULL DEFAULT 'PRICE',  -- PRICE | SAC | OUTROS
  enquadramento               TEXT,                       -- pronaf, pronamp, custeio, investimento, etc
  finalidade                  TEXT,
  prazo_parcelas              INTEGER,
  data_contratacao            DATE,
  primeira_parcela            DATE,
  ultima_parcela              DATE,
  parcelas_pagas              INTEGER NOT NULL DEFAULT 0,
  inadimplente                BOOLEAN NOT NULL DEFAULT false,
  taxa_nominal_aa             NUMERIC(8, 4),              -- % ao ano
  cet_anual                   NUMERIC(8, 4),
  indexador                   TEXT,                       -- IPCA, CDI, fixa, etc
  pct_indexador               NUMERIC(8, 4),
  variacao_cambial            BOOLEAN NOT NULL DEFAULT false,
  origem_info                 TEXT,                       -- CCB, Bacen, ContraReport
  ultima_atualizacao          DATE,
  valor_presente              NUMERIC(16, 2),
  valor_presente_atualizado   NUMERIC(16, 2),
  observacoes                 TEXT,
  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gf_contrato_metodo_chk
    CHECK (metodo_calculo IN ('PRICE', 'SAC', 'BULLET', 'OUTROS'))
);

CREATE INDEX IF NOT EXISTS gf_contrato_grupo_idx ON gf_contrato_divida (grupo_id);
CREATE INDEX IF NOT EXISTS gf_contrato_credor_idx ON gf_contrato_divida (credor);

-- 32. gf_ativo_fazenda — fazendas com matrículas (espelha "8 - Ativos" bloco fazendas)
CREATE TABLE IF NOT EXISTS gf_ativo_fazenda (
  id                          TEXT PRIMARY KEY,
  grupo_id                    TEXT NOT NULL,
  fazenda                     TEXT NOT NULL,
  proprietario                TEXT,
  matricula                   TEXT,
  cidade                      TEXT,
  estado                      VARCHAR(2),
  area_total_ha               NUMERIC(12, 4),
  area_consolidada_ha         NUMERIC(12, 4),
  area_plantio_ha             NUMERIC(12, 4),
  area_irrigada_ha            NUMERIC(12, 4),
  area_pastagem_ha            NUMERIC(12, 4),
  area_reserva_ha             NUMERIC(12, 4),
  outros_usos_ha              NUMERIC(12, 4),
  arrendada_terceiros_ha      NUMERIC(12, 4),
  valor_ha_mercado            NUMERIC(16, 2),
  valor_ha_forcado            NUMERIC(16, 2),
  nr_ccir                     TEXT,
  nr_itr                      TEXT,
  inscricao_estadual          TEXT,
  nr_car                      TEXT,
  possui_geo                  BOOLEAN NOT NULL DEFAULT false,
  observacoes                 TEXT,
  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gf_fazenda_grupo_idx ON gf_ativo_fazenda (grupo_id);

-- 33. gf_snapshot_calculo — snapshot periódico dos cálculos (auditoria)
--     Persiste resultado de cada cálculo para histórico (Raio X, EBITDA, FCL).
CREATE TABLE IF NOT EXISTS gf_snapshot_calculo (
  id              BIGSERIAL PRIMARY KEY,
  grupo_id        TEXT NOT NULL,
  tipo            TEXT NOT NULL,                          -- ebitda | dre | fluxo_caixa | raio_x | passivos | garantias
  payload         JSONB NOT NULL,
  calculado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gf_snapshot_grupo_idx ON gf_snapshot_calculo (grupo_id);
CREATE INDEX IF NOT EXISTS gf_snapshot_tipo_idx ON gf_snapshot_calculo (tipo);
CREATE INDEX IF NOT EXISTS gf_snapshot_calc_idx ON gf_snapshot_calculo (calculado_em DESC);

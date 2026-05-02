-- ============================================================
-- Wave F: Gestão Financeira — kanban SLA + multi-tenant + webhook NF-e
-- ============================================================

-- 39. gf_etapa_slan — etapas do checklist de rotina (R.OP.009)
--     Por grupo, controla execução de cada uma das 7 etapas com SLA.
CREATE TABLE IF NOT EXISTS gf_etapa_sla (
  id              TEXT PRIMARY KEY,
  grupo_id        TEXT NOT NULL,
  etapa_codigo    TEXT NOT NULL,                -- 'elegibilidade'|'mandato'|'diagnostico'|'documentos'|'analise'|'comite'|'envio_if'
  etapa_ordem     INTEGER NOT NULL,
  tarefa          TEXT NOT NULL,                -- "Entrevista inicial", "AgRisk", etc
  prazo_dias      INTEGER NOT NULL,             -- SLA em dias úteis
  status          TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'bloqueada', 'cancelada')),
  responsavel     TEXT,
  iniciada_em     DATE,
  concluida_em    DATE,
  observacoes     TEXT,
  bloqueio_motivo TEXT,                          -- se status=bloqueada
  ordem           INTEGER NOT NULL DEFAULT 0,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gf_etapa_sla_grupo_idx ON gf_etapa_sla (grupo_id, etapa_ordem);
CREATE INDEX IF NOT EXISTS gf_etapa_sla_status_idx ON gf_etapa_sla (status);

-- 40. Multi-tenant: adiciona consultor_id em gf_grupo
ALTER TABLE gf_grupo ADD COLUMN IF NOT EXISTS consultor_id TEXT;
ALTER TABLE gf_grupo ADD COLUMN IF NOT EXISTS consultor_nome TEXT;
CREATE INDEX IF NOT EXISTS gf_grupo_consultor_idx ON gf_grupo (consultor_id);

-- 41. gf_nfe_recebida — log de NF-e via webhook
CREATE TABLE IF NOT EXISTS gf_nfe_recebida (
  id              BIGSERIAL PRIMARY KEY,
  grupo_id        TEXT,                          -- nullable: sem match automático
  cnpj_emitente   TEXT,
  numero_nfe      TEXT,
  serie           TEXT,
  data_emissao    DATE,
  valor_total     NUMERIC(16, 2),
  produtos_count  INTEGER,
  cultura_principal TEXT,
  payload         JSONB NOT NULL,                -- payload parseado completo
  processada      BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'recebida'
    CHECK (status IN ('recebida', 'processada', 'erro', 'ignorada')),
  erro            TEXT,
  recebida_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processada_em   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gf_nfe_recebida_grupo_idx ON gf_nfe_recebida (grupo_id);
CREATE INDEX IF NOT EXISTS gf_nfe_recebida_emitente_idx ON gf_nfe_recebida (cnpj_emitente);
CREATE INDEX IF NOT EXISTS gf_nfe_recebida_status_idx ON gf_nfe_recebida (status);

-- ============================================================
-- Wave: Processo de Assessoria ALETIS
-- Tabelas para persistência de checklists interativos e renders
-- gerados (cache + auditoria) dos 25 documentos oficiais.
-- ============================================================

-- 24. processo_checklist
--     Estado de checklists interativos por cliente × template.
--     Itens ficam em payload jsonb {itemId: {marcado, observacao, anexoId, atualizadoEm}}.
CREATE TABLE IF NOT EXISTS processo_checklist (
  cliente_id        TEXT NOT NULL,
  template_slug     TEXT NOT NULL,                -- ex: 'checklist-informacoes-basicas-pf'
  responsavel       TEXT,
  itens             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'concluido', 'arquivado')),
  total_itens       INTEGER NOT NULL DEFAULT 0,
  itens_concluidos  INTEGER NOT NULL DEFAULT 0,
  iniciado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em      TIMESTAMPTZ,
  PRIMARY KEY (cliente_id, template_slug)
);

CREATE INDEX IF NOT EXISTS processo_checklist_cliente_idx
  ON processo_checklist (cliente_id);

CREATE INDEX IF NOT EXISTS processo_checklist_status_idx
  ON processo_checklist (status);

-- 25. processo_render
--     Auditoria de renderizações de templates do processo
--     (quem renderizou, quando, qual cliente, qual hash).
CREATE TABLE IF NOT EXISTS processo_render (
  id              BIGSERIAL PRIMARY KEY,
  cliente_id      TEXT NOT NULL,
  template_slug   TEXT NOT NULL,
  template_codigo TEXT NOT NULL,                 -- R.OP.001, R.CM.002, etc
  formato         TEXT NOT NULL,                 -- docx | xlsx | xlsm | pptx | pdf
  filename        TEXT NOT NULL,
  bytes           INTEGER NOT NULL,
  inputs          JSONB,                         -- valores enviados
  resolved        JSONB,                         -- valores efetivamente injetados
  ator            TEXT,
  trace_id        TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processo_render_cliente_idx
  ON processo_render (cliente_id);

CREATE INDEX IF NOT EXISTS processo_render_template_idx
  ON processo_render (template_slug);

CREATE INDEX IF NOT EXISTS processo_render_criado_em_idx
  ON processo_render (criado_em DESC);

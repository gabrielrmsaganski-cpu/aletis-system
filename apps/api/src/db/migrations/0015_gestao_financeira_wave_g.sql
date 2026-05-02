-- ============================================================
-- Wave G: Gestão Financeira — marketplace + changelog + comentários
-- ============================================================

-- 42. gf_template_marketplace — templates de cliente compartilháveis
CREATE TABLE IF NOT EXISTS gf_template_marketplace (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  rotulo          TEXT NOT NULL,
  descricao       TEXT,
  categoria       TEXT NOT NULL,                -- 'agricola'|'pecuaria'|'cana'|'cafe'|'misto'|'custom'
  emoji           TEXT,
  visibilidade    TEXT NOT NULL DEFAULT 'private',
                                                -- 'private' (apenas autor) | 'consultor' (carteira) | 'global'
  autor_consultor_id TEXT,
  autor_nome      TEXT,
  payload         JSONB NOT NULL,               -- {culturas: [...], custos: [...], contratos: [...]}
  contadores      JSONB NOT NULL DEFAULT '{}'::jsonb, -- {culturas: 3, custos: 8, contratos: 3}
  uso_count       INTEGER NOT NULL DEFAULT 0,
  is_oficial      BOOLEAN NOT NULL DEFAULT false, -- templates seed da Wave B (Soja-MT etc)
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gf_template_visibilidade_idx ON gf_template_marketplace (visibilidade);
CREATE INDEX IF NOT EXISTS gf_template_consultor_idx ON gf_template_marketplace (autor_consultor_id);
CREATE INDEX IF NOT EXISTS gf_template_categoria_idx ON gf_template_marketplace (categoria);

-- 43. gf_changelog — log auditável de mudanças nos dados do grupo
CREATE TABLE IF NOT EXISTS gf_changelog (
  id              BIGSERIAL PRIMARY KEY,
  grupo_id        TEXT NOT NULL,
  entidade        TEXT NOT NULL,                -- 'cultura'|'contrato'|'fazenda'|'garantia'|'custo'|'membro'|'grupo'|'demanda'
  entidade_id     TEXT,                          -- id da entidade (null se delete)
  acao            TEXT NOT NULL,                -- 'create'|'update'|'delete'
  diff            JSONB,                         -- {campo: {antes, depois}}
  ator            TEXT,                          -- consultor_id ou 'sistema'
  ator_nome       TEXT,
  origem          TEXT,                          -- 'ui'|'api'|'import'|'webhook'|'cron'
  trace_id        TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gf_changelog_grupo_idx ON gf_changelog (grupo_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS gf_changelog_entidade_idx ON gf_changelog (entidade, entidade_id);

-- 44. gf_comentario — notas colaborativas em qualquer entidade
CREATE TABLE IF NOT EXISTS gf_comentario (
  id              TEXT PRIMARY KEY,
  grupo_id        TEXT NOT NULL,
  entidade        TEXT NOT NULL,                -- 'cultura'|'contrato'|'fazenda'|'garantia'|'demanda'|'custo'|'grupo'
  entidade_id     TEXT,                          -- nullable (notas de grupo geral)
  conteudo        TEXT NOT NULL,
  autor           TEXT,                          -- consultor_id
  autor_nome      TEXT,
  parent_id       TEXT,                          -- thread reply
  resolvido       BOOLEAN NOT NULL DEFAULT false,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gf_comentario_grupo_idx ON gf_comentario (grupo_id);
CREATE INDEX IF NOT EXISTS gf_comentario_entidade_idx ON gf_comentario (entidade, entidade_id);
CREATE INDEX IF NOT EXISTS gf_comentario_parent_idx ON gf_comentario (parent_id);

/**
 * Schema Drizzle do ALETIS.
 *
 * Estratégia: para cada entidade do domínio, exposições explícitas
 * apenas dos campos críticos para query/index; o restante mora em
 * coluna `payload` JSONB pra manter fidelidade total com a estrutura
 * em memória durante a transição.
 *
 * Migra-se sem perda: cada `clientes.set(id, cli)` é espelhado em
 * `INSERT ... ON CONFLICT UPDATE`, e leituras priorizam o banco
 * quando ALETIS_PG_ENABLED=1.
 */
import {
  pgTable,
  text,
  varchar,
  numeric,
  integer,
  timestamp,
  jsonb,
  bigserial,
  primaryKey,
  index,
  boolean,
} from 'drizzle-orm/pg-core'

/* ─────────────────────────────────────────────────────────────
 * 1. cliente — fonte de verdade do CRM
 * ──────────────────────────────────────────────────────────── */
export const cliente = pgTable(
  'cliente',
  {
    id: text('id').primaryKey(),
    nome: text('nome').notNull(),
    cpfCnpj: text('cpf_cnpj').notNull(),
    cidade: text('cidade'),
    uf: varchar('uf', { length: 2 }),
    telefone: text('telefone'),
    email: text('email'),
    estagio: text('estagio').notNull(), // 'prospeccao'|'analise'|'negociacao'|'acordo'|'encerrado'
    consultor: text('consultor'),
    credor: text('credor'),
    valorTotalDivida: numeric('valor_total_divida', { precision: 18, scale: 2 }),
    valorTotalPago: numeric('valor_total_pago', { precision: 18, scale: 2 }),
    areaTotalHa: numeric('area_total_ha', { precision: 12, scale: 2 }),
    culturas: text('culturas').array(),
    dataCadastro: timestamp('data_cadastro', { withTimezone: true }),
    ultimaAtualizacao: timestamp('ultima_atualizacao', { withTimezone: true }),
    payload: jsonb('payload').notNull(), // restante do Cliente (dividas, pagamentos, timeline, car, ...)
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    estagioIdx: index('cliente_estagio_idx').on(t.estagio),
    ufIdx: index('cliente_uf_idx').on(t.uf),
    cpfCnpjIdx: index('cliente_cpf_cnpj_idx').on(t.cpfCnpj),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 2. dossie — JSONB versionado por cliente
 * ──────────────────────────────────────────────────────────── */
export const dossie = pgTable(
  'dossie',
  {
    clienteId: text('cliente_id').notNull(),
    versao: integer('versao').notNull(),
    dataBase: text('data_base').notNull(), // YYYY-MM-DD
    payload: jsonb('payload').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.clienteId, t.versao] }),
    clienteIdx: index('dossie_cliente_idx').on(t.clienteId),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 3. proposta — propostas inteligentes (15 seções)
 * ──────────────────────────────────────────────────────────── */
export const proposta = pgTable(
  'proposta',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id'),
    tipo: text('tipo'),
    status: text('status'), // 'rascunho' | 'revisao' | 'enviada' | 'aceita' | 'rejeitada'
    valorProposto: numeric('valor_proposto', { precision: 18, scale: 2 }),
    titulo: text('titulo'),
    payload: jsonb('payload').notNull(),
    pdfPath: text('pdf_path'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('proposta_cliente_idx').on(t.clienteId),
    statusIdx: index('proposta_status_idx').on(t.status),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 4. lead_pgfn — substituirá o índice JSON em prospeccao/
 * ──────────────────────────────────────────────────────────── */
export const leadPgfn = pgTable(
  'lead_pgfn',
  {
    cnpjCpf: text('cnpj_cpf').primaryKey(),
    nome: text('nome'),
    uf: varchar('uf', { length: 2 }),
    areaEstimadaHa: numeric('area_estimada_ha', { precision: 12, scale: 2 }),
    totalDivida: numeric('total_divida', { precision: 18, scale: 2 }),
    inscricoesCount: integer('inscricoes_count'),
    ajuizado: boolean('ajuizado').default(false),
    passivoAcelerando: boolean('passivo_acelerando').default(false),
    agroScore: integer('agro_score'),
    sinais: text('sinais').array(),
    payload: jsonb('payload'),
    ingeridoEm: timestamp('ingerido_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ufIdx: index('lead_pgfn_uf_idx').on(t.uf),
    scoreIdx: index('lead_pgfn_score_idx').on(t.agroScore),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 5. alix_session / alix_message — chat persistente da ALIX
 * ──────────────────────────────────────────────────────────── */
export const alixSession = pgTable('alix_session', {
  id: text('id').primaryKey(),
  consultorId: text('consultor_id'),
  clienteId: text('cliente_id'),
  titulo: text('titulo'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
})

export const alixMessage = pgTable(
  'alix_message',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    role: text('role').notNull(), // 'user'|'assistant'|'system'|'tool'
    content: text('content').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    modelo: text('modelo'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index('alix_message_session_idx').on(t.sessionId, t.criadoEm),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 6. fonte_status — telemetria das 36 fontes externas
 * ──────────────────────────────────────────────────────────── */
export const fonteStatus = pgTable('fonte_status', {
  nome: text('nome').primaryKey(),
  status: text('status').notNull(),
  ultimaAtualizacao: timestamp('ultima_atualizacao', { withTimezone: true }),
  latenciaMs: integer('latencia_ms'),
  ultimoErro: text('ultimo_erro'),
  erros24h: integer('erros_24h').default(0),
})

/* ─────────────────────────────────────────────────────────────
 * 7. audit_log — append-only LGPD/segurança
 * ──────────────────────────────────────────────────────────── */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ator: text('ator'), // consultor_id ou 'system'
    acao: text('acao').notNull(),
    recurso: text('recurso').notNull(), // 'cliente:cli-001'
    dadosAntes: jsonb('dados_antes'),
    dadosDepois: jsonb('dados_depois'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    recursoIdx: index('audit_log_recurso_idx').on(t.recurso, t.criadoEm),
  }),
)

export type Cliente = typeof cliente.$inferSelect
export type ClienteInsert = typeof cliente.$inferInsert
export type Dossie = typeof dossie.$inferSelect
export type Proposta = typeof proposta.$inferSelect
export type LeadPgfn = typeof leadPgfn.$inferSelect
export type AlixSession = typeof alixSession.$inferSelect
export type AlixMessage = typeof alixMessage.$inferSelect

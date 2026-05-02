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
import { sql } from 'drizzle-orm'

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

/* ─────────────────────────────────────────────────────────────
 * 8. financeiro_receita — receitas operacionais (NF-e/NFS-e)
 * ──────────────────────────────────────────────────────────── */
export const financeiroReceita = pgTable(
  'financeiro_receita',
  {
    id: text('id').primaryKey(),
    competencia: varchar('competencia', { length: 7 }).notNull(), // YYYY-MM
    descricao: text('descricao'),
    clienteNome: text('cliente_nome'),
    clienteCpfCnpj: text('cliente_cpf_cnpj'),
    valorBruto: numeric('valor_bruto', { precision: 18, scale: 2 }),
    valorLiquido: numeric('valor_liquido', { precision: 18, scale: 2 }),
    status: text('status').notNull(), // 'emitida'|'recebida'|'atrasada'|'cancelada'
    dataEmissao: timestamp('data_emissao', { withTimezone: true }),
    dataRecebimento: timestamp('data_recebimento', { withTimezone: true }),
    propostaId: text('proposta_id'),
    payload: jsonb('payload').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    competenciaIdx: index('fin_receita_competencia_idx').on(t.competencia),
    statusIdx: index('fin_receita_status_idx').on(t.status),
    propostaIdx: index('fin_receita_proposta_idx').on(t.propostaId),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 9. financeiro_despesa — despesas operacionais
 * ──────────────────────────────────────────────────────────── */
export const financeiroDespesa = pgTable(
  'financeiro_despesa',
  {
    id: text('id').primaryKey(),
    competencia: varchar('competencia', { length: 7 }).notNull(),
    descricao: text('descricao'),
    fornecedorNome: text('fornecedor_nome'),
    fornecedorCpfCnpj: text('fornecedor_cpf_cnpj'),
    clienteVinculoCpfCnpj: text('cliente_vinculo_cpf_cnpj'), // margem por cliente
    categoria: text('categoria').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }),
    status: text('status').notNull(), // 'pendente'|'paga'|'atrasada'|'cancelada'
    dataVencimento: timestamp('data_vencimento', { withTimezone: true }),
    dataPagamento: timestamp('data_pagamento', { withTimezone: true }),
    payload: jsonb('payload').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    competenciaIdx: index('fin_despesa_competencia_idx').on(t.competencia),
    statusIdx: index('fin_despesa_status_idx').on(t.status),
    categoriaIdx: index('fin_despesa_categoria_idx').on(t.categoria),
    clienteVinculoIdx: index('fin_despesa_cliente_idx').on(t.clienteVinculoCpfCnpj),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 10. financeiro_imposto — DAS, INSS, ISS, DARF a pagar
 * ──────────────────────────────────────────────────────────── */
export const financeiroImposto = pgTable(
  'financeiro_imposto',
  {
    id: text('id').primaryKey(),
    competencia: varchar('competencia', { length: 7 }).notNull(),
    tipo: text('tipo').notNull(), // 'das_simples'|'inss_pro_labore'|'iss'|'irpj'|'csll'|'pis'|'cofins'|'outro'
    descricao: text('descricao'),
    valor: numeric('valor', { precision: 18, scale: 2 }),
    status: text('status').notNull(), // 'a_pagar'|'pago'|'atrasado'
    dataVencimento: timestamp('data_vencimento', { withTimezone: true }),
    dataPagamento: timestamp('data_pagamento', { withTimezone: true }),
    payload: jsonb('payload').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    competenciaIdx: index('fin_imposto_competencia_idx').on(t.competencia),
    tipoIdx: index('fin_imposto_tipo_idx').on(t.tipo),
    statusIdx: index('fin_imposto_status_idx').on(t.status),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 11. financeiro_lancamento — extrato bancário (OFX)
 * ──────────────────────────────────────────────────────────── */
export const financeiroLancamento = pgTable(
  'financeiro_lancamento',
  {
    id: text('id').primaryKey(),
    competencia: varchar('competencia', { length: 7 }).notNull(),
    contaBancaria: text('conta_bancaria'),
    data: timestamp('data', { withTimezone: true }),
    descricao: text('descricao'),
    valor: numeric('valor', { precision: 18, scale: 2 }),
    tipo: text('tipo'), // 'credito'|'debito'
    vinculadoTipo: text('vinculado_tipo'), // 'receita'|'despesa'|'imposto'|null
    vinculadoId: text('vinculado_id'),
    payload: jsonb('payload').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    competenciaIdx: index('fin_lanc_competencia_idx').on(t.competencia),
    dataIdx: index('fin_lanc_data_idx').on(t.data),
    vinculadoIdx: index('fin_lanc_vinculado_idx').on(t.vinculadoTipo, t.vinculadoId),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 12. alix_memory — memória estruturada por cliente (proativa)
 * ──────────────────────────────────────────────────────────── */
export const alixMemory = pgTable('alix_memory', {
  clienteId: text('cliente_id').primaryKey(),
  clienteNome: text('cliente_nome').notNull(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  payload: jsonb('payload').notNull(), // MemoriaCliente completo
})

/* ─────────────────────────────────────────────────────────────
 * 13. alix_insight — insights diários da Alix (append-only por dia)
 * ──────────────────────────────────────────────────────────── */
export const alixInsight = pgTable(
  'alix_insight',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    dia: varchar('dia', { length: 10 }).notNull(), // YYYY-MM-DD
    clienteId: text('cliente_id'),
    tipo: text('tipo').notNull(), // 'oportunidade'|'risco'|'alerta'|'briefing'|'outro'
    severidade: text('severidade'), // 'info'|'atencao'|'critico'
    titulo: text('titulo').notNull(),
    detalhe: text('detalhe'),
    payload: jsonb('payload').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    diaIdx: index('alix_insight_dia_idx').on(t.dia),
    clienteIdx: index('alix_insight_cliente_idx').on(t.clienteId, t.dia),
    tipoIdx: index('alix_insight_tipo_idx').on(t.tipo),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 14. bsc_snapshot — Balanced Scorecard append-only por cliente
 * ──────────────────────────────────────────────────────────── */
export const bscSnapshot = pgTable(
  'bsc_snapshot',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    clienteId: text('cliente_id').notNull(),
    calculadoEm: timestamp('calculado_em', { withTimezone: true }).notNull(),
    statusGeral: text('status_geral'), // 'verde'|'amarelo'|'vermelho'|null
    notaGlobal: numeric('nota_global', { precision: 5, scale: 2 }),
    payload: jsonb('payload').notNull(), // BscSnapshotRecord completo
  },
  (t) => ({
    clienteIdx: index('bsc_snapshot_cliente_idx').on(t.clienteId, t.calculadoEm),
    statusIdx: index('bsc_snapshot_status_idx').on(t.statusGeral),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 15. alix_confirmation — pendings + batches de confirmação ALIX
 * ──────────────────────────────────────────────────────────── */
export const alixConfirmation = pgTable(
  'alix_confirmation',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id'),
    tipo: text('tipo').notNull(), // 'pending'|'batch'
    status: text('status').notNull(), // 'pending'|'approved'|'rejected'|'expired'
    expiraEm: timestamp('expira_em', { withTimezone: true }),
    payload: jsonb('payload').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index('alix_confirmation_status_idx').on(t.status),
    sessionIdx: index('alix_confirmation_session_idx').on(t.sessionId),
    expiraIdx: index('alix_confirmation_expira_idx').on(t.expiraEm),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 16. alix_feedback — NPS + thumbs up/down em respostas Alix
 * ──────────────────────────────────────────────────────────── */
export const alixFeedback = pgTable(
  'alix_feedback',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sessionId: text('session_id'),
    messageId: text('message_id'),
    rating: text('rating'), // 'util'|'irrelevante'|'incorreto'|'off-tom' (FeedbackRating)
    motivo: text('motivo'),
    comentario: text('comentario'),
    payload: jsonb('payload').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index('alix_feedback_session_idx').on(t.sessionId, t.criadoEm),
    ratingIdx: index('alix_feedback_rating_idx').on(t.rating),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 17. inventario_cliente — patrimônio do cliente (1 por cliente)
 * ──────────────────────────────────────────────────────────── */
export const inventarioCliente = pgTable('inventario_cliente', {
  clienteId: text('cliente_id').primaryKey(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  totalAtivos: integer('total_ativos').default(0),
  valorTotal: numeric('valor_total', { precision: 18, scale: 2 }),
  payload: jsonb('payload').notNull(),
})

/* ─────────────────────────────────────────────────────────────
 * 18. plano_custeio — Plano simples de custeio agrícola (BNDES/Sicredi)
 * ──────────────────────────────────────────────────────────── */
export const planoCusteio = pgTable(
  'plano_custeio',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id'),
    safra: varchar('safra', { length: 7 }), // 2025/26
    status: text('status'), // 'rascunho'|'submetido'|'aprovado'|'reprovado'|'arquivado'
    valorTotal: numeric('valor_total', { precision: 18, scale: 2 }),
    payload: jsonb('payload').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('plano_custeio_cliente_idx').on(t.clienteId),
    safraIdx: index('plano_custeio_safra_idx').on(t.safra),
    statusIdx: index('plano_custeio_status_idx').on(t.status),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 19. portal_acesso — credenciais de login do cliente final
 *     (1 por cliente). Persistência durável das credenciais que
 *     antes ficavam apenas em RAM dentro de Cliente.portalAcesso.
 * ──────────────────────────────────────────────────────────── */
export const portalAcesso = pgTable(
  'portal_acesso',
  {
    clienteId: text('cliente_id').primaryKey(),
    usuario: text('usuario').notNull(),
    senhaHash: text('senha_hash').notNull(),
    salt: text('salt').notNull(),
    ativo: boolean('ativo').default(true).notNull(),
    forcaTrocaSenha: boolean('forca_troca_senha').default(true).notNull(),
    ultimoLoginEm: timestamp('ultimo_login_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    usuarioIdx: index('portal_acesso_usuario_idx').on(t.usuario),
    ativoIdx: index('portal_acesso_ativo_idx').on(t.ativo),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 20. portal_token — magic-link / reset de senha / refresh
 *     Tokens de uso único, com TTL e auditoria de redenção.
 * ──────────────────────────────────────────────────────────── */
export const portalToken = pgTable(
  'portal_token',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    tipo: text('tipo').notNull(), // 'magic'|'reset'|'refresh'
    tokenHash: text('token_hash').notNull(), // sha256(token), nunca o raw
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    consumidoEm: timestamp('consumido_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    canal: text('canal'), // 'email'|'whatsapp'|'sms'|null
    metadata: jsonb('metadata'), // ip, user-agent, ref
  },
  (t) => ({
    clienteTipoIdx: index('portal_token_cliente_tipo_idx').on(t.clienteId, t.tipo),
    expIdx: index('portal_token_exp_idx').on(t.expiraEm),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 21. portal_mensagem — chat persistente cliente↔consultor
 * ──────────────────────────────────────────────────────────── */
export const portalMensagem = pgTable(
  'portal_mensagem',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    de: text('de').notNull(), // 'cliente'|'consultor'|'alix'
    autorNome: text('autor_nome'),
    texto: text('texto').notNull(),
    anexos: jsonb('anexos'), // [{ nome, url, mime, tamanho }]
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    lidaEm: timestamp('lida_em', { withTimezone: true }),
  },
  (t) => ({
    clienteIdx: index('portal_mensagem_cliente_idx').on(t.clienteId, t.criadoEm),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 22. portal_documento_pendente — checklist de docs que o
 *     consultor solicita ao cliente (Inbox de Pendências)
 * ──────────────────────────────────────────────────────────── */
export const portalDocumentoPendente = pgTable(
  'portal_documento_pendente',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    titulo: text('titulo').notNull(),
    descricao: text('descricao'),
    categoria: text('categoria'), // 'fiscal'|'contrato'|'identidade'|'patrimonio'|'agro'|'outros'
    obrigatorio: boolean('obrigatorio').default(true).notNull(),
    status: text('status').default('pendente').notNull(), // 'pendente'|'enviado'|'aprovado'|'rejeitado'
    uploadId: text('upload_id'), // referência a portal_upload quando enviado
    solicitadoPor: text('solicitado_por'), // nome do consultor
    solicitadoEm: timestamp('solicitado_em', { withTimezone: true }).defaultNow().notNull(),
    enviadoEm: timestamp('enviado_em', { withTimezone: true }),
    revisadoEm: timestamp('revisado_em', { withTimezone: true }),
    observacao: text('observacao'),
  },
  (t) => ({
    clienteStatusIdx: index('portal_doc_pend_cliente_status_idx').on(t.clienteId, t.status),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 23. portal_upload — arquivos enviados pelo cliente (cofre)
 * ──────────────────────────────────────────────────────────── */
export const portalUpload = pgTable(
  'portal_upload',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    pendenciaId: text('pendencia_id'), // null = upload espontâneo
    nomeOriginal: text('nome_original').notNull(),
    nomeStorage: text('nome_storage').notNull(),
    mime: text('mime').notNull(),
    tamanho: integer('tamanho').notNull(), // bytes
    sha256: text('sha256'),
    categoria: text('categoria'),
    enviadoPor: text('enviado_por').notNull(), // 'cliente' | 'consultor'
    enviadoEm: timestamp('enviado_em', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata'),
  },
  (t) => ({
    clienteIdx: index('portal_upload_cliente_idx').on(t.clienteId, t.enviadoEm),
    pendenciaIdx: index('portal_upload_pendencia_idx').on(t.pendenciaId),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 24. portal_evento — auditoria de acesso e ações no portal
 * ──────────────────────────────────────────────────────────── */
export const portalEvento = pgTable(
  'portal_evento',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    clienteId: text('cliente_id').notNull(),
    tipo: text('tipo').notNull(), // 'login'|'login_falhou'|'logout'|'magic_solicitado'|'magic_consumido'|'reset_solicitado'|'senha_alterada'|'documento_enviado'|'mensagem_enviada'|'doc_visualizado'
    canal: text('canal'), // 'web'|'mobile'|'magic'
    ip: text('ip'),
    userAgent: text('user_agent'),
    detalhes: jsonb('detalhes'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('portal_evento_cliente_idx').on(t.clienteId, t.criadoEm),
    tipoIdx: index('portal_evento_tipo_idx').on(t.tipo),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 25. portal_push — subscriptions Web Push (PWA) para notificar
 *     cliente quando consultor envia mensagem ou doc.
 * ──────────────────────────────────────────────────────────── */
export const portalPush = pgTable(
  'portal_push',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    ultimoUsoEm: timestamp('ultimo_uso_em', { withTimezone: true }),
  },
  (t) => ({
    clienteIdx: index('portal_push_cliente_idx').on(t.clienteId),
  }),
)

export type PortalAcessoRow = typeof portalAcesso.$inferSelect
export type PortalTokenRow = typeof portalToken.$inferSelect
export type PortalMensagemRow = typeof portalMensagem.$inferSelect
export type PortalDocumentoPendenteRow = typeof portalDocumentoPendente.$inferSelect
export type PortalUploadRow = typeof portalUpload.$inferSelect
export type PortalEventoRow = typeof portalEvento.$inferSelect
export type PortalPushRow = typeof portalPush.$inferSelect

export type Cliente = typeof cliente.$inferSelect
export type ClienteInsert = typeof cliente.$inferInsert
export type AlixMemoryRow = typeof alixMemory.$inferSelect
export type AlixInsightRow = typeof alixInsight.$inferSelect
export type BscSnapshotRow = typeof bscSnapshot.$inferSelect
export type AlixConfirmationRow = typeof alixConfirmation.$inferSelect
export type AlixFeedbackRow = typeof alixFeedback.$inferSelect
export type InventarioRow = typeof inventarioCliente.$inferSelect
export type PlanoCusteioRow = typeof planoCusteio.$inferSelect
export type Dossie = typeof dossie.$inferSelect
export type Proposta = typeof proposta.$inferSelect
export type LeadPgfn = typeof leadPgfn.$inferSelect
export type AlixSession = typeof alixSession.$inferSelect
export type AlixMessage = typeof alixMessage.$inferSelect
export type FinanceiroReceita = typeof financeiroReceita.$inferSelect
export type FinanceiroDespesa = typeof financeiroDespesa.$inferSelect
export type FinanceiroImposto = typeof financeiroImposto.$inferSelect
export type FinanceiroLancamento = typeof financeiroLancamento.$inferSelect

/* ─────────────────────────────────────────────────────────────
 * 23. negociacao_credor — Deal Room Multi-Credor
 *      Uma linha por negociação ativa (cliente × credor).
 *      Histórico/contrapropostas/docs ficam em jsonb.
 * ──────────────────────────────────────────────────────────── */
export const negociacaoCredor = pgTable(
  'negociacao_credor',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    credor: text('credor').notNull(),
    status: text('status').notNull().default('negociando'), // CHECK aplicado em 0009
    responsavel: text('responsavel'),
    valorAtual: numeric('valor_atual', { precision: 18, scale: 2 }),
    valorProposto: numeric('valor_proposto', { precision: 18, scale: 2 }),
    taxaAtual: numeric('taxa_atual', { precision: 8, scale: 4 }),
    taxaProposta: numeric('taxa_proposta', { precision: 8, scale: 4 }),
    prazoMeses: integer('prazo_meses'),
    carenciaMeses: integer('carencia_meses'),
    garantias: jsonb('garantias'),
    docsPendentes: jsonb('docs_pendentes'),
    historico: jsonb('historico'),
    /** Wave OS — vínculo opcional para `proposta.id` (mesmo cliente). */
    propostaId: text('proposta_id'),
    proximaData: timestamp('proxima_data', { withTimezone: true }),
    ultimaInteracao: timestamp('ultima_interacao', { withTimezone: true }),
    observacoes: text('observacoes'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('negociacao_credor_cliente_idx').on(t.clienteId),
    statusIdx: index('negociacao_credor_status_idx').on(t.status),
    proximaDataIdx: index('negociacao_credor_proxima_data_idx').on(t.proximaData),
  }),
)


/* ─────────────────────────────────────────────────────────────
 * 24. processo_checklist — estado de checklists interativos
 *      por cliente × template (R.OP.003/004/005/009).
 *      Itens em jsonb: { itemId: { marcado, observacao, anexoId, atualizadoEm } }.
 * ──────────────────────────────────────────────────────────── */
export const processoChecklist = pgTable(
  'processo_checklist',
  {
    clienteId: text('cliente_id').notNull(),
    templateSlug: text('template_slug').notNull(),
    responsavel: text('responsavel'),
    itens: jsonb('itens').notNull().default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('em_andamento'), // CHECK em 0011
    totalItens: integer('total_itens').notNull().default(0),
    itensConcluidos: integer('itens_concluidos').notNull().default(0),
    iniciadoEm: timestamp('iniciado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
    concluidoEm: timestamp('concluido_em', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.clienteId, t.templateSlug] }),
    clienteIdx: index('processo_checklist_cliente_idx').on(t.clienteId),
    statusIdx: index('processo_checklist_status_idx').on(t.status),
  }),
)

export type ProcessoChecklist = typeof processoChecklist.$inferSelect
export type ProcessoChecklistInsert = typeof processoChecklist.$inferInsert

/* ─────────────────────────────────────────────────────────────
 * 25. processo_render — auditoria de renderizações de templates
 *      do Processo de Assessoria.
 * ──────────────────────────────────────────────────────────── */
export const processoRender = pgTable(
  'processo_render',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    clienteId: text('cliente_id').notNull(),
    templateSlug: text('template_slug').notNull(),
    templateCodigo: text('template_codigo').notNull(),
    formato: text('formato').notNull(),
    filename: text('filename').notNull(),
    bytes: integer('bytes').notNull(),
    inputs: jsonb('inputs'),
    resolved: jsonb('resolved'),
    ator: text('ator'),
    traceId: text('trace_id'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('processo_render_cliente_idx').on(t.clienteId),
    templateIdx: index('processo_render_template_idx').on(t.templateSlug),
    criadoEmIdx: index('processo_render_criado_em_idx').on(t.criadoEm),
  }),
)


/* ─────────────────────────────────────────────────────────────
 * 26-33. GESTÃO FINANCEIRA — sistema nativo da R.OP.001 v2.0
 * Reimplementa as 28 sheets / 12000 fórmulas como módulo TS.
 * ──────────────────────────────────────────────────────────── */

export const gfGrupo = pgTable(
  'gf_grupo',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    nomeGrupo: text('nome_grupo').notNull(),
    dataBase: text('data_base').notNull(),
    historico: text('historico'),
    observacoes: text('observacoes'),
    consultorId: text('consultor_id'),
    consultorNome: text('consultor_nome'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('gf_grupo_cliente_idx').on(t.clienteId),
    consultorIdx: index('gf_grupo_consultor_idx').on(t.consultorId),
  }),
)

export const gfMembro = pgTable(
  'gf_membro',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    nome: text('nome').notNull(),
    cpfCnpj: text('cpf_cnpj'),
    tipoRelacao: text('tipo_relacao'),
    atuaAtividade: boolean('atua_atividade').notNull().default(true),
    ordem: integer('ordem').notNull().default(0),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ grupoIdx: index('gf_membro_grupo_idx').on(t.grupoId) }),
)

export const gfCulturaSafra = pgTable(
  'gf_cultura_safra',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    cultura: text('cultura').notNull(),
    safra: text('safra').notNull(),
    cenario: text('cenario').notNull().default('planejado'),
    ordem: integer('ordem').notNull().default(0),
    areaPropriaHa: numeric('area_propria_ha', { precision: 12, scale: 4 }),
    areaArrendadaHa: numeric('area_arrendada_ha', { precision: 12, scale: 4 }),
    rendimentoScHa: numeric('rendimento_sc_ha', { precision: 12, scale: 4 }),
    precoMedioRs: numeric('preco_medio_rs', { precision: 14, scale: 4 }),
    custoUnitarioInsumosRs: numeric('custo_unitario_insumos_rs', { precision: 14, scale: 4 }),
    arrendamentoBaseScHa: numeric('arrendamento_base_sc_ha', { precision: 12, scale: 4 }),
    unidade: text('unidade').notNull().default('sc'),
    observacoes: text('observacoes'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoSafraIdx: index('gf_cultura_grupo_safra_idx').on(t.grupoId, t.safra),
    grupoCenarioIdx: index('gf_cultura_grupo_cenario_idx').on(t.grupoId, t.cenario),
  }),
)

export const gfCustoSafra = pgTable(
  'gf_custo_safra',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    safra: text('safra').notNull(),
    tipo: text('tipo').notNull(),
    descricao: text('descricao').notNull(),
    cultura: text('cultura'),
    valorAnual: numeric('valor_anual', { precision: 16, scale: 4 }),
    valorMensal: numeric('valor_mensal', { precision: 16, scale: 4 }),
    ordem: integer('ordem').notNull().default(0),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ grupoSafraIdx: index('gf_custo_grupo_safra_idx').on(t.grupoId, t.safra) }),
)

export const gfDemanda = pgTable(
  'gf_demanda',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    numero: integer('numero'),
    data: text('data'),
    tomador: text('tomador'),
    credor: text('credor'),
    finalidade: text('finalidade'),
    modalidade: text('modalidade'),
    valor: numeric('valor', { precision: 16, scale: 2 }),
    garantias: text('garantias'),
    prazo: text('prazo'),
    parecerTex: text('parecer_tex'),
    estrategia: text('estrategia'),
    enviadoEm: text('enviado_em'),
    retornoEm: text('retorno_em'),
    acoes: text('acoes'),
    status: text('status').notNull().default('em_analise'),
    faturamentoObtido: numeric('faturamento_obtido', { precision: 16, scale: 2 }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoIdx: index('gf_demanda_grupo_idx').on(t.grupoId),
    statusIdx: index('gf_demanda_status_idx').on(t.status),
  }),
)

export const gfContratoDivida = pgTable(
  'gf_contrato_divida',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    credor: text('credor').notNull(),
    emitente: text('emitente'),
    garantiaVinculada: text('garantia_vinculada'),
    outrasGarantias: text('outras_garantias'),
    contrato: text('contrato'),
    valorLiberado: numeric('valor_liberado', { precision: 16, scale: 2 }),
    valorFinanciado: numeric('valor_financiado', { precision: 16, scale: 2 }),
    parcelaCapitalAmortizar: numeric('parcela_capital_amortizar', { precision: 16, scale: 2 }),
    valorParcelaFixa: numeric('valor_parcela_fixa', { precision: 16, scale: 2 }),
    periodicidade: text('periodicidade'),
    metodoCalculo: text('metodo_calculo').notNull().default('PRICE'),
    enquadramento: text('enquadramento'),
    finalidade: text('finalidade'),
    prazoParcelas: integer('prazo_parcelas'),
    dataContratacao: text('data_contratacao'),
    primeiraParcela: text('primeira_parcela'),
    ultimaParcela: text('ultima_parcela'),
    parcelasPagas: integer('parcelas_pagas').notNull().default(0),
    inadimplente: boolean('inadimplente').notNull().default(false),
    taxaNominalAa: numeric('taxa_nominal_aa', { precision: 8, scale: 4 }),
    cetAnual: numeric('cet_anual', { precision: 8, scale: 4 }),
    indexador: text('indexador'),
    pctIndexador: numeric('pct_indexador', { precision: 8, scale: 4 }),
    variacaoCambial: boolean('variacao_cambial').notNull().default(false),
    origemInfo: text('origem_info'),
    ultimaAtualizacao: text('ultima_atualizacao'),
    valorPresente: numeric('valor_presente', { precision: 16, scale: 2 }),
    valorPresenteAtualizado: numeric('valor_presente_atualizado', { precision: 16, scale: 2 }),
    observacoes: text('observacoes'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoIdx: index('gf_contrato_grupo_idx').on(t.grupoId),
    credorIdx: index('gf_contrato_credor_idx').on(t.credor),
  }),
)

export const gfAtivoFazenda = pgTable(
  'gf_ativo_fazenda',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    fazenda: text('fazenda').notNull(),
    proprietario: text('proprietario'),
    matricula: text('matricula'),
    cidade: text('cidade'),
    estado: varchar('estado', { length: 2 }),
    areaTotalHa: numeric('area_total_ha', { precision: 12, scale: 4 }),
    areaConsolidadaHa: numeric('area_consolidada_ha', { precision: 12, scale: 4 }),
    areaPlantioHa: numeric('area_plantio_ha', { precision: 12, scale: 4 }),
    areaIrrigadaHa: numeric('area_irrigada_ha', { precision: 12, scale: 4 }),
    areaPastagemHa: numeric('area_pastagem_ha', { precision: 12, scale: 4 }),
    areaReservaHa: numeric('area_reserva_ha', { precision: 12, scale: 4 }),
    outrosUsosHa: numeric('outros_usos_ha', { precision: 12, scale: 4 }),
    arrendadaTerceirosHa: numeric('arrendada_terceiros_ha', { precision: 12, scale: 4 }),
    valorHaMercado: numeric('valor_ha_mercado', { precision: 16, scale: 2 }),
    valorHaForcado: numeric('valor_ha_forcado', { precision: 16, scale: 2 }),
    nrCcir: text('nr_ccir'),
    nrItr: text('nr_itr'),
    inscricaoEstadual: text('inscricao_estadual'),
    nrCar: text('nr_car'),
    possuiGeo: boolean('possui_geo').notNull().default(false),
    observacoes: text('observacoes'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ grupoIdx: index('gf_fazenda_grupo_idx').on(t.grupoId) }),
)

export const gfSnapshotCalculo = pgTable(
  'gf_snapshot_calculo',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    grupoId: text('grupo_id').notNull(),
    tipo: text('tipo').notNull(),
    payload: jsonb('payload').notNull(),
    calculadoEm: timestamp('calculado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoIdx: index('gf_snapshot_grupo_idx').on(t.grupoId),
    tipoIdx: index('gf_snapshot_tipo_idx').on(t.tipo),
    calcIdx: index('gf_snapshot_calc_idx').on(t.calculadoEm),
  }),
)


/* ─────────────────────────────────────────────────────────────
 * 34-38. GESTÃO FINANCEIRA V2 — extensões da R.OP.001 v2.0
 * (ativos não-fazenda, passivos consolidados, garantias LTV,
 * premissas versionáveis, insights automáticos)
 * ──────────────────────────────────────────────────────────── */

export const gfAtivoOutro = pgTable(
  'gf_ativo_outro',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    tipo: text('tipo').notNull(), // 'produto'|'contrato'|'financeiro'|'maquina'|'outro'
    descricao: text('descricao').notNull(),
    produto: text('produto'),
    estadoUf: varchar('estado_uf', { length: 2 }),
    safra: text('safra'),
    unidade: text('unidade'),
    quantidade: numeric('quantidade', { precision: 16, scale: 4 }),
    precoUnitario: numeric('preco_unitario', { precision: 16, scale: 4 }),
    valorTotal: numeric('valor_total', { precision: 16, scale: 2 }),
    dataRecebimento: text('data_recebimento'),
    vaiParaFc: boolean('vai_para_fc').notNull().default(true),
    observacoes: text('observacoes'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ grupoIdx: index('gf_ativo_outro_grupo_idx').on(t.grupoId, t.tipo) }),
)

export const gfPassivoOutro = pgTable(
  'gf_passivo_outro',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    tipo: text('tipo').notNull(),
    credor: text('credor'),
    descricao: text('descricao').notNull(),
    finalidade: text('finalidade'),
    valor: numeric('valor', { precision: 16, scale: 2 }).notNull().default('0'),
    vencimento: text('vencimento'),
    dataReferencia: text('data_referencia'),
    status: text('status').notNull().default('a_vencer'),
    taxaJurosAa: numeric('taxa_juros_aa', { precision: 8, scale: 4 }),
    formaPagamento: text('forma_pagamento'),
    variacaoCambial: boolean('variacao_cambial').notNull().default(false),
    observacoes: text('observacoes'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoIdx: index('gf_passivo_outro_grupo_idx').on(t.grupoId, t.tipo),
    statusIdx: index('gf_passivo_outro_status_idx').on(t.status),
  }),
)

export const gfGarantia = pgTable(
  'gf_garantia',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    tipo: text('tipo').notNull(),
    descricao: text('descricao').notNull(),
    fazendaId: text('fazenda_id'),
    matricula: text('matricula'),
    areaHa: numeric('area_ha', { precision: 12, scale: 4 }),
    valorMercado: numeric('valor_mercado', { precision: 16, scale: 2 }),
    valorForcado: numeric('valor_forcado', { precision: 16, scale: 2 }),
    contratoVinculado: text('contrato_vinculado'),
    baixasAditivos: text('baixas_aditivos'),
    registrosAverbacoes: text('registros_averbacoes'),
    observacoes: text('observacoes'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoIdx: index('gf_garantia_grupo_idx').on(t.grupoId),
    fazendaIdx: index('gf_garantia_fazenda_idx').on(t.fazendaId),
  }),
)

export const gfPremissa = pgTable(
  'gf_premissa',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    chave: text('chave').notNull(),
    rotulo: text('rotulo').notNull(),
    valor: numeric('valor', { precision: 16, scale: 6 }).notNull(),
    unidade: text('unidade'),
    vigencia: text('vigencia'),
    fonte: text('fonte'),
    observacoes: text('observacoes'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoIdx: index('gf_premissa_grupo_idx').on(t.grupoId),
    chaveIdx: index('gf_premissa_chave_idx').on(t.grupoId, t.chave),
  }),
)

export const gfInsight = pgTable(
  'gf_insight',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    grupoId: text('grupo_id').notNull(),
    severidade: text('severidade').notNull(),
    categoria: text('categoria').notNull(),
    titulo: text('titulo').notNull(),
    mensagem: text('mensagem').notNull(),
    metricas: jsonb('metricas'),
    recomendacao: text('recomendacao'),
    calculadoEm: timestamp('calculado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoIdx: index('gf_insight_grupo_idx').on(t.grupoId, t.calculadoEm),
    severidadeIdx: index('gf_insight_severidade_idx').on(t.severidade),
  }),
)


/* ─────────────────────────────────────────────────────────────
 * 39-41. Wave F — Kanban SLA + Webhook NF-e
 * ──────────────────────────────────────────────────────────── */

export const gfEtapaSla = pgTable(
  'gf_etapa_sla',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    etapaCodigo: text('etapa_codigo').notNull(),
    etapaOrdem: integer('etapa_ordem').notNull(),
    tarefa: text('tarefa').notNull(),
    prazoDias: integer('prazo_dias').notNull(),
    status: text('status').notNull().default('pendente'),
    responsavel: text('responsavel'),
    iniciadaEm: text('iniciada_em'),
    concluidaEm: text('concluida_em'),
    observacoes: text('observacoes'),
    bloqueioMotivo: text('bloqueio_motivo'),
    ordem: integer('ordem').notNull().default(0),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoIdx: index('gf_etapa_sla_grupo_idx').on(t.grupoId, t.etapaOrdem),
    statusIdx: index('gf_etapa_sla_status_idx').on(t.status),
  }),
)

export const gfNfeRecebida = pgTable(
  'gf_nfe_recebida',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    grupoId: text('grupo_id'),
    cnpjEmitente: text('cnpj_emitente'),
    numeroNfe: text('numero_nfe'),
    serie: text('serie'),
    dataEmissao: text('data_emissao'),
    valorTotal: numeric('valor_total', { precision: 16, scale: 2 }),
    produtosCount: integer('produtos_count'),
    culturaPrincipal: text('cultura_principal'),
    payload: jsonb('payload').notNull(),
    processada: boolean('processada').notNull().default(false),
    status: text('status').notNull().default('recebida'),
    erro: text('erro'),
    recebidaEm: timestamp('recebida_em', { withTimezone: true }).defaultNow().notNull(),
    processadaEm: timestamp('processada_em', { withTimezone: true }),
  },
  (t) => ({
    grupoIdx: index('gf_nfe_recebida_grupo_idx').on(t.grupoId),
    emitenteIdx: index('gf_nfe_recebida_emitente_idx').on(t.cnpjEmitente),
    statusIdx: index('gf_nfe_recebida_status_idx').on(t.status),
  }),
)


/* ─────────────────────────────────────────────────────────────
 * 42-44. Wave G — Marketplace + Changelog + Comentários
 * ──────────────────────────────────────────────────────────── */

export const gfTemplateMarketplace = pgTable(
  'gf_template_marketplace',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    rotulo: text('rotulo').notNull(),
    descricao: text('descricao'),
    categoria: text('categoria').notNull(),
    emoji: text('emoji'),
    visibilidade: text('visibilidade').notNull().default('private'),
    autorConsultorId: text('autor_consultor_id'),
    autorNome: text('autor_nome'),
    payload: jsonb('payload').notNull(),
    contadores: jsonb('contadores').notNull().default(sql`'{}'::jsonb`),
    usoCount: integer('uso_count').notNull().default(0),
    isOficial: boolean('is_oficial').notNull().default(false),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    visibilidadeIdx: index('gf_template_visibilidade_idx').on(t.visibilidade),
    consultorIdx: index('gf_template_consultor_idx').on(t.autorConsultorId),
    categoriaIdx: index('gf_template_categoria_idx').on(t.categoria),
  }),
)

export const gfChangelog = pgTable(
  'gf_changelog',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    grupoId: text('grupo_id').notNull(),
    entidade: text('entidade').notNull(),
    entidadeId: text('entidade_id'),
    acao: text('acao').notNull(),
    diff: jsonb('diff'),
    ator: text('ator'),
    atorNome: text('ator_nome'),
    origem: text('origem'),
    traceId: text('trace_id'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoIdx: index('gf_changelog_grupo_idx').on(t.grupoId, t.criadoEm),
    entidadeIdx: index('gf_changelog_entidade_idx').on(t.entidade, t.entidadeId),
  }),
)

export const gfComentario = pgTable(
  'gf_comentario',
  {
    id: text('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    entidade: text('entidade').notNull(),
    entidadeId: text('entidade_id'),
    conteudo: text('conteudo').notNull(),
    autor: text('autor'),
    autorNome: text('autor_nome'),
    parentId: text('parent_id'),
    resolvido: boolean('resolvido').notNull().default(false),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoIdx: index('gf_comentario_grupo_idx').on(t.grupoId),
    entidadeIdx: index('gf_comentario_entidade_idx').on(t.entidade, t.entidadeId),
    parentIdx: index('gf_comentario_parent_idx').on(t.parentId),
  }),
)

export type GfTemplateMarketplace = typeof gfTemplateMarketplace.$inferSelect
export type GfChangelog = typeof gfChangelog.$inferSelect
export type GfComentario = typeof gfComentario.$inferSelect

export type GfEtapaSla = typeof gfEtapaSla.$inferSelect
export type GfNfeRecebida = typeof gfNfeRecebida.$inferSelect

export type GfAtivoOutro = typeof gfAtivoOutro.$inferSelect
export type GfPassivoOutro = typeof gfPassivoOutro.$inferSelect
export type GfGarantia = typeof gfGarantia.$inferSelect
export type GfPremissa = typeof gfPremissa.$inferSelect
export type GfInsight = typeof gfInsight.$inferSelect

export type GfGrupo = typeof gfGrupo.$inferSelect
export type GfMembro = typeof gfMembro.$inferSelect
export type GfCulturaSafra = typeof gfCulturaSafra.$inferSelect
export type GfCustoSafra = typeof gfCustoSafra.$inferSelect
export type GfDemanda = typeof gfDemanda.$inferSelect
export type GfContratoDivida = typeof gfContratoDivida.$inferSelect
export type GfAtivoFazenda = typeof gfAtivoFazenda.$inferSelect
export type GfSnapshotCalculo = typeof gfSnapshotCalculo.$inferSelect

export type ProcessoRender = typeof processoRender.$inferSelect
export type ProcessoRenderInsert = typeof processoRender.$inferInsert

export type NegociacaoCredor = typeof negociacaoCredor.$inferSelect
export type NegociacaoCredorInsert = typeof negociacaoCredor.$inferInsert

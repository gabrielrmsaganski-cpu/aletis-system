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

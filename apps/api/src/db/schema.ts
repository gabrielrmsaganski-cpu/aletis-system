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
  date,
  jsonb,
  bigint,
  bigserial,
  primaryKey,
  index,
  uniqueIndex,
  unique,
  check,
  boolean,
  serial,
  customType,
  foreignKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const vector = customType<{ data: number[] | string; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`
  },
  toDriver(value) {
    return Array.isArray(value) ? `[${value.join(',')}]` : value
  },
})

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
    escritorio: text('escritorio'),
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
    organizationId: text('organization_id').notNull().default('org-aletis'),
    officeId: text('office_id'),
    responsibleUserId: text('responsible_user_id'),
  },
  (t) => ({
    estagioIdx: index('cliente_estagio_idx').on(t.estagio),
    ufIdx: index('cliente_uf_idx').on(t.uf),
    cpfCnpjIdx: index('cliente_cpf_cnpj_idx').on(t.cpfCnpj),
    cpfCnpjNormIdx: index('cliente_cpf_cnpj_norm_idx')
      .on(sql`regexp_replace(${t.cpfCnpj}, '\\D', '', 'g')`)
      .where(sql`length(regexp_replace(${t.cpfCnpj}, '\\D', '', 'g')) in (11, 14)`),
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
    demandaId: text('demanda_id'),
    tipo: text('tipo'),
    status: text('status'), // 'rascunho' | 'revisao' | 'enviada' | 'aceita' | 'rejeitada'
    valorProposto: numeric('valor_proposto', { precision: 18, scale: 2 }),
    titulo: text('titulo'),
    payload: jsonb('payload').notNull(),
    pdfPath: text('pdf_path'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
    creditorId: text('creditor_id'),
    debtId: text('debt_id'),
    simulationWorkspaceId: text('simulation_workspace_id'),
    responsibleUserId: text('responsible_user_id'),
    version: integer('version').notNull().default(1),
    revision: integer('revision').notNull().default(0),
    validUntil: date('valid_until'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
  },
  (t) => ({
    clienteIdx: index('proposta_cliente_idx').on(t.clienteId),
    demandaIdx: index('proposta_demanda_idx').on(t.demandaId),
    statusIdx: index('proposta_status_idx').on(t.status),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 3b. cliente_demanda — pasta operacional por assunto do cliente
 * ──────────────────────────────────────────────────────────── */
export const clienteDemanda = pgTable(
  'cliente_demanda',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    numero: integer('numero').notNull().default(1),
    titulo: text('titulo').notNull(),
    assunto: text('assunto').notNull().default('outro'),
    descricao: text('descricao'),
    categoria: text('categoria').notNull().default('outro'),
    status: text('status').notNull().default('nova'),
    prioridade: text('prioridade').notNull().default('normal'),
    responsavel: text('responsavel'),
    credor: text('credor'),
    valorPretendido: numeric('valor_pretendido', { precision: 18, scale: 2 }),
    prazoAlvo: text('prazo_alvo'),
    proximaAcao: text('proxima_acao'),
    proximaAcaoEm: text('proxima_acao_em'),
    probabilidade: integer('probabilidade').notNull().default(0),
    resultadoEsperado: text('resultado_esperado'),
    propostaPrincipalId: text('proposta_principal_id'),
    origem: text('origem').notNull().default('manual'),
    propostaIds: jsonb('proposta_ids').notNull().default(sql`'[]'::jsonb`),
    documentoIds: jsonb('documento_ids').notNull().default(sql`'[]'::jsonb`),
    eventos: jsonb('eventos').notNull().default(sql`'[]'::jsonb`),
    checklist: jsonb('checklist').notNull().default(sql`'[]'::jsonb`),
    tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('cliente_demanda_cliente_idx').on(t.clienteId, t.atualizadoEm),
    statusIdx: index('cliente_demanda_status_idx').on(t.status),
    proximaAcaoIdx: index('cliente_demanda_proxima_acao_idx').on(t.clienteId, t.proximaAcaoEm),
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
  arquivadoEm: timestamp('arquivado_em', { withTimezone: true }),
  fixadoEm: timestamp('fixado_em', { withTimezone: true }),
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
    payload: jsonb('payload'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index('alix_message_session_idx').on(t.sessionId, t.criadoEm),
  }),
)

export const alixDocumentOnboardingReview = pgTable(
  'alix_document_onboarding_review',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    documentId: text('document_id').notNull(),
    status: text('status').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index('idx_alix_doc_onboarding_review_session').on(t.sessionId),
    statusIdx: index('idx_alix_doc_onboarding_review_status').on(t.status),
    documentIdx: index('idx_alix_doc_onboarding_review_document').on(t.documentId),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 5b. Esteira documental especializada da ALIX
 * ──────────────────────────────────────────────────────────── */
export const alixDocumentPipelineRun = pgTable(
  'alix_document_pipeline_run',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id').notNull(),
    sessionId: text('session_id').notNull(),
    clienteId: text('cliente_id'),
    pipelineVersion: integer('pipeline_version').notNull().default(1),
    status: text('status').notNull().default('queued'),
    currentStage: text('current_stage').notNull().default('receber'),
    progress: integer('progress').notNull().default(0),
    specializedType: text('specialized_type'),
    classifierMethod: text('classifier_method'),
    classificationConfidence: numeric('classification_confidence', { precision: 4, scale: 3 }),
    documentFamilyKey: text('document_family_key'),
    sourceSha256: text('source_sha256'),
    jobId: text('job_id'),
    reviewId: text('review_id'),
    registeredEntityId: text('registered_entity_id'),
    extraction: jsonb('extraction').notNull().default(sql`'{}'::jsonb`),
    stageHistory: jsonb('stage_history').notNull().default(sql`'[]'::jsonb`),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    documentVersionUnique: uniqueIndex('alix_document_pipeline_document_version_uidx').on(t.documentId, t.pipelineVersion),
    documentIdx: index('alix_document_pipeline_document_idx').on(t.documentId, t.pipelineVersion),
    sessionIdx: index('alix_document_pipeline_session_idx').on(t.sessionId, t.updatedAt),
    clienteIdx: index('alix_document_pipeline_cliente_idx').on(t.clienteId, t.status, t.updatedAt),
    statusIdx: index('alix_document_pipeline_status_idx').on(t.status, t.updatedAt),
    familyIdx: index('alix_document_pipeline_family_idx').on(t.clienteId, t.documentFamilyKey, t.createdAt),
  }),
)

export const alixDocumentField = pgTable(
  'alix_document_field',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    documentId: text('document_id').notNull(),
    clienteId: text('cliente_id'),
    fieldKey: text('field_key').notNull(),
    valueText: text('value_text').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    valueType: text('value_type').notNull().default('text'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull().default('0'),
    evidenceText: text('evidence_text').notNull(),
    evidenceSource: text('evidence_source').notNull(),
    page: integer('page'),
    sheet: text('sheet'),
    status: text('status').notNull().default('extracted'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    fieldUnique: uniqueIndex('alix_document_field_run_value_evidence_uidx').on(t.runId, t.fieldKey, t.normalizedValue, t.evidenceText),
    runIdx: index('alix_document_field_run_idx').on(t.runId, t.fieldKey),
    clienteIdx: index('alix_document_field_cliente_idx').on(t.clienteId, t.fieldKey, t.normalizedValue),
    expiryIdx: index('alix_document_field_expiry_idx').on(t.expiresAt, t.status),
  }),
)

export const alixDocumentFinding = pgTable(
  'alix_document_finding',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    documentId: text('document_id').notNull(),
    clienteId: text('cliente_id'),
    kind: text('kind').notNull(),
    severity: text('severity').notNull().default('info'),
    fieldKey: text('field_key'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    relatedDocumentIds: text('related_document_ids').array().notNull().default(sql`ARRAY[]::text[]`),
    evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('open'),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    runIdx: index('alix_document_finding_run_idx').on(t.runId, t.severity, t.status),
    clienteIdx: index('alix_document_finding_cliente_idx').on(t.clienteId, t.kind, t.status, t.createdAt),
  }),
)

export const alixDocumentComparison = pgTable(
  'alix_document_comparison',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    baselineRunId: text('baseline_run_id'),
    comparisonType: text('comparison_type').notNull(),
    similarity: numeric('similarity', { precision: 5, scale: 4 }),
    changedFields: jsonb('changed_fields').notNull().default(sql`'[]'::jsonb`),
    summary: text('summary').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ runIdx: index('alix_document_comparison_run_idx').on(t.runId, t.createdAt) }),
)

/* ─────────────────────────────────────────────────────────────
 * 5c. Workspace de missões da ALIX
 * ──────────────────────────────────────────────────────────── */
export const alixMission = pgTable(
  'alix_mission',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    clienteId: text('cliente_id'),
    consultorId: text('consultor_id'),
    title: text('title').notNull(),
    prompt: text('prompt').notNull(),
    workMode: text('work_mode').notNull(),
    analysisMode: text('analysis_mode').notNull().default('deep'),
    status: text('status').notNull().default('queued'),
    progress: integer('progress').notNull().default(0),
    currentStep: text('current_step'),
    queueName: text('queue_name'),
    jobId: text('job_id'),
    costUsd: numeric('cost_usd', { precision: 18, scale: 6 }).notNull().default('0'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    model: text('model'),
    result: jsonb('result'),
    error: text('error'),
    cancellable: boolean('cancellable').notNull().default(true),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index('alix_mission_session_idx').on(t.sessionId, t.createdAt),
    clienteIdx: index('alix_mission_cliente_idx').on(t.clienteId, t.status, t.createdAt),
    statusIdx: index('alix_mission_status_idx').on(t.status, t.updatedAt),
  }),
)

export const alixMissionStep = pgTable(
  'alix_mission_step',
  {
    id: text('id').primaryKey(),
    missionId: text('mission_id').notNull(),
    position: integer('position').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('pending'),
    progress: integer('progress').notNull().default(0),
    details: text('details'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    missionCodeUnique: uniqueIndex('alix_mission_step_mission_code_uidx').on(t.missionId, t.code),
    missionIdx: index('alix_mission_step_mission_idx').on(t.missionId, t.position),
  }),
)

export const alixMissionSource = pgTable(
  'alix_mission_source',
  {
    id: text('id').primaryKey(),
    missionId: text('mission_id').notNull(),
    kind: text('kind').notNull(),
    sourceId: text('source_id'),
    label: text('label').notNull(),
    url: text('url'),
    evidence: jsonb('evidence').notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ missionIdx: index('alix_mission_source_mission_idx').on(t.missionId, t.createdAt) }),
)

export const alixMissionEvent = pgTable(
  'alix_mission_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    missionId: text('mission_id').notNull(),
    eventType: text('event_type').notNull(),
    status: text('status'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ missionIdx: index('alix_mission_event_mission_idx').on(t.missionId, t.createdAt) }),
)

/* ─────────────────────────────────────────────────────────────
 * 5d. Notebook vivo da ALIX — versões, comentários e ações
 * ──────────────────────────────────────────────────────────── */
export const alixNotebook = pgTable(
  'alix_notebook',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id'),
    sessionId: text('session_id'),
    title: text('title').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('idx_alix_notebook_cliente').on(t.clienteId, t.updatedAt),
    sessionIdx: index('idx_alix_notebook_session').on(t.sessionId, t.updatedAt),
  }),
)

export const alixNotebookArtifactVersion = pgTable(
  'alix_notebook_artifact_version',
  {
    id: text('id').primaryKey(),
    notebookId: text('notebook_id').notNull(),
    lineageId: text('lineage_id').notNull(),
    parentArtifactId: text('parent_artifact_id'),
    version: integer('version').notNull().default(1),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    markdown: text('markdown').notNull(),
    citations: jsonb('citations').notNull().default(sql`'[]'::jsonb`),
    sourceSnapshot: jsonb('source_snapshot').notNull().default(sql`'[]'::jsonb`),
    sourceSnapshotHash: text('source_snapshot_hash'),
    changeSummary: text('change_summary'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    lineageVersionUnique: uniqueIndex('alix_notebook_artifact_lineage_version_uidx').on(t.notebookId, t.lineageId, t.version),
    notebookIdx: index('idx_alix_notebook_artifact_notebook').on(t.notebookId, t.createdAt),
    lineageIdx: index('idx_alix_notebook_artifact_lineage').on(t.lineageId, t.version),
  }),
)

export const alixNotebookComment = pgTable(
  'alix_notebook_comment',
  {
    id: text('id').primaryKey(),
    notebookId: text('notebook_id').notNull(),
    artifactId: text('artifact_id'),
    authorId: text('author_id'),
    text: text('text').notNull(),
    status: text('status').notNull().default('open'),
    appliedInArtifactId: text('applied_in_artifact_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => ({ openIdx: index('idx_alix_notebook_comment_open').on(t.notebookId, t.status, t.createdAt) }),
)

export const alixNotebookAction = pgTable(
  'alix_notebook_action',
  {
    id: text('id').primaryKey(),
    notebookId: text('notebook_id').notNull(),
    sourceArtifactId: text('source_artifact_id'),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ openIdx: index('idx_alix_notebook_action_open').on(t.notebookId, t.status, t.updatedAt) }),
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
 * 8. whatsapp_* — Central WhatsApp IA via Evolution API
 * ──────────────────────────────────────────────────────────── */
export const whatsappConversation = pgTable(
  'whatsapp_conversation',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id'),
    leadId: text('lead_id'),
    telefone: text('telefone').notNull(),
    waJid: text('wa_jid'),
    nomeContato: text('nome_contato'),
    instanceName: text('instance_name').notNull(),
    atendimentoModo: text('atendimento_modo').notNull().default('ia'), // ia | humano
    status: text('status').notNull().default('aberta'), // aberta | aguardando_cliente | reuniao_agendada | encerrada
    etapa: text('etapa').notNull().default('boas_vindas'),
    elegibilidadeStatus: text('elegibilidade_status').notNull().default('em_coleta'),
    crmStatus: text('crm_status').notNull().default('Novo lead'),
    currentState: text('current_state').notNull().default('new_lead'),
    aiEnabled: boolean('ai_enabled').notNull().default(true),
    assignedUserId: text('assigned_user_id'),
    takeoverReason: text('takeover_reason'),
    takeoverAt: timestamp('takeover_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    eligibilityScore: integer('eligibility_score').notNull().default(0),
    prioridade: text('prioridade').notNull().default('normal'),
    tags: text('tags').array(),
    resumo: text('resumo'),
    ultimaMensagemEm: timestamp('ultima_mensagem_em', { withTimezone: true }),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    telefoneIdx: index('whatsapp_conversation_telefone_idx').on(t.telefone),
    clienteIdx: index('whatsapp_conversation_cliente_idx').on(t.clienteId),
    instanceIdx: index('whatsapp_conversation_instance_idx').on(t.instanceName, t.status),
    updatedIdx: index('whatsapp_conversation_updated_idx').on(t.atualizadoEm),
    instancePhoneUnique: uniqueIndex('whatsapp_conversation_instance_phone_uidx').on(t.instanceName, t.telefone),
  }),
)

export const whatsappMessage = pgTable(
  'whatsapp_message',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    instanceName: text('instance_name').notNull(),
    providerMessageId: text('provider_message_id'),
    direction: text('direction').notNull(), // inbound | outbound | system
    type: text('type').notNull(), // text | audio | image | document | status | event
    status: text('status').notNull().default('received'),
    text: text('text'),
    transcription: text('transcription'),
    mediaUrl: text('media_url'),
    mediaMime: text('media_mime'),
    mediaFilename: text('media_filename'),
    mediaStorageKey: text('media_storage_key'),
    fromNumber: text('from_number'),
    toNumber: text('to_number'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationIdx: index('whatsapp_message_conversation_idx').on(t.conversationId, t.timestamp),
    providerIdx: uniqueIndex('whatsapp_message_provider_uidx').on(t.instanceName, t.providerMessageId),
    statusIdx: index('whatsapp_message_status_idx').on(t.status),
  }),
)

export const whatsappDocument = pgTable(
  'whatsapp_document',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    clienteId: text('cliente_id'),
    messageId: text('message_id'),
    filename: text('filename').notNull(),
    mimeType: text('mime_type'),
    storageProvider: text('storage_provider').notNull().default('local'),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256'),
    categoria: text('categoria').notNull().default('nao_classificado'),
    status: text('status').notNull().default('recebido'),
    resumoIa: text('resumo_ia'),
    classification: jsonb('classification').notNull().default(sql`'{}'::jsonb`),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationIdx: index('whatsapp_document_conversation_idx').on(t.conversationId, t.criadoEm),
    clienteIdx: index('whatsapp_document_cliente_idx').on(t.clienteId, t.categoria),
    statusIdx: index('whatsapp_document_status_idx').on(t.status),
  }),
)

export const whatsappEligibilityAnswer = pgTable(
  'whatsapp_eligibility_answer',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    questionKey: text('question_key').notNull(),
    questionText: text('question_text').notNull(),
    answerText: text('answer_text').notNull(),
    answerValue: jsonb('answer_value').notNull().default(sql`'{}'::jsonb`),
    score: integer('score').default(0).notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationIdx: index('whatsapp_eligibility_conversation_idx').on(t.conversationId),
    uniqueAnswer: uniqueIndex('whatsapp_eligibility_answer_uidx').on(t.conversationId, t.questionKey),
  }),
)

export const whatsappWebhookEvent = pgTable(
  'whatsapp_webhook_event',
  {
    id: text('id').primaryKey(),
    instanceName: text('instance_name').notNull(),
    eventType: text('event_type').notNull(),
    providerMessageId: text('provider_message_id'),
    status: text('status').notNull().default('received'),
    error: text('error'),
    payload: jsonb('payload').notNull(),
    recebidoEm: timestamp('recebido_em', { withTimezone: true }).defaultNow().notNull(),
    processadoEm: timestamp('processado_em', { withTimezone: true }),
  },
  (t) => ({
    instanceEventIdx: index('whatsapp_webhook_event_instance_idx').on(t.instanceName, t.eventType, t.recebidoEm),
    providerIdx: index('whatsapp_webhook_event_provider_idx').on(t.providerMessageId),
  }),
)

export const whatsappCalendarEvent = pgTable(
  'whatsapp_calendar_event',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    clienteId: text('cliente_id'),
    consultor: text('consultor').notNull().default('Christian'),
    calendarId: text('calendar_id'),
    externalEventId: text('external_event_id'),
    status: text('status').notNull().default('dry_run'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull().default('America/Cuiaba'),
    titulo: text('titulo').notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationIdx: index('whatsapp_calendar_conversation_idx').on(t.conversationId),
    startIdx: index('whatsapp_calendar_start_idx').on(t.startAt, t.status),
  }),
)

export const whatsappInstance = pgTable(
  'whatsapp_instance',
  {
    id: text('id').primaryKey(),
    instanceName: text('instance_name').notNull(),
    provider: text('provider').notNull().default('evolution'),
    status: text('status').notNull().default('unknown'),
    connectionState: text('connection_state'),
    phone: text('phone'),
    qrCode: text('qr_code'),
    webhookUrl: text('webhook_url'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    instanceUnique: uniqueIndex('whatsapp_instance_name_uidx').on(t.instanceName),
    statusIdx: index('whatsapp_instance_status_idx').on(t.status),
  }),
)

export const whatsappContact = pgTable(
  'whatsapp_contact',
  {
    id: text('id').primaryKey(),
    instanceName: text('instance_name').notNull(),
    telefone: text('telefone').notNull(),
    waJid: text('wa_jid'),
    nomeContato: text('nome_contato'),
    clienteId: text('cliente_id'),
    leadId: text('lead_id'),
    origem: text('origem').notNull().default('whatsapp'),
    canal: text('canal').notNull().default('evolution-api'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    phoneUnique: uniqueIndex('whatsapp_contact_instance_phone_uidx').on(t.instanceName, t.telefone),
    clienteIdx: index('whatsapp_contact_cliente_idx').on(t.clienteId),
  }),
)

export const whatsappConversationState = pgTable(
  'whatsapp_conversation_state',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    state: text('state').notNull(),
    crmStatus: text('crm_status').notNull(),
    aiEnabled: boolean('ai_enabled').notNull().default(true),
    assignedUserId: text('assigned_user_id'),
    takeoverReason: text('takeover_reason'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationIdx: index('whatsapp_conversation_state_idx').on(t.conversationId, t.criadoEm),
  }),
)

export const whatsappMediaFile = pgTable(
  'whatsapp_media_file',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    messageId: text('message_id'),
    providerMediaId: text('provider_media_id'),
    mediaType: text('media_type').notNull(),
    mimeType: text('mime_type'),
    filename: text('filename').notNull(),
    storageProvider: text('storage_provider').notNull().default('local'),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256'),
    sizeBytes: integer('size_bytes'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationIdx: index('whatsapp_media_file_conversation_idx').on(t.conversationId, t.criadoEm),
    messageIdx: index('whatsapp_media_file_message_idx').on(t.messageId),
  }),
)

export const eligibilityChecklist = pgTable(
  'eligibility_checklist',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    version: integer('version').notNull().default(1),
    active: boolean('active').notNull().default(true),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeVersionUnique: uniqueIndex('eligibility_checklist_code_version_uidx').on(t.code, t.version),
    activeIdx: index('eligibility_checklist_active_idx').on(t.active),
  }),
)

export const eligibilityQuestion = pgTable(
  'eligibility_question',
  {
    id: text('id').primaryKey(),
    checklistId: text('checklist_id').notNull(),
    ordem: integer('ordem').notNull(),
    questionKey: text('question_key').notNull(),
    texto: text('texto').notNull(),
    tipoResposta: text('tipo_resposta').notNull(),
    obrigatoria: boolean('obrigatoria').notNull().default(true),
    peso: integer('peso').notNull().default(0),
    condicao: jsonb('condicao').notNull().default(sql`'{}'::jsonb`),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    checklistOrderIdx: index('eligibility_question_checklist_order_idx').on(t.checklistId, t.ordem),
    keyUnique: uniqueIndex('eligibility_question_key_uidx').on(t.checklistId, t.questionKey),
  }),
)

export const eligibilityResult = pgTable(
  'eligibility_result',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    checklistId: text('checklist_id').notNull(),
    score: integer('score').notNull().default(0),
    maxScore: integer('max_score').notNull().default(0),
    result: text('result').notNull(),
    reasons: text('reasons').array(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationUnique: uniqueIndex('eligibility_result_conversation_uidx').on(t.conversationId, t.checklistId),
    resultIdx: index('eligibility_result_idx').on(t.result, t.score),
  }),
)

export const whatsappDocumentRequest = pgTable(
  'whatsapp_document_request',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    clienteId: text('cliente_id'),
    documentKey: text('document_key').notNull(),
    label: text('label').notNull(),
    status: text('status').notNull().default('pendente'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    uniqueRequest: uniqueIndex('whatsapp_doc_request_uidx').on(t.conversationId, t.documentKey),
    statusIdx: index('whatsapp_doc_request_status_idx').on(t.status),
  }),
)

export const whatsappCalendarBookingOption = pgTable(
  'whatsapp_calendar_booking_option',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    optionNumber: integer('option_number').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    label: text('label').notNull(),
    status: text('status').notNull().default('offered'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationIdx: index('whatsapp_booking_option_conversation_idx').on(t.conversationId, t.status),
  }),
)

export const whatsappCalendarBooking = pgTable(
  'whatsapp_calendar_booking',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    clienteId: text('cliente_id'),
    optionId: text('option_id'),
    calendarId: text('calendar_id'),
    externalEventId: text('external_event_id'),
    status: text('status').notNull().default('dry_run'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    summary: text('summary').notNull(),
    description: text('description'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationIdx: index('whatsapp_booking_conversation_idx').on(t.conversationId, t.status),
    eventIdx: index('whatsapp_booking_external_event_idx').on(t.externalEventId),
  }),
)

export const whatsappOutbox = pgTable(
  'whatsapp_outbox',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id'),
    instanceName: text('instance_name').notNull(),
    toNumber: text('to_number').notNull(),
    messageType: text('message_type').notNull().default('text'),
    content: text('content'),
    mediaStorageKey: text('media_storage_key'),
    status: text('status').notNull().default('queued'),
    attempt: integer('attempt').notNull().default(0),
    error: text('error'),
    providerMessageId: text('provider_message_id'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    queuedAt: timestamp('queued_at', { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index('whatsapp_outbox_status_idx').on(t.status, t.queuedAt),
    conversationIdx: index('whatsapp_outbox_conversation_idx').on(t.conversationId),
  }),
)

export const whatsappAuditLog = pgTable(
  'whatsapp_audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    conversationId: text('conversation_id'),
    instanceName: text('instance_name'),
    action: text('action').notNull(),
    actor: text('actor').notNull().default('system'),
    level: text('level').notNull().default('info'),
    details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationIdx: index('whatsapp_audit_conversation_idx').on(t.conversationId, t.criadoEm),
    actionIdx: index('whatsapp_audit_action_idx').on(t.action, t.criadoEm),
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
    clienteId: text('cliente_id'),
    missionId: text('mission_id'),
    notebookId: text('notebook_id'),
    artifactId: text('artifact_id'),
    rating: text('rating'), // canônico: 'util'|'incompleta'|'incorreto'|'off-tom'
    motivo: text('motivo'),
    comentario: text('comentario'),
    category: text('category'),
    responseExcerpt: text('response_excerpt'),
    expectedCorrection: text('expected_correction'),
    triageStatus: text('triage_status').notNull().default('unreviewed'),
    priority: text('priority').notNull().default('normal'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    payload: jsonb('payload').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index('alix_feedback_session_idx').on(t.sessionId, t.criadoEm),
    ratingIdx: index('alix_feedback_rating_idx').on(t.rating),
    triageIdx: index('alix_feedback_triage_idx').on(t.triageStatus, t.criadoEm),
    categoryIdx: index('alix_feedback_category_idx').on(t.category, t.criadoEm),
  }),
)

export const alixQualityCase = pgTable(
  'alix_quality_case',
  {
    id: text('id').primaryKey(),
    feedbackId: bigint('feedback_id', { mode: 'number' }),
    fingerprint: text('fingerprint').notNull(),
    category: text('category').notNull(),
    severity: text('severity').notNull().default('medium'),
    status: text('status').notNull().default('open'),
    summary: text('summary').notNull(),
    context: jsonb('context').notNull().default(sql`'{}'::jsonb`),
    ownerId: text('owner_id'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    resolution: text('resolution'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => ({
    feedbackUnique: uniqueIndex('alix_quality_case_feedback_uidx').on(t.feedbackId),
    queueIdx: index('idx_alix_quality_case_queue').on(t.status, t.severity, t.createdAt),
    fingerprintIdx: index('idx_alix_quality_case_fingerprint').on(t.fingerprint, t.createdAt),
  }),
)

export const alixGoldenCase = pgTable(
  'alix_golden_case',
  {
    id: text('id').primaryKey(),
    sourceKind: text('source_kind').notNull(),
    sourceIdHash: text('source_id_hash').notNull(),
    caseType: text('case_type').notNull(),
    anonymizedInput: jsonb('anonymized_input').notNull(),
    expectedOutput: jsonb('expected_output').notNull(),
    correctSources: jsonb('correct_sources').notNull().default(sql`'[]'::jsonb`),
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
    reviewStatus: text('review_status').notNull().default('candidate'),
    datasetVersion: integer('dataset_version').notNull().default(1),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => ({
    contentUnique: uniqueIndex('alix_golden_case_content_uidx').on(t.contentHash),
    datasetIdx: index('idx_alix_golden_case_dataset').on(t.datasetVersion, t.reviewStatus, t.caseType),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 17. Governança de IA — releases, evals e automações seguras
 * ──────────────────────────────────────────────────────────── */
export const alixGovernanceRelease = pgTable(
  'alix_governance_release',
  {
    id: text('id').primaryKey(),
    component: text('component').notNull(),
    changeType: text('change_type').notNull(), // prompt | model | policy | workflow
    candidateVersion: text('candidate_version').notNull(),
    baselineVersion: text('baseline_version'),
    status: text('status').notNull().default('draft'),
    thresholds: jsonb('thresholds').notNull().default(sql`'{}'::jsonb`),
    metrics: jsonb('metrics').notNull().default(sql`'{}'::jsonb`),
    evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
    datasetVersion: integer('dataset_version').notNull().default(1),
    evaluationPassed: boolean('evaluation_passed').notNull().default(false),
    createdBy: text('created_by'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    candidateUnique: uniqueIndex('alix_governance_release_candidate_uidx').on(t.component, t.candidateVersion),
    statusIdx: index('idx_alix_governance_release_status').on(t.status, t.updatedAt),
    componentIdx: index('idx_alix_governance_release_component').on(t.component, t.activatedAt),
  }),
)

export const alixGovernanceEvalRun = pgTable(
  'alix_governance_eval_run',
  {
    id: text('id').primaryKey(),
    releaseId: text('release_id').references(() => alixGovernanceRelease.id, { onDelete: 'set null' }),
    suite: text('suite').notNull(),
    datasetVersion: integer('dataset_version').notNull().default(1),
    sampleSize: integer('sample_size').notNull(),
    passed: integer('passed').notNull(),
    failed: integer('failed').notNull(),
    metrics: jsonb('metrics').notNull().default(sql`'{}'::jsonb`),
    evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
    gitSha: text('git_sha'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    releaseIdx: index('idx_alix_governance_eval_release').on(t.releaseId, t.createdAt),
    suiteIdx: index('idx_alix_governance_eval_suite').on(t.suite, t.createdAt),
  }),
)

export const alixAutomationSuggestion = pgTable(
  'alix_automation_suggestion',
  {
    id: text('id').primaryKey(),
    fingerprint: text('fingerprint').notNull(),
    clienteId: text('cliente_id'),
    suggestionType: text('suggestion_type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    severity: text('severity').notNull().default('info'),
    riskLevel: text('risk_level').notNull().default('read'),
    status: text('status').notNull().default('pending_review'),
    sources: jsonb('sources').notNull().default(sql`'[]'::jsonb`),
    proposedAction: jsonb('proposed_action').notNull().default(sql`'{}'::jsonb`),
    confirmationId: text('confirmation_id'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    fingerprintUnique: uniqueIndex('alix_automation_suggestion_fingerprint_uidx').on(t.fingerprint),
    queueIdx: index('idx_alix_automation_suggestion_queue').on(t.status, t.severity, t.lastSeenAt),
    clientIdx: index('idx_alix_automation_suggestion_client').on(t.clienteId, t.status, t.lastSeenAt),
  }),
)

export const alixConfirmationApproval = pgTable(
  'alix_confirmation_approval',
  {
    id: text('id').primaryKey(),
    confirmationId: text('confirmation_id').notNull(),
    batchId: text('batch_id'),
    actorId: text('actor_id').notNull(),
    approvalStep: integer('approval_step').notNull(),
    decision: text('decision').notNull(),
    riskLevel: text('risk_level').notNull(),
    toolName: text('tool_name').notNull(),
    details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    confirmationIdx: index('idx_alix_confirmation_approval_confirmation').on(t.confirmationId, t.createdAt),
    actorIdx: index('idx_alix_confirmation_approval_actor').on(t.actorId, t.createdAt),
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
    usuarioLowerUnique: uniqueIndex('portal_acesso_usuario_lower_unique').on(sql`lower(${t.usuario})`),
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
    anexos: jsonb('anexos'), // referências a uploads do próprio cliente, sem URLs arbitrárias
    metadata: jsonb('metadata').default({}).notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    lidaEm: timestamp('lida_em', { withTimezone: true }),
  },
  (t) => ({
    clienteIdx: index('portal_mensagem_cliente_idx').on(t.clienteId, t.criadoEm),
    idempotencyIdx: uniqueIndex('portal_mensagem_idempotency_idx').on(t.clienteId, t.de, sql`(${t.metadata}->>'actorId')`, sql`(${t.metadata}->>'idempotencyKey')`).where(sql`${t.metadata}->>'idempotencyKey' IS NOT NULL`),
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
    status: text('status').default('pendente').notNull(), // 'pendente'|'enviado'|'aprovado'|'rejeitado'|'cancelado'
    uploadId: text('upload_id'), // referência a portal_upload quando enviado
    solicitadoPor: text('solicitado_por'), // nome do consultor
    solicitadoEm: timestamp('solicitado_em', { withTimezone: true }).defaultNow().notNull(),
    enviadoEm: timestamp('enviado_em', { withTimezone: true }),
    revisadoEm: timestamp('revisado_em', { withTimezone: true }),
    observacao: text('observacao'),
    prioridade: text('prioridade').default('normal').notNull(),
    prazo: date('prazo'),
    tipoDocumento: text('tipo_documento'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
  },
  (t) => ({
    clienteStatusIdx: index('portal_doc_pend_cliente_status_idx').on(t.clienteId, t.status),
    idempotencyIdx: uniqueIndex('portal_doc_pend_idempotency_idx').on(t.clienteId, sql`(${t.metadata}->>'idempotencyKey')`).where(sql`${t.metadata}->>'idempotencyKey' IS NOT NULL`),
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
    idempotencyKey: text('idempotency_key'),
  },
  (t) => ({
    clienteIdx: index('portal_upload_cliente_idx').on(t.clienteId, t.enviadoEm),
    pendenciaIdx: index('portal_upload_pendencia_idx').on(t.pendenciaId),
    idempotencyIdx: uniqueIndex('portal_upload_idempotency_idx').on(t.clienteId, t.idempotencyKey).where(sql`${t.idempotencyKey} IS NOT NULL`),
  }),
)

/** Fila durável: cada envio é confirmado junto do pedido e do trabalho pendente. */
export const portalDocumentProcessingJob = pgTable('portal_document_processing_job', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id').notNull().unique().references(() => portalUpload.id, { onDelete: 'cascade' }),
  clienteId: text('cliente_id').notNull(),
  status: text('status').default('queued').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  leaseToken: text('lease_token'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  claimIdx: index('portal_doc_processing_claim_idx').on(t.status, t.availableAt, t.createdAt),
  clientIdx: index('portal_doc_processing_client_idx').on(t.clienteId, t.updatedAt),
}))

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

/** Conversas da ALIX sobrevivem a reinícios e cada pergunta tem recibo idempotente. */
export const portalAlixSession = pgTable('portal_alix_session', {
  id: text('id').primaryKey(),
  clienteId: text('cliente_id').notNull().references(() => cliente.id),
  titulo: text('titulo').notNull(),
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, t => ({
  requestUnique: unique('portal_alix_session_cliente_id_request_id_key').on(t.clienteId, t.requestId),
  ownerUnique: unique('portal_alix_session_id_cliente_id_key').on(t.id, t.clienteId),
  clientIdx: index('portal_alix_session_client_idx').on(t.clienteId, t.updatedAt.desc(), t.id.desc()),
}))

export const portalAlixTurn = pgTable('portal_alix_turn', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  clienteId: text('cliente_id').notNull(),
  requestId: text('request_id').notNull(),
  ordinal: integer('ordinal').notNull(),
  question: text('question').notNull(),
  status: text('status').notNull(),
  answer: text('answer'),
  publicSources: jsonb('public_sources').default([]).notNull(),
  actions: jsonb('actions').default([]).notNull(),
  contextHash: text('context_hash'),
  errorCode: text('error_code'),
  attempts: integer('attempts').default(1).notNull(),
  leaseToken: text('lease_token'),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, t => ({
  ownerFk: foreignKey({ columns: [t.sessionId,t.clienteId], foreignColumns: [portalAlixSession.id,portalAlixSession.clienteId], name: 'portal_alix_turn_session_id_cliente_id_fkey' }).onDelete('cascade'),
  requestUnique: unique('portal_alix_turn_session_id_request_id_key').on(t.sessionId,t.requestId),
  ordinalUnique: unique('portal_alix_turn_session_id_ordinal_key').on(t.sessionId,t.ordinal),
  sessionIdx: index('portal_alix_turn_session_idx').on(t.sessionId,t.ordinal.desc()),
  processingUnique: uniqueIndex('portal_alix_turn_processing_unique').on(t.sessionId).where(sql`${t.status}='processing'`),
  ordinalCheck: check('portal_alix_turn_ordinal_check',sql`${t.ordinal}>0`),
  attemptsCheck: check('portal_alix_turn_attempts_check',sql`${t.attempts}>0`),
  statusCheck: check('portal_alix_turn_status_check',sql`${t.status} IN ('processing','completed','failed')`),
  answerCheck: check('portal_alix_turn_check',sql`${t.status}<>'completed' OR (${t.answer} IS NOT NULL AND length(trim(${t.answer}))>0)`),
}))

/** Pedidos do cliente; alterações cadastrais só são aplicadas em revisão explícita. */
export const portalClientRequest = pgTable('portal_client_request', {
  id: text('id').primaryKey(),
  clienteId: text('cliente_id').notNull(),
  tipo: text('tipo').notNull(),
  assunto: text('assunto').notNull(),
  mensagem: text('mensagem').notNull(),
  alteracoes: jsonb('alteracoes').default({}).notNull(),
  status: text('status').default('aberta').notNull(),
  resposta: text('resposta'),
  idempotencyKey: text('idempotency_key').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, t => ({
  requestUnique: unique('portal_client_request_cliente_id_idempotency_key_key').on(t.clienteId,t.idempotencyKey),
  statusIdx: index('portal_client_request_status_idx').on(t.clienteId,t.status,t.createdAt),
  tipoCheck: check('portal_client_request_tipo_check',sql`${t.tipo} IN ('atualizacao_cadastral','duvida','contato')`),
  statusCheck: check('portal_client_request_status_check',sql`${t.status} IN ('aberta','em_atendimento','concluida','cancelada')`),
}))

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
export type ClienteDemanda = typeof clienteDemanda.$inferSelect
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
 * Recálculo de proposta de acordo — séries oficiais e snapshots
 * ──────────────────────────────────────────────────────────── */
export const monetaryIndex = pgTable('monetary_index', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  providerSeriesId: text('provider_series_id').notNull(),
  frequency: text('frequency').notNull(),
  unit: text('unit').notNull(),
  calculationMethod: text('calculation_method').notNull(),
  sourceUrl: text('source_url').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ codeIdx: uniqueIndex('monetary_index_code_idx').on(t.code) }))

export const monetaryIndexValue = pgTable('monetary_index_value', {
  id: text('id').primaryKey(),
  monetaryIndexId: text('monetary_index_id').notNull(),
  referencePeriod: text('reference_period').notNull(),
  monthlyRate: numeric('monthly_rate', { precision: 24, scale: 12 }).notNull(),
  indexNumber: numeric('index_number', { precision: 30, scale: 18 }),
  cumulativeFactor: numeric('cumulative_factor', { precision: 36, scale: 18 }).notNull(),
  provider: text('provider').notNull(),
  source: text('source').notNull(),
  sourceUrl: text('source_url').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  revision: integer('revision').default(1).notNull(),
  checksum: text('checksum'),
}, (t) => ({
  periodIdx: index('monetary_index_value_period_idx').on(t.monetaryIndexId, t.referencePeriod),
  revisionUnique: uniqueIndex('monetary_index_value_revision_uq').on(t.monetaryIndexId, t.referencePeriod, t.revision),
}))

export const recalculoAcordo = pgTable('recalculo_acordo', {
  id: text('id').primaryKey(),
  codigo: text('codigo').notNull(),
  organizationId: text('organization_id').notNull().default('default'),
  usuarioId: text('usuario_id'),
  usuarioNome: text('usuario_nome'),
  clienteId: text('cliente_id'),
  propostaId: text('proposta_id'),
  negociacaoId: text('negociacao_id'),
  titulo: text('titulo').notNull(),
  indiceCode: text('indice_code').notNull(),
  corrigirAte: text('corrigir_ate').notNull(),
  moraMensalPct: numeric('mora_mensal_pct', { precision: 12, scale: 8 }).notNull(),
  metodologia: text('metodologia').notNull(),
  inputs: jsonb('inputs').notNull(),
  resultado: jsonb('resultado').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  versao: integer('versao').default(1).notNull(),
  arquivadoEm: timestamp('arquivado_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  codigoIdx: uniqueIndex('recalculo_acordo_codigo_idx').on(t.codigo),
  orgIdx: index('recalculo_acordo_org_idx').on(t.organizationId),
  clienteIdx: index('recalculo_acordo_cliente_idx').on(t.clienteId),
  propostaIdx: index('recalculo_acordo_proposta_idx').on(t.propostaId),
  negociacaoIdx: index('recalculo_acordo_negociacao_idx').on(t.negociacaoId),
}))


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
    terceirizado: boolean('terceirizado').notNull().default(false),
    quantidade: numeric('quantidade', { precision: 14, scale: 4 }),
    unidade: text('unidade'),
    valorUnitario: numeric('valor_unitario', { precision: 14, scale: 4 }),
    valorAnual: numeric('valor_anual', { precision: 16, scale: 4 }),
    valorMensal: numeric('valor_mensal', { precision: 16, scale: 4 }),
    observacoes: text('observacoes'),
    ordem: integer('ordem').notNull().default(0),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
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

/* ─────────────────────────────────────────────────────────────
 * ADM — Módulo Administrativo Multi-escritório
 * ──────────────────────────────────────────────────────────── */
export const admFuncionario = pgTable(
  'adm_funcionario',
  {
    id: text('id').primaryKey(),
    nome: text('nome').notNull(),
    cargo: text('cargo').notNull(),
    escritorio: text('escritorio').notNull(),
    salarioBase: numeric('salario_base', { precision: 12, scale: 2 }),
    dataContratacao: text('data_contratacao'), // YYYY-MM-DD
    telefone: text('telefone'),
    email: text('email'),
    status: text('status').notNull().default('ativo'), // ativo | ferias | afastado | desligado
    observacoes: text('observacoes'),
    payload: jsonb('payload').notNull().default({}),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    escritorioIdx: index('adm_funcionario_escritorio_idx').on(t.escritorio),
    statusIdx: index('adm_funcionario_status_idx').on(t.status),
  }),
)

export const admReceita = pgTable(
  'adm_receita',
  {
    id: text('id').primaryKey(),
    escritorio: text('escritorio').notNull(),
    competencia: text('competencia').notNull(), // YYYY-MM
    descricao: text('descricao').notNull(),
    origem: text('origem'), // cliente | servico | outro
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    dataRecebimento: text('data_recebimento'), // YYYY-MM-DD
    formaPagamento: text('forma_pagamento'),
    status: text('status').notNull().default('recebida'), // recebida | previsto | atrasada
    payload: jsonb('payload').notNull().default({}),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    escritorioCompetenciaIdx: index('adm_receita_escritorio_competencia_idx').on(t.escritorio, t.competencia),
    statusIdx: index('adm_receita_status_idx').on(t.status),
  }),
)

export const admDespesa = pgTable(
  'adm_despesa',
  {
    id: text('id').primaryKey(),
    escritorio: text('escritorio').notNull(),
    competencia: text('competencia').notNull(), // YYYY-MM
    descricao: text('descricao').notNull(),
    categoria: text('categoria').notNull(), // salario | aluguel | material | viagem | outro
    fornecedor: text('fornecedor'),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    dataPagamento: text('data_pagamento'), // YYYY-MM-DD
    dataVencimento: text('data_vencimento'),
    status: text('status').notNull().default('pago'), // pago | pendente | atrasado
    payload: jsonb('payload').notNull().default({}),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    escritorioCompetenciaIdx: index('adm_despesa_escritorio_competencia_idx').on(t.escritorio, t.competencia),
    categoriaIdx: index('adm_despesa_categoria_idx').on(t.categoria),
  }),
)

export const admFolhaPagamento = pgTable(
  'adm_folha_pagamento',
  {
    id: text('id').primaryKey(),
    funcionarioId: text('funcionario_id').notNull(),
    escritorio: text('escritorio').notNull(),
    competencia: text('competencia').notNull(), // YYYY-MM
    salarioBase: numeric('salario_base', { precision: 12, scale: 2 }).notNull(),
    bonus: numeric('bonus', { precision: 12, scale: 2 }).default('0'),
    descontos: numeric('descontos', { precision: 12, scale: 2 }).default('0'),
    valorLiquido: numeric('valor_liquido', { precision: 12, scale: 2 }).notNull(),
    dataPagamento: text('data_pagamento'),
    status: text('status').notNull().default('pago'), // pago | previsto | atrasado
    payload: jsonb('payload').notNull().default({}),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    funcionarioIdx: index('adm_folha_funcionario_idx').on(t.funcionarioId),
    escritorioCompetenciaIdx: index('adm_folha_escritorio_competencia_idx').on(t.escritorio, t.competencia),
  }),
)

export type GfTemplateMarketplace = typeof gfTemplateMarketplace.$inferSelect
export type GfChangelog = typeof gfChangelog.$inferSelect
export type GfComentario = typeof gfComentario.$inferSelect

export type GfEtapaSla = typeof gfEtapaSla.$inferSelect
export type GfNfeRecebida = typeof gfNfeRecebida.$inferSelect

export const admMeta = pgTable(
  'adm_meta',
  {
    id: text('id').primaryKey(),
    escritorio: text('escritorio').notNull(),
    competencia: text('competencia').notNull(), // YYYY-MM
    tipo: text('tipo').notNull(), // receita | despesa | folha | contratos | clientes
    valorMeta: numeric('valor_meta', { precision: 18, scale: 2 }).notNull(),
    atual: numeric('atual', { precision: 18, scale: 2 }).default('0'),
    payload: jsonb('payload').notNull().default({}),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    escritorioCompetenciaIdx: index('adm_meta_escritorio_competencia_idx').on(t.escritorio, t.competencia),
    tipoIdx: index('adm_meta_tipo_idx').on(t.tipo),
  }),
)

export const admProjeto = pgTable(
  'adm_projeto',
  {
    id: text('id').primaryKey(),
    escritorio: text('escritorio').notNull(),
    titulo: text('titulo').notNull(),
    cliente: text('cliente'),
    consultor: text('consultor'),
    valorEstimado: numeric('valor_estimado', { precision: 18, scale: 2 }).default('0'),
    valorFechado: numeric('valor_fechado', { precision: 18, scale: 2 }).default('0'),
    etapa: text('etapa').notNull().default('prospeccao'), // prospeccao | analise | proposta | negociacao | contrato | concluido | perdido
    prioridade: text('prioridade').notNull().default('media'), // baixa | media | alta | urgente
    dataPrevisaoFechamento: text('data_previsao_fechamento'), // YYYY-MM-DD
    observacoes: text('observacoes'),
    payload: jsonb('payload').notNull().default({}),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    escritorioIdx: index('adm_projeto_escritorio_idx').on(t.escritorio),
    etapaIdx: index('adm_projeto_etapa_idx').on(t.etapa),
    prioridadeIdx: index('adm_projeto_prioridade_idx').on(t.prioridade),
  }),
)

export const admComentario = pgTable(
  'adm_comentario',
  {
    id: text('id').primaryKey(),
    escritorio: text('escritorio').notNull(),
    entidadeTipo: text('entidade_tipo').notNull(), // projeto | receita | despesa | funcionario | folha | geral
    entidadeId: text('entidade_id').notNull(),
    autor: text('autor').notNull(),
    conteudo: text('conteudo').notNull(),
    payload: jsonb('payload').notNull().default({}),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    entidadeIdx: index('adm_comentario_entidade_idx').on(t.entidadeTipo, t.entidadeId),
    escritorioIdx: index('adm_comentario_escritorio_idx').on(t.escritorio),
  }),
)

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

// ─── Checklist Assessoria (R.OP.003 / 004 / 005) ────────────────────

export const admChecklistCliente = pgTable(
  'adm_checklist_cliente',
  {
    id: serial('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    escritorio: text('escritorio').notNull(), // 'Aletis' | 'Canarana'
    checklistCodigo: text('checklist_codigo').notNull(), // R.OP.003 / 004 / 005
    checklistNome: text('checklist_nome').notNull(),
    respostas: jsonb('respostas').notNull().default({}),
    status: text('status').notNull().default('pendente'), // pendente | em_andamento | concluido
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteChecklistIdx: uniqueIndex('adm_checklist_cliente_uidx')
      .on(t.clienteId, t.checklistCodigo),
    escritorioIdx: index('adm_checklist_escritorio_idx').on(t.escritorio),
  }),
)

export type AdmChecklistCliente = typeof admChecklistCliente.$inferSelect
export type AdmChecklistClienteInsert = typeof admChecklistCliente.$inferInsert

// ─── Registro Mensal / Foto Mensal (R.OP.007 / R.OP.008) ─────────────

export const gfRegistroMensal = pgTable(
  'gf_registro_mensal',
  {
    id: serial('id').primaryKey(),
    grupoId: text('grupo_id').notNull(),
    competencia: text('competencia').notNull(), // YYYY-MM
    tipo: text('tipo').notNull(), // receita | despesa
    descricao: text('descricao').notNull(),
    categoria: text('categoria').notNull().default('geral'),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull().default('0'),
    dataLancamento: text('data_lancamento'),
    origem: text('origem').default('manual'),
    observacoes: text('observacoes'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    grupoCompIdx: index('gf_reg_mensal_grupo_comp_idx').on(t.grupoId, t.competencia),
    tipoIdx: index('gf_reg_mensal_tipo_idx').on(t.tipo),
  }),
)

export type GfRegistroMensal = typeof gfRegistroMensal.$inferSelect
export type GfRegistroMensalInsert = typeof gfRegistroMensal.$inferInsert

/* ─────────────────────────────────────────────────────────────
 * 26. alix_memory_fact — memória longa estruturada (fatos extraídos)
 * ──────────────────────────────────────────────────────────── */
export const alixMemoryFact = pgTable(
  'alix_memory_fact',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    clienteId: text('cliente_id'),
    consultorId: text('consultor_id'),
    sessionId: text('session_id'),
    factType: text('fact_type').notNull(), // 'preferencia' | 'dado_operacional' | 'contexto' | 'perfil_risco' | 'intencao'
    factKey: text('fact_key').notNull(),
    canonicalKey: text('canonical_key').notNull(),
    factValue: text('fact_value').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).default('1.0').notNull(),
    source: text('source'), // 'conversation' | 'documento' | 'crm' | 'manual'
    sourceId: text('source_id'),
    status: text('status').notNull().default('pending_review'),
    version: integer('version').notNull().default(1),
    valueHash: text('value_hash').notNull(),
    evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
    validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('alix_memory_fact_cliente_idx').on(t.clienteId, t.factType, t.atualizadoEm),
    consultorIdx: index('alix_memory_fact_consultor_idx').on(t.consultorId, t.atualizadoEm),
    sessionIdx: index('alix_memory_fact_session_idx').on(t.sessionId),
    keyIdx: index('alix_memory_fact_key_idx').on(t.factKey, t.factValue),
    activeIdx: index('alix_memory_fact_active_idx').on(t.clienteId, t.status, t.atualizadoEm),
  }),
)

export const alixFactRevision = pgTable(
  'alix_fact_revision',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    factId: bigserial('fact_id', { mode: 'number' }).notNull(),
    version: integer('version').notNull(),
    previousValue: text('previous_value'),
    factValue: text('fact_value').notNull(),
    previousConfidence: numeric('previous_confidence', { precision: 3, scale: 2 }),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    previousStatus: text('previous_status'),
    status: text('status').notNull(),
    source: text('source').notNull(),
    sourceId: text('source_id'),
    evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
    changeReason: text('change_reason').notNull().default('observed'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    factIdx: index('alix_fact_revision_fact_idx').on(t.factId, t.version),
    sourceIdx: index('alix_fact_revision_source_idx').on(t.source, t.sourceId, t.createdAt),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 27. alix_document_chunk — chunks para RAG semântico
 * ──────────────────────────────────────────────────────────── */
export const alixDocumentChunk = pgTable(
  'alix_document_chunk',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    documentId: text('document_id').notNull(),
    sessionId: text('session_id'),
    clienteId: text('cliente_id'),
    source: text('source').notNull(), // 'upload' | 'crm' | 'web' | 'proposta' | 'dossie'
    sourceFilename: text('source_filename'),
    pageStart: integer('page_start'),
    pageEnd: integer('page_end'),
    sheet: text('sheet'),
    chunkText: text('chunk_text').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    chunkSize: integer('chunk_size').notNull().default(0),
    contentHash: text('content_hash'),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    documentIdx: index('alix_document_chunk_document_idx').on(t.documentId, t.chunkIndex),
    clienteIdx: index('alix_document_chunk_cliente_idx').on(t.clienteId, t.source),
    sessionIdx: index('alix_document_chunk_session_idx').on(t.sessionId),
    ftsIdx: index('alix_document_chunk_fts_idx').on(sql`to_tsvector('portuguese', ${t.chunkText})`),
  }),
)

export const alixRagIndexState = pgTable(
  'alix_rag_index_state',
  {
    id: text('id').primaryKey(),
    sourceKind: text('source_kind').notNull(),
    sourceId: text('source_id').notNull(),
    documentId: text('document_id').notNull(),
    clienteId: text('cliente_id'),
    sessionId: text('session_id'),
    contentHash: text('content_hash').notNull(),
    embeddingModel: text('embedding_model').notNull(),
    status: text('status').notNull().default('pending'),
    chunkCount: integer('chunk_count').notNull().default(0),
    embeddingCount: integer('embedding_count').notNull().default(0),
    jobId: text('job_id'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index('alix_rag_index_state_status_idx').on(t.status, t.updatedAt),
    clienteIdx: index('alix_rag_index_state_cliente_idx').on(t.clienteId, t.status, t.updatedAt),
    documentIdx: index('alix_rag_index_state_document_idx').on(t.documentId),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 28. alix_document_embedding — embeddings vetoriais pgvector
 * ──────────────────────────────────────────────────────────── */
export const alixDocumentEmbedding = pgTable(
  'alix_document_embedding',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chunkId: bigserial('chunk_id', { mode: 'number' }).notNull(),
    documentId: text('document_id').notNull(),
    clienteId: text('cliente_id'),
    embeddingModel: text('embedding_model').notNull().default('text-embedding-3-small'),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    dimensions: integer('dimensions').notNull().default(1536),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    chunkIdx: index('alix_document_embedding_chunk_idx').on(t.chunkId),
    documentIdx: index('alix_document_embedding_document_idx').on(t.documentId),
    clienteIdx: index('alix_document_embedding_cliente_idx').on(t.clienteId),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 29. ALETIS Core CRM — entidades normalizadas de operação
 * ──────────────────────────────────────────────────────────── */
export const clientContact = pgTable(
  'client_contact',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    nome: text('nome').notNull(),
    tipo: text('tipo').notNull().default('contato'), // socio | contador | banco | familiar | contato
    cargo: text('cargo'),
    telefone: text('telefone'),
    whatsapp: text('whatsapp'),
    email: text('email'),
    principal: boolean('principal').notNull().default(false),
    origem: text('origem').notNull().default('manual'),
    status: text('status').notNull().default('ativo'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('client_contact_cliente_idx').on(t.clienteId, t.status),
    emailIdx: index('client_contact_email_idx').on(t.email),
    telefoneIdx: index('client_contact_telefone_idx').on(t.telefone),
  }),
)

export const clientTask = pgTable(
  'client_task',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    titulo: text('titulo').notNull(),
    descricao: text('descricao'),
    status: text('status').notNull().default('pendente'), // pendente | em_andamento | concluida | cancelada
    prioridade: text('prioridade').notNull().default('normal'), // baixa | normal | alta | critica
    responsavelId: text('responsavel_id'),
    responsavelNome: text('responsavel_nome'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    concluidaEm: timestamp('concluida_em', { withTimezone: true }),
    criadoPor: text('criado_por'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('client_task_cliente_idx').on(t.clienteId, t.status),
    dueIdx: index('client_task_due_idx').on(t.dueAt, t.status),
    responsavelIdx: index('client_task_responsavel_idx').on(t.responsavelId, t.status),
  }),
)

export const clientMeeting = pgTable(
  'client_meeting',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    titulo: text('titulo').notNull(),
    descricao: text('descricao'),
    status: text('status').notNull().default('agendada'), // agendada | realizada | cancelada | reagendada
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }),
    consultorId: text('consultor_id'),
    consultorNome: text('consultor_nome'),
    calendarProvider: text('calendar_provider'),
    externalEventId: text('external_event_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('client_meeting_cliente_idx').on(t.clienteId, t.startAt),
    statusIdx: index('client_meeting_status_idx').on(t.status, t.startAt),
    externalIdx: index('client_meeting_external_idx').on(t.calendarProvider, t.externalEventId),
  }),
)

export const clientContract = pgTable(
  'client_contract',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    titulo: text('titulo').notNull(),
    credor: text('credor'),
    numeroContrato: text('numero_contrato'),
    tipo: text('tipo').notNull().default('financeiro'),
    status: text('status').notNull().default('ativo'),
    valorOriginal: numeric('valor_original', { precision: 18, scale: 2 }),
    valorAtual: numeric('valor_atual', { precision: 18, scale: 2 }),
    moeda: text('moeda').notNull().default('BRL'),
    dataAssinatura: text('data_assinatura'),
    dataVencimento: text('data_vencimento'),
    documentoId: text('documento_id'),
    propostaId: text('proposta_id'),
    negociacaoId: text('negociacao_id'),
    demandaId: text('demanda_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('client_contract_cliente_idx').on(t.clienteId, t.status),
    credorIdx: index('client_contract_credor_idx').on(t.credor),
    documentoIdx: index('client_contract_documento_idx').on(t.documentoId),
    propostaIdx: uniqueIndex('client_contract_proposta_uidx').on(t.propostaId),
    negociacaoIdx: index('client_contract_negociacao_idx').on(t.negociacaoId),
    demandaIdx: index('client_contract_demanda_idx').on(t.demandaId),
  }),
)

export const clientTimelineEvent = pgTable(
  'client_timeline_event',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    source: text('source').notNull().default('system'),
    sourceId: text('source_id'),
    visibility: text('visibility').notNull().default('internal'), // internal | client
    createdBy: text('created_by'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('client_timeline_event_cliente_idx').on(t.clienteId, t.createdAt),
    sourceIdx: index('client_timeline_event_source_idx').on(t.source, t.sourceId),
    typeIdx: index('client_timeline_event_type_idx').on(t.eventType),
  }),
)

export const clientPermission = pgTable(
  'client_permission',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('consultor'),
    permissions: text('permissions').array(),
    grantedBy: text('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    clienteUserUnique: uniqueIndex('client_permission_cliente_user_uidx').on(t.clienteId, t.userId),
    userIdx: index('client_permission_user_idx').on(t.userId, t.revokedAt),
    clienteIdx: index('client_permission_cliente_idx').on(t.clienteId, t.revokedAt),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 30. Central Inteligente de Documentos
 * ──────────────────────────────────────────────────────────── */
export const documentCategory = pgTable(
  'document_category',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    nome: text('nome').notNull(),
    descricao: text('descricao'),
    ativo: boolean('ativo').notNull().default(true),
    ordem: integer('ordem').notNull().default(0),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeUnique: uniqueIndex('document_category_code_uidx').on(t.code),
    ativoIdx: index('document_category_ativo_idx').on(t.ativo, t.ordem),
  }),
)

export const coreDocument = pgTable(
  'core_document',
  {
    id: text('id').primaryKey(),
    clienteId: text('cliente_id').notNull(),
    nome: text('nome').notNull(),
    tipo: text('tipo').notNull().default('documento'),
    mime: text('mime').notNull(),
    categoria: text('categoria').notNull().default('outros'),
    status: text('status').notNull().default('recebido'), // recebido | em_analise | aprovado | rejeitado | vencido
    storageProvider: text('storage_provider').notNull().default('local'),
    storageKey: text('storage_key').notNull(),
    urlArquivo: text('url_arquivo'),
    sha256: text('sha256'),
    tamanho: integer('tamanho').notNull().default(0),
    textoExtraido: text('texto_extraido'),
    embeddingStatus: text('embedding_status').notNull().default('pending'),
    ragStatus: text('rag_status').notNull().default('not_indexed'),
    ragProvider: text('rag_provider'),
    criadoPor: text('criado_por'),
    validade: timestamp('validade', { withTimezone: true }),
    observacoes: text('observacoes'),
    source: text('source').notNull().default('crm'),
    sourceId: text('source_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clienteIdx: index('core_document_cliente_idx').on(t.clienteId, t.status, t.criadoEm),
    categoriaIdx: index('core_document_categoria_idx').on(t.categoria, t.status),
    shaClienteIdx: index('core_document_sha_cliente_idx').on(t.clienteId, t.sha256),
    ragIdx: index('core_document_rag_idx').on(t.ragStatus, t.embeddingStatus),
    sourceIdx: index('core_document_source_idx').on(t.source, t.sourceId),
  }),
)

export const documentVersion = pgTable(
  'document_version',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id').notNull(),
    versionNumber: integer('version_number').notNull().default(1),
    nome: text('nome').notNull(),
    storageProvider: text('storage_provider').notNull().default('local'),
    storageKey: text('storage_key').notNull(),
    mime: text('mime').notNull(),
    tamanho: integer('tamanho').notNull().default(0),
    sha256: text('sha256'),
    textoExtraido: text('texto_extraido'),
    criadoPor: text('criado_por'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    documentVersionUnique: uniqueIndex('document_version_document_number_uidx').on(t.documentId, t.versionNumber),
    documentIdx: index('document_version_document_idx').on(t.documentId, t.criadoEm),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 31. IA Workflows + automações externas
 * ──────────────────────────────────────────────────────────── */
export const aiWorkflow = pgTable(
  'ai_workflow',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    nome: text('nome').notNull(),
    descricao: text('descricao'),
    provider: text('provider').notNull().default('internal'), // internal | openai | n8n
    status: text('status').notNull().default('draft'), // draft | active | disabled
    inputSchema: jsonb('input_schema').notNull().default(sql`'{}'::jsonb`),
    outputSchema: jsonb('output_schema').notNull().default(sql`'{}'::jsonb`),
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeUnique: uniqueIndex('ai_workflow_code_uidx').on(t.code),
    statusIdx: index('ai_workflow_status_idx').on(t.status, t.provider),
  }),
)

export const aiWorkflowRun = pgTable(
  'ai_workflow_run',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').notNull(),
    clienteId: text('cliente_id'),
    documentId: text('document_id'),
    missionId: text('mission_id'),
    status: text('status').notNull().default('queued'), // queued | running | succeeded | failed
    input: jsonb('input').notNull().default(sql`'{}'::jsonb`),
    output: jsonb('output'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    workflowIdx: index('ai_workflow_run_workflow_idx').on(t.workflowId, t.criadoEm),
    clienteIdx: index('ai_workflow_run_cliente_idx').on(t.clienteId, t.criadoEm),
    statusIdx: index('ai_workflow_run_status_idx').on(t.status, t.criadoEm),
    missionIdx: index('ai_workflow_run_mission_idx').on(t.missionId, t.criadoEm),
  }),
)

export const automationEvent = pgTable(
  'automation_event',
  {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('queued'), // queued | processing | succeeded | failed | skipped
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    targetProvider: text('target_provider').notNull().default('internal'),
    targetUrl: text('target_url'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index('automation_event_status_idx').on(t.status, t.nextAttemptAt, t.criadoEm),
    typeIdx: index('automation_event_type_idx').on(t.eventType, t.criadoEm),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * 32. Google Workspace — OAuth, Drive, Docs, Calendar e Gmail
 * ──────────────────────────────────────────────────────────── */
export const googleWorkspaceConnection = pgTable(
  'google_workspace_connection',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tenantId: text('tenant_id').notNull().default('default'),
    googleEmail: text('google_email'),
    googleAccountId: text('google_account_id'),
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    tokenExpiry: timestamp('token_expiry', { withTimezone: true }),
    scopes: text('scopes').array(),
    status: text('status').notNull().default('pending'), // pending | connected | expired | revoked | error
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    tenantUserUnique: uniqueIndex('google_workspace_connection_tenant_user_uidx').on(t.tenantId, t.userId),
    tenantStatusIdx: index('google_workspace_connection_tenant_status_idx').on(t.tenantId, t.status),
    emailIdx: index('google_workspace_connection_email_idx').on(t.googleEmail),
  }),
)

export const googleWorkspaceAuditLog = pgTable(
  'google_workspace_audit_log',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default('default'),
    userId: text('user_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    googleResourceId: text('google_resource_id'),
    status: text('status').notNull().default('succeeded'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('google_workspace_audit_tenant_idx').on(t.tenantId, t.createdAt),
    resourceIdx: index('google_workspace_audit_resource_idx').on(t.resourceType, t.resourceId),
    actionIdx: index('google_workspace_audit_action_idx').on(t.action, t.status),
  }),
)

export const clientGoogleDriveFolder = pgTable(
  'client_google_drive_folder',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default('default'),
    clientId: text('client_id').notNull(),
    googleFolderId: text('google_folder_id').notNull(),
    folderUrl: text('folder_url').notNull(),
    folderName: text('folder_name').notNull(),
    subfolders: jsonb('subfolders').notNull().default(sql`'{}'::jsonb`),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    tenantClientUnique: uniqueIndex('client_google_drive_folder_tenant_client_uidx').on(t.tenantId, t.clientId),
    folderIdx: index('client_google_drive_folder_google_idx').on(t.googleFolderId),
  }),
)

export const googleDocument = pgTable(
  'google_document',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default('default'),
    clientId: text('client_id').notNull(),
    documentType: text('document_type').notNull(),
    title: text('title').notNull(),
    googleFileId: text('google_file_id').notNull(),
    googleDocUrl: text('google_doc_url').notNull(),
    status: text('status').notNull().default('created'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    tenantClientIdx: index('google_document_tenant_client_idx').on(t.tenantId, t.clientId, t.createdAt),
    fileIdx: index('google_document_file_idx').on(t.googleFileId),
    typeIdx: index('google_document_type_idx').on(t.documentType, t.status),
  }),
)

export const googleCalendarEvent = pgTable(
  'google_calendar_event',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default('default'),
    clientId: text('client_id').notNull(),
    googleEventId: text('google_event_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }),
    attendees: text('attendees').array(),
    eventUrl: text('event_url'),
    status: text('status').notNull().default('confirmed'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    tenantClientIdx: index('google_calendar_event_tenant_client_idx').on(t.tenantId, t.clientId, t.startTime),
    eventIdx: index('google_calendar_event_google_idx').on(t.googleEventId),
    statusIdx: index('google_calendar_event_status_idx').on(t.status, t.startTime),
  }),
)

export const googleEmailLog = pgTable(
  'google_email_log',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default('default'),
    clientId: text('client_id').notNull(),
    googleMessageId: text('google_message_id'),
    threadId: text('thread_id'),
    direction: text('direction').notNull().default('outbound'),
    subject: text('subject').notNull(),
    fromEmail: text('from_email'),
    toEmail: text('to_email').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    snippet: text('snippet'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    tenantClientIdx: index('google_email_log_tenant_client_idx').on(t.tenantId, t.clientId, t.createdAt),
    messageIdx: index('google_email_log_message_idx').on(t.googleMessageId),
    threadIdx: index('google_email_log_thread_idx').on(t.threadId),
  }),
)

/* ─────────────────────────────────────────────────────────────
 * Operational Core — fonte canônica entre módulos
 * ──────────────────────────────────────────────────────────── */
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  taxId: text('tax_id'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const office = pgTable('office', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  name: text('name').notNull(),
  city: text('city'),
  state: varchar('state', { length: 2 }),
  timezone: text('timezone').notNull().default('America/Cuiaba'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const appUser = pgTable('app_user', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  officeId: text('office_id').references(() => office.id),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  jobTitle: text('job_title'),
  avatarUrl: text('avatar_url'),
  status: text('status').notNull().default('active'),
  preferences: jsonb('preferences').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const creditor = pgTable('creditor', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  taxId: text('tax_id'),
  kind: text('kind').notNull().default('financial_institution'),
  contact: jsonb('contact').notNull().default(sql`'{}'::jsonb`),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const ruralProperty = pgTable('rural_property', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => cliente.id),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  name: text('name').notNull(),
  carCode: text('car_code'),
  cibNirf: text('cib_nirf'),
  registrationNumber: text('registration_number'),
  city: text('city'),
  state: varchar('state', { length: 2 }),
  ibgeCityCode: text('ibge_city_code'),
  totalAreaHa: numeric('total_area_ha', { precision: 18, scale: 4 }),
  location: jsonb('location'),
  source: text('source').notNull().default('crm'),
  sourceId: text('source_id'),
  validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const crop = pgTable('crop', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => cliente.id),
  ruralPropertyId: text('rural_property_id').references(() => ruralProperty.id),
  name: text('name').notNull(),
  variety: text('variety'),
  areaHa: numeric('area_ha', { precision: 18, scale: 4 }),
  productivity: numeric('productivity', { precision: 18, scale: 4 }),
  productivityUnit: text('productivity_unit'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const harvest = pgTable('harvest', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => cliente.id),
  cropId: text('crop_id').references(() => crop.id),
  season: text('season').notNull(),
  plantingDate: date('planting_date'),
  harvestDate: date('harvest_date'),
  areaHa: numeric('area_ha', { precision: 18, scale: 4 }),
  expectedProduction: numeric('expected_production', { precision: 18, scale: 4 }),
  actualProduction: numeric('actual_production', { precision: 18, scale: 4 }),
  status: text('status').notNull().default('planned'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const clientDebt = pgTable('client_debt', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => cliente.id),
  caseId: text('case_id').references(() => clienteDemanda.id),
  creditorId: text('creditor_id').notNull().references(() => creditor.id),
  contractNumber: text('contract_number'),
  modality: text('modality'),
  status: text('status').notNull().default('open'),
  originalAmount: numeric('original_amount', { precision: 18, scale: 2 }),
  currentAmount: numeric('current_amount', { precision: 18, scale: 2 }),
  interestRate: numeric('interest_rate', { precision: 18, scale: 8 }),
  contractedAt: date('contracted_at'),
  dueAt: date('due_at'),
  source: text('source').notNull().default('crm'),
  sourceId: text('source_id'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const debtGuarantee = pgTable('debt_guarantee', {
  id: text('id').primaryKey(),
  debtId: text('debt_id').notNull().references(() => clientDebt.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }),
  ruralPropertyId: text('rural_property_id').references(() => ruralProperty.id),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const simulationWorkspace = pgTable('simulation_workspace', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  officeId: text('office_id').references(() => office.id),
  userId: text('user_id').references(() => appUser.id),
  clientId: text('client_id').references(() => cliente.id),
  caseId: text('case_id').references(() => clienteDemanda.id),
  creditorId: text('creditor_id').references(() => creditor.id),
  debtId: text('debt_id').references(() => clientDebt.id),
  kind: text('kind').notNull().default('simulador_v16'),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'),
  draft: jsonb('draft').notNull().default(sql`'{}'::jsonb`),
  registeredVersion: integer('registered_version').notNull().default(0),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const calculationSnapshot = pgTable('calculation_snapshot', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => simulationWorkspace.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  calculationType: text('calculation_type').notNull(),
  input: jsonb('input').notNull(),
  output: jsonb('output').notNull(),
  sourceSnapshot: jsonb('source_snapshot').notNull().default(sql`'[]'::jsonb`),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const alixSkill = pgTable('alix_skill', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  specialist: text('specialist').notNull(),
  currentVersion: integer('current_version').notNull().default(1),
  status: text('status').notNull().default('active'),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  successCount: integer('success_count').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
  totalLatencyMs: bigint('total_latency_ms', { mode: 'number' }).notNull().default(0),
  totalCostUsd: numeric('total_cost_usd', { precision: 18, scale: 6 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const alixSkillVersion = pgTable('alix_skill_version', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => alixSkill.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  description: text('description').notNull(),
  instructions: text('instructions').notNull(),
  inputSchema: jsonb('input_schema').notNull(),
  outputSchema: jsonb('output_schema').notNull(),
  requiredTools: text('required_tools').array().notNull().default(sql`ARRAY[]::text[]`),
  optionalTools: text('optional_tools').array().notNull().default(sql`ARRAY[]::text[]`),
  triggerExamples: text('trigger_examples').array().notNull().default(sql`ARRAY[]::text[]`),
  allowedContexts: text('allowed_contexts').array().notNull().default(sql`ARRAY[]::text[]`),
  executionMode: text('execution_mode').notNull().default('tool'),
  timeoutMs: integer('timeout_ms').notNull().default(90000),
  maxIterations: integer('max_iterations').notNull().default(8),
  active: boolean('active').notNull().default(true),
  evaluationSuite: text('evaluation_suite'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const automationRule = pgTable('automation_rule', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  name: text('name').notNull(),
  triggerType: text('trigger_type').notNull(),
  conditions: jsonb('conditions').notNull().default(sql`'{}'::jsonb`),
  actions: jsonb('actions').notNull().default(sql`'[]'::jsonb`),
  status: text('status').notNull().default('active'),
  schedule: text('schedule'),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  successCount: integer('success_count').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const operationalNotification = pgTable('operational_notification', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  userId: text('user_id').references(() => appUser.id),
  clientId: text('client_id').references(() => cliente.id),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id'),
  priority: text('priority').notNull().default('normal'),
  title: text('title').notNull(),
  body: text('body'),
  action: jsonb('action'),
  readAt: timestamp('read_at', { withTimezone: true }),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const alixToolCallLog = pgTable(
  'alix_tool_call_log',
  {
    id: text('id').primaryKey(),
    missionId: text('mission_id').references(() => alixMission.id, { onDelete: 'set null' }),
    stepId: text('step_id').references(() => alixMissionStep.id, { onDelete: 'set null' }),
    skillId: text('skill_id').references(() => alixSkill.id, { onDelete: 'set null' }),
    organizationId: text('organization_id').notNull().references(() => organization.id),
    clientId: text('client_id').references(() => cliente.id),
    caseId: text('case_id').references(() => clienteDemanda.id),
    toolName: text('tool_name').notNull(),
    toolVersion: text('tool_version').notNull(),
    idempotencyKey: text('idempotency_key'),
    status: text('status').notNull(),
    input: jsonb('input').notNull(),
    output: jsonb('output'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
    sourceSnapshot: jsonb('source_snapshot').notNull().default(sql`'[]'::jsonb`),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    latencyMs: integer('latency_ms'),
  },
  (t) => ({
    missionIdx: index('alix_tool_call_mission_idx').on(t.missionId, t.startedAt),
    idempotencyIdx: uniqueIndex('alix_tool_call_idempotency_uidx').on(t.organizationId, t.toolName, t.idempotencyKey),
  }),
)

export const generatedArtifact = pgTable(
  'generated_artifact',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id),
    clientId: text('client_id').references(() => cliente.id),
    caseId: text('case_id').references(() => clienteDemanda.id),
    missionId: text('mission_id').references(() => alixMission.id),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('generated'),
    storageKey: text('storage_key'),
    mimeType: text('mime_type'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ missionIdx: index('generated_artifact_mission_idx').on(t.missionId, t.createdAt) }),
)

export const dataSourceSnapshot = pgTable(
  'data_source_snapshot',
  {
    id: text('id').primaryKey(),
    sourceName: text('source_name').notNull(),
    series: text('series').notNull(),
    unit: text('unit').notNull(),
    location: text('location'),
    referenceAt: timestamp('reference_at', { withTimezone: true }).notNull(),
    collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow().notNull(),
    value: numeric('value', { precision: 30, scale: 12 }),
    status: text('status').notNull(),
    fallbackMethod: text('fallback_method'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    freshnessSeconds: integer('freshness_seconds'),
    evidence: jsonb('evidence').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({ currentIdx: index('data_source_snapshot_current_idx').on(t.sourceName, t.series, t.referenceAt) }),
)

export const clientInteraction = pgTable(
  'client_interaction',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().references(() => cliente.id),
    caseId: text('case_id').references(() => clienteDemanda.id),
    channel: text('channel').notNull(),
    direction: text('direction'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    summary: text('summary').notNull(),
    sourceId: text('source_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ timelineIdx: index('client_interaction_timeline_idx').on(t.clientId, t.occurredAt) }),
)

export const appointment = pgTable(
  'appointment',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id),
    clientId: text('client_id').references(() => cliente.id),
    caseId: text('case_id').references(() => clienteDemanda.id),
    responsibleUserId: text('responsible_user_id').references(() => appUser.id),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    status: text('status').notNull().default('scheduled'),
    provider: text('provider'),
    externalId: text('external_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ responsibleIdx: index('appointment_responsible_idx').on(t.responsibleUserId, t.startsAt, t.status) }),
)

export type Organization = typeof organization.$inferSelect
export type Office = typeof office.$inferSelect
export type AppUser = typeof appUser.$inferSelect
export type Creditor = typeof creditor.$inferSelect
export type RuralProperty = typeof ruralProperty.$inferSelect
export type Crop = typeof crop.$inferSelect
export type Harvest = typeof harvest.$inferSelect
export type ClientDebt = typeof clientDebt.$inferSelect
export type DebtGuarantee = typeof debtGuarantee.$inferSelect
export type SimulationWorkspace = typeof simulationWorkspace.$inferSelect
export type CalculationSnapshot = typeof calculationSnapshot.$inferSelect
export type AlixSkill = typeof alixSkill.$inferSelect
export type AlixSkillVersion = typeof alixSkillVersion.$inferSelect
export type AlixToolCallLog = typeof alixToolCallLog.$inferSelect
export type GeneratedArtifact = typeof generatedArtifact.$inferSelect
export type AutomationRule = typeof automationRule.$inferSelect
export type OperationalNotification = typeof operationalNotification.$inferSelect
export type DataSourceSnapshot = typeof dataSourceSnapshot.$inferSelect
export type ClientInteraction = typeof clientInteraction.$inferSelect
export type Appointment = typeof appointment.$inferSelect

export type AlixMemoryFact = typeof alixMemoryFact.$inferSelect
export type AlixMemoryFactInsert = typeof alixMemoryFact.$inferInsert
export type AlixFactRevision = typeof alixFactRevision.$inferSelect
export type AlixFactRevisionInsert = typeof alixFactRevision.$inferInsert
export type AlixDocumentChunk = typeof alixDocumentChunk.$inferSelect
export type AlixDocumentChunkInsert = typeof alixDocumentChunk.$inferInsert
export type AlixDocumentEmbedding = typeof alixDocumentEmbedding.$inferSelect
export type AlixDocumentEmbeddingInsert = typeof alixDocumentEmbedding.$inferInsert
export type AlixRagIndexState = typeof alixRagIndexState.$inferSelect
export type AlixRagIndexStateInsert = typeof alixRagIndexState.$inferInsert
export type AlixDocumentPipelineRun = typeof alixDocumentPipelineRun.$inferSelect
export type AlixDocumentPipelineRunInsert = typeof alixDocumentPipelineRun.$inferInsert
export type AlixDocumentField = typeof alixDocumentField.$inferSelect
export type AlixDocumentFieldInsert = typeof alixDocumentField.$inferInsert
export type AlixDocumentFinding = typeof alixDocumentFinding.$inferSelect
export type AlixDocumentFindingInsert = typeof alixDocumentFinding.$inferInsert
export type AlixDocumentComparison = typeof alixDocumentComparison.$inferSelect
export type AlixDocumentComparisonInsert = typeof alixDocumentComparison.$inferInsert
export type AlixMission = typeof alixMission.$inferSelect
export type AlixMissionInsert = typeof alixMission.$inferInsert
export type AlixMissionStep = typeof alixMissionStep.$inferSelect
export type AlixMissionStepInsert = typeof alixMissionStep.$inferInsert
export type AlixMissionSource = typeof alixMissionSource.$inferSelect
export type AlixMissionSourceInsert = typeof alixMissionSource.$inferInsert
export type AlixMissionEvent = typeof alixMissionEvent.$inferSelect
export type AlixMissionEventInsert = typeof alixMissionEvent.$inferInsert
export type AlixNotebook = typeof alixNotebook.$inferSelect
export type AlixNotebookInsert = typeof alixNotebook.$inferInsert
export type AlixNotebookArtifactVersion = typeof alixNotebookArtifactVersion.$inferSelect
export type AlixNotebookArtifactVersionInsert = typeof alixNotebookArtifactVersion.$inferInsert
export type AlixNotebookComment = typeof alixNotebookComment.$inferSelect
export type AlixNotebookCommentInsert = typeof alixNotebookComment.$inferInsert
export type AlixNotebookAction = typeof alixNotebookAction.$inferSelect
export type AlixNotebookActionInsert = typeof alixNotebookAction.$inferInsert
export type AlixQualityCase = typeof alixQualityCase.$inferSelect
export type AlixQualityCaseInsert = typeof alixQualityCase.$inferInsert
export type AlixGoldenCase = typeof alixGoldenCase.$inferSelect
export type AlixGoldenCaseInsert = typeof alixGoldenCase.$inferInsert
export type AlixGovernanceRelease = typeof alixGovernanceRelease.$inferSelect
export type AlixGovernanceReleaseInsert = typeof alixGovernanceRelease.$inferInsert
export type AlixGovernanceEvalRun = typeof alixGovernanceEvalRun.$inferSelect
export type AlixGovernanceEvalRunInsert = typeof alixGovernanceEvalRun.$inferInsert
export type AlixAutomationSuggestion = typeof alixAutomationSuggestion.$inferSelect
export type AlixAutomationSuggestionInsert = typeof alixAutomationSuggestion.$inferInsert
export type AlixConfirmationApproval = typeof alixConfirmationApproval.$inferSelect
export type AlixConfirmationApprovalInsert = typeof alixConfirmationApproval.$inferInsert
export type ClientContact = typeof clientContact.$inferSelect
export type ClientContactInsert = typeof clientContact.$inferInsert
export type ClientTask = typeof clientTask.$inferSelect
export type ClientTaskInsert = typeof clientTask.$inferInsert
export type ClientMeeting = typeof clientMeeting.$inferSelect
export type ClientMeetingInsert = typeof clientMeeting.$inferInsert
export type ClientContract = typeof clientContract.$inferSelect
export type ClientContractInsert = typeof clientContract.$inferInsert
export type ClientTimelineEvent = typeof clientTimelineEvent.$inferSelect
export type ClientTimelineEventInsert = typeof clientTimelineEvent.$inferInsert
export type ClientPermission = typeof clientPermission.$inferSelect
export type ClientPermissionInsert = typeof clientPermission.$inferInsert
export type DocumentCategory = typeof documentCategory.$inferSelect
export type DocumentCategoryInsert = typeof documentCategory.$inferInsert
export type CoreDocument = typeof coreDocument.$inferSelect
export type CoreDocumentInsert = typeof coreDocument.$inferInsert
export type DocumentVersion = typeof documentVersion.$inferSelect
export type DocumentVersionInsert = typeof documentVersion.$inferInsert
export type AiWorkflow = typeof aiWorkflow.$inferSelect
export type AiWorkflowInsert = typeof aiWorkflow.$inferInsert
export type AiWorkflowRun = typeof aiWorkflowRun.$inferSelect
export type AiWorkflowRunInsert = typeof aiWorkflowRun.$inferInsert
export type AutomationEvent = typeof automationEvent.$inferSelect
export type AutomationEventInsert = typeof automationEvent.$inferInsert
export type GoogleWorkspaceConnection = typeof googleWorkspaceConnection.$inferSelect
export type GoogleWorkspaceConnectionInsert = typeof googleWorkspaceConnection.$inferInsert
export type GoogleWorkspaceAuditLog = typeof googleWorkspaceAuditLog.$inferSelect
export type GoogleWorkspaceAuditLogInsert = typeof googleWorkspaceAuditLog.$inferInsert
export type ClientGoogleDriveFolder = typeof clientGoogleDriveFolder.$inferSelect
export type ClientGoogleDriveFolderInsert = typeof clientGoogleDriveFolder.$inferInsert
export type GoogleDocument = typeof googleDocument.$inferSelect
export type GoogleDocumentInsert = typeof googleDocument.$inferInsert
export type GoogleCalendarEvent = typeof googleCalendarEvent.$inferSelect
export type GoogleCalendarEventInsert = typeof googleCalendarEvent.$inferInsert
export type GoogleEmailLog = typeof googleEmailLog.$inferSelect
export type GoogleEmailLogInsert = typeof googleEmailLog.$inferInsert
export type WhatsAppConversation = typeof whatsappConversation.$inferSelect
export type WhatsAppConversationInsert = typeof whatsappConversation.$inferInsert
export type WhatsAppMessage = typeof whatsappMessage.$inferSelect
export type WhatsAppMessageInsert = typeof whatsappMessage.$inferInsert
export type WhatsAppDocument = typeof whatsappDocument.$inferSelect
export type WhatsAppDocumentInsert = typeof whatsappDocument.$inferInsert
export type WhatsAppEligibilityAnswer = typeof whatsappEligibilityAnswer.$inferSelect
export type WhatsAppEligibilityAnswerInsert = typeof whatsappEligibilityAnswer.$inferInsert
export type WhatsAppWebhookEvent = typeof whatsappWebhookEvent.$inferSelect
export type WhatsAppWebhookEventInsert = typeof whatsappWebhookEvent.$inferInsert
export type WhatsAppCalendarEvent = typeof whatsappCalendarEvent.$inferSelect
export type WhatsAppCalendarEventInsert = typeof whatsappCalendarEvent.$inferInsert
export type WhatsAppInstance = typeof whatsappInstance.$inferSelect
export type WhatsAppInstanceInsert = typeof whatsappInstance.$inferInsert
export type WhatsAppContact = typeof whatsappContact.$inferSelect
export type WhatsAppContactInsert = typeof whatsappContact.$inferInsert
export type WhatsAppConversationState = typeof whatsappConversationState.$inferSelect
export type WhatsAppConversationStateInsert = typeof whatsappConversationState.$inferInsert
export type WhatsAppMediaFile = typeof whatsappMediaFile.$inferSelect
export type WhatsAppMediaFileInsert = typeof whatsappMediaFile.$inferInsert
export type EligibilityChecklist = typeof eligibilityChecklist.$inferSelect
export type EligibilityChecklistInsert = typeof eligibilityChecklist.$inferInsert
export type EligibilityQuestion = typeof eligibilityQuestion.$inferSelect
export type EligibilityQuestionInsert = typeof eligibilityQuestion.$inferInsert
export type EligibilityResult = typeof eligibilityResult.$inferSelect
export type EligibilityResultInsert = typeof eligibilityResult.$inferInsert
export type WhatsAppDocumentRequest = typeof whatsappDocumentRequest.$inferSelect
export type WhatsAppDocumentRequestInsert = typeof whatsappDocumentRequest.$inferInsert
export type WhatsAppCalendarBookingOption = typeof whatsappCalendarBookingOption.$inferSelect
export type WhatsAppCalendarBookingOptionInsert = typeof whatsappCalendarBookingOption.$inferInsert
export type WhatsAppCalendarBooking = typeof whatsappCalendarBooking.$inferSelect
export type WhatsAppCalendarBookingInsert = typeof whatsappCalendarBooking.$inferInsert
export type WhatsAppOutbox = typeof whatsappOutbox.$inferSelect
export type WhatsAppOutboxInsert = typeof whatsappOutbox.$inferInsert
export type WhatsAppAuditLog = typeof whatsappAuditLog.$inferSelect
export type WhatsAppAuditLogInsert = typeof whatsappAuditLog.$inferInsert

/** Biblioteca durável do gerador jurídico; não representa o ciclo comercial de client_contract. */
export const generatedContract = pgTable('generated_contract', {
  id: text('id').primaryKey(),
  tipo: text('tipo').notNull(),
  titulo: text('titulo').notNull(),
  dataGeracao: timestamp('data_geracao', { withTimezone: true }).notNull(),
  clienteId: text('cliente_id').references(() => cliente.id, { onDelete: 'set null' }),
  propostaId: text('proposta_id').references(() => proposta.id, { onDelete: 'set null' }),
  valorTotal: numeric('valor_total', { precision: 18, scale: 2 }).notNull(),
  payload: jsonb('payload').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  dataIdx: index('generated_contract_data_idx').on(t.dataGeracao),
  clienteIdx: index('generated_contract_cliente_idx').on(t.clienteId),
  propostaIdx: index('generated_contract_proposta_idx').on(t.propostaId),
}))
export type GeneratedContract = typeof generatedContract.$inferSelect
export type GeneratedContractInsert = typeof generatedContract.$inferInsert

/** Catálogo de leitura do Drive: a fonte remota permanece intacta. */
export const alixDriveCorpus = pgTable('alix_drive_corpus', {
  tenantId: text('tenant_id').notNull(), fileId: text('file_id').notNull(), revisionKey: text('revision_key').notNull(),
  name: text('name').notNull(), mimeType: text('mime_type').notNull(), path: text('path').notNull().default(''),
  driveId: text('drive_id'), clienteId: text('cliente_id').references(() => cliente.id, { onDelete: 'set null' }),
  corporateScope: boolean('corporate_scope').notNull().default(false), category: text('category').notNull(),
  readStatus: text('read_status').notNull().default('pending'), coverage: jsonb('coverage').notNull(),
  extractedText: text('extracted_text').notNull().default(''), sourceSha256: text('source_sha256'), contentHash: text('content_hash'),
  extractedCharacters: integer('extracted_characters').generatedAlwaysAs(sql`length(extracted_text)`),
  modifiedAt: timestamp('modified_at', { withTimezone: true }), readAt: timestamp('read_at', { withTimezone: true }),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull(), metadata: jsonb('metadata').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  pk: primaryKey({ columns: [t.tenantId, t.fileId] }), clienteIdx: index('alix_drive_corpus_cliente_idx').on(t.tenantId,t.clienteId),
  stateIdx: index('alix_drive_corpus_state_idx').on(t.tenantId,t.readStatus),
  categoryIdx: index('alix_drive_corpus_category_idx').on(t.tenantId,t.category),
}))
const corpusTsvector = customType<{ data: string }>({ dataType() { return 'tsvector' } })
export const alixDriveCorpusChunk = pgTable('alix_drive_corpus_chunk', {
  id: text('id').primaryKey(), tenantId: text('tenant_id').notNull(), fileId: text('file_id').notNull(), revisionKey: text('revision_key').notNull(),
  ordinal: integer('ordinal').notNull(), text: text('text').notNull(), source: text('source').notNull(),
  page: integer('page'), sheet: text('sheet'), metadata: jsonb('metadata').notNull().default({}),
  searchVector: corpusTsvector('search_vector').generatedAlwaysAs(sql`to_tsvector('portuguese', text)`),
}, t => ({
  fileFk: foreignKey({ columns: [t.tenantId,t.fileId], foreignColumns: [alixDriveCorpus.tenantId,alixDriveCorpus.fileId] }).onDelete('cascade'),
  fileIdx: index('alix_drive_corpus_chunk_file_idx').on(t.tenantId,t.fileId,t.revisionKey),
  ordinalUnique: uniqueIndex('alix_drive_corpus_chunk_ordinal_unique').on(t.tenantId,t.fileId,t.revisionKey,t.ordinal),
  textIdx: index('alix_drive_corpus_chunk_search_idx').using('gin',t.searchVector),
}))
export const alixDriveCorpusRun = pgTable('alix_drive_corpus_run', {
  tenantId: text('tenant_id').primaryKey(), payload: jsonb('payload').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Trabalho derivado do corpus: cursor durável e candidatos ainda sujeitos à conferência. */
export const alixDriveAnalysis = pgTable('alix_drive_analysis', {
  id: text('id').primaryKey(), tenantId: text('tenant_id').notNull(), fileId: text('file_id').notNull(),
  clienteId: text('cliente_id').notNull().references(() => cliente.id, { onDelete: 'cascade' }),
  revisionKey: text('revision_key').notNull(), contentHash: text('content_hash').notNull(), analyzerVersion: text('analyzer_version').notNull(),
  status: text('status').notNull().default('queued'), nextOrdinal: integer('next_ordinal').notNull().default(0),
  processedChunks: integer('processed_chunks').notNull().default(0), totalChunks: integer('total_chunks').notNull(),
  attempts: integer('attempts').notNull().default(0), priority: integer('priority').notNull().default(0),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }), payload: jsonb('payload').notNull().default({ candidates: [] }),
  errorCode: text('error_code'), jobId: text('job_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  fileFk: foreignKey({ name:'alix_drive_analysis_file_fk', columns:[t.tenantId,t.fileId], foreignColumns:[alixDriveCorpus.tenantId,alixDriveCorpus.fileId] }).onDelete('cascade'),
  revisionUnique: uniqueIndex('alix_drive_analysis_revision_unique').on(t.tenantId,t.fileId,t.clienteId,t.revisionKey,t.contentHash,t.analyzerVersion),
  dispatchIdx: index('alix_drive_analysis_dispatch_idx').on(t.status,t.availableAt,t.priority,t.createdAt),
  clientIdx: index('alix_drive_analysis_client_idx').on(t.tenantId,t.clienteId,t.updatedAt),
}))
export const alixDriveAnalysisBudget = pgTable('alix_drive_analysis_budget', {
  tenantId: text('tenant_id').notNull(), day: date('day').notNull(), calls: integer('calls').notNull().default(0),
}, t => ({ pk: primaryKey({ columns:[t.tenantId,t.day] }) }))

/** Assuntos explicitamente publicados; planejamento privado e público não são misturados. */
export const portalMatter = pgTable('portal_matter', {
  id: text('id').primaryKey(),
  clienteId: text('cliente_id').notNull().references(() => cliente.id),
  demandaId: text('demanda_id').references(() => clienteDemanda.id),
  status: text('status').notNull(),
  visibilidade: text('visibilidade').notNull(),
  payload: jsonb('payload').notNull(),
  versao: integer('versao').notNull().default(1),
  idempotencyKey: text('idempotency_key').notNull(),
  createFingerprint: text('create_fingerprint').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, t => ({
  requestUnique: unique('portal_matter_cliente_id_idempotency_key_key').on(t.clienteId,t.idempotencyKey),
  ownerUnique: unique('portal_matter_id_cliente_id_key').on(t.id,t.clienteId),
  clientIdx: index('portal_matter_client_idx').on(t.clienteId,t.visibilidade,t.updatedAt.desc(),t.id.desc()),
  demandIdx: index('portal_matter_demanda_idx').on(t.demandaId),
  statusCheck: check('portal_matter_status_check',sql`${t.status} IN ('nao_iniciado','em_andamento','aguardando_cliente','aguardando_terceiro','concluido','cancelado')`),
  visibilityCheck: check('portal_matter_visibilidade_check',sql`${t.visibilidade} IN ('rascunho','publicado')`),
  versionCheck: check('portal_matter_versao_check',sql`${t.versao}>0`),
  payloadCheck: check('portal_matter_payload_check',sql`jsonb_typeof(${t.payload})='object' AND ${t.payload}->>'status' IS NOT NULL AND ${t.payload}->>'status'=${t.status} AND ${t.payload}->>'visibilidade' IS NOT NULL AND ${t.payload}->>'visibilidade'=${t.visibilidade} AND jsonb_typeof(${t.payload}->'marcos')='array' AND jsonb_array_length(${t.payload}->'marcos')<=100`),
  publicationCheck: check('portal_matter_publication_check',sql`(${t.visibilidade}='publicado' AND ${t.publishedAt} IS NOT NULL) OR (${t.visibilidade}='rascunho' AND ${t.publishedAt} IS NULL)`),
}))

export const portalMatterRevision = pgTable('portal_matter_revision', {
  assuntoId: text('assunto_id').notNull(),
  clienteId: text('cliente_id').notNull(),
  versao: integer('versao').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  actorId: text('actor_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => ({
  pk: primaryKey({ columns: [t.assuntoId,t.versao] }),
  ownerUnique: unique('portal_matter_revision_assunto_id_cliente_id_versao_key').on(t.assuntoId,t.clienteId,t.versao),
  ownerFk: foreignKey({ columns: [t.assuntoId,t.clienteId], foreignColumns: [portalMatter.id,portalMatter.clienteId], name: 'portal_matter_revision_assunto_id_cliente_id_fkey' }),
  clientIdx: index('portal_matter_revision_client_idx').on(t.clienteId,t.assuntoId,t.versao.desc()),
  versionCheck: check('portal_matter_revision_versao_check',sql`${t.versao}>0`),
  snapshotCheck: check('portal_matter_revision_snapshot_check',sql`jsonb_typeof(${t.snapshot})='object'`),
  snapshotOwnerCheck: check('portal_matter_revision_snapshot_owner_check',sql`${t.snapshot}->>'id' IS NOT NULL AND ${t.snapshot}->>'id'=${t.assuntoId} AND ${t.snapshot}->>'clienteId' IS NOT NULL AND ${t.snapshot}->>'clienteId'=${t.clienteId}`),
}))

export const portalMatterEvent = pgTable('portal_matter_event', {
  id: text('id').primaryKey(),
  assuntoId: text('assunto_id').notNull(),
  clienteId: text('cliente_id').notNull(),
  versao: integer('versao').notNull(),
  tipo: text('tipo').notNull(),
  titulo: text('titulo').notNull(),
  descricao: text('descricao').notNull(),
  marcoId: text('marco_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => ({
  revisionFk: foreignKey({ columns: [t.assuntoId,t.clienteId,t.versao], foreignColumns: [portalMatterRevision.assuntoId,portalMatterRevision.clienteId,portalMatterRevision.versao], name: 'portal_matter_event_assunto_id_cliente_id_versao_fkey' }),
  clientIdx: index('portal_matter_event_client_idx').on(t.clienteId,t.createdAt.desc(),t.id.desc()),
  subjectIdx: index('portal_matter_event_assunto_idx').on(t.clienteId,t.assuntoId,t.createdAt.desc(),t.id.desc()),
  revisionUnique: uniqueIndex('portal_matter_event_revision_unique').on(t.assuntoId,t.versao,t.tipo,sql`coalesce(${t.marcoId},'')`),
  typeCheck: check('portal_matter_event_tipo_check',sql`${t.tipo} IN ('publicacao','atualizacao','marco_concluido','conclusao')`),
  titleCheck: check('portal_matter_event_titulo_check',sql`length(${t.titulo}) BETWEEN 1 AND 200`),
  descriptionCheck: check('portal_matter_event_descricao_check',sql`length(${t.descricao}) BETWEEN 1 AND 5000`),
}))

export const portalFiscalAuthorization = pgTable('portal_fiscal_authorization', {
 id: text('id').primaryKey(), clienteId: text('cliente_id').notNull().references(()=>cliente.id), uf: text('uf').notNull(), status: text('status').notNull(),
 payload: jsonb('payload').notNull(), idempotencyKey: text('idempotency_key').notNull(), requestHash: text('request_hash').notNull(),
 createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(), updatedAt: timestamp('updated_at',{withTimezone:true}).defaultNow().notNull(),
},t=>({clientIdx:index('portal_fiscal_authorization_client_idx').on(t.clienteId,t.updatedAt),keyIdx:unique('portal_fiscal_authorization_idempotency_unique').on(t.clienteId,t.idempotencyKey),ownerKey:unique('portal_fiscal_authorization_owner_unique').on(t.clienteId,t.id),payloadCheck:check('portal_fiscal_authorization_payload_check',sql`jsonb_typeof(${t.payload})='object' AND ${t.payload}->>'uf' IS NOT NULL AND ${t.payload}->>'uf'=${t.uf}`)}))
export const portalFiscalAuthorizationEvent = pgTable('portal_fiscal_authorization_event', {
 id:text('id').primaryKey(),clienteId:text('cliente_id').notNull(),authorizationId:text('authorization_id').notNull(),
 status:text('status').notNull(),descricao:text('descricao').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
},t=>({clientIdx:index('portal_fiscal_authorization_event_client_idx').on(t.clienteId,t.createdAt,t.id)}))
// Cofre fiscal separado do acervo documental. As credenciais não integram caches de documentos.
export const fiscalCredential = pgTable('fiscal_credential', {
  id:text('id').primaryKey(),clienteId:text('cliente_id').notNull().references(()=>cliente.id),documento:text('documento').notNull(),uf:text('uf').notNull(),status:text('status').notNull(),
  metadata:jsonb('metadata').notNull(),envelope:jsonb('envelope'),automacao:boolean('automacao').notNull().default(false),validUntil:timestamp('valid_until',{withTimezone:true}).notNull(),
  consentVersion:text('consent_version').notNull().default('consulta-nfe-2026-09-13'),consentedAt:timestamp('consented_at',{withTimezone:true}).notNull().defaultNow(),
  idempotencyKey:text('idempotency_key').notNull(),requestHash:text('request_hash').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({owner:unique().on(t.clienteId,t.id),request:unique().on(t.clienteId,t.idempotencyKey),active:uniqueIndex('fiscal_credential_active_document_idx').on(t.documento).where(sql`${t.status}='ativa'`),client:index('fiscal_credential_client_idx').on(t.clienteId,t.createdAt.desc())}))
export const fiscalNfeCursor = pgTable('fiscal_nfe_cursor', {
  documento:text('documento').primaryKey(),clienteId:text('cliente_id').notNull().references(()=>cliente.id),ultNsu:text('ult_nsu').notNull().default('000000000000000'),maxNsu:text('max_nsu').notNull().default('000000000000000'),
  nextAllowedAt:timestamp('next_allowed_at',{withTimezone:true}).notNull().defaultNow(),lastAttemptAt:timestamp('last_attempt_at',{withTimezone:true}),lastSuccessAt:timestamp('last_success_at',{withTimezone:true}),
})
export const fiscalQuery = pgTable('fiscal_query', {
  id:text('id').primaryKey(),clienteId:text('cliente_id').notNull(),credentialId:text('credential_id').notNull(),status:text('status').notNull(),message:text('message').notNull(),code:text('code'),documentCount:integer('document_count').notNull().default(0),
  idempotencyKey:text('idempotency_key').notNull(),startedAt:timestamp('started_at',{withTimezone:true}).notNull().defaultNow(),completedAt:timestamp('completed_at',{withTimezone:true}),
},t=>({owner:unique().on(t.clienteId,t.id),request:unique().on(t.clienteId,t.idempotencyKey),credential:foreignKey({columns:[t.clienteId,t.credentialId],foreignColumns:[fiscalCredential.clienteId,fiscalCredential.id]}),client:index('fiscal_query_client_idx').on(t.clienteId,t.startedAt.desc())}))
export const fiscalDocument = pgTable('fiscal_document', {
  id:text('id').primaryKey(),clienteId:text('cliente_id').notNull(),queryId:text('query_id').notNull(),documento:text('documento').notNull(),nsu:text('nsu').notNull(),schemaName:text('schema_name').notNull(),payload:jsonb('payload').notNull(),xml:text('xml').notNull(),sha256:text('sha256').notNull(),receivedAt:timestamp('received_at',{withTimezone:true}).notNull().defaultNow(),portalUploadId:text('portal_upload_id'),bridgeNextAt:timestamp('bridge_next_at',{withTimezone:true}).notNull().defaultNow(),bridgeAttempts:integer('bridge_attempts').notNull().default(0),
},t=>({owner:unique().on(t.clienteId,t.id),cursor:unique().on(t.documento,t.nsu),query:foreignKey({columns:[t.clienteId,t.queryId],foreignColumns:[fiscalQuery.clienteId,fiscalQuery.id]}),client:index('fiscal_document_client_idx').on(t.clienteId,t.receivedAt.desc(),t.id),pending:index('fiscal_document_pending_idx').on(t.bridgeNextAt).where(sql`${t.portalUploadId} IS NULL`)}))

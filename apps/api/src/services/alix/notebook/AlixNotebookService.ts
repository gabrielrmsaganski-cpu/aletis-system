// ============================================================
// ALETIS - Alix Notebook Service
//
// Workspace documental no estilo NotebookLM: colecao de fontes,
// busca restrita ao corpus, briefing sintetico e geracao de
// documentos com citacoes rastreaveis.
// ============================================================

import { createHash, randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'

import { getPool, isPgEnabled } from '../../../db/client.js'
import { auditAsync } from '../../../db/AuditLog.js'
import { listPropostas } from '../../../db/PropostaRepository.js'
import { resolveClienteId } from '../../../db/ClienteRepository.js'
import { getSessionsAccess } from '../../../db/AlixSessionRepository.js'
import { clientes } from '../../../routes/clientes.js'
import { getDealRoomService } from '../../dealRoom/DealRoomService.js'
import { consolidarDadosDossie } from '../../dossies-bancarios/DossieDataConsolidator.js'
import { generateStructured, runOpenAI, searchOpenAIWeb, type LLMMessage } from '../../llm/OpenAIClient.js'
import { getModelForRole } from '../../llm/LLMConfig.js'
import {
  getDocumentIndexService,
  type DocumentSearchHit,
} from '../intake/DocumentIndexService.js'
import { listLedgerFacts } from '../knowledge/FactLedgerService.js'
import type { DocumentIndexRecord } from '../intake/types.js'

export type NotebookArtifactKind =
  | 'dossie'
  | 'briefing'
  | 'outline'
  | 'parecer'
  | 'proposta'
  | 'checklist'
  | 'relatorio'
  | 'memoria'

export interface NotebookSourceRef {
  sessionId: string
  documentId: string
  filename?: string
  kind?: string
  clienteId?: string
  addedAt: string
}

export interface NotebookArtifact {
  id: string
  kind: NotebookArtifactKind
  title: string
  markdown: string
  citations: Array<{
    id: string
    documentId: string
    filename: string
    source: string
    page?: number
    sheet?: string
    quote: string
  }>
  lineageId: string
  version: number
  parentArtifactId?: string
  sourceSnapshot?: Array<{ sourceId: string; sourceHash: string; label: string; kind: string }>
  sourceSnapshotHash?: string
  changeSummary?: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface NotebookSourceScope {
  includeCrm: boolean
  includeDocuments: boolean
  includeProposals: boolean
  includeNegotiations: boolean
  includeWeb: boolean
  proposalIds: string[]
  negotiationIds: string[]
}

export interface NotebookComment {
  id: string
  artifactId?: string
  authorId?: string
  text: string
  status: 'open' | 'applied' | 'resolved'
  appliedInArtifactId?: string
  createdAt: string
  resolvedAt?: string
}

export interface NotebookAction {
  id: string
  sourceArtifactId?: string
  kind: 'task' | 'note' | 'proposal' | 'checklist'
  title: string
  content: string
  status: 'open' | 'done' | 'dismissed'
  createdAt: string
  updatedAt: string
}

export interface NotebookSourceMap {
  completeness: number
  sources: Array<{
    id: string
    kind: 'crm' | 'document' | 'proposal' | 'negotiation' | 'web' | 'note'
    label: string
    status: 'available' | 'selected' | 'missing' | 'disabled'
    selected: boolean
    detail?: string
  }>
  gaps: Array<{
    key: string
    label: string
    severity: 'critical' | 'important' | 'advisory'
    recommendation: string
  }>
}

export interface AlixNotebook {
  id: string
  title: string
  clienteId?: string
  sessionId?: string
  objective?: string
  sourceScope: NotebookSourceScope
  sources: NotebookSourceRef[]
  notes: Array<{ id: string; text: string; createdAt: string }>
  artifacts: NotebookArtifact[]
  comments: NotebookComment[]
  actions: NotebookAction[]
  createdAt: string
  updatedAt: string
}

export interface NotebookCreateInput {
  title: string
  clienteId?: string
  sessionId?: string
  objective?: string
  sources?: Array<{ sessionId: string; documentId: string }>
  sourceScope?: Partial<NotebookSourceScope>
}

function safeSegment(value: string, fallback = 'notebook'): string {
  const safe = (value || fallback).replace(/[^A-Za-z0-9_.-]/g, '_').trim()
  return safe || fallback
}

function nowIso(): string {
  return new Date().toISOString()
}

function notebookReadUnavailable(): Error & { statusCode: number; code: string } {
  return Object.assign(new Error('A leitura dos Notebooks está indisponível no banco. Tente novamente.'), { statusCode: 503, code: 'NOTEBOOK_STORAGE_UNAVAILABLE' })
}

function normalizeLimit(value: unknown, fallback = 8, max = 30): number {
  return Math.max(1, Math.min(max, Number(value) || fallback))
}

function compactText(text: string, max = 2_400): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 18).trim()}...[truncado]`
}


function sourceKey(source: Pick<NotebookSourceRef, 'sessionId' | 'documentId'>): string {
  return `${source.sessionId}:${source.documentId}`
}

const DEFAULT_SOURCE_SCOPE: NotebookSourceScope = {
  includeCrm: true,
  includeDocuments: true,
  includeProposals: true,
  includeNegotiations: true,
  includeWeb: true,
  proposalIds: [],
  negotiationIds: [],
}

function contentHash(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
}

function normalizeSourceScope(value?: Partial<NotebookSourceScope>): NotebookSourceScope {
  return {
    includeCrm: value?.includeCrm !== false,
    includeDocuments: value?.includeDocuments !== false,
    includeProposals: value?.includeProposals !== false,
    includeNegotiations: value?.includeNegotiations !== false,
    includeWeb: value?.includeWeb !== false,
    proposalIds: [...new Set((value?.proposalIds || []).map(String).filter(Boolean))],
    negotiationIds: [...new Set((value?.negotiationIds || []).map(String).filter(Boolean))],
  }
}

function normalizeNotebook(notebook: AlixNotebook): AlixNotebook {
  notebook.sourceScope = normalizeSourceScope(notebook.sourceScope)
  notebook.comments = Array.isArray(notebook.comments) ? notebook.comments : []
  notebook.actions = Array.isArray(notebook.actions) ? notebook.actions : []
  notebook.notes = Array.isArray(notebook.notes) ? notebook.notes : []
  notebook.sources = Array.isArray(notebook.sources) ? notebook.sources : []
  notebook.artifacts = (Array.isArray(notebook.artifacts) ? notebook.artifacts : []).map((artifact) => {
    const sourceSnapshot = artifact.sourceSnapshot?.length
      ? artifact.sourceSnapshot
      : snapshotFromCitations(artifact.citations || [])
    return {
      ...artifact,
      lineageId: artifact.lineageId || artifact.id,
      version: Math.max(1, Number(artifact.version || 1)),
      sourceSnapshot,
      sourceSnapshotHash: artifact.sourceSnapshotHash || contentHash(sourceSnapshot),
    }
  })
  return notebook
}

function citationMarkers(values: string[], validIds: Set<string>): string[] {
  const markers = new Set<string>()
  for (const value of values) {
    for (const match of String(value || '').matchAll(/S\d+/gi)) {
      const id = match[0].toUpperCase()
      if (validIds.has(id)) markers.add(`[${id}]`)
    }
  }
  return [...markers]
}

function removeUnknownCitationMarkers(text: string, validIds: Set<string>): string {
  return text.replace(/\[S(\d+)\]/gi, (marker, number: string) => (
    validIds.has(`S${number}`) ? marker.toUpperCase() : '[fonte não disponível]'
  ))
}

function sourceKindFrom(source: NotebookCorpusSource): string {
  if (source.documentId.startsWith('web:')) return 'web'
  if (source.documentId.startsWith('sistema:proposta:')) return 'proposal'
  if (source.documentId.startsWith('sistema:negociacao:')) return 'negotiation'
  if (source.documentId.startsWith('sistema:')) return 'crm'
  if (source.documentId.startsWith('nota:')) return 'note'
  return 'document'
}

function snapshotFromCitations(citations: NotebookArtifact['citations']): NonNullable<NotebookArtifact['sourceSnapshot']> {
  return citations.map((citation) => ({
    sourceId: citation.documentId,
    sourceHash: contentHash({ quote: citation.quote, page: citation.page, sheet: citation.sheet }),
    label: citation.filename,
    kind: sourceKindFrom(citation),
  }))
}

interface NotebookGenerationShape {
  title: string
  executiveSummary: string
  sections: Array<{
    heading: string
    body: string
    citations: string[]
  }>
  actionItems: Array<{
    priority: 'alta' | 'media' | 'baixa'
    action: string
    rationale: string
    citations: string[]
  }>
  openQuestions: string[]
}

interface NotebookRevisionShape extends NotebookGenerationShape {
  changeSummary: string
  changedSections: string[]
  preservedSections: string[]
}

interface NotebookCorpusSource {
  documentId: string
  filename: string
  source: string
  quote: string
  page?: number
  sheet?: string
}

function generationMarkdown(data: NotebookGenerationShape, citations: NotebookArtifact['citations']): string {
  const validCitationIds = new Set(citations.map((citation) => citation.id))
  return [
    `# ${data.title}`,
    '',
    removeUnknownCitationMarkers(data.executiveSummary, validCitationIds),
    '',
    ...data.sections.flatMap((section) => [
      `## ${section.heading}`,
      '',
      `${removeUnknownCitationMarkers(section.body, validCitationIds)}${section.citations.length ? ` ${citationMarkers(section.citations, validCitationIds).join(' ')}` : ''}`,
      '',
    ]),
    data.actionItems.length ? '## Proximas Acoes' : '',
    '',
    ...data.actionItems.map((item) => `- ${item.priority.toUpperCase()}: ${removeUnknownCitationMarkers(item.action, validCitationIds)} - ${removeUnknownCitationMarkers(item.rationale, validCitationIds)}${item.citations.length ? ` ${citationMarkers(item.citations, validCitationIds).join(' ')}` : ''}`),
    '',
    data.openQuestions.length ? '## Lacunas e Perguntas Abertas' : '',
    '',
    ...data.openQuestions.map((question) => `- ${question}`),
  ].filter((line, index, arr) => line || arr[index - 1]).join('\n')
}

const NOTEBOOK_GENERATION_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    executiveSummary: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          body: { type: 'string' },
          citations: { type: 'array', items: { type: 'string' } },
        },
        required: ['heading', 'body', 'citations'],
        additionalProperties: false,
      },
    },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          priority: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          action: { type: 'string' },
          rationale: { type: 'string' },
          citations: { type: 'array', items: { type: 'string' } },
        },
        required: ['priority', 'action', 'rationale', 'citations'],
        additionalProperties: false,
      },
    },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'executiveSummary', 'sections', 'actionItems', 'openQuestions'],
  additionalProperties: false,
} as const

const NOTEBOOK_REVISION_SCHEMA = {
  type: 'object',
  properties: {
    ...NOTEBOOK_GENERATION_SCHEMA.properties,
    changeSummary: { type: 'string' },
    changedSections: { type: 'array', items: { type: 'string' } },
    preservedSections: { type: 'array', items: { type: 'string' } },
  },
  required: [
    ...NOTEBOOK_GENERATION_SCHEMA.required,
    'changeSummary',
    'changedSections',
    'preservedSections',
  ],
  additionalProperties: false,
} as const

export class AlixNotebookService {
  private pgReady = false

  constructor(private readonly storageDir: string) {}

  private notebookPath(id: string): string {
    return join(this.storageDir, `${safeSegment(id)}.json`)
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true })
  }

  private async ensurePg(): Promise<void> {
    if (!isPgEnabled() || this.pgReady) return
    await getPool().query(`
      create table if not exists alix_notebook (
        id text primary key,
        cliente_id text,
        session_id text,
        title text not null,
        payload jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `)
    await getPool().query(`create index if not exists idx_alix_notebook_cliente on alix_notebook(cliente_id, updated_at desc)`)
    await getPool().query(`create index if not exists idx_alix_notebook_session on alix_notebook(session_id, updated_at desc)`)
    this.pgReady = true
  }

  private async persist(notebook: AlixNotebook): Promise<void> {
    normalizeNotebook(notebook)
    notebook.updatedAt = nowIso()
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        await getPool().query(
          `
            insert into alix_notebook (id, cliente_id, session_id, title, payload, created_at, updated_at)
            values ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $7::timestamptz)
            on conflict (id) do update set
              cliente_id = excluded.cliente_id,
              session_id = excluded.session_id,
              title = excluded.title,
              payload = excluded.payload,
              updated_at = excluded.updated_at
          `,
          [
            notebook.id,
            notebook.clienteId ?? null,
            notebook.sessionId ?? null,
            notebook.title,
            JSON.stringify(notebook),
            notebook.createdAt,
            notebook.updatedAt,
          ],
        )
        for (const artifact of notebook.artifacts) {
          await getPool().query(
            `insert into alix_notebook_artifact_version (
               id, notebook_id, lineage_id, parent_artifact_id, version, kind, title,
               markdown, citations, source_snapshot, source_snapshot_hash, change_summary,
               metadata, created_at
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb,$14::timestamptz)
             on conflict (id) do update set
               title = excluded.title, markdown = excluded.markdown,
               citations = excluded.citations, source_snapshot = excluded.source_snapshot,
               source_snapshot_hash = excluded.source_snapshot_hash,
               change_summary = excluded.change_summary, metadata = excluded.metadata`,
            [
              artifact.id, notebook.id, artifact.lineageId, artifact.parentArtifactId || null,
              artifact.version, artifact.kind, artifact.title, artifact.markdown,
              JSON.stringify(artifact.citations || []), JSON.stringify(artifact.sourceSnapshot || []),
              artifact.sourceSnapshotHash || null, artifact.changeSummary || null,
              JSON.stringify(artifact.metadata || {}), artifact.createdAt,
            ],
          )
        }
        for (const comment of notebook.comments) {
          await getPool().query(
            `insert into alix_notebook_comment (
               id, notebook_id, artifact_id, author_id, text, status,
               applied_in_artifact_id, created_at, resolved_at
             ) values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz)
             on conflict (id) do update set
               text = excluded.text, status = excluded.status,
               applied_in_artifact_id = excluded.applied_in_artifact_id,
               resolved_at = excluded.resolved_at`,
            [
              comment.id, notebook.id, comment.artifactId || null, comment.authorId || null,
              comment.text, comment.status, comment.appliedInArtifactId || null,
              comment.createdAt, comment.resolvedAt || null,
            ],
          )
        }
        for (const action of notebook.actions) {
          await getPool().query(
            `insert into alix_notebook_action (
               id, notebook_id, source_artifact_id, kind, title, content,
               status, created_at, updated_at
             ) values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz)
             on conflict (id) do update set
               title = excluded.title, content = excluded.content,
               status = excluded.status, updated_at = excluded.updated_at`,
            [
              action.id, notebook.id, action.sourceArtifactId || null, action.kind,
              action.title, action.content, action.status, action.createdAt, action.updatedAt,
            ],
          )
        }
      } catch (err) {
        console.warn('[AlixNotebookService] PG persist falhou:', (err as Error).message)
      }
    }
    await this.ensureDir()
    await fs.writeFile(this.notebookPath(notebook.id), JSON.stringify(notebook, null, 2), 'utf-8')
  }

  private async getSourceIndex(source: Pick<NotebookSourceRef, 'sessionId' | 'documentId'>): Promise<DocumentIndexRecord | null> {
    return getDocumentIndexService().get(source.sessionId, source.documentId)
  }

  private async hydrateSource(
    source: Pick<NotebookSourceRef, 'sessionId' | 'documentId'>,
    clienteId?: string,
  ): Promise<NotebookSourceRef> {
    const index = await this.getSourceIndex(source)
    if (!index) throw new Error(`Documento ${source.documentId} não foi encontrado ou ainda não foi indexado.`)
    if (index.sessionId !== source.sessionId || index.documentId !== source.documentId) throw new Error('O documento não está disponível no escopo selecionado do Notebook.')
    if (clienteId && index.clienteId) {
      const [target, owner] = await Promise.all([this.resolveCliente({ clienteId }), this.resolveCliente({ clienteId: index.clienteId })])
      if (target?.id !== owner?.id) throw new Error(`Documento ${source.documentId} pertence a outro cliente e não pode ser adicionado.`)
    }
    return {
      sessionId: source.sessionId,
      documentId: source.documentId,
      filename: index?.filename,
      kind: index?.kind,
      clienteId: index.clienteId,
      addedAt: nowIso(),
    }
  }

  async create(input: NotebookCreateInput): Promise<AlixNotebook> {
    const title = String(input.title || '').trim()
    if (title.length < 2) throw new Error('Titulo do notebook e obrigatorio.')
    const explicitClient = await this.resolveCliente({ clienteId: input.clienteId })
    const id = randomUUID()
    const now = nowIso()
    const notebook: AlixNotebook = {
      id,
      title: title.slice(0, 140),
      clienteId: explicitClient?.id,
      sessionId: input.sessionId?.trim() || undefined,
      objective: input.objective?.trim() || undefined,
      sourceScope: normalizeSourceScope(input.sourceScope),
      sources: [],
      notes: [],
      artifacts: [],
      comments: [],
      actions: [],
      createdAt: now,
      updatedAt: now,
    }
    if (input.sources?.length) {
      notebook.sources = await this.normalizeSources(input.sources, notebook.clienteId)
    }
    await this.persist(notebook)
    auditAsync({
      ator: 'alix-notebook',
      acao: 'create',
      recurso: `alix_notebook:${notebook.id}`,
      dadosDepois: { clienteId: notebook.clienteId, sessionId: notebook.sessionId, sources: notebook.sources.length },
    })
    return notebook
  }

  async get(id: string, _options: { strict?: boolean } = {}): Promise<AlixNotebook | null> {
    const cleanId = id.trim()
    if (!cleanId) return null
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const res = await getPool().query(`select payload from alix_notebook where id = $1 limit 1`, [cleanId])
        return res.rows[0]?.payload ? normalizeNotebook(res.rows[0].payload as AlixNotebook) : null
      } catch {
        // A leitura posterior ao guard também precisa da autoridade PG atual.
        // O argumento legado strict não pode reativar fallback em produção.
        throw notebookReadUnavailable()
      }
    }
    try {
      const raw = await fs.readFile(this.notebookPath(cleanId), 'utf-8')
      return normalizeNotebook(JSON.parse(raw) as AlixNotebook)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ENOENT') return null
      throw err
    }
  }

  async list(filters: { clienteId?: string; sessionId?: string; limit?: number } = {}, options: { strict?: boolean; ownerIds?: string[]; sharedSessionIds?: string[] } = {}): Promise<AlixNotebook[]> {
    const limit = normalizeLimit(filters.limit, 30, 100)
    if (isPgEnabled()) {
      try {
        await this.ensurePg()
        const params: unknown[] = []
        const clauses: string[] = []
        if (filters.clienteId) {
          params.push(filters.clienteId)
          clauses.push(`cliente_id = $${params.length}`)
        }
        if (filters.sessionId) {
          params.push(filters.sessionId)
          clauses.push(`session_id = $${params.length}`)
        }
        if (options.ownerIds) {
          params.push(options.ownerIds, options.sharedSessionIds || [])
          clauses.push(`exists (select 1 from alix_session access_session where access_session.id = alix_notebook.session_id and (access_session.consultor_id = any($${params.length - 1}::text[]) or (access_session.consultor_id is null and access_session.id = any($${params.length}::text[]))))`)
        }
        params.push(limit)
        const where = clauses.length ? `where ${clauses.join(' and ')}` : ''
        const res = await getPool().query(
          `select payload from alix_notebook ${where} order by updated_at desc limit $${params.length}`,
          params,
        )
        return res.rows.map((r) => normalizeNotebook(r.payload as AlixNotebook))
      } catch {
        throw notebookReadUnavailable()
      }
    }

    await this.ensureDir()
    const files = await fs.readdir(this.storageDir).catch(() => [])
    const notebooks: AlixNotebook[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const parsed = normalizeNotebook(JSON.parse(await fs.readFile(join(this.storageDir, file), 'utf-8')) as AlixNotebook)
        if (filters.clienteId && parsed.clienteId !== filters.clienteId) continue
        if (filters.sessionId && parsed.sessionId !== filters.sessionId) continue
        notebooks.push(parsed)
      } catch {
        // Ignora arquivo corrompido.
      }
    }
    let visible = notebooks
    if (options.ownerIds) {
      const owners = new Set(options.ownerIds), shared = new Set(options.sharedSessionIds || [])
      const sessions = new Map((await getSessionsAccess(notebooks.map(notebook => notebook.sessionId).filter((id): id is string => Boolean(id)))).map(session => [session.id, session]))
      visible = notebooks.filter(notebook => {
        const session = notebook.sessionId ? sessions.get(notebook.sessionId) : undefined
        return Boolean(session && (session.consultorId ? owners.has(session.consultorId) : shared.has(session.id)))
      })
    }
    return visible.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, limit)
  }

  async addSources(id: string, sources: Array<{ sessionId: string; documentId: string }>): Promise<AlixNotebook> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const previousCount = notebook.sources.length
    const merged = new Map(notebook.sources.map((source) => [sourceKey(source), source]))
    for (const source of await this.normalizeSources(sources, notebook.clienteId)) {
      merged.set(sourceKey(source), source)
    }
    notebook.sources = [...merged.values()]
    await this.persist(notebook)
    auditAsync({
      ator: 'alix-notebook',
      acao: 'add_sources',
      recurso: `alix_notebook:${notebook.id}`,
      dadosAntes: { sources: previousCount },
      dadosDepois: { sources: notebook.sources.length },
    })
    return notebook
  }

  async addNote(id: string, text: string): Promise<AlixNotebook> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const clean = text.trim()
    if (!clean) throw new Error('Nota vazia.')
    notebook.notes.push({ id: randomUUID(), text: clean.slice(0, 8_000), createdAt: nowIso() })
    await this.persist(notebook)
    auditAsync({
      ator: 'alix-notebook',
      acao: 'add_note',
      recurso: `alix_notebook:${notebook.id}`,
      dadosDepois: { notes: notebook.notes.length, textLength: clean.length },
    })
    return notebook
  }

  async updateSourceScope(id: string, patch: Partial<NotebookSourceScope>): Promise<AlixNotebook> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const before = notebook.sourceScope
    notebook.sourceScope = normalizeSourceScope({ ...before, ...patch })
    await this.persist(notebook)
    auditAsync({
      ator: 'alix-notebook',
      acao: 'update_source_scope',
      recurso: `alix_notebook:${notebook.id}`,
      dadosAntes: before,
      dadosDepois: notebook.sourceScope,
    })
    return notebook
  }

  async addComment(id: string, input: { artifactId?: string; text: string; authorId?: string }): Promise<AlixNotebook> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const clean = input.text.replace(/\s+/g, ' ').trim()
    if (!clean) throw new Error('Comentário vazio.')
    if (input.artifactId && !notebook.artifacts.some((artifact) => artifact.id === input.artifactId)) {
      throw new Error('Documento comentado não pertence ao notebook.')
    }
    notebook.comments.unshift({
      id: randomUUID(),
      artifactId: input.artifactId,
      authorId: input.authorId,
      text: clean.slice(0, 4_000),
      status: 'open',
      createdAt: nowIso(),
    })
    await this.persist(notebook)
    auditAsync({
      ator: input.authorId || 'alix-notebook',
      acao: 'add_editorial_comment',
      recurso: `alix_notebook:${notebook.id}`,
      dadosDepois: { artifactId: input.artifactId, commentId: notebook.comments[0].id },
    })
    return notebook
  }

  async updateComment(id: string, commentId: string, status: 'open' | 'resolved', actorId?: string): Promise<AlixNotebook> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const comment = notebook.comments.find((item) => item.id === commentId)
    if (!comment) throw new Error('Comentário não encontrado.')
    comment.status = status
    comment.resolvedAt = status === 'resolved' ? nowIso() : undefined
    await this.persist(notebook)
    auditAsync({
      ator: actorId || 'alix-notebook',
      acao: 'update_editorial_comment',
      recurso: `alix_notebook:${notebook.id}`,
      dadosDepois: { commentId, status },
    })
    return notebook
  }

  async convertArtifact(id: string, artifactId: string, input: {
    target: NotebookAction['kind']
    title?: string
  }): Promise<{ notebook: AlixNotebook; action?: NotebookAction; artifact?: NotebookArtifact }> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const source = notebook.artifacts.find((artifact) => artifact.id === artifactId)
    if (!source) throw new Error('Documento de origem não encontrado.')
    const now = nowIso()
    const title = (input.title || source.title).replace(/\s+/g, ' ').trim().slice(0, 180)
    if (input.target === 'proposal' || input.target === 'checklist') {
      const kind: NotebookArtifactKind = input.target === 'proposal' ? 'proposta' : 'checklist'
      const artifact: NotebookArtifact = {
        id: randomUUID(),
        lineageId: randomUUID(),
        version: 1,
        kind,
        title,
        markdown: source.markdown,
        citations: source.citations,
        sourceSnapshot: source.sourceSnapshot,
        sourceSnapshotHash: source.sourceSnapshotHash,
        changeSummary: `Convertido da resposta ${source.id} para ${kind}.`,
        createdAt: now,
        metadata: { derivedFromArtifactId: source.id, conversion: input.target },
      }
      notebook.artifacts.unshift(artifact)
      await this.persist(notebook)
      return { notebook, artifact }
    }

    if (input.target === 'note') {
      notebook.notes.unshift({ id: randomUUID(), text: source.markdown.slice(0, 8_000), createdAt: now })
    }
    const action: NotebookAction = {
      id: randomUUID(),
      sourceArtifactId: source.id,
      kind: input.target,
      title,
      content: source.markdown.slice(0, 12_000),
      status: input.target === 'note' ? 'done' : 'open',
      createdAt: now,
      updatedAt: now,
    }
    notebook.actions.unshift(action)
    await this.persist(notebook)
    auditAsync({
      ator: 'alix-notebook',
      acao: 'convert_artifact',
      recurso: `alix_notebook:${notebook.id}`,
      dadosDepois: { artifactId, target: input.target, actionId: action.id },
    })
    return { notebook, action }
  }

  async updateAction(id: string, actionId: string, status: NotebookAction['status']): Promise<AlixNotebook> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const action = notebook.actions.find((item) => item.id === actionId)
    if (!action) throw new Error('Ação não encontrada.')
    action.status = status
    action.updatedAt = nowIso()
    await this.persist(notebook)
    return notebook
  }

  private async normalizeSources(
    sources: Array<{ sessionId: string; documentId: string }>,
    clienteId?: string,
  ): Promise<NotebookSourceRef[]> {
    const normalized: NotebookSourceRef[] = []
    const seen = new Set<string>()
    for (const raw of sources) {
      const sessionId = String(raw.sessionId || '').trim()
      const documentId = String(raw.documentId || '').trim()
      if (!sessionId || !documentId) continue
      const key = `${sessionId}:${documentId}`
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push(await this.hydrateSource({ sessionId, documentId }, clienteId))
    }
    return normalized
  }

  async search(id: string, query: string, limit = 8): Promise<Array<DocumentSearchHit & { citationId: string }>> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const cliente = await this.resolveCliente(notebook)
    const perSource = Math.max(3, Math.ceil(normalizeLimit(limit, 8, 30) / Math.max(1, notebook.sources.length)))
    const all: Array<DocumentSearchHit & { citationId: string }> = []
    for (const source of notebook.sources) {
      const hydrated = await this.hydrateSource(source, cliente?.id)
      const hits = await getDocumentIndexService().search({
        sessionId: source.sessionId,
        documentId: source.documentId,
        query,
        clienteId: hydrated.clienteId,
        limit: perSource,
      })
      for (const hit of hits) {
        if (hit.documentId !== source.documentId || hit.sessionId !== source.sessionId) throw new Error('O índice devolveu uma fonte fora do escopo selecionado do Notebook.')
        if (cliente && hit.clienteId) {
          const owner = await this.resolveCliente({ clienteId: hit.clienteId })
          if (owner?.id !== cliente.id) throw new Error('A fonte documental pertence a outro cliente; confira o vínculo antes de continuar.')
        }
        all.push({ ...hit, citationId: '' })
      }
    }
    return all
      .sort((a, b) => b.score - a.score)
      .slice(0, normalizeLimit(limit, 8, 30))
      .map((hit, index) => ({ ...hit, citationId: `S${index + 1}` }))
  }

  /** O vínculo explícito é a única autoridade; nomes e objetivos nunca selecionam outro caso. */
  private async resolveCliente(notebook: Pick<AlixNotebook, 'clienteId'>): Promise<{ id: string; nome: string; cadastro: Record<string, unknown> } | null> {
    const requestedId = notebook.clienteId?.trim()
    if (!requestedId) return null
    if (isPgEnabled()) {
      const canonicalId = await resolveClienteId(requestedId)
      const { rows } = await getPool().query('select id, nome, payload from cliente where id = $1 limit 1', [canonicalId])
      const row = rows[0]
      if (!row || !String(row.nome || '').trim()) throw new Error('O cliente vinculado ao Notebook não está disponível no cadastro canônico. Confira o vínculo antes de consultar dados internos.')
      return { id: row.id, nome: row.nome, cadastro: { ...(row.payload || {}), id: row.id, nome: row.nome } }
    }
    const row = clientes.get(requestedId)
    if (!row) throw new Error('O cliente vinculado ao Notebook não foi encontrado. Selecione explicitamente o cliente correto.')
    return { id: row.id, nome: row.nome, cadastro: row as unknown as Record<string, unknown> }
  }

  private async buildSystemCorpus(notebook: AlixNotebook): Promise<{
    cliente?: { id: string; nome: string }
    sources: NotebookCorpusSource[]
  }> {
    const cliente = await this.resolveCliente(notebook)
    if (!cliente) return { sources: [] }
    const sources: NotebookCorpusSource[] = []
    try {
      if (notebook.sourceScope.includeCrm) {
        const consolidated = await consolidarDadosDossie({ banco: 'geral', clienteId: cliente.id })
        sources.push({
          documentId: `sistema:${cliente.id}`,
          filename: `ALETIS — CRM de ${cliente.nome}`,
          source: 'sistema:crm',
          quote: compactText(JSON.stringify(consolidated.cliente), 7_000),
        })
        sources.push({
          documentId: `sistema:${cliente.id}:operacao`,
          filename: `ALETIS — dossiê, financeiro e propriedades de ${cliente.nome}`,
          source: 'sistema:crm+dossie+gestao-financeira+farms',
          quote: compactText(JSON.stringify({ dados: consolidated.dados, fontesIntegradas: consolidated.fontes }), 18_000),
        })
      }
    } catch {
      // Um conector interno instável não pode fazer o Notebook perder todo o
      // contexto do caso. Mantemos um retrato mínimo e auditável do CRM.
      const cadastro = cliente.cadastro
      const snapshot = cadastro
        ? {
            id: cadastro.id,
            nome: cadastro.nome,
            cpfCnpj: cadastro.cpfCnpj ?? cadastro.cpfcnpj,
            estagio: cadastro.estagio,
            status: cadastro.status,
            cidade: cadastro.cidade,
            uf: cadastro.uf,
            atividades: cadastro.atividades,
          }
        : { id: cliente.id, nome: cliente.nome, status: 'cadastro interno indisponível para leitura detalhada' }
      if (notebook.sourceScope.includeCrm) {
        sources.push({
          documentId: `sistema:${cliente.id}:cadastro`,
          filename: `ALETIS — cadastro de ${cliente.nome}`,
          source: 'sistema:crm:cadastro',
          quote: compactText(JSON.stringify(snapshot), 4_500),
        })
      }
    }

    // O Livro de Fatos participa do snapshot do corpus. Quando um fato muda,
    // a hash desta fonte muda e a revisão seletiva do dossiê detecta exatamente
    // que existe material novo, preservando o restante do documento.
    if (notebook.sourceScope.includeCrm) {
      try {
        const facts = await listLedgerFacts(cliente.id, { limit: 160, includeContested: true })
        if (facts.length > 0) {
          sources.push({
            documentId: `sistema:${cliente.id}:livro-fatos`,
            filename: `ALETIS — Livro de Fatos de ${cliente.nome}`,
            source: 'sistema:livro-de-fatos',
            quote: compactText(JSON.stringify(facts.map((fact) => ({
              id: fact.id,
              chave: fact.factKey,
              valor: fact.factValue,
              status: fact.status,
              confianca: fact.confidence,
              versao: fact.version,
              evidencias: fact.evidence.slice(0, 4),
            }))), 18_000),
          })
        }
      } catch {
        // A ausência temporária do ledger não impede o uso das demais fontes.
      }
    }

    if (notebook.sourceScope.includeProposals) {
      const selected = new Set(notebook.sourceScope.proposalIds)
      const proposals = (await listPropostas().catch(() => []))
        .filter((proposal) => String(proposal.clienteId || '') === cliente.id)
        .filter((proposal) => selected.size === 0 || selected.has(String(proposal.id || '')))
        .slice(0, 30)
      for (const proposal of proposals) {
        const proposalId = String(proposal.id || contentHash(proposal).slice(0, 16))
        sources.push({
          documentId: `sistema:proposta:${proposalId}`,
          filename: `ALETIS — proposta ${String(proposal.titulo || proposalId)}`,
          source: 'sistema:propostas',
          quote: compactText(JSON.stringify(proposal), 5_000),
        })
      }
    }

    if (notebook.sourceScope.includeNegotiations && isPgEnabled()) {
      const selected = new Set(notebook.sourceScope.negotiationIds)
      const negotiations = (await getDealRoomService().listByCliente(cliente.id).catch(() => []))
        .filter((negotiation) => selected.size === 0 || selected.has(negotiation.id))
        .slice(0, 30)
      for (const negotiation of negotiations) {
        sources.push({
          documentId: `sistema:negociacao:${negotiation.id}`,
          filename: `ALETIS — negociação com ${negotiation.credor}`,
          source: 'sistema:deal-room',
          quote: compactText(JSON.stringify(negotiation), 5_000),
        })
      }
    }

    return { cliente, sources }
  }

  private async buildWebCorpus(
    objective: string,
    cliente?: { id: string; nome: string },
  ): Promise<NotebookCorpusSource[]> {
    const query = [
      cliente?.nome ? `"${cliente.nome}"` : '',
      objective,
      'agronegócio crédito rural notícias riscos públicos',
    ].filter(Boolean).join(' ')
    if (!query.trim()) return []
    try {
      const research = await searchOpenAIWeb(query, getModelForRole('web_researcher'), {
        brOnly: true,
        maxResults: 5,
        timeoutMs: 25_000,
      })
      return research.results.map((result) => ({
        documentId: `web:${result.url}`,
        filename: result.title || result.url,
        source: result.url,
        quote: compactText(result.snippet || research.text || result.url, 1_200),
      }))
    } catch {
      // Busca web é complementar: indisponibilidade não impede análise das fontes internas.
      return []
    }
  }

  private async buildCorpusContext(notebook: AlixNotebook, objective: string, limit: number, researchWeb = true): Promise<{
    context: string
    citations: NotebookArtifact['citations']
  }> {
    const query = [objective, notebook.objective, notebook.title].filter(Boolean).join(' ')
    const hits = notebook.sourceScope.includeDocuments
      ? await this.search(notebook.id, query, limit)
      : []
    const system = await this.buildSystemCorpus(notebook)
    const webSources = researchWeb && notebook.sourceScope.includeWeb
      ? await this.buildWebCorpus(objective, system.cliente)
      : []
    const notesSource: NotebookCorpusSource[] = notebook.notes.length
      ? [{
          documentId: `nota:${notebook.id}`,
          filename: 'Notas do consultor ALETIS',
          source: 'notebook:notas-consultor',
          quote: compactText(notebook.notes.map((note) => note.text).join('\n\n'), 8_000),
        }]
      : []
    const sources: NotebookCorpusSource[] = [
      ...hits.map((hit) => ({
      documentId: hit.documentId,
      filename: hit.filename,
      source: hit.source,
      page: hit.page,
      sheet: hit.sheet,
      quote: compactText(hit.text, 700),
      })),
      ...system.sources,
      ...webSources,
      ...notesSource,
    ]
    const citations = sources.map((source, index) => ({
      id: `S${index + 1}`,
      ...source,
    }))
    const context = citations.map((citation) => {
      const loc = citation.page ? `p.${citation.page}` : citation.sheet ? `aba ${citation.sheet}` : citation.source
      return `[${citation.id}] ${citation.filename} (${loc})\n${citation.quote}`
    }).join('\n\n')
    return { context, citations }
  }

  async sourceMap(id: string): Promise<NotebookSourceMap> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const resolved = await this.resolveCliente(notebook)
    const proposalRows = resolved
      ? (await listPropostas().catch(() => [])).filter((proposal) => String(proposal.clienteId || '') === resolved.id)
      : []
    const negotiationRows = resolved && isPgEnabled()
      ? await getDealRoomService().listByCliente(resolved.id).catch(() => [])
      : []
    const selectedProposals = new Set(notebook.sourceScope.proposalIds)
    const selectedNegotiations = new Set(notebook.sourceScope.negotiationIds)
    const sources: NotebookSourceMap['sources'] = []

    sources.push({
      id: resolved ? `crm:${resolved.id}` : 'crm:missing',
      kind: 'crm',
      label: resolved ? `CRM e bases internas — ${resolved.nome}` : 'Cliente não vinculado',
      status: !notebook.sourceScope.includeCrm ? 'disabled' : resolved ? 'selected' : 'missing',
      selected: notebook.sourceScope.includeCrm && Boolean(resolved),
      detail: resolved ? 'Cadastro, dossiê, financeiro e propriedades.' : 'Selecione um cliente para habilitar dados internos.',
    })
    for (const source of notebook.sources) {
      sources.push({
        id: source.documentId,
        kind: 'document',
        label: source.filename || source.documentId,
        status: notebook.sourceScope.includeDocuments ? 'selected' : 'disabled',
        selected: notebook.sourceScope.includeDocuments,
        detail: source.kind || 'Documento indexado',
      })
    }
    if (proposalRows.length === 0) {
      sources.push({ id: 'proposal:missing', kind: 'proposal', label: 'Nenhuma proposta vinculada', status: 'missing', selected: false })
    } else {
      for (const proposal of proposalRows.slice(0, 40)) {
        const proposalId = String(proposal.id || '')
        const selected = notebook.sourceScope.includeProposals
          && (selectedProposals.size === 0 || selectedProposals.has(proposalId))
        sources.push({
          id: proposalId,
          kind: 'proposal',
          label: String(proposal.titulo || proposalId),
          status: !notebook.sourceScope.includeProposals ? 'disabled' : selected ? 'selected' : 'available',
          selected,
          detail: String(proposal.status || 'Proposta ALETIS'),
        })
      }
    }
    if (negotiationRows.length === 0) {
      sources.push({ id: 'negotiation:missing', kind: 'negotiation', label: 'Nenhuma negociação vinculada', status: 'missing', selected: false })
    } else {
      for (const negotiation of negotiationRows) {
        const selected = notebook.sourceScope.includeNegotiations
          && (selectedNegotiations.size === 0 || selectedNegotiations.has(negotiation.id))
        sources.push({
          id: negotiation.id,
          kind: 'negotiation',
          label: `${negotiation.credor} — ${negotiation.status}`,
          status: !notebook.sourceScope.includeNegotiations ? 'disabled' : selected ? 'selected' : 'available',
          selected,
          detail: negotiation.proximaData ? `Próximo marco: ${negotiation.proximaData.toISOString().slice(0, 10)}` : undefined,
        })
      }
    }
    sources.push({
      id: 'web:public',
      kind: 'web',
      label: 'Pesquisa web pública brasileira',
      status: notebook.sourceScope.includeWeb ? 'selected' : 'disabled',
      selected: notebook.sourceScope.includeWeb,
      detail: 'Usada somente como fonte complementar e explicitamente identificada.',
    })
    if (notebook.notes.length > 0) {
      sources.push({
        id: `note:${notebook.id}`,
        kind: 'note',
        label: `${notebook.notes.length} nota(s) do consultor`,
        status: 'available',
        selected: true,
        detail: 'Instruções editoriais; não são promovidas automaticamente a fatos.',
      })
    }

    let canonical: Record<string, any> = {}
    if (resolved) {
      canonical = await consolidarDadosDossie({ banco: 'geral', clienteId: resolved.id })
        .then((result) => result.dados as Record<string, any>)
        .catch(() => ({}))
    }
    const checks = [
      {
        key: 'identity', label: 'Identificação e grupo econômico', severity: 'critical' as const,
        present: Boolean(resolved), recommendation: 'Vincular o cliente e confirmar CPF/CNPJ e integrantes do grupo.',
      },
      {
        key: 'debt', label: 'Endividamento e contratos', severity: 'critical' as const,
        present: Array.isArray(canonical.dividas) && canonical.dividas.length > 0,
        recommendation: 'Adicionar contratos, extratos ou posição consolidada das dívidas.',
      },
      {
        key: 'guarantee', label: 'Garantias e ônus', severity: 'important' as const,
        present: Boolean(canonical.operacao?.garantias)
          || (Array.isArray(canonical.propriedades) && canonical.propriedades.some((item: any) => item.onus || item.avaliacao)),
        recommendation: 'Adicionar matrículas, garantias, avaliações e situação dos ônus.',
      },
      {
        key: 'property', label: 'Patrimônio e imóveis', severity: 'important' as const,
        present: Array.isArray(canonical.propriedades) && canonical.propriedades.length > 0,
        recommendation: 'Vincular propriedades, CAR, CCIR, ITR e avaliações patrimoniais.',
      },
      {
        key: 'production', label: 'Produção e capacidade operacional', severity: 'important' as const,
        present: (Array.isArray(canonical.producoes) && canonical.producoes.length > 0)
          || (Array.isArray(canonical.pecuaria) && canonical.pecuaria.length > 0),
        recommendation: 'Informar safras, produtividade, área, custos e comercialização.',
      },
      {
        key: 'financial', label: 'Capacidade financeira', severity: 'critical' as const,
        present: Boolean(canonical.operacao)
          || (Array.isArray(canonical.ativosOutros) && canonical.ativosOutros.length > 0),
        recommendation: 'Adicionar balanço, DRE, fluxo de caixa ou dados da Gestão Financeira.',
      },
      {
        key: 'strategy', label: 'Proposta e negociação', severity: 'advisory' as const,
        present: proposalRows.length > 0 || negotiationRows.length > 0,
        recommendation: 'Vincular a proposta vigente e o histórico da negociação com o credor.',
      },
    ]
    const gaps = checks
      .filter((check) => !check.present)
      .map(({ key, label, severity, recommendation }) => ({ key, label, severity, recommendation }))
    const completeness = Math.round(((checks.length - gaps.length) / checks.length) * 100)
    return { completeness, sources, gaps }
  }

  async synthesize(id: string, input: {
    kind?: NotebookArtifactKind
    objective?: string
    audience?: string
    limit?: number
    researchWeb?: boolean
  }): Promise<NotebookArtifact> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')

    const kind = input.kind || 'briefing'
    const objective = String(input.objective || notebook.objective || `Gerar ${kind} para ${notebook.title}`).trim()
    const { context, citations } = await this.buildCorpusContext(
      notebook,
      objective,
      normalizeLimit(input.limit, 12, 24),
      input.researchWeb !== false,
    )
    if (!context) throw new Error('Nenhuma fonte utilizável foi encontrada. Selecione um cliente, adicione documentos ou habilite a pesquisa web.')

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          'Você é a ALIX Notebook, especialista da ALETIS em dossiês de crédito rural e inteligência financeira. Produza documentos executivos em português do Brasil, ancorados exclusivamente nas fontes fornecidas. Cite cada afirmação material com [S1], [S2] etc.; separe fatos, inferências e lacunas. Não invente valores, datas, nomes ou conclusões. Para um dossiê, cubra identificação, operação/grupo econômico, patrimônio/produção, endividamento, riscos, oportunidades, pendências e plano de ação. Fontes internas ALETIS são dados operacionais; fontes web são complementares e devem ser tratadas como informação pública a validar.',
      },
      {
        role: 'user',
        content: [
          `Notebook: ${notebook.title}`,
          notebook.objective ? `Objetivo do notebook: ${notebook.objective}` : '',
          `Entrega solicitada: ${kind}`,
          `Objetivo especifico: ${objective}`,
          input.audience ? `Publico alvo: ${input.audience}` : '',
          notebook.notes.length ? `Notas do consultor:\n${notebook.notes.map((n) => `- ${n.text}`).join('\n')}` : '',
          `Fontes recuperadas:\n${context}`,
        ].filter(Boolean).join('\n\n'),
      },
    ]

    const result = await generateStructured<NotebookGenerationShape>(messages, {
      name: 'alix_notebook_generation',
      model: getModelForRole(['dossie', 'parecer', 'relatorio'].includes(kind) ? 'deal_analyzer' : 'doc_generator'),
      maxTokens: kind === 'dossie' ? 10_000 : 6_000,
      verbosity: kind === 'dossie' ? 'high' : 'medium',
      reasoning: {
        effort: ['dossie', 'parecer', 'relatorio'].includes(kind) ? 'xhigh' : 'medium',
        summary: 'auto',
        mode: ['dossie', 'parecer', 'relatorio'].includes(kind) ? 'pro' : 'standard',
      },
      metadata: {
        workflow: 'alix.notebook.synthesize',
        ...(notebook.clienteId ? { clienteId: notebook.clienteId } : {}),
      },
      schema: NOTEBOOK_GENERATION_SCHEMA,
    })

    const data = result.data
    const markdown = generationMarkdown(data, citations)
    const sourceSnapshot = snapshotFromCitations(citations)
    const artifactId = randomUUID()

    const artifact: NotebookArtifact = {
      id: artifactId,
      lineageId: artifactId,
      version: 1,
      kind,
      title: data.title,
      markdown,
      citations,
      sourceSnapshot,
      sourceSnapshotHash: contentHash(sourceSnapshot),
      createdAt: nowIso(),
      metadata: {
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
      },
    }
    notebook.artifacts.unshift(artifact)
    await this.persist(notebook)
    auditAsync({
      ator: 'alix-notebook',
      acao: 'generate_artifact',
      recurso: `alix_notebook:${notebook.id}`,
      dadosDepois: { artifactId: artifact.id, kind, citations: citations.length },
    })
    return artifact
  }

  async updateArtifact(notebookId: string, artifactId: string, input: {
    instructions?: string
    limit?: number
    researchWeb?: boolean
  } = {}): Promise<NotebookArtifact> {
    const notebook = await this.get(notebookId)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const base = notebook.artifacts.find((item) => item.id === artifactId)
    if (!base) throw new Error('Documento do notebook não encontrado.')

    const objective = [
      `Atualizar ${base.kind}: ${base.title}`,
      notebook.objective,
      input.instructions,
    ].filter(Boolean).join('. ')
    const { context, citations } = await this.buildCorpusContext(
      notebook,
      objective,
      normalizeLimit(input.limit, 16, 28),
      input.researchWeb !== false,
    )
    if (!context) throw new Error('Nenhuma fonte utilizável foi encontrada para atualizar o documento.')

    const previousSnapshot = base.sourceSnapshot?.length
      ? base.sourceSnapshot
      : snapshotFromCitations(base.citations || [])
    const currentSnapshot = snapshotFromCitations(citations)
    const previousById = new Map(previousSnapshot.map((source) => [source.sourceId, source]))
    const currentById = new Map(currentSnapshot.map((source) => [source.sourceId, source]))
    const addedSources = currentSnapshot.filter((source) => !previousById.has(source.sourceId))
    const removedSources = previousSnapshot.filter((source) => !currentById.has(source.sourceId))
    const changedSources = currentSnapshot.filter((source) => {
      const previous = previousById.get(source.sourceId)
      return Boolean(previous && previous.sourceHash !== source.sourceHash)
    })
    const lineageArtifactIds = new Set(
      notebook.artifacts
        .filter((artifact) => artifact.lineageId === base.lineageId)
        .map((artifact) => artifact.id),
    )
    const comments = notebook.comments.filter((comment) => (
      comment.status === 'open'
      && (!comment.artifactId || lineageArtifactIds.has(comment.artifactId))
    ))
    const instructions = String(input.instructions || '').replace(/\s+/g, ' ').trim().slice(0, 4_000)
    if (!addedSources.length && !removedSources.length && !changedSources.length && !comments.length && !instructions) {
      throw new Error('Nenhuma fonte, comentário ou instrução nova foi encontrada para criar outra versão.')
    }

    const sourceChanges = [
      ...addedSources.map((source) => `ADICIONADA: ${source.label} (${source.kind})`),
      ...changedSources.map((source) => `ALTERADA: ${source.label} (${source.kind})`),
      ...removedSources.map((source) => `REMOVIDA: ${source.label} (${source.kind})`),
    ]
    const result = await generateStructured<NotebookRevisionShape>([
      {
        role: 'system',
        content:
          'Você revisa documentos executivos da ALIX Notebook. Preserve integralmente estrutura, redação e seções que não forem afetadas por fontes novas/alteradas, comentários editoriais ou instruções explícitas. Atualize somente as seções impactadas. Comentários do consultor são instruções editoriais, nunca fatos: não os apresente como evidência. Toda afirmação material nova deve usar as citações atuais [S1], [S2] etc. Remova afirmações cuja única fonte deixou de existir. Separe fatos, inferências e lacunas; nunca invente dados. Informe com precisão quais seções mudaram e quais foram preservadas.',
      },
      {
        role: 'user',
        content: [
          `DOCUMENTO BASE (versão ${base.version}):\n${base.markdown}`,
          sourceChanges.length ? `MUDANÇAS DE FONTES:\n${sourceChanges.join('\n')}` : 'MUDANÇAS DE FONTES: nenhuma.',
          comments.length
            ? `COMENTÁRIOS EDITORIAIS A APLICAR (não são fatos):\n${comments.map((comment) => `- ${comment.text}`).join('\n')}`
            : 'COMENTÁRIOS EDITORIAIS: nenhum.',
          instructions ? `INSTRUÇÃO ADICIONAL:\n${instructions}` : '',
          `FONTES ATUAIS AUTORIZADAS:\n${context}`,
        ].filter(Boolean).join('\n\n'),
      },
    ], {
      name: 'alix_notebook_revision',
      model: getModelForRole(['dossie', 'parecer', 'relatorio'].includes(base.kind) ? 'deal_analyzer' : 'doc_generator'),
      maxTokens: base.kind === 'dossie' ? 10_000 : 7_000,
      verbosity: 'high',
      reasoning: { effort: 'xhigh', summary: 'auto', mode: 'pro' },
      metadata: {
        workflow: 'alix.notebook.update_artifact',
        notebookId,
        artifactId,
        ...(notebook.clienteId ? { clienteId: notebook.clienteId } : {}),
      },
      schema: NOTEBOOK_REVISION_SCHEMA,
    })

    const data = result.data
    const newArtifactId = randomUUID()
    const version = Math.max(
      0,
      ...notebook.artifacts
        .filter((artifact) => artifact.lineageId === base.lineageId)
        .map((artifact) => artifact.version),
    ) + 1
    const artifact: NotebookArtifact = {
      id: newArtifactId,
      lineageId: base.lineageId,
      parentArtifactId: base.id,
      version,
      kind: base.kind,
      title: data.title,
      markdown: generationMarkdown(data, citations),
      citations,
      sourceSnapshot: currentSnapshot,
      sourceSnapshotHash: contentHash(currentSnapshot),
      changeSummary: data.changeSummary,
      createdAt: nowIso(),
      metadata: {
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
        changedSections: data.changedSections,
        preservedSections: data.preservedSections,
        sourceChanges: {
          added: addedSources.map((source) => source.sourceId),
          changed: changedSources.map((source) => source.sourceId),
          removed: removedSources.map((source) => source.sourceId),
        },
        appliedCommentIds: comments.map((comment) => comment.id),
      },
    }
    const appliedAt = nowIso()
    for (const comment of comments) {
      comment.status = 'applied'
      comment.appliedInArtifactId = newArtifactId
      comment.resolvedAt = appliedAt
    }
    notebook.artifacts.unshift(artifact)
    await this.persist(notebook)
    auditAsync({
      ator: 'alix-notebook',
      acao: 'update_artifact',
      recurso: `alix_notebook:${notebook.id}`,
      dadosAntes: { artifactId: base.id, version: base.version },
      dadosDepois: {
        artifactId: artifact.id,
        version: artifact.version,
        changedSections: data.changedSections,
        appliedComments: comments.length,
      },
    })
    return artifact
  }

  async listArtifactVersions(notebookId: string, artifactId: string): Promise<NotebookArtifact[]> {
    const notebook = await this.get(notebookId)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const artifact = notebook.artifacts.find((item) => item.id === artifactId)
    if (!artifact) throw new Error('Documento do notebook não encontrado.')
    return notebook.artifacts
      .filter((item) => item.lineageId === artifact.lineageId)
      .sort((a, b) => b.version - a.version)
  }

  async compareArtifacts(notebookId: string, fromArtifactId: string, toArtifactId: string): Promise<{
    from: Pick<NotebookArtifact, 'id' | 'version' | 'title' | 'createdAt'>
    to: Pick<NotebookArtifact, 'id' | 'version' | 'title' | 'createdAt' | 'changeSummary'>
    sources: { added: string[]; changed: string[]; removed: string[] }
    changedSections: string[]
    preservedSections: string[]
  }> {
    const notebook = await this.get(notebookId)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const from = notebook.artifacts.find((item) => item.id === fromArtifactId)
    const to = notebook.artifacts.find((item) => item.id === toArtifactId)
    if (!from || !to || from.lineageId !== to.lineageId) {
      throw new Error('As versões informadas não pertencem ao mesmo documento.')
    }
    const fromById = new Map((from.sourceSnapshot || []).map((source) => [source.sourceId, source]))
    const toById = new Map((to.sourceSnapshot || []).map((source) => [source.sourceId, source]))
    return {
      from: { id: from.id, version: from.version, title: from.title, createdAt: from.createdAt },
      to: { id: to.id, version: to.version, title: to.title, createdAt: to.createdAt, changeSummary: to.changeSummary },
      sources: {
        added: [...toById.keys()].filter((id) => !fromById.has(id)),
        changed: [...toById.entries()].filter(([id, source]) => fromById.has(id) && fromById.get(id)?.sourceHash !== source.sourceHash).map(([id]) => id),
        removed: [...fromById.keys()].filter((id) => !toById.has(id)),
      },
      changedSections: Array.isArray(to.metadata?.changedSections) ? to.metadata.changedSections.map(String) : [],
      preservedSections: Array.isArray(to.metadata?.preservedSections) ? to.metadata.preservedSections.map(String) : [],
    }
  }

  async getArtifact(notebookId: string, artifactId: string): Promise<{ notebook: AlixNotebook; artifact: NotebookArtifact } | null> {
    const notebook = await this.get(notebookId)
    if (!notebook) return null
    const artifact = notebook.artifacts.find((item) => item.id === artifactId)
    return artifact ? { notebook, artifact } : null
  }

  async ask(id: string, question: string, limit = 10, researchWeb = true): Promise<NotebookArtifact> {
    const notebook = await this.get(id)
    if (!notebook) throw new Error('Notebook nao encontrado.')
    const { context, citations } = await this.buildCorpusContext(notebook, question, normalizeLimit(limit, 10, 20), researchWeb)
    if (!context) throw new Error('Nenhuma fonte utilizável foi encontrada. Selecione um cliente, adicione documentos ou habilite a pesquisa web.')

    const result = await runOpenAI([
      {
        role: 'system',
        content:
          'Responda como ALIX Notebook. Use somente as fontes fornecidas. Cite cada afirmação material com [S1], [S2]. Diferencie o que vem do sistema ALETIS de informação pública web. Se as fontes não sustentarem a resposta, declare a lacuna e a próxima evidência necessária.',
      },
      {
        role: 'user',
        content: `Pergunta: ${question}\n\nFontes:\n${context}`,
      },
    ], {
      model: getModelForRole('deal_analyzer'),
      maxTokens: 3_000,
      reasoning: { effort: 'xhigh', summary: 'auto', mode: 'pro' },
      metadata: {
        workflow: 'alix.notebook.ask',
        ...(notebook.clienteId ? { clienteId: notebook.clienteId } : {}),
      },
    })

    const artifactId = randomUUID()
    const sourceSnapshot = snapshotFromCitations(citations)
    const artifact: NotebookArtifact = {
      id: artifactId,
      lineageId: artifactId,
      version: 1,
      kind: 'briefing',
      title: question.slice(0, 120),
      markdown: removeUnknownCitationMarkers(result.text, new Set(citations.map((citation) => citation.id))),
      citations,
      sourceSnapshot,
      sourceSnapshotHash: contentHash(sourceSnapshot),
      createdAt: nowIso(),
      metadata: {
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
      },
    }
    notebook.artifacts.unshift(artifact)
    await this.persist(notebook)
    auditAsync({
      ator: 'alix-notebook',
      acao: 'ask',
      recurso: `alix_notebook:${notebook.id}`,
      dadosDepois: { artifactId: artifact.id, citations: citations.length },
    })
    return artifact
  }
}

let singleton: AlixNotebookService | null = null

export function getAlixNotebookService(): AlixNotebookService {
  if (singleton) return singleton
  singleton = new AlixNotebookService(join(process.cwd(), 'storage', 'alix-notebooks'))
  return singleton
}

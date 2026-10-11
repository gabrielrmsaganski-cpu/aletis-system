/**
 * PortalStore — store leve em memória para entidades novas do Portal:
 * pendências de documentos e uploads do cliente. Persistência durável
 * via PG (tabelas portal_documento_pendente e portal_upload) será
 * plugada em commit posterior; o contrato exposto aqui não muda.
 *
 * Garantias atuais:
 *   - Acesso por clienteId é O(1) via Map<string, Bucket>.
 *   - Eventos de auditoria mantêm os últimos 200 por cliente.
 */

export interface DocumentoPendencia {
  id: string
  clienteId: string
  titulo: string
  descricao?: string
  categoria: 'fiscal' | 'contrato' | 'identidade' | 'patrimonio' | 'agro' | 'outros'
  obrigatorio: boolean
  status: 'pendente' | 'enviado' | 'aprovado' | 'rejeitado' | 'cancelado'
  uploadId?: string
  solicitadoPor?: string
  solicitadoEm: string
  enviadoEm?: string
  revisadoEm?: string
  observacao?: string
  prioridade?: 'normal' | 'alta' | 'urgente'
  prazo?: string | null
  tipoDocumento?: string | null
  updatedAt?: string
  metadata?: Record<string, unknown>
}

export interface UploadCliente {
  id: string
  clienteId: string
  pendenciaId?: string
  nomeOriginal: string
  nomeStorage: string
  mime: string
  tamanho: number
  sha256?: string
  categoria?: string
  enviadoPor: 'cliente' | 'consultor'
  enviadoEm: string
  url?: string // URL relativa para download
  versao?: number | null
  metadata?: Record<string, unknown>
}

export interface PortalEvento {
  id: number
  clienteId: string
  tipo:
    | 'login'
    | 'login_falhou'
    | 'logout'
    | 'magic_solicitado'
    | 'magic_consumido'
    | 'reset_solicitado'
    | 'reset_concluido'
    | 'senha_alterada'
    | 'documento_enviado'
    | 'mensagem_enviada'
    | 'doc_visualizado'
    | 'pendencia_criada'
    | 'pendencia_resolvida'
    | 'pendencia_atualizada'
    | 'pendencia_cancelada'
  canal?: 'web' | 'mobile' | 'magic' | 'consultor'
  ip?: string
  userAgent?: string
  detalhes?: Record<string, unknown>
  criadoEm: string
}

interface Bucket {
  pendencias: Map<string, DocumentoPendencia>
  uploads: Map<string, UploadCliente>
  eventos: PortalEvento[]
}

const BY_CLIENTE = new Map<string, Bucket>()
let _eventoSeq = 1

function bucket(clienteId: string): Bucket {
  let b = BY_CLIENTE.get(clienteId)
  if (!b) {
    b = { pendencias: new Map(), uploads: new Map(), eventos: [] }
    BY_CLIENTE.set(clienteId, b)
  }
  return b
}

/** Espelho de compatibilidade: chamar somente após uma transação já confirmada. */
export function cachePortalPendencia(value: DocumentoPendencia): void {
  bucket(value.clienteId).pendencias.set(value.id, structuredClone(value))
}
export function cachePortalUpload(value: UploadCliente): void {
  bucket(value.clienteId).uploads.set(value.id, structuredClone(value))
}
export function cachePortalEvento(value: PortalEvento): void {
  const events = bucket(value.clienteId).eventos
  const index = events.findIndex(event => event.id === value.id)
  if (index >= 0) events[index] = structuredClone(value)
  else events.push(structuredClone(value))
  if (events.length > 200) events.splice(0, events.length - 200)
  _eventoSeq = Math.max(_eventoSeq, value.id + 1)
}

/* ── Pendências ────────────────────────────────────────────── */

export function listarPendencias(clienteId: string): DocumentoPendencia[] {
  const b = BY_CLIENTE.get(clienteId)
  if (!b) return []
  return Array.from(b.pendencias.values()).sort((a, z) =>
    a.solicitadoEm.localeCompare(z.solicitadoEm)
  )
}

export function criarPendencia(p: Omit<DocumentoPendencia, 'id' | 'solicitadoEm' | 'status'> & {
  status?: DocumentoPendencia['status']
}): DocumentoPendencia {
  const id = `pd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const novo: DocumentoPendencia = {
    ...p,
    id,
    status: p.status || 'pendente',
    solicitadoEm: new Date().toISOString(),
  }
  bucket(p.clienteId).pendencias.set(id, novo)
  // Dual-write PG (fire-and-forget)
  void import('../db/PortalRepository.js').then((m) => m.dbUpsertPendencia({
    id: novo.id,
    clienteId: novo.clienteId,
    titulo: novo.titulo,
    descricao: novo.descricao ?? null,
    categoria: novo.categoria ?? null,
    obrigatorio: novo.obrigatorio,
    status: novo.status,
    uploadId: novo.uploadId ?? null,
    solicitadoPor: novo.solicitadoPor ?? null,
    solicitadoEm: new Date(novo.solicitadoEm),
  })).catch(() => {})
  return novo
}

export function atualizarPendencia(
  clienteId: string,
  pendenciaId: string,
  patch: Partial<Pick<DocumentoPendencia, 'status' | 'uploadId' | 'enviadoEm' | 'revisadoEm' | 'observacao'>>
): DocumentoPendencia | null {
  const b = BY_CLIENTE.get(clienteId)
  if (!b) return null
  const cur = b.pendencias.get(pendenciaId)
  if (!cur) return null
  const upd = { ...cur, ...patch }
  b.pendencias.set(pendenciaId, upd)
  void import('../db/PortalRepository.js').then((m) => m.dbUpsertPendencia({
    id: upd.id,
    clienteId: upd.clienteId,
    titulo: upd.titulo,
    descricao: upd.descricao ?? null,
    categoria: upd.categoria ?? null,
    obrigatorio: upd.obrigatorio,
    status: upd.status,
    uploadId: upd.uploadId ?? null,
    solicitadoPor: upd.solicitadoPor ?? null,
    solicitadoEm: new Date(upd.solicitadoEm),
    enviadoEm: upd.enviadoEm ? new Date(upd.enviadoEm) : null,
    revisadoEm: upd.revisadoEm ? new Date(upd.revisadoEm) : null,
    observacao: upd.observacao ?? null,
  })).catch(() => {})
  return upd
}

export function removerPendencia(clienteId: string, pendenciaId: string): boolean {
  const b = BY_CLIENTE.get(clienteId)
  if (!b) return false
  const ok = b.pendencias.delete(pendenciaId)
  if (ok) void import('../db/PortalRepository.js').then((m) => m.dbDeletePendencia(pendenciaId)).catch(() => {})
  return ok
}

/* ── Uploads ───────────────────────────────────────────────── */

export function listarUploads(clienteId: string): UploadCliente[] {
  const b = BY_CLIENTE.get(clienteId)
  if (!b) return []
  return Array.from(b.uploads.values()).sort((a, z) =>
    z.enviadoEm.localeCompare(a.enviadoEm)
  )
}

export function adicionarUpload(u: Omit<UploadCliente, 'id' | 'enviadoEm'>): UploadCliente {
  const id = `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const novo: UploadCliente = {
    ...u,
    id,
    enviadoEm: new Date().toISOString(),
  }
  bucket(u.clienteId).uploads.set(id, novo)
  void import('../db/PortalRepository.js').then((m) => m.dbInsertUpload({
    id: novo.id,
    clienteId: novo.clienteId,
    pendenciaId: novo.pendenciaId ?? null,
    nomeOriginal: novo.nomeOriginal,
    nomeStorage: novo.nomeStorage,
    mime: novo.mime,
    tamanho: novo.tamanho,
    sha256: novo.sha256 ?? null,
    categoria: novo.categoria ?? null,
    enviadoPor: novo.enviadoPor,
    enviadoEm: new Date(novo.enviadoEm),
  })).catch(() => {})
  return novo
}

export function buscarUpload(clienteId: string, uploadId: string): UploadCliente | null {
  return BY_CLIENTE.get(clienteId)?.uploads.get(uploadId) ?? null
}

/* ── Eventos / auditoria ───────────────────────────────────── */

export function registrarEvento(
  e: Omit<PortalEvento, 'id' | 'criadoEm'> & { criadoEm?: string }
): PortalEvento {
  const ev: PortalEvento = {
    ...e,
    id: _eventoSeq++,
    criadoEm: e.criadoEm || new Date().toISOString(),
  }
  const b = bucket(e.clienteId)
  b.eventos.push(ev)
  // Mantém até 200 últimos por cliente (rolling window)
  if (b.eventos.length > 200) b.eventos.splice(0, b.eventos.length - 200)
  // PG é append-only — toda auditoria importa
  void import('../db/PortalRepository.js').then((m) => m.dbInsertEvento({
    clienteId: ev.clienteId,
    tipo: ev.tipo,
    canal: ev.canal ?? null,
    ip: ev.ip ?? null,
    userAgent: ev.userAgent ?? null,
    detalhes: ev.detalhes ?? null,
    criadoEm: new Date(ev.criadoEm),
  })).catch(() => {})
  return ev
}

/**
 * Hidrata os Maps em memória a partir do PG no boot.
 * Restaura pendências e uploads após restart.
 */
export async function hydratePortalStoreFromPg(): Promise<{ pendencias: number; uploads: number }> {
  try {
    const m = await import('../db/PortalRepository.js')
    const [pends, ups] = await Promise.all([m.dbLoadAllPendencias(), m.dbLoadAllUploads()])
    for (const r of pends) {
      const b = bucket(r.clienteId)
      b.pendencias.set(r.id, {
        id: r.id,
        clienteId: r.clienteId,
        titulo: r.titulo,
        descricao: r.descricao ?? undefined,
        categoria: (r.categoria ?? 'outros') as DocumentoPendencia['categoria'],
        obrigatorio: r.obrigatorio,
        status: r.status,
        uploadId: r.uploadId ?? undefined,
        solicitadoPor: r.solicitadoPor ?? undefined,
        solicitadoEm: r.solicitadoEm.toISOString(),
        enviadoEm: r.enviadoEm?.toISOString(),
        revisadoEm: r.revisadoEm?.toISOString(),
        observacao: r.observacao ?? undefined,
        prioridade: r.prioridade ?? 'normal',
        prazo: r.prazo ?? null,
        tipoDocumento: r.tipoDocumento ?? null,
        updatedAt: (r.updatedAt ?? r.revisadoEm ?? r.enviadoEm ?? r.solicitadoEm).toISOString(),
        metadata: r.metadata ?? {},
      })
    }
    for (const r of ups) {
      const b = bucket(r.clienteId)
      b.uploads.set(r.id, {
        id: r.id,
        clienteId: r.clienteId,
        pendenciaId: r.pendenciaId ?? undefined,
        nomeOriginal: r.nomeOriginal,
        nomeStorage: r.nomeStorage,
        mime: r.mime,
        tamanho: r.tamanho,
        sha256: r.sha256 ?? undefined,
        categoria: r.categoria ?? undefined,
        enviadoPor: r.enviadoPor,
        enviadoEm: r.enviadoEm.toISOString(),
        url: `/api/portal/uploads/${r.id}`,
        metadata: r.metadata ?? {},
        versao: typeof r.metadata?.requestVersion === 'number' ? r.metadata.requestVersion : null,
      })
    }
    return { pendencias: pends.length, uploads: ups.length }
  } catch {
    return { pendencias: 0, uploads: 0 }
  }
}

export function listarEventos(clienteId: string, limite = 50): PortalEvento[] {
  const b = BY_CLIENTE.get(clienteId)
  if (!b) return []
  return b.eventos.slice(-limite).reverse()
}

/* ── Para testes ───────────────────────────────────────────── */

export function _resetStore(): void {
  BY_CLIENTE.clear()
  _eventoSeq = 1
}

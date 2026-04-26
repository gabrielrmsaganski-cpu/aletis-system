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
  status: 'pendente' | 'enviado' | 'aprovado' | 'rejeitado'
  uploadId?: string
  solicitadoPor?: string
  solicitadoEm: string
  enviadoEm?: string
  revisadoEm?: string
  observacao?: string
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
  return upd
}

export function removerPendencia(clienteId: string, pendenciaId: string): boolean {
  const b = BY_CLIENTE.get(clienteId)
  if (!b) return false
  return b.pendencias.delete(pendenciaId)
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
  return ev
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

// ============================================================
// ALETIS — Alix Memory Service (Wave 9 — MEMORY)
//
// Armazena, lê e mescla memória por cliente em Markdown.
// Cada cliente tem seu próprio arquivo em
//   apps/api/storage/alix-memory/{clienteId}.md
//
// Formato do arquivo
// ──────────────────
// Front-matter YAML-like (campos simples) + headings Markdown:
//
//   ---
//   clienteId: paulo-luciano
//   clienteNome: Paulo Luciano
//   atualizadoEm: 2026-04-22T00:00:00.000Z
//   ---
//   # Memória da Alix — Paulo Luciano
//
//   ## Perfil
//   - …
//
//   ## Dívidas ativas
//   - …
//
//   ## Decisões & preferências
//   - …
//
//   ## Próximas ações
//   - …
//
//   ## Alertas
//   - …
//
//   ## Histórico de interações relevantes
//   - [2026-04-22T…] …
//
// Design
// ──────
// • Persistência é arquivo plano (sem DB) — fácil de versionar,
//   revisar manualmente e injetar em system prompts.
// • `upsert()` faz merge **por append** em listas (não sobrescreve).
// • `render()` trunca em ~3500 chars preservando seções principais
//   pra caber em budget de system prompt.
// • Parse é tolerante: regex por headings, sem dependências externas.
// ============================================================

import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'node:crypto'
import { isPgEnabled } from '../../../db/client.js'
import { getAlixMemory, listAlixMemories, updateAlixMemoryStrict, deleteAlixMemory, type MemoriaLike } from '../../../db/AlixMemoryRepository.js'
import type {
  MemoriaCliente,
  MemoriaHistoricoItem,
  MemoriaListItem,
  SecaoNota,
} from './types.js'

const STORAGE_DIR = join(process.cwd(), 'storage', 'alix-memory')
const MAX_RENDER_CHARS = 3500

/** Caractere de segurança para clienteId (evita path traversal). */
function sanitizeClienteId(id: string): string {
  const limpo = id.replace(/[^a-zA-Z0-9._-]/g, '_').trim()
  if (!limpo) throw new Error('clienteId inválido')
  return limpo
}

function filePathFor(clienteId: string): string {
  return join(STORAGE_DIR, `${sanitizeClienteId(clienteId)}.md`)
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true })
}

/** Cria memória vazia padrão. */
function emptyMemoria(clienteId: string, clienteNome: string): MemoriaCliente {
  return {
    clienteId,
    clienteNome,
    atualizadoEm: new Date().toISOString(),
    perfil: [],
    dividasAtivas: [],
    decisoes: [],
    proximasAcoes: [],
    alertas: [],
    historico: [],
  }
}

// ── Serialização ────────────────────────────────────────────

function escapeBullet(texto: string): string {
  // Evita que um texto com newlines quebre o parser por seção.
  return texto.replace(/\r?\n/g, ' ').trim()
}

export function serializar(m: MemoriaCliente): string {
  const lines: string[] = []
  lines.push('---')
  lines.push(`clienteId: ${m.clienteId}`)
  lines.push(`clienteNome: ${m.clienteNome}`)
  lines.push(`atualizadoEm: ${m.atualizadoEm}`)
  lines.push('---')
  lines.push(`# Memória da Alix — ${m.clienteNome}`)
  lines.push('')
  lines.push('## Perfil')
  if (m.perfil.length === 0) lines.push('- _(vazio)_')
  else for (const it of m.perfil) lines.push(`- ${escapeBullet(it)}`)
  lines.push('')
  lines.push('## Dívidas ativas')
  if (m.dividasAtivas.length === 0) lines.push('- _(vazio)_')
  else for (const it of m.dividasAtivas) lines.push(`- ${escapeBullet(it)}`)
  lines.push('')
  lines.push('## Decisões & preferências')
  if (m.decisoes.length === 0) lines.push('- _(vazio)_')
  else for (const it of m.decisoes) lines.push(`- ${escapeBullet(it)}`)
  lines.push('')
  lines.push('## Próximas ações')
  if (m.proximasAcoes.length === 0) lines.push('- _(vazio)_')
  else for (const it of m.proximasAcoes) lines.push(`- ${escapeBullet(it)}`)
  lines.push('')
  lines.push('## Alertas')
  if (m.alertas.length === 0) lines.push('- _(vazio)_')
  else for (const it of m.alertas) lines.push(`- ${escapeBullet(it)}`)
  lines.push('')
  lines.push('## Histórico de interações relevantes')
  if (m.historico.length === 0) lines.push('- _(vazio)_')
  else
    for (const it of m.historico)
      lines.push(`- [${it.data}] ${escapeBullet(it.texto)}`)
  lines.push('')
  return lines.join('\n')
}

// ── Parse ───────────────────────────────────────────────────

const HEADINGS: Record<string, keyof MemoriaCliente> = {
  'Perfil': 'perfil',
  'Dívidas ativas': 'dividasAtivas',
  'Decisões & preferências': 'decisoes',
  'Próximas ações': 'proximasAcoes',
  'Alertas': 'alertas',
  'Histórico de interações relevantes': 'historico',
}

export function parse(raw: string): MemoriaCliente | null {
  if (!raw || typeof raw !== 'string') return null

  // Front-matter
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  let clienteId = ''
  let clienteNome = ''
  let atualizadoEm = ''
  let body = raw
  if (fmMatch) {
    const fm = fmMatch[1]
    for (const line of fm.split(/\r?\n/)) {
      const m = line.match(/^([a-zA-Z]+):\s*(.+)$/)
      if (!m) continue
      const k = m[1].trim()
      const v = m[2].trim()
      if (k === 'clienteId') clienteId = v
      else if (k === 'clienteNome') clienteNome = v
      else if (k === 'atualizadoEm') atualizadoEm = v
    }
    body = raw.slice(fmMatch[0].length)
  }

  if (!clienteId) return null

  const mem: MemoriaCliente = emptyMemoria(clienteId, clienteNome || clienteId)
  mem.atualizadoEm = atualizadoEm || mem.atualizadoEm

  // Split by ## headings
  const sections = body.split(/^##\s+/m)
  for (const sec of sections) {
    const firstLineEnd = sec.indexOf('\n')
    if (firstLineEnd < 0) continue
    const heading = sec.slice(0, firstLineEnd).trim()
    const key = HEADINGS[heading]
    if (!key) continue
    const bulletLines = sec
      .slice(firstLineEnd + 1)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim())
      .filter((l) => l.length > 0 && l !== '_(vazio)_')

    if (key === 'historico') {
      const items: MemoriaHistoricoItem[] = []
      for (const ln of bulletLines) {
        const dataMatch = ln.match(/^\[([^\]]+)\]\s*(.*)$/)
        if (dataMatch) {
          items.push({ data: dataMatch[1].trim(), texto: dataMatch[2].trim() })
        } else {
          items.push({ data: new Date().toISOString(), texto: ln })
        }
      }
      mem.historico = items
    } else {
      ;(mem[key] as string[]) = bulletLines
    }
  }

  return mem
}

// ── Merge helpers ───────────────────────────────────────────

function mergeLista(base: string[], novos: string[] | undefined): string[] {
  if (!novos || novos.length === 0) return base
  const seen = new Set(base.map((s) => s.trim().toLowerCase()))
  const out = [...base]
  for (const it of novos) {
    const norm = (it || '').trim()
    if (!norm) continue
    const key = norm.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(norm)
  }
  return out
}

function mergeHistorico(
  base: MemoriaHistoricoItem[],
  novos: MemoriaHistoricoItem[] | undefined,
): MemoriaHistoricoItem[] {
  if (!novos || novos.length === 0) return base
  const seen = new Set(
    base.map((h) => `${h.data}::${h.texto.trim().toLowerCase()}`),
  )
  const out = [...base]
  for (const h of novos) {
    const data = (h?.data || new Date().toISOString()).trim()
    const texto = (h?.texto || '').trim()
    if (!texto) continue
    const key = `${data}::${texto.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ data, texto })
  }
  return out
}

// ── Service ─────────────────────────────────────────────────

export class AlixMemoryService {
  private static instance: AlixMemoryService | null = null

  static getInstance(): AlixMemoryService {
    if (!this.instance) this.instance = new AlixMemoryService()
    return this.instance
  }

  /** Lê memória do cliente. Retorna null se arquivo não existir. */
  async get(clienteId: string): Promise<MemoriaCliente | null> {
    if (isPgEnabled()) return await getAlixMemory(clienteId) as unknown as MemoriaCliente | null
    const fp = filePathFor(clienteId)
    try {
      const raw = await fs.readFile(fp, 'utf-8')
      return parse(raw)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ENOENT') return null
      throw err
    }
  }

  /**
   * Cria ou atualiza memória fazendo **merge por append** em listas.
   * Campos escalares (clienteNome) são sobrescritos se fornecidos.
   */
  async upsert(
    clienteId: string,
    patch: Partial<MemoriaCliente>,
  ): Promise<MemoriaCliente> {
    const safeId = sanitizeClienteId(clienteId)
    const merge = (existing: MemoriaCliente | null, canonicalId = safeId): MemoriaCliente => {
      const base = existing ?? emptyMemoria(canonicalId, patch.clienteNome || canonicalId)
      return {
        ...base,
        clienteId: canonicalId,
        clienteNome: (patch.clienteNome && patch.clienteNome.trim()) || base.clienteNome || canonicalId,
        atualizadoEm: new Date().toISOString(),
        perfil: mergeLista(base.perfil, patch.perfil),
        dividasAtivas: mergeLista(base.dividasAtivas, patch.dividasAtivas),
        decisoes: mergeLista(base.decisoes, patch.decisoes),
        proximasAcoes: mergeLista(base.proximasAcoes, patch.proximasAcoes),
        alertas: mergeLista(base.alertas, patch.alertas),
        historico: mergeHistorico(base.historico, patch.historico),
      }
    }
    // O banco confirma primeiro; arquivos são espelhos, nunca alternativa silenciosa a erro de PG.
    const merged = isPgEnabled()
      ? await updateAlixMemoryStrict(safeId, (previous, canonicalId) => merge(previous as unknown as MemoriaCliente | null, canonicalId) as unknown as MemoriaLike) as unknown as MemoriaCliente
      : merge(await this.get(safeId))
    await ensureDir()
    const destination = filePathFor(merged.clienteId)
    const temporary = `${destination}.${randomUUID()}.tmp`
    try { await fs.writeFile(temporary, serializar(merged), { encoding: 'utf-8', mode: 0o600 }); await fs.rename(temporary, destination) }
    finally { await fs.rm(temporary, { force: true }) }
    return merged
  }

  /** Append rápido em uma das seções listáveis. */
  async appendNota(
    clienteId: string,
    secao: SecaoNota,
    texto: string,
  ): Promise<void> {
    const t = (texto || '').trim()
    if (!t) return

    const nowIso = new Date().toISOString()
    const patch: Partial<MemoriaCliente> = {}
    switch (secao) {
      case 'proximas-acoes':
        patch.proximasAcoes = [t]
        break
      case 'alertas':
        patch.alertas = [t]
        break
      case 'decisoes':
        patch.decisoes = [t]
        break
      case 'historico':
        patch.historico = [{ data: nowIso, texto: t }]
        break
      default: {
        const _exhaust: never = secao
        void _exhaust
        throw new Error(`Seção inválida: ${String(secao)}`)
      }
    }
    await this.upsert(clienteId, patch)
  }

  /** Remove o arquivo de memória do cliente. Idempotente. */
  async delete(clienteId: string): Promise<void> {
    if (isPgEnabled()) await deleteAlixMemory(clienteId)
    const fp = filePathFor(clienteId)
    try {
      await fs.unlink(fp)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code !== 'ENOENT') throw err
    }
  }

  /**
   * Render Markdown pronto pra system prompt. Trunca em ~3500 chars
   * preservando headings e cortando bullets do histórico primeiro.
   */
  async render(clienteId: string): Promise<string> {
    const mem = await this.get(clienteId)
    if (!mem) return ''
    let md = serializar(mem)
    if (md.length <= MAX_RENDER_CHARS) return md

    // Tenta truncar histórico para caber.
    const copia: MemoriaCliente = {
      ...mem,
      historico: [...mem.historico],
    }
    while (md.length > MAX_RENDER_CHARS && copia.historico.length > 0) {
      copia.historico.shift()
      md = serializar(copia)
    }
    if (md.length <= MAX_RENDER_CHARS) return md

    // Fallback: hard-cut preservando headings principais.
    return md.slice(0, MAX_RENDER_CHARS - 3) + '...'
  }

  /** Lista metadados das memórias existentes. */
  async list(): Promise<MemoriaListItem[]> {
    if (isPgEnabled()) return (await listAlixMemories()).map(memory => ({ clienteId: memory.clienteId, clienteNome: memory.clienteNome, atualizadoEm: memory.atualizadoEm, bytes: Buffer.byteLength(serializar(memory as unknown as MemoriaCliente), 'utf-8') }))
    await ensureDir()
    const entries = await fs.readdir(STORAGE_DIR)
    const out: MemoriaListItem[] = []
    for (const file of entries) {
      if (!file.endsWith('.md')) continue
      const fp = join(STORAGE_DIR, file)
      try {
        const raw = await fs.readFile(fp, 'utf-8')
        const parsed = parse(raw)
        const stat = await fs.stat(fp)
        if (parsed) {
          out.push({
            clienteId: parsed.clienteId,
            clienteNome: parsed.clienteNome,
            atualizadoEm: parsed.atualizadoEm,
            bytes: stat.size,
          })
        }
      } catch {
        // ignora arquivos malformados — não derruba listagem
      }
    }
    out.sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1))
    return out
  }
}

export function getAlixMemoryService(): AlixMemoryService {
  return AlixMemoryService.getInstance()
}

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from 'fs'
import { join } from 'path'
import type { ContactOutcome, ContactOutcomeTipo, LeadFeedback, LeadFull } from './types'

/**
 * Repositório de leads enriquecidos e excluídos. Persistência em disco para
 * que o estado sobreviva a restarts do servidor.
 *
 * Layout em `storage/prospeccao/`:
 *  • enriched/<cpfCnpjClean>.json  — um arquivo por lead (ACID via rename)
 *  • blacklist.json                — { excluidos: BlacklistEntry[] }
 *  • contatos.json                 — { outcomes: ContactOutcome[] }
 *
 * Índices mantidos em memória (Map + Set) — reconstruídos a partir do disco
 * ao iniciar o processo.
 */

export interface BlacklistEntry {
  cpfCnpj: string
  cpfCnpjClean: string
  motivo: string
  excluidoEm: string
}

interface BlacklistFile {
  excluidos: BlacklistEntry[]
}

interface ContatosFile {
  outcomes: ContactOutcome[]
}

/** Ajuste ao score aplicado a cada tipo de outcome. Positivos = priorizar. */
const AJUSTE_POR_TIPO: Record<ContactOutcomeTipo, number> = {
  sucesso: 20,
  interessado: 12,
  retornar: 4,
  recusou: -30,
  ja_regularizou: -25,
  nao_agro: -30,
  fora_target: -20,
}

export class LeadsRepository {
  private readonly enrichedDir: string
  private readonly blacklistFile: string
  private readonly contatosFile: string

  /** Cache em memória — cpfCnpjClean → lead enriquecido completo. */
  private cache = new Map<string, LeadFull>()
  /** Blacklist indexada por cpfCnpjClean → entrada. */
  private blacklist = new Map<string, BlacklistEntry>()
  /** Contatos por cpfCnpjClean → lista cronológica. */
  private contatos = new Map<string, ContactOutcome[]>()

  constructor(storageDir: string) {
    this.enrichedDir = join(storageDir, 'enriched')
    this.blacklistFile = join(storageDir, 'blacklist.json')
    this.contatosFile = join(storageDir, 'contatos.json')
    mkdirSync(this.enrichedDir, { recursive: true })
    this.loadAll()
  }

  // ─── Enriched ─────────────────────────────────────────────

  saveEnriched(lead: LeadFull): void {
    const key = lead.cpfCnpjClean
    this.cache.set(key, lead)
    const file = join(this.enrichedDir, `${key}.json`)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(lead))
    renameSync(tmp, file)
  }

  getEnriched(cpfCnpjClean: string): LeadFull | null {
    return this.cache.get(cpfCnpjClean) || null
  }

  hasEnriched(cpfCnpjClean: string): boolean {
    return this.cache.has(cpfCnpjClean)
  }

  getAllEnriched(): LeadFull[] {
    return Array.from(this.cache.values())
  }

  countEnriched(): number {
    return this.cache.size
  }

  /** Remove enrichment do disco e do cache — usado ao excluir lead. */
  deleteEnriched(cpfCnpjClean: string): void {
    this.cache.delete(cpfCnpjClean)
    const file = join(this.enrichedDir, `${cpfCnpjClean}.json`)
    if (existsSync(file)) {
      try {
        unlinkSync(file)
      } catch {
        // best-effort
      }
    }
  }

  // ─── Blacklist ────────────────────────────────────────────

  addToBlacklist(lead: { cpfCnpj: string; cpfCnpjClean: string }, motivo: string): BlacklistEntry {
    const entry: BlacklistEntry = {
      cpfCnpj: lead.cpfCnpj,
      cpfCnpjClean: lead.cpfCnpjClean,
      motivo: motivo || 'sem motivo informado',
      excluidoEm: new Date().toISOString(),
    }
    this.blacklist.set(lead.cpfCnpjClean, entry)
    this.persistBlacklist()
    return entry
  }

  removeFromBlacklist(cpfCnpjClean: string): boolean {
    const removed = this.blacklist.delete(cpfCnpjClean)
    if (removed) this.persistBlacklist()
    return removed
  }

  isBlacklisted(cpfCnpjClean: string): boolean {
    return this.blacklist.has(cpfCnpjClean)
  }

  getBlacklistEntry(cpfCnpjClean: string): BlacklistEntry | null {
    return this.blacklist.get(cpfCnpjClean) || null
  }

  getBlacklist(): BlacklistEntry[] {
    return Array.from(this.blacklist.values())
  }

  // ─── Contatos (feedback loop) ─────────────────────────────

  /**
   * Registra um contato/outcome. Idempotência não é garantida — cada chamada
   * vira uma linha no histórico. Persistido imediatamente.
   */
  addContato(outcome: Omit<ContactOutcome, 'registradoEm'> & { registradoEm?: string }): ContactOutcome {
    const entry: ContactOutcome = {
      ...outcome,
      registradoEm: outcome.registradoEm || new Date().toISOString(),
    }
    const lista = this.contatos.get(entry.cpfCnpjClean) || []
    lista.push(entry)
    this.contatos.set(entry.cpfCnpjClean, lista)
    this.persistContatos()
    return entry
  }

  getContatos(cpfCnpjClean: string): ContactOutcome[] {
    return (this.contatos.get(cpfCnpjClean) || []).slice()
  }

  allContatos(): ContactOutcome[] {
    const out: ContactOutcome[] = []
    for (const arr of this.contatos.values()) out.push(...arr)
    return out.sort((a, b) => b.registradoEm.localeCompare(a.registradoEm))
  }

  /**
   * Calcula o feedback consolidado de um lead a partir do histórico.
   * - `ajusteScore` é a soma dos ajustes decaídos pelo tempo (decaimento
   *    ~6 meses — contatos antigos pesam menos).
   * - `reengajar` é true quando o último outcome é 'retornar' OU 'interessado'
   *    e passou o cooldown adequado (14d para retornar, 30d para interessado).
   */
  getFeedback(cpfCnpjClean: string): LeadFeedback | null {
    const lista = this.contatos.get(cpfCnpjClean)
    if (!lista || lista.length === 0) return null
    const ordenada = lista.slice().sort((a, b) => a.registradoEm.localeCompare(b.registradoEm))
    const ultimo = ordenada[ordenada.length - 1]
    const ultimoContatoEm = ultimo.registradoEm
    const agora = Date.now()

    // Decaimento linear: peso 1.0 nos últimos 30d, 0 depois de 180d
    let ajuste = 0
    for (const c of ordenada) {
      const dias = Math.max(0, (agora - new Date(c.registradoEm).getTime()) / 86_400_000)
      const peso = dias <= 30 ? 1 : dias >= 180 ? 0 : 1 - (dias - 30) / 150
      ajuste += AJUSTE_POR_TIPO[c.tipo] * peso
    }
    ajuste = Math.max(-30, Math.min(20, Math.round(ajuste)))

    const diasUltimo = Math.floor((agora - new Date(ultimoContatoEm).getTime()) / 86_400_000)
    let reengajar = false
    if (ultimo.tipo === 'retornar' && diasUltimo >= 14) reengajar = true
    else if (ultimo.tipo === 'interessado' && diasUltimo >= 30) reengajar = true

    return {
      totalContatos: lista.length,
      ultimoOutcome: ultimo.tipo,
      ultimoContatoEm,
      ajusteScore: ajuste,
      reengajar,
    }
  }

  // ─── IO ───────────────────────────────────────────────────

  private loadAll(): void {
    // Enriched
    try {
      const files = readdirSync(this.enrichedDir).filter((f) => f.endsWith('.json'))
      for (const f of files) {
        try {
          const full = readFileSync(join(this.enrichedDir, f), 'utf8')
          const lead = JSON.parse(full) as LeadFull
          if (lead?.cpfCnpjClean) this.cache.set(lead.cpfCnpjClean, lead)
        } catch (err) {
          console.warn(`[LeadsRepository] falha lendo ${f}`, err)
        }
      }
    } catch {
      // enrichedDir recém-criado, ok
    }

    // Blacklist
    if (existsSync(this.blacklistFile)) {
      try {
        const raw = readFileSync(this.blacklistFile, 'utf8')
        const data = JSON.parse(raw) as BlacklistFile
        for (const e of data.excluidos || []) {
          this.blacklist.set(e.cpfCnpjClean, e)
        }
      } catch (err) {
        console.warn('[LeadsRepository] falha lendo blacklist', err)
      }
    }

    // Contatos
    if (existsSync(this.contatosFile)) {
      try {
        const raw = readFileSync(this.contatosFile, 'utf8')
        const data = JSON.parse(raw) as ContatosFile
        for (const c of data.outcomes || []) {
          const arr = this.contatos.get(c.cpfCnpjClean) || []
          arr.push(c)
          this.contatos.set(c.cpfCnpjClean, arr)
        }
      } catch (err) {
        console.warn('[LeadsRepository] falha lendo contatos', err)
      }
    }
  }

  private persistBlacklist(): void {
    const data: BlacklistFile = { excluidos: Array.from(this.blacklist.values()) }
    const tmp = `${this.blacklistFile}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, this.blacklistFile)
  }

  private persistContatos(): void {
    const outcomes: ContactOutcome[] = []
    for (const arr of this.contatos.values()) outcomes.push(...arr)
    const data: ContatosFile = { outcomes }
    const tmp = `${this.contatosFile}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, this.contatosFile)
  }
}

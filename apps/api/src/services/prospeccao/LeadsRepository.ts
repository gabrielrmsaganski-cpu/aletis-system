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
import type { LeadFull } from './types'

/**
 * Repositório de leads enriquecidos e excluídos. Persistência em disco para
 * que o estado sobreviva a restarts do servidor.
 *
 * Layout em `storage/prospeccao/`:
 *  • enriched/<cpfCnpjClean>.json  — um arquivo por lead (ACID via rename)
 *  • blacklist.json                — { excluidos: BlacklistEntry[] }
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

export class LeadsRepository {
  private readonly enrichedDir: string
  private readonly blacklistFile: string

  /** Cache em memória — cpfCnpjClean → lead enriquecido completo. */
  private cache = new Map<string, LeadFull>()
  /** Blacklist indexada por cpfCnpjClean → entrada. */
  private blacklist = new Map<string, BlacklistEntry>()

  constructor(storageDir: string) {
    this.enrichedDir = join(storageDir, 'enriched')
    this.blacklistFile = join(storageDir, 'blacklist.json')
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
  }

  private persistBlacklist(): void {
    const data: BlacklistFile = { excluidos: Array.from(this.blacklist.values()) }
    const tmp = `${this.blacklistFile}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, this.blacklistFile)
  }
}

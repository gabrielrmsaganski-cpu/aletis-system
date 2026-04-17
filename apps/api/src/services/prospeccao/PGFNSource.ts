import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { LeadRaw } from './types'

interface IndexFile {
  manifest: {
    generatedAt: string
    source: string
    stats: Record<string, number>
    leadsCount: number
  }
  leads: LeadRaw[]
}

/**
 * Carrega o índice agro pré-ingerido do PGFN.
 *
 * O índice é construído offline pelo script `scripts/ingest-pgfn.ts` a partir
 * dos dumps trimestrais (FGTS + Previdenciário + Não Previdenciário).
 */
export class PGFNSource {
  private leads: LeadRaw[] = []
  private byCpfCnpj = new Map<string, LeadRaw>()
  private manifest: IndexFile['manifest'] | null = null
  private loaded = false

  constructor(private readonly storagePath: string) {}

  load(): void {
    if (this.loaded) return
    const path = join(this.storagePath, 'leads-agro.json')
    if (!existsSync(path)) {
      console.warn(`[PGFNSource] Índice não encontrado em ${path}. Execute scripts/ingest-pgfn.ts`)
      this.loaded = true
      return
    }
    const raw = readFileSync(path, 'utf-8')
    const parsed: IndexFile = JSON.parse(raw)
    this.leads = parsed.leads
    this.manifest = parsed.manifest
    for (const l of this.leads) this.byCpfCnpj.set(l.cpfCnpjClean, l)
    this.loaded = true
    console.log(
      `[PGFNSource] ${this.leads.length.toLocaleString()} leads agro carregados (gerado em ${parsed.manifest.generatedAt})`
    )
  }

  all(): LeadRaw[] {
    this.load()
    return this.leads
  }

  find(cpfCnpj: string): LeadRaw | null {
    this.load()
    const clean = cpfCnpj.replace(/[^\d]/g, '')
    return this.byCpfCnpj.get(clean) || null
  }

  getManifest() {
    this.load()
    return this.manifest
  }
}

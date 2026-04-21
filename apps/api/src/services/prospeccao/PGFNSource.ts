import { readFileSync, existsSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import type { LeadRaw } from './types'
import type { LeadSource, LeadSourceManifest } from './sources/LeadSource'

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
 * Fonte principal de leads: índice agro pré-ingerido do PGFN.
 *
 * Construído offline pelo script `scripts/ingest-pgfn.ts` a partir dos
 * dumps trimestrais (FGTS + Previdenciário + Não Previdenciário).
 *
 * Implementa `LeadSource` — consumida pelo `LeadSourceRegistry` junto
 * com outras fontes (CAR, CNPJ agro por CNAE, etc).
 */
export class PGFNSource implements LeadSource {
  readonly fonte = 'PGFN'

  private leads: LeadRaw[] = []
  private byCpfCnpj = new Map<string, LeadRaw>()
  private indexManifest: IndexFile['manifest'] | null = null
  private fileSha256: string | undefined
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
    this.indexManifest = parsed.manifest
    // Hash só pra deteção de re-ingest — barato pois lê arquivo já em memória.
    try {
      this.fileSha256 = createHash('sha256').update(raw).digest('hex')
    } catch {
      this.fileSha256 = undefined
    }
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

  /** Compatibilidade legada — mantém consumidores que ainda chamam getManifest(). */
  getManifest(): IndexFile['manifest'] | null {
    this.load()
    return this.indexManifest
  }

  manifest(): LeadSourceManifest {
    this.load()
    const path = join(this.storagePath, 'leads-agro.json')
    let fileSizeBytes: number | undefined
    try {
      if (existsSync(path)) fileSizeBytes = statSync(path).size
    } catch {
      fileSizeBytes = undefined
    }
    return {
      fonte: this.fonte,
      descricao: 'PGFN Dívida Ativa (FGTS + Prev + Não-Prev) — leads agro pré-ingeridos',
      contagem: this.leads.length,
      lastIngestAt: this.indexManifest?.generatedAt ?? null,
      sha256: this.fileSha256,
      extra: {
        source: this.indexManifest?.source,
        leadsCount: this.indexManifest?.leadsCount,
        stats: this.indexManifest?.stats,
        fileSizeBytes,
      },
    }
  }
}

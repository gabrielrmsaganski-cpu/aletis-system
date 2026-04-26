/**
 * BscService — Balanced Scorecard Agro (Wave 8a).
 *
 * Singleton leve que envelopa o motor puro `calcularBSC` de
 * `@aletis/contabil-calc` e expõe:
 *   - listagem do catálogo (filtrável por perspectiva);
 *   - cálculo a partir do contexto financeiro/operacional;
 *   - persistência opcional append-only por cliente em
 *     `apps/api/storage/bsc/{clienteId}.jsonl` (one snapshot por
 *     invocação — carimbado com `periodo` e `calculadoEm`).
 *
 * Totalmente alinhado com o padrão das demais Waves (Reforma,
 * Funrural, Desenrola).
 */
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  BSC_KPIS,
  calcularBSC,
  listarKpis,
  listarPorPerspectiva,
} from '@aletis/contabil-calc'
import type {
  ContextoBSCCalculo,
  KpiBSCDefinicao,
  PerspectivaBSC,
  ResultadoBSC,
} from '@aletis/shared-types/src/bsc.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Pasta raiz de persistência (append-only JSONL por cliente). */
const STORAGE_DIR = join(__dirname, '..', '..', '..', 'storage', 'bsc')

/** Snapshot persistido em `{clienteId}.jsonl`. */
export interface BscSnapshotRecord {
  clienteId: string
  calculadoEm: string // ISO datetime
  contexto: ContextoBSCCalculo
  resultado: ResultadoBSC
}

export class BscService {
  private static instance: BscService | null = null

  static getInstance(): BscService {
    if (!this.instance) this.instance = new BscService()
    return this.instance
  }

  /** Catálogo completo de KPIs. */
  listarKpis(): KpiBSCDefinicao[] {
    return listarKpis()
  }

  /** Catálogo filtrado por perspectiva. */
  listarPorPerspectiva(p: PerspectivaBSC): KpiBSCDefinicao[] {
    return listarPorPerspectiva(p)
  }

  /** Expõe a lista canônica (referência direta ao array congelado). */
  catalogo(): readonly KpiBSCDefinicao[] {
    return BSC_KPIS
  }

  /** Executa o cálculo puro. */
  calcular(ctx: ContextoBSCCalculo): ResultadoBSC {
    return calcularBSC(ctx)
  }

  /**
   * Calcula e persiste snapshot append-only no JSONL do cliente.
   * Retorna o resultado do cálculo + o record persistido.
   */
  async snapshot(
    clienteId: string,
    ctx: ContextoBSCCalculo,
  ): Promise<{ resultado: ResultadoBSC; record: BscSnapshotRecord }> {
    if (!clienteId || !/^[a-zA-Z0-9_\-.]+$/.test(clienteId)) {
      throw new Error(
        'clienteId inválido: apenas [a-zA-Z0-9_-.] aceito (proteção contra path traversal).',
      )
    }
    const resultado = this.calcular(ctx)
    const record: BscSnapshotRecord = {
      clienteId,
      calculadoEm: new Date().toISOString(),
      contexto: ctx,
      resultado,
    }
    await fs.mkdir(STORAGE_DIR, { recursive: true })
    const file = join(STORAGE_DIR, `${clienteId}.jsonl`)
    await fs.appendFile(file, JSON.stringify(record) + '\n', 'utf-8')

    // Wave-PG-15: dual-write best-effort no Postgres
    void (async () => {
      try {
        const repo = await import('../../db/BscRepository.js')
        await repo.appendBscSnapshot(record as unknown as Parameters<typeof repo.appendBscSnapshot>[0])
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[BscService.snapshot] dual-write PG falhou:', (err as Error).message)
      }
    })()

    return { resultado, record }
  }

  /** Lê todos os snapshots persistidos de um cliente (mais recente por último). */
  async historico(clienteId: string): Promise<BscSnapshotRecord[]> {
    if (!clienteId || !/^[a-zA-Z0-9_\-.]+$/.test(clienteId)) {
      throw new Error('clienteId inválido.')
    }
    const file = join(STORAGE_DIR, `${clienteId}.jsonl`)
    try {
      const txt = await fs.readFile(file, 'utf-8')
      return txt
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as BscSnapshotRecord)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }
}

export function getBscService(): BscService {
  return BscService.getInstance()
}

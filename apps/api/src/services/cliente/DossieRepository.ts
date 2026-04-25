import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import type { DossieAgro } from '@aletis/shared-types'
import { getAnalisesBus } from './AnalisesBus.js'
import {
  upsertDossie as pgUpsertDossie,
  deleteDossie as pgDeleteDossie,
} from '../../db/DossieRepository.js'
import { auditAsync } from '../../db/AuditLog.js'

/**
 * Persistência do Dossiê Agro Canônico por cliente.
 *
 * Layout em disco:
 *   storage/clientes/dossies/{clienteId}.json              ← versão corrente
 *   storage/clientes/dossies-historico/{clienteId}/{n}.json ← snapshots
 *
 * Convenções:
 *  - Write-tmp + rename (mesmo padrão de `AnalisesRepository` /
 *    `EnrichmentQueue`), para que um crash no meio da escrita nunca
 *    deixe um JSON pela metade.
 *  - Cada `save()` incrementa `versao` (se não veio já incrementada
 *    do cliente) e copia a versão anterior pra pasta de histórico.
 *  - `clienteId` sanitizado antes de virar nome de arquivo.
 *  - Emite `AnalisesBus.invalidar` após save — o snapshot do
 *    SmartAdvisor depende de dados que agora o dossiê pode mudar
 *    (culturas, dívidas, imóveis).
 */
export class DossieRepository {
  private readonly dir: string
  private readonly histDir: string
  /** Limite default de versões mantidas por cliente. */
  private readonly maxHistorico = 20

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'dossies')
    this.histDir = join(baseDir, 'dossies-historico')
    mkdirSync(this.dir, { recursive: true })
    mkdirSync(this.histDir, { recursive: true })
  }

  /** Retorna o dossiê atual do cliente (ou null). */
  get(clienteId: string): DossieAgro | null {
    const file = this.fileFor(clienteId)
    if (!existsSync(file)) return null
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as DossieAgro
    } catch (err) {
      console.warn(`[DossieRepository] falha lendo ${file}`, err)
      return null
    }
  }

  /**
   * Persiste o dossiê. Se já existe versão anterior, copia pra
   * pasta de histórico antes. Sempre incrementa `versao` e
   * atualiza `atualizadoEm`.
   *
   * Retorna o dossiê efetivamente salvo (já com `versao` final).
   */
  save(dossie: DossieAgro): DossieAgro {
    if (!dossie.clienteId) {
      throw new Error('clienteId obrigatório para salvar dossiê')
    }
    const anterior = this.get(dossie.clienteId)
    const versao = anterior ? anterior.versao + 1 : 1
    const agora = new Date().toISOString()

    const persistido: DossieAgro = {
      ...dossie,
      versao,
      atualizadoEm: agora,
      criadoEm: anterior?.criadoEm ?? dossie.criadoEm ?? agora,
    }

    // snapshot da versão anterior
    if (anterior) {
      this.snapshotHistorico(dossie.clienteId, anterior)
    }

    this.writeAtomic(this.fileFor(dossie.clienteId), persistido)

    // Dual-write best-effort no Postgres (não bloqueia, não falha o save).
    // Cada versão vira uma linha (PK clienteId+versao); histórico ganha
    // queryability SQL além do JSON em disco.
    void pgUpsertDossie(persistido as unknown as Parameters<typeof pgUpsertDossie>[0])

    // Trilha de auditoria LGPD: dossiê é dado sensível (PF/PJ, dívidas, imóveis).
    auditAsync({
      ator: persistido.atualizadoPor ?? 'system',
      acao: anterior ? 'update' : 'create',
      recurso: `dossie:${persistido.clienteId}:v${versao}`,
      dadosAntes: anterior ? { versao: anterior.versao } : null,
      dadosDepois: { versao, dataBase: persistido.dataBase },
    })

    // dispara invalidação das análises — o dossiê mexeu
    try {
      getAnalisesBus().emitInvalidar({
        clienteId: dossie.clienteId,
        motivo: `dossiê v${versao} salvo`,
      })
    } catch {
      // best-effort — bus pode não estar disponível em testes isolados
    }

    return persistido
  }

  /** Remove o dossiê corrente (histórico permanece p/ auditoria). */
  delete(clienteId: string): boolean {
    const file = this.fileFor(clienteId)
    if (!existsSync(file)) return false
    try {
      unlinkSync(file)
      // Dual-write best-effort: limpa todas as versões PG do cliente.
      // Histórico em disco (`dossies-historico/`) permanece para auditoria.
      void pgDeleteDossie(clienteId)
      return true
    } catch (err) {
      console.warn(`[DossieRepository] falha removendo ${file}`, err)
      return false
    }
  }

  /** Lista os clienteIds que possuem dossiê persistido. */
  listarIds(): string[] {
    try {
      return readdirSync(this.dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
    } catch {
      return []
    }
  }

  /**
   * Retorna até `limit` versões anteriores (mais recentes primeiro),
   * apenas metadados — para listar no "Histórico" da UI sem
   * trafegar conteúdo completo.
   */
  historico(clienteId: string, limit = 5): Array<{ versao: number; atualizadoEm: string; atualizadoPor?: string }> {
    const dir = this.dirHistoricoCliente(clienteId)
    if (!existsSync(dir)) return []
    try {
      const arquivos = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, v: Number(f.replace(/\.json$/, '')) }))
        .filter((x) => Number.isFinite(x.v))
        .sort((a, b) => b.v - a.v)
        .slice(0, limit)
      const out: Array<{ versao: number; atualizadoEm: string; atualizadoPor?: string }> = []
      for (const { f, v } of arquivos) {
        try {
          const raw = readFileSync(join(dir, f), 'utf8')
          const d = JSON.parse(raw) as DossieAgro
          const entry: { versao: number; atualizadoEm: string; atualizadoPor?: string } = {
            versao: v,
            atualizadoEm: d.atualizadoEm,
          }
          if (d.atualizadoPor) entry.atualizadoPor = d.atualizadoPor
          out.push(entry)
        } catch {
          // skip corrupt entries
        }
      }
      return out
    } catch {
      return []
    }
  }

  /** Recupera uma versão específica (para "visualizar/restaurar"). */
  versao(clienteId: string, versao: number): DossieAgro | null {
    const dir = this.dirHistoricoCliente(clienteId)
    const file = join(dir, `${versao}.json`)
    if (!existsSync(file)) return null
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as DossieAgro
    } catch (err) {
      console.warn(`[DossieRepository] falha lendo versão ${versao} de ${clienteId}`, err)
      return null
    }
  }

  // ── internos ──────────────────────────────────────────

  private sanitize(clienteId: string): string {
    return clienteId.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  private fileFor(clienteId: string): string {
    return join(this.dir, `${this.sanitize(clienteId)}.json`)
  }

  private dirHistoricoCliente(clienteId: string): string {
    return join(this.histDir, this.sanitize(clienteId))
  }

  private snapshotHistorico(clienteId: string, dossie: DossieAgro): void {
    const dir = this.dirHistoricoCliente(clienteId)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${dossie.versao}.json`)
    this.writeAtomic(file, dossie)
    this.purgarHistorico(clienteId)
  }

  private purgarHistorico(clienteId: string): void {
    const dir = this.dirHistoricoCliente(clienteId)
    try {
      const arquivos = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, v: Number(f.replace(/\.json$/, '')) }))
        .filter((x) => Number.isFinite(x.v))
        .sort((a, b) => b.v - a.v)
      if (arquivos.length <= this.maxHistorico) return
      for (const extra of arquivos.slice(this.maxHistorico)) {
        try {
          unlinkSync(join(dir, extra.f))
        } catch {
          // best-effort
        }
      }
    } catch {
      // dir pode não existir ainda
    }
  }

  private writeAtomic(file: string, payload: unknown): void {
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(payload, null, 2))
    renameSync(tmp, file)
  }
}

let _instance: DossieRepository | null = null

export function getDossieRepository(): DossieRepository {
  if (!_instance) {
    const base = join(process.cwd(), 'storage/clientes')
    _instance = new DossieRepository(base)
  }
  return _instance
}

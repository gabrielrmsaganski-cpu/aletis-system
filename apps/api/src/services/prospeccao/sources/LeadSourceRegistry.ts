import { writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import type { LeadRaw } from '../types'
import type { LeadSource, LeadSourceManifest } from './LeadSource'

/**
 * Agrega múltiplas `LeadSource` num único índice consolidado.
 *
 * Responsabilidades:
 *  - Deduplicar por `cpfCnpjClean` mesclando sinais cross-source
 *    (união de `agroSignals`, união de `debts`, soma de `totalDivida`).
 *  - Registrar a procedência de cada lead em `LeadRaw.sources` para
 *    auditoria ("este CPF apareceu em PGFN e CAR").
 *  - Escrever o manifest unificado em `storage/prospeccao/sources.json`
 *    a cada `load()` — UI e telemetria consomem dali.
 *
 * A fonte listada primeiro no construtor é a "principal" para qualquer
 * campo escalar (nome, uf, tipoPessoa) — só é sobrescrita se a principal
 * não tiver o dado. Isso evita que fontes secundárias (ex: CAR) "roubem"
 * campos de identificação vindos de uma fonte primária (PGFN).
 */
export class LeadSourceRegistry {
  private readonly sources: LeadSource[]
  private readonly storageDir: string
  private merged: LeadRaw[] = []
  private byCpfCnpj = new Map<string, LeadRaw>()
  private loaded = false

  constructor(storageDir: string, sources: LeadSource[]) {
    this.storageDir = storageDir
    this.sources = sources
  }

  /** Carrega todas as fontes e consolida. Idempotente. */
  load(): void {
    if (this.loaded) return
    for (const s of this.sources) {
      try {
        const maybe = s.load()
        // Se a fonte retorna Promise, esperamos de forma síncrona via catch
        // no final do laço apenas se for realmente Promise. Em regime atual
        // todas as fontes são síncronas (dados materializados em disco).
        if (maybe instanceof Promise) {
          maybe.catch((err) => console.warn(`[LeadSourceRegistry] load() async falhou em ${s.fonte}:`, err))
        }
      } catch (err) {
        console.warn(`[LeadSourceRegistry] falha carregando fonte ${s.fonte}:`, err)
      }
    }
    this.rebuild()
    this.writeManifest()
    this.loaded = true
  }

  /** Força recarregamento — útil quando um script de ingest atualiza disco. */
  reload(): void {
    this.loaded = false
    this.load()
  }

  all(): LeadRaw[] {
    this.load()
    return this.merged
  }

  find(cpfCnpj: string): LeadRaw | null {
    this.load()
    const clean = cpfCnpj.replace(/\D/g, '')
    return this.byCpfCnpj.get(clean) || null
  }

  manifests(): LeadSourceManifest[] {
    this.load()
    return this.sources.map((s) => {
      try {
        return s.manifest()
      } catch {
        return {
          fonte: s.fonte,
          descricao: s.fonte,
          contagem: 0,
          lastIngestAt: null,
        }
      }
    })
  }

  /** Expõe apenas a fonte principal — usado pelo card "fonte PGFN" na UI. */
  fontePrincipal(): LeadSourceManifest | null {
    const list = this.manifests()
    return list.length ? list[0] : null
  }

  /* ============================== INTERNO ============================== */

  private rebuild(): void {
    this.byCpfCnpj.clear()
    for (const s of this.sources) {
      const nowIso = new Date().toISOString()
      for (const lead of s.all()) {
        const existente = this.byCpfCnpj.get(lead.cpfCnpjClean)
        if (!existente) {
          // Clona para não mutar a fonte original.
          const cloned: LeadRaw = {
            ...lead,
            debts: [...lead.debts],
            agroSignals: [...lead.agroSignals],
            sources: [{ fonte: s.fonte, ingestedAt: nowIso }],
          }
          this.byCpfCnpj.set(lead.cpfCnpjClean, cloned)
          continue
        }
        this.mergeInto(existente, lead, s.fonte, nowIso)
      }
    }
    this.merged = Array.from(this.byCpfCnpj.values())
  }

  private mergeInto(target: LeadRaw, incoming: LeadRaw, fonte: string, nowIso: string): void {
    // Procedência — append sem duplicar.
    if (!target.sources) target.sources = []
    if (!target.sources.some((s) => s.fonte === fonte)) {
      target.sources.push({ fonte, ingestedAt: nowIso })
    }

    // Sinais — união.
    const sinais = new Set([...target.agroSignals, ...incoming.agroSignals])
    target.agroSignals = Array.from(sinais)

    // Dívidas — união por `inscricao` (chave natural no PGFN).
    const inscricoes = new Set(target.debts.map((d) => `${d.fonte}:${d.inscricao}`))
    for (const d of incoming.debts) {
      const key = `${d.fonte}:${d.inscricao}`
      if (!inscricoes.has(key)) {
        target.debts.push(d)
        inscricoes.add(key)
      }
    }

    // Recalcula agregados a partir das dívidas mescladas.
    target.totalDivida = target.debts.reduce((acc, d) => acc + (d.valor || 0), 0)
    target.qtdInscricoes = target.debts.length
    target.temAjuizada = target.debts.some((d) => d.ajuizado)

    const datas = target.debts.map((d) => d.dataInscricao).filter(Boolean).sort()
    if (datas.length) {
      target.primeiraInscricao = datas[0]
      target.ultimaInscricao = datas[datas.length - 1]
    }

    // Campos escalares — só preenche se estiver vazio no target (a fonte
    // principal manda em identificação básica).
    if (!target.nome && incoming.nome) target.nome = incoming.nome
    if (!target.uf && incoming.uf) target.uf = incoming.uf
    if (!target.tipoPessoa && incoming.tipoPessoa) target.tipoPessoa = incoming.tipoPessoa
    if (!target.cpfCnpj && incoming.cpfCnpj) target.cpfCnpj = incoming.cpfCnpj
  }

  private writeManifest(): void {
    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      totalLeadsConsolidado: this.merged.length,
      sources: this.manifests(),
    }
    const target = join(this.storageDir, 'sources.json')
    try {
      const tmp = `${target}.tmp`
      writeFileSync(tmp, JSON.stringify(payload, null, 2))
      renameSync(tmp, target)
    } catch (err) {
      console.warn('[LeadSourceRegistry] falha escrevendo sources.json:', err)
    }
  }
}

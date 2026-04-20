import { join } from 'path'
import { PGFNSource } from './PGFNSource'
import { BrasilAPISource, isAgroCnae } from './BrasilAPISource'
import { AreaEstimator } from './AreaEstimator'
import { ScoringEngine } from './ScoringEngine'
import { SICARClient, SICARError, getSICARClient } from './SICARClient'
import { SICARIndex, SicarIndexStats } from './SICARIndex'
import { GeoEnrichmentSource, getGeoEnrichmentSource } from './GeoEnrichmentSource'
import { NasaPowerSource, getNasaPowerSource } from './NasaPowerSource'
import { IbgeSidraSource, getIbgeSidraSource } from './IbgeSidraSource'
import { LeadsRepository, BlacklistEntry } from './LeadsRepository'
import type {
  AreaEstimation,
  CarConsultaResult,
  ClimaAgro,
  CnpjEnrichment,
  GeoEnrichment,
  LeadFull,
  LeadRaw,
  LeadStatus,
  ProducaoMunicipal,
  ProspeccaoFilters,
  ProspeccaoStats,
} from './types'

/**
 * Orquestra a prospecção agro — combina PGFN + BrasilAPI + estimativa de área
 * + scoring. Enriquecimentos e blacklist são persistidos em disco via
 * `LeadsRepository` — estado sobrevive a restarts.
 */
export class ProspeccaoService {
  private pgfn: PGFNSource
  private brasil: BrasilAPISource
  private area: AreaEstimator
  private scorer: ScoringEngine
  private sicar: SICARClient
  private sicarIndex: SICARIndex
  private geo: GeoEnrichmentSource
  private nasaPower: NasaPowerSource
  private ibgeSidra: IbgeSidraSource
  private repo: LeadsRepository

  /** Controle de lotes em execução (key = batchId). */
  private activeBatches = new Map<string, { cancelled: boolean }>()

  constructor(storageDir: string) {
    this.pgfn = new PGFNSource(storageDir)
    this.brasil = new BrasilAPISource()
    this.area = new AreaEstimator()
    this.scorer = new ScoringEngine()
    this.sicar = getSICARClient()
    this.sicarIndex = new SICARIndex(storageDir)
    this.geo = getGeoEnrichmentSource()
    this.nasaPower = getNasaPowerSource()
    this.ibgeSidra = getIbgeSidraSource()
    this.repo = new LeadsRepository(storageDir)
  }

  /**
   * Monta o LeadFull a partir do raw — usa enrichment persistido se houver,
   * caso contrário computa versão "básica" com score e estimativa de área.
   */
  private buildBasic(raw: LeadRaw): LeadFull {
    const saved = this.repo.getEnriched(raw.cpfCnpjClean)
    if (saved) {
      return this.withStatus(saved, 'completa')
    }
    const area = this.area.estimate(raw, null)
    const score = this.scorer.score(raw, area)
    const full: LeadFull = {
      cpfCnpj: raw.cpfCnpj,
      cpfCnpjClean: raw.cpfCnpjClean,
      tipoPessoa: raw.tipoPessoa,
      nome: raw.nome,
      uf: raw.uf,
      agroSignals: raw.agroSignals,
      totalDivida: raw.totalDivida,
      qtdInscricoes: raw.qtdInscricoes,
      temAjuizada: raw.temAjuizada,
      primeiraInscricao: raw.primeiraInscricao,
      ultimaInscricao: raw.ultimaInscricao,
      debts: raw.debts,
      area,
      score,
    }
    return this.withStatus(full, 'pendente')
  }

  /** Decora lead com `status`/`excluidoMotivo` com base na blacklist e cache. */
  private withStatus(lead: LeadFull, baseStatus: LeadStatus): LeadFull {
    const out: LeadFull = { ...lead, status: baseStatus, enriquecido: baseStatus === 'completa' }
    const black = this.repo.getBlacklistEntry(lead.cpfCnpjClean)
    if (black) {
      out.status = 'excluido'
      out.excluidoMotivo = black.motivo
      out.excluidoEm = black.excluidoEm
    }
    return out
  }

  buscar(filters: ProspeccaoFilters): {
    total: number
    leads: LeadFull[]
    page: number
    pageSize: number
    counts: { pendentes: number; completas: number; excluidos: number; todos: number }
  } {
    const all = this.pgfn.all().map((r) => this.buildBasic(r))
    const uf = filters.uf
      ? Array.isArray(filters.uf)
        ? filters.uf.map((u) => u.toUpperCase())
        : [filters.uf.toUpperCase()]
      : null
    const termo = filters.termo?.toUpperCase().trim() || null
    const status = filters.status || 'todos'

    // counts globais (antes da paginação, antes do corte por filtros específicos)
    const counts = {
      todos: all.filter((l) => l.status !== 'excluido').length,
      pendentes: all.filter((l) => l.status === 'pendente').length,
      completas: all.filter((l) => l.status === 'completa').length,
      excluidos: all.filter((l) => l.status === 'excluido').length,
    }

    const filtered = all.filter((l) => {
      // Filtro de status — default exclui blacklisted
      if (status === 'todos') {
        if (l.status === 'excluido') return false
      } else if (l.status !== status) {
        return false
      }
      if (uf && !uf.includes(l.uf)) return false
      if (filters.minDivida != null && l.totalDivida < filters.minDivida) return false
      if (filters.maxDivida != null && l.totalDivida > filters.maxDivida) return false
      if (filters.minHectares != null && l.area.hectaresEstimados < filters.minHectares) return false
      if (filters.tipoPessoa && l.tipoPessoa !== filters.tipoPessoa) return false
      if (filters.apenasAjuizadas && !l.temAjuizada) return false
      if (filters.cnaeAgro && l.cnpj && !isAgroCnae(l.cnpj.cnaeFiscal)) return false
      if (termo) {
        const hay = (l.nome + ' ' + l.cpfCnpj).toUpperCase()
        if (!hay.includes(termo)) return false
      }
      return true
    })

    const sort = filters.sortBy || 'score'
    filtered.sort((a, b) => {
      switch (sort) {
        case 'divida':
          return b.totalDivida - a.totalDivida
        case 'hectares':
          return b.area.hectaresEstimados - a.area.hectaresEstimados
        case 'recencia':
          return (b.ultimaInscricao || '').localeCompare(a.ultimaInscricao || '')
        case 'score':
        default:
          return b.score.total - a.score.total
      }
    })

    const page = Math.max(1, filters.page || 1)
    const pageSize = Math.min(200, Math.max(10, filters.pageSize || 50))
    const start = (page - 1) * pageSize
    return {
      total: filtered.length,
      leads: filtered.slice(start, start + pageSize),
      page,
      pageSize,
      counts,
    }
  }

  getLead(cpfCnpj: string): LeadFull | null {
    const raw = this.pgfn.find(cpfCnpj)
    if (!raw) return null
    return this.buildBasic(raw)
  }

  /** Enriquece: chama BrasilAPI, recomputa área com capital social + CNAE, rescore, persiste. */
  async enrichLead(cpfCnpj: string, codImovel?: string): Promise<LeadFull | null> {
    const raw = this.pgfn.find(cpfCnpj)
    if (!raw) return null

    let cnpjInfo = null
    if (raw.tipoPessoa === 'PJ') {
      cnpjInfo = await this.brasil.enrichCnpj(raw.cpfCnpjClean)
    }

    // Estratégia CAR:
    //  1. Se codImovel foi informado → scraping live (captcha)
    //  2. Senão, tenta índice offline (SICARIndex) por CPF/CNPJ e nome
    //  3. Se nada, cai na estimativa composta
    const previous = this.repo.getEnriched(raw.cpfCnpjClean)
    let carInfo = previous?.car
    let carSource = previous?.carSource
    let carTotalHectares = carInfo?.areaImovel
    let carOutrosImoveis: CarConsultaResult[] | undefined = previous?.carOutrosImoveis

    if (codImovel) {
      carInfo = await this.sicar.consultarPorCodigo(codImovel)
      carSource = 'live'
      carTotalHectares = carInfo.areaImovel
      carOutrosImoveis = undefined
    } else if (!carInfo && this.sicarIndex.isAvailable()) {
      // Busca aprofundada: passa UF/município do endereço RFB quando disponível
      // para desambiguar homônimos e habilitar match por tokens.
      const ctx = {
        uf: cnpjInfo?.endereco?.uf || raw.uf || null,
        municipio: cnpjInfo?.endereco?.municipio || null,
      }
      const hit = this.sicarIndex.deepLookup(raw.cpfCnpjClean, raw.nome, ctx)
      if (hit) {
        carInfo = hit.principal
        carSource = 'offline'
        carTotalHectares = hit.totalHectares
        carOutrosImoveis = hit.imoveis.length > 1 ? hit.imoveis : undefined
        // Guarda a estratégia na explicação para debug/UI
        ;(carInfo as any)._matchEstrategia = hit.estrategia
        ;(carInfo as any)._matchConfidence = hit.confidence
      }
    }

    const area: AreaEstimation = carInfo
      ? {
          hectaresEstimados: Math.round(carTotalHectares ?? carInfo.areaImovel),
          hectaresSicar: carTotalHectares ?? carInfo.areaImovel,
          confidence: 'alta',
          metodo: 'sicar',
          explicacao: this.buildAreaExplicacao(carInfo, carSource, carTotalHectares, carOutrosImoveis?.length),
        }
      : this.area.estimate(raw, cnpjInfo)
    const score = this.scorer.score(raw, area)

    const full: LeadFull = {
      cpfCnpj: raw.cpfCnpj,
      cpfCnpjClean: raw.cpfCnpjClean,
      tipoPessoa: raw.tipoPessoa,
      nome: raw.nome,
      uf: raw.uf,
      agroSignals: raw.agroSignals,
      totalDivida: raw.totalDivida,
      qtdInscricoes: raw.qtdInscricoes,
      temAjuizada: raw.temAjuizada,
      primeiraInscricao: raw.primeiraInscricao,
      ultimaInscricao: raw.ultimaInscricao,
      debts: raw.debts,
      cnpj: cnpjInfo || undefined,
      area,
      car: carInfo,
      carSource,
      carOutrosImoveis,
      enriquecidoEm: new Date().toISOString(),
      score,
    }

    this.repo.saveEnriched(full)
    return this.withStatus(full, 'completa')
  }

  /**
   * Enriquecimento CAR ad-hoc — não depende de lead PGFN existente. Usado
   * pelo CRM de clientes cadastrados manualmente. Estratégia:
   *  1. Se `codImovel` for informado → consulta live (SICAR + 2captcha)
   *  2. Senão, tenta o índice offline por CPF/CNPJ e nome (se disponível)
   *  3. Caso contrário retorna `{ car: null }` — não quebra o fluxo.
   *
   * Erros de rede/captcha são capturados e reportados em `error` — o chamador
   * decide se mostra ao usuário ou agenda retry.
   */
  async enriquecerCAR(params: {
    cpfCnpj: string
    nome: string
    uf?: string | null
    municipio?: string | null
    codImovel?: string
  }): Promise<{
    car?: CarConsultaResult
    carSource?: 'offline' | 'live'
    carOutrosImoveis?: CarConsultaResult[]
    totalHectares?: number
    error?: string
    errorCode?: string
  }> {
    const cpfCnpjClean = (params.cpfCnpj || '').replace(/\D/g, '')
    if (!cpfCnpjClean) {
      return { error: 'cpfCnpj inválido', errorCode: 'INVALID_CPF_CNPJ' }
    }

    // 1. Live scraping quando codImovel explícito
    if (params.codImovel) {
      try {
        const car = await this.sicar.consultarPorCodigo(params.codImovel)
        return { car, carSource: 'live', totalHectares: car.areaImovel }
      } catch (err: any) {
        const code = err instanceof SICARError ? err.code : 'SICAR_UNKNOWN'
        return { error: err?.message || 'falha na consulta SICAR', errorCode: code }
      }
    }

    // 2. Índice offline (SICARIndex)
    if (this.sicarIndex.isAvailable()) {
      const hit = this.sicarIndex.deepLookup(cpfCnpjClean, params.nome, {
        uf: params.uf || null,
        municipio: params.municipio || null,
      })
      if (hit) {
        const carInfo = hit.principal
        ;(carInfo as any)._matchEstrategia = hit.estrategia
        ;(carInfo as any)._matchConfidence = hit.confidence
        return {
          car: carInfo,
          carSource: 'offline',
          carOutrosImoveis: hit.imoveis.length > 1 ? hit.imoveis : undefined,
          totalHectares: hit.totalHectares,
        }
      }
    }

    // 3. Nada encontrado — sinaliza para UI oferecer consulta manual por código
    return { errorCode: 'NO_MATCH', error: 'imóvel não encontrado no índice offline; informe o código CAR para consulta live' }
  }

  /**
   * Enriquecimento COMPLETO de um cliente — orquestra as 3 fontes em paralelo:
   *   • CAR        (SICAR offline + live) — área, código imóvel, módulos fiscais
   *   • CNPJ       (BrasilAPI)            — razão social, QSA, CNAE, tel, email
   *   • Geo        (ViaCEP + Nominatim)   — endereço canônico + coordenadas
   *
   * Qualquer fonte pode falhar independente; retorna o que deu certo. Sempre
   * combinamos o CEP vindo do BrasilAPI (mais preciso p/ matriz) com fallback
   * ao CEP/cidade informado manualmente — máxima cobertura.
   *
   * Campo `carCodigoImovel` sobrescreve a detecção automática pelo índice.
   */
  async enriquecerCliente(params: {
    cpfCnpj: string
    nome: string
    uf?: string | null
    cidade?: string | null
    cep?: string | null
    /** Código CAR para forçar consulta live (ignorado se offline achar). */
    codImovel?: string
  }): Promise<{
    car?: CarConsultaResult
    carSource?: 'offline' | 'live'
    carOutrosImoveis?: CarConsultaResult[]
    totalHectares?: number
    cnpj?: CnpjEnrichment
    geo?: GeoEnrichment
    clima?: ClimaAgro
    producaoMunicipal?: ProducaoMunicipal
    errors: { car?: string; cnpj?: string; geo?: string; clima?: string; producao?: string }
    enriquecidoEm: string
  }> {
    const cpfCnpjClean = (params.cpfCnpj || '').replace(/\D/g, '')
    const isPJ = cpfCnpjClean.length === 14

    // Dispara as 3 fontes em paralelo. CNPJ ativa o ViaCEP melhor (traz CEP RFB).
    const [carRes, cnpjRes] = await Promise.all([
      this.enriquecerCAR({
        cpfCnpj: params.cpfCnpj,
        nome: params.nome,
        uf: params.uf,
        municipio: params.cidade,
        codImovel: params.codImovel,
      }).catch((err) => ({ error: err?.message || 'falha CAR', errorCode: 'CAR_THROW' })),
      isPJ
        ? this.brasil.enrichCnpj(cpfCnpjClean).catch((err) => ({ __err: err?.message || 'falha BrasilAPI' } as any))
        : Promise.resolve(null),
    ])

    // CNPJ pode ter vindo com erro sinalizado; separa o happy path
    let cnpj: CnpjEnrichment | undefined
    let cnpjError: string | undefined
    if (cnpjRes && typeof cnpjRes === 'object' && '__err' in cnpjRes) {
      cnpjError = (cnpjRes as any).__err
    } else if (cnpjRes) {
      cnpj = cnpjRes as CnpjEnrichment
    }

    // Geo — usa CEP do BrasilAPI (matriz) ou CEP manual; fallback p/ cidade+UF
    const cepPref = cnpj?.endereco?.cep || (params.cep || '').replace(/\D/g, '')
    let geo: GeoEnrichment | undefined
    let geoError: string | undefined
    try {
      const geoRes = await this.geo.enrich(cepPref || '', {
        logradouro: cnpj?.endereco?.logradouro || undefined,
        numero: cnpj?.endereco?.numero || undefined,
        bairro: cnpj?.endereco?.bairro || undefined,
        cidade: cnpj?.endereco?.municipio || params.cidade || undefined,
        uf: cnpj?.endereco?.uf || params.uf || undefined,
      })
      if (geoRes) geo = geoRes
      else geoError = 'CEP/endereço não localizado'
    } catch (err: any) {
      geoError = err?.message || 'falha Geo'
    }

    // ---- Fase 2: enriquecimentos dependentes de coordenadas/IBGE ----
    // Rodam em paralelo após termos geo. NASA POWER precisa de lat/lng; SIDRA
    // precisa de código IBGE. Ambos falham silenciosamente se a base não tiver
    // o ponto/município — não quebram o fluxo.
    const lat = geo?.coordenadas?.lat
    const lng = geo?.coordenadas?.lng
    const codIbge = geo?.codigoIbge || cnpj?.endereco?.codigoMunicipioIbge

    const [climaRes, prodRes] = await Promise.all([
      lat != null && lng != null
        ? this.nasaPower.enrich(lat, lng).catch((err) => ({ __err: err?.message || 'falha NASA POWER' } as any))
        : Promise.resolve(null),
      codIbge
        ? this.ibgeSidra.enrich(codIbge).catch((err) => ({ __err: err?.message || 'falha IBGE SIDRA' } as any))
        : Promise.resolve(null),
    ])

    let clima: ClimaAgro | undefined
    let climaError: string | undefined
    if (climaRes && typeof climaRes === 'object' && '__err' in climaRes) {
      climaError = (climaRes as any).__err
    } else if (climaRes) {
      clima = climaRes as ClimaAgro
    } else if (lat == null || lng == null) {
      climaError = 'sem coordenadas para consultar clima'
    }

    let producaoMunicipal: ProducaoMunicipal | undefined
    let producaoError: string | undefined
    if (prodRes && typeof prodRes === 'object' && '__err' in prodRes) {
      producaoError = (prodRes as any).__err
    } else if (prodRes) {
      producaoMunicipal = prodRes as ProducaoMunicipal
    } else if (!codIbge) {
      producaoError = 'sem código IBGE para consultar produção'
    }

    const carOk = 'car' in carRes && carRes.car
    const errors: { car?: string; cnpj?: string; geo?: string; clima?: string; producao?: string } = {}
    if (!carOk && 'error' in carRes && carRes.error) errors.car = carRes.error
    if (cnpjError) errors.cnpj = cnpjError
    if (geoError) errors.geo = geoError
    if (climaError) errors.clima = climaError
    if (producaoError) errors.producao = producaoError

    return {
      car: carOk ? carRes.car : undefined,
      carSource: carOk ? (carRes as any).carSource : undefined,
      carOutrosImoveis: carOk ? (carRes as any).carOutrosImoveis : undefined,
      totalHectares: carOk ? (carRes as any).totalHectares : undefined,
      cnpj,
      geo,
      clima,
      producaoMunicipal,
      errors,
      enriquecidoEm: new Date().toISOString(),
    }
  }

  /** Consulta SICAR (live) e já persiste como lead enriquecido. */
  async consultarCar(cpfCnpj: string, codImovel: string): Promise<CarConsultaResult> {
    const result = await this.sicar.consultarPorCodigo(codImovel)
    const raw = this.pgfn.find(cpfCnpj)
    if (raw) {
      // atualiza enrichment persistido com novo CAR
      const previous = this.repo.getEnriched(raw.cpfCnpjClean)
      if (previous) {
        this.repo.saveEnriched({
          ...previous,
          car: result,
          carSource: 'live',
          enriquecidoEm: new Date().toISOString(),
        })
      }
    }
    return result
  }

  /** Marca um lead como excluído (soft-delete via blacklist). */
  excluirLead(cpfCnpj: string, motivo: string): BlacklistEntry | null {
    const raw = this.pgfn.find(cpfCnpj)
    if (!raw) return null
    const entry = this.repo.addToBlacklist(
      { cpfCnpj: raw.cpfCnpj, cpfCnpjClean: raw.cpfCnpjClean },
      motivo
    )
    // Opcional: remover enrichment persistido para economizar disco.
    // Mantemos para auditoria — reversível via restaurar.
    return entry
  }

  /** Restaura lead previamente excluído. */
  restaurarLead(cpfCnpj: string): boolean {
    const clean = cpfCnpj.replace(/\D/g, '')
    return this.repo.removeFromBlacklist(clean)
  }

  /**
   * Enriquecimento em lote — aplica filtros, itera com concorrência limitada,
   * reporta progresso via callback. Cancelável via `cancelBatch(batchId)`.
   */
  async enriquecerLote(
    filters: ProspeccaoFilters,
    options: {
      batchId: string
      concurrency?: number
      onProgress: (ev: BatchEvent) => void
    }
  ): Promise<void> {
    const { batchId, onProgress } = options
    const concurrency = Math.min(8, Math.max(1, options.concurrency || 3))

    const targets = this.pgfn.all().filter((raw) => {
      const decorated = this.buildBasic(raw)
      if (decorated.status === 'excluido') return false
      if (decorated.status === 'completa') return false // já enriquecido
      if (filters.uf) {
        const ufs = Array.isArray(filters.uf) ? filters.uf : [filters.uf]
        if (!ufs.map((u) => u.toUpperCase()).includes(decorated.uf)) return false
      }
      if (filters.minDivida != null && decorated.totalDivida < filters.minDivida) return false
      if (filters.maxDivida != null && decorated.totalDivida > filters.maxDivida) return false
      if (filters.minHectares != null && decorated.area.hectaresEstimados < filters.minHectares) return false
      if (filters.tipoPessoa && decorated.tipoPessoa !== filters.tipoPessoa) return false
      if (filters.apenasAjuizadas && !decorated.temAjuizada) return false
      if (filters.termo) {
        const hay = (decorated.nome + ' ' + decorated.cpfCnpj).toUpperCase()
        if (!hay.includes(filters.termo.toUpperCase())) return false
      }
      return true
    })

    const state = { cancelled: false }
    this.activeBatches.set(batchId, state)

    const total = targets.length
    let processed = 0
    let ok = 0
    let fail = 0

    onProgress({ type: 'start', batchId, total })

    // Worker pool
    let idx = 0
    const workers: Promise<void>[] = []
    for (let w = 0; w < concurrency; w++) {
      workers.push(
        (async () => {
          while (!state.cancelled) {
            const i = idx++
            if (i >= targets.length) return
            const raw = targets[i]
            try {
              const enriched = await this.enrichLead(raw.cpfCnpj)
              ok++
              onProgress({
                type: 'progress',
                batchId,
                processed: ++processed,
                total,
                ok,
                fail,
                lead: enriched
                  ? {
                      cpfCnpj: enriched.cpfCnpj,
                      nome: enriched.nome,
                      uf: enriched.uf,
                      hectares: enriched.area.hectaresEstimados,
                      carSource: enriched.carSource,
                      score: enriched.score.total,
                    }
                  : null,
              })
            } catch (err: any) {
              fail++
              onProgress({
                type: 'progress',
                batchId,
                processed: ++processed,
                total,
                ok,
                fail,
                error: err?.message || 'falha desconhecida',
                lead: { cpfCnpj: raw.cpfCnpj, nome: raw.nome, uf: raw.uf },
              })
            }
          }
        })()
      )
    }

    await Promise.all(workers)
    this.activeBatches.delete(batchId)
    onProgress({
      type: state.cancelled ? 'cancelled' : 'done',
      batchId,
      processed,
      total,
      ok,
      fail,
    })
  }

  cancelBatch(batchId: string): boolean {
    const b = this.activeBatches.get(batchId)
    if (!b) return false
    b.cancelled = true
    return true
  }

  /**
   * Preview: quantos leads o lote vai processar com os filtros informados e
   * quantos provavelmente vão ter CAR encontrado (considerando só o índice
   * offline — estimativa conservadora).
   */
  previewLote(filters: ProspeccaoFilters): {
    elegiveis: number
    jaCompletos: number
    comCarProvavel: number
    semCarProvavel: number
    porUf: Array<{ uf: string; count: number }>
  } {
    const targets: LeadRaw[] = []
    let jaCompletos = 0
    for (const raw of this.pgfn.all()) {
      const decorated = this.buildBasic(raw)
      if (decorated.status === 'excluido') continue
      if (decorated.status === 'completa') {
        jaCompletos++
        continue
      }
      if (filters.uf) {
        const ufs = Array.isArray(filters.uf) ? filters.uf : [filters.uf]
        if (!ufs.map((u) => u.toUpperCase()).includes(decorated.uf)) continue
      }
      if (filters.minDivida != null && decorated.totalDivida < filters.minDivida) continue
      if (filters.maxDivida != null && decorated.totalDivida > filters.maxDivida) continue
      if (filters.minHectares != null && decorated.area.hectaresEstimados < filters.minHectares) continue
      if (filters.tipoPessoa && decorated.tipoPessoa !== filters.tipoPessoa) continue
      if (filters.apenasAjuizadas && !decorated.temAjuizada) continue
      if (filters.termo) {
        const hay = (decorated.nome + ' ' + decorated.cpfCnpj).toUpperCase()
        if (!hay.includes(filters.termo.toUpperCase())) continue
      }
      targets.push(raw)
    }

    // Estimativa de cobertura CAR — só vale se o índice estiver carregado
    let comCarProvavel = 0
    if (this.sicarIndex.isAvailable()) {
      for (const raw of targets) {
        const hit = this.sicarIndex.lookup(raw.cpfCnpjClean, raw.nome, { uf: raw.uf })
        if (hit) comCarProvavel++
      }
    }

    const porUfMap = new Map<string, number>()
    for (const raw of targets) {
      const uf = raw.uf || 'ND'
      porUfMap.set(uf, (porUfMap.get(uf) || 0) + 1)
    }
    const porUf = Array.from(porUfMap.entries())
      .map(([uf, count]) => ({ uf, count }))
      .sort((a, b) => b.count - a.count)

    return {
      elegiveis: targets.length,
      jaCompletos,
      comCarProvavel,
      semCarProvavel: targets.length - comCarProvavel,
      porUf,
    }
  }

  /** Status do SICAR (sem consumir captcha). */
  async sicarStatus(): Promise<{ online: boolean; reason?: string; sitekey?: string }> {
    return this.sicar.checkStatus()
  }

  /** Stats do índice offline SICAR. */
  sicarIndexStats(): SicarIndexStats {
    return this.sicarIndex.stats()
  }

  /** Recarrega o índice offline do disco (sem restart da API). */
  reloadSicarIndex(): SicarIndexStats {
    return this.sicarIndex.reload()
  }

  private buildAreaExplicacao(
    car: CarConsultaResult,
    source: 'offline' | 'live' | undefined,
    total: number | undefined,
    qtd: number | undefined
  ): string {
    const totalTxt = total && total !== car.areaImovel ? ` (total proprietário: ${total.toLocaleString('pt-BR')} ha em ${qtd} imóveis)` : ''
    const srcTxt = source === 'offline' ? 'índice offline SICAR (shapefile oficial)' : 'consulta ao vivo SICAR via 2captcha'
    const estrategia = (car as any)._matchEstrategia
    const confidence = (car as any)._matchConfidence
    const confTxt = estrategia ? ` · estratégia: ${estrategia}${confidence ? ` (confiança ${confidence}%)` : ''}` : ''
    return `Área oficial via ${srcTxt} — imóvel principal ${car.codImovel}: ${car.areaImovel.toLocaleString('pt-BR')} ha em ${car.municipio}/${car.uf}${totalTxt}. Condição: ${car.condicaoCadastro}.${confTxt}`
  }

  stats(): ProspeccaoStats {
    const all = this.pgfn.all().map((r) => this.buildBasic(r))
    const ativos = all.filter((l) => l.status !== 'excluido')
    const totalLeads = ativos.length
    const totalDivida = ativos.reduce((s, l) => s + l.totalDivida, 0)
    const honorariosPotenciaisTotal = ativos.reduce(
      (s, l) => s + l.score.honorariosEstimados,
      0
    )
    const leadsQuentes = ativos.filter((l) => l.score.classificacao === 'quente').length
    const leadsComAjuizamento = ativos.filter((l) => l.temAjuizada).length
    const leadsCompletos = all.filter((l) => l.status === 'completa').length
    const leadsExcluidos = all.filter((l) => l.status === 'excluido').length

    const ufMap = new Map<string, { count: number; divida: number }>()
    for (const l of ativos) {
      const uf = l.uf || 'ND'
      const e = ufMap.get(uf) || { count: 0, divida: 0 }
      e.count++
      e.divida += l.totalDivida
      ufMap.set(uf, e)
    }
    const porUf = Array.from(ufMap.entries())
      .map(([uf, v]) => ({ uf, ...v }))
      .sort((a, b) => b.count - a.count)

    const faixas = [
      { faixa: 'até R$ 100 mil', min: 0, max: 100_000 },
      { faixa: 'R$ 100 mil – R$ 500 mil', min: 100_000, max: 500_000 },
      { faixa: 'R$ 500 mil – R$ 1 milhão', min: 500_000, max: 1_000_000 },
      { faixa: 'R$ 1 mi – R$ 10 mi', min: 1_000_000, max: 10_000_000 },
      { faixa: 'R$ 10 mi – R$ 100 mi', min: 10_000_000, max: 100_000_000 },
      { faixa: 'acima de R$ 100 mi', min: 100_000_000, max: Infinity },
    ]
    const porFaixaDivida = faixas.map((f) => ({
      faixa: f.faixa,
      count: ativos.filter((l) => l.totalDivida >= f.min && l.totalDivida < f.max).length,
    }))

    const signalCount = new Map<string, number>()
    for (const l of ativos) {
      for (const s of l.agroSignals) signalCount.set(s, (signalCount.get(s) || 0) + 1)
    }
    const topSignals = Array.from(signalCount.entries())
      .map(([signal, count]) => ({ signal, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)

    const m = this.pgfn.getManifest()
    return {
      totalLeads,
      totalDivida,
      honorariosPotenciaisTotal,
      leadsQuentes,
      leadsComAjuizamento,
      leadsCompletos,
      leadsExcluidos,
      porUf,
      porFaixaDivida,
      topSignals,
      manifest: {
        fonte: m?.source || 'PGFN Dívida Ativa',
        atualizadoEm: m?.generatedAt || new Date().toISOString(),
      },
    }
  }
}

export type BatchEvent =
  | { type: 'start'; batchId: string; total: number }
  | {
      type: 'progress'
      batchId: string
      processed: number
      total: number
      ok: number
      fail: number
      lead?: {
        cpfCnpj: string
        nome: string
        uf: string
        hectares?: number
        carSource?: 'offline' | 'live'
        score?: number
      } | null
      error?: string
    }
  | { type: 'done' | 'cancelled'; batchId: string; processed: number; total: number; ok: number; fail: number }

let _instance: ProspeccaoService | null = null
export function getProspeccaoService(): ProspeccaoService {
  if (!_instance) {
    const dir = join(process.cwd(), 'storage/prospeccao')
    _instance = new ProspeccaoService(dir)
  }
  return _instance
}

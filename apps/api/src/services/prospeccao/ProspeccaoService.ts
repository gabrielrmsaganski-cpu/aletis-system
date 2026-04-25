import { join } from 'path'
import { PGFNSource } from './PGFNSource'
import { DOUSource } from './sources/DOUSource'
import { SocioExpansionSource } from './sources/SocioExpansionSource'
import { LeadSourceRegistry } from './sources/LeadSourceRegistry'
import type { LeadSourceManifest } from './sources/LeadSource'
import { BrasilAPISource, isAgroCnae } from './BrasilAPISource'
import { AreaEstimator } from './AreaEstimator'
import { ScoringEngine } from './ScoringEngine'
import { SICARClient, SICARError, getSICARClient } from './SICARClient'
import { SICARIndex, SicarIndexStats } from './SICARIndex'
import { GeoEnrichmentSource, getGeoEnrichmentSource } from './GeoEnrichmentSource'
import { NasaPowerSource, getNasaPowerSource } from './NasaPowerSource'
import { IbgeSidraSource, getIbgeSidraSource } from './IbgeSidraSource'
import { LeadsRepository, BlacklistEntry } from './LeadsRepository'
import { EnrichmentQueue, type EnrichmentJob, type JobPrioridade } from './EnrichmentQueue'
import type {
  AgroProfile,
  AreaEstimation,
  CarConsultaResult,
  ClimaAgro,
  CnpjEnrichment,
  ContactOutcome,
  ContactOutcomeTipo,
  GeoEnrichment,
  HotLeadAlert,
  JudicialProfile,
  JudicialTipo,
  LeadFull,
  LeadRaw,
  LeadStatus,
  PfProfile,
  ProducaoMunicipal,
  ProspeccaoFilters,
  ProspeccaoStats,
} from './types'

/**
 * Outcome → decisão automática: quais tipos disparam blacklist imediata. Vem
 * da lógica "se a porta fechou, não me faz perder tempo com o lead de novo".
 */
const OUTCOMES_QUE_EXCLUEM: Record<ContactOutcomeTipo, string | null> = {
  sucesso: null,
  interessado: null,
  retornar: null,
  recusou: 'Recusou durante contato',
  ja_regularizou: 'Já regularizou com outra mesa',
  nao_agro: 'Perfil não é agro (falso positivo)',
  fora_target: 'Agro mas fora do perfil ALETIS',
}

/**
 * Orquestra a prospecção agro — combina PGFN + BrasilAPI + estimativa de área
 * + scoring. Enriquecimentos e blacklist são persistidos em disco via
 * `LeadsRepository` — estado sobrevive a restarts.
 */
export class ProspeccaoService {
  private pgfn: PGFNSource
  private sources: LeadSourceRegistry
  private brasil: BrasilAPISource
  private area: AreaEstimator
  private scorer: ScoringEngine
  private sicar: SICARClient
  private sicarIndex: SICARIndex
  private geo: GeoEnrichmentSource
  private nasaPower: NasaPowerSource
  private ibgeSidra: IbgeSidraSource
  private repo: LeadsRepository
  private queue: EnrichmentQueue

  /** Controle de lotes em execução (key = batchId). */
  private activeBatches = new Map<string, { cancelled: boolean }>()

  public dou: DOUSource
  public socios: SocioExpansionSource

  /** Exposição pública do registry — necessária para scripts que precisam iterar TODOS os leads sem cap de pageSize. */
  public get sourcesRegistry() { return this.sources }

  constructor(storageDir: string) {
    this.pgfn = new PGFNSource(storageDir)
    this.dou = new DOUSource(storageDir)
    this.socios = new SocioExpansionSource(storageDir)
    // O registry é o ponto único de consulta a "todos os leads crus".
    // Wave Prospecção 4 (2026-04-23): +DOU (falências/RJ/leilões) +Sócios PF agro.
    this.sources = new LeadSourceRegistry(storageDir, [this.pgfn, this.dou, this.socios])
    this.brasil = new BrasilAPISource()
    this.area = new AreaEstimator()
    this.scorer = new ScoringEngine()
    this.sicar = getSICARClient()
    this.sicarIndex = new SICARIndex(storageDir)
    this.geo = getGeoEnrichmentSource()
    this.nasaPower = getNasaPowerSource()
    this.ibgeSidra = getIbgeSidraSource()
    this.repo = new LeadsRepository(storageDir)
    this.queue = new EnrichmentQueue(storageDir)
    this.queue.setRunner(async (cpfCnpj) => {
      const enriched = await this.enrichLead(cpfCnpj)
      if (!enriched) throw new Error('enrichLead devolveu null')
    })
    this.queue.start()
  }

  /** Acesso à fila persistente — usado pelas rotas REST. */
  getQueue(): EnrichmentQueue {
    return this.queue
  }

  /**
   * Enfileira CPF/CNPJs que batem os filtros — mesmo predicado usado no
   * `enriquecerLote` antigo, mas agora persiste os jobs e retorna imediato.
   * O drainer da fila executa em background com backoff por falha.
   */
  enfileirarLote(
    filters: ProspeccaoFilters,
    opts: { prioridade?: JobPrioridade; motivo?: string } = {},
  ): { batchId: string; enfileirados: number; jaNaFila: number; total: number } {
    const targets = this.buildBatchTargets(filters)

    const res = this.queue.enqueueBatch({
      cpfCnpjs: targets.map(({ raw }) => raw.cpfCnpj),
      prioridade: opts.prioridade ?? 'normal',
      motivo: opts.motivo ?? `lote filtros=${JSON.stringify(filters)}`,
    })
    return { ...res, total: targets.length }
  }

  private normalizeToken(value: string | undefined | null): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
  }

  private deriveAgroProfile(lead: LeadFull): AgroProfile {
    const evidencias: string[] = []
    const nome = this.normalizeToken(lead.nome)
    const sinais = lead.agroSignals.map((signal) => this.normalizeToken(signal))
    let score = 0

    if (lead.car) {
      score += 50
      evidencias.push(`CAR ${lead.car.codImovel} encontrado`)
    } else if ((lead.area.hectaresSicar ?? 0) > 0 || lead.area.metodo === 'sicar') {
      score += 45
      evidencias.push('área oficial confirmada no SICAR')
    }

    if (lead.cnpj?.cnaeFiscal && isAgroCnae(lead.cnpj.cnaeFiscal)) {
      score += 25
      evidencias.push(`CNAE agro ${lead.cnpj.cnaeFiscal}`)
    }

    if (lead.area.hectaresEstimados >= 5000) {
      score += 18
      evidencias.push(`porte fundiário muito alto (${Math.round(lead.area.hectaresEstimados)} ha)`)
    } else if (lead.area.hectaresEstimados >= 1000) {
      score += 14
      evidencias.push(`porte fundiário alto (${Math.round(lead.area.hectaresEstimados)} ha)`)
    } else if (lead.area.hectaresEstimados >= 100) {
      score += 8
      evidencias.push(`área estimada relevante (${Math.round(lead.area.hectaresEstimados)} ha)`)
    }

    if (sinais.length >= 3) {
      score += 18
      evidencias.push(`${sinais.length} sinais agro convergentes`)
    } else if (sinais.length >= 1) {
      score += 8
      evidencias.push('sinal agro público presente')
    }

    if (
      ['AGROPECUARIA', 'AGRICOLA', 'AGROINDUSTRIAL', 'FAZENDA', 'SOJA', 'GRAOS', 'PECUARIA', 'RURAL']
        .some((token) => nome.includes(token))
    ) {
      score += 15
      evidencias.push('nome com vocabulário agro forte')
    }

    if ((lead.sources?.length ?? 1) >= 2) {
      score += 8
      evidencias.push(`cruzado em ${lead.sources?.length ?? 1} fontes`)
    }

    if (lead.tipoPessoa === 'PF' && sinais.some((signal) => signal.startsWith('PJ_ORIGEM:') || signal.startsWith('SOCIO:'))) {
      score += 12
      evidencias.push('PF ancorado em PJ agro relacionada')
    }

    score = Math.min(100, score)
    const nivel = score >= 65 ? 'forte' : score >= 35 ? 'medio' : 'fraco'
    return {
      nivel,
      provavel: score >= 35,
      score,
      explicacao: evidencias.length ? evidencias.slice(0, 3).join(' · ') : 'Sem evidência agro suficiente',
      evidencias,
    }
  }

  private deriveJudicialProfile(lead: LeadFull): JudicialProfile {
    const evidencias: string[] = []
    const tipos = new Set<JudicialTipo>()
    const sinais = lead.agroSignals.map((signal) => this.normalizeToken(signal))
    const situacaoEspecial = this.normalizeToken(lead.cnpj?.situacaoEspecial)
    const motivoSituacao = this.normalizeToken(lead.cnpj?.motivoSituacaoCadastral)

    if (sinais.some((signal) => signal.includes('DOU:RECUPERACAO-JUDICIAL'))) {
      tipos.add('recuperacao_judicial')
      evidencias.push('DOU com recuperação judicial')
    }
    if (sinais.some((signal) => signal.includes('DOU:FALENCIA') || signal.includes('DOU:DECRETADA-A-FALENCIA'))) {
      tipos.add('falencia')
      evidencias.push('DOU com falência')
    }
    if (sinais.some((signal) => signal.includes('DOU:INSOLVENCIA'))) {
      tipos.add('insolvencia')
      evidencias.push('DOU com insolvência')
    }
    if (sinais.some((signal) => signal.includes('DOU:LEILAO'))) {
      tipos.add('leilao')
      evidencias.push('DOU com leilão judicial')
    }
    if (sinais.some((signal) => signal.includes('DOU:PENHORA'))) {
      tipos.add('penhora')
      evidencias.push('DOU com penhora')
    }
    if (situacaoEspecial.includes('LIQUIDACAO JUDICIAL')) {
      tipos.add('liquidacao_judicial')
      evidencias.push(`situação especial: ${lead.cnpj?.situacaoEspecial}`)
    }
    if (situacaoEspecial.includes('RECUPERACAO JUDICIAL')) {
      tipos.add('recuperacao_judicial')
      evidencias.push(`situação especial: ${lead.cnpj?.situacaoEspecial}`)
    }
    if (situacaoEspecial.includes('FALEN')) {
      tipos.add('falencia')
      evidencias.push(`situação especial: ${lead.cnpj?.situacaoEspecial}`)
    }
    if (situacaoEspecial.includes('JUDICIAL') || motivoSituacao.includes('FALEN') || motivoSituacao.includes('INSOLVEN')) {
      tipos.add('situacao_especial')
      if (lead.cnpj?.motivoSituacaoCadastral) evidencias.push(`motivo cadastral: ${lead.cnpj.motivoSituacaoCadastral}`)
    }

    const orderedTipos = Array.from(tipos)
    const severidade = orderedTipos.some((tipo) => ['falencia', 'liquidacao_judicial', 'recuperacao_judicial'].includes(tipo))
      ? 'alta'
      : orderedTipos.some((tipo) => ['insolvencia', 'leilao', 'penhora'].includes(tipo))
        ? 'media'
        : orderedTipos.length
          ? 'baixa'
          : 'nenhuma'

    return {
      ativo: orderedTipos.length > 0,
      severidade,
      tipos: orderedTipos,
      explicacao: evidencias.length ? evidencias.slice(0, 3).join(' · ') : 'Sem sinal judicial estruturado',
      evidencias,
    }
  }

  private derivePfProfile(
    lead: LeadFull,
    agroProfile: AgroProfile,
    judicialProfile: JudicialProfile,
  ): PfProfile {
    if (lead.tipoPessoa !== 'PF') {
      return {
        relevante: false,
        nivel: 'nenhum',
        score: 0,
        explicacao: 'Lead PJ — perfil PF não se aplica',
        evidencias: [],
      }
    }

    const evidencias: string[] = []
    const sinais = lead.agroSignals.map((signal) => this.normalizeToken(signal))
    let score = 0

    if (agroProfile.provavel) {
      score += agroProfile.nivel === 'forte' ? 35 : 20
      evidencias.push(`vínculo agro ${agroProfile.nivel}`)
    }
    if (lead.car) {
      score += 35
      evidencias.push('CAR em nome do lead')
    }
    if (sinais.some((signal) => signal.startsWith('SOCIO:'))) {
      score += 25
      evidencias.push('sócio/administrador de PJ agro')
    }
    if (sinais.some((signal) => signal.startsWith('PJ_ORIGEM:'))) {
      score += 20
      evidencias.push('âncora societária em PJ de origem')
    }
    if (lead.totalDivida > 0) {
      score += 20
      evidencias.push('passivo próprio na PGFN')
    }
    if ((lead.sources?.length ?? 1) >= 2) {
      score += 15
      evidencias.push(`presença em ${lead.sources?.length ?? 1} fontes`)
    }
    if (judicialProfile.ativo) {
      score += 10
      evidencias.push('sinal judicial público associado')
    }

    score = Math.min(100, score)
    const nivel = score >= 70 ? 'forte' : score >= 40 ? 'medio' : score > 0 ? 'fraco' : 'nenhum'
    return {
      relevante: score >= 40,
      nivel,
      score,
      explicacao: evidencias.length ? evidencias.slice(0, 3).join(' · ') : 'PF sem âncora rural suficiente',
      evidencias,
    }
  }

  private applyDerivedProfiles(lead: LeadFull): LeadFull {
    const agroProfile = this.deriveAgroProfile(lead)
    const judicialProfile = this.deriveJudicialProfile(lead)
    const pfProfile = this.derivePfProfile(lead, agroProfile, judicialProfile)
    return {
      ...lead,
      agroProfile,
      judicialProfile,
      pfProfile,
    }
  }

  private matchesFilters(lead: LeadFull, filters: ProspeccaoFilters): boolean {
    const uf = filters.uf
      ? Array.isArray(filters.uf)
        ? filters.uf.map((value) => value.toUpperCase())
        : [filters.uf.toUpperCase()]
      : null
    const termo = filters.termo?.toUpperCase().trim() || null
    const status = filters.status || 'todos'

    if (status === 'todos') {
      if (lead.status === 'excluido') return false
    } else if (lead.status !== status) {
      return false
    }

    if (uf && !uf.includes(lead.uf)) return false
    if (filters.minDivida != null && lead.totalDivida < filters.minDivida) return false
    if (filters.maxDivida != null && lead.totalDivida > filters.maxDivida) return false
    if (filters.minHectares != null && lead.area.hectaresEstimados < filters.minHectares) return false
    if (filters.tipoPessoa && lead.tipoPessoa !== filters.tipoPessoa) return false
    if (filters.apenasAjuizadas && !lead.temAjuizada) return false
    if (filters.cnaeAgro && (!lead.cnpj?.cnaeFiscal || !isAgroCnae(lead.cnpj.cnaeFiscal))) return false
    if (filters.apenasAgroProvavel && !lead.agroProfile.provavel) return false
    if (filters.apenasPfRural && !lead.pfProfile.relevante) return false
    if (filters.apenasJudicialAgro && !lead.judicialProfile.ativo) return false
    if (filters.judicialTipos?.length && !filters.judicialTipos.some((tipo) => lead.judicialProfile.tipos.includes(tipo))) return false
    if (termo) {
      const hay = (lead.nome + ' ' + lead.cpfCnpj).toUpperCase()
      if (!hay.includes(termo)) return false
    }
    return true
  }

  private buildBatchTargets(filters: ProspeccaoFilters): Array<{ raw: LeadRaw; lead: LeadFull }> {
    const sort = filters.sortBy || 'score'
    const pageSize = filters.pageSize && filters.pageSize > 0 ? Math.floor(filters.pageSize) : undefined

    const targets = this.sources.all()
      .map((raw) => {
        const lead = this.buildBasic(raw)
        return { raw, lead }
      })
      .filter(({ lead }) => lead.status !== 'completa' && this.matchesFilters(lead, filters))

    targets.sort((a, b) => {
      switch (sort) {
        case 'divida':
          return b.lead.totalDivida - a.lead.totalDivida
        case 'hectares':
          return b.lead.area.hectaresEstimados - a.lead.area.hectaresEstimados
        case 'recencia':
          return (b.lead.ultimaInscricao || '').localeCompare(a.lead.ultimaInscricao || '')
        case 'score':
        default:
          return b.lead.score.total - a.lead.score.total
      }
    })

    return pageSize ? targets.slice(0, pageSize) : targets
  }

  /**
   * Monta o LeadFull a partir do raw — usa enrichment persistido se houver,
   * caso contrário computa versão "básica" com score e estimativa de área.
   */
  private buildBasic(raw: LeadRaw): LeadFull {
    const saved = this.repo.getEnriched(raw.cpfCnpjClean)
    if (saved) {
      const area = saved.area ?? this.area.estimate(raw, saved.cnpj ?? null)
      const score = this.scorer.score(raw, area)
      const mergedSaved: LeadFull = {
        ...saved,
        cpfCnpj: raw.cpfCnpj,
        cpfCnpjClean: raw.cpfCnpjClean,
        tipoPessoa: raw.tipoPessoa,
        nome: raw.nome,
        uf: raw.uf || saved.uf,
        agroSignals: raw.agroSignals,
        totalDivida: raw.totalDivida,
        qtdInscricoes: raw.qtdInscricoes,
        temAjuizada: raw.temAjuizada,
        primeiraInscricao: raw.primeiraInscricao,
        ultimaInscricao: raw.ultimaInscricao,
        debts: raw.debts,
        judicialEvents: raw.judicialEvents,
        sources: raw.sources,
        area,
        score,
      }
      return this.withStatus(mergedSaved, 'completa')
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
      judicialEvents: raw.judicialEvents,
      sources: raw.sources,
      area,
      score,
      agroProfile: { nivel: 'fraco', provavel: false, score: 0, explicacao: '', evidencias: [] },
      pfProfile: { relevante: false, nivel: 'nenhum', score: 0, explicacao: '', evidencias: [] },
      judicialProfile: { ativo: false, severidade: 'nenhuma', tipos: [], explicacao: '', evidencias: [] },
    }
    return this.withStatus(full, 'pendente')
  }

  /** Decora lead com `status`/`excluidoMotivo` com base na blacklist e cache. */
  private withStatus(lead: LeadFull, baseStatus: LeadStatus): LeadFull {
    const out: LeadFull = this.applyDerivedProfiles({
      ...lead,
      status: baseStatus,
      enriquecido: baseStatus === 'completa',
    })
    const black = this.repo.getBlacklistEntry(lead.cpfCnpjClean)
    if (black) {
      out.status = 'excluido'
      out.excluidoMotivo = black.motivo
      out.excluidoEm = black.excluidoEm
    }
    const feedback = this.repo.getFeedback(lead.cpfCnpjClean)
    if (feedback) {
      out.feedback = feedback
      out.contatos = this.repo.getContatos(lead.cpfCnpjClean)
      const total = Math.max(0, Math.min(100, lead.score.total + feedback.ajusteScore))
      let classificacao: typeof lead.score.classificacao
      if (total >= 75) classificacao = 'quente'
      else if (total >= 55) classificacao = 'morno'
      else if (total >= 35) classificacao = 'frio'
      else classificacao = 'reativo'
      out.score = { ...lead.score, total, classificacao }
    }
    return out
  }

  /**
   * Registra outcome de contato. Se o tipo for "de porta fechada" (recusou,
   * ja_regularizou, nao_agro, fora_target), move o lead para blacklist.
   */
  registrarContato(
    cpfCnpj: string,
    params: {
      tipo: ContactOutcomeTipo
      canal?: ContactOutcome['canal']
      notas?: string
      registradoPor?: string
    }
  ): { outcome: ContactOutcome; lead?: LeadFull; excluido?: BlacklistEntry } | null {
    const raw = this.sources.find(cpfCnpj)
    if (!raw) return null
    const outcome = this.repo.addContato({
      cpfCnpj: raw.cpfCnpj,
      cpfCnpjClean: raw.cpfCnpjClean,
      tipo: params.tipo,
      canal: params.canal,
      notas: params.notas,
      registradoPor: params.registradoPor,
    })
    const motivoExclusao = OUTCOMES_QUE_EXCLUEM[params.tipo]
    let excluido: BlacklistEntry | undefined
    if (motivoExclusao) {
      const motivoCompleto = params.notas ? `${motivoExclusao}: ${params.notas}` : motivoExclusao
      excluido = this.repo.addToBlacklist(
        { cpfCnpj: raw.cpfCnpj, cpfCnpjClean: raw.cpfCnpjClean },
        motivoCompleto,
      )
    }
    const lead = this.buildBasic(raw)
    return { outcome, lead, excluido }
  }

  /** Lista de hot-leads pendentes — quente sem contato recente. */
  hotLeads(opts?: { limite?: number; diasSemContato?: number }): HotLeadAlert[] {
    const limite = opts?.limite ?? 20
    const diasMin = opts?.diasSemContato ?? 14
    const alerts: HotLeadAlert[] = []
    const hoje = Date.now()

    for (const raw of this.sources.all()) {
      const lead = this.buildBasic(raw)
      if (lead.status === 'excluido') continue
      if (lead.score.classificacao !== 'quente') continue

      const ultimoContatoEm = lead.feedback?.ultimoContatoEm
      const diasSemContato = ultimoContatoEm
        ? Math.floor((hoje - new Date(ultimoContatoEm).getTime()) / 86_400_000)
        : Number.POSITIVE_INFINITY

      if (diasSemContato < diasMin) continue

      // Motivo textual + urgência
      const sinais: string[] = []
      if (lead.temAjuizada) sinais.push('ajuizado')
      if (lead.score.breakdown.velocity >= 8) sinais.push('passivo acelerando')
      if (lead.score.breakdown.fitRegional >= 12) sinais.push('UF core')
      if (lead.area.hectaresEstimados >= 1000) sinais.push(`${Math.round(lead.area.hectaresEstimados)}ha`)

      let urgencia: HotLeadAlert['urgencia']
      if (lead.score.total >= 85 && diasSemContato >= 30) urgencia = 'imediata'
      else if (lead.score.total >= 80 || diasSemContato >= 30) urgencia = 'alta'
      else urgencia = 'media'

      const motivo = sinais.length
        ? `Quente (${lead.score.total}) · ${sinais.join(' · ')}`
        : `Quente (${lead.score.total}) · aguardando primeiro contato`

      alerts.push({
        cpfCnpj: lead.cpfCnpj,
        cpfCnpjClean: lead.cpfCnpjClean,
        nome: lead.nome,
        uf: lead.uf,
        scoreTotal: lead.score.total,
        classificacao: lead.score.classificacao,
        honorariosEstimados: lead.score.honorariosEstimados,
        totalDivida: lead.totalDivida,
        ultimoContatoEm,
        diasSemContato: Number.isFinite(diasSemContato) ? diasSemContato : 9999,
        urgencia,
        motivo,
      })
    }

    alerts.sort((a, b) => {
      const u = (x: HotLeadAlert) => (x.urgencia === 'imediata' ? 3 : x.urgencia === 'alta' ? 2 : 1)
      const du = u(b) - u(a)
      if (du !== 0) return du
      return b.scoreTotal - a.scoreTotal
    })
    return alerts.slice(0, limite)
  }

  /** Leads com outcome "retornar" ou "interessado" prontos para reengajamento. */
  leadsParaReengajar(limite = 20): LeadFull[] {
    const out: LeadFull[] = []
    for (const raw of this.sources.all()) {
      const lead = this.buildBasic(raw)
      if (lead.status === 'excluido') continue
      if (lead.feedback?.reengajar) out.push(lead)
    }
    out.sort((a, b) => b.score.total - a.score.total)
    return out.slice(0, limite)
  }

  listarContatos(cpfCnpj: string): ContactOutcome[] {
    const clean = cpfCnpj.replace(/\D/g, '')
    return this.repo.getContatos(clean)
  }

  buscar(filters: ProspeccaoFilters): {
    total: number
    leads: LeadFull[]
    page: number
    pageSize: number
    counts: { pendentes: number; completas: number; excluidos: number; todos: number }
  } {
    const all = this.sources.all().map((r) => this.buildBasic(r))

    const counts = {
      todos: all.filter((l) => l.status !== 'excluido').length,
      pendentes: all.filter((l) => l.status === 'pendente').length,
      completas: all.filter((l) => l.status === 'completa').length,
      excluidos: all.filter((l) => l.status === 'excluido').length,
    }

    const filtered = all.filter((l) => this.matchesFilters(l, filters))

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
    const raw = this.sources.find(cpfCnpj)
    if (!raw) return null
    return this.buildBasic(raw)
  }

  /** Enriquece: chama BrasilAPI, recomputa área com capital social + CNAE, rescore, persiste. */
  async enrichLead(cpfCnpj: string, codImovel?: string): Promise<LeadFull | null> {
    const raw = this.sources.find(cpfCnpj)
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
      judicialEvents: raw.judicialEvents,
      sources: raw.sources,
      cnpj: cnpjInfo || undefined,
      area,
      car: carInfo,
      carSource,
      carOutrosImoveis,
      enriquecidoEm: new Date().toISOString(),
      score,
      agroProfile: { nivel: 'fraco', provavel: false, score: 0, explicacao: '', evidencias: [] },
      pfProfile: { relevante: false, nivel: 'nenhum', score: 0, explicacao: '', evidencias: [] },
      judicialProfile: { ativo: false, severidade: 'nenhuma', tipos: [], explicacao: '', evidencias: [] },
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
    const raw = this.sources.find(cpfCnpj)
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
    const raw = this.sources.find(cpfCnpj)
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

    const targets = this.buildBatchTargets(filters).map(({ raw }) => raw)

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
    let jaCompletos = 0
    for (const raw of this.sources.all()) {
      const decorated = this.buildBasic(raw)
      if (decorated.status === 'completa' && this.matchesFilters(decorated, filters)) {
        jaCompletos++
      }
    }

    const targets = this.buildBatchTargets(filters).map(({ raw }) => raw)

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
    const all = this.sources.all().map((r) => this.buildBasic(r))
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
    const leadsAgroProvavel = ativos.filter((l) => l.agroProfile.provavel).length
    const leadsPfRural = ativos.filter((l) => l.pfProfile.relevante).length
    const leadsJudicialAgro = ativos.filter((l) => l.judicialProfile.ativo).length

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

    const judicialMap = new Map<JudicialTipo, number>()
    for (const lead of ativos) {
      for (const tipo of lead.judicialProfile.tipos) {
        judicialMap.set(tipo, (judicialMap.get(tipo) || 0) + 1)
      }
    }
    const porJudicialTipo = Array.from(judicialMap.entries())
      .map(([tipo, count]) => ({ tipo, count }))
      .sort((a, b) => b.count - a.count)

    // Feedback loop: contagens derivadas dos contatos registrados. Usamos o
    // universo `ativos` (já excluída blacklist) para manter consistência com
    // os demais KPIs da tela.
    const hoje = Date.now()
    let hotLeadsPendentes = 0
    let leadsParaReengajar = 0
    for (const l of ativos) {
      if (l.score.classificacao === 'quente') {
        const diasSemContato = l.feedback?.ultimoContatoEm
          ? Math.floor((hoje - new Date(l.feedback.ultimoContatoEm).getTime()) / 86_400_000)
          : Number.POSITIVE_INFINITY
        if (diasSemContato >= 14) hotLeadsPendentes++
      }
      if (l.feedback?.reengajar) leadsParaReengajar++
    }

    const manifests = this.sources.manifests()
    const principal = manifests[0]
    return {
      totalLeads,
      totalDivida,
      honorariosPotenciaisTotal,
      leadsQuentes,
      leadsComAjuizamento,
      leadsCompletos,
      leadsExcluidos,
      leadsAgroProvavel,
      leadsPfRural,
      leadsJudicialAgro,
      hotLeadsPendentes,
      leadsParaReengajar,
      porUf,
      porFaixaDivida,
      porJudicialTipo,
      topSignals,
      manifest: {
        fonte: principal?.descricao || 'PGFN Dívida Ativa',
        atualizadoEm: principal?.lastIngestAt || new Date().toISOString(),
      },
      fontes: manifests.map((m) => ({
        fonte: m.fonte,
        descricao: m.descricao,
        contagem: m.contagem,
        lastIngestAt: m.lastIngestAt,
      })),
    }
  }

  /** Manifest detalhado de todas as fontes — consumido por rotas REST. */
  listarFontes(): LeadSourceManifest[] {
    return this.sources.manifests()
  }

  /** Recarrega o registry — útil após ingest offline. */
  recarregarFontes(): void {
    this.sources.reload()
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

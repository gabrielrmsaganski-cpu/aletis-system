import { createHash } from 'crypto'
import { calcularSRAI, type SraiInput } from '../ScoreSRAI.js'
import { verificarABS, type AbsInput } from '../VerificadorABS.js'
import { recalcularDivida, projetarFluxoCaixa, type ResultadoRecalculo } from '../../lib/financeiro.js'
import { projetarFluxoPlurianual } from '../../lib/calculadoras-premium.js'
import { getFinanceiroService } from '../financeiro/FinanceiroService.js'
import { getAnalisesRepository } from './AnalisesRepository.js'
import { getSmartAdvisor } from './advisor/SmartAdvisor.js'
import { ANALISE_VERSAO, type AnaliseCliente } from './types.js'

/* ========================================================================
 * Tipos mínimos do Cliente usados pelo orquestrador.
 * Evitamos importar de `routes/clientes.ts` (circular). Qualquer objeto com
 * este shape é suficiente — o orquestrador não muta o cliente original.
 * ======================================================================== */

export interface ClienteParaAnalise {
  id: string
  nome: string
  cpfCnpj: string
  cidade?: string
  uf?: string
  atividade?: string
  areaTotalHa?: number
  culturas?: string[]
  valorTotalDivida: number
  valorTotalPago: number
  dividas: Array<{
    contrato: string
    valorOriginal: number
    valorAtualizado: number
    vencimento: string
    status: 'ativa' | 'renegociada' | 'paga' | 'em_acordo'
    credor: string
  }>
  pagamentos: Array<{ data: string; valor: number; descricao?: string }>
  timeline: Array<{ data: string; tipo: string; descricao: string }>
  car?: {
    codImovel?: string
    areaImovel?: number
    areaReservaLegal?: number
    areaVegetacaoNativa?: number
    modulosFiscais?: number
    condicaoCadastro?: string
  }
  carStatus?: { status: string }
  cnpjInfo?: {
    situacaoCadastral?: string
    optantePeloSimples?: boolean | null
  }
  clima?: {
    tempMediaAnualC?: number | null
    chuvaAcumuladaAnualMm?: number | null
  }
  leadOrigem?: {
    temAjuizada?: boolean
  }
  exposicaoCommodity?: Array<{
    commodity: string
    areaHa: number
    produtividade: number
    precoReferencia: number
  }>
  proximaAcao?: { data: string; descricao: string }
}

/* ========================================================================
 *  Input builders — mapeiam Cliente → SraiInput/AbsInput.
 *  Exportados para que rotas legadas (GET /srai, GET /abs) reusem o mesmo
 *  mapper que o orquestrador. Sem this builder o código dobrava.
 * ======================================================================== */

const MS_DIA = 86_400_000
const CHUVA_NORMAL_MM = 1500

export function buildSraiInput(cliente: ClienteParaAnalise): SraiInput {
  const hoje = Date.now()
  const diasAtrasoMaximo = cliente.dividas.reduce((max, d) => {
    if (d.status === 'paga') return max
    const venc = new Date(d.vencimento).getTime()
    if (!Number.isFinite(venc)) return max
    const dias = Math.floor((hoje - venc) / MS_DIA)
    return dias > max ? dias : max
  }, 0)

  const ultimoContato = cliente.timeline
    .filter((t) => t.tipo === 'contato' || t.tipo === 'reuniao')
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0]

  const diasUltimoContato = ultimoContato
    ? Math.floor((hoje - new Date(ultimoContato.data).getTime()) / MS_DIA)
    : 365

  const chuva = cliente.clima?.chuvaAcumuladaAnualMm
  const anomaliaChuvaPct =
    chuva && chuva > 0 ? ((chuva - CHUVA_NORMAL_MM) / CHUVA_NORMAL_MM) * 100 : undefined

  return {
    valorTotalDivida: cliente.valorTotalDivida,
    valorTotalPago: cliente.valorTotalPago,
    numeroContratosAtivos: cliente.dividas.filter((d) => d.status !== 'paga').length,
    temAjuizamento: cliente.leadOrigem?.temAjuizada ?? false,
    diasAtrasoMaximo: Math.max(0, diasAtrasoMaximo),
    areaTotalHa: cliente.areaTotalHa ?? 0,
    culturas: cliente.culturas ?? [],
    temCar: !!cliente.car,
    carCondicao: cliente.car?.condicaoCadastro,
    anomaliaChuvaPct,
    tempMediaAnualC: cliente.clima?.tempMediaAnualC ?? undefined,
    exposicaoDiversificada: (cliente.exposicaoCommodity?.length ?? 0) >= 2,
    diasUltimoContato,
    temProximaAcao: !!cliente.proximaAcao,
  }
}

export function buildAbsInput(
  cliente: ClienteParaAnalise,
  praticas?: { plantioDireto?: boolean; ilpf?: boolean; prada?: boolean },
): AbsInput {
  const chuva = cliente.clima?.chuvaAcumuladaAnualMm
  const anomaliaChuvaPct =
    chuva && chuva > 0 ? ((chuva - CHUVA_NORMAL_MM) / CHUVA_NORMAL_MM) * 100 : undefined

  return {
    temCar: !!cliente.car,
    carCondicao: cliente.car?.condicaoCadastro,
    carStatus: cliente.carStatus?.status,
    areaImovel: cliente.car?.areaImovel,
    areaReservaLegal: cliente.car?.areaReservaLegal,
    areaVegetacaoNativa: cliente.car?.areaVegetacaoNativa,
    modulosFiscais: cliente.car?.modulosFiscais,
    temAjuizamento: cliente.leadOrigem?.temAjuizada ?? false,
    situacaoCadastralCnpj: cliente.cnpjInfo?.situacaoCadastral,
    optantePeloSimples: cliente.cnpjInfo?.optantePeloSimples,
    culturas: cliente.culturas ?? [],
    atividade: cliente.atividade,
    temPlantioDireto: praticas?.plantioDireto ?? false,
    temIntegracaoLPF: praticas?.ilpf ?? false,
    temPlanoRecuperacao: praticas?.prada ?? false,
    anomaliaChuvaPct,
  }
}

/* ========================================================================
 *  Hash do input para idempotência — canonicaliza a parte do cliente que
 *  afeta o output das calculadoras. Qualquer mudança invalida o snapshot.
 * ======================================================================== */

function canonicalInputHash(cliente: ClienteParaAnalise): string {
  const canon = {
    cpfCnpj: cliente.cpfCnpj,
    valorTotalDivida: cliente.valorTotalDivida,
    valorTotalPago: cliente.valorTotalPago,
    dividas: [...cliente.dividas]
      .sort((a, b) => a.contrato.localeCompare(b.contrato))
      .map((d) => [d.contrato, d.valorOriginal, d.valorAtualizado, d.vencimento, d.status, d.credor]),
    pagamentos: [...cliente.pagamentos]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((p) => [p.data, p.valor]),
    areaTotalHa: cliente.areaTotalHa ?? 0,
    culturas: [...(cliente.culturas ?? [])].sort(),
    car: cliente.car
      ? [cliente.car.codImovel, cliente.car.condicaoCadastro, cliente.car.areaImovel, cliente.car.areaReservaLegal, cliente.car.modulosFiscais]
      : null,
    cnpj: cliente.cnpjInfo ? [cliente.cnpjInfo.situacaoCadastral, cliente.cnpjInfo.optantePeloSimples] : null,
    clima: cliente.clima ? [cliente.clima.tempMediaAnualC, cliente.clima.chuvaAcumuladaAnualMm] : null,
    ajuizada: cliente.leadOrigem?.temAjuizada ?? false,
    exposicao: [...(cliente.exposicaoCommodity ?? [])]
      .sort((a, b) => a.commodity.localeCompare(b.commodity))
      .map((e) => [e.commodity, e.areaHa, e.produtividade, e.precoReferencia]),
    proximaAcao: cliente.proximaAcao ? [cliente.proximaAcao.data, cliente.proximaAcao.descricao] : null,
    ultimoContato: cliente.timeline
      .filter((t) => t.tipo === 'contato' || t.tipo === 'reuniao')
      .map((t) => t.data)
      .sort()
      .slice(-1)[0] ?? null,
    versao: ANALISE_VERSAO,
  }
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex')
}

/* ========================================================================
 *  Calculadoras derivadas — saldo recalculado, projeção plurianual, fluxo.
 *  Cada uma é best-effort: erros vão para `erros` e NÃO abortam o snapshot.
 * ======================================================================== */

const TAXA_MENSAL_PADRAO = 1.5 // % ao mês — default conservador p/ dívida rural

function calcularSaldoRecalculado(
  cliente: ClienteParaAnalise,
): AnaliseCliente['saldoRecalculado'] {
  const ativas = cliente.dividas.filter((d) => d.status !== 'paga')
  if (ativas.length === 0) return null

  const dataCorte = new Date().toISOString().slice(0, 10)
  const hoje = new Date().getTime()
  const porDivida: NonNullable<AnaliseCliente['saldoRecalculado']>['porDivida'] = []

  let totalValorOriginal = 0
  let totalValorAtualizado = 0
  let totalSaldo = 0
  let totalJuros = 0

  for (const d of ativas) {
    try {
      const venc = new Date(d.vencimento).getTime()
      if (!Number.isFinite(venc)) continue
      // Start date = vencimento (início da cobrança de juros moratórios).
      // Pagamentos não são mapeados por-dívida (são client-wide); usar [].
      const dias = Math.max(0, Math.floor((hoje - venc) / MS_DIA))
      let resultado: ResultadoRecalculo | null = null
      if (dias > 0) {
        resultado = recalcularDivida(d.valorOriginal, d.vencimento, TAXA_MENSAL_PADRAO, [], dataCorte)
      }
      const saldoFinal = resultado ? resultado.saldoAtualizado : d.valorOriginal
      const juros = resultado ? resultado.totalJuros : 0

      totalValorOriginal += d.valorOriginal
      totalValorAtualizado += d.valorAtualizado
      totalSaldo += saldoFinal
      totalJuros += juros

      porDivida.push({
        contrato: d.contrato,
        credor: d.credor,
        valorOriginal: Number(d.valorOriginal.toFixed(2)),
        valorAtualizado: Number(d.valorAtualizado.toFixed(2)),
        saldoRecalculado: Number(saldoFinal.toFixed(2)),
        jurosAcumulados: Number(juros.toFixed(2)),
        diasDesdeVencimento: dias,
        detalhamento: resultado?.detalhamento ?? [],
      })
    } catch {
      // ignora dívida malformada — demais seguem
    }
  }

  return {
    taxaMensalPadrao: TAXA_MENSAL_PADRAO,
    dataCorte,
    totalValorOriginal: Number(totalValorOriginal.toFixed(2)),
    totalValorAtualizado: Number(totalValorAtualizado.toFixed(2)),
    totalSaldoRecalculado: Number(totalSaldo.toFixed(2)),
    totalJurosAcumulados: Number(totalJuros.toFixed(2)),
    porDivida,
  }
}

/** Extrai cultura+produtividade+preço a partir de exposicaoCommodity ou defaults. */
function culturaDominante(cliente: ClienteParaAnalise): {
  cultura: string
  areaHa: number
  produtividade: number
  precoSaca: number
  custoHa: number
} | null {
  // Prefer exposição cadastrada — é a fonte mais confiável
  const topExp = (cliente.exposicaoCommodity ?? [])
    .slice()
    .sort((a, b) => b.areaHa - a.areaHa)[0]
  if (topExp) {
    return {
      cultura: topExp.commodity,
      areaHa: topExp.areaHa,
      produtividade: topExp.produtividade,
      precoSaca: topExp.precoReferencia,
      custoHa: custoPadraoPorCultura(topExp.commodity),
    }
  }

  // Fallback: cultura textual do cadastro + defaults regionais
  const cult = (cliente.culturas ?? [])[0]?.toLowerCase().trim()
  if (!cult || !cliente.areaTotalHa || cliente.areaTotalHa <= 0) return null
  return {
    cultura: cult,
    areaHa: cliente.areaTotalHa,
    produtividade: produtividadePadrao(cult),
    precoSaca: precoPadrao(cult),
    custoHa: custoPadraoPorCultura(cult),
  }
}

function produtividadePadrao(c: string): number {
  if (/soja/.test(c)) return 60 // sc/ha
  if (/milho/.test(c)) return 150
  if (/trigo/.test(c)) return 45
  if (/algod/.test(c)) return 280 // @/ha
  if (/cana/.test(c)) return 80 // t/ha
  return 50
}
function precoPadrao(c: string): number {
  if (/soja/.test(c)) return 135
  if (/milho/.test(c)) return 65
  if (/trigo/.test(c)) return 90
  if (/algod/.test(c)) return 130
  if (/cana/.test(c)) return 120
  return 100
}
function custoPadraoPorCultura(c: string): number {
  if (/soja/.test(c)) return 5500 // R$/ha
  if (/milho/.test(c)) return 6500
  if (/trigo/.test(c)) return 4500
  if (/algod/.test(c)) return 14000
  if (/cana/.test(c)) return 7000
  return 5000
}

function calcularProjecao5Safras(cliente: ClienteParaAnalise): AnaliseCliente['projecao5Safras'] {
  const c = culturaDominante(cliente)
  if (!c) return null
  const anoBase = new Date().getFullYear()
  try {
    return projetarFluxoPlurianual({
      anoBase,
      cultura: c.cultura,
      areaHa: c.areaHa,
      produtividadeAtual: c.produtividade,
      precoSacaAtual: c.precoSaca,
      custoHa: c.custoHa,
      dividasExistentes: cliente.dividas
        .filter((d) => d.status !== 'paga')
        .map((d) => ({ descricao: d.contrato, valor: d.valorAtualizado, vencimento: d.vencimento })),
    })
  } catch {
    return null
  }
}

function calcularFluxoSafra(cliente: ClienteParaAnalise): AnaliseCliente['fluxoCaixaSafra'] {
  const c = culturaDominante(cliente)
  if (!c) return null
  const anoBase = new Date().getFullYear()
  // Safra padrão: plantio out/ano, colheita mar/ano+1 — razoavelmente neutro
  const dataPlantio = `${anoBase}-10-15`
  const dataColheita = `${anoBase + 1}-03-15`
  try {
    return projetarFluxoCaixa({
      cultura: c.cultura,
      areaTotalHa: c.areaHa,
      produtividadeSacasHa: c.produtividade,
      precoSacaAtual: c.precoSaca,
      custoHa: c.custoHa,
      dataPlantio,
      dataColheita,
      dividas: cliente.dividas
        .filter((d) => d.status !== 'paga')
        .map((d) => ({ descricao: d.contrato, valor: d.valorAtualizado, vencimento: d.vencimento })),
    })
  } catch {
    return null
  }
}

function buscarMargemCliente(cliente: ClienteParaAnalise): AnaliseCliente['margemCliente'] {
  try {
    const svc = getFinanceiroService()
    const todas = svc.calcularMargensPorCliente()
    const digits = cliente.cpfCnpj.replace(/\D/g, '')
    const nomeNorm = cliente.nome.trim().toUpperCase()
    const match =
      todas.find((m) => m.cpfCnpj && m.cpfCnpj.replace(/\D/g, '') === digits) ||
      todas.find((m) => m.nome.trim().toUpperCase() === nomeNorm) ||
      todas.find((m) => m.clienteKey === digits) ||
      todas.find((m) => m.clienteKey === nomeNorm)
    return match ?? null
  } catch {
    return null
  }
}

/* ========================================================================
 *  Agregador de alertas — top 6 por severidade
 * ======================================================================== */

function consolidarAlertas(
  srai: AnaliseCliente['srai'],
  abs: AnaliseCliente['abs'],
  saldo: AnaliseCliente['saldoRecalculado'],
  fluxo: AnaliseCliente['fluxoCaixaSafra'],
): AnaliseCliente['alertasTop'] {
  const out: AnaliseCliente['alertasTop'] = []

  if (srai) {
    if (srai.classificacao === 'critico')
      out.push({ nivel: 'critico', origem: 'srai', mensagem: `SRAI crítico (${srai.scoreTotal}) — recuperação imediata` })
    else if (srai.classificacao === 'alto')
      out.push({ nivel: 'alto', origem: 'srai', mensagem: `SRAI alto (${srai.scoreTotal}) — reestruturação recomendada` })
    for (const a of srai.alertas.slice(0, 2)) {
      out.push({ nivel: 'moderado', origem: 'srai', mensagem: a })
    }
  }

  if (abs) {
    if (abs.nivelElegibilidade === 'inelegivel')
      out.push({ nivel: 'critico', origem: 'abs', mensagem: 'Inelegível ao AB+S — verifique CAR/fiscal' })
    const falhas = abs.checkpoints.filter((c) => c.status === 'falha')
    for (const f of falhas.slice(0, 2)) {
      out.push({ nivel: 'alto', origem: 'abs', mensagem: `${f.descricao}: ${f.detalhes}` })
    }
  }

  if (saldo && saldo.totalJurosAcumulados > saldo.totalValorOriginal * 0.3) {
    out.push({
      nivel: 'alto',
      origem: 'dividas',
      mensagem: `Juros acumulados > 30% do principal (R$ ${saldo.totalJurosAcumulados.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})`,
    })
  }

  if (fluxo && fluxo.capacidadePagamento > 100) {
    out.push({
      nivel: 'critico',
      origem: 'caixa',
      mensagem: `Dívidas > margem bruta da safra (${fluxo.capacidadePagamento.toFixed(0)}%) — alongamento é imprescindível`,
    })
  } else if (fluxo && fluxo.capacidadePagamento > 70) {
    out.push({
      nivel: 'alto',
      origem: 'caixa',
      mensagem: `Comprometimento >70% da margem (${fluxo.capacidadePagamento.toFixed(0)}%) — risco de déficit`,
    })
  }

  // Ordena por severidade e mantém top 6
  const ordem = { critico: 0, alto: 1, moderado: 2, info: 3 } as const
  return out.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]).slice(0, 6)
}

/* ========================================================================
 *  ORCHESTRATOR
 * ======================================================================== */

export class AutoCalcOrchestrator {
  /** Dedup: se um cliente já tem orquestração em voo, reusa a Promise. */
  private emVoo = new Map<string, Promise<AnaliseCliente>>()

  /**
   * Roda todas as calculadoras aplicáveis ao cliente em paralelo e materializa
   * o snapshot em disco (via `AnalisesRepository`). Idempotente: se o hash do
   * input não mudou e `opts.force !== true`, devolve o snapshot existente.
   */
  async orchestrate(
    cliente: ClienteParaAnalise,
    opts: { force?: boolean } = {},
  ): Promise<AnaliseCliente> {
    // Dedup: se já existe execução em voo, aguarda
    const existente = this.emVoo.get(cliente.id)
    if (existente) return existente

    const promise = this.run(cliente, opts).finally(() => {
      this.emVoo.delete(cliente.id)
    })
    this.emVoo.set(cliente.id, promise)
    return promise
  }

  /**
   * Versão fire-and-forget — agenda `orchestrate` em background e descarta
   * o resultado. Usado pelos hooks POST/PATCH de cliente, onde não queremos
   * bloquear a resposta HTTP no cálculo (que inclui margem cliente — barato,
   * mas varre todas as receitas/despesas).
   */
  schedule(cliente: ClienteParaAnalise, opts: { force?: boolean } = {}): void {
    setImmediate(() => {
      this.orchestrate(cliente, opts).catch((err) => {
        console.warn(`[AutoCalcOrchestrator] falha clienteId=${cliente.id}`, err?.message || err)
      })
    })
  }

  private async run(cliente: ClienteParaAnalise, opts: { force?: boolean }): Promise<AnaliseCliente> {
    const repo = getAnalisesRepository()
    const inputHash = canonicalInputHash(cliente)
    const previo = repo.get(cliente.id)
    if (previo && previo.inputHash === inputHash && !opts.force) {
      return previo
    }

    const t0 = Date.now()
    const erros: Record<string, string> = {}

    // Todas as calculadoras em "paralelo" — são síncronas/rápidas, mas o
    // modelo via Promise.all deixa o código uniforme e facilita migrar para
    // async (ex.: cache Redis) sem mudar a forma.
    const [sraiRes, absRes, saldo, projecao, fluxo, margem] = await Promise.all([
      safe('srai', erros, () => {
        const input = buildSraiInput(cliente)
        return { ...calcularSRAI(input), input }
      }),
      safe('abs', erros, () => {
        const input = buildAbsInput(cliente)
        return { ...verificarABS(input), input }
      }),
      safe('saldoRecalculado', erros, () => calcularSaldoRecalculado(cliente)),
      safe('projecao5Safras', erros, () => calcularProjecao5Safras(cliente)),
      safe('fluxoCaixaSafra', erros, () => calcularFluxoSafra(cliente)),
      safe('margemCliente', erros, () => buscarMargemCliente(cliente)),
    ])

    const analiseBase: AnaliseCliente = {
      inputHash,
      geradoEm: new Date().toISOString(),
      versao: ANALISE_VERSAO,
      duracaoMs: Date.now() - t0,
      srai: sraiRes ?? null,
      abs: absRes ?? null,
      saldoRecalculado: saldo ?? null,
      projecao5Safras: projecao ?? null,
      fluxoCaixaSafra: fluxo ?? null,
      margemCliente: margem ?? null,
      alertasTop: consolidarAlertas(sraiRes ?? null, absRes ?? null, saldo ?? null, fluxo ?? null),
      recomendacoes: [],
      erros,
    }

    // SmartAdvisor — roda por último, já com todos os campos do snapshot
    // preenchidos. Isolado em try/catch: falha aqui não aborta a materialização.
    const recomendacoes = await safe('smartAdvisor', erros, () =>
      getSmartAdvisor().evaluate({ cliente, analise: analiseBase }),
    )

    const analise: AnaliseCliente = {
      ...analiseBase,
      recomendacoes: recomendacoes ?? [],
    }
    repo.save(cliente.id, analise)
    return analise
  }

  get(clienteId: string): AnaliseCliente | null {
    return getAnalisesRepository().get(clienteId)
  }
}

async function safe<T>(
  chave: string,
  erros: Record<string, string>,
  fn: () => T | Promise<T>,
): Promise<T | null> {
  try {
    return await fn()
  } catch (err: any) {
    erros[chave] = err?.message || String(err)
    return null
  }
}

let _instance: AutoCalcOrchestrator | null = null
export function getAutoCalcOrchestrator(): AutoCalcOrchestrator {
  if (!_instance) _instance = new AutoCalcOrchestrator()
  return _instance
}

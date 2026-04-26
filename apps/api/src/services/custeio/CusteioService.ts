/**
 * CusteioService — CRUD + cálculos para o Plano Simples de
 * Custeio Agrícola 2026.
 *
 * Persistência: um arquivo JSON por plano em
 *   apps/api/storage/custeio/{id}.json
 * (write-tmp + rename, mesmo padrão de DossieRepository).
 *
 * Não depende de banco — toda listagem é feita por leitura de
 * diretório. Para volumes maiores pode-se indexar em memória
 * depois. Por enquanto o agente gerador de planos opera por
 * cliente (baixa dezenas de planos por consultor).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type {
  PlanoCusteio,
  PlanoCusteioCreatePayload,
  PlanoCusteioUpdatePayload,
  PlanoCusteioListFilters,
  IndicadoresProjeto,
  ItemOrcamento,
  DesembolsoParcela,
  Gleba,
} from '@aletis/shared-types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Resolve a partir de apps/api/src/services/custeio → ../../storage/custeio
const STORAGE_DIR = join(__dirname, '..', '..', '..', 'storage', 'custeio')

/** Sanitiza ids para uso como nome de arquivo (apenas dígitos + hex). */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

function genId(): string {
  return 'custeio_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function nowIso(): string {
  return new Date().toISOString()
}

/** TIR via Newton-Raphson sobre fluxo de caixa mensal. */
function tirMensal(fluxos: number[]): number {
  if (fluxos.length < 2) return 0
  let taxa = 0.01
  for (let i = 0; i < 200; i++) {
    let npv = 0
    let d = 0
    for (let t = 0; t < fluxos.length; t++) {
      const denom = Math.pow(1 + taxa, t)
      npv += fluxos[t] / denom
      if (t > 0) d += (-t * fluxos[t]) / (denom * (1 + taxa))
    }
    if (Math.abs(d) < 1e-20) break
    const nova = taxa - npv / d
    if (Math.abs(nova - taxa) < 1e-10) return nova
    taxa = nova
    if (!Number.isFinite(taxa)) return 0
  }
  return taxa
}

/** Valor presente líquido de fluxos mensais dada taxa mensal. */
function vpl(fluxos: number[], taxaMensal: number): number {
  let soma = 0
  for (let t = 0; t < fluxos.length; t++) {
    soma += fluxos[t] / Math.pow(1 + taxaMensal, t)
  }
  return soma
}

/**
 * Monta um fluxo mensal sintético a partir do cronograma de
 * desembolsos (entradas negativas — saída de caixa do produtor
 * sob a ótica do projeto, ou positivas se forem aportes do banco
 * recebidos pelo produtor) e da receita bruta projetada (positiva,
 * alocada no mês posterior ao último desembolso).
 *
 * Para o produtor, o fluxo de custeio é:
 *   - entrada (financiamento recebido, positivo)
 *   - gastos (itens orçados, negativos ao longo do ciclo)
 *   - colheita + venda (positivo, no fim do ciclo)
 *
 * Aqui simplificamos: consolidamos itens pelas fases do cronograma
 * (pré-plantio / tratos / colheita) e colocamos receita no mês
 * seguinte ao último desembolso.
 */
function montarFluxoMensal(
  cronograma: DesembolsoParcela[],
  orcamento: ItemOrcamento[],
  receitaBruta: number,
): { fluxos: number[]; exposicaoMax: number } {
  if (cronograma.length === 0 && orcamento.length === 0) {
    return { fluxos: [], exposicaoMax: 0 }
  }

  // Agrupa desembolsos por mês (a partir da primeira data).
  const datas = cronograma
    .map((p) => new Date(p.dataPrevista))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())

  const dataInicio = datas[0] ?? new Date()
  /** Diff em meses entre duas datas (aproximado por 30 dias). */
  const mesesEntre = (from: Date, to: Date) =>
    Math.max(0, Math.round((to.getTime() - from.getTime()) / (30 * 24 * 3600 * 1000)))

  const horizonte = Math.max(
    1,
    ...datas.map((d) => mesesEntre(dataInicio, d)),
  ) + 1 // +1 mês para alocar a receita

  const fluxos: number[] = new Array(horizonte + 1).fill(0)

  // Desembolsos do cronograma (saídas = negativos)
  for (const p of cronograma) {
    const d = new Date(p.dataPrevista)
    if (isNaN(d.getTime())) continue
    const idx = mesesEntre(dataInicio, d)
    if (idx < fluxos.length) fluxos[idx] -= p.valor
  }

  // Se não há cronograma, joga custos no mês 0
  if (cronograma.length === 0 && orcamento.length > 0) {
    const custoTotal = orcamento.reduce((acc, it) => acc + (it.valorTotal || 0), 0)
    fluxos[0] -= custoTotal
  }

  // Receita no último mês
  fluxos[fluxos.length - 1] += receitaBruta

  // Exposição máxima (mínimo do saldo acumulado)
  let saldo = 0
  let exposicaoMax = 0
  for (const f of fluxos) {
    saldo += f
    if (saldo < exposicaoMax) exposicaoMax = saldo
  }

  return { fluxos, exposicaoMax: Math.abs(exposicaoMax) }
}

export class CusteioService {
  private readonly dir: string
  private static instance: CusteioService | null = null

  constructor(baseDir: string = STORAGE_DIR) {
    this.dir = baseDir
    mkdirSync(this.dir, { recursive: true })
  }

  static getInstance(): CusteioService {
    if (!this.instance) this.instance = new CusteioService()
    return this.instance
  }

  // ───────── FS helpers ─────────

  private fileFor(id: string): string {
    return join(this.dir, `${sanitizeId(id)}.json`)
  }

  private writeAtomic(id: string, plano: PlanoCusteio): void {
    const final = this.fileFor(id)
    const tmp = `${final}.tmp`
    writeFileSync(tmp, JSON.stringify(plano, null, 2), 'utf8')
    renameSync(tmp, final)

    // Wave-PG-16: dual-write best-effort no Postgres
    void (async () => {
      try {
        const repo = await import('../../db/InventarioCusteioRepository.js')
        await repo.upsertPlanoCusteio(plano as unknown as Parameters<typeof repo.upsertPlanoCusteio>[0])
      } catch (err) {
        console.warn('[CusteioService.writeAtomic] dual-write PG falhou:', (err as Error).message)
      }
    })()
  }

  // ───────── CRUD ─────────

  criar(payload: PlanoCusteioCreatePayload): PlanoCusteio {
    const agora = nowIso()
    const id = genId()
    const plano: PlanoCusteio = {
      id,
      clienteId: payload.clienteId,
      criadoEm: agora,
      atualizadoEm: agora,
      safra: payload.safra,
      versao: 1,
      proponente: payload.proponente,
      imoveis: payload.imoveis ?? [],
      glebas: payload.glebas ?? [],
      projeto: {
        safra: payload.safra,
        ciclo: 'Temporário',
        valorSolicitado: 0,
        valorContrapartida: 0,
        valorTotal: 0,
        fontes: [],
        ...payload.projeto,
      },
      orcamento: payload.orcamento ?? [],
      cronograma: payload.cronograma ?? [],
      comercializacao: payload.comercializacao,
      avalistas: payload.avalistas ?? [],
      observacoes: payload.observacoes,
      status: 'rascunho',
    }
    this.writeAtomic(id, plano)
    return plano
  }

  buscar(id: string): PlanoCusteio | null {
    const file = this.fileFor(id)
    if (!existsSync(file)) return null
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as PlanoCusteio
    } catch (err) {
      console.warn(`[CusteioService] falha lendo ${file}`, err)
      return null
    }
  }

  atualizar(id: string, patch: PlanoCusteioUpdatePayload): PlanoCusteio | null {
    const atual = this.buscar(id)
    if (!atual) return null
    const novo: PlanoCusteio = {
      ...atual,
      ...patch,
      id: atual.id,
      clienteId: atual.clienteId,
      criadoEm: atual.criadoEm,
      versao: atual.versao,
      atualizadoEm: nowIso(),
      // Deep-merge do projeto (não sobrescreve parcialmente)
      projeto: patch.projeto ? { ...atual.projeto, ...patch.projeto } : atual.projeto,
      proponente: patch.proponente ?? atual.proponente,
    }
    this.writeAtomic(id, novo)
    return novo
  }

  deletar(id: string): boolean {
    const file = this.fileFor(id)
    if (!existsSync(file)) return false
    try {
      unlinkSync(file)
      return true
    } catch {
      return false
    }
  }

  listar(filtros: PlanoCusteioListFilters = {}): PlanoCusteio[] {
    if (!existsSync(this.dir)) return []
    const arquivos = readdirSync(this.dir).filter((f) => f.endsWith('.json'))
    const planos: PlanoCusteio[] = []
    for (const f of arquivos) {
      try {
        const p = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as PlanoCusteio
        if (filtros.clienteId && p.clienteId !== filtros.clienteId) continue
        if (filtros.safra && p.safra !== filtros.safra) continue
        if (filtros.status && p.status !== filtros.status) continue
        planos.push(p)
      } catch {
        // ignora arquivos corrompidos
      }
    }
    // Ordena por atualizadoEm desc
    planos.sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))
    return planos
  }

  listarPorCliente(clienteId: string): PlanoCusteio[] {
    return this.listar({ clienteId })
  }

  /**
   * Duplica um plano para uma nova safra. Gera novo id, incrementa
   * `versao` (partindo da versão do plano de origem + 1) e preserva
   * proponente/imóveis/glebas. Orçamento e cronograma podem ser
   * ajustados depois.
   */
  duplicar(id: string, novaSafra: string): PlanoCusteio | null {
    const origem = this.buscar(id)
    if (!origem) return null
    const agora = nowIso()
    const novoId = genId()
    const plano: PlanoCusteio = {
      ...origem,
      id: novoId,
      criadoEm: agora,
      atualizadoEm: agora,
      safra: novaSafra,
      versao: (origem.versao || 1) + 1,
      status: 'rascunho',
      planoAnteriorId: origem.id,
      projeto: { ...origem.projeto, safra: novaSafra },
      resultadoEsperado: undefined,
    }
    this.writeAtomic(novoId, plano)
    return plano
  }

  // ───────── Cálculos / indicadores ─────────

  /**
   * Calcula VPL, TIR, payback, margem e necessidade de K para um
   * plano. Taxa de desconto padrão = 12 % a.a. (alinhada com linhas
   * Pronaf / custeio Sicredi). Se o usuário quer taxa diferente,
   * passar no `opts.taxaAnual`.
   */
  calcularIndicadores(
    plano: PlanoCusteio,
    opts: { taxaAnual?: number } = {},
  ): IndicadoresProjeto {
    const taxaAnual = opts.taxaAnual ?? 12
    const taxaMensal = Math.pow(1 + taxaAnual / 100, 1 / 12) - 1

    const custoTotal = plano.orcamento.reduce((acc, it) => acc + (it.valorTotal || 0), 0)

    // Receita bruta: se o projeto já trouxer, usa; senão deriva de
    // produtividade * área_total_glebas * preço.
    let receitaBruta = plano.projeto.receitaBrutaProjetada ?? 0
    if (!receitaBruta && plano.projeto.produtividadeEsperada && plano.projeto.precoProjetado) {
      const areaTotal = plano.glebas.reduce((acc, g) => acc + (g.areaHa || 0), 0)
      receitaBruta =
        plano.projeto.produtividadeEsperada * areaTotal * plano.projeto.precoProjetado
    }

    const { fluxos, exposicaoMax } = montarFluxoMensal(
      plano.cronograma,
      plano.orcamento,
      receitaBruta,
    )

    const vplCalc = fluxos.length > 0 ? vpl(fluxos, taxaMensal) : receitaBruta - custoTotal
    const tirMes = fluxos.length >= 2 ? tirMensal(fluxos) : 0
    const tirAnual = tirMes > -0.999 ? (Math.pow(1 + tirMes, 12) - 1) * 100 : 0

    // Payback: primeiro mês em que saldo acumulado ≥ 0
    let saldo = 0
    let paybackMeses = fluxos.length
    for (let i = 0; i < fluxos.length; i++) {
      saldo += fluxos[i]
      if (saldo >= 0 && i > 0) {
        paybackMeses = i
        break
      }
    }

    const margemLiquida = receitaBruta > 0 ? (receitaBruta - custoTotal) / receitaBruta : 0

    const avisos: string[] = []
    if (receitaBruta <= 0) avisos.push('Receita bruta não informada — cálculos de margem podem estar zerados.')
    if (custoTotal > receitaBruta && receitaBruta > 0) avisos.push('Custo total supera a receita bruta projetada.')
    if (plano.orcamento.length === 0) avisos.push('Orçamento vazio.')
    if (plano.cronograma.length === 0) avisos.push('Cronograma de desembolso não informado — fluxo consolidado em t=0.')

    return {
      vpl: Number(vplCalc.toFixed(2)),
      tirAnual: Number(tirAnual.toFixed(4)),
      paybackMeses,
      margemLiquida: Number(margemLiquida.toFixed(4)),
      necessidadeCapitalGiro: Number(exposicaoMax.toFixed(2)),
      receitaBrutaTotal: Number(receitaBruta.toFixed(2)),
      custoTotal: Number(custoTotal.toFixed(2)),
      taxaDescontoAnual: taxaAnual,
      calculadoEm: nowIso(),
      avisos: avisos.length ? avisos : undefined,
    }
  }

  /**
   * Calcula indicadores, salva no plano e retorna o plano atualizado
   * (mantém uma cópia "snapshot" em `resultadoEsperado`).
   */
  calcularESalvar(id: string, opts: { taxaAnual?: number } = {}): PlanoCusteio | null {
    const plano = this.buscar(id)
    if (!plano) return null
    const ind = this.calcularIndicadores(plano, opts)
    plano.resultadoEsperado = ind
    plano.atualizadoEm = nowIso()
    this.writeAtomic(id, plano)
    return plano
  }

  // ───────── Helpers de gleba (centróide) ─────────

  /**
   * Calcula o centróide de uma gleba se ela tiver pontos de
   * coordenadas. Simples média aritmética de lat/lon (adequada para
   * polígonos agrícolas de tamanho moderado em latitudes brasileiras).
   */
  static centroideGleba(g: Gleba): { lat: number; lon: number; raioKm: number } | null {
    if (!g.coordenadas || g.coordenadas.length === 0) {
      if (!g.centroide) return null
      return {
        lat: g.centroide.lat,
        lon: g.centroide.lon,
        raioKm: g.centroide.raioKm ?? 0,
      }
    }
    const n = g.coordenadas.length
    const somaLat = g.coordenadas.reduce((acc, p) => acc + p.latitude, 0)
    const somaLon = g.coordenadas.reduce((acc, p) => acc + p.longitude, 0)
    const lat = somaLat / n
    const lon = somaLon / n
    // Raio aprox = maior distância centróide → ponto (em km, 1° ≈ 111 km).
    let raio = 0
    for (const p of g.coordenadas) {
      const dLat = (p.latitude - lat) * 111
      const dLon = (p.longitude - lon) * 111 * Math.cos((lat * Math.PI) / 180)
      const d = Math.hypot(dLat, dLon)
      if (d > raio) raio = d
    }
    return { lat, lon, raioKm: Number(raio.toFixed(3)) }
  }
}

export function getCusteioService(): CusteioService {
  return CusteioService.getInstance()
}

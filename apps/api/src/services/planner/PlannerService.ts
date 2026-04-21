/**
 * PlannerService — CRUD e cálculos do Planner Financeiro Anual
 * (orçado vs realizado por categoria, 12 meses).
 *
 * Persistência: um arquivo JSON por cliente-ano em
 *   apps/api/storage/planner/{clienteId}_{ano}.json
 * (write-tmp + rename). Não versionado — cada PUT substitui.
 *
 * O service oferece quatro operações:
 *   - obter (GET planner)
 *   - salvar (PUT full)
 *   - atualizarCelula (PATCH célula única — ótimo para UI grid)
 *   - calcularResumo (GET resumo agregado)
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type {
  CategoriaPlanner,
  LinhaPlanner,
  PlannerFinanceiroAnual,
  PlannerPutPayload,
  ResumoPlanner,
} from '@aletis/shared-types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const STORAGE_DIR = join(__dirname, '..', '..', '..', 'storage', 'planner')

/** Categorias que representam receita (entram no total de receita). */
const RECEITAS: CategoriaPlanner[] = [
  'receita_agricola',
  'receita_pecuaria',
  'receita_outras',
]

/** Categorias que representam custo/despesa (entram no total de custo). */
const CUSTOS: CategoriaPlanner[] = [
  'custo_insumos',
  'custo_mao_obra',
  'custo_servicos',
  'custo_combustivel',
  'despesa_administrativa',
  'despesa_financeira',
  'impostos_taxas',
  'investimento',
]

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

function genId(): string {
  return 'planner_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Garante um vetor de 12 números. Preenche com zero se vier curto. */
function vetor12(arr: number[] | undefined): number[] {
  const base = Array.isArray(arr) ? arr.slice(0, 12) : []
  while (base.length < 12) base.push(0)
  return base.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0))
}

function sanitizarLinha(linha: LinhaPlanner): LinhaPlanner {
  return {
    categoria: linha.categoria,
    descricao: String(linha.descricao ?? ''),
    orcado: vetor12(linha.orcado),
    realizado: vetor12(linha.realizado),
  }
}

function sum(arr: number[]): number {
  let s = 0
  for (const v of arr) s += v
  return s
}

export class PlannerService {
  private readonly dir: string
  private static instance: PlannerService | null = null

  constructor(baseDir: string = STORAGE_DIR) {
    this.dir = baseDir
    mkdirSync(this.dir, { recursive: true })
  }

  static getInstance(): PlannerService {
    if (!this.instance) this.instance = new PlannerService()
    return this.instance
  }

  // ───────── FS helpers ─────────

  private fileFor(clienteId: string, ano: number): string {
    return join(this.dir, `${sanitizeId(clienteId)}_${ano}.json`)
  }

  private writeAtomic(
    clienteId: string,
    ano: number,
    planner: PlannerFinanceiroAnual,
  ): void {
    const final = this.fileFor(clienteId, ano)
    const tmp = `${final}.tmp`
    writeFileSync(tmp, JSON.stringify(planner, null, 2), 'utf8')
    renameSync(tmp, final)
  }

  // ───────── CRUD ─────────

  obter(clienteId: string, ano: number): PlannerFinanceiroAnual | null {
    const file = this.fileFor(clienteId, ano)
    if (!existsSync(file)) return null
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as PlannerFinanceiroAnual
    } catch (err) {
      console.warn(`[PlannerService] falha lendo ${file}`, err)
      return null
    }
  }

  /**
   * Cria ou substitui o planner inteiro. Mantém id e criadoEm se já
   * existir; caso contrário, gera id novo.
   */
  salvar(
    clienteId: string,
    ano: number,
    payload: PlannerPutPayload,
  ): PlannerFinanceiroAnual {
    const atual = this.obter(clienteId, ano)
    const agora = nowIso()
    const linhas = (payload.linhas ?? []).map(sanitizarLinha)
    const planner: PlannerFinanceiroAnual = {
      id: atual?.id ?? genId(),
      clienteId: sanitizeId(clienteId),
      ano,
      linhas,
      observacoes: payload.observacoes,
      criadoEm: atual?.criadoEm ?? agora,
      atualizadoEm: agora,
    }
    this.writeAtomic(clienteId, ano, planner)
    return planner
  }

  /**
   * Atualiza uma única célula (orçado ou realizado) para a primeira
   * linha que bater com a categoria dada. Se não houver linha da
   * categoria, cria uma nova com descrição default.
   * `mes` aqui é 1..12 (humano). Retorna o planner completo atualizado.
   */
  atualizarCelula(
    clienteId: string,
    ano: number,
    categoria: CategoriaPlanner,
    mesHumano: number,
    valor: number,
    tipo: 'orcado' | 'realizado',
  ): PlannerFinanceiroAnual {
    if (mesHumano < 1 || mesHumano > 12) {
      throw new Error('Mes inválido — deve ser 1..12')
    }
    if (!Number.isFinite(valor)) {
      throw new Error('Valor inválido')
    }
    const idx = mesHumano - 1
    const existente = this.obter(clienteId, ano)
    const agora = nowIso()
    const base: PlannerFinanceiroAnual =
      existente ?? {
        id: genId(),
        clienteId: sanitizeId(clienteId),
        ano,
        linhas: [],
        criadoEm: agora,
        atualizadoEm: agora,
      }

    let linha = base.linhas.find((l) => l.categoria === categoria)
    if (!linha) {
      linha = {
        categoria,
        descricao: '',
        orcado: vetor12([]),
        realizado: vetor12([]),
      }
      base.linhas.push(linha)
    } else {
      // Garante length 12 caso o arquivo tenha sido escrito à mão
      linha.orcado = vetor12(linha.orcado)
      linha.realizado = vetor12(linha.realizado)
    }
    linha[tipo][idx] = valor
    base.atualizadoEm = agora
    this.writeAtomic(clienteId, ano, base)
    return base
  }

  // ───────── Resumo / Cálculo ─────────

  /**
   * Calcula o resumo agregado a partir do planner persistido.
   * Se não existir planner, retorna resumo zerado (ano informado).
   */
  calcularResumo(clienteId: string, ano: number): ResumoPlanner {
    const planner = this.obter(clienteId, ano)
    const zeros12 = () => Array(12).fill(0)
    if (!planner) {
      return {
        ano,
        totalReceitaOrcada: 0,
        totalReceitaRealizada: 0,
        totalCustoOrcado: 0,
        totalCustoRealizado: 0,
        resultadoOrcado: zeros12(),
        resultadoRealizado: zeros12(),
        variacaoReceitaPct: 0,
        variacaoCustoPct: 0,
        mesesCriticos: [],
        indiceCumprimento: 0,
      }
    }

    const receitaOrcMes = zeros12()
    const receitaRealMes = zeros12()
    const custoOrcMes = zeros12()
    const custoRealMes = zeros12()

    for (const linha of planner.linhas) {
      const orc = vetor12(linha.orcado)
      const real = vetor12(linha.realizado)
      if (RECEITAS.includes(linha.categoria)) {
        for (let i = 0; i < 12; i++) {
          receitaOrcMes[i] += orc[i]
          receitaRealMes[i] += real[i]
        }
      } else if (CUSTOS.includes(linha.categoria)) {
        for (let i = 0; i < 12; i++) {
          custoOrcMes[i] += orc[i]
          custoRealMes[i] += real[i]
        }
      }
    }

    const totalReceitaOrcada = sum(receitaOrcMes)
    const totalReceitaRealizada = sum(receitaRealMes)
    const totalCustoOrcado = sum(custoOrcMes)
    const totalCustoRealizado = sum(custoRealMes)

    const resultadoOrcado = receitaOrcMes.map((v, i) => v - custoOrcMes[i])
    const resultadoRealizado = receitaRealMes.map((v, i) => v - custoRealMes[i])

    const variacaoReceitaPct =
      totalReceitaOrcada > 0
        ? ((totalReceitaRealizada - totalReceitaOrcada) / totalReceitaOrcada) * 100
        : 0
    const variacaoCustoPct =
      totalCustoOrcado > 0
        ? ((totalCustoRealizado - totalCustoOrcado) / totalCustoOrcado) * 100
        : 0

    const mesesCriticos: number[] = []
    for (let i = 0; i < 12; i++) {
      if (resultadoRealizado[i] < 0) mesesCriticos.push(i + 1)
    }

    // Índice de cumprimento: mede o quanto o resultado realizado
    // acompanhou (ou superou) o resultado orçado acumulado.
    const resOrcAcc = sum(resultadoOrcado)
    const resRealAcc = sum(resultadoRealizado)
    let indiceCumprimento = 0
    if (resOrcAcc > 0) {
      indiceCumprimento = Math.max(0, Math.min(100, (resRealAcc / resOrcAcc) * 100))
    } else if (resOrcAcc < 0) {
      // orçamento negativo (prejuízo planejado) — cumprir = ficar menos negativo
      indiceCumprimento = resRealAcc >= resOrcAcc ? 100 : Math.max(
        0,
        100 - ((resOrcAcc - resRealAcc) / Math.abs(resOrcAcc)) * 100,
      )
    } else {
      indiceCumprimento = totalReceitaRealizada > 0 ? 100 : 0
    }

    return {
      ano,
      totalReceitaOrcada: Number(totalReceitaOrcada.toFixed(2)),
      totalReceitaRealizada: Number(totalReceitaRealizada.toFixed(2)),
      totalCustoOrcado: Number(totalCustoOrcado.toFixed(2)),
      totalCustoRealizado: Number(totalCustoRealizado.toFixed(2)),
      resultadoOrcado: resultadoOrcado.map((v) => Number(v.toFixed(2))),
      resultadoRealizado: resultadoRealizado.map((v) => Number(v.toFixed(2))),
      variacaoReceitaPct: Number(variacaoReceitaPct.toFixed(2)),
      variacaoCustoPct: Number(variacaoCustoPct.toFixed(2)),
      mesesCriticos,
      indiceCumprimento: Number(indiceCumprimento.toFixed(2)),
    }
  }
}

export function getPlannerService(): PlannerService {
  return PlannerService.getInstance()
}

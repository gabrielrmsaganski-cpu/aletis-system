// ============================================================
// CustoOperacionalService — custo agro por cultura × hectare × UF
// ============================================================
// Calcula custo operacional estimado em R$ por hectare para culturas
// brasileiras, com foco em insumo crítico de fluxo de caixa: DIESEL.
//
// Fontes:
//   - Preço diesel ao vivo: ANPService (por UF, fallback nacional)
//   - Coeficientes de consumo: Embrapa + CONAB + Agroconsult 2024/25
//
// Uso típico:
//   calcularCusto({ cultura: 'soja', uf: 'MT', hectares: 1000 })
// → { custoPorHectare, custoTotal, decomposicao: [{operacao,litros,custo}], precoDieselRef }
// ============================================================
import { DataSourceManager } from '../DataSourceManager.js'

export type CulturaAgro =
  | 'soja'
  | 'milho'
  | 'cafe'
  | 'algodao'
  | 'cana_acucar'
  | 'arroz'
  | 'feijao'
  | 'trigo'
  | 'boi_pastagem'

export interface OperacaoMecanizada {
  nome: string
  descricao: string
  litrosDieselPorHa: number
  /** Peso relativo (1 = sempre; 0.5 = metade das lavouras fazem). */
  frequencia: number
}

/**
 * Coeficientes curados de consumo de diesel por operação mecanizada.
 * Valores em L/ha — baseados em média de Sistemas de Produção Embrapa,
 * CONAB custos de produção 2024/25, Agroconsult.
 */
const OPERACOES_POR_CULTURA: Record<CulturaAgro, OperacaoMecanizada[]> = {
  soja: [
    { nome: 'preparo_solo', descricao: 'Gradagem/subsolagem/nivelamento (quando SPD não aplicado)', litrosDieselPorHa: 14, frequencia: 0.3 },
    { nome: 'dessecacao', descricao: 'Pulverização herbicida pré-plantio', litrosDieselPorHa: 3.5, frequencia: 1 },
    { nome: 'plantio', descricao: 'Semeadura direta + adubação base', litrosDieselPorHa: 9, frequencia: 1 },
    { nome: 'pulverizacao_pos_1', descricao: 'Controle pragas/doenças (1ª passada)', litrosDieselPorHa: 3.5, frequencia: 1 },
    { nome: 'pulverizacao_pos_2', descricao: 'Controle pragas/doenças (2ª passada)', litrosDieselPorHa: 3.5, frequencia: 0.9 },
    { nome: 'pulverizacao_pos_3', descricao: 'Controle ferrugem (se necessário)', litrosDieselPorHa: 3.5, frequencia: 0.6 },
    { nome: 'colheita', descricao: 'Colheitadeira + transbordo', litrosDieselPorHa: 18, frequencia: 1 },
    { nome: 'transporte', descricao: 'Transporte fazenda → armazém/porto', litrosDieselPorHa: 8, frequencia: 1 },
  ],
  milho: [
    { nome: 'dessecacao', descricao: 'Pulverização pré-plantio safrinha', litrosDieselPorHa: 3.5, frequencia: 1 },
    { nome: 'plantio', descricao: 'Semeadura direta + adubação', litrosDieselPorHa: 9, frequencia: 1 },
    { nome: 'pulverizacao_pos_1', descricao: 'Controle pragas/doenças', litrosDieselPorHa: 3.5, frequencia: 1 },
    { nome: 'pulverizacao_pos_2', descricao: '2ª pulverização (se cigarrinha/lagarta)', litrosDieselPorHa: 3.5, frequencia: 0.7 },
    { nome: 'colheita', descricao: 'Colheitadeira + transbordo', litrosDieselPorHa: 20, frequencia: 1 },
    { nome: 'transporte', descricao: 'Transporte fazenda → armazém', litrosDieselPorHa: 9, frequencia: 1 },
  ],
  cafe: [
    { nome: 'preparo_solo', descricao: 'Subsolagem (renovação)', litrosDieselPorHa: 18, frequencia: 0.05 },
    { nome: 'roçadeira', descricao: 'Roçagem ruas (3-4x/ano)', litrosDieselPorHa: 12, frequencia: 1 },
    { nome: 'pulverizacao', descricao: 'Pulverização (5-7 passadas/ano)', litrosDieselPorHa: 22, frequencia: 1 },
    { nome: 'adubacao', descricao: 'Distribuição adubo (3-4x)', litrosDieselPorHa: 10, frequencia: 1 },
    { nome: 'colheita', descricao: 'Colheita mecanizada ou semi', litrosDieselPorHa: 25, frequencia: 1 },
    { nome: 'transporte', descricao: 'Transporte café colhido', litrosDieselPorHa: 6, frequencia: 1 },
  ],
  algodao: [
    { nome: 'preparo_solo', descricao: 'Gradagem/subsolagem', litrosDieselPorHa: 14, frequencia: 0.5 },
    { nome: 'dessecacao', descricao: 'Pulverização pré-plantio', litrosDieselPorHa: 3.5, frequencia: 1 },
    { nome: 'plantio', descricao: 'Semeadura', litrosDieselPorHa: 9, frequencia: 1 },
    { nome: 'pulverizacao', descricao: '10-15 pulverizações/ciclo', litrosDieselPorHa: 38, frequencia: 1 },
    { nome: 'adubacao_cobertura', descricao: 'Adubação cobertura', litrosDieselPorHa: 6, frequencia: 1 },
    { nome: 'colheita', descricao: 'Colhedora de algodão', litrosDieselPorHa: 28, frequencia: 1 },
    { nome: 'transporte', descricao: 'Transporte', litrosDieselPorHa: 10, frequencia: 1 },
  ],
  cana_acucar: [
    { nome: 'preparo_solo', descricao: 'Reforma/preparo (plantio novo)', litrosDieselPorHa: 60, frequencia: 0.2 },
    { nome: 'plantio', descricao: 'Plantio mecanizado', litrosDieselPorHa: 22, frequencia: 0.2 },
    { nome: 'pulverizacao', descricao: 'Pulverizações ciclo', litrosDieselPorHa: 7, frequencia: 1 },
    { nome: 'adubacao', descricao: 'Adubação cobertura', litrosDieselPorHa: 6, frequencia: 1 },
    { nome: 'colheita', descricao: 'Colheita mecanizada', litrosDieselPorHa: 55, frequencia: 1 },
    { nome: 'transporte', descricao: 'Transporte fazenda → usina', litrosDieselPorHa: 22, frequencia: 1 },
  ],
  arroz: [
    { nome: 'preparo_solo', descricao: 'Preparo solo (irrigado/sequeiro)', litrosDieselPorHa: 22, frequencia: 1 },
    { nome: 'plantio', descricao: 'Semeadura', litrosDieselPorHa: 9, frequencia: 1 },
    { nome: 'pulverizacao', descricao: 'Controle plantas daninhas/pragas', litrosDieselPorHa: 8, frequencia: 1 },
    { nome: 'colheita', descricao: 'Colheitadeira', litrosDieselPorHa: 22, frequencia: 1 },
    { nome: 'transporte', descricao: 'Transporte', litrosDieselPorHa: 8, frequencia: 1 },
  ],
  feijao: [
    { nome: 'preparo_solo', descricao: 'Preparo', litrosDieselPorHa: 12, frequencia: 0.5 },
    { nome: 'plantio', descricao: 'Plantio', litrosDieselPorHa: 8, frequencia: 1 },
    { nome: 'pulverizacao', descricao: 'Controle pragas', litrosDieselPorHa: 7, frequencia: 1 },
    { nome: 'colheita', descricao: 'Colheita', litrosDieselPorHa: 16, frequencia: 1 },
    { nome: 'transporte', descricao: 'Transporte', litrosDieselPorHa: 6, frequencia: 1 },
  ],
  trigo: [
    { nome: 'dessecacao', descricao: 'Pré-plantio', litrosDieselPorHa: 3.5, frequencia: 1 },
    { nome: 'plantio', descricao: 'Semeadura', litrosDieselPorHa: 9, frequencia: 1 },
    { nome: 'pulverizacao', descricao: 'Fungicida + inseticida', litrosDieselPorHa: 7, frequencia: 1 },
    { nome: 'colheita', descricao: 'Colheitadeira', litrosDieselPorHa: 18, frequencia: 1 },
    { nome: 'transporte', descricao: 'Transporte', litrosDieselPorHa: 7, frequencia: 1 },
  ],
  boi_pastagem: [
    { nome: 'manejo_pasto', descricao: 'Roçadeira/subsolagem', litrosDieselPorHa: 8, frequencia: 1 },
    { nome: 'adubacao_cobertura', descricao: 'Adubação/calcário', litrosDieselPorHa: 5, frequencia: 0.5 },
    { nome: 'transporte_animais', descricao: 'Movimentação gado', litrosDieselPorHa: 3, frequencia: 1 },
  ],
}

/**
 * Produtividade média por cultura/hectare (saca 60kg ou @ para boi).
 * Fonte: CONAB 2024/25, benchmarks regionais médios.
 */
export const PRODUTIVIDADE_MEDIA: Record<CulturaAgro, { valor: number; unidade: string }> = {
  soja: { valor: 60, unidade: 'sacas 60kg/ha' },
  milho: { valor: 100, unidade: 'sacas 60kg/ha' },
  cafe: { valor: 30, unidade: 'sacas beneficiadas 60kg/ha' },
  algodao: { valor: 290, unidade: '@ pluma/ha' },
  cana_acucar: { valor: 78, unidade: 'ton/ha' },
  arroz: { valor: 100, unidade: 'sacas 50kg/ha' },
  feijao: { valor: 25, unidade: 'sacas 60kg/ha' },
  trigo: { valor: 52, unidade: 'sacas 60kg/ha' },
  boi_pastagem: { valor: 5, unidade: '@/ha/ano (lotação extensiva)' },
}

export interface CustoOperacionalInput {
  cultura: CulturaAgro
  uf: string
  hectares: number
  /** Override opcional do preço (se o cliente já compra por conta). */
  precoDieselLitroOverride?: number
  /** Excluir operações que o cliente não faz (ex: plantio se é arrendante só da terra). */
  operacoesExcluidas?: string[]
}

export interface CustoOperacionalResult {
  cultura: CulturaAgro
  uf: string
  hectares: number
  precoDieselRef: {
    valor: number
    unidade: 'R$/L'
    fonte: string
    dataReferencia: string
  }
  decomposicao: Array<{
    operacao: string
    descricao: string
    litrosPorHa: number
    litrosTotais: number
    custoPorHa: number
    custoTotal: number
    aplicavel: boolean
    frequencia: number
  }>
  totais: {
    litrosPorHa: number
    litrosTotais: number
    custoDieselPorHa: number
    custoDieselTotal: number
  }
  /** Produtividade média (apenas referência) para o usuário estimar custo%. */
  produtividadeMediaRef: { valor: number; unidade: string }
  observacoes: string[]
}

export class CustoOperacionalService {
  constructor(private readonly dsm: DataSourceManager = DataSourceManager.getInstance()) {}

  culturasSuportadas(): CulturaAgro[] {
    return Object.keys(OPERACOES_POR_CULTURA) as CulturaAgro[]
  }

  coeficientesDaCultura(cultura: CulturaAgro): OperacaoMecanizada[] {
    return OPERACOES_POR_CULTURA[cultura] ?? []
  }

  async calcular(input: CustoOperacionalInput): Promise<CustoOperacionalResult> {
    const { cultura, hectares, operacoesExcluidas = [] } = input
    const uf = (input.uf || 'BR').toUpperCase()

    if (!OPERACOES_POR_CULTURA[cultura]) {
      throw new Error(`cultura não suportada: ${cultura}. Use: ${this.culturasSuportadas().join(', ')}`)
    }
    if (!Number.isFinite(hectares) || hectares <= 0) {
      throw new Error(`hectares inválidos: ${hectares}`)
    }

    // Preço diesel por UF (fallback fallback-nacional se falhar)
    let precoDiesel: number
    let precoFonte = 'ANP/SLP'
    let precoData = new Date().toISOString().slice(0, 10)
    if (typeof input.precoDieselLitroOverride === 'number' && input.precoDieselLitroOverride > 0) {
      precoDiesel = input.precoDieselLitroOverride
      precoFonte = 'override manual'
    } else {
      try {
        const anp = await this.dsm.anp.getPrecoDiesel(uf)
        precoDiesel = Number((anp as any).valorMedio ?? (anp as any).medio ?? (anp as any).valor ?? 0)
        precoFonte = (anp as any).fonte || 'ANP/SLP'
        precoData = (anp as any).dataColeta || (anp as any).data || precoData
      } catch {
        precoDiesel = 6.45 // fallback conservador BR média
        precoFonte = 'fallback nacional (ANP indisponível)'
      }
      if (!precoDiesel || precoDiesel < 1) {
        precoDiesel = 6.45
        precoFonte += ' · valor baixo substituído'
      }
    }

    const ops = OPERACOES_POR_CULTURA[cultura]
    const decomposicao = ops.map((op) => {
      const aplicavel = !operacoesExcluidas.includes(op.nome) && op.frequencia > 0
      const litrosHaEfetivo = aplicavel ? op.litrosDieselPorHa * op.frequencia : 0
      const litrosTotais = litrosHaEfetivo * hectares
      const custoPorHa = Number((litrosHaEfetivo * precoDiesel).toFixed(2))
      const custoTotal = Number((litrosTotais * precoDiesel).toFixed(2))
      return {
        operacao: op.nome,
        descricao: op.descricao,
        litrosPorHa: Number(litrosHaEfetivo.toFixed(2)),
        litrosTotais: Number(litrosTotais.toFixed(1)),
        custoPorHa,
        custoTotal,
        aplicavel,
        frequencia: op.frequencia,
      }
    })

    const totais = decomposicao.reduce(
      (acc, d) => {
        acc.litrosPorHa += d.litrosPorHa
        acc.litrosTotais += d.litrosTotais
        acc.custoDieselPorHa += d.custoPorHa
        acc.custoDieselTotal += d.custoTotal
        return acc
      },
      { litrosPorHa: 0, litrosTotais: 0, custoDieselPorHa: 0, custoDieselTotal: 0 },
    )
    totais.litrosPorHa = Number(totais.litrosPorHa.toFixed(1))
    totais.litrosTotais = Number(totais.litrosTotais.toFixed(0))
    totais.custoDieselPorHa = Number(totais.custoDieselPorHa.toFixed(2))
    totais.custoDieselTotal = Number(totais.custoDieselTotal.toFixed(2))

    const observacoes = [
      'Este cálculo cobre apenas CUSTO DE DIESEL nas operações mecanizadas.',
      'Custos não inclusos: insumos (sementes/adubos/defensivos), mão-de-obra, depreciação, arrendamento, terra, seguro, frete longa distância.',
      'Para custo TOTAL de produção, use um plano de custeio completo (CusteioService).',
      `Preço diesel referência: R$ ${precoDiesel.toFixed(2)}/L — fonte ${precoFonte}${precoData ? ` (ref ${precoData})` : ''}.`,
    ]
    if (cultura === 'cana_acucar' || cultura === 'algodao') {
      observacoes.push('Culturas intensivas em diesel — variação regional pode ser alta.')
    }
    if (uf === 'BR') {
      observacoes.push('UF não informada — usado preço nacional. Informe UF para maior precisão.')
    }

    return {
      cultura,
      uf,
      hectares,
      precoDieselRef: {
        valor: Number(precoDiesel.toFixed(4)),
        unidade: 'R$/L',
        fonte: precoFonte,
        dataReferencia: precoData,
      },
      decomposicao,
      totais,
      produtividadeMediaRef: PRODUTIVIDADE_MEDIA[cultura],
      observacoes,
    }
  }
}

let _instance: CustoOperacionalService | null = null
export function getCustoOperacionalService(): CustoOperacionalService {
  if (!_instance) _instance = new CustoOperacionalService()
  return _instance
}

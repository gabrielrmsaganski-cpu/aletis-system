// ============================================================
// calculators — tools de cálculo agro-financeiro expostas à ALIX
// ============================================================
// Conecta os services internos (Desenrola, Reforma, Funrural, Custeio,
// Financeiro) ao loop de tools do LLM. Cada tool é pura leitura — sem
// side-effects, sem HITL. Podem ser chamadas livremente pelo Orchestrator,
// DealAnalyzer ou CRMWriter para estruturar uma recomendação com números.
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { getDesenrolaRuralService } from '../../desenrola/DesenrolaRuralService.js'
import { getReformaTributariaService } from '../../reforma/ReformaTributariaService.js'
import { getFunruralService } from '../../funrural/FunruralService.js'
import { getCusteioService } from '../../custeio/CusteioService.js'
import { getFinanceiroService } from '../../financeiro/FinanceiroService.js'

export function buildCalculatorTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  // ────────────────────────────────────────────────────────────
  // Desenrola Rural — MP 1208/2024: descontos em dívidas PGFN/RFB rurais
  // ────────────────────────────────────────────────────────────
  tools.push({
    name: 'simular_desenrola_rural',
    description:
      'Simula adesão ao Desenrola Rural (MP 1208/2024) calculando desconto de juros/multa/encargos, entrada mínima e cronograma de parcelamento. Use quando o produtor tem dívida PGFN/RFB rural inscrita ≤ 2023-12-31.',
    input_schema: {
      type: 'object',
      properties: {
        divida: {
          type: 'object',
          description: 'Dívida rural do produtor',
          properties: {
            origem: { type: 'string', enum: ['PGFN', 'RFB'] },
            dataInscricao: { type: 'string', description: 'YYYY-MM-DD' },
            modalidade: { type: 'string' },
            valorInscrito: { type: 'number' },
            valorAtualizado: { type: 'number' },
          },
          required: ['origem', 'dataInscricao', 'valorAtualizado'],
        },
        perfil: {
          type: 'object',
          description: 'Perfil financeiro do produtor',
          properties: {
            receitaBrutaAnual: { type: 'number' },
            ativosDeclarados: { type: 'number' },
            dividasTotal: { type: 'number' },
            capacidadePagamento: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          },
          required: ['receitaBrutaAnual', 'ativosDeclarados', 'dividasTotal'],
        },
      },
      required: ['divida', 'perfil'],
    },
  })
  registry['simular_desenrola_rural'] = {
    spec: tools[tools.length - 1],
    handler: async (i) => {
      const svc = getDesenrolaRuralService()
      return svc.simular(i.divida as any, i.perfil as any)
    },
  }

  // ────────────────────────────────────────────────────────────
  // Reforma Tributária — LC 214/2025 — comparativo atual × CBS/IBS
  // ────────────────────────────────────────────────────────────
  tools.push({
    name: 'simular_reforma_tributaria',
    description:
      'Compara carga tributária atual (PIS/COFINS/ICMS/IPI/Funrural) vs sistema novo CBS/IBS com crédito de insumos para um ano específico (2026–2033). Retorna diferença absoluta/percentual, alíquotas de transição e recomendações.',
    input_schema: {
      type: 'object',
      properties: {
        ano: { type: 'number', description: '2026, 2027, …, 2033' },
        regime: {
          type: 'string',
          enum: ['produtor_rural_pf_imune', 'produtor_rural_pj_imune', 'produtor_rural_pf_normal', 'produtor_rural_pj_normal', 'agroindustria'],
        },
        receitaBruta: { type: 'number' },
        comprasInsumos: { type: 'number' },
      },
      required: ['ano', 'regime', 'receitaBruta', 'comprasInsumos'],
    },
  })
  registry['simular_reforma_tributaria'] = {
    spec: tools[tools.length - 1],
    handler: async (i) => {
      const svc = getReformaTributariaService()
      return svc.simular(i as any)
    },
  }

  // ────────────────────────────────────────────────────────────
  // Funrural — compara opção "receita" × "folha" (Lei 8.212/91 + 10.256/01)
  // ────────────────────────────────────────────────────────────
  tools.push({
    name: 'calcular_funrural',
    description:
      'Compara as duas modalidades de recolhimento do Funrural (sobre receita bruta vs sobre folha) e recomenda a mais barata para o produtor. Suporta PF empregador rural, PJ empregador rural, agroindústria e adquirente.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['PF', 'PJ_empregador_rural', 'agroindustria', 'adquirente'],
        },
        receitaBrutaAnual: { type: 'number' },
        folhaPagamentoAnual: { type: 'number' },
        ratMultiplicador: { type: 'number', enum: [1, 2, 3], description: '1=leve, 2=médio, 3=pesado' },
        optouFolha: { type: 'boolean' },
      },
      required: ['tipo', 'receitaBrutaAnual', 'folhaPagamentoAnual', 'ratMultiplicador'],
    },
  })
  registry['calcular_funrural'] = {
    spec: tools[tools.length - 1],
    handler: async (i) => {
      const svc = getFunruralService()
      return svc.calcular(i as any)
    },
  }

  // ────────────────────────────────────────────────────────────
  // Custeio agrícola — VPL, TIR, payback de projeto
  // ────────────────────────────────────────────────────────────
  tools.push({
    name: 'avaliar_projeto_custeio',
    description:
      'Calcula VPL, TIR anual, payback (meses), margem líquida e necessidade de capital de giro de um plano de custeio agrícola existente. Passe o id do plano (já cadastrado) ou o objeto plano inline.',
    input_schema: {
      type: 'object',
      properties: {
        planoId: { type: 'string', description: 'id do plano salvo em storage/custeio/' },
        taxaAnual: { type: 'number', description: 'Taxa de desconto anual (default 0.12 = 12% a.a.)' },
      },
      required: ['planoId'],
    },
  })
  registry['avaliar_projeto_custeio'] = {
    spec: tools[tools.length - 1],
    handler: async (i) => {
      const svc = getCusteioService()
      const plano = svc.buscar(String(i.planoId))
      if (!plano) return { error: 'plano não encontrado' }
      return svc.calcularIndicadores(plano, { taxaAnual: i.taxaAnual as number | undefined })
    },
  }

  // ────────────────────────────────────────────────────────────
  // Financeiro interno — panorama ALETIS (DRE, caixa, margens)
  // ────────────────────────────────────────────────────────────
  tools.push({
    name: 'financeiro_interno_dashboard',
    description:
      'Panorama financeiro interno da ALETIS (DRE mês atual, faturamento 12m, DAS estimado, contas a receber/pagar com aging, top clientes por margem, alertas). Use para decisões operacionais do negócio próprio, não para clientes.',
    input_schema: { type: 'object', properties: {} },
  })
  registry['financeiro_interno_dashboard'] = {
    spec: tools[tools.length - 1],
    handler: async () => {
      const svc = getFinanceiroService()
      return svc.calcularDashboard()
    },
  }

  tools.push({
    name: 'financeiro_interno_projecao_caixa',
    description:
      'Projeção semanal de caixa da ALETIS por N dias (default 90), com alerta do primeiro gap negativo.',
    input_schema: {
      type: 'object',
      properties: {
        diasHorizonte: { type: 'number', description: 'dias à frente; default 90' },
      },
    },
  })
  registry['financeiro_interno_projecao_caixa'] = {
    spec: tools[tools.length - 1],
    handler: async (i) => {
      const svc = getFinanceiroService()
      return svc.calcularProjecaoCaixa(i.diasHorizonte as number | undefined)
    },
  }

  tools.push({
    name: 'financeiro_interno_margens_clientes',
    description: 'Ranking de rentabilidade por cliente ALETIS com classificação ouro/prata/bronze/prejuízo.',
    input_schema: {
      type: 'object',
      properties: {
        ano: { type: 'number' },
        limite: { type: 'number', description: 'quantos clientes retornar (default 20)' },
      },
    },
  })
  registry['financeiro_interno_margens_clientes'] = {
    spec: tools[tools.length - 1],
    handler: async (i) => {
      const svc = getFinanceiroService()
      return svc.calcularMargensPorCliente({
        ano: i.ano as number | undefined,
        limite: i.limite as number | undefined,
      })
    },
  }

  return { tools, registry }
}

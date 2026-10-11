// ============================================================
// farms — tools ALIX para Calculadora de Viabilidade Agricola FARMS v6
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { getFarmsService } from '../../farms/FarmsService.js'

const CULTURAS = ['soja', 'arroz', 'milho', 'trigo'] as const

function resumoPlano(plano: any) {
  const normal = plano.resultado?.cenarios?.find((c: any) => c.id === 'normal')
  return {
    id: plano.id,
    clienteId: plano.clienteId,
    nome: plano.nome,
    cultura: plano.cultura,
    safra: plano.safra,
    status: plano.status,
    areaProdutivaHa: plano.areaProdutivaHa,
    precoBaseRsSc: plano.precoBaseRsSc,
    itens: plano.itens?.length ?? 0,
    desembolsoTotal: plano.resultado?.desembolsoTotal ?? 0,
    desembolsoPorHa: plano.resultado?.desembolsoPorHa ?? 0,
    pontoEquilibrioScHa: plano.resultado?.pontoEquilibrioScHa ?? 0,
    cenarioNormal: normal
      ? {
          lucroLiquidoRs: normal.lucroLiquidoRs,
          margemPct: normal.margemPct,
          custoRsSc: normal.custoRsSc,
          disponivelSc: normal.disponivelSc,
          veredicto: normal.veredicto,
        }
      : null,
    pdfUrl: `/api/farms/${plano.id}/pdf`,
    atualizadoEm: plano.atualizadoEm,
  }
}

export function buildFarmsTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const svc = getFarmsService()
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'listar_planos_farms_cliente',
    description:
      'Lista os planos FARMS v6 de um cliente, com resumo de desembolso, margem, custo/sc e link de PDF. Use antes de criar novo plano para evitar duplicidade.',
    input_schema: {
      type: 'object',
      properties: { clienteId: { type: 'string' } },
      required: ['clienteId'],
    },
  })
  registry['listar_planos_farms_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const planos = svc.listarPorCliente(String(input.clienteId))
      return { total: planos.length, planos: planos.map(resumoPlano) }
    },
  }

  tools.push({
    name: 'criar_plano_farms_cliente',
    description:
      'Cria um plano FARMS v6 para cliente usando o template original da planilha (soja, arroz, milho ou trigo). Side-effect: persiste no CRM do cliente. Use quando o consultor pedir para usar a FARMS v6 ou criar viabilidade agrícola.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        cultura: { type: 'string', enum: [...CULTURAS] },
        nome: { type: 'string' },
        safra: { type: 'string', description: 'Ex: 2025/26' },
        areaAplicadaHa: { type: 'number' },
        areaProdutivaHa: { type: 'number' },
        precoBaseRsSc: { type: 'number' },
      },
      required: ['clienteId', 'cultura'],
    },
  })
  registry['criar_plano_farms_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const cultura = String(input.cultura || '').toLowerCase()
      if (!CULTURAS.includes(cultura as any)) return { ok: false, error: 'Cultura invalida para FARMS v6' }
      const plano = svc.criar(String(input.clienteId), {
        cultura: cultura as any,
        nome: input.nome ? String(input.nome) : undefined,
        safra: input.safra ? String(input.safra) : undefined,
        areaAplicadaHa: input.areaAplicadaHa,
        areaProdutivaHa: input.areaProdutivaHa,
        precoBaseRsSc: input.precoBaseRsSc,
      })
      return { ok: true, plano: resumoPlano(plano), detalhe: plano }
    },
  }

  tools.push({
    name: 'avaliar_plano_farms',
    description:
      'Calcula/retorna a avaliação completa de um plano FARMS v6: custos variáveis/fixos, quatro cenários, ponto de equilíbrio, custo por saca e alertas.',
    input_schema: {
      type: 'object',
      properties: { planoId: { type: 'string' }, incluirItens: { type: 'boolean' } },
      required: ['planoId'],
    },
  })
  registry['avaliar_plano_farms'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const plano = svc.recalcular(String(input.planoId))
      if (!plano) return { ok: false, error: 'Plano FARMS nao encontrado' }
      return {
        ok: true,
        resumo: resumoPlano(plano),
        cenarios: plano.resultado.cenarios,
        custos: {
          variavel: plano.resultado.totalVariavel,
          fixo: plano.resultado.totalFixo,
          desembolsoTotal: plano.resultado.desembolsoTotal,
          desembolsoPorHa: plano.resultado.desembolsoPorHa,
          desembolsoSc: plano.resultado.desembolsoSc,
          pontoEquilibrioScHa: plano.resultado.pontoEquilibrioScHa,
        },
        itens: input.incluirItens ? plano.resultado.itens : undefined,
        avisos: plano.resultado.avisos,
      }
    },
  }

  tools.push({
    name: 'atualizar_plano_farms',
    description:
      'Atualiza premissas, itens ou cenários de um plano FARMS v6. Side-effect: persiste no CRM e recalcula. Use para preencher FARMS com dados enviados pelo consultor.',
    input_schema: {
      type: 'object',
      properties: {
        planoId: { type: 'string' },
        patch: { type: 'object', description: 'Campos parciais de FarmsPlano: nome, safra, areaProdutivaHa, precoBaseRsSc, itens, cenarios, observacoes, status.' },
      },
      required: ['planoId', 'patch'],
    },
  })
  registry['atualizar_plano_farms'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const plano = svc.atualizar(String(input.planoId), input.patch as any)
      if (!plano) return { ok: false, error: 'Plano FARMS nao encontrado' }
      return { ok: true, plano: resumoPlano(plano), avisos: plano.resultado.avisos }
    },
  }

  return { tools, registry }
}

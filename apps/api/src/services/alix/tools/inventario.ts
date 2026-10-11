// ============================================================
// Tools ALIX — Inventário patrimonial + Custo operacional
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { getInventarioService } from '../../inventario/InventarioService.js'
import { getCustoOperacionalService, type CulturaAgro } from '../../inventario/CustoOperacionalService.js'
import type { TipoPatrimonio } from '../../inventario/types.js'

export function buildInventarioTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  // ── Listar patrimônio completo ─────────────────────────
  tools.push({
    name: 'listar_patrimonio_cliente',
    description:
      'Lista o inventário patrimonial completo de um cliente: maquinário (modelo/ano/série/chassi), veículos, imóveis rurais (matrícula/CAR/área), benfeitorias (silos/armazéns), implementos, animais, estoque (grão/insumos). Retorna resumo financeiro com valor total, garantia disponível e breakdown por tipo.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'id do cliente no CRM' },
        tipo: {
          type: 'string',
          enum: ['maquinario', 'veiculo', 'imovel_rural', 'benfeitoria', 'implemento', 'animal', 'estoque'],
          description: 'filtro opcional por tipo',
        },
      },
      required: ['clienteId'],
    },
  })
  registry['listar_patrimonio_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const clienteId = String(input.clienteId)
      const tipo = input.tipo as TipoPatrimonio | undefined
      const inv = getInventarioService().get(clienteId)
      const ativos = tipo ? inv.ativos.filter((a) => a.tipo === tipo) : inv.ativos
      return {
        clienteId,
        totalItens: ativos.length,
        resumo: inv.resumo,
        ativos: ativos.slice(0, 50),
        observacao:
          ativos.length === 0
            ? 'Sem patrimônio cadastrado ainda. Use adicionar_patrimonio para cadastrar.'
            : `${ativos.length} item(ns) no inventário${tipo ? ` do tipo ${tipo}` : ''}.`,
      }
    },
  }

  // ── Adicionar patrimônio ───────────────────────────────
  tools.push({
    name: 'adicionar_patrimonio',
    description:
      'Adiciona um bem/patrimônio ao inventário do cliente. Tipo define os campos esperados: maquinário (marca/modelo/ano/chassi/série), imóvel_rural (denominação/matrícula/CAR/área), veículo (placa/renavam), benfeitoria (silos/armazém), implemento, animal (rebanho/cabeças) ou estoque (grão/insumos).',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        tipo: {
          type: 'string',
          enum: ['maquinario', 'veiculo', 'imovel_rural', 'benfeitoria', 'implemento', 'animal', 'estoque'],
        },
        nome: { type: 'string', description: 'nome identificador (ex.: "Trator John Deere 6110J 2018")' },
        descricao: { type: 'string' },
        valorAtual: { type: 'number', description: 'R$ — valor de mercado atualizado' },
        valorAquisicao: { type: 'number' },
        aquisicaoEm: { type: 'string', description: 'YYYY-MM-DD' },
        garantiaDisponivel: { type: 'boolean' },
        valorGarantia: { type: 'number', description: 'valor que o patrimônio vale como garantia bancária (default 70% do valor atual)' },
        // Campos específicos por tipo — o LLM preenche conforme o tipo
        marca: { type: 'string' },
        modelo: { type: 'string' },
        ano: { type: 'number' },
        numeroSerie: { type: 'string' },
        chassi: { type: 'string' },
        placa: { type: 'string' },
        horimetro: { type: 'number' },
        potenciaCv: { type: 'number' },
        denominacao: { type: 'string' },
        matricula: { type: 'string' },
        municipio: { type: 'string' },
        uf: { type: 'string' },
        areaTotalHa: { type: 'number' },
        codigoCar: { type: 'string' },
        quantidade: { type: 'number' },
        unidade: { type: 'string' },
        especie: { type: 'string' },
        categoria: { type: 'string' },
        produto: { type: 'string' },
      },
      required: ['clienteId', 'tipo', 'nome'],
    },
  })
  registry['adicionar_patrimonio'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const { clienteId, ...rest } = input as any
      try {
        const novo = getInventarioService().adicionar(String(clienteId), {
          status: 'ativo',
          ...rest,
        })
        return { ok: true, patrimonio: novo, resumo: getInventarioService().get(String(clienteId)).resumo }
      } catch (err) {
        return { error: (err as Error).message }
      }
    },
  }

  // ── Valor de garantia consolidado ──────────────────────
  tools.push({
    name: 'valor_garantia_cliente',
    description:
      'Calcula valor total de garantia disponível do cliente para negociação bancária (penhor, alienação fiduciária, hipoteca). Considera apenas patrimônios com garantiaDisponivel=true. Retorna total + breakdown por tipo + lista detalhada.',
    input_schema: {
      type: 'object',
      properties: { clienteId: { type: 'string' } },
      required: ['clienteId'],
    },
  })
  registry['valor_garantia_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const clienteId = String(input.clienteId)
      const data = getInventarioService().valorGarantiaDisponivel(clienteId)
      return {
        clienteId,
        ...data,
        observacao:
          data.total === 0
            ? 'Nenhum patrimônio marcado como garantia disponível. Configure garantiaDisponivel=true em ativos relevantes.'
            : `R$ ${data.total.toLocaleString('pt-BR')} em garantias potenciais. Use para negociar amortização/reestruturação com bancos.`,
      }
    },
  }

  // ── Custo operacional por cultura/UF ───────────────────
  tools.push({
    name: 'calcular_custo_cultura',
    description:
      'Calcula o custo operacional de diesel por hectare para uma cultura agrícola (soja, milho, café, algodão, cana, arroz, feijão, trigo, boi_pastagem) em uma UF específica. Usa preço diesel ao vivo ANP/SLP + coeficientes Embrapa/CONAB 2024-25 por operação mecanizada (preparo solo, plantio, pulverização, colheita, transporte). Retorna decomposição operação-a-operação com litros + R$ + totais. Use quando o Christian perguntar "quanto gasto de diesel por hectare" ou estiver estruturando custeio.',
    input_schema: {
      type: 'object',
      properties: {
        cultura: {
          type: 'string',
          enum: ['soja', 'milho', 'cafe', 'algodao', 'cana_acucar', 'arroz', 'feijao', 'trigo', 'boi_pastagem'],
        },
        uf: { type: 'string', description: 'sigla UF para puxar preço do diesel (ex.: MT, PR, GO)' },
        hectares: { type: 'number', description: 'área em hectares' },
        precoDieselLitroOverride: {
          type: 'number',
          description: 'opcional — se o cliente tem contrato específico de diesel, passa o preço dele aqui',
        },
      },
      required: ['cultura', 'uf', 'hectares'],
    },
  })
  registry['calcular_custo_cultura'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      try {
        return await getCustoOperacionalService().calcular(input as any)
      } catch (err) {
        return { error: (err as Error).message }
      }
    },
  }

  // ── Listar culturas suportadas ─────────────────────────
  tools.push({
    name: 'listar_culturas_suportadas',
    description:
      'Lista culturas com coeficientes de custo operacional catalogados. Útil antes de calcular_custo_cultura.',
    input_schema: { type: 'object', properties: {} },
  })
  registry['listar_culturas_suportadas'] = {
    spec: tools[tools.length - 1],
    handler: async () => {
      const svc = getCustoOperacionalService()
      const culturas = svc.culturasSuportadas()
      return {
        total: culturas.length,
        culturas: culturas.map((c: CulturaAgro) => ({
          nome: c,
          operacoes: svc.coeficientesDaCultura(c).map((o) => ({
            operacao: o.nome,
            litrosPorHa: o.litrosDieselPorHa,
            descricao: o.descricao,
            frequenciaTipica: o.frequencia,
          })),
        })),
      }
    },
  }

  return { tools, registry }
}

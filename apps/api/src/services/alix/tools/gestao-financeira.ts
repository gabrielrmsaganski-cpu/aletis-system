// ============================================================
// gestao-financeira — tools ALIX para o sistema R.OP.001 v2.0 nativo
// ============================================================
// Permite ao consultor delegar à ALIX:
//   - autoimport_grupo_gf(clienteId)        → cria grupo do zero (1 clique)
//   - listar_grupos_gf(clienteId)
//   - dashboard_gf(grupoId)                 → KPIs + insights narrativos
//   - simular_renegociacao_gf(...)          → DRE alternativo
//   - stress_test_gf(grupoId, deltaPreco, deltaRend)
//   - listar_insights_gf(grupoId)
//   - explicar_indicador_gf(grupoId, indicador)
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { getGestaoFinanceiraService } from '../../gestao-financeira/GestaoFinanceiraService.js'
import { getGestaoFinanceiraServiceV2 } from '../../gestao-financeira/GestaoFinanceiraServiceV2.js'

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function buildGestaoFinanceiraTools(): {
  tools: LLMTool[]
  registry: LLMToolRegistry
} {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}
  const svc = getGestaoFinanceiraService()
  const svcV2 = getGestaoFinanceiraServiceV2()

  // ── 1. autoimport_grupo_gf ──────────────────────────────────
  tools.push({
    name: 'autoimport_grupo_gf',
    description:
      'Cria um grupo de Gestão Financeira (R.OP.001 v2.0) a partir dos dados do CRM em 1 chamada. ' +
      'Pré-popula: membro principal, culturas (cliente.culturas), contrato semente (se há valorTotalDivida), ' +
      'fazenda placeholder e premissas (taxas, IPCA, Selic). Idempotente — se já existe grupo retorna ele.',
    input_schema: {
      type: 'object',
      properties: { clienteId: { type: 'string' } },
      required: ['clienteId'],
    },
  })
  registry['autoimport_grupo_gf'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      try {
        const r = await svcV2.autoImportFromCRM(String(input.clienteId))
        return {
          ok: true,
          grupoId: r.grupo.id,
          nomeGrupo: r.grupo.nomeGrupo,
          criado: r.criado,
          estatisticas: r.estatisticas,
          mensagem: r.criado
            ? `Grupo "${r.grupo.nomeGrupo}" criado com ${r.estatisticas.membros} membros, ${r.estatisticas.culturas} culturas, ${r.estatisticas.contratos} contratos, ${r.estatisticas.fazendas} fazendas e ${r.estatisticas.premissas} premissas.`
            : `Grupo já existia: ${r.grupo.nomeGrupo} (id=${r.grupo.id})`,
        }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'erro' }
      }
    },
  }

  // ── 2. listar_grupos_gf ─────────────────────────────────────
  tools.push({
    name: 'listar_grupos_gf',
    description: 'Lista os grupos de Gestão Financeira de um cliente.',
    input_schema: {
      type: 'object',
      properties: { clienteId: { type: 'string' } },
      required: ['clienteId'],
    },
  })
  registry['listar_grupos_gf'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const list = await svc.listarGruposPorCliente(String(input.clienteId))
      return {
        total: list.length,
        grupos: list.map((g) => ({
          id: g.id,
          nome: g.nomeGrupo,
          dataBase: g.dataBase,
          atualizadoEm: g.atualizadoEm,
        })),
      }
    },
  }

  // ── 3. dashboard_gf ────────────────────────────────────────
  tools.push({
    name: 'dashboard_gf',
    description:
      'Calcula o dashboard 360° do grupo: KPIs (Receita, EBITDA, Dívida, Dívida/EBITDA, LTV, FCL), ' +
      'rateio de custos por cultura, EBITDA mensalizado, passivos consolidados, garantias com LTV, ' +
      'DRE FCL multi-cenário (pessimista/base/otimista) e insights automáticos. ' +
      'Use quando o consultor pede análise financeira do cliente.',
    input_schema: {
      type: 'object',
      properties: { grupoId: { type: 'string' } },
      required: ['grupoId'],
    },
  })
  registry['dashboard_gf'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      try {
        const d = await svcV2.calcularDashboard360(String(input.grupoId))
        const cenBase = d.dre.cenarios.find((c: any) => c.cenario === 'base')
        return {
          ok: true,
          grupo: { id: d.grupo.id, nome: d.grupo.nomeGrupo, dataBase: d.grupo.dataBase },
          kpis: {
            receitaProjetada: d.raioX.indicadores.receitaTotal,
            ebitdaTotal: d.raioX.indicadores.ebitdaTotal,
            margemEbitda: d.raioX.indicadores.margemEbitda,
            dividaAtual: d.endividamento.saldoTotalAtual,
            diviPorEbitda: d.raioX.indicadores.diviPorEbitda,
            ltvMedio: d.ltv.ltvMercadoMedio,
            saldoFinalAcumulado: d.raioX.indicadores.saldoFinalAcumulado,
            fclBaseTotal: cenBase?.totais.fclTotal ?? 0,
          },
          contadores: d.contadores,
          insightsCount: d.insights.length,
          alertasCriticos: d.insights.filter((i: any) => i.severidade === 'critico').length,
          narrativa:
            `Grupo ${d.grupo.nomeGrupo} (data base ${d.grupo.dataBase}): receita projetada ${fmtBRL(d.raioX.indicadores.receitaTotal)} ` +
            `em ${d.raioX.anos.length} anos, EBITDA ${fmtBRL(d.raioX.indicadores.ebitdaTotal)} (margem ${(d.raioX.indicadores.margemEbitda * 100).toFixed(1)}%). ` +
            `Dívida atual ${fmtBRL(d.endividamento.saldoTotalAtual)} = ${d.raioX.indicadores.diviPorEbitda.toFixed(2)}x EBITDA anual. ` +
            `${d.insights.length} insights gerados (${d.insights.filter((i: any) => i.severidade === 'critico').length} críticos).`,
        }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'erro' }
      }
    },
  }

  // ── 4. listar_insights_gf ──────────────────────────────────
  tools.push({
    name: 'listar_insights_gf',
    description:
      'Lista os insights (alertas) gerados pelo engine de saúde financeira do grupo. ' +
      'Severidades: critico (precisa ação imediata), importante (revisar), info.',
    input_schema: {
      type: 'object',
      properties: {
        grupoId: { type: 'string' },
        severidade: { type: 'string', description: 'filtra por critico|importante|info' },
      },
      required: ['grupoId'],
    },
  })
  registry['listar_insights_gf'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const all = await svcV2.listarInsights(String(input.grupoId), 100)
      const filtered = input.severidade ? all.filter((i: any) => i.severidade === input.severidade) : all
      return {
        total: filtered.length,
        insights: filtered.map((i: any) => ({
          severidade: i.severidade,
          categoria: i.categoria,
          titulo: i.titulo,
          mensagem: i.mensagem,
          recomendacao: i.recomendacao,
          calculadoEm: i.calculadoEm,
        })),
      }
    },
  }

  // ── 5. recalcular_insights_gf ──────────────────────────────
  tools.push({
    name: 'recalcular_insights_gf',
    description: 'Recalcula e persiste os insights de saúde financeira do grupo. Use após edição relevante.',
    input_schema: {
      type: 'object',
      properties: { grupoId: { type: 'string' } },
      required: ['grupoId'],
    },
  })
  registry['recalcular_insights_gf'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const d = await svcV2.calcularDashboard360(String(input.grupoId), { persistir: true })
      return {
        ok: true,
        gerados: d.insights.length,
        criticos: d.insights.filter((i: any) => i.severidade === 'critico').length,
        importantes: d.insights.filter((i: any) => i.severidade === 'importante').length,
      }
    },
  }

  // ── 6. simular_renegociacao_gf ─────────────────────────────
  tools.push({
    name: 'simular_renegociacao_gf',
    description:
      'Simula renegociação alterando taxa, prazo ou método de um contrato (sem gravar). ' +
      'Útil para mostrar ao cliente o impacto de alongar prazo ou trocar PRICE→SAC.',
    input_schema: {
      type: 'object',
      properties: {
        grupoId: { type: 'string' },
        contratoId: { type: 'string' },
        novaTaxaAa: { type: 'number', description: 'taxa nominal anual em % (ex: 9.5)' },
        novoPrazoParcelas: { type: 'number' },
        novoMetodo: { type: 'string', description: 'PRICE | SAC | BULLET' },
      },
      required: ['grupoId', 'contratoId'],
    },
  })
  registry['simular_renegociacao_gf'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const contratos = await svc.listarContratos(String(input.grupoId))
      const c = contratos.find((x) => x.id === String(input.contratoId))
      if (!c) return { ok: false, error: `Contrato ${input.contratoId} não encontrado` }
      const simulado: any = { ...c }
      if (input.novaTaxaAa !== undefined) simulado.taxaNominalAa = String(input.novaTaxaAa)
      if (input.novoPrazoParcelas !== undefined) simulado.prazoParcelas = input.novoPrazoParcelas
      if (input.novoMetodo) simulado.metodoCalculo = String(input.novoMetodo).toUpperCase()
      // gera cronograma original e simulado
      const { gerarCronograma } = await import('../../gestao-financeira/calculo/endividamento-calculator.js')
      const original = gerarCronograma(c)
      const novo = gerarCronograma(simulado)
      const totalJurosOrig = original.installments.reduce((a, x) => a + x.juro, 0)
      const totalJurosNovo = novo.installments.reduce((a, x) => a + x.juro, 0)
      const totalParcelaOrig = original.installments.reduce((a, x) => a + x.parcela, 0)
      const totalParcelaNovo = novo.installments.reduce((a, x) => a + x.parcela, 0)
      return {
        ok: true,
        contratoId: c.id,
        credor: c.credor,
        original: {
          metodo: original.metodoCalculo,
          taxaPeriodo: original.taxaPeriodo,
          prazo: original.prazoParcelas,
          totalJuros: totalJurosOrig,
          totalParcelas: totalParcelaOrig,
        },
        simulado: {
          metodo: novo.metodoCalculo,
          taxaPeriodo: novo.taxaPeriodo,
          prazo: novo.prazoParcelas,
          totalJuros: totalJurosNovo,
          totalParcelas: totalParcelaNovo,
        },
        economiaJuros: totalJurosOrig - totalJurosNovo,
        diferencaTotal: totalParcelaOrig - totalParcelaNovo,
      }
    },
  }

  // ── 7. stress_test_gf ──────────────────────────────────────
  tools.push({
    name: 'stress_test_gf',
    description:
      'Aplica stress test no grupo: varia preço e rendimento e devolve impacto no FCL e EBITDA. ' +
      'Diferentes do DRE multi-cenário do dashboard (que tem fatores fixos).',
    input_schema: {
      type: 'object',
      properties: {
        grupoId: { type: 'string' },
        deltaPrecoPct: { type: 'number', description: 'ex: -20 = preço cai 20%' },
        deltaRendimentoPct: { type: 'number' },
      },
      required: ['grupoId'],
    },
  })
  registry['stress_test_gf'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const dPreco = (input.deltaPrecoPct ?? -20) / 100 + 1 // -20 → 0.80
      const dRend = (input.deltaRendimentoPct ?? -10) / 100 + 1
      const culturas = await svc.listarCulturas(String(input.grupoId))
      const safrasOrig = await svc.calcularSafraConsolidada(String(input.grupoId))
      const stressed = culturas.map((c: any) => ({
        ...c,
        precoMedioRs: c.precoMedioRs ? String(parseFloat(c.precoMedioRs) * dPreco) : null,
        rendimentoScHa: c.rendimentoScHa ? String(parseFloat(c.rendimentoScHa) * dRend) : null,
      }))
      const { consolidarSafra } = await import('../../gestao-financeira/calculo/safra-calculator.js')
      const safrasStressed = consolidarSafra(stressed as any)
      const totalReceitaOrig = safrasOrig.reduce((a, s) => a + s.receitaTotal, 0)
      const totalReceitaStress = safrasStressed.reduce((a, s) => a + s.receitaTotal, 0)
      const totalEbitdaOrig = safrasOrig.reduce((a, s) => a + s.resultadoBruto, 0)
      const totalEbitdaStress = safrasStressed.reduce((a, s) => a + s.resultadoBruto, 0)
      return {
        ok: true,
        deltaPrecoPct: input.deltaPrecoPct ?? -20,
        deltaRendimentoPct: input.deltaRendimentoPct ?? -10,
        original: { receitaTotal: totalReceitaOrig, ebitdaTotal: totalEbitdaOrig },
        stressed: { receitaTotal: totalReceitaStress, ebitdaTotal: totalEbitdaStress },
        impacto: {
          deltaReceita: totalReceitaStress - totalReceitaOrig,
          deltaEbitda: totalEbitdaStress - totalEbitdaOrig,
          pctImpactoReceita: totalReceitaOrig > 0 ? ((totalReceitaStress - totalReceitaOrig) / totalReceitaOrig) * 100 : 0,
          pctImpactoEbitda: totalEbitdaOrig > 0 ? ((totalEbitdaStress - totalEbitdaOrig) / totalEbitdaOrig) * 100 : 0,
        },
      }
    },
  }

  // ── 8. adicionar_contrato_gf ───────────────────────────────
  tools.push({
    name: 'adicionar_contrato_gf',
    description: 'Adiciona um contrato de dívida ao grupo. Use para registrar via chat um novo financiamento.',
    input_schema: {
      type: 'object',
      properties: {
        grupoId: { type: 'string' },
        credor: { type: 'string' },
        contrato: { type: 'string' },
        valorFinanciado: { type: 'number' },
        prazoParcelas: { type: 'number' },
        taxaNominalAa: { type: 'number', description: '% ao ano (ex: 12.5)' },
        periodicidade: { type: 'string', description: 'mensal|trimestral|semestral|anual|final' },
        metodoCalculo: { type: 'string', description: 'PRICE|SAC|BULLET' },
        primeiraParcela: { type: 'string', description: 'YYYY-MM-DD' },
        enquadramento: { type: 'string', description: 'custeio|investimento|comercializacao|pgfn|...' },
      },
      required: ['grupoId', 'credor', 'valorFinanciado', 'prazoParcelas', 'taxaNominalAa'],
    },
  })
  registry['adicionar_contrato_gf'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const c = await svc.upsertContrato({
        grupoId: String(input.grupoId),
        credor: String(input.credor),
        contrato: input.contrato ?? null,
        valorFinanciado: String(input.valorFinanciado) as any,
        prazoParcelas: input.prazoParcelas,
        taxaNominalAa: String(input.taxaNominalAa) as any,
        periodicidade: input.periodicidade ?? 'mensal',
        metodoCalculo: (input.metodoCalculo ?? 'PRICE').toUpperCase(),
        primeiraParcela: input.primeiraParcela ?? null,
        enquadramento: input.enquadramento ?? null,
      })
      return { ok: true, contrato: { id: c.id, credor: c.credor, valor: c.valorFinanciado } }
    },
  }

  // ── 9. adicionar_garantia_gf ───────────────────────────────
  tools.push({
    name: 'adicionar_garantia_gf',
    description: 'Registra uma garantia (matrícula, safra, aval, penhor) e calcula LTV automático.',
    input_schema: {
      type: 'object',
      properties: {
        grupoId: { type: 'string' },
        tipo: { type: 'string', description: 'imovel|safra|aval|penhor|caucao|outro' },
        descricao: { type: 'string' },
        matricula: { type: 'string' },
        valorMercado: { type: 'number' },
        valorForcado: { type: 'number' },
        contratoVinculado: { type: 'string', description: 'IDs separados por vírgula' },
      },
      required: ['grupoId', 'tipo', 'descricao'],
    },
  })
  registry['adicionar_garantia_gf'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const g = await svcV2.upsertGarantia({
        grupoId: String(input.grupoId),
        tipo: String(input.tipo),
        descricao: String(input.descricao),
        matricula: input.matricula,
        valorMercado: input.valorMercado != null ? String(input.valorMercado) as any : null,
        valorForcado: input.valorForcado != null ? String(input.valorForcado) as any : null,
        contratoVinculado: input.contratoVinculado,
      })
      return { ok: true, garantia: { id: g.id, descricao: g.descricao, valorMercado: g.valorMercado } }
    },
  }

  // ── 10. explicar_indicador_gf ──────────────────────────────
  tools.push({
    name: 'explicar_indicador_gf',
    description:
      'Explica em linguagem natural o significado e o estado de um indicador do grupo: ' +
      'divida_ebitda, margem_ebitda, ltv, fcl, concentracao, saldo_acumulado.',
    input_schema: {
      type: 'object',
      properties: {
        grupoId: { type: 'string' },
        indicador: { type: 'string' },
      },
      required: ['grupoId', 'indicador'],
    },
  })
  registry['explicar_indicador_gf'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const d = await svcV2.calcularDashboard360(String(input.grupoId))
      const i = d.raioX.indicadores
      const ind = String(input.indicador).toLowerCase()
      switch (ind) {
        case 'divida_ebitda':
          return {
            valor: i.diviPorEbitda,
            unidade: 'x',
            classificacao: i.diviPorEbitda < 3 ? 'saudável' : i.diviPorEbitda < 5 ? 'atenção' : 'crítico',
            explicacao: `O grupo deve ${i.diviPorEbitda.toFixed(2)}x o EBITDA anual médio. Bancos consideram saudável <3x, atenção 3-5x, recusam >5x.`,
            componentes: { dividaTotal: d.endividamento.saldoTotalAtual, ebitdaAnual: i.ebitdaTotal / Math.max(1, d.raioX.anos.length) },
          }
        case 'margem_ebitda':
          return {
            valor: i.margemEbitda,
            unidade: '%',
            classificacao: i.margemEbitda > 0.30 ? 'saudável' : i.margemEbitda > 0.15 ? 'atenção' : 'crítico',
            explicacao: `Margem operacional de ${(i.margemEbitda * 100).toFixed(1)}%. Setor agro saudável opera 25-40%.`,
            componentes: { receita: i.receitaTotal, ebitda: i.ebitdaTotal },
          }
        case 'ltv':
          return {
            valor: d.ltv.ltvMercadoMedio,
            unidade: '%',
            classificacao: d.ltv.ltvMercadoMedio < 0.5 ? 'saudável' : d.ltv.ltvMercadoMedio < 0.8 ? 'atenção' : 'stress',
            explicacao: `LTV médio ${(d.ltv.ltvMercadoMedio * 100).toFixed(1)}% — razão entre saldo devedor e valor de mercado das garantias.`,
            componentes: { vinculado: d.ltv.totalSaldoVinculado, mercado: d.ltv.totalValorMercado, disponivel: d.ltv.saldoDisponivelTotalMercado },
          }
        case 'fcl':
          return {
            valor: i.fclMedio,
            unidade: 'R$/ano',
            classificacao: i.fclMedio > 0 ? 'positivo' : 'negativo',
            explicacao: `Fluxo de caixa livre médio de ${fmtBRL(i.fclMedio)} por ano. Positivo = sobra para investimento/dividendos.`,
          }
        case 'concentracao':
          const top = d.endividamento.porCredor[0]
          return {
            valor: top?.pctTotal ?? 0,
            unidade: '%',
            credorTop: top?.credor,
            classificacao: !top || top.pctTotal < 0.4 ? 'diversificado' : top.pctTotal < 0.6 ? 'concentrado' : 'mono-credor',
            explicacao: top
              ? `${top.credor} concentra ${(top.pctTotal * 100).toFixed(0)}% da dívida. Acima de 60% reduz poder de barganha.`
              : 'Sem contratos cadastrados.',
          }
        default:
          return { ok: false, error: `Indicador "${ind}" não reconhecido. Disponíveis: divida_ebitda, margem_ebitda, ltv, fcl, concentracao` }
      }
    },
  }

  return { tools, registry }
}

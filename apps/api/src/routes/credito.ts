import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  calcularCET,
  calcularSpread,
  simularAmortizacao,
  recalcularDivida,
  projetarFluxoCaixa,
  converterTaxa,
} from '../lib/financeiro.js'
import type {
  Fluxo,
  Pagamento,
  FluxoCaixaParams,
} from '../lib/financeiro.js'
import {
  calcularMemoriaCompleta,
  simularDacao,
  simularAlongamento,
  analisarCapitalizacaoDespesas,
  detectarDescaracterizacao,
  projetarFluxoPlurianual,
  calcularEquivalenciaSacas,
  executarStressTest,
  compararMultiCredores,
  enquadrarProdutorPronaf,
  analisarArrendamento,
  simularParcelamentoSafra,
  simularCPR,
  executarPericiaRevisional,
} from '../lib/calculadoras-premium.js'

/* ========================================================================
 *  Roteador — endpoints de cálculo financeiro
 * ======================================================================== */

export default async function (fastify: FastifyInstance) {
  /* ------------------------------------------------------------------ *
   *  POST /api/credito/calcular-cet
   *  Calcula o Custo Efetivo Total (TIR) de um fluxo de caixa
   * ------------------------------------------------------------------ */
  fastify.post('/api/credito/calcular-cet', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { fluxos?: Fluxo[] }

    if (!body.fluxos || !Array.isArray(body.fluxos) || body.fluxos.length < 2) {
      reply.status(400)
      return { success: false, error: 'fluxos é obrigatório (array com mínimo 2 items, cada um com { data, valor })' }
    }

    for (const f of body.fluxos) {
      if (!f.data || f.valor === undefined) {
        reply.status(400)
        return { success: false, error: 'Cada fluxo deve ter { data: "yyyy-mm-dd", valor: number }. Saídas negativas, entradas positivas.' }
      }
    }

    try {
      const resultado = calcularCET(body.fluxos)
      return {
        success: true,
        data: {
          cetMensal: resultado.mensal,
          cetAnual: resultado.anual,
          metodo: 'Newton-Raphson (TIR sobre fluxo de caixa)',
          fluxosAnalisados: body.fluxos.length,
        },
      }
    } catch (err) {
      reply.status(422)
      return { success: false, error: `Erro no cálculo: ${(err as Error).message}` }
    }
  })

  /* ------------------------------------------------------------------ *
   *  POST /api/credito/calcular-spread
   *  Analisa spread entre taxa contratual e taxa praticada
   * ------------------------------------------------------------------ */
  fastify.post('/api/credito/calcular-spread', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { taxaOriginal?: number; taxaPraticada?: number }

    if (body.taxaOriginal === undefined || body.taxaPraticada === undefined) {
      reply.status(400)
      return { success: false, error: 'taxaOriginal e taxaPraticada são obrigatórias (% ao mês)' }
    }

    if (body.taxaOriginal <= 0 || body.taxaPraticada <= 0) {
      reply.status(400)
      return { success: false, error: 'Taxas devem ser positivas (ex: 1.5 para 1,5% a.m.)' }
    }

    const resultado = calcularSpread(body.taxaOriginal, body.taxaPraticada)

    return {
      success: true,
      data: {
        ...resultado,
        unidade: '% ao mês (entradas) / % ao ano (saídas)',
        selicReferenciaAnual: 14.25,
        analise: resultado.excessoSobreSelic > 10
          ? 'Spread MUITO acima da Selic - possível abusividade'
          : resultado.excessoSobreSelic > 5
            ? 'Spread elevado sobre Selic - requer justificativa'
            : 'Spread dentro de parâmetros razoáveis',
      },
    }
  })

  /* ------------------------------------------------------------------ *
   *  POST /api/credito/simular-amortizacao
   *  Gera tabela completa SAC ou PRICE
   * ------------------------------------------------------------------ */
  fastify.post('/api/credito/simular-amortizacao', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      valor?: number
      taxa?: number
      prazo?: number
      sistema?: 'SAC' | 'PRICE'
      dataInicio?: string
    }

    const errors: string[] = []
    if (!body.valor || body.valor <= 0) errors.push('valor é obrigatório e deve ser positivo')
    if (!body.taxa || body.taxa <= 0) errors.push('taxa (mensal, %) é obrigatória e deve ser positiva')
    if (!body.prazo || body.prazo < 1) errors.push('prazo (meses) é obrigatório e deve ser >= 1')
    if (!body.sistema || !['SAC', 'PRICE'].includes(body.sistema)) errors.push('sistema deve ser "SAC" ou "PRICE"')
    if (!body.dataInicio) errors.push('dataInicio (yyyy-mm-dd) é obrigatório')

    if (errors.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validação', detalhes: errors }
    }

    try {
      const tabela = simularAmortizacao(
        body.valor!,
        body.taxa!,
        body.prazo!,
        body.sistema!,
        body.dataInicio!,
      )

      const totalJuros = tabela.reduce((s, l) => s + l.juros, 0)
      const totalPago = tabela.reduce((s, l) => s + l.prestacao, 0)

      return {
        success: true,
        data: {
          parametros: {
            valor: body.valor,
            taxaMensal: body.taxa,
            taxaAnual: Number(((Math.pow(1 + body.taxa! / 100, 12) - 1) * 100).toFixed(4)),
            prazo: body.prazo,
            sistema: body.sistema,
            dataInicio: body.dataInicio,
          },
          resumo: {
            totalPago: Number(totalPago.toFixed(2)),
            totalJuros: Number(totalJuros.toFixed(2)),
            primeiraPrestacao: tabela[0].prestacao,
            ultimaPrestacao: tabela[tabela.length - 1].prestacao,
            custoEfetivo: Number(((totalJuros / body.valor!) * 100).toFixed(2)),
          },
          tabela,
        },
      }
    } catch (err) {
      reply.status(422)
      return { success: false, error: `Erro na simulação: ${(err as Error).message}` }
    }
  })

  /* ------------------------------------------------------------------ *
   *  POST /api/credito/recalcular-divida
   *  Recalcula saldo devedor com pagamentos intermediarios
   * ------------------------------------------------------------------ */
  fastify.post('/api/credito/recalcular-divida', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      valorOriginal?: number
      dataInicio?: string
      taxaMensal?: number
      pagamentos?: Pagamento[]
      dataCorte?: string
    }

    const errors: string[] = []
    if (!body.valorOriginal || body.valorOriginal <= 0) errors.push('valorOriginal é obrigatório')
    if (!body.dataInicio) errors.push('dataInicio (yyyy-mm-dd) é obrigatório')
    if (!body.taxaMensal || body.taxaMensal <= 0) errors.push('taxaMensal (%) é obrigatória')
    if (!body.dataCorte) errors.push('dataCorte (yyyy-mm-dd) é obrigatório')

    if (errors.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validação', detalhes: errors }
    }

    try {
      const resultado = recalcularDivida(
        body.valorOriginal!,
        body.dataInicio!,
        body.taxaMensal!,
        body.pagamentos || [],
        body.dataCorte!,
      )

      return {
        success: true,
        data: {
          ...resultado,
          parametros: {
            valorOriginal: body.valorOriginal,
            dataInicio: body.dataInicio,
            taxaMensal: body.taxaMensal,
            taxaAnual: Number(((Math.pow(1 + body.taxaMensal! / 100, 12) - 1) * 100).toFixed(4)),
            dataCorte: body.dataCorte,
            quantidadePagamentos: (body.pagamentos || []).length,
          },
        },
      }
    } catch (err) {
      reply.status(422)
      return { success: false, error: `Erro no recálculo: ${(err as Error).message}` }
    }
  })

  /* ------------------------------------------------------------------ *
   *  POST /api/credito/projetar-fluxo-caixa
   *  Projeção de fluxo de caixa agrícola
   * ------------------------------------------------------------------ */
  fastify.post('/api/credito/projetar-fluxo-caixa', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Partial<FluxoCaixaParams>

    const errors: string[] = []
    if (!body.cultura) errors.push('cultura é obrigatório')
    if (!body.areaTotalHa || body.areaTotalHa <= 0) errors.push('areaTotalHa é obrigatório')
    if (!body.produtividadeSacasHa || body.produtividadeSacasHa <= 0) errors.push('produtividadeSacasHa é obrigatório')
    if (!body.precoSacaAtual || body.precoSacaAtual <= 0) errors.push('precoSacaAtual é obrigatório')
    if (!body.custoHa || body.custoHa <= 0) errors.push('custoHa é obrigatório')
    if (!body.dataPlantio) errors.push('dataPlantio (yyyy-mm-dd) é obrigatório')
    if (!body.dataColheita) errors.push('dataColheita (yyyy-mm-dd) é obrigatório')
    if (!body.dividas || !Array.isArray(body.dividas)) errors.push('dividas é obrigatório (array)')

    if (errors.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validação', detalhes: errors }
    }

    try {
      const resultado = projetarFluxoCaixa(body as FluxoCaixaParams)

      return {
        success: true,
        data: {
          ...resultado,
          parametros: {
            cultura: body.cultura,
            areaTotalHa: body.areaTotalHa,
            produtividadeSacasHa: body.produtividadeSacasHa,
            producaoTotalSacas: body.areaTotalHa! * body.produtividadeSacasHa!,
            precoSacaAtual: body.precoSacaAtual,
            custoHa: body.custoHa,
            dataPlantio: body.dataPlantio,
            dataColheita: body.dataColheita,
          },
          analise: {
            viabilidade: resultado.capacidadePagamento < 70 ? 'VIÁVEL' : resultado.capacidadePagamento < 100 ? 'APERTADO' : 'INVIÁVEL',
            comprometimentoReceita: `${resultado.capacidadePagamento.toFixed(1)}%`,
            recomendacao:
              resultado.capacidadePagamento < 70
                ? 'Fluxo de caixa comporta as dívidas com margem de segurança'
                : resultado.capacidadePagamento < 100
                  ? 'Fluxo de caixa apertado - considerar renegociação de prazos'
                  : 'Dívidas superam capacidade de pagamento - reestruturação necessária',
          },
        },
      }
    } catch (err) {
      reply.status(422)
      return { success: false, error: `Erro na projeção: ${(err as Error).message}` }
    }
  })

  /* ------------------------------------------------------------------ *
   *  GET /api/credito/converter-taxa
   *  Converte entre taxas equivalentes (compostas)
   * ------------------------------------------------------------------ */
  fastify.get('/api/credito/converter-taxa', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taxa, tipo } = request.query as { taxa?: string; tipo?: string }

    if (!taxa || isNaN(Number(taxa))) {
      reply.status(400)
      return { success: false, error: 'taxa é obrigatória (número, ex: 1.5)' }
    }

    const tipoValido = tipo as 'mensal' | 'anual' | 'diaria'
    if (!tipo || !['mensal', 'anual', 'diaria'].includes(tipo)) {
      reply.status(400)
      return { success: false, error: 'tipo deve ser "mensal", "anual" ou "diaria"' }
    }

    const resultado = converterTaxa(Number(taxa), tipoValido)

    return {
      success: true,
      data: {
        ...resultado,
        entrada: {
          taxa: Number(taxa),
          tipo,
        },
        nota: 'Taxas equivalentes compostas (juros sobre juros). Fórmula: (1+i)^n - 1',
      },
    }
  })

  /* ================================================================
   *  CALCULADORAS PREMIUM - v2 (Apr/2026)
   *  Inspiradas em propostas reais ALETIS
   * ================================================================ */

  // 1. Memória de Cálculo Completa
  fastify.post('/api/credito/memoria-calculo', async (request, reply) => {
    try {
      const resultado = calcularMemoriaCompleta(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 2. Dação em Pagamento
  fastify.post('/api/credito/dacao-pagamento', async (request, reply) => {
    try {
      const resultado = simularDacao(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 3. Alongamento (Súmula 298 + MCR 2-6-4)
  fastify.post('/api/credito/alongamento', async (request, reply) => {
    try {
      const resultado = simularAlongamento(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 4. Capitalização de Despesas (análise abusividade)
  fastify.post('/api/credito/capitalizacao-despesas', async (request, reply) => {
    try {
      const resultado = analisarCapitalizacaoDespesas(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 5. Descaracterização de Crédito Rural
  fastify.post('/api/credito/descaracterizacao', async (request, reply) => {
    try {
      const resultado = detectarDescaracterizacao(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 6. Fluxo de Caixa Plurianual (5 anos)
  fastify.post('/api/credito/fluxo-plurianual', async (request, reply) => {
    try {
      const resultado = projetarFluxoPlurianual(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 7. Equivalência em Sacas (hedge natural)
  fastify.post('/api/credito/equivalencia-sacas', async (request, reply) => {
    try {
      const resultado = calcularEquivalenciaSacas(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 8. Stress Test de Preço
  fastify.post('/api/credito/stress-test-preco', async (request, reply) => {
    try {
      const resultado = executarStressTest(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 9. Comparador Multi-Credor
  fastify.post('/api/credito/multi-credor', async (request, reply) => {
    try {
      const resultado = compararMultiCredores(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 10. Enquadramento Pronaf/Pronamp
  fastify.post('/api/credito/enquadramento-pronaf', async (request, reply) => {
    try {
      const resultado = enquadrarProdutorPronaf(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 11. Arrendamento - Análise de Impacto
  fastify.post('/api/credito/arrendamento', async (request, reply) => {
    try {
      const resultado = analisarArrendamento(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 12. Parcelamento por Ciclo de Safra
  fastify.post('/api/credito/parcelamento-safra', async (request, reply) => {
    try {
      const resultado = simularParcelamentoSafra(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 13. CPR - Cédula de Produto Rural
  fastify.post('/api/credito/cpr', async (request, reply) => {
    try {
      const resultado = simularCPR(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 14. Perícia Revisional
  fastify.post('/api/credito/pericia-revisional', async (request, reply) => {
    try {
      const resultado = executarPericiaRevisional(request.body as any)
      return { success: true, data: resultado }
    } catch (err) {
      reply.status(422)
      return { success: false, error: (err as Error).message }
    }
  })

  // 15. Lista de calculadoras disponíveis (manifest)
  fastify.get('/api/credito/calculadoras', async () => {
    return {
      success: true,
      data: {
        total: 20,
        categorias: {
          basicas: [
            { id: 'calcular-cet', nome: 'Calcular CET (TIR)', endpoint: 'POST /api/credito/calcular-cet' },
            { id: 'calcular-spread', nome: 'Analisar Spread', endpoint: 'POST /api/credito/calcular-spread' },
            { id: 'simular-amortizacao', nome: 'Simular Amortização (SAC/PRICE)', endpoint: 'POST /api/credito/simular-amortizacao' },
            { id: 'recalcular-divida', nome: 'Recalcular Dívida', endpoint: 'POST /api/credito/recalcular-divida' },
            { id: 'projetar-fluxo-caixa', nome: 'Fluxo de Caixa Agrícola', endpoint: 'POST /api/credito/projetar-fluxo-caixa' },
            { id: 'converter-taxa', nome: 'Converter Taxa', endpoint: 'GET /api/credito/converter-taxa' },
          ],
          premium: [
            { id: 'memoria-calculo', nome: 'Memória de Cálculo Completa', endpoint: 'POST /api/credito/memoria-calculo' },
            { id: 'dacao-pagamento', nome: 'Dação em Pagamento', endpoint: 'POST /api/credito/dacao-pagamento' },
            { id: 'alongamento', nome: 'Alongamento (Súmula 298)', endpoint: 'POST /api/credito/alongamento' },
            { id: 'capitalizacao-despesas', nome: 'Análise Capitalização de Despesas', endpoint: 'POST /api/credito/capitalizacao-despesas' },
            { id: 'descaracterizacao', nome: 'Descaracterização Crédito Rural', endpoint: 'POST /api/credito/descaracterizacao' },
            { id: 'fluxo-plurianual', nome: 'Fluxo Plurianual 5 anos', endpoint: 'POST /api/credito/fluxo-plurianual' },
            { id: 'equivalencia-sacas', nome: 'Equivalência em Sacas', endpoint: 'POST /api/credito/equivalencia-sacas' },
            { id: 'stress-test-preco', nome: 'Stress Test de Preço', endpoint: 'POST /api/credito/stress-test-preco' },
            { id: 'multi-credor', nome: 'Comparador Multi-Credor', endpoint: 'POST /api/credito/multi-credor' },
            { id: 'enquadramento-pronaf', nome: 'Enquadramento Pronaf/Pronamp', endpoint: 'POST /api/credito/enquadramento-pronaf' },
            { id: 'arrendamento', nome: 'Análise de Arrendamento', endpoint: 'POST /api/credito/arrendamento' },
            { id: 'parcelamento-safra', nome: 'Parcelamento por Safra', endpoint: 'POST /api/credito/parcelamento-safra' },
            { id: 'cpr', nome: 'CPR - Cédula de Produto Rural', endpoint: 'POST /api/credito/cpr' },
            { id: 'pericia-revisional', nome: 'Perícia Revisional', endpoint: 'POST /api/credito/pericia-revisional' },
          ],
        },
      },
    }
  })
}

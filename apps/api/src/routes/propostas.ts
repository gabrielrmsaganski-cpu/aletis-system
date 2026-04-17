import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { generatePropostaPdf } from '../services/PdfGenerator.js'
import {
  gerarPropostaInteligente,
  type DadosClienteProposta,
  type ContextoCredito,
  type EventoAdverso,
  type ParametrosNegociacao,
  type PropostaInteligente,
} from '../services/PropostaGeneratorInteligente.js'

/* ========================================================================
 *  Tipos
 * ======================================================================== */

interface ItemProposta {
  descricao: string
  valor: number
  tipo: 'pagamento' | 'dacao' | 'compensacao' | 'desconto' | 'parcela'
  data?: string
}

interface Proposta {
  id: string
  clienteId: string
  clienteNome: string
  credor: string
  titulo: string
  tipo: 'liquidacao' | 'renegociacao' | 'memoria_calculo' | 'parcelamento' | 'acordo_judicial'
  status: 'rascunho' | 'em_analise' | 'enviada' | 'aceita' | 'rejeitada' | 'expirada'
  valorDivida: number
  valorProposta: number
  descontoPercentual: number
  itens: ItemProposta[]
  condicoes: string[]
  fundamentacao: string
  dataCriacao: string
  dataValidade: string
  ultimaAtualizacao: string
  pdfUrl: string | null
  observacoes: string
}

/* ========================================================================
 *  Dados em memória
 * ======================================================================== */

export const propostas: Map<string, Proposta> = new Map()
export const propostasInteligentes: Map<string, PropostaInteligente> = new Map()

function seed() {
  const data: Proposta[] = [
    /* ---- REAL: Ailton Caeiro x Sicoob ---- */
    {
      id: 'prop-001',
      clienteId: 'cli-001',
      clienteNome: 'Ailton Caeiro da Silva',
      credor: 'Sicoob',
      titulo: 'Proposta de Liquidação - Ailton Caeiro x Sicoob',
      tipo: 'liquidacao',
      status: 'aceita',
      valorDivida: 2148495.32,
      valorProposta: 2215482.03,
      descontoPercentual: 0,
      itens: [
        { descricao: 'Pagamento parcial acordo - mar/2024', valor: 500000.00, tipo: 'pagamento', data: '2024-03-15' },
        { descricao: 'Pagamento pós-safra - jun/2024', valor: 450000.00, tipo: 'pagamento', data: '2024-06-20' },
        { descricao: 'Pagamento parcial - set/2024', valor: 380000.00, tipo: 'pagamento', data: '2024-09-10' },
        { descricao: 'Dação em pagamento - imóvel matrícula 45434', valor: 521285.02, tipo: 'dacao', data: '2025-01-15' },
        { descricao: 'Pagamento safra 24/25', valor: 300000.00, tipo: 'pagamento', data: '2025-03-20' },
        { descricao: 'Quitação via capital social Sicoob', valor: 64197.01, tipo: 'compensacao', data: '2025-04-10' },
      ],
      condicoes: [
        'Consolidação dos contratos 23110-0, 24821-2, 25381-4, 25882-7, 27981-3 em contrato único 30262-4',
        'Dação em pagamento do imóvel rural matrícula 45434 avaliado em R$521.285,02',
        'Utilização do capital social Sicoob (R$64.197,01) para quitação do saldo residual',
        'Quitação plena e irrevogável após último pagamento',
        'Baixa de restritivos em até 30 dias da quitação',
      ],
      fundamentacao: 'Proposta baseada na capacidade de pagamento do produtor alinhada ao fluxo da safra de soja/milho. A dação do imóvel mat. 45434 complementa os pagamentos em espécie, e o capital social acumulado na cooperativa viabiliza a quitação do saldo residual.',
      dataCriacao: '2024-02-05',
      dataValidade: '2024-12-31',
      ultimaAtualizacao: '2025-04-10',
      pdfUrl: '/api/propostas/prop-001/pdf',
      observacoes: 'Acordo concluído com sucesso. Total pago: R$2.215.482,03.',
    },

    /* ---- REAL: Paulo Luciano x Fertiflora ---- */
    {
      id: 'prop-002',
      clienteId: 'cli-002',
      clienteNome: 'Paulo Luciano de Oliveira',
      credor: 'Fertiflora/Herbioeste',
      titulo: 'Memória de Cálculo - Paulo Luciano x Fertiflora',
      tipo: 'memoria_calculo',
      status: 'enviada',
      valorDivida: 277380.00,
      valorProposta: 282200.00,
      descontoPercentual: 0,
      itens: [
        { descricao: 'Parcela 1 - alinhada safra', valor: 70550.00, tipo: 'parcela', data: '2026-04-30' },
        { descricao: 'Parcela 2 - alinhada safra', valor: 70550.00, tipo: 'parcela', data: '2026-06-30' },
        { descricao: 'Parcela 3 - alinhada safra', valor: 70550.00, tipo: 'parcela', data: '2026-08-31' },
        { descricao: 'Parcela 4 - alinhada safra', valor: 70550.00, tipo: 'parcela', data: '2026-10-31' },
      ],
      condicoes: [
        'Consolidação dos títulos 20189 (R$86.940), 20192 (R$86.940) e 20190 (R$103.500)',
        'Parcelamento em 4x R$70.550,00 alinhadas ao fluxo da safra',
        'Primeiro pagamento após colheita da soja safra 25/26',
        'Garantia via CPR física de soja - 1.180 sacas',
        'Pagamentos já realizados (R$30.000) abatidos do saldo',
      ],
      fundamentacao: 'Memória de cálculo elaborada considerando o fluxo de caixa da safra 25/26. Parcelas de R$70.550 (total R$282.200) alinhadas aos períodos de comercialização pós-colheita, garantindo capacidade de pagamento. Título 20190 (Herbioeste) consolidado com títulos Fertiflora.',
      dataCriacao: '2025-09-05',
      dataValidade: '2026-03-31',
      ultimaAtualizacao: '2026-02-26',
      pdfUrl: '/api/propostas/prop-002/pdf',
      observacoes: 'Pagamentos parciais de R$10K (23/12/25) e R$20K (26/02/26) já realizados. Aguardando aprovação formal do parcelamento.',
    },

    /* ---- Fictícios ---- */
    {
      id: 'prop-003',
      clienteId: 'cli-003',
      clienteNome: 'Fazenda Santa Helena Ltda',
      credor: 'Banco do Brasil',
      titulo: 'Proposta de Reestruturação - Santa Helena x BB',
      tipo: 'renegociacao',
      status: 'em_analise',
      valorDivida: 4850000.00,
      valorProposta: 4120000.00,
      descontoPercentual: 15.05,
      itens: [
        { descricao: 'Entrada via venda parcial algodão em pluma', valor: 1200000.00, tipo: 'pagamento', data: '2026-05-15' },
        { descricao: 'Parcela 1 pós-safra soja', valor: 730000.00, tipo: 'parcela', data: '2026-08-30' },
        { descricao: 'Parcela 2 pós-safra soja', valor: 730000.00, tipo: 'parcela', data: '2026-11-30' },
        { descricao: 'Parcela 3 safra 26/27', valor: 730000.00, tipo: 'parcela', data: '2027-04-30' },
        { descricao: 'Parcela 4 safra 26/27', valor: 730000.00, tipo: 'parcela', data: '2027-08-31' },
      ],
      condicoes: [
        'Desconto de 15% sobre valor atualizado do débito',
        'Entrada via receita da comercialização do algodão safra 25/26',
        'Parcelas remanescentes alinhadas ao calendário agrícola',
        'Manutenção do seguro agrícola durante vigência do acordo',
      ],
      fundamentacao: 'Produtor com capacidade produtiva de 2.800 ha em Sorriso-MT. Proposta considera desconto de 15% dado pagamento antecipado e reestruturação alinhada ao fluxo agrícola.',
      dataCriacao: '2025-12-01',
      dataValidade: '2026-04-30',
      ultimaAtualizacao: '2026-01-10',
      pdfUrl: '/api/propostas/prop-003/pdf',
      observacoes: 'Aguardando deliberação da superintendência regional BB.',
    },
    {
      id: 'prop-004',
      clienteId: 'cli-004',
      clienteNome: 'José Roberto Fernandes',
      credor: 'Bradesco',
      titulo: 'Acordo de Quitação - Fernandes x Bradesco',
      tipo: 'liquidacao',
      status: 'aceita',
      valorDivida: 1890000.00,
      valorProposta: 1700000.00,
      descontoPercentual: 10.05,
      itens: [
        { descricao: 'Venda lote 350 cab boi gordo', valor: 500000.00, tipo: 'pagamento', data: '2025-06-15' },
        { descricao: 'Parcela pós-safra milho', valor: 445000.00, tipo: 'pagamento', data: '2025-10-10' },
        { descricao: 'Parcela safra soja 25/26', valor: 377500.00, tipo: 'parcela', data: '2026-04-30' },
        { descricao: 'Parcela final', valor: 377500.00, tipo: 'parcela', data: '2026-08-31' },
      ],
      condicoes: [
        'Desconto de 10% para liquidação até ago/2026',
        'Primeira parcela via venda de gado',
        'Garantia via penhor de rebanho remanescente (800 cabeças)',
      ],
      fundamentacao: 'Combinação de receita pecuária (venda de lote) com receita agrícola para viabilizar quitação. Desconto de 10% negociado com gerência regional.',
      dataCriacao: '2025-05-01',
      dataValidade: '2026-08-31',
      ultimaAtualizacao: '2025-10-10',
      pdfUrl: '/api/propostas/prop-004/pdf',
      observacoes: 'Duas primeiras parcelas pagas. Aguardando safra 25/26 para parcelas finais.',
    },
    {
      id: 'prop-005',
      clienteId: 'cli-006',
      clienteNome: 'Maria Aparecida dos Santos',
      credor: 'Santander',
      titulo: 'Proposta de Parcelamento - Santos x Santander',
      tipo: 'parcelamento',
      status: 'aceita',
      valorDivida: 980000.00,
      valorProposta: 833000.00,
      descontoPercentual: 15.0,
      itens: [
        { descricao: 'Parcela 1', valor: 150000.00, tipo: 'parcela', data: '2025-09-15' },
        { descricao: 'Parcela 2', valor: 100000.00, tipo: 'parcela', data: '2026-01-20' },
        { descricao: 'Parcela 3 pós-colheita algodão', valor: 291500.00, tipo: 'parcela', data: '2026-06-30' },
        { descricao: 'Parcela 4 pós-colheita soja', valor: 291500.00, tipo: 'parcela', data: '2026-09-30' },
      ],
      condicoes: [
        'Desconto de 15% para liquidação até set/2026',
        'Parcelas alinhadas ao calendário safra MATOPIBA',
        'Garantia via CPR algodão safra 25/26',
      ],
      fundamentacao: 'Proposta estruturada para fluxo de caixa da produtora do MATOPIBA. Desconto de 15% negociado pela antecipação do acordo.',
      dataCriacao: '2025-08-05',
      dataValidade: '2026-09-30',
      ultimaAtualizacao: '2026-01-20',
      pdfUrl: '/api/propostas/prop-005/pdf',
      observacoes: 'Duas primeiras parcelas quitadas. R$583.000 restantes.',
    },
    {
      id: 'prop-006',
      clienteId: 'cli-008',
      clienteNome: 'Rodrigo Antunes Pereira',
      credor: 'Cresol',
      titulo: 'Acordo Simplificado - Pereira x Cresol',
      tipo: 'liquidacao',
      status: 'aceita',
      valorDivida: 420000.00,
      valorProposta: 420000.00,
      descontoPercentual: 0,
      itens: [
        { descricao: 'Parcela 1 pós-safra', valor: 210000.00, tipo: 'pagamento', data: '2025-05-10' },
        { descricao: 'Parcela 2 quitação', valor: 210000.00, tipo: 'pagamento', data: '2025-08-15' },
      ],
      condicoes: [
        'Pagamento integral sem desconto',
        'Duas parcelas iguais pós-safra',
        'Baixa de restritivos em 15 dias após quitação',
      ],
      fundamentacao: 'Acordo direto sem desconto. Produtor com boa capacidade de pagamento via safra soja/milho safra 24/25.',
      dataCriacao: '2025-02-15',
      dataValidade: '2025-08-31',
      ultimaAtualizacao: '2025-08-20',
      pdfUrl: '/api/propostas/prop-006/pdf',
      observacoes: 'Acordo concluído. Quitação total.',
    },
    {
      id: 'prop-007',
      clienteId: 'cli-010',
      clienteNome: 'Carlos Eduardo Nakamura',
      credor: 'Banco do Brasil',
      titulo: 'Proposta de Renegociação - Nakamura x BB',
      tipo: 'renegociacao',
      status: 'enviada',
      valorDivida: 560000.00,
      valorProposta: 504000.00,
      descontoPercentual: 10.0,
      itens: [
        { descricao: 'Venda lote café especial - já pago', valor: 140000.00, tipo: 'pagamento', data: '2025-10-20' },
        { descricao: 'Parcela 2 safra café 26', valor: 121333.33, tipo: 'parcela', data: '2026-06-30' },
        { descricao: 'Parcela 3 safra soja 26', valor: 121333.33, tipo: 'parcela', data: '2026-09-30' },
        { descricao: 'Parcela 4 final', valor: 121333.34, tipo: 'parcela', data: '2026-12-31' },
      ],
      condicoes: [
        'Desconto de 10% sobre saldo devedor atualizado',
        'Primeira parcela via venda de café especial (lote premiado)',
        'Parcelas remanescentes alinhadas à safra café + soja',
      ],
      fundamentacao: 'Produtor de café especial com potencial de receita acima da média. Café classificado acima de 84 pontos SCAA permite margem para quitação acelerada.',
      dataCriacao: '2025-09-01',
      dataValidade: '2026-12-31',
      ultimaAtualizacao: '2025-10-20',
      pdfUrl: '/api/propostas/prop-007/pdf',
      observacoes: 'Primeira parcela paga. Proposta enviada ao BB para aprovação.',
    },
  ]

  for (const p of data) {
    propostas.set(p.id, p)
  }
}

seed()

let propostaCounter = propostas.size

/* ========================================================================
 *  Roteador
 * ======================================================================== */

export default async function (fastify: FastifyInstance) {
  /* ---- LIST ---- */
  fastify.get('/api/propostas', async (request: FastifyRequest) => {
    const { status, clienteId } = request.query as { status?: string; clienteId?: string }

    let result = Array.from(propostas.values())

    if (status) {
      result = result.filter(p => p.status === status)
    }
    if (clienteId) {
      result = result.filter(p => p.clienteId === clienteId)
    }

    const resumos = result.map(p => ({
      id: p.id,
      clienteId: p.clienteId,
      clienteNome: p.clienteNome,
      credor: p.credor,
      titulo: p.titulo,
      tipo: p.tipo,
      status: p.status,
      valorDivida: p.valorDivida,
      valorProposta: p.valorProposta,
      descontoPercentual: p.descontoPercentual,
      dataCriacao: p.dataCriacao,
      dataValidade: p.dataValidade,
      ultimaAtualizacao: p.ultimaAtualizacao,
    }))

    return { success: true, data: resumos, total: resumos.length }
  })

  /* ---- GET BY ID ---- */
  fastify.get('/api/propostas/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const proposta = propostas.get(id)

    if (!proposta) {
      reply.status(404)
      return { success: false, error: 'Proposta não encontrada' }
    }

    return { success: true, data: proposta }
  })

  /* ---- GERAR PROPOSTA ---- */
  fastify.post('/api/propostas/gerar', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>

    const errors: string[] = []
    if (!body.clienteId || typeof body.clienteId !== 'string') errors.push('clienteId é obrigatório')
    if (!body.clienteNome || typeof body.clienteNome !== 'string') errors.push('clienteNome é obrigatório')
    if (!body.credor || typeof body.credor !== 'string') errors.push('credor é obrigatório')
    if (!body.titulo || typeof body.titulo !== 'string') errors.push('titulo é obrigatório')
    if (!body.tipo || typeof body.tipo !== 'string') errors.push('tipo é obrigatório')
    if (body.valorDivida === undefined || typeof body.valorDivida !== 'number') errors.push('valorDivida é obrigatório (number)')
    if (body.valorProposta === undefined || typeof body.valorProposta !== 'number') errors.push('valorProposta é obrigatório (number)')

    if (errors.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validação', detalhes: errors }
    }

    propostaCounter++
    const id = `prop-${String(propostaCounter).padStart(3, '0')}`
    const agora = new Date().toISOString().slice(0, 10)
    const validade = new Date()
    validade.setMonth(validade.getMonth() + 3)

    const valorDivida = body.valorDivida as number
    const valorProposta = body.valorProposta as number
    const desconto = valorDivida > 0 ? Number((((valorDivida - valorProposta) / valorDivida) * 100).toFixed(2)) : 0

    const nova: Proposta = {
      id,
      clienteId: body.clienteId as string,
      clienteNome: body.clienteNome as string,
      credor: body.credor as string,
      titulo: body.titulo as string,
      tipo: body.tipo as Proposta['tipo'],
      status: 'rascunho',
      valorDivida,
      valorProposta,
      descontoPercentual: desconto,
      itens: (body.itens as ItemProposta[]) || [],
      condicoes: (body.condicoes as string[]) || [],
      fundamentacao: (body.fundamentacao as string) || '',
      dataCriacao: agora,
      dataValidade: validade.toISOString().slice(0, 10),
      ultimaAtualizacao: agora,
      pdfUrl: null,
      observacoes: (body.observacoes as string) || '',
    }

    propostas.set(id, nova)

    // Simulate calculation engine trigger
    nova.pdfUrl = `/api/propostas/${id}/pdf`

    reply.status(201)
    return {
      success: true,
      data: nova,
      meta: {
        calculationEngineTriggered: true,
        estimatedPdfGenerationTime: '2-5 seconds',
      },
    }
  })

  /* ---- UPDATE STATUS ---- */
  fastify.patch('/api/propostas/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const proposta = propostas.get(id)

    if (!proposta) {
      reply.status(404)
      return { success: false, error: 'Proposta não encontrada' }
    }

    const body = request.body as Record<string, unknown>
    const updatable = [
      'status', 'titulo', 'valorProposta', 'itens', 'condicoes',
      'fundamentacao', 'observacoes',
    ]

    for (const key of updatable) {
      if (body[key] !== undefined) {
        ;(proposta as Record<string, unknown>)[key] = body[key]
      }
    }

    // Recalculate discount if valorProposta changed
    if (body.valorProposta) {
      proposta.descontoPercentual = proposta.valorDivida > 0
        ? Number((((proposta.valorDivida - proposta.valorProposta) / proposta.valorDivida) * 100).toFixed(2))
        : 0
    }

    proposta.ultimaAtualizacao = new Date().toISOString().slice(0, 10)
    propostas.set(id, proposta)

    return { success: true, data: proposta }
  })

  /* ---- PDF (real Puppeteer generation) ---- */
  fastify.get('/api/propostas/:id/pdf', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const proposta = propostas.get(id)

    if (!proposta) {
      reply.status(404)
      return { success: false, error: 'Proposta não encontrada' }
    }

    try {
      const pdfBuffer = await generatePropostaPdf(proposta)

      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="proposta-${id}.pdf"`)
        .header('Content-Length', pdfBuffer.length)
        .send(pdfBuffer)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error(`[PDF] Falha ao gerar PDF para ${id}:`, msg)
      reply.status(500)
      return { success: false, error: `Erro ao gerar PDF: ${msg}` }
    }
  })

  /* ---- GERAR PROPOSTA INTELIGENTE (15 seções, memória de cálculo, fundamentação legal) ---- */
  fastify.post('/api/propostas/gerar-completa', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      cliente?: DadosClienteProposta
      credito?: ContextoCredito
      eventos?: EventoAdverso[]
      negociacao?: ParametrosNegociacao
    }

    const errors: string[] = []
    if (!body?.cliente || typeof body.cliente !== 'object') errors.push('cliente é obrigatório')
    if (!body?.credito || typeof body.credito !== 'object') errors.push('credito é obrigatório')
    if (!body?.negociacao || typeof body.negociacao !== 'object') errors.push('negociacao é obrigatória')

    if (body?.cliente) {
      if (!body.cliente.nome) errors.push('cliente.nome é obrigatório')
      if (!body.cliente.cpfCnpj) errors.push('cliente.cpfCnpj é obrigatório')
      if (!body.cliente.cidade) errors.push('cliente.cidade é obrigatório')
      if (!body.cliente.uf) errors.push('cliente.uf é obrigatório')
    }
    if (body?.credito) {
      if (!body.credito.credor) errors.push('credito.credor é obrigatório')
      if (!body.credito.contratoAtual) errors.push('credito.contratoAtual é obrigatório')
      if (!Array.isArray(body.credito.contratosOriginais)) errors.push('credito.contratosOriginais deve ser array')
    }
    if (body?.negociacao && !body.negociacao.estrategia) {
      errors.push('negociacao.estrategia é obrigatória')
    }

    if (errors.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validação', detalhes: errors }
    }

    try {
      const proposta = await gerarPropostaInteligente(
        body.cliente as DadosClienteProposta,
        body.credito as ContextoCredito,
        (body.eventos ?? []) as EventoAdverso[],
        body.negociacao as ParametrosNegociacao,
      )

      propostasInteligentes.set(proposta.id, proposta)

      // Também registra versão compacta no Map padrão para aparecer na listagem
      propostaCounter++
      const idCompacto = `prop-${String(propostaCounter).padStart(3, '0')}`
      const resumo: Proposta = {
        id: idCompacto,
        clienteId: body.cliente!.id ?? idCompacto,
        clienteNome: proposta.cliente.nome,
        credor: proposta.credor,
        titulo: proposta.secoes.capa.titulo,
        tipo: mapEstrategiaToTipo(proposta.estrategia),
        status: 'rascunho',
        valorDivida: proposta.metricasChave.valorDividaAtualizado,
        valorProposta: proposta.metricasChave.valorPropostaEstruturada,
        descontoPercentual: proposta.metricasChave.descontoEstimado,
        itens: [],
        condicoes: [],
        fundamentacao: proposta.secoes.sumarioExecutivo?.paragrafoUnico ?? '',
        dataCriacao: proposta.dataGeracao,
        dataValidade: proposta.dataValidade,
        ultimaAtualizacao: proposta.dataGeracao,
        pdfUrl: `/api/propostas/inteligente/${proposta.id}/pdf`,
        observacoes: `Proposta inteligente com 15 seções. ID detalhado: ${proposta.id}`,
      }
      propostas.set(idCompacto, resumo)

      reply.status(201)
      return {
        success: true,
        data: proposta,
        meta: {
          secoes: Object.keys(proposta.secoes).length,
          metricasChave: proposta.metricasChave,
          resumoId: idCompacto,
        },
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error('[PropostaInteligente] Falha na geração:', msg)
      reply.status(500)
      return { success: false, error: `Erro ao gerar proposta inteligente: ${msg}` }
    }
  })

  /* ---- GET PROPOSTA INTELIGENTE ---- */
  fastify.get('/api/propostas/inteligente/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const proposta = propostasInteligentes.get(id)

    if (!proposta) {
      reply.status(404)
      return { success: false, error: 'Proposta inteligente não encontrada' }
    }

    return { success: true, data: proposta }
  })

  /* ---- LIST PROPOSTAS INTELIGENTES ---- */
  fastify.get('/api/propostas/inteligentes/list', async () => {
    const items = Array.from(propostasInteligentes.values()).map(p => ({
      id: p.id,
      clienteNome: p.cliente.nome,
      credor: p.credor,
      estrategia: p.estrategia,
      dataGeracao: p.dataGeracao,
      dataValidade: p.dataValidade,
      metricasChave: p.metricasChave,
    }))
    return { success: true, data: items, total: items.length }
  })
}

function mapEstrategiaToTipo(estrategia: string): Proposta['tipo'] {
  const e = estrategia.toLowerCase()
  if (e.includes('liquida')) return 'liquidacao'
  if (e.includes('alongamento') || e.includes('parcelamento')) return 'parcelamento'
  if (e.includes('dacao')) return 'liquidacao'
  if (e.includes('revisional') || e.includes('judicial')) return 'acordo_judicial'
  if (e.includes('memoria')) return 'memoria_calculo'
  return 'renegociacao'
}

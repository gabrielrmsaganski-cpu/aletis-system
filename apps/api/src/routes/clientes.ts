import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

/* ========================================================================
 *  Tipos
 * ======================================================================== */

interface Divida {
  contrato: string
  valorOriginal: number
  valorAtualizado: number
  vencimento: string
  status: 'ativa' | 'renegociada' | 'paga' | 'em_acordo'
  credor: string
}

interface Pagamento {
  data: string
  valor: number
  descricao: string
  tipo: 'pagamento' | 'dacao' | 'deposito_judicial'
}

interface TimelineEvent {
  data: string
  tipo: 'contato' | 'proposta' | 'pagamento' | 'reuniao' | 'documento' | 'analise' | 'acordo' | 'vencimento'
  descricao: string
  detalhes?: string
}

interface Cliente {
  id: string
  nome: string
  cpfCnpj: string
  cidade: string
  uf: string
  telefone: string
  email: string
  atividade: string
  areaTotalHa: number
  culturas: string[]
  estagio: 'prospeccao' | 'analise' | 'negociacao' | 'acordo' | 'encerrado'
  consultor: string
  credor: string
  valorTotalDivida: number
  valorTotalPago: number
  dividas: Divida[]
  pagamentos: Pagamento[]
  timeline: TimelineEvent[]
  dataCadastro: string
  ultimaAtualizacao: string
  observacoes: string
}

/* ========================================================================
 *  Dados em memoria (seed com casos reais + ficticios)
 * ======================================================================== */

const clientes: Map<string, Cliente> = new Map()

function seed() {
  const data: Cliente[] = [
    /* ---- CASO REAL 1: Ailton Caeiro da Silva ---- */
    {
      id: 'cli-001',
      nome: 'Ailton Caeiro da Silva',
      cpfCnpj: '028.XXX.XXX-80',
      cidade: 'Toledo',
      uf: 'PR',
      telefone: '(45) 99999-1001',
      email: 'ailton.caeiro@email.com',
      atividade: 'Produtor rural - Graos (soja, milho)',
      areaTotalHa: 480,
      culturas: ['soja', 'milho'],
      estagio: 'negociacao',
      consultor: 'Eduardo Mendes',
      credor: 'Sicoob',
      valorTotalDivida: 2148495.32,
      valorTotalPago: 2215482.03,
      dividas: [
        { contrato: '23110-0', valorOriginal: 350000.00, valorAtualizado: 412320.50, vencimento: '2023-06-15', status: 'renegociada', credor: 'Sicoob' },
        { contrato: '24821-2', valorOriginal: 480000.00, valorAtualizado: 558912.00, vencimento: '2023-08-20', status: 'renegociada', credor: 'Sicoob' },
        { contrato: '25381-4', valorOriginal: 320000.00, valorAtualizado: 379650.82, vencimento: '2023-10-10', status: 'renegociada', credor: 'Sicoob' },
        { contrato: '25882-7', valorOriginal: 290000.00, valorAtualizado: 345200.00, vencimento: '2024-01-15', status: 'renegociada', credor: 'Sicoob' },
        { contrato: '27981-3', valorOriginal: 410000.00, valorAtualizado: 452412.00, vencimento: '2024-03-20', status: 'renegociada', credor: 'Sicoob' },
        { contrato: '30262-4', valorOriginal: 2148495.32, valorAtualizado: 2148495.32, vencimento: '2025-12-31', status: 'em_acordo', credor: 'Sicoob' },
      ],
      pagamentos: [
        { data: '2024-03-15', valor: 500000.00, descricao: 'Pagamento parcial acordo', tipo: 'pagamento' },
        { data: '2024-06-20', valor: 450000.00, descricao: 'Pagamento pos-safra', tipo: 'pagamento' },
        { data: '2024-09-10', valor: 380000.00, descricao: 'Pagamento parcial', tipo: 'pagamento' },
        { data: '2025-01-15', valor: 521285.02, descricao: 'Dacao imovel mat. 45434', tipo: 'dacao' },
        { data: '2025-03-20', valor: 300000.00, descricao: 'Pagamento safra 24/25', tipo: 'pagamento' },
        { data: '2025-04-10', valor: 64197.01, descricao: 'Capital social Sicoob - quitacao', tipo: 'pagamento' },
      ],
      timeline: [
        { data: '2024-01-10', tipo: 'contato', descricao: 'Primeiro contato - cliente busca renegociacao de 5 contratos Sicoob' },
        { data: '2024-01-25', tipo: 'analise', descricao: 'Levantamento completo: contratos 23110-0, 24821-2, 25381-4, 25882-7, 27981-3' },
        { data: '2024-02-05', tipo: 'proposta', descricao: 'Proposta de consolidacao em contrato unico 30262-4' },
        { data: '2024-02-20', tipo: 'reuniao', descricao: 'Reuniao Sicoob Toledo - apresentacao proposta de liquidacao' },
        { data: '2024-03-15', tipo: 'pagamento', descricao: 'Primeiro pagamento do acordo: R$500.000,00' },
        { data: '2024-06-20', tipo: 'pagamento', descricao: 'Pagamento pos-safra: R$450.000,00' },
        { data: '2024-09-10', tipo: 'pagamento', descricao: 'Pagamento parcial: R$380.000,00' },
        { data: '2025-01-15', tipo: 'acordo', descricao: 'Dacao em pagamento - imovel matricula 45434 avaliado em R$521.285,02' },
        { data: '2025-03-20', tipo: 'pagamento', descricao: 'Pagamento safra 24/25: R$300.000,00' },
        { data: '2025-04-10', tipo: 'pagamento', descricao: 'Quitacao final via capital social Sicoob: R$64.197,01' },
      ],
      dataCadastro: '2024-01-10',
      ultimaAtualizacao: '2025-04-10',
      observacoes: 'Proposta de liquidacao via dacao imovel mat. 45434 + capital social R$64.197,01. Pagamentos totalizaram R$2.215.482,03.',
    },

    /* ---- CASO REAL 2: Paulo Luciano de Oliveira ---- */
    {
      id: 'cli-002',
      nome: 'Paulo Luciano de Oliveira',
      cpfCnpj: '452.XXX.XXX-91',
      cidade: 'Dourados',
      uf: 'MS',
      telefone: '(67) 99988-2002',
      email: 'paulo.luciano@email.com',
      atividade: 'Produtor rural - Graos e pastagem',
      areaTotalHa: 320,
      culturas: ['soja', 'milho', 'pastagem'],
      estagio: 'negociacao',
      consultor: 'Eduardo Mendes',
      credor: 'Fertiflora/Herbioeste',
      valorTotalDivida: 277380.00,
      valorTotalPago: 30000.00,
      dividas: [
        { contrato: '20189', valorOriginal: 86940.00, valorAtualizado: 86940.00, vencimento: '2025-06-30', status: 'em_acordo', credor: 'Fertiflora' },
        { contrato: '20192', valorOriginal: 86940.00, valorAtualizado: 86940.00, vencimento: '2025-08-15', status: 'em_acordo', credor: 'Fertiflora' },
        { contrato: '20190', valorOriginal: 103500.00, valorAtualizado: 103500.00, vencimento: '2025-10-30', status: 'em_acordo', credor: 'Herbioeste' },
      ],
      pagamentos: [
        { data: '2025-12-23', valor: 10000.00, descricao: 'Sinal de boa-fe', tipo: 'pagamento' },
        { data: '2026-02-26', valor: 20000.00, descricao: 'Parcela intermediaria', tipo: 'pagamento' },
      ],
      timeline: [
        { data: '2025-08-10', tipo: 'contato', descricao: 'Contato inicial - 3 titulos vencidos Fertiflora/Herbioeste' },
        { data: '2025-08-20', tipo: 'analise', descricao: 'Memoria de calculo: titulos 20189 (R$86.940), 20192 (R$86.940), 20190 (R$103.500)' },
        { data: '2025-09-05', tipo: 'proposta', descricao: 'Proposta: 4x R$70.550 alinhadas ao fluxo da safra' },
        { data: '2025-09-15', tipo: 'reuniao', descricao: 'Reuniao com Fertiflora - negociacao parcelas' },
        { data: '2025-12-23', tipo: 'pagamento', descricao: 'Sinal de boa-fe: R$10.000,00' },
        { data: '2026-02-26', tipo: 'pagamento', descricao: 'Parcela intermediaria: R$20.000,00' },
      ],
      dataCadastro: '2025-08-10',
      ultimaAtualizacao: '2026-02-26',
      observacoes: 'Memoria de calculo elaborada. Proposta de 4x R$70.550 alinhadas safra. Pagamentos parciais em andamento.',
    },

    /* ---- FICTICIOS (agronegocio brasileiro realista) ---- */
    {
      id: 'cli-003',
      nome: 'Fazenda Santa Helena Ltda',
      cpfCnpj: '12.345.678/0001-90',
      cidade: 'Sorriso',
      uf: 'MT',
      telefone: '(66) 99977-3003',
      email: 'contato@fazsantahelena.com.br',
      atividade: 'Producao de soja e algodao',
      areaTotalHa: 2800,
      culturas: ['soja', 'algodao'],
      estagio: 'analise',
      consultor: 'Mariana Costa',
      credor: 'Banco do Brasil',
      valorTotalDivida: 4850000.00,
      valorTotalPago: 0,
      dividas: [
        { contrato: 'BB-2024/1892', valorOriginal: 3200000.00, valorAtualizado: 3520000.00, vencimento: '2025-07-15', status: 'ativa', credor: 'Banco do Brasil' },
        { contrato: 'BB-2024/2103', valorOriginal: 1650000.00, valorAtualizado: 1330000.00, vencimento: '2025-09-30', status: 'ativa', credor: 'Banco do Brasil' },
      ],
      pagamentos: [],
      timeline: [
        { data: '2025-11-01', tipo: 'contato', descricao: 'Encaminhamento via indicacao - divida custeio BB' },
        { data: '2025-11-15', tipo: 'analise', descricao: 'Analise patrimonial e de fluxo de caixa em andamento' },
      ],
      dataCadastro: '2025-11-01',
      ultimaAtualizacao: '2025-11-15',
      observacoes: 'Grande produtor MT. Crise de fluxo de caixa por queda preco soja safra 24/25.',
    },
    {
      id: 'cli-004',
      nome: 'Jose Roberto Fernandes',
      cpfCnpj: '789.XXX.XXX-34',
      cidade: 'Rio Verde',
      uf: 'GO',
      telefone: '(64) 99966-4004',
      email: 'jroberto.fern@email.com',
      atividade: 'Pecuaria de corte e graos',
      areaTotalHa: 1200,
      culturas: ['soja', 'milho', 'boi_gordo'],
      estagio: 'acordo',
      consultor: 'Eduardo Mendes',
      credor: 'Bradesco',
      valorTotalDivida: 1890000.00,
      valorTotalPago: 945000.00,
      dividas: [
        { contrato: 'BRA-89234', valorOriginal: 1200000.00, valorAtualizado: 1350000.00, vencimento: '2025-05-20', status: 'em_acordo', credor: 'Bradesco' },
        { contrato: 'BRA-91002', valorOriginal: 540000.00, valorAtualizado: 540000.00, vencimento: '2025-11-30', status: 'em_acordo', credor: 'Bradesco' },
      ],
      pagamentos: [
        { data: '2025-06-15', valor: 500000.00, descricao: 'Venda lote 350 cab boi gordo', tipo: 'pagamento' },
        { data: '2025-10-10', valor: 445000.00, descricao: 'Parcela pos-safra milho', tipo: 'pagamento' },
      ],
      timeline: [
        { data: '2025-03-20', tipo: 'contato', descricao: 'Busca acordo Bradesco - custeio + investimento' },
        { data: '2025-04-05', tipo: 'analise', descricao: 'Analise rebanho + lavoura 1.200 ha' },
        { data: '2025-05-01', tipo: 'proposta', descricao: 'Proposta de quitacao via venda parcial rebanho + parcelas safra' },
        { data: '2025-06-15', tipo: 'pagamento', descricao: 'Pagamento via venda de gado: R$500.000' },
        { data: '2025-10-10', tipo: 'pagamento', descricao: 'Parcela pos-safra: R$445.000' },
      ],
      dataCadastro: '2025-03-20',
      ultimaAtualizacao: '2025-10-10',
      observacoes: 'Acordo em andamento. 50% quitado via gado + safra milho.',
    },
    {
      id: 'cli-005',
      nome: 'Agroindustrial Campos Verdes S/A',
      cpfCnpj: '34.567.890/0001-12',
      cidade: 'Uberlandia',
      uf: 'MG',
      telefone: '(34) 3233-5005',
      email: 'financeiro@camposverdes.agr.br',
      atividade: 'Agroindustria - processamento de graos',
      areaTotalHa: 5000,
      culturas: ['soja', 'milho', 'cafe'],
      estagio: 'prospeccao',
      consultor: 'Mariana Costa',
      credor: 'Itau BBA',
      valorTotalDivida: 12500000.00,
      valorTotalPago: 0,
      dividas: [
        { contrato: 'IBBA-2025/4455', valorOriginal: 8000000.00, valorAtualizado: 8960000.00, vencimento: '2026-01-15', status: 'ativa', credor: 'Itau BBA' },
        { contrato: 'IBBA-2025/4456', valorOriginal: 3540000.00, valorAtualizado: 3540000.00, vencimento: '2026-06-30', status: 'ativa', credor: 'Itau BBA' },
      ],
      pagamentos: [],
      timeline: [
        { data: '2026-01-05', tipo: 'contato', descricao: 'Contato via site - agroindustria grande porte' },
      ],
      dataCadastro: '2026-01-05',
      ultimaAtualizacao: '2026-01-05',
      observacoes: 'Prospect de alto valor. Divida agroindustrial Itau BBA.',
    },
    {
      id: 'cli-006',
      nome: 'Maria Aparecida dos Santos',
      cpfCnpj: '123.XXX.XXX-56',
      cidade: 'Barreiras',
      uf: 'BA',
      telefone: '(77) 99955-6006',
      email: 'maria.santos@email.com',
      atividade: 'Producao de algodao e soja',
      areaTotalHa: 850,
      culturas: ['algodao', 'soja'],
      estagio: 'negociacao',
      consultor: 'Eduardo Mendes',
      credor: 'Santander',
      valorTotalDivida: 980000.00,
      valorTotalPago: 250000.00,
      dividas: [
        { contrato: 'SAN-778901', valorOriginal: 650000.00, valorAtualizado: 720000.00, vencimento: '2025-08-30', status: 'em_acordo', credor: 'Santander' },
        { contrato: 'SAN-778902', valorOriginal: 260000.00, valorAtualizado: 260000.00, vencimento: '2026-02-28', status: 'em_acordo', credor: 'Santander' },
      ],
      pagamentos: [
        { data: '2025-09-15', valor: 150000.00, descricao: 'Primeira parcela acordo', tipo: 'pagamento' },
        { data: '2026-01-20', valor: 100000.00, descricao: 'Segunda parcela', tipo: 'pagamento' },
      ],
      timeline: [
        { data: '2025-06-10', tipo: 'contato', descricao: 'Indicacao - produtora MATOPIBA com divida Santander' },
        { data: '2025-07-01', tipo: 'analise', descricao: 'Analise 850 ha algodao/soja Barreiras-BA' },
        { data: '2025-08-05', tipo: 'proposta', descricao: 'Proposta parcelamento com desconto 15% a vista' },
        { data: '2025-09-15', tipo: 'pagamento', descricao: 'Primeira parcela: R$150.000' },
        { data: '2026-01-20', tipo: 'pagamento', descricao: 'Segunda parcela: R$100.000' },
      ],
      dataCadastro: '2025-06-10',
      ultimaAtualizacao: '2026-01-20',
      observacoes: 'Acordo Santander em andamento. Proxima parcela prevista pos-colheita algodao.',
    },
    {
      id: 'cli-007',
      nome: 'Cooperativa Agropecuaria Rondonia',
      cpfCnpj: '45.678.901/0001-23',
      cidade: 'Ji-Parana',
      uf: 'RO',
      telefone: '(69) 3422-7007',
      email: 'financeiro@cooprn.coop.br',
      atividade: 'Cooperativa - leite e cafe',
      areaTotalHa: 15000,
      culturas: ['cafe', 'leite', 'cacau'],
      estagio: 'analise',
      consultor: 'Mariana Costa',
      credor: 'BNDES / Banco da Amazonia',
      valorTotalDivida: 8200000.00,
      valorTotalPago: 0,
      dividas: [
        { contrato: 'BASA-2024/3890', valorOriginal: 5500000.00, valorAtualizado: 6050000.00, vencimento: '2025-12-31', status: 'ativa', credor: 'Banco da Amazonia' },
        { contrato: 'BNDES-2024/1120', valorOriginal: 2150000.00, valorAtualizado: 2150000.00, vencimento: '2026-06-30', status: 'ativa', credor: 'BNDES' },
      ],
      pagamentos: [],
      timeline: [
        { data: '2025-10-20', tipo: 'contato', descricao: 'Cooperativa com 120 associados - crise de liquidez' },
        { data: '2025-11-05', tipo: 'analise', descricao: 'Levantamento patrimonial e analise de cooperados' },
        { data: '2026-01-15', tipo: 'documento', descricao: 'Documentacao patrimonial entregue' },
      ],
      dataCadastro: '2025-10-20',
      ultimaAtualizacao: '2026-01-15',
      observacoes: 'Caso complexo - cooperativa. Necessita reestruturacao completa.',
    },
    {
      id: 'cli-008',
      nome: 'Rodrigo Antunes Pereira',
      cpfCnpj: '567.XXX.XXX-12',
      cidade: 'Lucas do Rio Verde',
      uf: 'MT',
      telefone: '(65) 99944-8008',
      email: 'rodrigo.antunes@email.com',
      atividade: 'Produtor rural - Soja e milho safrinha',
      areaTotalHa: 600,
      culturas: ['soja', 'milho'],
      estagio: 'encerrado',
      consultor: 'Eduardo Mendes',
      credor: 'Cresol',
      valorTotalDivida: 420000.00,
      valorTotalPago: 420000.00,
      dividas: [
        { contrato: 'CRE-45102', valorOriginal: 420000.00, valorAtualizado: 420000.00, vencimento: '2025-04-30', status: 'paga', credor: 'Cresol' },
      ],
      pagamentos: [
        { data: '2025-05-10', valor: 210000.00, descricao: 'Primeira parcela', tipo: 'pagamento' },
        { data: '2025-08-15', valor: 210000.00, descricao: 'Quitacao final', tipo: 'pagamento' },
      ],
      timeline: [
        { data: '2025-02-01', tipo: 'contato', descricao: 'Busca renegociacao Cresol' },
        { data: '2025-02-15', tipo: 'proposta', descricao: 'Proposta 2x iguais pos-safra' },
        { data: '2025-03-01', tipo: 'acordo', descricao: 'Acordo firmado com Cresol' },
        { data: '2025-05-10', tipo: 'pagamento', descricao: 'Parcela 1: R$210.000' },
        { data: '2025-08-15', tipo: 'pagamento', descricao: 'Quitacao final: R$210.000' },
        { data: '2025-08-20', tipo: 'documento', descricao: 'Termo de quitacao emitido' },
      ],
      dataCadastro: '2025-02-01',
      ultimaAtualizacao: '2025-08-20',
      observacoes: 'Caso encerrado com sucesso. Divida quitada em 2 parcelas.',
    },
    {
      id: 'cli-009',
      nome: 'Agropecuaria Tres Irmaos Ltda',
      cpfCnpj: '56.789.012/0001-34',
      cidade: 'Luís Eduardo Magalhaes',
      uf: 'BA',
      telefone: '(77) 99933-9009',
      email: 'tres.irmaos@email.com',
      atividade: 'Graos e irrigacao',
      areaTotalHa: 3500,
      culturas: ['soja', 'milho', 'feijao_irrigado'],
      estagio: 'prospeccao',
      consultor: 'Mariana Costa',
      credor: 'Sicredi',
      valorTotalDivida: 3100000.00,
      valorTotalPago: 0,
      dividas: [
        { contrato: 'SIC-2025/7780', valorOriginal: 2000000.00, valorAtualizado: 2200000.00, vencimento: '2026-03-15', status: 'ativa', credor: 'Sicredi' },
        { contrato: 'SIC-2025/7781', valorOriginal: 900000.00, valorAtualizado: 900000.00, vencimento: '2026-07-31', status: 'ativa', credor: 'Sicredi' },
      ],
      pagamentos: [],
      timeline: [
        { data: '2026-02-10', tipo: 'contato', descricao: 'Contato inicial via WhatsApp' },
      ],
      dataCadastro: '2026-02-10',
      ultimaAtualizacao: '2026-02-10',
      observacoes: 'Prospect MATOPIBA. Analise inicial pendente.',
    },
    {
      id: 'cli-010',
      nome: 'Carlos Eduardo Nakamura',
      cpfCnpj: '890.XXX.XXX-67',
      cidade: 'Maringa',
      uf: 'PR',
      telefone: '(44) 99922-1010',
      email: 'carlos.nakamura@email.com',
      atividade: 'Cafeicultura e graos',
      areaTotalHa: 180,
      culturas: ['cafe', 'soja'],
      estagio: 'negociacao',
      consultor: 'Eduardo Mendes',
      credor: 'Banco do Brasil',
      valorTotalDivida: 560000.00,
      valorTotalPago: 140000.00,
      dividas: [
        { contrato: 'BB-2024/8901', valorOriginal: 350000.00, valorAtualizado: 385000.00, vencimento: '2025-09-30', status: 'em_acordo', credor: 'Banco do Brasil' },
        { contrato: 'BB-2024/8902', valorOriginal: 175000.00, valorAtualizado: 175000.00, vencimento: '2026-03-31', status: 'em_acordo', credor: 'Banco do Brasil' },
      ],
      pagamentos: [
        { data: '2025-10-20', valor: 140000.00, descricao: 'Venda lote cafe especial', tipo: 'pagamento' },
      ],
      timeline: [
        { data: '2025-07-15', tipo: 'contato', descricao: 'Indicacao - cafeicultor com divida BB' },
        { data: '2025-08-01', tipo: 'analise', descricao: 'Analise 180 ha cafe + soja Maringa-PR' },
        { data: '2025-09-01', tipo: 'proposta', descricao: 'Proposta: venda cafe especial + parcelas safra soja' },
        { data: '2025-10-20', tipo: 'pagamento', descricao: 'Venda lote cafe: R$140.000' },
      ],
      dataCadastro: '2025-07-15',
      ultimaAtualizacao: '2025-10-20',
      observacoes: 'Cafeicultor com cafe especial de alto valor. Negociacao BB em progresso.',
    },
  ]

  for (const c of data) {
    clientes.set(c.id, c)
  }
}

seed()

/* ========================================================================
 *  Roteador
 * ======================================================================== */

export default async function (fastify: FastifyInstance) {
  /* ---- LIST ---- */
  fastify.get('/api/clientes', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { estagio, consultor, search } = request.query as {
      estagio?: string
      consultor?: string
      search?: string
    }

    let result = Array.from(clientes.values())

    if (estagio) {
      result = result.filter(c => c.estagio === estagio)
    }
    if (consultor) {
      result = result.filter(c => c.consultor.toLowerCase().includes(consultor.toLowerCase()))
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        c =>
          c.nome.toLowerCase().includes(q) ||
          c.cidade.toLowerCase().includes(q) ||
          c.credor.toLowerCase().includes(q) ||
          c.atividade.toLowerCase().includes(q),
      )
    }

    // Retorna resumo (sem arrays pesados)
    const resumos = result.map(c => ({
      id: c.id,
      nome: c.nome,
      cidade: c.cidade,
      uf: c.uf,
      estagio: c.estagio,
      consultor: c.consultor,
      credor: c.credor,
      valorTotalDivida: c.valorTotalDivida,
      valorTotalPago: c.valorTotalPago,
      culturas: c.culturas,
      areaTotalHa: c.areaTotalHa,
      ultimaAtualizacao: c.ultimaAtualizacao,
    }))

    return { success: true, data: resumos, total: resumos.length }
  })

  /* ---- GET BY ID ---- */
  fastify.get('/api/clientes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)

    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente nao encontrado' }
    }

    return { success: true, data: cliente }
  })

  /* ---- CREATE ---- */
  fastify.post('/api/clientes', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>

    // Zod-style inline validation
    const errors: string[] = []
    if (!body.nome || typeof body.nome !== 'string') errors.push('nome e obrigatorio (string)')
    if (!body.cpfCnpj || typeof body.cpfCnpj !== 'string') errors.push('cpfCnpj e obrigatorio (string)')
    if (!body.cidade || typeof body.cidade !== 'string') errors.push('cidade e obrigatoria (string)')
    if (!body.uf || typeof body.uf !== 'string' || (body.uf as string).length !== 2) errors.push('uf e obrigatoria (2 caracteres)')
    if (!body.credor || typeof body.credor !== 'string') errors.push('credor e obrigatorio (string)')
    if (body.valorTotalDivida === undefined || typeof body.valorTotalDivida !== 'number') errors.push('valorTotalDivida e obrigatorio (number)')

    if (errors.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validacao', detalhes: errors }
    }

    const id = `cli-${String(clientes.size + 1).padStart(3, '0')}`
    const agora = new Date().toISOString().slice(0, 10)

    const novo: Cliente = {
      id,
      nome: body.nome as string,
      cpfCnpj: body.cpfCnpj as string,
      cidade: body.cidade as string,
      uf: body.uf as string,
      telefone: (body.telefone as string) || '',
      email: (body.email as string) || '',
      atividade: (body.atividade as string) || '',
      areaTotalHa: (body.areaTotalHa as number) || 0,
      culturas: (body.culturas as string[]) || [],
      estagio: (body.estagio as Cliente['estagio']) || 'prospeccao',
      consultor: (body.consultor as string) || 'Nao atribuido',
      credor: body.credor as string,
      valorTotalDivida: body.valorTotalDivida as number,
      valorTotalPago: (body.valorTotalPago as number) || 0,
      dividas: (body.dividas as Divida[]) || [],
      pagamentos: (body.pagamentos as Pagamento[]) || [],
      timeline: [
        { data: agora, tipo: 'contato', descricao: 'Cliente cadastrado no sistema' },
      ],
      dataCadastro: agora,
      ultimaAtualizacao: agora,
      observacoes: (body.observacoes as string) || '',
    }

    clientes.set(id, novo)
    reply.status(201)
    return { success: true, data: novo }
  })

  /* ---- UPDATE ---- */
  fastify.patch('/api/clientes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)

    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente nao encontrado' }
    }

    const body = request.body as Record<string, unknown>
    const updatable = [
      'nome', 'cpfCnpj', 'cidade', 'uf', 'telefone', 'email', 'atividade',
      'areaTotalHa', 'culturas', 'estagio', 'consultor', 'credor',
      'valorTotalDivida', 'valorTotalPago', 'dividas', 'pagamentos',
      'observacoes',
    ]

    for (const key of updatable) {
      if (body[key] !== undefined) {
        ;(cliente as Record<string, unknown>)[key] = body[key]
      }
    }

    cliente.ultimaAtualizacao = new Date().toISOString().slice(0, 10)

    // Add timeline event for stage change
    if (body.estagio) {
      cliente.timeline.push({
        data: cliente.ultimaAtualizacao,
        tipo: 'analise',
        descricao: `Estagio alterado para: ${body.estagio}`,
      })
    }

    clientes.set(id, cliente)
    return { success: true, data: cliente }
  })

  /* ---- TIMELINE ---- */
  fastify.get('/api/clientes/:id/timeline', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)

    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente nao encontrado' }
    }

    const sorted = [...cliente.timeline].sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
    )

    return {
      success: true,
      data: {
        clienteId: id,
        clienteNome: cliente.nome,
        eventos: sorted,
        total: sorted.length,
      },
    }
  })
}

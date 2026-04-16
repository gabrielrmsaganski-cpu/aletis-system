// =============================================================================
// ALETIS — Mock Data for Brazilian Agribusiness Debt Restructuring Platform
// =============================================================================

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

interface User {
  id: string;
  nome: string;
  email: string;
  role: 'admin' | 'analista' | 'consultor' | 'viewer';
  avatar: string;
  telefone: string;
  criadoEm: string;
}

type StageSlug =
  | 'lead'
  | 'qualificacao'
  | 'analise'
  | 'proposta'
  | 'negociacao'
  | 'acordo'
  | 'acompanhamento'
  | 'concluido';

interface Imovel {
  descricao: string;
  matricula: string;
  areaHa: number;
  municipio: string;
  uf: string;
}

interface Contrato {
  tipo: string;
  modalidade: string;
  banco: string;
  valorOriginal: number;
  taxaContratada: string;
  cetPraticado: string;
  dataContratacao: string;
  dataVencimento: string;
}

interface Cliente {
  id: string;
  nome: string;
  cpfCnpj: string;
  telefone: string;
  email: string;
  municipio: string;
  uf: string;
  tipoProdutor: 'proprietario' | 'arrendatario' | 'parceiro' | 'meeiro';
  culturas: string[];
  credores: string[];
  dividaTotal: number;
  valorPago: number;
  stage: StageSlug;
  healthScore: number;
  contratos: Contrato[];
  imoveis: Imovel[];
  observacoes: string;
  criadoEm: string;
  atualizadoEm: string;
}

interface CotacaoPonto {
  data: string;
  valor: number;
}

interface Cotacao {
  id: string;
  commodity: string;
  unidade: string;
  precoAtual: number;
  variacao: number;
  variacaoPercent: number;
  atualizadoEm: string;
  historico: CotacaoPonto[];
}

interface Indicador {
  id: string;
  nome: string;
  sigla: string;
  valor: number;
  unidade: string;
  variacaoMensal: number;
  atualizadoEm: string;
}

interface KPIs {
  totalClientes: number;
  clientesAtivos: number;
  propostasGeradas: number;
  propostasAceitas: number;
  volumeNegociado: number;
  volumeEconomizado: number;
  ticketMedio: number;
  taxaConversao: number;
}

type NotificacaoTipo =
  | 'proposta_visualizada'
  | 'alerta_mercado'
  | 'novo_lead'
  | 'proposta_aceita'
  | 'pagamento_confirmado'
  | 'documento_pendente'
  | 'prazo_vencendo'
  | 'mensagem';

interface Notificacao {
  id: string;
  tipo: NotificacaoTipo;
  titulo: string;
  mensagem: string;
  lida: boolean;
  clienteId: string | null;
  criadaEm: string;
}

interface Evento {
  id: string;
  clienteId: string;
  tipo: string;
  titulo: string;
  descricao: string;
  usuario: string;
  data: string;
}

type PropostaStatus =
  | 'rascunho'
  | 'enviada'
  | 'visualizada'
  | 'em_analise'
  | 'aceita'
  | 'recusada'
  | 'expirada';

interface Proposta {
  id: string;
  clienteId: string;
  clienteNome: string;
  credor: string;
  dividaOriginal: number;
  valorProposta: number;
  desconto: number;
  parcelas: number;
  taxaJuros: string;
  status: PropostaStatus;
  validadeAte: string;
  criadaEm: string;
  atualizadaEm: string;
  observacoes: string;
}

// ---------------------------------------------------------------------------
// Helper — generate 30-day sparkline with realistic daily price variation
// ---------------------------------------------------------------------------

function gerarHistorico(
  precoBase: number,
  volatilidadePercent: number,
): CotacaoPonto[] {
  const pontos: CotacaoPonto[] = [];
  let valor = precoBase * (1 - volatilidadePercent / 100 * 1.5);
  const hoje = new Date(2026, 3, 16); // 2026-04-16

  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const diaSemana = d.getDay();
    if (diaSemana === 0 || diaSemana === 6) continue; // skip weekends

    const mudanca = (Math.random() - 0.48) * volatilidadePercent * 0.4;
    valor = valor * (1 + mudanca / 100);
    valor = Math.max(valor, precoBase * 0.9);
    valor = Math.min(valor, precoBase * 1.1);
    pontos.push({
      data: d.toISOString().slice(0, 10),
      valor: parseFloat(valor.toFixed(2)),
    });
  }
  // ensure last point matches current price
  if (pontos.length > 0) {
    pontos[pontos.length - 1].valor = precoBase;
  }
  return pontos;
}

// ---------------------------------------------------------------------------
// mockUser
// ---------------------------------------------------------------------------

export const mockUser: User = {
  id: 'usr_001',
  nome: 'Christian Kohler',
  email: 'christian@aletis.com.br',
  role: 'admin',
  avatar: '/avatars/placeholder.png',
  telefone: '+55 44 99999-0001',
  criadoEm: '2025-01-15T10:00:00Z',
};

// ---------------------------------------------------------------------------
// mockClientes
// ---------------------------------------------------------------------------

export const mockClientes: Cliente[] = [
  // ---- REAL CASE 1: Ailton Caeiro da Silva ----
  {
    id: 'cli_001',
    nome: 'Ailton Caeiro da Silva',
    cpfCnpj: '***.***.***-01',
    telefone: '+55 45 99876-1234',
    email: 'ailton.caeiro@email.com',
    municipio: 'Toledo',
    uf: 'PR',
    tipoProdutor: 'proprietario',
    culturas: ['soja', 'milho'],
    credores: ['Sicoob'],
    dividaTotal: 2148495.32,
    valorPago: 2215482.03,
    stage: 'negociacao',
    healthScore: 35,
    contratos: [
      {
        tipo: 'Credito Rural',
        modalidade: 'Custeio',
        banco: 'Sicoob',
        valorOriginal: 1200000.0,
        taxaContratada: '2.0% a.m.',
        cetPraticado: '30.46% a.a.',
        dataContratacao: '2021-03-15',
        dataVencimento: '2024-03-15',
      },
      {
        tipo: 'Credito Rural',
        modalidade: 'Investimento',
        banco: 'Sicoob',
        valorOriginal: 948495.32,
        taxaContratada: '2.0% a.m.',
        cetPraticado: '30.46% a.a.',
        dataContratacao: '2021-06-20',
        dataVencimento: '2025-06-20',
      },
    ],
    imoveis: [
      {
        descricao: 'Propriedade Rural',
        matricula: '45434',
        areaHa: 10.0182,
        municipio: 'Toledo',
        uf: 'PR',
      },
    ],
    observacoes:
      'Divida renegociada para R$2M a 2% a.m. (CET 30.46% a.a.). Produtor ja pagou R$2.215.482,03. Revisional em andamento para correcao de encargos abusivos. Matricula 45434 — 10,0182 ha.',
    criadoEm: '2025-04-10T08:30:00Z',
    atualizadoEm: '2026-04-14T16:45:00Z',
  },

  // ---- REAL CASE 2: Paulo Luciano de Oliveira ----
  {
    id: 'cli_002',
    nome: 'Paulo Luciano de Oliveira',
    cpfCnpj: '***.***.***-02',
    telefone: '+55 67 99812-5678',
    email: 'paulo.luciano@email.com',
    municipio: 'Dourados',
    uf: 'MS',
    tipoProdutor: 'arrendatario',
    culturas: ['soja', 'milho'],
    credores: ['Fertiflora', 'Herbioeste'],
    dividaTotal: 277380.0,
    valorPago: 30000.0,
    stage: 'proposta',
    healthScore: 45,
    contratos: [
      {
        tipo: 'Insumos Agricolas',
        modalidade: 'Fertilizantes',
        banco: 'Fertiflora',
        valorOriginal: 185000.0,
        taxaContratada: '1.0% a.m.',
        cetPraticado: '48.58% a.a.',
        dataContratacao: '2023-08-10',
        dataVencimento: '2024-08-10',
      },
      {
        tipo: 'Insumos Agricolas',
        modalidade: 'Defensivos',
        banco: 'Herbioeste',
        valorOriginal: 92380.0,
        taxaContratada: '1.0% a.m.',
        cetPraticado: '48.58% a.a.',
        dataContratacao: '2023-09-05',
        dataVencimento: '2024-09-05',
      },
    ],
    imoveis: [],
    observacoes:
      'Arrendatario sem imovel proprio. Taxa contratada de 1% a.m. mas CET praticado de 48,58% a.a. indica cobranca de encargos embutidos muito acima do pactuado. Ja pagou R$30.000. Proposta de acordo em elaboracao.',
    criadoEm: '2025-09-20T14:00:00Z',
    atualizadoEm: '2026-04-12T11:20:00Z',
  },

  // ---- FICTIONAL CASE 3 ----
  {
    id: 'cli_003',
    nome: 'Maria Aparecida Ferreira dos Santos',
    cpfCnpj: '***.***.***-03',
    telefone: '+55 44 99765-3210',
    email: 'maria.ferreira@email.com',
    municipio: 'Maringa',
    uf: 'PR',
    tipoProdutor: 'proprietario',
    culturas: ['soja', 'milho', 'trigo'],
    credores: ['Sicredi'],
    dividaTotal: 890000.0,
    valorPago: 120000.0,
    stage: 'analise',
    healthScore: 52,
    contratos: [
      {
        tipo: 'Credito Rural',
        modalidade: 'Custeio',
        banco: 'Sicredi',
        valorOriginal: 890000.0,
        taxaContratada: '1.5% a.m.',
        cetPraticado: '24.50% a.a.',
        dataContratacao: '2022-02-01',
        dataVencimento: '2025-02-01',
      },
    ],
    imoveis: [
      {
        descricao: 'Fazenda Boa Esperanca',
        matricula: '31220',
        areaHa: 48.5,
        municipio: 'Maringa',
        uf: 'PR',
      },
    ],
    observacoes:
      'Produtora familiar com historico de adimplencia. Dificuldades iniciaram apos frustracoes de safra 2023/24. Sicredi demonstrou abertura para renegociacao.',
    criadoEm: '2025-11-05T09:15:00Z',
    atualizadoEm: '2026-04-10T14:30:00Z',
  },

  // ---- FICTIONAL CASE 4 ----
  {
    id: 'cli_004',
    nome: 'Jose Carlos Ribeiro',
    cpfCnpj: '***.***.***-04',
    telefone: '+55 66 99854-7890',
    email: 'jc.ribeiro@email.com',
    municipio: 'Sorriso',
    uf: 'MT',
    tipoProdutor: 'proprietario',
    culturas: ['soja', 'algodao'],
    credores: ['Banco do Brasil'],
    dividaTotal: 4850000.0,
    valorPago: 800000.0,
    stage: 'acordo',
    healthScore: 60,
    contratos: [
      {
        tipo: 'Credito Rural',
        modalidade: 'Investimento',
        banco: 'Banco do Brasil',
        valorOriginal: 3200000.0,
        taxaContratada: '1.2% a.m.',
        cetPraticado: '18.75% a.a.',
        dataContratacao: '2020-07-15',
        dataVencimento: '2025-07-15',
      },
      {
        tipo: 'Credito Rural',
        modalidade: 'Custeio',
        banco: 'Banco do Brasil',
        valorOriginal: 1650000.0,
        taxaContratada: '1.0% a.m.',
        cetPraticado: '16.20% a.a.',
        dataContratacao: '2022-01-10',
        dataVencimento: '2025-01-10',
      },
    ],
    imoveis: [
      {
        descricao: 'Fazenda Santa Rita',
        matricula: '58910',
        areaHa: 320.0,
        municipio: 'Sorriso',
        uf: 'MT',
      },
      {
        descricao: 'Chacara Ribeiro',
        matricula: '58911',
        areaHa: 5.2,
        municipio: 'Sorriso',
        uf: 'MT',
      },
    ],
    observacoes:
      'Grande produtor de soja e algodao. Acordo ja firmado com BB para parcelamento em 48x com desconto de 15% sobre encargos. Acompanhamento ativo.',
    criadoEm: '2025-06-18T11:00:00Z',
    atualizadoEm: '2026-04-08T09:50:00Z',
  },

  // ---- FICTIONAL CASE 5 ----
  {
    id: 'cli_005',
    nome: 'Claudemir de Souza Pinto',
    cpfCnpj: '***.***.***-05',
    telefone: '+55 64 99821-4455',
    email: 'claudemir.pinto@email.com',
    municipio: 'Rio Verde',
    uf: 'GO',
    tipoProdutor: 'parceiro',
    culturas: ['milho', 'boi gordo'],
    credores: ['Cresol'],
    dividaTotal: 345000.0,
    valorPago: 0.0,
    stage: 'qualificacao',
    healthScore: 40,
    contratos: [
      {
        tipo: 'Credito Rural',
        modalidade: 'Custeio Pecuario',
        banco: 'Cresol',
        valorOriginal: 345000.0,
        taxaContratada: '1.8% a.m.',
        cetPraticado: '28.32% a.a.',
        dataContratacao: '2023-04-20',
        dataVencimento: '2025-04-20',
      },
    ],
    imoveis: [
      {
        descricao: 'Sitio Agua Boa',
        matricula: '72345',
        areaHa: 22.0,
        municipio: 'Rio Verde',
        uf: 'GO',
      },
    ],
    observacoes:
      'Produtor parceiro (confinamento de boi gordo e milho para silagem). Cresol incluiu encargos de capitalizacao na operacao. Em fase de qualificacao para verificar viabilidade de revisional.',
    criadoEm: '2026-03-01T08:00:00Z',
    atualizadoEm: '2026-04-15T10:00:00Z',
  },

  // ---- FICTIONAL CASE 6 ----
  {
    id: 'cli_006',
    nome: 'Ana Paula Mendes Brito',
    cpfCnpj: '***.***.***-06',
    telefone: '+55 16 99733-6677',
    email: 'ana.brito@email.com',
    municipio: 'Ribeirao Preto',
    uf: 'SP',
    tipoProdutor: 'proprietario',
    culturas: ['cafe'],
    credores: ['CEF'],
    dividaTotal: 1520000.0,
    valorPago: 350000.0,
    stage: 'acompanhamento',
    healthScore: 68,
    contratos: [
      {
        tipo: 'Credito Rural',
        modalidade: 'Investimento',
        banco: 'Caixa Economica Federal',
        valorOriginal: 1520000.0,
        taxaContratada: '0.95% a.m.',
        cetPraticado: '15.80% a.a.',
        dataContratacao: '2021-09-10',
        dataVencimento: '2026-09-10',
      },
    ],
    imoveis: [
      {
        descricao: 'Fazenda Cafe Alto',
        matricula: '90112',
        areaHa: 85.3,
        municipio: 'Ribeirao Preto',
        uf: 'SP',
      },
    ],
    observacoes:
      'Cafeicultora com acordo firmado junto a CEF. Parcelas em dia. Monitoramento ativo da safra e capacidade de pagamento. Proxima revisao contratual em set/2026.',
    criadoEm: '2025-05-22T13:30:00Z',
    atualizadoEm: '2026-04-11T15:15:00Z',
  },

  // ---- FICTIONAL CASE 7 ----
  {
    id: 'cli_007',
    nome: 'Roberto Alves da Cruz',
    cpfCnpj: '***.***.***-07',
    telefone: '+55 34 99688-2233',
    email: 'roberto.cruz@email.com',
    municipio: 'Uberlandia',
    uf: 'MG',
    tipoProdutor: 'proprietario',
    culturas: ['soja', 'milho', 'cafe'],
    credores: ['Sicoob', 'Revenda AgroMax'],
    dividaTotal: 2780000.0,
    valorPago: 450000.0,
    stage: 'concluido',
    healthScore: 82,
    contratos: [
      {
        tipo: 'Credito Rural',
        modalidade: 'Custeio',
        banco: 'Sicoob',
        valorOriginal: 1800000.0,
        taxaContratada: '1.3% a.m.',
        cetPraticado: '21.40% a.a.',
        dataContratacao: '2020-11-01',
        dataVencimento: '2024-11-01',
      },
      {
        tipo: 'Insumos Agricolas',
        modalidade: 'Pacote Tecnologico',
        banco: 'Revenda AgroMax',
        valorOriginal: 980000.0,
        taxaContratada: '1.5% a.m.',
        cetPraticado: '35.20% a.a.',
        dataContratacao: '2022-03-20',
        dataVencimento: '2023-03-20',
      },
    ],
    imoveis: [
      {
        descricao: 'Fazenda Triangulo',
        matricula: '45678',
        areaHa: 210.0,
        municipio: 'Uberlandia',
        uf: 'MG',
      },
    ],
    observacoes:
      'Caso concluido com sucesso. Economia total de R$620.000 sobre encargos abusivos. Sicoob e AgroMax aceitaram acordo com reducao de 22% nos juros acumulados.',
    criadoEm: '2024-08-12T10:00:00Z',
    atualizadoEm: '2026-02-28T17:00:00Z',
  },

  // ---- FICTIONAL CASE 8 ----
  {
    id: 'cli_008',
    nome: 'Fernando Henrique Takahashi',
    cpfCnpj: '***.***.***-08',
    telefone: '+55 44 99701-8899',
    email: 'fernando.takahashi@email.com',
    municipio: 'Cascavel',
    uf: 'PR',
    tipoProdutor: 'proprietario',
    culturas: ['soja', 'milho'],
    credores: ['Sicredi', 'Revenda Agrofertil'],
    dividaTotal: 52000.0,
    valorPago: 0.0,
    stage: 'lead',
    healthScore: 28,
    contratos: [
      {
        tipo: 'Insumos Agricolas',
        modalidade: 'Sementes e Defensivos',
        banco: 'Revenda Agrofertil',
        valorOriginal: 52000.0,
        taxaContratada: '2.5% a.m.',
        cetPraticado: '42.00% a.a.',
        dataContratacao: '2024-09-01',
        dataVencimento: '2025-09-01',
      },
    ],
    imoveis: [
      {
        descricao: 'Sitio Takahashi',
        matricula: '33210',
        areaHa: 12.0,
        municipio: 'Cascavel',
        uf: 'PR',
      },
    ],
    observacoes:
      'Pequeno produtor, lead recente via indicacao. Divida relativamente pequena porem com taxa abusiva de 2,5% a.m. Potencial para revisional rapido.',
    criadoEm: '2026-04-14T09:00:00Z',
    atualizadoEm: '2026-04-14T09:00:00Z',
  },

  // ---- FICTIONAL CASE 9 ----
  {
    id: 'cli_009',
    nome: 'Luciana Ferreira Campos',
    cpfCnpj: '***.***.***-09',
    telefone: '+55 67 99845-1100',
    email: 'luciana.campos@email.com',
    municipio: 'Campo Grande',
    uf: 'MS',
    tipoProdutor: 'proprietario',
    culturas: ['boi gordo', 'soja'],
    credores: ['Banco do Brasil', 'CEF'],
    dividaTotal: 3200000.0,
    valorPago: 950000.0,
    stage: 'negociacao',
    healthScore: 50,
    contratos: [
      {
        tipo: 'Credito Rural',
        modalidade: 'Investimento Pecuario',
        banco: 'Banco do Brasil',
        valorOriginal: 2100000.0,
        taxaContratada: '1.1% a.m.',
        cetPraticado: '17.90% a.a.',
        dataContratacao: '2021-05-01',
        dataVencimento: '2026-05-01',
      },
      {
        tipo: 'Credito Rural',
        modalidade: 'Custeio',
        banco: 'Caixa Economica Federal',
        valorOriginal: 1100000.0,
        taxaContratada: '1.4% a.m.',
        cetPraticado: '22.60% a.a.',
        dataContratacao: '2022-08-15',
        dataVencimento: '2025-08-15',
      },
    ],
    imoveis: [
      {
        descricao: 'Fazenda Campeira',
        matricula: '81023',
        areaHa: 540.0,
        municipio: 'Campo Grande',
        uf: 'MS',
      },
    ],
    observacoes:
      'Pecuarista e sojicultora. Dois credores com taxas elevadas. Negociacao em andamento com ambos simultaneamente. BB mais receptivo que CEF.',
    criadoEm: '2025-10-03T16:00:00Z',
    atualizadoEm: '2026-04-13T12:30:00Z',
  },

  // ---- FICTIONAL CASE 10 ----
  {
    id: 'cli_010',
    nome: 'Marcos Vinicius Pereira',
    cpfCnpj: '***.***.***-10',
    telefone: '+55 65 99900-4455',
    email: 'marcos.pereira@email.com',
    municipio: 'Rondonopolis',
    uf: 'MT',
    tipoProdutor: 'arrendatario',
    culturas: ['algodao', 'soja'],
    credores: ['Revenda Nutrien'],
    dividaTotal: 185000.0,
    valorPago: 40000.0,
    stage: 'proposta',
    healthScore: 38,
    contratos: [
      {
        tipo: 'Insumos Agricolas',
        modalidade: 'Fertilizantes e Corretivos',
        banco: 'Revenda Nutrien',
        valorOriginal: 185000.0,
        taxaContratada: '1.8% a.m.',
        cetPraticado: '38.40% a.a.',
        dataContratacao: '2024-02-10',
        dataVencimento: '2025-02-10',
      },
    ],
    imoveis: [],
    observacoes:
      'Arrendatario de area de algodao e soja em Rondonopolis. Revenda Nutrien aplicou CET muito acima do contratado. Proposta sendo elaborada com base em pericia de encargos.',
    criadoEm: '2026-01-20T10:45:00Z',
    atualizadoEm: '2026-04-09T08:15:00Z',
  },
];

// ---------------------------------------------------------------------------
// mockCotacoes
// ---------------------------------------------------------------------------

export const mockCotacoes: Cotacao[] = [
  {
    id: 'cot_soja',
    commodity: 'Soja',
    unidade: 'R$/sc 60kg',
    precoAtual: 128.5,
    variacao: -1.56,
    variacaoPercent: -1.2,
    atualizadoEm: '2026-04-16T14:30:00Z',
    historico: gerarHistorico(128.5, 2.8),
  },
  {
    id: 'cot_milho',
    commodity: 'Milho',
    unidade: 'R$/sc 60kg',
    precoAtual: 58.2,
    variacao: 1.45,
    variacaoPercent: 2.5,
    atualizadoEm: '2026-04-16T14:30:00Z',
    historico: gerarHistorico(58.2, 3.2),
  },
  {
    id: 'cot_boi',
    commodity: 'Boi Gordo',
    unidade: 'R$/@',
    precoAtual: 295.0,
    variacao: 2.36,
    variacaoPercent: 0.8,
    atualizadoEm: '2026-04-16T14:30:00Z',
    historico: gerarHistorico(295.0, 1.8),
  },
  {
    id: 'cot_cafe',
    commodity: 'Cafe Arabica',
    unidade: 'R$/sc 60kg',
    precoAtual: 1420.0,
    variacao: -8.52,
    variacaoPercent: -0.6,
    atualizadoEm: '2026-04-16T14:30:00Z',
    historico: gerarHistorico(1420.0, 2.0),
  },
  {
    id: 'cot_algodao',
    commodity: 'Algodao',
    unidade: 'R$/@',
    precoAtual: 125.3,
    variacao: 1.88,
    variacaoPercent: 1.5,
    atualizadoEm: '2026-04-16T14:30:00Z',
    historico: gerarHistorico(125.3, 2.5),
  },
];

// ---------------------------------------------------------------------------
// mockIndicadores
// ---------------------------------------------------------------------------

export const mockIndicadores: Indicador[] = [
  {
    id: 'ind_selic',
    nome: 'Taxa Selic',
    sigla: 'SELIC',
    valor: 14.75,
    unidade: '% a.a.',
    variacaoMensal: 0.0,
    atualizadoEm: '2026-04-16T00:00:00Z',
  },
  {
    id: 'ind_ipca',
    nome: 'IPCA',
    sigla: 'IPCA',
    valor: 4.82,
    unidade: '% acumulado 12m',
    variacaoMensal: 0.38,
    atualizadoEm: '2026-04-16T00:00:00Z',
  },
  {
    id: 'ind_igpm',
    nome: 'IGP-M',
    sigla: 'IGP-M',
    valor: 3.15,
    unidade: '% acumulado 12m',
    variacaoMensal: 0.22,
    atualizadoEm: '2026-04-16T00:00:00Z',
  },
  {
    id: 'ind_dolar',
    nome: 'Dolar PTAX',
    sigla: 'USD/BRL',
    valor: 5.78,
    unidade: 'R$',
    variacaoMensal: -0.12,
    atualizadoEm: '2026-04-16T14:00:00Z',
  },
  {
    id: 'ind_cdi',
    nome: 'CDI',
    sigla: 'CDI',
    valor: 14.65,
    unidade: '% a.a.',
    variacaoMensal: 0.0,
    atualizadoEm: '2026-04-16T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// mockKPIs
// ---------------------------------------------------------------------------

export const mockKPIs: KPIs = {
  totalClientes: 47,
  clientesAtivos: 23,
  propostasGeradas: 38,
  propostasAceitas: 29,
  volumeNegociado: 18500000,
  volumeEconomizado: 4200000,
  ticketMedio: 638000,
  taxaConversao: 76.3,
};

// ---------------------------------------------------------------------------
// mockNotificacoes
// ---------------------------------------------------------------------------

export const mockNotificacoes: Notificacao[] = [
  {
    id: 'not_001',
    tipo: 'proposta_visualizada',
    titulo: 'Proposta visualizada',
    mensagem:
      'Paulo Luciano de Oliveira visualizou a proposta de acordo enviada em 12/04.',
    lida: false,
    clienteId: 'cli_002',
    criadaEm: '2026-04-16T10:15:00Z',
  },
  {
    id: 'not_002',
    tipo: 'alerta_mercado',
    titulo: 'Queda na soja',
    mensagem:
      'Soja recuou 1,2% hoje (R$128,50/sc). Pode impactar capacidade de pagamento de clientes expostos.',
    lida: false,
    clienteId: null,
    criadaEm: '2026-04-16T09:30:00Z',
  },
  {
    id: 'not_003',
    tipo: 'novo_lead',
    titulo: 'Novo lead recebido',
    mensagem:
      'Fernando Henrique Takahashi de Cascavel/PR foi indicado como novo lead. Divida de R$52 mil com revenda.',
    lida: false,
    clienteId: 'cli_008',
    criadaEm: '2026-04-14T09:05:00Z',
  },
  {
    id: 'not_004',
    tipo: 'proposta_aceita',
    titulo: 'Proposta aceita!',
    mensagem:
      'Jose Carlos Ribeiro aceitou a proposta de renegociacao com Banco do Brasil. Acordo formalizado.',
    lida: true,
    clienteId: 'cli_004',
    criadaEm: '2026-04-08T14:20:00Z',
  },
  {
    id: 'not_005',
    tipo: 'pagamento_confirmado',
    titulo: 'Pagamento confirmado',
    mensagem:
      'Ana Paula Mendes Brito efetuou pagamento da parcela 8/24 — R$45.000,00. Em dia.',
    lida: true,
    clienteId: 'cli_006',
    criadaEm: '2026-04-05T16:45:00Z',
  },
  {
    id: 'not_006',
    tipo: 'documento_pendente',
    titulo: 'Documento pendente',
    mensagem:
      'Ailton Caeiro da Silva precisa enviar extrato bancario atualizado para dar prosseguimento a negociacao.',
    lida: false,
    clienteId: 'cli_001',
    criadaEm: '2026-04-15T11:00:00Z',
  },
  {
    id: 'not_007',
    tipo: 'prazo_vencendo',
    titulo: 'Prazo de proposta vencendo',
    mensagem:
      'A proposta enviada a Marcos Vinicius Pereira vence em 3 dias (19/04). Considere entrar em contato.',
    lida: false,
    clienteId: 'cli_010',
    criadaEm: '2026-04-16T08:00:00Z',
  },
  {
    id: 'not_008',
    tipo: 'mensagem',
    titulo: 'Mensagem de Luciana Campos',
    mensagem:
      'Luciana Ferreira Campos enviou uma mensagem: "Banco do Brasil ligou pedindo documentacao adicional. Podem me orientar?"',
    lida: false,
    clienteId: 'cli_009',
    criadaEm: '2026-04-15T17:30:00Z',
  },
];

// ---------------------------------------------------------------------------
// mockEventos — Timeline for Ailton Caeiro da Silva (cli_001)
// ---------------------------------------------------------------------------

export const mockEventos: Evento[] = [
  {
    id: 'evt_001',
    clienteId: 'cli_001',
    tipo: 'contato_inicial',
    titulo: 'Primeiro contato',
    descricao:
      'Ailton entrou em contato via indicacao de outro produtor de Toledo. Relata divida crescente com Sicoob.',
    usuario: 'Christian Kohler',
    data: '2025-04-10T08:30:00Z',
  },
  {
    id: 'evt_002',
    clienteId: 'cli_001',
    tipo: 'documentacao',
    titulo: 'Documentacao recebida',
    descricao:
      'Recebidos: contratos de credito rural (custeio e investimento), escritura matricula 45434, extratos Sicoob.',
    usuario: 'Christian Kohler',
    data: '2025-04-18T14:00:00Z',
  },
  {
    id: 'evt_003',
    clienteId: 'cli_001',
    tipo: 'analise',
    titulo: 'Analise de contratos iniciada',
    descricao:
      'Identificados dois contratos de credito rural com Sicoob: custeio (R$1,2M) e investimento (R$948.495,32). Taxa nominal de 2% a.m.',
    usuario: 'Christian Kohler',
    data: '2025-05-02T10:00:00Z',
  },
  {
    id: 'evt_004',
    clienteId: 'cli_001',
    tipo: 'pericia',
    titulo: 'Calculo pericial concluido',
    descricao:
      'CET apurado de 30,46% a.a. Produtor ja pagou R$2.215.482,03 sobre divida original de R$2.148.495,32. Excesso de cobranca identificado.',
    usuario: 'Christian Kohler',
    data: '2025-06-15T16:30:00Z',
  },
  {
    id: 'evt_005',
    clienteId: 'cli_001',
    tipo: 'proposta',
    titulo: 'Proposta de renegociacao elaborada',
    descricao:
      'Proposta: reducao dos encargos acumulados e recomposicao do saldo devedor considerando pagamentos ja efetuados. Meta de desconto de 35% sobre juros.',
    usuario: 'Christian Kohler',
    data: '2025-07-20T11:00:00Z',
  },
  {
    id: 'evt_006',
    clienteId: 'cli_001',
    tipo: 'envio',
    titulo: 'Proposta enviada ao Sicoob',
    descricao:
      'Proposta formal encaminhada ao departamento juridico do Sicoob Toledo via protocolo oficial.',
    usuario: 'Christian Kohler',
    data: '2025-07-28T09:15:00Z',
  },
  {
    id: 'evt_007',
    clienteId: 'cli_001',
    tipo: 'resposta_credor',
    titulo: 'Resposta do Sicoob',
    descricao:
      'Sicoob respondeu solicitando documentacao complementar: declaracao de bens e ultimo ITR. Demonstrou abertura para negociacao.',
    usuario: 'Christian Kohler',
    data: '2025-08-15T14:45:00Z',
  },
  {
    id: 'evt_008',
    clienteId: 'cli_001',
    tipo: 'documentacao',
    titulo: 'Documentacao complementar enviada',
    descricao:
      'Enviados ao Sicoob: declaracao de bens atualizada, ITR 2024, e CCIR da matricula 45434 (10,0182 ha).',
    usuario: 'Christian Kohler',
    data: '2025-08-22T10:30:00Z',
  },
  {
    id: 'evt_009',
    clienteId: 'cli_001',
    tipo: 'negociacao',
    titulo: 'Reuniao de negociacao',
    descricao:
      'Reuniao presencial na agencia Sicoob Toledo. Credor acenou com possibilidade de desconto de 25% sobre juros acumulados. Contraproposta em analise.',
    usuario: 'Christian Kohler',
    data: '2025-10-05T15:00:00Z',
  },
  {
    id: 'evt_010',
    clienteId: 'cli_001',
    tipo: 'negociacao',
    titulo: 'Contraproposta recebida',
    descricao:
      'Sicoob ofereceu desconto de 20% sobre encargos, parcelamento em 36x. ALETIS avaliando e preparando nova rodada de negociacao.',
    usuario: 'Christian Kohler',
    data: '2025-11-12T11:20:00Z',
  },
  {
    id: 'evt_011',
    clienteId: 'cli_001',
    tipo: 'negociacao',
    titulo: 'Nova rodada de negociacao',
    descricao:
      'Apresentados calculos periciais detalhados demonstrando cobranca acima do pactuado. Sicoob elevou desconto para 28%.',
    usuario: 'Christian Kohler',
    data: '2026-01-20T14:00:00Z',
  },
  {
    id: 'evt_012',
    clienteId: 'cli_001',
    tipo: 'alerta',
    titulo: 'Documento pendente',
    descricao:
      'Solicitado extrato bancario atualizado (ultimos 3 meses) para comprovar capacidade de pagamento na proxima rodada.',
    usuario: 'Christian Kohler',
    data: '2026-04-15T11:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// mockPropostas
// ---------------------------------------------------------------------------

export const mockPropostas: Proposta[] = [
  {
    id: 'prop_001',
    clienteId: 'cli_001',
    clienteNome: 'Ailton Caeiro da Silva',
    credor: 'Sicoob',
    dividaOriginal: 2148495.32,
    valorProposta: 1547000.0,
    desconto: 28.0,
    parcelas: 36,
    taxaJuros: '1.2% a.m.',
    status: 'em_analise',
    validadeAte: '2026-05-15',
    criadaEm: '2026-01-20T14:00:00Z',
    atualizadaEm: '2026-04-14T16:45:00Z',
    observacoes:
      'Proposta com 28% de desconto sobre encargos. Parcelamento em 36x. Aguardando resposta final do Sicoob.',
  },
  {
    id: 'prop_002',
    clienteId: 'cli_002',
    clienteNome: 'Paulo Luciano de Oliveira',
    credor: 'Fertiflora / Herbioeste',
    dividaOriginal: 277380.0,
    valorProposta: 180000.0,
    desconto: 35.1,
    parcelas: 12,
    taxaJuros: '0.8% a.m.',
    status: 'visualizada',
    validadeAte: '2026-05-12',
    criadaEm: '2026-04-05T09:00:00Z',
    atualizadaEm: '2026-04-16T10:15:00Z',
    observacoes:
      'CET praticado de 48,58% a.a. muito acima do 1% a.m. contratado. Proposta baseada em recalculo com taxa justa.',
  },
  {
    id: 'prop_003',
    clienteId: 'cli_004',
    clienteNome: 'Jose Carlos Ribeiro',
    credor: 'Banco do Brasil',
    dividaOriginal: 4850000.0,
    valorProposta: 4122500.0,
    desconto: 15.0,
    parcelas: 48,
    taxaJuros: '0.9% a.m.',
    status: 'aceita',
    validadeAte: '2026-04-30',
    criadaEm: '2026-03-01T11:00:00Z',
    atualizadaEm: '2026-04-08T14:20:00Z',
    observacoes:
      'Acordo fechado. 15% desconto sobre encargos, parcelamento em 48x. Produtor satisfeito.',
  },
  {
    id: 'prop_004',
    clienteId: 'cli_010',
    clienteNome: 'Marcos Vinicius Pereira',
    credor: 'Revenda Nutrien',
    dividaOriginal: 185000.0,
    valorProposta: 125000.0,
    desconto: 32.4,
    parcelas: 6,
    taxaJuros: '0.5% a.m.',
    status: 'enviada',
    validadeAte: '2026-04-19',
    criadaEm: '2026-04-02T15:30:00Z',
    atualizadaEm: '2026-04-02T15:30:00Z',
    observacoes:
      'Proposta com desconto agressivo baseado em CET abusivo de 38,40% a.a. vs 1,8% a.m. contratado. Vence em 19/04.',
  },
  {
    id: 'prop_005',
    clienteId: 'cli_009',
    clienteNome: 'Luciana Ferreira Campos',
    credor: 'Banco do Brasil',
    dividaOriginal: 2100000.0,
    valorProposta: 1680000.0,
    desconto: 20.0,
    parcelas: 36,
    taxaJuros: '1.0% a.m.',
    status: 'em_analise',
    validadeAte: '2026-05-01',
    criadaEm: '2026-03-15T10:00:00Z',
    atualizadaEm: '2026-04-13T12:30:00Z',
    observacoes:
      'Proposta para divida do BB. CEF sendo negociada separadamente. BB mais receptivo a acordo.',
  },
  {
    id: 'prop_006',
    clienteId: 'cli_007',
    clienteNome: 'Roberto Alves da Cruz',
    credor: 'Sicoob / Revenda AgroMax',
    dividaOriginal: 2780000.0,
    valorProposta: 2168400.0,
    desconto: 22.0,
    parcelas: 24,
    taxaJuros: '1.0% a.m.',
    status: 'aceita',
    validadeAte: '2025-12-31',
    criadaEm: '2025-09-10T08:00:00Z',
    atualizadaEm: '2025-11-20T16:00:00Z',
    observacoes:
      'Acordo concluido com 22% de desconto total. Ambos credores aceitaram. Caso encerrado com sucesso.',
  },
  {
    id: 'prop_007',
    clienteId: 'cli_003',
    clienteNome: 'Maria Aparecida Ferreira dos Santos',
    credor: 'Sicredi',
    dividaOriginal: 890000.0,
    valorProposta: 0.0,
    desconto: 0.0,
    parcelas: 0,
    taxaJuros: '',
    status: 'rascunho',
    validadeAte: '',
    criadaEm: '2026-04-10T14:30:00Z',
    atualizadaEm: '2026-04-10T14:30:00Z',
    observacoes:
      'Em fase de analise. Rascunho da proposta sera elaborado apos conclusao do calculo pericial.',
  },
];

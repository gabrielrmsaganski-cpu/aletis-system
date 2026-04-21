/**
 * Tipos do módulo Financeiro do negócio ALETIS.
 *
 * Não confundir com `apps/api/src/lib/financeiro.ts` (motor de cálculo
 * financeiro para clientes agrícolas — dívidas, CET, amortização).
 * Este módulo trata do financeiro **interno** da consultoria:
 * receitas de honorários, despesas operacionais, impostos, extratos
 * bancários e pacote mensal para o contador.
 */

export type TipoRegime = 'simples_nacional' | 'lucro_presumido' | 'mei'

export type StatusReceita = 'emitida' | 'recebida' | 'atrasada' | 'cancelada'

export type FormaPagamentoReceita = 'pix' | 'ted' | 'boleto' | 'dinheiro' | 'cartao' | 'outro'

export type CategoriaDespesa =
  | 'aluguel'
  | 'contabilidade'
  | 'software_saas'
  | 'internet_telefone'
  | 'energia_agua'
  | 'viagens_deslocamento'
  | 'combustivel'
  | 'alimentacao'
  | 'marketing'
  | 'material_escritorio'
  | 'servicos_terceiros'
  | 'pro_labore'
  | 'salarios_encargos'
  | 'impostos_taxas'
  | 'juridico'
  | 'educacao_treinamento'
  | 'equipamentos'
  | 'manutencao'
  | 'bancarias'
  | 'outros'

export const CATEGORIAS_DESPESA: Array<{ id: CategoriaDespesa; nome: string; dedutivel: boolean }> = [
  { id: 'aluguel', nome: 'Aluguel', dedutivel: true },
  { id: 'contabilidade', nome: 'Contabilidade', dedutivel: true },
  { id: 'software_saas', nome: 'Software & SaaS', dedutivel: true },
  { id: 'internet_telefone', nome: 'Internet & Telefonia', dedutivel: true },
  { id: 'energia_agua', nome: 'Energia & Água', dedutivel: true },
  { id: 'viagens_deslocamento', nome: 'Viagens & Deslocamento', dedutivel: true },
  { id: 'combustivel', nome: 'Combustível', dedutivel: true },
  { id: 'alimentacao', nome: 'Alimentação', dedutivel: true },
  { id: 'marketing', nome: 'Marketing & Publicidade', dedutivel: true },
  { id: 'material_escritorio', nome: 'Material de Escritório', dedutivel: true },
  { id: 'servicos_terceiros', nome: 'Serviços de Terceiros', dedutivel: true },
  { id: 'pro_labore', nome: 'Pró-labore', dedutivel: false },
  { id: 'salarios_encargos', nome: 'Salários & Encargos', dedutivel: true },
  { id: 'impostos_taxas', nome: 'Impostos & Taxas', dedutivel: false },
  { id: 'juridico', nome: 'Jurídico', dedutivel: true },
  { id: 'educacao_treinamento', nome: 'Educação & Treinamento', dedutivel: true },
  { id: 'equipamentos', nome: 'Equipamentos', dedutivel: true },
  { id: 'manutencao', nome: 'Manutenção', dedutivel: true },
  { id: 'bancarias', nome: 'Taxas Bancárias', dedutivel: true },
  { id: 'outros', nome: 'Outros', dedutivel: false },
]

export type StatusDespesa = 'pendente' | 'paga' | 'atrasada' | 'cancelada'

export interface Anexo {
  id: string
  nomeOriginal: string
  nomeArmazenado: string // path relativo dentro de storage/financeiro
  tipo: 'pdf' | 'xml' | 'jpg' | 'png' | 'ofx' | 'outro'
  tamanho: number
  uploadEm: string
}

/** Receita — honorário de consultoria recebido (ou a receber). */
export interface Receita {
  id: string
  competencia: string // YYYY-MM (mês de competência fiscal)
  descricao: string
  cliente?: {
    nome: string
    cpfCnpj?: string
  }
  valorBruto: number
  retencoes?: {
    iss?: number
    ir?: number
    inss?: number
    csll?: number
    pis?: number
    cofins?: number
  }
  valorLiquido: number // após retenções
  nfse?: {
    numero: string
    serie?: string
    municipio?: string
    dataEmissao: string // ISO
    codigoVerificacao?: string
    discriminacao?: string
  }
  dataEmissao: string // ISO
  dataPrevisaoRecebimento?: string // ISO
  dataRecebimento?: string // ISO — null se ainda não recebeu
  formaPagamento?: FormaPagamentoReceita
  status: StatusReceita
  contaBancariaDestino?: string
  propostaId?: string // vínculo com CRM/Propostas
  anexos: Anexo[]
  observacoes?: string
  criadoEm: string
  atualizadoEm: string
}

/** Despesa operacional do negócio. */
export interface Despesa {
  id: string
  competencia: string // YYYY-MM
  descricao: string
  fornecedor?: {
    nome: string
    cpfCnpj?: string
  }
  /**
   * Vínculo opcional com um cliente específico — habilita cálculo de margem
   * por caso/cliente. Quando preenchido, esta despesa é atribuída ao cliente
   * (ex.: viagem a SP para reunião do cliente X, honorário de perito no caso Y).
   * Sem vínculo = despesa estrutural (aluguel, contabilidade, etc).
   */
  clienteVinculo?: {
    nome: string
    cpfCnpj?: string
    casoId?: string // vínculo opcional com caso específico
    propostaId?: string // vínculo opcional com proposta específica
  }
  categoria: CategoriaDespesa
  valor: number
  dataEmissao: string // ISO
  dataVencimento: string // ISO
  dataPagamento?: string // ISO
  status: StatusDespesa
  formaPagamento?: FormaPagamentoReceita
  contaBancariaOrigem?: string
  recorrente?: {
    frequencia: 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'
    diaVencimento: number
    ativo: boolean
  }
  nf?: {
    numero: string
    chaveAcesso?: string
    emitente?: string
  }
  anexos: Anexo[]
  observacoes?: string
  criadoEm: string
  atualizadoEm: string
}

/** Imposto a pagar (DAS, INSS, ISS, DARF). */
export interface Imposto {
  id: string
  competencia: string // YYYY-MM
  tipo: 'das_simples' | 'inss_pro_labore' | 'iss' | 'irpj' | 'csll' | 'pis' | 'cofins' | 'outro'
  descricao: string
  baseCalculo?: number
  aliquota?: number
  valor: number
  dataVencimento: string
  dataPagamento?: string
  status: 'a_pagar' | 'pago' | 'atrasado'
  codigoBarras?: string
  anexos: Anexo[]
  memoriaCalculo?: string // narrativa explicando o cálculo
  criadoEm: string
  atualizadoEm: string
}

/** Lançamento bancário (extrato). */
export interface LancamentoBancario {
  id: string
  contaId: string
  data: string // ISO
  descricao: string
  valor: number // positivo = crédito, negativo = débito
  tipo: 'credito' | 'debito'
  categoria?: CategoriaDespesa | 'receita' | 'transferencia' | 'nao_classificado'
  vinculadoA?: {
    tipo: 'receita' | 'despesa' | 'imposto'
    id: string
  }
  fitid?: string // ID único do OFX
  origem: 'ofx' | 'manual' | 'pdf'
  criadoEm: string
}

export interface ContaBancaria {
  id: string
  nome: string // "Itaú Empresa CC"
  banco: string
  agencia?: string
  conta?: string
  tipo: 'corrente' | 'poupanca' | 'aplicacao'
  saldoInicial: number
  ativa: boolean
  criadoEm: string
}

export interface Contador {
  nome: string
  escritorio?: string
  email: string
  telefone?: string
  crcRegional?: string
}

export interface ConfiguracaoFinanceiro {
  empresa: {
    razaoSocial: string
    nomeFantasia?: string
    cnpj: string
    inscricaoMunicipal?: string
    inscricaoEstadual?: string
    endereco?: string
    cidade?: string
    uf?: string
    cep?: string
  }
  regime: TipoRegime
  anexoSimples: 'I' | 'II' | 'III' | 'IV' | 'V' // Anexo III = consultoria
  contador: Contador
  aliquotas: {
    iss: number // % municipal típico 2-5%
    irRetencaoFonte?: number // IR retido na fonte por tomador (padrão 1.5% se >R$666)
  }
  contasBancarias: ContaBancaria[]
  criadoEm: string
  atualizadoEm: string
}

/** DRE mensal calculado. */
export interface DREMensal {
  competencia: string // YYYY-MM
  receitaBruta: number
  retencoes: number
  receitaLiquida: number
  despesasPorCategoria: Record<CategoriaDespesa, number>
  totalDespesas: number
  despesasDedutiveis: number
  despesasNaoDedutiveis: number
  resultadoOperacional: number // receita líquida - despesas dedutíveis
  impostosApurados: number
  resultadoLiquido: number
  margemLiquida: number // %
  contagens: {
    receitas: number
    despesas: number
    impostos: number
    extratos: number
  }
}

/** Snapshot consolidado do ano fiscal. */
export interface DREAnual {
  ano: number
  meses: DREMensal[]
  totais: {
    receitaBruta: number
    receitaLiquida: number
    totalDespesas: number
    resultadoLiquido: number
    impostosPagos: number
    das: number
    inss: number
    iss: number
    outros: number
  }
  rbt12: number // Receita Bruta nos últimos 12 meses (base da alíquota Simples)
  aliquotaSimplesEfetiva: number // %
}

/** Cálculo do DAS do Simples Nacional (Anexo III). */
export interface CalculoDAS {
  competencia: string // YYYY-MM
  receitaBrutaMes: number
  rbt12: number // Receita Bruta últimos 12 meses
  faixa: number // 1..6
  aliquotaNominal: number // % nominal da tabela
  valorDeduzir: number // valor da tabela para abater
  aliquotaEfetiva: number // ((RBT12 * alíquota) - PD) / RBT12
  valorDAS: number
  vencimento: string // dia 20 do mês seguinte
  detalhamentoPartilha: {
    irpj: number
    csll: number
    cofins: number
    pis: number
    cpp: number
    iss: number
  }
  memoriaCalculo: string
}

/**
 * Margem consolidada por cliente — receita atribuída menos despesas vinculadas.
 * Despesas sem `clienteVinculo` NÃO entram aqui (são estruturais) — o rateio
 * estrutural fica a cargo do DRE geral. A chave é `cpfCnpj` quando disponível,
 * senão o nome normalizado (upper + trim).
 */
export interface MargemCliente {
  /** Identificador único do cliente (cpfCnpj limpo ou nome normalizado). */
  clienteKey: string
  nome: string
  cpfCnpj?: string
  receitaBruta: number
  receitaLiquida: number // após retenções
  despesasAtribuidas: number // só despesas com clienteVinculo
  margem: number // receitaLiquida - despesasAtribuidas
  margemPct: number // (margem / receitaBruta) * 100 — 0 se receita = 0
  numReceitas: number
  numDespesas: number
  /** Última receita/despesa do cliente — útil para ordenar recência. */
  ultimaAtividade?: string // ISO
  /**
   * Classificação do cliente em função da margem percentual:
   *  ouro (>=50%) · prata (30-49%) · bronze (10-29%) · prejuizo (<10% ou negativo)
   */
  classificacao: 'ouro' | 'prata' | 'bronze' | 'prejuizo'
}

/**
 * Projeção de caixa dos próximos N dias — baseada em recebíveis e pagáveis
 * agendados. Serve de "farol" para decisões de investimento/contratação.
 *
 * Saldo inicial = soma dos saldos iniciais + net dos lançamentos bancários já
 * registrados. Cada bucket é uma semana (ISO, segunda a domingo) ou o restante
 * quando a janela não fecha em semana completa.
 */
export interface ProjecaoCaixa {
  /** Horizonte em dias (default 90). */
  diasHorizonte: number
  saldoInicial: number
  /** Buckets por semana. */
  semanas: Array<{
    inicio: string // YYYY-MM-DD
    fim: string
    entradas: number // soma dos recebíveis previstos na semana
    saidas: number // soma das despesas + impostos vencendo
    resultado: number
    saldoFinal: number
    /** Flag: saldo ficará negativo nessa semana — alerta de caixa. */
    alertaNegativo: boolean
  }>
  /** Agregados de todo o horizonte. */
  totais: {
    entradas: number
    saidas: number
    resultado: number
    saldoFinalProjetado: number
  }
  /** Se qualquer semana tem saldo negativo, apontamos a primeira para UI. */
  primeiroGap?: { semanaInicio: string; deficit: number }
  geradoEm: string
}

export interface DashboardFinanceiro {
  mesAtual: string // YYYY-MM
  dreAtual: DREMensal
  faturamento12m: number
  rbt12: number
  dasProximo?: CalculoDAS
  /** Top clientes pelo lucro bruto (receita - despesas vinculadas). */
  margensPorCliente: MargemCliente[]
  /** Projeção de caixa dos próximos 90 dias. */
  projecaoCaixa90d: ProjecaoCaixa
  contasReceber: {
    total: number
    atrasadas: number
    proximosVencimentos: Array<{ id: string; cliente: string; valor: number; vencimento: string; diasAtraso: number }>
    /** Distribuição de recebíveis em aberto por faixa de atraso (bucket analysis). */
    aging: {
      emDia: { count: number; total: number }         // ainda não venceu (ou sem data de previsão)
      atraso_1_30: { count: number; total: number }   // 1-30 dias de atraso
      atraso_31_60: { count: number; total: number }  // 31-60 dias
      atraso_61_90: { count: number; total: number }  // 61-90 dias
      atraso_90plus: { count: number; total: number } // 90+ dias — risco crítico
      /** Índice saúde (0-100): 100 = tudo em dia; cai proporcional ao atraso ponderado. */
      indiceSaude: number
      /** DSO aproximado (Days Sales Outstanding): prazo médio de recebimento ponderado por valor. */
      dso: number
    }
  }
  contasPagar: {
    total: number
    atrasadas: number
    proximosVencimentos: Array<{ id: string; descricao: string; valor: number; vencimento: string; diasAtraso: number }>
  }
  fluxoCaixa12m: Array<{
    mes: string
    receita: number
    despesa: number
    resultado: number
    acumulado: number
  }>
  topCategoriasDespesa: Array<{ categoria: CategoriaDespesa; nome: string; valor: number; pct: number }>
  topClientes: Array<{ cliente: string; valor: number; pct: number }>
  alertas: Array<{
    tipo: 'vencimento' | 'inadimplencia' | 'pendencia' | 'limite_simples' | 'dre_negativo'
    severidade: 'info' | 'atencao' | 'critico'
    titulo: string
    detalhe: string
    link?: string
  }>
}

export interface ChecklistFechamento {
  competencia: string
  itens: Array<{
    titulo: string
    ok: boolean
    detalhe: string
  }>
  pronto: boolean
}

/**
 * Sugestão de reconciliação de um lançamento bancário OFX com um lançamento
 * manual (receita, despesa ou imposto). Vem do motor de matching por valor
 * e proximidade de data.
 */
export interface SugestaoReconciliacao {
  lancamentoId: string
  lancamento: {
    id: string
    data: string
    descricao: string
    valor: number
    tipo: 'credito' | 'debito'
  }
  candidatos: Array<{
    /** Tipo da entidade candidata ao match. */
    entidadeTipo: 'receita' | 'despesa' | 'imposto'
    entidadeId: string
    entidadeDescricao: string
    entidadeValor: number
    entidadeData: string
    /** 0-100 — quão forte é a correspondência. */
    score: number
    /** Quebra do score para transparência na UI. */
    criterios: {
      valorExato: boolean
      diffDias: number
      keywordMatch: boolean
      mesmaCompetencia: boolean
    }
    motivo: string
  }>
}

/**
 * Resultado da materialização mensal de despesas recorrentes. Cria a próxima
 * ocorrência quando não existe despesa equivalente (mesmo fornecedor/descrição)
 * na competência-alvo. Idempotente — chamar múltiplas vezes é seguro.
 */
export interface ResultadoMaterializacao {
  competencia: string
  criadas: string[] // ids das despesas criadas
  puladas: number // recorrências já presentes na competência
  inativas: number // recorrências desligadas
  executadoEm: string
}

export interface PacoteFechamento {
  competencia: string
  geradoEm: string
  dre: DREMensal
  das?: CalculoDAS
  contadores: {
    totalReceitas: number
    totalDespesas: number
    totalImpostos: number
    totalAnexos: number
  }
  checklist: ChecklistFechamento
  caminhoZip: string
  caminhoPdf: string
}

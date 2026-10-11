import type { BancoDossieId } from './manifest.js'

export interface ClienteDossieInput {
  id?: string
  nome?: string
  cpfCnpj?: string
  tipo?: 'pessoa_fisica' | 'pessoa_juridica'
  cidade?: string
  uf?: string
  endereco?: string
  cep?: string
  email?: string
  telefone?: string
  responsavel?: string
  atividade?: string
  observacoes?: string
}

export interface OperacaoDossieInput {
  cultura?: string
  limiteSolicitado?: number
  prazo?: string
  finalidade?: string
  garantias?: string
  comentarios?: string
}

export interface AtividadeDossieInput {
  tipo?: string
  receitaEstimada?: number
}

export interface MembroGrupoDossieInput {
  nome?: string
  cpfCnpj?: string
  idade?: number
  restricoes?: string
  bacenTotal?: number
  curtoPrazo?: number
  longoPrazo?: number
  coobrigacoes?: number
  moedaEstrangeira?: number
  participacaoPct?: number
  parentesco?: string
  telefone?: string
  email?: string
  atuaAtividade?: boolean
}

export interface EmpresaGrupoDossieInput {
  razaoSocial?: string
  cnpj?: string
  atividade?: string
  faturamentoAnual?: number
  restricoes?: string
  bacenTotal?: number
  curtoPrazo?: number
  longoPrazo?: number
  coobrigacoes?: number
  moedaEstrangeira?: number
}

export interface PropriedadeDossieInput {
  fazenda?: string
  proprietario?: string
  car?: string
  matricula?: string
  municipio?: string
  uf?: string
  areaTotalHa?: number
  areaConsolidadaHa?: number
  areaPlantioHa?: number
  areaIrrigadaHa?: number
  areaPastagemHa?: number
  reservaLegalHa?: number
  areaPossivelAbertaHa?: number
  avaliacao?: number
  onus?: string
  livreOnus?: boolean
  capacidadeProdutiva?: string
}

export interface ArrendamentoDossieInput {
  fazenda?: string
  proprietario?: string
  car?: string
  matricula?: string
  municipio?: string
  uf?: string
  areaTotalHa?: number
  areaArrendadaHa?: number
  custoMensal?: number
  custoScHa?: number
  unidadePagamento?: string
  inicio?: string
  vencimento?: string
}

export interface MaquinaDossieInput {
  tipo?: string
  descricao?: string
  marca?: string
  ano?: number
  valor?: number
  onus?: string
}

export interface CompradorDossieInput {
  nome?: string
  safra?: string
  cultura?: string
  volume?: number
  precoUnitario?: number
  estoque?: number
  percentualVendidoPlantio?: number
  precoRegime?: string
  percentualSpot?: number
  entrega?: string
  hedgeCambial?: string
}

export interface DividaDossieInput {
  tomador?: string
  documento?: string
  instituicao?: string
  contrato?: string
  tipoCredito?: string
  contratacao?: string
  vencimento?: string
  finalidade?: string
  moeda?: string
  taxaJuros?: number
  saldoDevedor?: number
  amortizacoes?: Partial<Record<'2021' | '2022' | '2023' | '2024' | '2025' | '2026' | '2027' | 'apos2027', number>>
}

export interface DividaTerraDossieInput {
  descricao?: string
  areaTotalHa?: number
  valorTotal?: number
  vencimentoFinal?: string
  formaPagamento?: string
}

export interface FornecedorDossieInput {
  nome?: string
  tipoProduto?: string
  prazoPagamento?: string
  valor?: number
  volumeSoja?: number
  volumeMilho?: number
  vencimento?: string
  observacoes?: string
}

export type PeriodoSafra = 'anterior' | 'atual' | 'planejada'

export interface ProducaoDossieInput {
  cultura?: string
  periodo?: PeriodoSafra
  safra?: string
  regiao?: string
  sistema?: string
  areaPropriaHa?: number
  areaArrendadaHa?: number
  produtividade?: number
  precoUnitario?: number
  custoHa?: number
  custoArrendamento?: number
  percentualFixado?: number
  percentualPlantio?: number
  percentualColheita?: number
  observacoes?: string
}

export interface PecuariaDossieInput {
  periodo?: PeriodoSafra
  tipoAnimal?: string
  ciclo?: string
  sistemaCriacao?: string
  regiao?: string
  quantidadeTotal?: number
  quantidadeComercializada?: number
  pesoArrobas?: number
  precoArroba?: number
  custeioAnimalAno?: number
  custoReposicao?: number
  custoArrendamento?: number
  areaHa?: number
  observacoes?: string
}

export interface InvestimentoDossieInput {
  descricao?: string
  dataPrevista?: string
  areaTotalHa?: number
  unidadePagamento?: string
  valorTotal?: number
  fundingProprio?: number
  fundingTerceiro?: number
  prazo?: string
  payback?: number
  amortizacoes?: number[]
}

export interface AdministradorDossieInput {
  nome?: string
  responsabilidade?: string
  experiencia?: string
}

export interface AtivoOutroDossieInput {
  tipo?: string
  descricao?: string
  fonte?: string
  quantidade?: number
  valor?: number
  observacoes?: string
}

export interface DadosCanonicosDossieInput {
  dataBase?: string
  historico?: string
  infraestrutura?: string
  operacao?: OperacaoDossieInput
  atividades?: AtividadeDossieInput[]
  administradores?: AdministradorDossieInput[]
  grupoEconomico?: MembroGrupoDossieInput[]
  empresas?: EmpresaGrupoDossieInput[]
  propriedades?: PropriedadeDossieInput[]
  arrendamentos?: ArrendamentoDossieInput[]
  maquinas?: MaquinaDossieInput[]
  ativosOutros?: AtivoOutroDossieInput[]
  compradores?: CompradorDossieInput[]
  dividas?: DividaDossieInput[]
  dividasTerras?: DividaTerraDossieInput[]
  fornecedores?: FornecedorDossieInput[]
  producoes?: ProducaoDossieInput[]
  pecuaria?: PecuariaDossieInput[]
  investimentos?: InvestimentoDossieInput[]
}

export interface GerarPacoteDossieInput {
  banco: BancoDossieId
  clienteId?: string
  perfilId?: string
  cliente?: ClienteDossieInput
  dados?: DadosCanonicosDossieInput
  incluirOriginais?: boolean
  incluirInteligencia?: boolean
  gerarModelosPreenchidos?: boolean
}

export interface ArquivoBancarioGerado {
  modeloId: string
  filename: string
  buffer: Buffer
  contentType: string
  celulasGravadas: number
  celulasHigienizadas: number
  formulasAjustadas: number
  observacoes: string[]
}

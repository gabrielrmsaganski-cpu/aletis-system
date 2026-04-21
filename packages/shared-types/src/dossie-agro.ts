// ============================================================
// ALETIS — Dossiê Agro Canônico
// Baseado no padrão de mercado "Cadastro Agro Daycoval 2025"
// ============================================================
//
// Este schema materializa, por-cliente, o dossiê completo que
// bancos agro usam para análise de produtores rurais (grupo
// econômico, produção por cultura/UF, imóveis, máquinas,
// dívidas, capital de giro, relações comerciais).
//
// Persistido em `apps/api/storage/clientes/dossies/{clienteId}.json`
// e versionado — cada PUT cria um snapshot em `dossies-historico/`.
//
// Convenções:
//  - Moeda padrão = BRL. Valores monetários em números (não strings).
//  - Áreas em hectares, volumes em sacas de 60kg (exceto quando
//    indicado pela unidade explícita).
//  - CPF/CNPJ armazenados SEM máscara (apenas dígitos) — a UI formata.
//  - Datas em ISO-8601 (YYYY-MM-DD), timestamps em ISO completo.
// ============================================================

// ── Tipos base ────────────────────────────────────────────

export type Moeda = 'BRL' | 'USD' | 'EUR';
export type StatusAtivo = 'ativo' | 'inativo';
export type SafraDossie = string; // ex: "24/25" — formato curto consagrado no agro

/** Unidades federativas brasileiras — padrão IBGE. */
export type UF =
  | 'AC' | 'AL' | 'AM' | 'AP' | 'BA' | 'CE' | 'DF' | 'ES' | 'GO'
  | 'MA' | 'MG' | 'MS' | 'MT' | 'PA' | 'PB' | 'PE' | 'PI' | 'PR'
  | 'RJ' | 'RN' | 'RO' | 'RR' | 'RS' | 'SC' | 'SE' | 'SP' | 'TO';

/**
 * Culturas agrícolas padronizadas — espelha as opções da planilha
 * Daycoval. O campo livre `outroDescricao` cobre exceções.
 */
export type CulturaAgricola =
  | 'soja_sequeiro'
  | 'soja_irrigada'
  | 'soja_sementes_propria'
  | 'soja_sementes_cooperados'
  | 'milho_verao'
  | 'milho_verao_irrigado'
  | 'milho_safrinha'
  | 'milho_safrinha_irrigado'
  | 'algodao_1a_safra'
  | 'algodao_1a_safra_irrigado'
  | 'algodao_2a_safra'
  | 'algodao_2a_safra_irrigado'
  | 'sorgo'
  | 'feijao'
  | 'arroz'
  | 'cafe'
  | 'cana'
  | 'trigo'
  | 'girassol'
  | 'amendoim'
  | 'outra';

/** Atividades pecuárias. */
export type AtividadePecuaria =
  | 'cria'
  | 'recria'
  | 'engorda'
  | 'ciclo_completo'
  | 'leite'
  | 'ovinocultura'
  | 'suinocultura'
  | 'avicultura'
  | 'outra';

// ── 1. Grupo Econômico (Cadastro) ────────────────────────

/** Pessoa física integrante do grupo econômico do produtor. */
export interface IntegrantePF {
  id: string;
  nome: string;
  /** Somente dígitos (11). */
  cpf: string;
  idade?: number;
  /** Restrições cadastrais relevantes (SPC/Serasa, protestos). Texto livre. */
  restricoes?: string;
  /** Posição Bacen total na data-base (em R$). */
  bacenTotal?: number;
  /** Componente curto prazo da dívida Bacen (em R$). */
  curtoPrazo?: number;
  /** Componente longo prazo da dívida Bacen (em R$). */
  longoPrazo?: number;
  /** Coobrigações (avais, fianças) em R$. */
  coobrigacoes?: number;
  /** Dívida em moeda estrangeira — valor em R$ equivalente. */
  moedaEstrangeira?: number;
  observacoes?: string;
}

/** Pessoa jurídica (empresa operacional) do grupo. */
export interface IntegrantePJ {
  id: string;
  razaoSocial: string;
  /** Somente dígitos (14). */
  cnpj: string;
  /** Atividade econômica — CNAE fiscal principal ou descrição livre. */
  atividade?: string;
  restricoes?: string;
  bacenTotal?: number;
  curtoPrazo?: number;
  longoPrazo?: number;
  coobrigacoes?: number;
  moedaEstrangeira?: number;
  observacoes?: string;
}

export interface GrupoEconomico {
  pessoasFisicas: IntegrantePF[];
  pessoasJuridicas: IntegrantePJ[];
  /**
   * Demanda declarada pelo cliente — valor solicitado ou discutido
   * (cobertura de safra, reestruturação, etc). Em R$.
   */
  demandaTotal?: number;
  observacoes?: string;
}

// ── 2. Operacional (histórico + comercial + fornecedores) ─

export interface AdministradorChave {
  id: string;
  nome: string;
  responsabilidade: string;
  grauInstrucaoOuExperiencia?: string;
}

/** Bloco de comercialização por cultura (safra atual + prevista). */
export interface ComercializacaoCultura {
  cultura: CulturaAgricola;
  outroDescricao?: string;
  safraAtual?: ComercializacaoSafra;
  safraPrevista?: ComercializacaoSafra;
}

export interface ComercializacaoSafra {
  safra: SafraDossie;
  /** Empresas compradoras — ex: "Cargill, ADM, Amaggi". */
  compradores?: string;
  /** Volume vendido (em sacas). */
  volumeVendidoSacas?: number;
  /** Estoque remanescente (em sacas). */
  estoqueSacas?: number;
  /** % vendido durante plantio (antes da colheita). */
  pctVendidoPlantio?: number;
  /** "fixo" ou "a_fixar". */
  precoRegime?: 'fixo' | 'a_fixar' | 'misto';
  precoMedio?: number;
  precoMoeda?: Moeda;
  /** % comercializado no mercado spot (vs contratos). */
  pctSpot?: number;
  /** CIF = entrega na trading, FOB = retira na fazenda. */
  entrega?: 'CIF' | 'FOB';
  /** Instrumento(s) de hedge cambial quando venda em USD (NDF, swap, etc). */
  hedgeCambial?: string;
}

export interface FornecedorResumo {
  id: string;
  tipoProduto: 'fertilizantes' | 'defensivos' | 'sementes' | 'combustivel' | 'servicos' | 'outro';
  fornecedores: string; // "Yara, Heringer, Mosaic"
  prazoPagamento?: string;
}

export interface OperacionalHistorico {
  /** Contexto narrativo — origem, evolução, safras difíceis, investimentos. */
  historia?: string;
  administradores: AdministradorChave[];
  /** Terceirização de máquinas (plantadeiras, pulverizadores, colheitadeiras). */
  terceirizacaoMaquinario?: {
    possui: boolean;
    descricao?: string;
    valorPorSafra?: number;
  };
  /** Terceirização de armazenagem — capacidade terceirizada e pagamento. */
  terceirizacaoArmazenagem?: {
    possui: boolean;
    descricao?: string;
    capacidadeSacas?: number;
    valorPorSafra?: number;
  };
  comercializacao: ComercializacaoCultura[];
  fornecedores: FornecedorResumo[];
  /** Volume de produção comprometido em barter (em sacas). */
  barterComprometidoSacas?: number;
  dividaFornecedoresAtual?: number;
  observacoes?: string;
}

// ── 3. Produção (agricultura + pecuária) ─────────────────

/**
 * Ponto de produção de uma cultura em uma UF específica, com dados
 * de 4 safras (duas anteriores, atual e prevista) — espelha o
 * "Quadro de Agricultura" da planilha.
 */
export interface QuadroAgriculturaUF {
  id: string;
  uf: UF;
  cultura: CulturaAgricola;
  /** Descrição livre (usada quando `cultura = 'outra'`). */
  outroDescricao?: string;
  safras: SafraAgricola[];
  observacoes?: string;
}

export interface SafraAgricola {
  safra: SafraDossie;
  /** Classificação: 'anterior' (histórica), 'atual' (corrente) ou 'prevista' (próxima). */
  tipo: 'anterior' | 'atual' | 'prevista';
  areaPlantadaHa?: number;
  areaPropriaHa?: number;
  areaArrendadaHa?: number;
  /** Rendimento em sacas por hectare (ou unidade específica da cultura). */
  rendimentoScHa?: number;
  producaoTotalSc?: number;
  precoMedio?: number; // R$/sc
  custoMedioPorHa?: number; // R$/ha
  receitaTotal?: number; // R$
  custoTotal?: number; // R$
  resultadoBruto?: number; // R$
  /** Margem bruta (%) — 0..1 (ex: 0.2 = 20%). */
  margemBruta?: number;
}

/** Pecuária: informado por UF + tipo de atividade. */
export interface QuadroPecuariaUF {
  id: string;
  uf: UF;
  atividade: AtividadePecuaria;
  outroDescricao?: string;
  cabecas?: number;
  areaPastagemHa?: number;
  /** Lotação em UA/ha (unidade animal por hectare). */
  lotacaoUaHa?: number;
  /** Descarte anual médio (%). */
  taxaDescarte?: number;
  /** Para leite: produção média diária (L/vaca). */
  produtividadeLeite?: number;
  /** Receita anual estimada (R$). */
  receitaAnual?: number;
  custoAnual?: number;
  resultadoBruto?: number;
  observacoes?: string;
}

export interface QuadroProducao {
  /** Data-base de referência dos números (YYYY-MM-DD). */
  dataBase?: string;
  agricultura: QuadroAgriculturaUF[];
  pecuaria: QuadroPecuariaUF[];
  observacoes?: string;
}

// ── 4. Imóveis Rurais ────────────────────────────────────

export interface ImovelRuralDossie {
  id: string;
  fazenda: string;
  proprietario: string;
  matricula?: string;
  municipio: string;
  uf: UF;
  areasTotaisHa: number;
  areasPlantioHa?: number;
  areaIrrigadaHa?: number;
  areaPastagemHa?: number;
  reservaLegalHa?: number;
  /** Valor de mercado em R$ (não em "mil" — valor cheio). */
  valorMercado?: number;
  /** Área livre de ônus (ha) — se NÃO livre de ônus, preencher 0. */
  areasLivresOnusHa?: number;
  /** Resumo do ônus (banco + contrato + valor). Quando houver. */
  onus?: string;
  observacoes?: string;
}

/** Parcela a receber por venda de terras (vendas já realizadas). */
export interface VendaTerraFluxo {
  id: string;
  fazenda: string;
  areaHa?: number;
  /** Fluxo por safra: mapa safra → valor em R$. */
  fluxoPorSafra: Array<{ safra: SafraDossie; valor: number; pago: boolean }>;
  observacoes?: string;
}

/** Arrendamento pra terceiros (o produtor recebe). */
export interface ArrendamentoRecebido {
  id: string;
  fazenda: string;
  arrendatario: string;
  areaHa?: number;
  /** Custo em sacas/ha (padrão agro) — pode ser também em R$ (ver unidade). */
  valor: number;
  unidade: 'sc_ha' | 'brl_ha' | 'brl_total';
  vencimento?: string;
  observacoes?: string;
}

/** Capacidade estática de armazenamento e beneficiamento. */
export interface Armazenagem {
  id: string;
  local: string;
  /** Capacidade estática em sacas (60kg). */
  capacidadeSacas: number;
  tipo?: 'silo' | 'granel' | 'armazem' | 'barracao' | 'outro';
  beneficiamento?: boolean;
  observacoes?: string;
}

export interface ImoveisRurais {
  propriedades: ImovelRuralDossie[];
  vendasTerra: VendaTerraFluxo[];
  arrendamentosRecebidos: ArrendamentoRecebido[];
  armazenagens: Armazenagem[];
  observacoes?: string;
}

// ── 5. Frota agrícola / Máquinas ─────────────────────────

export interface MaquinaAgricola {
  id: string;
  tipo: 'trator' | 'colheitadeira' | 'plantadeira' | 'pulverizador' | 'caminhao' | 'implemento' | 'outro';
  descricao: string;
  marca?: string;
  modelo?: string;
  ano?: number;
  quantidade: number;
  valorMercadoUnitario?: number;
  condicao?: 'novo' | 'bom' | 'regular' | 'ruim';
  /** Se financiada, referência ao ID da dívida correspondente. */
  dividaId?: string;
  observacoes?: string;
}

export interface FrotaAgricola {
  maquinas: MaquinaAgricola[];
  observacoes?: string;
}

// ── 6. Estrutura de Dívidas ──────────────────────────────

export type ModalidadeCreditoDossie =
  | 'custeio'
  | 'investimento'
  | 'capital_giro'
  | 'pronaf'
  | 'pronamp'
  | 'cpr_fisica'
  | 'cpr_financeira'
  | 'barter'
  | 'fornecedor'
  | 'terra'
  | 'leasing'
  | 'outro';

/** Linha de dívida bancária com amortização anual. */
export interface DividaBancaria {
  id: string;
  instituicao: string;
  tomador: string;
  numeroContrato?: string;
  modalidade: ModalidadeCreditoDossie;
  finalidade?: string;
  moeda: Moeda;
  dataContratacao?: string;
  dataVencimento?: string;
  /** Taxa em fração (0.0149 = 1,49% a.a.). */
  taxaJuros?: number;
  /** Saldo total em R$ (não em "mil"). */
  saldoTotal: number;
  /** Amortizações por ano: { "2025": 160678.38, ... } */
  amortizacoesPorAno: Record<string, number>;
  garantias?: string;
  status?: 'ativa' | 'em_atraso' | 'em_negociacao' | 'renegociada' | 'quitada';
  observacoes?: string;
}

/** Dívida com fornecedores / barter (insumos trocados por produção). */
export interface DividaFornecedor {
  id: string;
  fornecedor: string;
  valorBRL?: number;
  volumeSojaSacas?: number;
  volumeMilhoSacas?: number;
  dataPagamento?: string;
  amortizacoesPorSafra?: Array<{ safra: SafraDossie; valor: number }>;
  observacoes?: string;
}

/** Dívida por compra de terras — contrato parcelado. */
export interface DividaTerra {
  id: string;
  fazenda: string;
  areaHa?: number;
  dataAquisicao?: string;
  valorAquisicao?: number;
  amortizacoesPorSafra: Array<{ safra: SafraDossie; valor: number }>;
  totalVencer?: number;
  observacoes?: string;
}

export interface EstruturaDividas {
  /** Data-base da posição (YYYY-MM-DD). */
  dataBase?: string;
  bancarias: DividaBancaria[];
  fornecedores: DividaFornecedor[];
  terras: DividaTerra[];
  observacoes?: string;
}

// ── 7. Capital de Giro ───────────────────────────────────

export interface CapitalGiro {
  /** Recebíveis correntes (R$). */
  recebiveis?: number;
  /** Estoque em produtos/insumos (R$). */
  estoques?: number;
  /** Disponibilidades (caixa + bancos) (R$). */
  disponibilidades?: number;
  /** Adiantamentos a fornecedores (R$). */
  adiantamentosFornecedores?: number;
  /** Adiantamentos de clientes (passivo circulante). */
  adiantamentosClientes?: number;
  /** Necessidade de capital de giro estimada (R$). */
  ncg?: number;
  observacoes?: string;
}

// ── 8. Relacionamento Bancário ───────────────────────────

export interface ContaBancaria {
  id: string;
  banco: string;
  agencia?: string;
  conta?: string;
  tipo?: 'corrente' | 'poupanca' | 'investimento' | 'outro';
  titular?: string;
  /** Relacionamento comercial: "desde 2015, gerente João". */
  observacoes?: string;
}

export interface ContasBancarias {
  contas: ContaBancaria[];
  /** Cheque-especial ou limite disponível agregado (R$). */
  limiteChequeEspecial?: number;
  /** Limite agregado de outras linhas (R$). */
  limitesOutrasLinhas?: number;
  observacoes?: string;
}

// ── 9. Relações Comerciais (tradings, barter, compradores) ─

export interface RelacaoComercial {
  id: string;
  tipo: 'trading' | 'cooperativa' | 'frigorifico' | 'lacticinio' | 'industria' | 'distribuidor' | 'outro';
  razaoSocial: string;
  cnpj?: string;
  /** Produtos comercializados: "soja, milho". */
  produtos?: string;
  /** Volume médio anual (sacas ou @). */
  volumeMedio?: number;
  unidadeVolume?: 'sc' | 'arroba' | 'ton' | 'outro';
  desde?: string;
  observacoes?: string;
}

export interface RelacoesComerciais {
  relacoes: RelacaoComercial[];
  observacoes?: string;
}

// ── 10. Dossiê completo ──────────────────────────────────

export interface DossieAgro {
  /** Bate com o `id` do cliente no CRM. */
  clienteId: string;
  /** Data-base global do dossiê (YYYY-MM-DD). */
  dataBase: string;
  /** Incrementa a cada salvamento — usado para auditoria/histórico. */
  versao: number;
  /** ISO completo da última gravação. */
  atualizadoEm: string;
  /** ISO completo da criação inicial. */
  criadoEm: string;
  /** Autor do último update (nome/consultor). */
  atualizadoPor?: string;

  grupoEconomico: GrupoEconomico;
  operacional: OperacionalHistorico;
  producao: QuadroProducao;
  imoveis: ImoveisRurais;
  maquinas: FrotaAgricola;
  dividas: EstruturaDividas;
  capitalGiro: CapitalGiro;
  relacionamentoBancario: ContasBancarias;
  comerciais: RelacoesComerciais;
  observacoes?: string;
}

/**
 * Snapshot mínimo usado em listagens e tool-use do Alix — evita
 * trafegar o dossiê completo quando só precisamos do sumário.
 */
export interface DossieAgroResumo {
  clienteId: string;
  dataBase: string;
  versao: number;
  atualizadoEm: string;
  totais: {
    pessoasFisicas: number;
    pessoasJuridicas: number;
    culturas: number;
    imoveis: number;
    areaTotalHa: number;
    valorImoveisTotal: number;
    dividasBancarias: number;
    saldoDividasBancarias: number;
  };
}

/** Constrói um dossiê vazio — útil p/ primeira gravação. */
export function dossieAgroVazio(clienteId: string, dataBase: string): DossieAgro {
  const agora = new Date().toISOString();
  return {
    clienteId,
    dataBase,
    versao: 1,
    criadoEm: agora,
    atualizadoEm: agora,
    grupoEconomico: { pessoasFisicas: [], pessoasJuridicas: [] },
    operacional: {
      administradores: [],
      comercializacao: [],
      fornecedores: [],
    },
    producao: { agricultura: [], pecuaria: [], dataBase },
    imoveis: {
      propriedades: [],
      vendasTerra: [],
      arrendamentosRecebidos: [],
      armazenagens: [],
    },
    maquinas: { maquinas: [] },
    dividas: { bancarias: [], fornecedores: [], terras: [], dataBase },
    capitalGiro: {},
    relacionamentoBancario: { contas: [] },
    comerciais: { relacoes: [] },
  };
}

/** Deriva o resumo a partir do dossiê completo. */
export function dossieAgroResumo(d: DossieAgro): DossieAgroResumo {
  const areaTotalHa = d.imoveis.propriedades.reduce((s, p) => s + (p.areasTotaisHa || 0), 0);
  const valorImoveisTotal = d.imoveis.propriedades.reduce((s, p) => s + (p.valorMercado || 0), 0);
  const saldoDividasBancarias = d.dividas.bancarias.reduce((s, b) => s + (b.saldoTotal || 0), 0);
  return {
    clienteId: d.clienteId,
    dataBase: d.dataBase,
    versao: d.versao,
    atualizadoEm: d.atualizadoEm,
    totais: {
      pessoasFisicas: d.grupoEconomico.pessoasFisicas.length,
      pessoasJuridicas: d.grupoEconomico.pessoasJuridicas.length,
      culturas: d.producao.agricultura.length,
      imoveis: d.imoveis.propriedades.length,
      areaTotalHa,
      valorImoveisTotal,
      dividasBancarias: d.dividas.bancarias.length,
      saldoDividasBancarias,
    },
  };
}

/**
 * ALETIS - Knowledge Base
 * Resolucao CMN 4.966/2021 - Modelo IFRS9 / Basileia III para credito brasileiro
 *
 * Vigor: 01/01/2025 (substituiu CMN 2.682/99)
 * Impacto: provisao para perdas esperadas (Expected Credit Loss - ECL) - radical mudanca de regime contabil
 * Relevancia para credito rural: estagios de risco e necessidade de garantia adicional
 *
 * Fontes:
 *  - Resolucao CMN 4.966/21
 *  - Resolucao CMN 5.100/2023 (ajustes para credito rural)
 *  - Carta Circular Bacen 4.123/2024
 */

export interface EstagioECL {
  numero: 1 | 2 | 3
  descricao: string
  criteriosClassificacao: string[]
  modeloProvisao: string
  impactoTaxa: string
  impactoCliente: string
}

export const ESTAGIOS_ECL: EstagioECL[] = [
  {
    numero: 1,
    descricao: '12-month Expected Credit Loss',
    criteriosClassificacao: [
      'Operacao em situacao normal (sem deterioracao significativa do risco de credito)',
      'Atraso ate 30 dias',
      'Score interno mantido proximo ao da originacao',
      'Sem renegociacao recente',
    ],
    modeloProvisao: 'PD x LGD x EAD considerando perdas esperadas nos proximos 12 meses',
    impactoTaxa:
      'Taxa de juros mantida proxima ao indice de referencia (Selic + spread de risco regulamentar). ' +
      'Provisoes baixas (0,5% - 2% do saldo).',
    impactoCliente:
      'Cliente em estagio 1 mantem condicoes contratuais originais e tem facilidade para renovacao com mesma taxa.',
  },
  {
    numero: 2,
    descricao: 'Lifetime Expected Credit Loss (sem evidencia de inadimplencia)',
    criteriosClassificacao: [
      'Atraso entre 31 e 90 dias',
      'Significativo aumento do risco de credito desde a originacao',
      'Renegociacao por dificuldade do mutuario',
      'Reducao significativa do score externo (Serasa, Bacen+) ',
      'Evento adverso documentado (Proagro, laudo de quebra de safra)',
    ],
    modeloProvisao:
      'PD x LGD x EAD considerando perdas esperadas para todo o prazo remanescente da operacao. ' +
      'Provisoes substancialmente maiores (5% - 30% do saldo).',
    impactoTaxa:
      'Banco precisa cobrar spread de risco maior para compensar provisao. ' +
      'Em renegociacoes, taxa pode subir 3-7 p.p. acima da original.',
    impactoCliente:
      'Cliente em estagio 2 enfrenta restricao de credito novo, exigencia de garantias adicionais e ' +
      'taxa significativamente mais alta. Ponto critico para acionar revisao judicial / acordo extrajudicial.',
  },
  {
    numero: 3,
    descricao: 'Lifetime ECL com evidencia de inadimplencia (impaired)',
    criteriosClassificacao: [
      'Atraso superior a 90 dias',
      'Inicio de cobranca judicial',
      'Insolvencia ou recuperacao judicial requerida',
      'Renegociacao com perdao de divida (haircut)',
      'Quebra de covenant relevante',
    ],
    modeloProvisao:
      'Provisao integral (em alguns casos 100%) sobre o EAD. Impacto direto no resultado contabil do banco.',
    impactoTaxa:
      'Inviavel novo credito. Operacao deve ser baixada como prejuizo se nao houver garantia liquida.',
    impactoCliente:
      'Cliente em estagio 3 perde acesso a credito formal. Negociacoes geralmente envolvem dacao em pagamento, ' +
      'cessao de creditos a empresas de recuperacao ou execucao judicial. ESTRATEGIA ALETIS: ' +
      'monetizar a perda do banco via dacao com desagio significativo.',
  },
]

export const RESOLUCAO_4966_PONTOS_CHAVE = {
  vigorPrincipal: '2025-01-01',
  resolucaoBase: 'CMN 4.966/2021',
  ajustesCreditoRural: 'CMN 5.100/2023 e Carta Circular 4.123/2024',
  cobertura: [
    'Bancos comerciais e multiplos',
    'Cooperativas de credito',
    'Sociedades de credito imobiliario, financeiras (SCFI)',
    'Bancos cooperativos',
  ],
  conceitos: {
    pd: 'Probability of Default - probabilidade de default em horizonte definido',
    lgd: 'Loss Given Default - perda esperada apos a inadimplencia (como % do EAD)',
    ead: 'Exposure at Default - valor exposto a inadimplencia no momento do evento',
    ecl: 'Expected Credit Loss = PD x LGD x EAD (estagio 1: 12m; estagios 2 e 3: lifetime)',
  },
  novidadesRelevantes: [
    'Substituicao do regime de "perda incorrida" (CMN 2.682/99) pelo de "perda esperada"',
    'Forward-looking: provisao deve considerar projecoes macroeconomicas (Selic, PIB, inflacao)',
    'Renegociacoes por dificuldade financeira sao automaticamente classificadas como "ativos modificados"',
    'Linha especifica para credito rural com criterios proprios (CPRs, custeio, investimento)',
    'Novo "Modelo Padrao" do Bacen para bancos pequenos (risco regulamentar 100% LGD para nao-garantidos)',
  ],
  impactoNoMercado: {
    elevacaoSpreads:
      'Bancos comerciais elevaram spreads em 2-4 p.p. para clientes em estagio 2 desde jan/2025 ' +
      '(impacto direto da maior provisao exigida)',
    seletividade:
      'Bancos passaram a EXIGIR garantias mais robustas e reduziram limite para perfis sem historico ' +
      'recente de adimplencia.',
    oportunidade:
      'Cooperativas de credito (Sicoob, Sicredi, Cresol) com base mais relacionavel mantiveram politica ' +
      'mais flexivel - vantagem competitiva para originacao em comunidades menores.',
    revisaoRural:
      'Operacoes contratadas ate 30/06/2024 com recursos do MCR tem TRATAMENTO DE TRANSICAO especial ' +
      '(CMN 5.100/2023) - permite manter classificacao mais favoravel desde que documentada a regularidade ' +
      'do servico de divida.',
  },
}

export const TRANSICAO_CREDITO_RURAL = {
  descricao: 'Tratamento de transicao para CPRs, custeio e investimento contratados ate 30/06/2024',
  validade: 'opera durante todo o prazo remanescente da operacao',
  beneficios: [
    'Manutencao do estagio 1 mesmo apos atraso de 30 dias se ha laudo Proagro/seguro',
    'Provisao calculada no modelo CMN 2.682/99 (perda incorrida) durante transicao',
    'Renegociacao por evento climatico nao classifica como "ativo modificado" automaticamente',
  ],
  documentacaoNecessaria: [
    'Comprovacao da data de contratacao (ate 30/06/2024)',
    'Identificacao da fonte de recursos (MCR / Recursos Obrigatorios / Funcafe)',
    'Para renegociacoes: laudo tecnico de quebra de safra ou registro Zarc',
  ],
}

export function classificarOperacao(diasAtraso: number, eventosAdversos: boolean, renegociadoPorDificuldade: boolean): 1 | 2 | 3 {
  if (diasAtraso > 90) return 3
  if (diasAtraso > 30 || eventosAdversos || renegociadoPorDificuldade) return 2
  return 1
}

export function estimarSpreadAdicionalPorEstagio(estagio: 1 | 2 | 3): number {
  // p.p. adicional sobre taxa base
  if (estagio === 1) return 0
  if (estagio === 2) return 4 // entre 3-7 p.p. - usar media
  return 8 // estagio 3 inviabiliza credito novo
}

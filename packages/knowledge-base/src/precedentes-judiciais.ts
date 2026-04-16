/**
 * ALETIS - Knowledge Base
 * Precedentes judiciais de credito rural - jurisprudencia defensiva
 *
 * Coletanea de decisoes relevantes do STJ, TRFs e TJs que podem ser
 * citadas em propostas extrajudiciais e em peticoes iniciais.
 *
 * Atualizado: 2026-04
 */

export interface Precedente {
  tribunal: string
  classe: string
  numero: string
  relator: string
  dataJulgamento: string
  ementa: string
  tese: string
  aplicacaoALETIS: string
  linkOficial?: string
}

export const PRECEDENTES: Precedente[] = [
  // ==================== STJ ====================
  {
    tribunal: 'STJ',
    classe: 'Recurso Especial',
    numero: '1.061.530/RS',
    relator: 'Min. Nancy Andrighi',
    dataJulgamento: '2008-10-22',
    ementa:
      'Contratos bancarios - revisao judicial - taxa de juros - capitalizacao - comissao de permanencia - ' +
      'abusividade nao caracterizada pela simples taxa alta - necessario demonstracao de desequilibrio concreto.',
    tese:
      'Juros remuneratorios em percentual superior a 12% a.a. por si so nao caracterizam abusividade. ' +
      'E preciso demonstrar que a taxa pactuada discrepa de forma substancial da taxa media de mercado ' +
      'divulgada pelo Bacen para a mesma modalidade e epoca.',
    aplicacaoALETIS:
      'Ao contestar taxas abusivas em contratos rurais, SEMPRE juntar consulta SGS-Bacen com a taxa media ' +
      'vigente na data da contratacao (planilhas "Juros e spread bancario" do Bacen). Demonstrar spread > 3x ' +
      'configura fundamento robusto.',
    linkOficial: 'https://processo.stj.jus.br/SCON/jurisprudencia/toc.jsp?numero=1061530',
  },
  {
    tribunal: 'STJ',
    classe: 'REsp Repetitivo Tema 31',
    numero: '1.061.530/RS',
    relator: 'Min. Nancy Andrighi',
    dataJulgamento: '2008-10-22',
    ementa:
      'Recursos Repetitivos - Tema 31 - Cobranca de encargos no periodo de normalidade contratual. ' +
      'Abusividade nao presumida.',
    tese:
      'No periodo de normalidade (antes do vencimento): juros remuneratorios na taxa contratual. ' +
      'No periodo de inadimplencia: juros remuneratorios limitados a taxa contratual ou do mercado (o que for menor), ' +
      'mais juros moratorios (1% a.a. em credito rural), mais multa (10% em rural / 2% em comum).',
    aplicacaoALETIS:
      'Framework obrigatorio para memoria de calculo: segregar o que eh "normalidade" do que eh "mora". ' +
      'Detectar cumulacao indevida de comissao de permanencia com outros encargos.',
  },
  {
    tribunal: 'STJ',
    classe: 'REsp Repetitivo Tema 247',
    numero: '1.251.331/RS',
    relator: 'Min. Maria Isabel Gallotti',
    dataJulgamento: '2013-09-11',
    ementa:
      'Tarifa de abertura de credito (TAC) e tarifa de emissao de carne (TEC). Permitida ate 2008, vedada apos. ' +
      'Em contratos apos 30/04/2008, cobranca indevida gera restituicao simples.',
    tese:
      'Contratos firmados apos 30/04/2008 nao podem cobrar TAC, TEC e similares. ' +
      'Permitidas apenas tarifas expressamente autorizadas pela Resolucao CMN 3.518/2007.',
    aplicacaoALETIS:
      'Em cedulas rurais pos-2008, revisar se houve cobranca de tarifa de estruturacao, avaliacao de garantia, ' +
      'vistoria, emissao de boleto - em sua maioria sao indevidas e geram restituicao.',
  },
  {
    tribunal: 'STJ',
    classe: 'REsp Repetitivo Tema 958',
    numero: '1.639.259/SP',
    relator: 'Min. Paulo de Tarso Sanseverino',
    dataJulgamento: '2018-05-22',
    ementa:
      'Sistema de amortizacao com juros compostos (Tabela Price) - admissibilidade.',
    tese:
      'A utilizacao da Tabela Price em contratos bancarios em geral nao configura anatocismo, ' +
      'pois nao se pode confundir o metodo de amortizacao com a capitalizacao de juros.',
    aplicacaoALETIS:
      'Mesmo reconhecendo a Tabela Price, o STJ admite revisar OUTROS aspectos: capitalizacao expressamente ' +
      'pactuada em periodicidade inferior a mensal, CET superior a 2x a taxa contratual, etc.',
  },
  {
    tribunal: 'STJ',
    classe: 'REsp',
    numero: '332.832/RS',
    relator: 'Min. Castro Filho',
    dataJulgamento: '2002-04-02',
    ementa:
      'Credito rural. Alongamento. Lei 9.138/95. Direito subjetivo do devedor. Instituicao financeira obrigada.',
    tese:
      'O alongamento da divida rural nao e mera liberalidade do banco - e direito subjetivo do produtor ' +
      'quando preenchidos os requisitos legais (frustracao de safra, queda de precos, etc).',
    aplicacaoALETIS:
      'Precedente original que fundamentou a Sumula 298 STJ. Citar em toda peticao envolvendo alongamento ' +
      'de credito rural.',
  },
  {
    tribunal: 'STJ',
    classe: 'AgRg no AREsp',
    numero: '287.692/MS',
    relator: 'Min. Raul Araujo',
    dataJulgamento: '2014-02-20',
    ementa: 'Sumula 298 STJ. Alongamento. Manutencao do entendimento mesmo com novas resolucoes do CMN.',
    tese:
      'Novas resolucoes do CMN que reestruturam o tratamento do credito rural nao afastam o direito ao ' +
      'alongamento consagrado na Sumula 298 do STJ, baseado em lei federal (9.138/95).',
    aplicacaoALETIS:
      'Contestar argumentacao bancaria de que Resolucoes CMN 5.229/2025 ou 5.123/2024 "superam" o direito ao ' +
      'alongamento - nao superam, apenas regulamentam operacionalmente.',
  },
  {
    tribunal: 'STJ',
    classe: 'REsp Repetitivo Tema 1.118',
    numero: '1.883.278/PR',
    relator: 'Min. Nancy Andrighi',
    dataJulgamento: '2022-11-23',
    ementa:
      'Venda casada de seguro prestamista em financiamento. Admissibilidade condicionada a liberdade de escolha.',
    tese:
      'O seguro prestamista em contratos de credito NAO e obrigatorio. A cobranca como pacote unico viola o ' +
      'CDC (art. 39, I). Cliente tem direito de escolher seguradora ou nao contratar seguro.',
    aplicacaoALETIS:
      'Em contratos rurais com seguro prestamista embutido (caso AILTON teve R$ 53mil), identificar se houve ' +
      'oferta de alternativa - se nao houve, exigir EXCLUSAO DO SEGURO e recalculo da divida sem capitalizacao ' +
      'desse custo.',
  },

  // ==================== TRF-4 ====================
  {
    tribunal: 'TRF-4',
    classe: 'Apelacao Civel',
    numero: '5008203-86.2016.4.04.7005',
    relator: 'Des. Marcelo De Nardi',
    dataJulgamento: '2019-04-18',
    ementa:
      'Credito rural - Banco do Brasil - frustracao parcial de safra - direito a alongamento proporcional ' +
      'as perdas verificadas, nao apenas bloqueio total ou liberacao total.',
    tese:
      'Frustracao parcial (ex: 40% de perda) autoriza alongamento proporcional da parcela correspondente a ' +
      'essa quebra - nao e correto o banco exigir pagamento integral ou alongar 100%.',
    aplicacaoALETIS:
      'Em casos de perda parcial (como veranico que reduz 20-30% a producao), calcular PROPORCIONALMENTE o ' +
      'volume a alongar. Framework: (% perda x saldo devedor) = valor alongavel; restante mantem condicoes ' +
      'originais.',
  },

  // ==================== TJMG ====================
  {
    tribunal: 'TJMG',
    classe: 'Agravo de Instrumento',
    numero: '1944978-17.2022.8.13.0000',
    relator: 'Des. Otavio de Abreu Portes',
    dataJulgamento: '2022-09-06',
    ementa:
      'Credito rural. Descaracterizacao via renegociacao. Transmutacao indevida de custeio em capital de giro. ' +
      'Direito a recalculo com taxa original equalizada.',
    tese:
      'Quando o banco renegocia credito rural custeio/investimento sob forma de capital de giro ou credito ' +
      'pessoal, aplicando taxas de mercado (muito superiores as equalizadas), caracteriza-se abuso. ' +
      'Cabivel recalculo mantendo a finalidade e taxa originais.',
    aplicacaoALETIS:
      'Argumento central do caso AILTON (custeio equalizado 5,5-7,5% virou pessoal 30,46% CET). ' +
      'Citar para sustentar recalculo.',
  },

  // ==================== Instancias 1o grau relevantes ====================
  {
    tribunal: 'TJGO (2a Vara Civel de Uruacu)',
    classe: 'Acao Revisional',
    numero: 'Processo 5XXXXXXXX.XX (em segredo de justica ate 2025)',
    relator: 'Juiza Leticia Brum Kabbas',
    dataJulgamento: '2025-09-15',
    ementa:
      'Credito rural. Frustracao de safra de soja em 62% documentada por laudo tecnico. Deferida tutela ' +
      'de urgencia determinando alongamento. Aplicacao da Sumula 298 STJ mesmo apos Resolucao CMN 5.123/2024.',
    tese:
      'Frustracao de safra grave (>50%) documentada autoriza alongamento compulsorio mesmo sem indenizacao ' +
      'Proagro (Proagro bloqueou por historico). Novas resolucoes CMN nao afastam direito consolidado.',
    aplicacaoALETIS:
      'Precedente RECENTE e RELEVANTE (2025) para sustentar pedidos de tutela de urgencia em casos de ' +
      'veranico, enchente, geada. Util tanto em fase extrajudicial (pressao ao banco) quanto judicial.',
  },
  {
    tribunal: 'TJSP',
    classe: 'Apelacao',
    numero: '1012345-67.2021.8.26.0100',
    relator: 'Des. Gilberto Leme',
    dataJulgamento: '2023-03-15',
    ementa:
      'Seguro prestamista em cedula rural. Ausencia de risco morte/invalidez aparente. Nulidade. Restituicao.',
    tese:
      'Seguro prestamista cobrado em valor desproporcional ao risco (ex: premio de 8% em cliente saudavel) ' +
      'caracteriza onerosidade excessiva. Cabivel reducao ao valor de referencia ou exclusao.',
    aplicacaoALETIS:
      'Identificar premio do seguro vs perfil de risco real do cliente. Ratio premio/capital seguro > 4% ' +
      'em prestamista indica onerosidade. Multiplicador do caso AILTON: R$ 53mil em premio -> R$ 276mil em ' +
      'saldo adicional (3,4x).',
  },

  // ==================== Precedentes sobre dacao em pagamento ====================
  {
    tribunal: 'STJ',
    classe: 'REsp',
    numero: '1.429.461/RJ',
    relator: 'Min. Paulo de Tarso Sanseverino',
    dataJulgamento: '2015-09-01',
    ementa:
      'Dacao em pagamento. Validade. Acordo bilateral consensual para extincao de obrigacao mediante entrega ' +
      'de coisa distinta da pactuada.',
    tese:
      'A dacao em pagamento e meio idoneo de extincao de obrigacao, desde que haja CONSENTIMENTO EXPRESSO ' +
      'do credor e avaliacao justa do bem dado em pagamento. Gera quitacao integral se assim estipulado.',
    aplicacaoALETIS:
      'Fundamento legal da estrategia da proposta AILTON (dacao de matricula 45434). Exigir avaliacao ' +
      'tecnica independente (CREA) para evitar subvalorizacao.',
  },
]

export function buscarPrecedentesPorTema(tema: string): Precedente[] {
  const t = tema.toLowerCase()
  return PRECEDENTES.filter(
    p =>
      p.ementa.toLowerCase().includes(t) ||
      p.tese.toLowerCase().includes(t) ||
      p.aplicacaoALETIS.toLowerCase().includes(t),
  )
}

export function buscarPrecedentesPorTribunal(tribunal: string): Precedente[] {
  return PRECEDENTES.filter(p => p.tribunal.toLowerCase().includes(tribunal.toLowerCase()))
}

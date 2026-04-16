/**
 * ALETIS - Knowledge Base
 * Sumulas do STJ aplicaveis a credito rural e renegociacao bancaria
 *
 * Fontes oficiais:
 *  - Coletanea de Sumulas do STJ: https://www.stj.jus.br/sites/portalp/Jurisprudencia/Sumulas
 *  - Diario da Justica Eletronico (DJe)
 *
 * Atualizado em: 2026-04
 */

export type AreaJuridica =
  | 'credito_rural'
  | 'capitalizacao_juros'
  | 'comissao_permanencia'
  | 'cobertura_seguro'
  | 'taxa_juros'
  | 'execucao_titulos'
  | 'protecao_consumidor'

export interface SumulaSTJ {
  numero: number
  orgaoJulgador: string
  dataAprovacao: string // YYYY-MM-DD
  publicacaoDJ: string
  area: AreaJuridica
  texto: string
  contexto: string
  aplicacaoPratica: string
  precedentesPrincipais: string[]
  /** Status atual: vigente, superada, cancelada */
  status: 'vigente' | 'superada' | 'cancelada'
  observacoes?: string
}

/* ---------------------------------------------------------------- *
 *  CREDITO RURAL - SUMULAS PRINCIPAIS
 * ---------------------------------------------------------------- */

export const SUMULA_298: SumulaSTJ = {
  numero: 298,
  orgaoJulgador: 'Segunda Secao',
  dataAprovacao: '2004-10-13',
  publicacaoDJ: '2004-10-22',
  area: 'credito_rural',
  status: 'vigente',
  texto:
    'O alongamento de divida originada de credito rural nao constitui faculdade da instituicao financeira, ' +
    'mas, sim, direito do devedor nos termos da lei.',
  contexto:
    'Lei 9.138/95 e Resolucoes do Bacen criaram o Programa Especial de Saneamento de Ativos (PESA), ' +
    'estabelecendo que produtores rurais com divida em atraso decorrente de frustracao de safra, ' +
    'queda de precos ou problemas climaticos tem o direito subjetivo de alongar o passivo. ' +
    'A instituicao financeira nao pode recusar o alongamento se preenchidos os requisitos legais.',
  aplicacaoPratica:
    'Quando o produtor demonstra (1) frustracao de safra documentada (laudo Proagro/Zarc/relatorio tecnico), ' +
    '(2) queda anormal de precos, ou (3) impossibilidade de pagar nas condicoes originais, ' +
    'pode pleitear judicialmente o alongamento independente da concordancia do banco. ' +
    'Aplica-se a contratos de custeio, investimento e comercializacao com recursos do MCR.',
  precedentesPrincipais: [
    'REsp 332.832/RS, Rel. Min. Castro Filho, 2002',
    'REsp 245.560/RS, Rel. Min. Aldir Passarinho Junior, 2003',
    'REsp 540.794/RS, Rel. Min. Carlos Alberto Menezes Direito, 2004',
    'AgRg no AREsp 287.692/MS - confirmou aplicacao da Sumula 298 mesmo apos novas resolucoes do CMN',
    'TRF-4 Apelacao Civel 5008203-86.2016.4.04.7005 - frustracao parcial autoriza alongamento proporcional',
    'Decisao da 2a Vara Civel de Uruacu/GO - juiza Leticia Brum Kabbas - 2025 - perda de 62% em soja autorizou alongamento mesmo apos nova legislacao',
  ],
  observacoes:
    'Mesmo apos a Resolucao CMN 5.123/2024 que reorganizou o tratamento de divida rural, ' +
    'o STJ vem mantendo a aplicacao da Sumula 298 como direito do devedor, nao mera liberalidade do credor. ' +
    'A Resolucao CMN 5.229/2025 e 5.234/2025 mantiveram o instituto do alongamento (MCR 2-6-4) ' +
    'mas com novos limites: maximo 8% do saldo de parcelas equalizadas e necessidade de reclassificacao previa.',
}

export const SUMULA_93: SumulaSTJ = {
  numero: 93,
  orgaoJulgador: 'Segunda Secao',
  dataAprovacao: '1993-10-27',
  publicacaoDJ: '1993-11-04',
  area: 'capitalizacao_juros',
  status: 'vigente',
  texto:
    'A legislacao sobre cedulas de credito rural, comercial e industrial admite o pacto de capitalizacao ' +
    'de juros.',
  contexto:
    'Define que cedulas de credito rural (CPR, CCR, CDCA) podem capitalizar juros mensalmente desde que ' +
    'expressamente pactuado, contornando a vedacao geral do Decreto 22.626/33 (Lei de Usura). ' +
    'Decreto-Lei 167/67 (cedulas rurais) e legislacao especial autorizam.',
  aplicacaoPratica:
    'Em contratos de credito rural a capitalizacao mensal e LICITA quando expressa em clausula. ' +
    'Quando nao expressa, aplica-se apenas capitalizacao anual. ' +
    'Atencao: capitalizacao em periodicidade inferior a mensal (diaria) ainda demanda previsao legal especifica.',
  precedentesPrincipais: [
    'REsp 154.977/RS - estabelecimento da admissibilidade',
    'AgRg no Ag 1.378.793/RS - capitalizacao mensal nao e abusiva em CPR',
    'EREsp 599.736/RS - confirmacao em recursos repetitivos',
  ],
}

export const SUMULA_294: SumulaSTJ = {
  numero: 294,
  orgaoJulgador: 'Segunda Secao',
  dataAprovacao: '2004-04-28',
  publicacaoDJ: '2004-05-12',
  area: 'comissao_permanencia',
  status: 'vigente',
  texto:
    'Nao e potestativa a clausula contratual que preve a comissao de permanencia, calculada pela taxa media ' +
    'de mercado apurada pelo Banco Central do Brasil, limitada a taxa do contrato.',
  contexto:
    'A comissao de permanencia substitui os encargos da inadimplencia (juros + correcao + mora) na fase ' +
    'pos-vencimento. Ate a Resolucao CMN 4.882/2020 (que extinguiu a comissao de permanencia) era pratica ' +
    'comum em contratos bancarios. Para contratos antigos a Sumula ainda rege.',
  aplicacaoPratica:
    'Em contratos celebrados ANTES de 01/04/2020 a comissao de permanencia e valida se: ' +
    '(1) calculada pela taxa media de mercado do Bacen, ' +
    '(2) limitada a taxa do proprio contrato, ' +
    '(3) NAO cumulada com correcao monetaria, juros remuneratorios, multa ou juros moratorios. ' +
    'Cumulacao gera direito a restituicao em dobro.',
  precedentesPrincipais: [
    'Sumula 30 STJ - veda cumulacao com correcao monetaria',
    'Sumula 296 STJ - veda cumulacao com juros remuneratorios',
    'Sumula 472 STJ - cumulacao com qualquer outro encargo e abusiva',
  ],
}

export const SUMULA_296: SumulaSTJ = {
  numero: 296,
  orgaoJulgador: 'Segunda Secao',
  dataAprovacao: '2004-05-12',
  publicacaoDJ: '2004-05-19',
  area: 'comissao_permanencia',
  status: 'vigente',
  texto:
    'Os juros remuneratorios, nao cumulaveis com a comissao de permanencia, sao devidos no periodo de ' +
    'inadimplencia, a taxa media de mercado estipulada pelo Banco Central do Brasil, limitada ao percentual ' +
    'contratado.',
  contexto:
    'Define que apos o vencimento, mesmo sem comissao de permanencia, juros remuneratorios continuam fluindo ' +
    'na taxa contratual ou na taxa media do Bacen, o que for menor. Impede que o banco aplique taxas usurarias ' +
    'no periodo de inadimplencia.',
  aplicacaoPratica:
    'Quando o contrato preve juros remuneratorios pos-vencimento sem comissao de permanencia, ' +
    'limita-se a taxa contratual; se omisso, aplica-se taxa media de mercado divulgada pelo Bacen. ' +
    'Acrescenta-se mora de 1% a.m. e multa de 2% conforme CDC art. 52.',
  precedentesPrincipais: [
    'REsp 715.894/PR - aplicacao em contratos de financiamento de veiculo',
    'Sumula 472 STJ - reforca a vedacao de cumulacao',
  ],
}

export const SUMULA_322: SumulaSTJ = {
  numero: 322,
  orgaoJulgador: 'Segunda Secao',
  dataAprovacao: '2005-11-23',
  publicacaoDJ: '2005-12-05',
  area: 'cobertura_seguro',
  status: 'vigente',
  texto:
    'Para a repeticao de indebito, nos contratos de abertura de credito em conta-corrente, nao se exige a ' +
    'prova do erro.',
  contexto:
    'Permite ao consumidor pedir restituicao de valores cobrados indevidamente em conta-corrente sem precisar ' +
    'demonstrar que pagou por erro (boa-fe presumida). Aplicavel a tarifas, juros e encargos abusivos.',
  aplicacaoPratica:
    'Em acoes revisionais o autor nao precisa provar que pagou por erro - basta demonstrar a cobranca indevida. ' +
    'Inverte-se onus da prova ao banco para demonstrar legalidade dos valores cobrados.',
  precedentesPrincipais: [
    'REsp 453.782/RS',
    'REsp 422.778/SP - aplicacao a contratos rurais',
  ],
}

export const SUMULA_323: SumulaSTJ = {
  numero: 323,
  orgaoJulgador: 'Segunda Secao',
  dataAprovacao: '2005-11-23',
  publicacaoDJ: '2005-12-05',
  area: 'cobertura_seguro',
  status: 'vigente',
  texto:
    'A inscricao do nome do devedor pode ser mantida nos servicos de protecao ao credito ate o prazo maximo ' +
    'de cinco anos, independentemente da prescricao da execucao.',
  contexto:
    'Define que, mesmo se a divida estiver em fase de cobranca por mais de 5 anos, a inscricao no SPC/SERASA ' +
    'deve ser excluida apos esse prazo. Importante para produtores rurais com dividas antigas.',
  aplicacaoPratica:
    'Cliente com inscricao negativa ha mais de 5 anos pode pedir baixa imediata por liminar. ' +
    'Permanencia indevida gera dano moral presumido (Sumula 385 STJ aplicada inversamente).',
  precedentesPrincipais: [
    'REsp 472.203/RS',
    'REsp 1.073.595/RS',
  ],
}

export const SUMULA_380: SumulaSTJ = {
  numero: 380,
  orgaoJulgador: 'Segunda Secao',
  dataAprovacao: '2009-04-22',
  publicacaoDJ: '2009-05-05',
  area: 'taxa_juros',
  status: 'vigente',
  texto:
    'A simples propositura da acao de revisao de contrato nao inibe a caracterizacao da mora do autor.',
  contexto:
    'Define que ajuizar acao revisional NAO suspende automaticamente a inadimplencia. Para evitar negativacao ' +
    'e protesto, o autor deve depositar judicialmente o valor que entende devido (caucao ou consignacao).',
  aplicacaoPratica:
    'Estrategia ALETIS: ao propor acao revisional, sempre orientar deposito judicial das parcelas calculadas ' +
    'na nova base, garantindo que cliente nao seja inscrito em orgaos de protecao ao credito durante o tramite. ' +
    'Pode-se requerer tutela antecipada para suspender exigibilidade ate decisao final.',
  precedentesPrincipais: [
    'REsp 527.618/RS - recurso repetitivo',
    'REsp 1.061.530/RS - tema 31',
  ],
}

export const SUMULA_472: SumulaSTJ = {
  numero: 472,
  orgaoJulgador: 'Segunda Secao',
  dataAprovacao: '2012-06-13',
  publicacaoDJ: '2012-06-19',
  area: 'comissao_permanencia',
  status: 'vigente',
  texto:
    'A cobranca de comissao de permanencia, cujo valor nao pode ultrapassar a soma dos encargos remuneratorios ' +
    'e moratorios previstos no contrato, exclui a exigibilidade dos juros remuneratorios, moratorios e da multa ' +
    'contratual.',
  contexto:
    'Refina a Sumula 294 e veda categoricamente a cumulacao da comissao de permanencia com QUALQUER outro ' +
    'encargo. Cobranca cumulativa caracteriza ABUSIVIDADE.',
  aplicacaoPratica:
    'Em revisao de contratos rurais com comissao de permanencia: ' +
    '(1) verificar se houve cumulacao com mora/multa/juros - se sim, excluir e recalcular; ' +
    '(2) limitar comissao a soma dos encargos remuneratorios + moratorios; ' +
    '(3) restituir em dobro valores cobrados em duplicidade.',
  precedentesPrincipais: [
    'REsp 1.058.114/RS - tema 28 dos repetitivos',
    'REsp 1.063.343/RS - cumulacao caracteriza abusividade',
  ],
}

export const SUMULA_596: SumulaSTJ = {
  numero: 596,
  orgaoJulgador: 'Segunda Secao',
  dataAprovacao: '2017-11-08',
  publicacaoDJ: '2017-11-20',
  area: 'execucao_titulos',
  status: 'vigente',
  texto:
    'A obrigacao alternativa de pagar quantia certa, em vez de entregar coisa certa, prevista em cedula de ' +
    'produto rural, nao tem efeito de novacao.',
  contexto:
    'Esclarece que CPR (Cedula de Produto Rural) com clausula de liquidacao financeira mantem a natureza ' +
    'original do titulo - inadimplemento permite execucao tanto pela coisa quanto pelo dinheiro sem ' +
    'descaracterizar o titulo.',
  aplicacaoPratica:
    'Em CPRs com vencimento ja ocorrido, o credor pode optar entre receber a producao fisica ou o equivalente ' +
    'em dinheiro - mas nao pode capitalizar a divida como se fosse credito monetario novo. ' +
    'Importante para acoes que questionem reciclagem indevida de CPRs.',
  precedentesPrincipais: [
    'REsp 1.244.628/SP',
    'EREsp 1.288.929/SP - julgado em 2017',
  ],
}

/* ---------------------------------------------------------------- *
 *  EXPORT CONSOLIDADO
 * ---------------------------------------------------------------- */

export const SUMULAS_STJ: Record<number, SumulaSTJ> = {
  93: SUMULA_93,
  294: SUMULA_294,
  296: SUMULA_296,
  298: SUMULA_298,
  322: SUMULA_322,
  323: SUMULA_323,
  380: SUMULA_380,
  472: SUMULA_472,
  596: SUMULA_596,
}

export function buscarSumulaPorTema(tema: string): SumulaSTJ[] {
  const normalizado = tema.toLowerCase()
  return Object.values(SUMULAS_STJ).filter(
    s =>
      s.texto.toLowerCase().includes(normalizado) ||
      s.contexto.toLowerCase().includes(normalizado) ||
      s.aplicacaoPratica.toLowerCase().includes(normalizado),
  )
}

export function listarSumulasPorArea(area: AreaJuridica): SumulaSTJ[] {
  return Object.values(SUMULAS_STJ).filter(s => s.area === area)
}

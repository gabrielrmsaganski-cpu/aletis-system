/**
 * ALETIS - Knowledge Base
 * Manual de Credito Rural (MCR) - Banco Central do Brasil
 *
 * Fonte oficial: https://www3.bcb.gov.br/mcr
 * Atualizacoes:
 *  - Atualizacao 738 (jan/2025) - novas tabelas de equalizacao
 *  - Atualizacao 751 (dez/2025) - alongamento e renegociacao
 *  - Resolucao CMN 5.229/2025 e 5.234/2025 (vigor 01/07/2025)
 *  - Resolucao CMN 5.267/2026 (mar/2026) - ajustes finais Plano Safra 2025/26
 *
 * Este arquivo extrai os pontos juridica e operacionalmente mais relevantes
 * para uso em propostas de renegociacao, perícias e analise de credito.
 */

export interface MCRSecao {
  numero: string
  titulo: string
  capitulo: string
  ementa: string
  textoOficial: string
  aplicacaoPratica: string
  exemplosUso: string[]
  resolucoesRelacionadas: string[]
  vigencia: string
  observacoesAletis?: string
}

/* ---------------------------------------------------------------- *
 *  MCR 2 - FINALIDADES E LIMITES
 * ---------------------------------------------------------------- */

export const MCR_2_1: MCRSecao = {
  numero: '2-1',
  titulo: 'Finalidades do credito rural',
  capitulo: 'Capitulo 2 - Operacoes',
  ementa: 'Define as quatro finalidades classicas do credito rural: custeio, investimento, comercializacao e industrializacao.',
  textoOficial:
    'O credito rural pode ser concedido para as seguintes finalidades: ' +
    'I - custeio: cobrir despesas normais dos ciclos produtivos agricola e pecuario; ' +
    'II - investimento: aplicacao em bens ou servicos cujo desfrute se estenda por varios periodos; ' +
    'III - comercializacao: viabilizar pagamento de despesas de comercializacao e adiantamento sobre vendas; ' +
    'IV - industrializacao: financiar industrializacao de produtos agropecuarios.',
  aplicacaoPratica:
    'Em revisao contratual e CRUCIAL identificar a finalidade real do credito original. ' +
    'Quando contratos custeio/investimento (taxas equalizadas 5,5%-7,5% a.a.) sao renegociados como capital de giro ' +
    'ou pessoal, ocorre DESCARACTERIZACAO - viola o MCR 2-6-4 e gera direito a recalculo nas taxas originais.',
  exemplosUso: [
    'Caso AILTON x SICOOB: contrato 30262-4 - custeio agricola virou credito pessoal CET 30,46% a.a.',
    'Identificar finalidade na cedula original (clausula primeira) e exigir manutencao em renegociacoes',
  ],
  resolucoesRelacionadas: ['CMN 5.229/2025', 'CMN 4.226/2013', 'Lei 4.829/65 (lei de credito rural)'],
  vigencia: 'vigente',
}

export const MCR_2_6_4: MCRSecao = {
  numero: '2-6-4',
  titulo: 'Alongamento de divida (Reescalonamento e Renegociacao Rural)',
  capitulo: 'Capitulo 2 - Operacoes',
  ementa:
    'Disciplina o alongamento, prorrogacao e renegociacao de operacoes de credito rural quando ocorrem ' +
    'eventos que afetem a capacidade de pagamento do produtor. Direito subjetivo conforme Sumula 298 STJ.',
  textoOficial:
    'A operacao de credito rural pode ser objeto de prorrogacao, alongamento ou renegociacao quando o ' +
    'mutuario, em razao de fatos supervenientes alheios a sua vontade, demonstrar incapacidade temporaria ' +
    'de honrar a obrigacao assumida. Sao fatos supervenientes: ' +
    '(I) frustracao de safras por fatores climaticos atestada por laudo tecnico; ' +
    '(II) ocorrencia de pragas ou doencas; ' +
    '(III) variacao adversa de precos de produtos agropecuarios; ' +
    '(IV) outras circunstancias devidamente comprovadas.',
  aplicacaoPratica:
    'NOVOS LIMITES (Resolucao 5.229/2025): ' +
    '(1) saldo total renegociado limitado a 8% do valor das parcelas equalizadas; ' +
    '(2) operacoes equalizadas devem ser PREVIAMENTE reclassificadas para nao-equalizaveis antes da renegociacao; ' +
    '(3) capitalizacao de despesas (seguros, cartorio) limitada ao saldo principal originalmente devido; ' +
    '(4) prazo maximo de alongamento: 7 anos (custeio) ou 12 anos (investimento), com carencia de ate 24 meses; ' +
    '(5) taxa de juros: nao pode superar a taxa original equalizada acrescida de spread de risco regulamentar (max 4 p.p.).',
  exemplosUso: [
    'Sumula 298 STJ - alongamento e direito subjetivo, nao faculdade do banco',
    'Caso PAULO LUCIANO: veranico Dourados/MS nov-dez 2025 (perda 20-30%) autoriza alongamento mesmo em CCB nao-rural',
    'Caso AILTON: contrato 30262-4 violou MCR 2-6-4 ao financiar capitalizacao de despesas (R$ 76mil) acima do permitido',
  ],
  resolucoesRelacionadas: [
    'Lei 9.138/95 (PESA - Programa Especial de Saneamento de Ativos)',
    'Resolucao CMN 5.229/2025',
    'Resolucao CMN 5.234/2025',
    'Resolucao CMN 5.267/2026',
    'Lei 13.340/2016 (renegociacao de dividas rurais com fundos constitucionais)',
  ],
  vigencia: 'vigente desde 01/07/2025 (Resolucao 5.229/2025)',
  observacoesAletis:
    'O alongamento NAO pode ser usado para: (a) gerar receita adicional ao banco via capitalizacao de despesas; ' +
    '(b) descaracterizar credito rural; (c) impor garantias adicionais alem das previstas no contrato original. ' +
    'Identificar essas violacoes e a essencia da estrategia revisional ALETIS.',
}

export const MCR_2_8: MCRSecao = {
  numero: '2-8',
  titulo: 'Limite de credito por produtor',
  capitulo: 'Capitulo 2 - Operacoes',
  ementa: 'Estabelece limites individuais por safra, por finalidade e por programa.',
  textoOficial:
    'Limites Plano Safra 2025/26: ' +
    'PRONAF custeio: ate R$ 250.000 por safra (3% para alimentos, 2% agroecologia/organicos); ' +
    'PRONAF investimento: ate R$ 165.000; PRONAF Mais Alimentos: ate R$ 250.000 (4% a.a.); ' +
    'PRONAMP custeio: ate R$ 1.500.000 (10% a.a.); PRONAMP investimento: ate R$ 880.000 (10,5% a.a.); ' +
    'EMPRESARIAL custeio: ate R$ 5.000.000 (8,5%-14% a.a. conforme programa); ' +
    'EMPRESARIAL investimento: ate R$ 12.000.000 (10,5%-13,5% a.a.).',
  aplicacaoPratica:
    'Em propostas, validar se o cliente atende aos novos limites. Quando enquadrado em Pronaf/Pronamp e foi tratado ' +
    'como empresarial (taxa maior), cabe revisao com base no Estatuto da Terra e Lei 4.829/65.',
  exemplosUso: [
    'Produtor com DAP/CAF Pronaf cobrado a 14% a.a. - revisao para 3%-10% conforme enquadramento',
    'Validar Bloco de Notas / receita bruta para enquadramento Pronamp',
  ],
  resolucoesRelacionadas: ['CMN 5.229/2025', 'CMN 5.234/2025', 'Decreto 9.064/2017 (DAP)', 'Lei 11.326/2006 (Pronaf)'],
  vigencia: 'vigente para safra 2025/26 (julho/2025 a junho/2026)',
}

export const MCR_3_2: MCRSecao = {
  numero: '3-2',
  titulo: 'Prorrogacao de pagamento',
  capitulo: 'Capitulo 3 - Custeio',
  ementa: 'Distinta do alongamento - prorrogacao e adiamento simples do vencimento.',
  textoOficial:
    'Quando, na epoca de pagamento da operacao de custeio, o mutuario nao puder amortizar a divida em razao de ' +
    'circunstancias adversas comprovaveis, e admitida a prorrogacao por ate 1 ciclo produtivo, mantendo-se ' +
    'as condicoes originais de taxa e garantias.',
  aplicacaoPratica:
    'Diferenca chave: ' +
    'PRORROGACAO = adia vencimento, mantem taxa original (curto prazo); ' +
    'ALONGAMENTO = reestrutura toda a divida, novo cronograma, pode incluir capitalizacao de juros vencidos (longo prazo).',
  exemplosUso: [
    'Custeio com vencimento em 30/06/2026 e quebra de safra documentada - prorrogar para 30/06/2027 mantendo 7,5% a.a.',
  ],
  resolucoesRelacionadas: ['CMN 5.229/2025'],
  vigencia: 'vigente',
}

export const MCR_6_2: MCRSecao = {
  numero: '6-2',
  titulo: 'Recursos Obrigatorios (DR/MCR)',
  capitulo: 'Capitulo 6 - Recursos',
  ementa:
    'Estabelece o regime de Direcionamento de Recursos (35% dos depositos a vista para credito rural) e taxas ' +
    'minimas obrigatorias.',
  textoOficial:
    'Bancos comerciais devem direcionar percentual minimo dos depositos a vista para operacoes de credito rural ' +
    '(atualmente 35%) com taxas controladas - faixa geral 8,5%-14% a.a.. ' +
    'Cumprimento desse direcionamento gera incentivo regulatorio (compulsorio reduzido).',
  aplicacaoPratica:
    'Em revisao, verificar se o contrato foi celebrado com recursos do MCR ou recursos livres - taxa de mercado ' +
    'aplicada em recursos do MCR caracteriza ABUSIVIDADE com base no spread regulamentar.',
  exemplosUso: [
    'Operacao com indicacao de fonte FCO/FNE/FNO ou Recursos Obrigatorios cobrada acima de 14% a.a. - revisao cabivel',
  ],
  resolucoesRelacionadas: ['CMN 5.229/2025', 'CMN 4.967/2021', 'Resolucao 4.625/2017'],
  vigencia: 'vigente',
}

export const MCR_7_1: MCRSecao = {
  numero: '7-1',
  titulo: 'Encargos financeiros - taxas e bonus',
  capitulo: 'Capitulo 7 - Encargos',
  ementa: 'Define taxas maximas por programa e fonte de recursos.',
  textoOficial:
    'Tabela vigente Plano Safra 2025/26 (a partir 01/07/2025): ' +
    'PRONAF B: 0,5% a.a.; PRONAF Custeio Alimentos: 3% a.a.; PRONAF Agroecologico/Organico: 2% a.a.; ' +
    'PRONAF Mulher: 4% a.a.; PRONAF Mais Alimentos: 4% a.a.; ' +
    'PRONAMP Custeio: 10% a.a.; PRONAMP Investimento: 10,5% a.a.; ' +
    'EMPRESARIAL Custeio: 8,5% a.a. (alimentos basicos), 14% a.a. (faixa geral); ' +
    'EMPRESARIAL Investimento (Moderfrota, ABC, Inovagro, Pronamp Inv): 10,5%-13,5% a.a.; ' +
    'Funcafe: 11% a.a.; PCA (armazenagem): 8,5% a.a.',
  aplicacaoPratica:
    'Comparar taxa contratual com tabela vigente na data da contratacao. Spread superior a 4 p.p. acima do ' +
    'limite regulamentar configura abusividade na linha equalizada.',
  exemplosUso: [
    'Contrato Pronamp custeio 2024 a 16% a.a. quando teto era 8% a.a. - revisao com restituicao em dobro',
    'Bonus de adimplencia (5% sobre juros) deve ser concedido em contratos de Pronaf - reivindicar quando suprimido',
  ],
  resolucoesRelacionadas: ['CMN 5.229/2025', 'CMN 5.234/2025'],
  vigencia: 'safra 2025/26',
}

export const MCR_7_4: MCRSecao = {
  numero: '7-4',
  titulo: 'Encargos por inadimplencia (mora)',
  capitulo: 'Capitulo 7 - Encargos',
  ementa: 'Define teto para mora e multa em contratos rurais.',
  textoOficial:
    'Em caso de inadimplemento, a instituicao financeira pode cobrar: ' +
    '(I) juros remuneratorios contratuais ate o vencimento; ' +
    '(II) juros de mora de ate 1% a.a. sobre saldo devedor (NAO 1% a.m.); ' +
    '(III) multa de ate 10% sobre o valor da prestacao vencida (Lei 4.829/65, art. 5o, §3o); ' +
    '(IV) atualizacao monetaria pela TR ou indice contratual.',
  aplicacaoPratica:
    'ATENCAO: em credito rural a mora e de 1% AO ANO (nao ao mes como em credito comum) e a multa e de 10% ' +
    '(nao 2% como CDC). Cobranca de mora a 1% a.m. ou multa a 2% em contratos rurais e abusiva.',
  exemplosUso: [
    'Contrato cobrando mora de 1% a.m. em CPR - revisar para 1% a.a. com restituicao do excedente',
    'Multa contratual de 2% em cedula rural - aumentar para 10% NAO se aplica (limite e teto, nao piso)',
  ],
  resolucoesRelacionadas: ['Lei 4.829/65', 'Decreto-Lei 167/67', 'CMN 5.229/2025'],
  vigencia: 'vigente',
  observacoesAletis:
    'Erro frequente de bancos: aplicar mora de 1% a.m. (regra geral) em vez de 1% a.a. (regra rural). ' +
    'Verificar TODA cedula rural para esse erro - gera substancial reducao do saldo devedor.',
}

export const MCR_8: MCRSecao = {
  numero: '8',
  titulo: 'Garantias',
  capitulo: 'Capitulo 8 - Garantias',
  ementa: 'Tipos de garantias admitidas em operacoes de credito rural.',
  textoOficial:
    'Sao admitidas em credito rural: ' +
    '(I) penhor agricola (lavoura formada ou a formar); ' +
    '(II) penhor pecuario (semoventes); ' +
    '(III) hipoteca de imovel rural; ' +
    '(IV) alienacao fiduciaria de maquinas, equipamentos e veiculos; ' +
    '(V) cessao fiduciaria de CPR/recebiveis; ' +
    '(VI) aval de terceiros (vedado fianca prestada por instituicao financeira como garantia adicional onerosa); ' +
    '(VII) seguro rural ou Proagro como complemento.',
  aplicacaoPratica:
    'Reforcamentos sucessivos de garantia em renegociacoes podem caracterizar abuso - especialmente quando ' +
    'incluem matricula nao constante do contrato original. Revisar se houve consentimento expresso e equivalencia.',
  exemplosUso: [
    'Caso AILTON: matricula 28742 dada em garantia em renegociacao - acordo tripartite com Sicredi para liberacao',
    'Vedacao de cobranca de tarifa de avaliacao de garantia em contratos com recursos do MCR',
  ],
  resolucoesRelacionadas: ['CMN 5.229/2025', 'Lei 8.929/94 (CPR)', 'Decreto-Lei 167/67'],
  vigencia: 'vigente',
}

export const MCR_16_PROAGRO: MCRSecao = {
  numero: '16',
  titulo: 'Proagro - Programa de Garantia da Atividade Agropecuaria',
  capitulo: 'Capitulo 16 - Proagro',
  ementa:
    'Sistema publico de cobertura de perdas em lavouras e investimentos rurais financiados, gerido pelo Bacen.',
  textoOficial:
    'O Proagro garante exoneracao de obrigacoes financeiras relativas a operacao de credito rural cuja ' +
    'liquidacao seja dificultada por: (I) fenomenos naturais; (II) pragas e doencas que atinjam bens financiados; ' +
    '(III) liquidacao de investimentos prejudicados pelos fatos acima. ' +
    'NOVOS LIMITES (vigor 2025/26): ' +
    '- Limite por enquadramento: R$ 200.000 (reduzido de R$ 270.000); ' +
    '- Cobertura: ate 75% das perdas verificadas; ' +
    '- Adicional Proagro Mais (Pronaf): ate 90% de cobertura; ' +
    '- Orcamento aprovado 2026: R$ 6,61 bilhoes.',
  aplicacaoPratica:
    'NOVO BLOQUEIO POR HISTORICO (vigor 2025/26): produtor sera EXCLUIDO do Proagro se atender simultaneamente: ' +
    '(1) tres ou mais enquadramentos por perdas em ate 5 safras; ' +
    '(2) percentual indenizacao acima de 60% da soma das coberturas; ' +
    '(3) valor total indenizado superior a R$ 250.000. ' +
    'Estima-se 116 mil produtores excluidos sob nova regra. ' +
    'IMPORTANTE: laudo Proagro e prova robusta para invocar Sumula 298 STJ mesmo se nao houver indenizacao.',
  exemplosUso: [
    'Cliente sem indenizacao por bloqueio do Proagro - usar laudo tecnico SENAR/EMATER como prova alternativa',
    'Caso AILTON: 4 safras consecutivas com perdas - bloqueio Proagro 2025 - alongamento via MCR 2-6-4 + Sumula 298',
  ],
  resolucoesRelacionadas: ['CMN 5.224/2025', 'CMN 5.227/2025', 'Lei 8.171/91 (Politica Agricola)'],
  vigencia: 'safra 2025/26 com novas restricoes',
  observacoesAletis:
    'O endurecimento das regras do Proagro 2025/26 aumenta drasticamente a relevancia de instrumentos ' +
    'extrajudiciais e judiciais (alongamento via Sumula 298, dacao em pagamento, acordo tripartite). ' +
    'ALETIS deve ser referencia em ofertar essa engenharia financeira para os 116 mil produtores excluidos.',
}

/* ---------------------------------------------------------------- *
 *  EXPORT CONSOLIDADO
 * ---------------------------------------------------------------- */

export const MCR_SECOES: Record<string, MCRSecao> = {
  '2-1': MCR_2_1,
  '2-6-4': MCR_2_6_4,
  '2-8': MCR_2_8,
  '3-2': MCR_3_2,
  '6-2': MCR_6_2,
  '7-1': MCR_7_1,
  '7-4': MCR_7_4,
  '8': MCR_8,
  '16': MCR_16_PROAGRO,
}

export function buscarMCRPorTema(tema: string): MCRSecao[] {
  const t = tema.toLowerCase()
  return Object.values(MCR_SECOES).filter(
    s =>
      s.titulo.toLowerCase().includes(t) ||
      s.ementa.toLowerCase().includes(t) ||
      s.aplicacaoPratica.toLowerCase().includes(t),
  )
}

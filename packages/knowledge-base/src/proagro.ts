/**
 * ALETIS - Knowledge Base
 * PROAGRO - Programa de Garantia da Atividade Agropecuaria
 *
 * Fontes:
 *  - Resolucao CMN 5.224/2025 (regulamento geral)
 *  - Resolucao CMN 5.227/2025 (Proagro Mais Pronaf)
 *  - Lei 8.171/91 (Politica Agricola)
 *  - MCR Capitulo 16 (operacionalizacao Bacen)
 */

export interface CulturaProagro {
  cultura: string
  uf: string[]
  janelaPlantio: { inicio: string; fim: string }[]
  cicloMedioDias: number
  riscoClimaticoPredominante: string[]
  cobertura: number // %
  observacoes: string
}

export const PROAGRO_REGRAS_2025_26 = {
  vigencia: 'safra 2025/26 (jul/2025 a jun/2026)',
  resolucaoBase: 'CMN 5.224/2025',
  orcamentoTotal2026: 6_610_000_000, // R$ 6,61 bi
  limites: {
    valorEnquadramentoMaximo: 200_000, // antes era 270.000
    coberturaPercentualBase: 75, // % das perdas verificadas
    coberturaPronafBase: 90, // % no Proagro Mais Pronaf
    adicionalAgriculturaFamiliar: 5, // p.p. adicional para Pronaf
  },
  bloqueioReincidente: {
    aplicavel: true,
    descricao:
      'Produtor sera EXCLUIDO automaticamente do Proagro se atender simultaneamente os 3 criterios:',
    criterios: [
      {
        numero: 1,
        descricao: 'Tres ou mais enquadramentos por perdas em ate 5 safras',
        objetivo: 'Identificar produtores com risco sistemico (zona inadequada ou manejo deficiente)',
      },
      {
        numero: 2,
        descricao: 'Percentual de indenizacao acima de 60% da soma das coberturas concedidas',
        objetivo: 'Limitar concentracao de pagamento em poucos produtores',
      },
      {
        numero: 3,
        descricao: 'Valor total indenizado superior a R$ 250.000',
        objetivo: 'Excluir produtores ja amplamente indenizados (sustentabilidade fiscal)',
      },
    ],
    estimativaProdutoresAfetados: 116_000,
    impactoFinanceiro:
      'Aproximadamente R$ 2,8 bi em coberturas perdidas. Estes produtores precisarao buscar seguro privado ' +
      '(taxas 8-15% do capital segurado) ou suportar o risco totalmente.',
  },
  prerequisitos: {
    car: 'Cadastro Ambiental Rural ATIVO obrigatorio',
    zarc: 'Plantio na janela do Zoneamento Agricola de Risco Climatico',
    capacidadeProdutiva: 'Comprovacao de tecnica adequada (laudo agronomico)',
    seguroPrivado: 'Vedacao de cumulacao com seguro rural privado para mesma cobertura',
  },
  zarcCriterios: {
    descricao:
      'Janela de plantio definida pela Embrapa para cada par {cultura, municipio} - probabilidade de perda ' +
      'climatica adversa abaixo de 20%, 30% ou 40% (3 niveis de risco).',
    consequenciaPlantioForaJanela: 'Perda total de cobertura Proagro',
    fonteConsulta: 'https://indicadores.agricultura.gov.br/zarc/',
  },
  custoAdesao: {
    aliquotaSobreFinanciamento: 'percentual variavel conforme cultura/regiao (entre 1% e 8,5% do valor financiado)',
    formaPagamento: 'descontado no momento da liberacao do credito',
    incidenciaIof: 'isento conforme Decreto 6.306/07',
  },
  documentacaoSinistro: [
    'Comunicado de Ocorrencia (COR) em ate 10 dias corridos da ocorrencia',
    'Laudo tecnico assinado por profissional habilitado (CREA/CRBio)',
    'Boletins meteorologicos (INMET) para eventos climaticos',
    'Notas fiscais de insumos aplicados (comprovar manejo correto)',
    'Demonstrativo de perdas (talhao, ha afetada, %)',
    'CAR e ART do projeto agronomico',
  ],
  prazoLiquidacao: 'ate 90 dias da entrega do laudo tecnico final',
}

export const CULTURAS_PROAGRO: CulturaProagro[] = [
  {
    cultura: 'Soja',
    uf: ['MT', 'PR', 'RS', 'GO', 'MS', 'BA', 'MA', 'TO', 'PI', 'MG', 'SP'],
    janelaPlantio: [
      { inicio: '2025-09-15', fim: '2026-01-31' },
    ],
    cicloMedioDias: 130,
    riscoClimaticoPredominante: ['veranico (deficit hidrico)', 'granizo', 'excesso de chuva na colheita'],
    cobertura: 75,
    observacoes:
      'Soja safra 2025/26: producao estimada 169 milhoes de toneladas (+8% vs 2024/25). ' +
      'Veranico em MS/MT em nov-dez/2025 ja causou perdas de 20-30% em areas pontuais.',
  },
  {
    cultura: 'Milho 1a safra',
    uf: ['RS', 'PR', 'SC', 'MG', 'SP', 'GO'],
    janelaPlantio: [{ inicio: '2025-08-15', fim: '2025-12-15' }],
    cicloMedioDias: 140,
    riscoClimaticoPredominante: ['estiagem', 'cigarrinha-do-milho', 'helminthosporium'],
    cobertura: 75,
    observacoes: 'Milho 1a safra (verao) - 30% da producao nacional. Mais suscetivel a riscos climaticos no SUL.',
  },
  {
    cultura: 'Milho 2a safra (safrinha)',
    uf: ['MT', 'PR', 'GO', 'MS', 'SP'],
    janelaPlantio: [{ inicio: '2026-01-15', fim: '2026-03-15' }],
    cicloMedioDias: 130,
    riscoClimaticoPredominante: ['estiagem (final do ciclo)', 'geadas tardias (PR, MS)'],
    cobertura: 75,
    observacoes:
      'Safrinha responde por 70% da producao nacional. Janela apertada - plantio fora compromete cobertura. ' +
      'Geadas em jul/2024 causaram perdas em PR e MS.',
  },
  {
    cultura: 'Algodao',
    uf: ['MT', 'BA', 'GO', 'MS'],
    janelaPlantio: [{ inicio: '2025-12-01', fim: '2026-02-15' }],
    cicloMedioDias: 180,
    riscoClimaticoPredominante: ['estiagem prolongada', 'bicudo do algodoeiro', 'lagarta-helicoverpa'],
    cobertura: 75,
    observacoes: 'Cultura de alto valor agregado. Producao Brasil 2025/26: 4,2 milhoes ton (3o produtor mundial).',
  },
  {
    cultura: 'Arroz irrigado',
    uf: ['RS', 'SC'],
    janelaPlantio: [{ inicio: '2025-09-01', fim: '2025-12-15' }],
    cicloMedioDias: 130,
    riscoClimaticoPredominante: ['enchente (tem ocorrido em RS desde 2024)', 'frio na floracao'],
    cobertura: 75,
    observacoes:
      'RS responde por 70% do arroz nacional. Enchentes mai/2024 causaram perda historica - safra 2025/26 ' +
      'em recuperacao com producao estimada 11,5 milhoes ton.',
  },
  {
    cultura: 'Cafe arabica',
    uf: ['MG', 'ES', 'SP', 'BA', 'PR'],
    janelaPlantio: [{ inicio: '2025-10-01', fim: '2026-03-31' }],
    cicloMedioDias: 730, // bienalidade
    riscoClimaticoPredominante: ['geada (MG)', 'estiagem prolongada', 'broca do cafeeiro'],
    cobertura: 75,
    observacoes:
      'Cafe arabica 2025/26: producao estimada 39 milhoes de sacas. Brasil mantem lideranca mundial. ' +
      'Estiagem em ES/MG em 2024 reduziu producao em ate 15%.',
  },
  {
    cultura: 'Cana-de-acucar',
    uf: ['SP', 'GO', 'MG', 'MS', 'PR', 'AL', 'PE'],
    janelaPlantio: [
      { inicio: '2025-09-01', fim: '2025-11-30' }, // cana de ano-e-meio
      { inicio: '2026-01-15', fim: '2026-04-15' }, // cana de ano
    ],
    cicloMedioDias: 365,
    riscoClimaticoPredominante: ['queimadas (SP/GO 2024)', 'estiagem prolongada', 'broca-da-cana'],
    cobertura: 75,
    observacoes:
      'Producao 2025/26 estimada em 600 milhoes de toneladas. Incendios em SP em 2024 destruiram 1,5 milhao ' +
      'de ha de canaviais - reposicao em curso na safra 2025/26.',
  },
  {
    cultura: 'Trigo',
    uf: ['PR', 'RS', 'SC', 'GO', 'MG', 'BA'],
    janelaPlantio: [
      { inicio: '2025-04-15', fim: '2025-08-15' }, // safra 2025
      { inicio: '2026-04-15', fim: '2026-08-15' }, // safra 2026
    ],
    cicloMedioDias: 120,
    riscoClimaticoPredominante: ['geadas', 'excesso de chuva no enchimento', 'giberella'],
    cobertura: 75,
    observacoes: 'Trigo 2025/26 expansao no cerrado (BA, MG, GO). Producao nacional ainda inferior a demanda interna.',
  },
  {
    cultura: 'Feijao 1a safra (das aguas)',
    uf: ['PR', 'MG', 'BA', 'SP', 'GO'],
    janelaPlantio: [{ inicio: '2025-08-15', fim: '2025-11-30' }],
    cicloMedioDias: 90,
    riscoClimaticoPredominante: ['estiagem', 'mofo branco', 'mosca-branca'],
    cobertura: 75,
    observacoes: 'Cultura prioritaria para seguranca alimentar - taxa Pronaf 3% a.a. para alimentos basicos.',
  },
]

export function avaliarBloqueioProagro(historico: { ano: number; enquadrado: boolean; valorIndenizado?: number; coberturaConcedida?: number }[]): {
  bloqueado: boolean
  motivos: string[]
  detalhes: { criterio: number; atendido: boolean; valor: string }[]
} {
  // Considera apenas ultimas 5 safras
  const ultimas5 = [...historico].sort((a, b) => b.ano - a.ano).slice(0, 5)

  const enquadramentos = ultimas5.filter(h => h.enquadrado).length
  const totalIndenizado = ultimas5.reduce((s, h) => s + (h.valorIndenizado || 0), 0)
  const totalCobertura = ultimas5.reduce((s, h) => s + (h.coberturaConcedida || 0), 0)
  const percIndenizado = totalCobertura > 0 ? (totalIndenizado / totalCobertura) * 100 : 0

  const c1 = enquadramentos >= 3
  const c2 = percIndenizado > 60
  const c3 = totalIndenizado > 250_000

  const bloqueado = c1 && c2 && c3
  const motivos: string[] = []
  if (c1) motivos.push(`${enquadramentos} enquadramentos em ${ultimas5.length} safras (limite: 3)`)
  if (c2) motivos.push(`Indenizacao = ${percIndenizado.toFixed(1)}% das coberturas (limite: 60%)`)
  if (c3) motivos.push(`Total indenizado R$ ${totalIndenizado.toLocaleString('pt-BR')} (limite: R$ 250.000)`)

  return {
    bloqueado,
    motivos,
    detalhes: [
      { criterio: 1, atendido: c1, valor: `${enquadramentos} enquadramentos` },
      { criterio: 2, atendido: c2, valor: `${percIndenizado.toFixed(1)}%` },
      { criterio: 3, atendido: c3, valor: `R$ ${totalIndenizado.toLocaleString('pt-BR')}` },
    ],
  }
}

export function buscarCulturaProagro(cultura: string, uf: string): CulturaProagro | undefined {
  return CULTURAS_PROAGRO.find(c => c.cultura.toLowerCase().includes(cultura.toLowerCase()) && c.uf.includes(uf.toUpperCase()))
}

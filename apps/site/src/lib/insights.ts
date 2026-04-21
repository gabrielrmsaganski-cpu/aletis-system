/**
 * Catálogo editorial da ALETIS — insights de mercado e teses técnicas.
 * Cada artigo vive aqui para ser renderizado pela listagem e pela página de detalhe.
 */

export type InsightCategoria =
  | 'reestruturacao'
  | 'revisional'
  | 'mercado'
  | 'tecnologia'
  | 'tese'

export interface InsightBlock {
  type: 'paragrafo' | 'h2' | 'h3' | 'lista' | 'citacao' | 'destaque'
  content: string | string[]
}

export interface Insight {
  slug: string
  titulo: string
  resumo: string
  categoria: InsightCategoria
  autor: string
  autorRole: string
  publicadoEm: string
  leituraMin: number
  tags: string[]
  corpo: InsightBlock[]
}

export const categoriasLabel: Record<InsightCategoria, string> = {
  reestruturacao: 'Reestruturação',
  revisional: 'Revisional',
  mercado: 'Mercado',
  tecnologia: 'Tecnologia',
  tese: 'Tese ALETIS',
}

export const insights: Insight[] = [
  {
    slug: 'descaracterizacao-credito-rural-2026',
    titulo:
      'Descaracterização do crédito rural: o ponto cego que vale 30% do saldo devedor',
    resumo:
      'A Resolução BCB 4.966/21 redesenhou a fronteira entre crédito rural e crédito comercial. Quem ignora esse recorte paga mais — e tem um argumento revisional esperando auditoria.',
    categoria: 'revisional',
    autor: 'Christian Kohler',
    autorRole: 'Diretor-fundador · ALETIS',
    publicadoEm: '2026-04-05',
    leituraMin: 7,
    tags: ['crédito rural', 'revisional', 'Res. BCB 4.966/21', 'Súmula 93'],
    corpo: [
      {
        type: 'paragrafo',
        content:
          'Em quase toda mesa que abrimos na ALETIS, o primeiro contrato analisado carrega uma cicatriz silenciosa: foi contratado como crédito rural, mas já não se comporta como tal. Os encargos subiram, a taxa efetiva rompeu o teto do programa oficial, a destinação sofreu desvio. Esse é o terreno onde a descaracterização nasce — e onde se encontra, tipicamente, 20% a 30% de redução direta no saldo devedor.',
      },
      {
        type: 'h2',
        content: 'O que a Res. BCB 4.966/21 realmente disse',
      },
      {
        type: 'paragrafo',
        content:
          'A resolução reorganizou a classificação de operações de crédito sob a ótica de risco, mas sua consequência prática mais relevante para o produtor é outra: ao exigir governança e rastreabilidade na aplicação dos recursos, ela evidenciou descasamentos que antes passavam batidos. Contratos com taxa acima do PRONAMP/PRONAF da safra, sem comprovação de destinação, passam a admitir questionamento sob o prisma da descaracterização.',
      },
      {
        type: 'h2',
        content: 'A base jurídica não é nova — a disciplina técnica é',
      },
      {
        type: 'paragrafo',
        content:
          'As Súmulas STJ 93, 296 e 541 já pavimentam há décadas o argumento contra a capitalização mensal e a cobrança de encargos em duplicidade nos contratos rurais. O que mudou foi a expectativa probatória: hoje, sem memória de cálculo auditável que mostre o desvio em relação à taxa subsidiada contemporânea, o argumento não se sustenta.',
      },
      {
        type: 'destaque',
        content:
          'Toda tese revisional que entra na mesa ALETIS passa por três filtros: taxa contra o PRONAMP da data do contrato, reconstituição do saldo sem anatocismo e reclassificação de encargos acessórios. Sem os três, não abrimos negociação.',
      },
      {
        type: 'h2',
        content: 'Como saber se o seu contrato admite a tese',
      },
      {
        type: 'paragrafo',
        content:
          'O detector de abusividade da ALETIS faz o teste em menos de dois minutos e devolve um score 0–100 com estimativa de recuperação. Mas o score é só o farol: a decisão de ingressar ou não exige auditoria cirúrgica sobre o contrato, o extrato e o fluxo de desembolsos.',
      },
      {
        type: 'lista',
        content: [
          'Taxa contratada ≥ 3 p.p. acima do PRONAMP da safra → forte indício',
          'Capitalização mensal em contrato classificado como rural → indício direto',
          'Recursos desviados da destinação original → descaracterização clássica',
          'Cobrança de tarifas sobre operação de crédito rural → questionável',
        ],
      },
      {
        type: 'h2',
        content: 'O custo de ignorar',
      },
      {
        type: 'paragrafo',
        content:
          'Em casos auditados pela nossa mesa em 2025, a diferença entre renegociar com e sem tese revisional em pauta foi, em média, 27% no saldo final negociado. Para um produtor com R$ 10 milhões em exposição, isso é R$ 2,7 milhões que ficam dentro da porteira — ou fora dela.',
      },
      {
        type: 'citacao',
        content:
          'O produtor brasileiro não perdeu negócios por incompetência operacional. Perdeu porque a mesa bancária tinha argumento técnico que o outro lado não soube responder. A ALETIS existe para inverter isso.',
      },
    ],
  },
  {
    slug: 'dscr-safra-brasileiro',
    titulo:
      'DSCR no ciclo de safra: por que a métrica global precisa de um ajuste tropical',
    resumo:
      'Importar o DSCR corporativo para o agro sem adaptar gera plano que quebra no primeiro stress climático. Três cortes que fazem o indicador virar decisão.',
    categoria: 'reestruturacao',
    autor: 'Mesa técnica ALETIS',
    autorRole: 'Inteligência financeira',
    publicadoEm: '2026-03-22',
    leituraMin: 6,
    tags: ['DSCR', 'safra', 'reestruturação', 'stress test'],
    corpo: [
      {
        type: 'paragrafo',
        content:
          'O Debt Service Coverage Ratio é o indicador mais usado em mesa de reestruturação no mundo inteiro. No agro brasileiro, aplicar a fórmula nua — EBITDA sobre serviço da dívida — produz uma leitura que o produtor sabe que não é verdade. Tem sazonalidade, tem basis regional, tem risco climático, tem CPR vendida que já antecipou receita.',
      },
      {
        type: 'h2',
        content: 'Corte 1 — Receita líquida de CPR, não bruta',
      },
      {
        type: 'paragrafo',
        content:
          'A receita que entra no numerador do DSCR rural precisa ser líquida do que já foi comercializado via CPR. Caso contrário, o indicador superestima caixa que não está mais disponível para pagar dívida. Em mesa, isso vira default no segundo ano.',
      },
      {
        type: 'h2',
        content: 'Corte 2 — Stress de 15% é piso, não teto',
      },
      {
        type: 'paragrafo',
        content:
          'Nossa metodologia exige que o plano sobreviva a um stress de 15% sobre receita com DSCR ≥ 1,25. Histórico climático Brasil (2004, 2012, 2021) mostra que 15% é moderado; em mesas com exposição concentrada em uma única cultura, trabalhamos com 20%.',
      },
      {
        type: 'destaque',
        content:
          'Plano que só fecha na hipótese central é plano que já nasceu perdido. A ALETIS fecha a proposta com credor somente quando o cenário stress mantém cobertura.',
      },
      {
        type: 'h2',
        content: 'Corte 3 — Despesas fixas sazonais não são fixas',
      },
      {
        type: 'paragrafo',
        content:
          'Arrendamento indexado a saca, seguros contratados por safra, mão de obra safrista: tudo isso distorce o conceito de despesa fixa. No modelo ALETIS, classificamos com granularidade mensal e estressamos separadamente. O resultado é um DSCR honesto — e um plano que chega ao último ano sem precisar ser renegociado.',
      },
    ],
  },
  {
    slug: 'basis-microregional-e-timing',
    titulo:
      'Basis microrregional: o preço da desinformação na comercialização de safra',
    resumo:
      'O produtor que vende no dia do vencimento sem olhar basis perde margem por estrutura. Um breve guia sobre o gap que separa commodity de caixa.',
    categoria: 'mercado',
    autor: 'Mesa de mercado ALETIS',
    autorRole: 'Inteligência de mercado',
    publicadoEm: '2026-03-08',
    leituraMin: 5,
    tags: ['basis', 'comercialização', 'timing', 'soja'],
    corpo: [
      {
        type: 'paragrafo',
        content:
          'O mercado de grãos tem dois preços simultâneos: o futuro na Bolsa (Chicago ou B3) e o spot físico na microrregião onde a saca será entregue. A diferença — o basis — é uma variável estrutural, não um ruído. Ignorá-lo é assinar perda de 6% a 12% ao ano sobre o faturamento.',
      },
      {
        type: 'h2',
        content: 'Por que basis não é noise',
      },
      {
        type: 'paragrafo',
        content:
          'Basis reflete logística (frete até o porto), estoque local, contratos forward regionais e demanda doméstica. Em janelas curtas o basis pode virar o principal driver de preço — mais relevante que o movimento do futuro em dólar.',
      },
      {
        type: 'lista',
        content: [
          'Soja Sorriso/MT × CBOT: histórico 2020-2025 mostra janelas de -18% a +4%',
          'Milho Rio Verde/GO × B3: volatilidade estrutural próxima de 25% ao ano',
          'Trigo Paraná × Rosário: abertura logística reduz basis em janelas específicas',
        ],
      },
      {
        type: 'h2',
        content: 'A decisão prática',
      },
      {
        type: 'paragrafo',
        content:
          'Nossa recomendação estrutural: monitorar basis semanalmente por microrregião, travar parcelas da produção quando o basis estiver no primeiro quartil histórico, e evitar vendas forçadas em momentos de basis comprimido. A ALETIS entrega esse painel aos clientes do plano de inteligência de mercado.',
      },
    ],
  },
  {
    slug: 'alix-ia-aplicada-ao-agro',
    titulo:
      'ALIX: por que uma IA de agro precisa de metodologia antes de modelo',
    resumo:
      'Treinar LLM com contratos rurais não basta. A ALIX nasceu da premissa oposta: metodologia primeiro, modelo depois. O que isso muda na mesa.',
    categoria: 'tecnologia',
    autor: 'Time de produto ALETIS',
    autorRole: 'Tecnologia proprietária',
    publicadoEm: '2026-02-14',
    leituraMin: 6,
    tags: ['IA', 'ALIX', 'tecnologia', 'contratos'],
    corpo: [
      {
        type: 'paragrafo',
        content:
          'Todo mundo está treinando modelo com PDF de contrato. Poucos perguntam a pergunta que importa: qual metodologia o modelo está reproduzindo? Um LLM é um espelho: devolve o raciocínio que viu. Se o raciocínio da fonte é raso, o output é raso.',
      },
      {
        type: 'h2',
        content: 'O que é a ALIX',
      },
      {
        type: 'paragrafo',
        content:
          'ALIX é a IA interna da ALETIS. Não substitui o consultor sênior — pensa junto com ele. Foi treinada em cima da metodologia ALETIS: auditoria de contrato rural, mapeamento de abusividade, construção de cenários de DSCR e geração de peças jurídicas iniciais.',
      },
      {
        type: 'h2',
        content: 'O que ela faz hoje',
      },
      {
        type: 'lista',
        content: [
          'Triagem de contratos em minutos com score revisional inicial',
          'Geração de memória de cálculo em formato auditável',
          'Resposta consultiva ao cliente 24/7 em canais internos',
          'Cruzamento automático com Súmulas STJ e Res. BCB pertinentes',
        ],
      },
      {
        type: 'destaque',
        content:
          'Velocidade na triagem faz diferença entre caso viável e caso perdido. A ALIX reduziu o tempo médio de diagnóstico inicial de 5 dias para 4 horas — sem perder rigor técnico.',
      },
      {
        type: 'h2',
        content: 'O que ela não faz',
      },
      {
        type: 'paragrafo',
        content:
          'Nenhuma decisão final passa sem revisão humana sênior. A ALIX é um amplificador de mesa, não uma mesa autônoma. Essa fronteira é deliberada — e é o que separa tecnologia responsável de atalho arriscado.',
      },
    ],
  },
  {
    slug: 'superendividamento-produtor-rural',
    titulo:
      'Lei 14.181/21 no agro: o produtor rural é consumidor superendividado?',
    resumo:
      'A tese é menos óbvia do que parece e mais poderosa do que o mercado reconheceu. Uma leitura cirúrgica do dispositivo aplicado ao crédito rural.',
    categoria: 'tese',
    autor: 'Christian Kohler',
    autorRole: 'Diretor-fundador · ALETIS',
    publicadoEm: '2026-01-30',
    leituraMin: 8,
    tags: ['Lei 14.181/21', 'superendividamento', 'produtor rural', 'tese'],
    corpo: [
      {
        type: 'paragrafo',
        content:
          'A Lei 14.181/21 alterou o CDC e criou o arcabouço do superendividamento no Brasil. Por mais de três anos, o mercado operou sob a premissa de que o produtor rural, como profissional do agro, ficava fora do perímetro da lei. Essa leitura está em revisão — e abre um flanco relevante para reestruturação.',
      },
      {
        type: 'h2',
        content: 'Quando o produtor é consumidor',
      },
      {
        type: 'paragrafo',
        content:
          'A doutrina consumerista reconhece que o enquadramento como consumidor depende do destino final do produto/serviço — não da atividade profissional do tomador. Um produtor pessoa física que contratou crédito pessoal para despesas familiares, veículo próprio ou educação dos filhos pode, sim, ser consumidor para aquele contrato específico.',
      },
      {
        type: 'h2',
        content: 'O que a tese abre',
      },
      {
        type: 'lista',
        content: [
          'Revisão integral das condições de crédito consumerista contratado por PF rural',
          'Direito à repactuação via mesa de superendividamento (arts. 104-A a 104-C CDC)',
          'Manutenção do mínimo existencial familiar independentemente do fluxo de safra',
          'Nulidade de cláusulas abusivas sob o regime consumerista',
        ],
      },
      {
        type: 'destaque',
        content:
          'Aplicar o regime de superendividamento ao perímetro correto da vida financeira do produtor — sem forçar enquadramento onde não cabe — é hoje uma das teses mais subutilizadas do mercado.',
      },
      {
        type: 'h2',
        content: 'O que ela NÃO abre',
      },
      {
        type: 'paragrafo',
        content:
          'Não é um atalho para reestruturar crédito rural típico (PRONAMP, PRONAF, BNDES Rural). Não é um guarda-chuva universal. Tentar forçar a tese onde ela não cabe corrói credibilidade e fecha portas. A ALETIS usa cirurgicamente: mapeia o que é consumerista dentro da exposição do cliente e trata esse recorte com o instrumento certo.',
      },
    ],
  },
  {
    slug: 'mesa-multi-credor-anatomia',
    titulo: 'Anatomia de uma mesa multi-credor: por que o formato define o desfecho',
    resumo:
      'Sentar cinco credores juntos é técnica, não sorte. Como a arquitetura da mesa conduz a convergência — e os seis erros que afundam a negociação.',
    categoria: 'reestruturacao',
    autor: 'Mesa técnica ALETIS',
    autorRole: 'Reestruturação',
    publicadoEm: '2026-01-12',
    leituraMin: 7,
    tags: ['multi-credor', 'negociação', 'reestruturação'],
    corpo: [
      {
        type: 'paragrafo',
        content:
          'Reestruturar dívida com um credor é negociação bilateral. Com cinco ou mais credores, é desenho institucional. O formato da mesa — quem senta, em que ordem, com que informação, sob qual sequência decisória — determina 80% do desfecho. Os outros 20% são o argumento técnico.',
      },
      {
        type: 'h2',
        content: 'Princípio 1 — Informação simétrica',
      },
      {
        type: 'paragrafo',
        content:
          'Toda mesa começa com o mesmo pacote de informação entregue aos credores no mesmo momento. Nunca um credor enxerga o plano antes do outro. Assimetria vira vantagem competitiva imediata do primeiro a ver — e afunda a convergência.',
      },
      {
        type: 'h2',
        content: 'Princípio 2 — Cenários, não proposta única',
      },
      {
        type: 'paragrafo',
        content:
          'A mesa abre com três cenários alternativos (central, conservador, stress), não com uma única proposta. Credor que entra em sala com uma proposta fechada na mão só tem dois movimentos: aceitar ou recusar. Com três cenários, há 12 eixos de negociação.',
      },
      {
        type: 'destaque',
        content:
          'Na mesa ALETIS, entre 2022 e 2025, 91% das convergências multi-credor foram construídas a partir de um cenário que não era o inicial. Flexibilidade estruturada é o que separa acordo de impasse.',
      },
      {
        type: 'h2',
        content: 'Os seis erros que afundam mesa multi-credor',
      },
      {
        type: 'lista',
        content: [
          'Começar pela proposta, não pelo diagnóstico',
          'Tratar cada credor isoladamente em sequência (abre corrida competitiva)',
          'Omitir exposição total do devedor (quando descoberto, queima confiança)',
          'Oferecer garantia sem mapa de prioridade entre credores',
          'Fechar acordo bilateral sem cláusula de equalização',
          'Não prever governança pós-acordo com DSCR mensal auditável',
        ],
      },
    ],
  },
]

export function getInsightBySlug(slug: string): Insight | undefined {
  return insights.find((i) => i.slug === slug)
}

export function getAllSlugs(): string[] {
  return insights.map((i) => i.slug)
}

export function getRelatedInsights(slug: string, max = 3): Insight[] {
  const current = getInsightBySlug(slug)
  if (!current) return []
  return insights
    .filter((i) => i.slug !== slug)
    .sort((a, b) => {
      const aMatch = a.categoria === current.categoria ? 1 : 0
      const bMatch = b.categoria === current.categoria ? 1 : 0
      if (aMatch !== bMatch) return bMatch - aMatch
      return b.publicadoEm.localeCompare(a.publicadoEm)
    })
    .slice(0, max)
}

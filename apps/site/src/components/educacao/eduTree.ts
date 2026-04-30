/**
 * Árvore canônica da seção Educação. Único ponto de verdade — usado pela
 * sidebar, pelo mapa do /educacao e pelo footer.
 */

export interface EduNode {
  label: string
  href: string
  desc?: string
  children?: EduNode[]
}

export const eduTree: EduNode[] = [
  {
    label: '1. Crédito Rural — base do agro',
    href: '/educacao/credito-rural',
    desc: 'O que é, fontes (controlados vs livres), modalidades e quem pode acessar.',
    children: [
      {
        label: 'Custeio (operação da safra)',
        href: '/educacao/credito-rural/custeio',
        desc: 'Insumos, mão de obra, despesas correntes — pago após a colheita.',
      },
      {
        label: 'Investimento (anos longos)',
        href: '/educacao/credito-rural/investimento',
        desc: 'Máquinas, irrigação, armazenagem, formação de pasto — 5 a 12 anos.',
      },
      {
        label: 'Comercialização',
        href: '/educacao/credito-rural/comercializacao',
        desc: 'EGF, FEPM, antecipação, EPR, PEPRO, contratos de opção.',
      },
      {
        label: 'Industrialização',
        href: '/educacao/credito-rural/industrializacao',
        desc: 'Para produtor que beneficia / industrializa a própria produção.',
      },
    ],
  },
  {
    label: '2. Programas oficiais',
    href: '/educacao/programas',
    desc: 'Tabelas, taxas, limites e públicos-alvo de cada programa do Plano Safra.',
    children: [
      { label: 'Pronaf — agricultura familiar', href: '/educacao/programas/pronaf' },
      { label: 'Pronamp — médio produtor', href: '/educacao/programas/pronamp' },
      { label: 'Moderfrota — máquinas', href: '/educacao/programas/moderfrota' },
      { label: 'Inovagro — inovação tecnológica', href: '/educacao/programas/inovagro' },
      { label: 'ABC+ — agricultura de baixo carbono', href: '/educacao/programas/abc-mais' },
      { label: 'PCA — armazenagem', href: '/educacao/programas/pca' },
      { label: 'Procap-Agro — capital de giro de cooperativas', href: '/educacao/programas/procap-agro' },
      { label: 'Funcafé — cafeicultor', href: '/educacao/programas/funcafe' },
      { label: 'Prodecoop — cooperativismo', href: '/educacao/programas/prodecoop' },
      { label: 'Moderagro — pecuária e fruticultura', href: '/educacao/programas/moderagro' },
      { label: 'Proirriga — irrigação inteligente', href: '/educacao/programas/proirriga' },
    ],
  },
  {
    label: '3. Instrumentos financeiros do agro',
    href: '/educacao/instrumentos',
    desc: 'Como o produtor capta fora do banco oficial — mercado privado de crédito agro.',
    children: [
      { label: 'CPR — Cédula de Produto Rural', href: '/educacao/instrumentos/cpr' },
      { label: 'CDA/WA — Warrant Agropecuário', href: '/educacao/instrumentos/cda-wa' },
      { label: 'LCA — Letra de Crédito do Agronegócio', href: '/educacao/instrumentos/lca' },
      { label: 'Fiagro — fundo de investimento', href: '/educacao/instrumentos/fiagro' },
      { label: 'CRA — Certificado de Recebíveis do Agro', href: '/educacao/instrumentos/cra' },
      { label: 'Barter — troca insumos por safra', href: '/educacao/instrumentos/barter' },
    ],
  },
  {
    label: '4. Renegociação de dívida',
    href: '/educacao/renegociacao',
    desc: 'O que existe, quem pode aderir, quanto desconta, qual o risco.',
    children: [
      { label: 'PGFN — transação tributária', href: '/educacao/renegociacao/pgfn-transacao' },
      { label: 'Prorrogação rural (Manual de Crédito Rural)', href: '/educacao/renegociacao/prorrogacao-rural' },
      { label: 'Refis e programas históricos', href: '/educacao/renegociacao/refis-historico' },
      { label: 'Cobrança abusiva — como reagir', href: '/educacao/renegociacao/abusividade' },
      { label: 'Execução fiscal e judicial', href: '/educacao/renegociacao/executivo-fiscal' },
    ],
  },
  {
    label: '5. Direitos do produtor',
    href: '/educacao/direitos',
    desc: 'Proteções legais que o produtor frequentemente desconhece.',
    children: [
      { label: 'Superendividamento (Lei 14.181/21)', href: '/educacao/direitos/superendividamento' },
      { label: 'Impenhorabilidade da pequena propriedade rural', href: '/educacao/direitos/impenhorabilidade-rural' },
      { label: 'Súmulas STJ que favorecem o produtor', href: '/educacao/direitos/sumulas-stj' },
      { label: 'CAR, ITR e IRPF — obrigações que protegem', href: '/educacao/direitos/car-itr-irpf' },
    ],
  },
  {
    label: '6. Anatomia do contrato',
    href: '/educacao/contrato',
    desc: 'Como ler, o que pode ser questionado, CET, IOF, encargos, Price vs SAC.',
  },
  {
    label: '7. Comparativos rápidos',
    href: '/educacao/comparativos',
    desc: 'Pronaf vs Pronamp · custeio vs investimento · CPR vs LCA · banco vs Fiagro.',
  },
]

export function flattenTree(): EduNode[] {
  const out: EduNode[] = []
  for (const n of eduTree) {
    out.push(n)
    if (n.children) out.push(...n.children)
  }
  return out
}

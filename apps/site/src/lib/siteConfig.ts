/**
 * Configuração central do site ALETIS — navegação, contato, SEO base.
 * Único ponto de verdade; qualquer alteração institucional passa aqui.
 */

export const siteConfig = {
  name: 'ALETIS',
  tagline: 'Finanças Estratégicas',
  shortDescription:
    'Inteligência financeira e estratégica para o agronegócio brasileiro.',
  longDescription:
    'A ALETIS conduz reestruturações de dívida, revisão de contratos rurais e diagnósticos financeiros para produtores, grupos e empresas do agro — com metodologia proprietária, tecnologia sob medida e visão integrada de mercado.',
  url: 'https://aletis.com.br',
  ogImage: '/og-aletis.png',
  locale: 'pt-BR',
  contact: {
    email: 'contato@aletis.com.br',
    telefone: '+55 (45) 9 9999-0000',
    whatsapp: '5545999990000',
    endereco: 'Cascavel · Paraná · Brasil',
  },
  social: {
    instagram: 'https://instagram.com/aletis.oficial',
    linkedin: 'https://linkedin.com/company/aletis',
  },
} as const

export const nav = {
  primary: [
    { label: 'Sobre', href: '/sobre' },
    { label: 'Soluções', href: '/solucoes' },
    { label: 'Para quem é', href: '/para-quem-e' },
    { label: 'Calculadoras', href: '/calculadoras' },
    { label: 'Insights', href: '/insights' },
    { label: 'Contato', href: '/contato' },
  ],
  footer: {
    empresa: [
      { label: 'Sobre a ALETIS', href: '/sobre' },
      { label: 'Metodologia', href: '/sobre#metodologia' },
      { label: 'Insights & Mercado', href: '/insights' },
      { label: 'Contato', href: '/contato' },
    ],
    solucoes: [
      { label: 'Reestruturação de dívida', href: '/solucoes#reestruturacao' },
      { label: 'Revisional & abusividade', href: '/solucoes#revisional' },
      { label: 'Inteligência de mercado', href: '/solucoes#mercado' },
      { label: 'CRM e automação', href: '/solucoes#tecnologia' },
      { label: 'ALIX — IA aplicada', href: '/solucoes#alix' },
    ],
    ferramentas: [
      { label: 'Simulador de reestruturação', href: '/calculadoras/reestruturacao' },
      { label: 'Capacidade de pagamento safra', href: '/calculadoras/capacidade-safra' },
      { label: 'Detector de abusividade', href: '/calculadoras/abusividade' },
    ],
    legal: [
      { label: 'Política de Privacidade', href: '/politica-privacidade' },
      { label: 'Termos de Uso', href: '/politica-privacidade#termos' },
      { label: 'LGPD', href: '/politica-privacidade#lgpd' },
    ],
  },
} as const

export const pilares = [
  {
    key: 'inteligencia',
    titulo: 'Inteligência Financeira',
    descricao:
      'Diagnóstico auditável, memória de cálculo e mapeamento de abusividade antes de qualquer conversa com credor.',
    icone: 'BrainCircuit',
  },
  {
    key: 'reestruturacao',
    titulo: 'Reestruturação Estratégica',
    descricao:
      'Planos multi-credor com DSCR realista, garantias otimizadas e proteção patrimonial.',
    icone: 'LineChart',
  },
  {
    key: 'agro',
    titulo: 'Visão de Agro',
    descricao:
      'Safra, basis, clima, câmbio e CPR dentro da mesma mesa: finanças que entendem campo.',
    icone: 'Wheat',
  },
  {
    key: 'tecnologia',
    titulo: 'Tecnologia Proprietária',
    descricao:
      'Sistema interno, CRM, pipelines de dados de mercado e ALIX — IA que pensa junto com o consultor.',
    icone: 'Cpu',
  },
] as const

export type Pilar = (typeof pilares)[number]

/**
 * Configuração central do site ALETIS — navegação, contato, SEO base.
 * Único ponto de verdade; qualquer alteração institucional passa aqui.
 *
 * Quatro pilares conforme Manual de Identidade Visual oficial:
 *   Agro · Corporate · Fomento · Gestão
 */

export const siteConfig = {
  name: 'ALETIS',
  tagline: 'Finanças Estratégicas & Agrobusiness',
  shortDescription:
    'Inteligência financeira e estratégica para o agronegócio brasileiro.',
  longDescription:
    'A ALETIS reúne quatro pilares — Agro, Corporate, Fomento e Gestão — em uma mesa técnica independente. Reestruturação de dívida rural, BPO financeiro, captação estruturada e governança corporativa, com metodologia proprietária e tecnologia sob medida.',
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
      { label: 'ALETIS Agro', href: '/solucoes#agro' },
      { label: 'ALETIS Corporate', href: '/solucoes#corporate' },
      { label: 'ALETIS Fomento', href: '/solucoes#fomento' },
      { label: 'ALETIS Gestão', href: '/solucoes#gestao' },
      { label: 'Diagnóstico Financeiro', href: '/solucoes#diagnostico' },
      { label: 'Reestruturação de Dívida', href: '/solucoes#reestruturacao' },
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

/**
 * Pilares oficiais — conforme Manual de Identidade Visual.
 * Usados no Footer institucional e em /solucoes.
 */
export const pilares = [
  {
    key: 'agro',
    titulo: 'ALETIS Agro',
    descricao: 'Crédito rural & gestão financeira do produtor',
    icone: 'Wheat',
  },
  {
    key: 'corporate',
    titulo: 'ALETIS Corporate',
    descricao: 'BPO & gestão financeira para empresas',
    icone: 'Building2',
  },
  {
    key: 'fomento',
    titulo: 'ALETIS Fomento',
    descricao: 'Crédito & reestruturação',
    icone: 'Sprout',
  },
  {
    key: 'gestao',
    titulo: 'ALETIS Gestão',
    descricao: 'Governança & controles',
    icone: 'ShieldCheck',
  },
] as const

export type Pilar = (typeof pilares)[number]

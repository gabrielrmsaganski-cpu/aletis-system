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
    'Assessoria financeira estratégica para o agronegócio brasileiro.',
  longDescription:
    'A ALETIS organiza dívida, caixa, contratos, garantias e negociação para produtores, grupos e empresas do agronegócio. Atua em quatro frentes — Agro, Corporate, Fomento e Gestão — com método financeiro, documentação clara e tecnologia própria de apoio.',
  url: 'https://aletis.com.br',
  // OG image gerada dinamicamente em /opengraph-image.tsx (não há arquivo
  // estático em /public — Next.js cuida disso pelo App Router).
  ogImage: '/opengraph-image',
  locale: 'pt-BR',
  contact: {
    email: 'contato@aletis.com.br',
    // Telefone/WhatsApp oficiais — preencher com números verificados
    // antes de divulgação. Quando vazios, componentes ocultam os campos.
    telefone: null as string | null,
    whatsapp: null as string | null,
    endereco: 'Curitiba · Paraná · Brasil',
  },
  // Redes sociais opcionais — só renderizadas quando preenchidas.
  social: {
    instagram: null as string | null,
    linkedin: null as string | null,
  },
} as const

export const nav = {
  primary: [
    { label: 'Sobre', href: '/sobre' },
    { label: 'Para quem é', href: '/para-quem-e' },
    { label: 'Documentos', href: '/documentos-necessarios' },
    { label: 'Soluções', href: '/solucoes' },
    { label: 'Cases', href: '/cases' },
    { label: 'Educação', href: '/educacao' },
    { label: 'Calculadoras', href: '/calculadoras' },
    { label: 'Insights', href: '/insights' },
    { label: 'Contato', href: '/contato' },
  ],
  footer: {
    empresa: [
      { label: 'Sobre a ALETIS', href: '/sobre' },
      { label: 'Para quem é', href: '/para-quem-e' },
      { label: 'Documentos Necessários', href: '/documentos-necessarios' },
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
    educacao: [
      { label: 'Mapa da Educação', href: '/educacao' },
      { label: 'Crédito Rural', href: '/educacao/credito-rural' },
      { label: 'Programas oficiais', href: '/educacao/programas' },
      { label: 'Instrumentos do agro', href: '/educacao/instrumentos' },
      { label: 'Renegociação', href: '/educacao/renegociacao' },
      { label: 'Direitos do produtor', href: '/educacao/direitos' },
      { label: 'Anatomia do contrato', href: '/educacao/contrato' },
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
    icone: '01',
  },
  {
    key: 'corporate',
    titulo: 'ALETIS Corporate',
    descricao: 'BPO & gestão financeira para empresas',
    icone: '06',
  },
  {
    key: 'fomento',
    titulo: 'ALETIS Fomento',
    descricao: 'Crédito & reestruturação',
    icone: '11',
  },
  {
    key: 'gestao',
    titulo: 'ALETIS Gestão',
    descricao: 'Governança & controles',
    icone: '16',
  },
] as const

export type Pilar = (typeof pilares)[number]

export function getWhatsappHref(message: string): string | null {
  const phone = siteConfig.contact.whatsapp?.replace(/\D/g, '')
  if (!phone) return null
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

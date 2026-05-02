/**
 * Manifest tipado da Identidade Visual ALETIS.
 *
 * Fonte canônica: ALETIS2/novos/Identidade visual + Manual Bulbo Agência (abr/2026).
 * Espelhado em /home/aisaganski/aletis-audit/SUPERPOWER-BRAND-TOKENS.json.
 *
 * Use estes constantes em vez de hard-coded paths/colors em qualquer
 * componente que renderize a marca, para manter consistência.
 */

export const ALETIS_COLORS = {
  primary: '#17251b',
  secondary: '#465b4a',
  accent: '#cb9d52',
  muted: '#b2bda1',
  background: '#ede9d9',
  neutral: '#d9d9d9',
  text: '#17251b',
} as const

export const ALETIS_COLORS_META: Record<keyof typeof ALETIS_COLORS, { rgb: string; cmyk: string; role: string }> = {
  primary: { rgb: '23/37/27', cmyk: '85/57/77/77', role: 'Verde escuro profundo — solidez e estabilidade institucional' },
  secondary: { rgb: '70/91/74', cmyk: '73/42/68/38', role: 'Verde médio sage — apoio em superfícies de UI' },
  accent: { rgb: '203/157/82', cmyk: '16/41/81/4', role: 'Dourado suave — prosperidade, CTAs, destaques' },
  muted: { rgb: '178/189/161', cmyk: '37/16/42/2', role: 'Verde claro acinzentado — textos secundários e divisores' },
  background: { rgb: '237/233/217', cmyk: '8/7/18/0', role: 'Bege/off-white — clareza e fundo principal' },
  neutral: { rgb: '217/217/217', cmyk: '18/12/14/0', role: 'Cinza claro — bordas e fundos neutros' },
  text: { rgb: '23/37/27', cmyk: '85/57/77/77', role: 'Mesmo do primário — alto contraste sobre o background' },
}

export const ALETIS_FONTS = {
  display: 'Chakra Petch',
  body: 'Verdana',
  mono: 'JetBrains Mono',
} as const

/**
 * Linhas de aplicação — cada uma com 4 variantes oficiais (01-04 conforme manual)
 * e uma versão dark legacy (já no repositório).
 */
export type LogoLine = 'principal' | 'slogan' | 'reduzido' | 'pb' | 'agro' | 'corporate' | 'fomento' | 'gestao'

const PUBLIC = '/brand/logos'

export const ALETIS_LOGOS: Record<LogoLine, { label: string; description: string; variants: string[]; legacyDark?: string; legacyCream?: string }> = {
  principal: {
    label: 'Principal',
    description: 'Aplicação institucional padrão — usar quando há espaço hero suficiente.',
    variants: ['principal-01.png', 'principal-02.png', 'principal-03.png', 'principal-04.png'].map((f) => `${PUBLIC}/${f}`),
    legacyDark: `${PUBLIC}/aletis-principal-dark.png`,
    legacyCream: `${PUBLIC}/aletis-principal-cream.png`,
  },
  slogan: {
    label: 'Com slogan',
    description: 'Variante com "Finanças Estratégicas & Agrobusiness" abaixo do wordmark.',
    variants: ['slogan-05.png', 'slogan-06.png', 'slogan-07.png', 'slogan-08.png'].map((f) => `${PUBLIC}/${f}`),
  },
  reduzido: {
    label: 'Reduzido',
    description: 'Para tamanhos pequenos (favicon, badge, header compacto).',
    variants: ['reduzido-09.png', 'reduzido-10.png', 'reduzido-11.png', 'reduzido-12.png'].map((f) => `${PUBLIC}/${f}`),
    legacyDark: `${PUBLIC}/aletis-reduzido-dark.png`,
    legacyCream: `${PUBLIC}/aletis-reduzido-cream.png`,
  },
  pb: {
    label: 'P&B / Grayscale',
    description: 'Para impressão monocromática ou aplicações onde a paleta colorida não é viável.',
    variants: ['pb-13.png', 'pb-14.png', 'pb-15.png', 'pb-16.png', 'pb-17.png', 'pb-18.png', 'pb-19.png', 'pb-20.png'].map((f) => `${PUBLIC}/${f}`),
  },
  agro: {
    label: 'Linha Agro',
    description: 'Texturas, cores e imagens ligadas à natureza — público do setor agronegócio.',
    variants: ['agro-01.png', 'agro-02.png', 'agro-03.png', 'agro-04.png'].map((f) => `${PUBLIC}/${f}`),
    legacyDark: `${PUBLIC}/aletis-agro-dark.png`,
  },
  corporate: {
    label: 'Linha Corporate',
    description: 'Composições limpas, equilíbrio visual — profissionalismo e credibilidade.',
    variants: ['corporate-01.png', 'corporate-02.png', 'corporate-03.png', 'corporate-04.png'].map((f) => `${PUBLIC}/${f}`),
    legacyDark: `${PUBLIC}/aletis-corporate-dark.png`,
  },
  fomento: {
    label: 'Linha Fomento',
    description: 'Comunica desenvolvimento, incentivo, crescimento, dinamismo e progresso.',
    variants: ['fomento-01.png', 'fomento-02.png', 'fomento-03.png', 'fomento-04.png'].map((f) => `${PUBLIC}/${f}`),
    legacyDark: `${PUBLIC}/aletis-fomento-dark.png`,
  },
  gestao: {
    label: 'Linha Gestão',
    description: 'Composições claras com hierarquia visual definida — eficiência e planejamento.',
    variants: ['gestao-01.png', 'gestao-02.png', 'gestao-03.png', 'gestao-04.png'].map((f) => `${PUBLIC}/${f}`),
    legacyDark: `${PUBLIC}/aletis-gestao-dark.png`,
  },
}

export const ALETIS_ICONS = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  src: `/brand/icons/aletis-icon-${String(i + 1).padStart(2, '0')}.png`,
}))

export const ALETIS_PATTERN = '/brand/pattern/repetidor.png'

export const ALETIS_TAGLINES = [
  'Verdade nos números. Prosperidade nos acordos.',
  'Estrutura que sustenta resultados.',
  'Planejar para colher. Construir sobre a rocha.',
  'Planejar para atravessar safras com segurança.',
] as const

export const ALETIS_DO_NOTS = [
  'Distorcer (alterar largura/altura independentemente)',
  'Alterar cores oficiais',
  'Inverter elementos',
  'Dissociar elementos do conjunto',
  'Logo branco em fundo claro',
  'Logo colorido em fundo colorido',
  'Logo preto em fundo escuro',
  'Alterar tipografia',
] as const

export const ALETIS_VOICE = {
  tone: 'Ética, técnica, transparente e serena. Consultivo, seguro, empático e didático.',
  etymology: 'ALETIS deriva do grego aletheia = verdade. Numerologia 4 — estrutura, ordem, disciplina, prosperidade sólida.',
  symbol: "Construído a partir da própria tipografia do logotipo, formado pela junção das letras de 'Aletis'. Geometria baseada em linhas de 4 e figura de base quadrada (energia da solidez).",
} as const

export const ALETIS_LEGAL = {
  razaoSocial: 'VVK CAPITAL CONSULTORIA LTDA',
  nomeFantasia: 'ALETIS FINANÇAS ESTRATÉGICAS & AGROBUSINESS',
  cnpj: '53.826.569/0001-77',
  endereco: 'Rua João Batista Trentin, 796, Tingui, Curitiba/PR — CEP 82.620-045',
  dominio: 'aletisfinancas.com.br',
  email: 'christian@aletisfinancas.com.br',
  banco: 'Cresol 133, Agência 1736, CC 125375-1 (PIX/CNPJ)',
} as const

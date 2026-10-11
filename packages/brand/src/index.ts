export const ALETIS_COLORS = {
  primary: '#17251b',
  primaryDeep: '#0d1611',
  primaryBlack: '#080d09',
  secondary: '#465b4a',
  secondarySoft: '#6b7d6f',
  muted: '#b2bda1',
  mutedSoft: '#cdd5c0',
  background: '#ede9d9',
  backgroundSoft: '#f5f2e7',
  backgroundIvory: '#fbf9f0',
  accent: '#cb9d52',
  accentDark: '#a87f3d',
  accentSoft: '#e3bd80',
  accentGlow: '#f0d9a8',
  neutral: '#d9d9d9',
  text: '#17251b',
  border: '#d9d3bc',
  borderSoft: '#e9e3d2',
  graphite: '#3d3d3d',
  danger: '#a83232',
  success: '#2f7b55',
  warning: '#b98934',
  info: '#3f6476',
} as const

export type AletisColorName = keyof typeof ALETIS_COLORS

export const ALETIS_COLOR_META: Record<
  'primary' | 'secondary' | 'accent' | 'muted' | 'background' | 'neutral',
  { hex: string; rgb: string; cmyk: string; role: string }
> = {
  primary: {
    hex: ALETIS_COLORS.primary,
    rgb: '23/37/27',
    cmyk: '85/57/77/77',
    role: 'Verde escuro profundo: base institucional, navegacao, headers e superfices imersivas.',
  },
  secondary: {
    hex: ALETIS_COLORS.secondary,
    rgb: '70/91/74',
    cmyk: '73/42/68/38',
    role: 'Verde medio sage: apoio, estados ativos, leitura secundaria e superficies tecnicas.',
  },
  accent: {
    hex: ALETIS_COLORS.accent,
    rgb: '203/157/82',
    cmyk: '16/41/81/4',
    role: 'Dourado suave: decisao, CTA, destaque financeiro e assinatura de valor.',
  },
  muted: {
    hex: ALETIS_COLORS.muted,
    rgb: '178/189/161',
    cmyk: '37/16/42/2',
    role: 'Verde claro acinzentado: divisores, chips e informacao de baixa hierarquia.',
  },
  background: {
    hex: ALETIS_COLORS.background,
    rgb: '237/233/217',
    cmyk: '8/7/18/0',
    role: 'Bege off-white: fundo claro, papel, leitura e superfices documentais.',
  },
  neutral: {
    hex: ALETIS_COLORS.neutral,
    rgb: '217/217/217',
    cmyk: '18/12/14/0',
    role: 'Cinza claro: bordas, skeletons e suporte neutro.',
  },
}

export const ALETIS_LEGACY_COLOR_MAP = {
  '#0F4C35': ALETIS_COLORS.primary,
  '#0f4c35': ALETIS_COLORS.primary,
  '#C9A84C': ALETIS_COLORS.accent,
  '#c9a84c': ALETIS_COLORS.accent,
  '#D4A574': ALETIS_COLORS.accentSoft,
  '#d4a574': ALETIS_COLORS.accentSoft,
  '#C8A96A': ALETIS_COLORS.accent,
  '#c8a96a': ALETIS_COLORS.accent,
  '#2E7D4F': ALETIS_COLORS.success,
  '#2e7d4f': ALETIS_COLORS.success,
} as const

export const ALETIS_FONTS = {
  display: 'Chakra Petch',
  body: 'Verdana',
  mono: 'JetBrains Mono',
} as const

export const ALETIS_PUBLIC_PATHS = {
  logos: '/brand/logos',
  icons: '/brand/icons',
  pattern: '/brand/pattern/repetidor.png',
  fonts: '/fonts',
} as const

export const ALETIS_PATTERN = ALETIS_PUBLIC_PATHS.pattern

export type AletisLogoLine =
  | 'principal'
  | 'slogan'
  | 'reduzido'
  | 'pb'
  | 'agro'
  | 'corporate'
  | 'fomento'
  | 'gestao'

export const ALETIS_LOGOS: Record<
  AletisLogoLine,
  { label: string; description: string; variants: string[]; legacyDark?: string; legacyCream?: string }
> = {
  principal: {
    label: 'Principal',
    description: 'Aplicacao institucional padrao para areas de destaque.',
    variants: ['principal-01.png', 'principal-02.png', 'principal-03.png', 'principal-04.png'].map(
      (file) => `${ALETIS_PUBLIC_PATHS.logos}/${file}`,
    ),
    legacyDark: `${ALETIS_PUBLIC_PATHS.logos}/aletis-principal-dark.png`,
    legacyCream: `${ALETIS_PUBLIC_PATHS.logos}/aletis-principal-cream.png`,
  },
  slogan: {
    label: 'Com slogan',
    description: 'Wordmark com assinatura Financas Estrategicas & Agrobusiness.',
    variants: ['slogan-05.png', 'slogan-06.png', 'slogan-07.png', 'slogan-08.png'].map(
      (file) => `${ALETIS_PUBLIC_PATHS.logos}/${file}`,
    ),
  },
  reduzido: {
    label: 'Reduzido',
    description: 'Uso compacto em favicon, badge, header colapsado e espacos pequenos.',
    variants: ['reduzido-09.png', 'reduzido-10.png', 'reduzido-11.png', 'reduzido-12.png'].map(
      (file) => `${ALETIS_PUBLIC_PATHS.logos}/${file}`,
    ),
    legacyDark: `${ALETIS_PUBLIC_PATHS.logos}/aletis-reduzido-dark.png`,
    legacyCream: `${ALETIS_PUBLIC_PATHS.logos}/aletis-reduzido-cream.png`,
  },
  pb: {
    label: 'P&B / Grayscale',
    description: 'Impressao ou restricoes de reproducao cromatica.',
    variants: ['pb-13.png', 'pb-14.png', 'pb-15.png', 'pb-16.png', 'pb-17.png', 'pb-18.png', 'pb-19.png', 'pb-20.png'].map(
      (file) => `${ALETIS_PUBLIC_PATHS.logos}/${file}`,
    ),
  },
  agro: {
    label: 'Linha Agro',
    description: 'Contexto rural, credito, produtor e operacao agricola.',
    variants: ['agro-01.png', 'agro-02.png', 'agro-03.png', 'agro-04.png'].map(
      (file) => `${ALETIS_PUBLIC_PATHS.logos}/${file}`,
    ),
    legacyDark: `${ALETIS_PUBLIC_PATHS.logos}/aletis-agro-dark.png`,
  },
  corporate: {
    label: 'Linha Corporate',
    description: 'Governanca, empresas, BPO e controles.',
    variants: ['corporate-01.png', 'corporate-02.png', 'corporate-03.png', 'corporate-04.png'].map(
      (file) => `${ALETIS_PUBLIC_PATHS.logos}/${file}`,
    ),
    legacyDark: `${ALETIS_PUBLIC_PATHS.logos}/aletis-corporate-dark.png`,
  },
  fomento: {
    label: 'Linha Fomento',
    description: 'Credito, desenvolvimento, incentivo e capital estruturado.',
    variants: ['fomento-01.png', 'fomento-02.png', 'fomento-03.png', 'fomento-04.png'].map(
      (file) => `${ALETIS_PUBLIC_PATHS.logos}/${file}`,
    ),
    legacyDark: `${ALETIS_PUBLIC_PATHS.logos}/aletis-fomento-dark.png`,
  },
  gestao: {
    label: 'Linha Gestao',
    description: 'Planejamento, eficiencia, processo e rotina financeira.',
    variants: ['gestao-01.png', 'gestao-02.png', 'gestao-03.png', 'gestao-04.png'].map(
      (file) => `${ALETIS_PUBLIC_PATHS.logos}/${file}`,
    ),
    legacyDark: `${ALETIS_PUBLIC_PATHS.logos}/aletis-gestao-dark.png`,
  },
}

export const ALETIS_ICONS = Array.from({ length: 25 }, (_, index) => {
  const id = index + 1
  return {
    id,
    key: `aletis-icon-${String(id).padStart(2, '0')}`,
    src: `${ALETIS_PUBLIC_PATHS.icons}/aletis-icon-${String(id).padStart(2, '0')}.png`,
  }
})

export const ALETIS_TAGLINES = [
  'Verdade nos numeros. Prosperidade nos acordos.',
  'Estrutura que sustenta resultados.',
  'Planejar para colher. Construir sobre a rocha.',
  'Planejar para atravessar safras com seguranca.',
] as const

export const ALETIS_DO_NOTS = [
  'Distorcer a marca',
  'Alterar cores oficiais',
  'Inverter elementos',
  'Dissociar elementos',
  'Usar logo branco em fundo claro',
  'Usar logo preto em fundo escuro',
  'Usar logo colorido em fundo colorido',
  'Alterar tipografia',
] as const

export const ALETIS_VOICE = {
  tone: 'Etica, tecnica, transparente e serena. Consultivo, seguro, empatico e didatico.',
  etymology: 'ALETIS deriva do grego aletheia, verdade. A marca trabalha solidez, ordem e prosperidade estrutural.',
  symbol: "Construido a partir da propria tipografia do logotipo, formado pela juncao das letras de 'Aletis'. Geometria baseada em linhas de 4 e figura de base quadrada.",
  promise: 'Decisao financeira ancorada em dados, documentos, memoria de calculo e negociacao estruturada.',
} as const

export const ALETIS_LEGAL = {
  razaoSocial: 'VVK CAPITAL CONSULTORIA LTDA',
  nomeFantasia: 'ALETIS FINANCAS ESTRATEGICAS & AGROBUSINESS',
  cnpj: '53.826.569/0001-77',
  endereco: 'Rua Joao Batista Trentin, 796, Tingui, Curitiba/PR - CEP 82.620-045',
  dominio: 'aletisfinancas.com.br',
  email: 'christian@aletisfinancas.com.br',
  banco: 'Cresol 133, Agencia 1736, CC 125375-1 (PIX/CNPJ)',
} as const

export const ALETIS_SYMBOL = {
  viewBox: '0 0 64 64',
  frame: {
    x: 6,
    y: 6,
    width: 52,
    height: 52,
    radius: 2,
  },
  aPath: 'M19 50 L32 16 L45 50 Z',
  crossbar: {
    x: 24,
    y: 36,
    width: 16,
    height: 3.6,
  },
} as const

export function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const value = clean.length === 3
    ? clean.split('').map((char) => char + char).join('')
    : clean
  const numeric = Number.parseInt(value, 16)
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255]
}

export function hexToPptx(hex: string): string {
  return hex.replace('#', '').toUpperCase()
}

import {
  ALETIS_COLOR_META,
  ALETIS_COLORS as CANONICAL_COLORS,
  ALETIS_DO_NOTS,
  ALETIS_FONTS,
  ALETIS_ICONS,
  ALETIS_LEGAL,
  ALETIS_LOGOS,
  ALETIS_PATTERN,
  ALETIS_TAGLINES,
  ALETIS_VOICE,
  type AletisLogoLine,
} from '@aletis/brand'

/**
 * Manifest de compatibilidade da Identidade Visual ALETIS.
 *
 * A fonte canonica agora vive em @aletis/brand para web, site e API. Este
 * arquivo preserva a API antiga usada pela pagina ManualMarca sem reintroduzir
 * tokens duplicados.
 */
export const ALETIS_COLORS = {
  primary: CANONICAL_COLORS.primary,
  secondary: CANONICAL_COLORS.secondary,
  accent: CANONICAL_COLORS.accent,
  muted: CANONICAL_COLORS.muted,
  background: CANONICAL_COLORS.background,
  neutral: CANONICAL_COLORS.neutral,
  text: CANONICAL_COLORS.text,
} as const

export const ALETIS_COLORS_META: Record<
  keyof typeof ALETIS_COLORS,
  { rgb: string; cmyk: string; role: string }
> = {
  primary: ALETIS_COLOR_META.primary,
  secondary: ALETIS_COLOR_META.secondary,
  accent: ALETIS_COLOR_META.accent,
  muted: ALETIS_COLOR_META.muted,
  background: ALETIS_COLOR_META.background,
  neutral: ALETIS_COLOR_META.neutral,
  text: {
    rgb: ALETIS_COLOR_META.primary.rgb,
    cmyk: ALETIS_COLOR_META.primary.cmyk,
    role: 'Texto institucional sobre fundos claros.',
  },
}

export type LogoLine = AletisLogoLine

export {
  ALETIS_DO_NOTS,
  ALETIS_FONTS,
  ALETIS_ICONS,
  ALETIS_LEGAL,
  ALETIS_LOGOS,
  ALETIS_PATTERN,
  ALETIS_TAGLINES,
  ALETIS_VOICE,
}

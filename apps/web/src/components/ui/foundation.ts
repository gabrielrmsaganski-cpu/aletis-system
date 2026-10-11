/**
 * ALETIS UI foundation.
 *
 * Classes shared by the operational UI. Keep visual decisions here first, then
 * migrate page-level implementations away from ad hoc Tailwind strings.
 */

export const uiSurface = {
  page: 'bg-[var(--bg-app)] text-[var(--text-strong)]',
  panel: 'ui-panel',
  panelHover: 'ui-panel-interactive',
  sectionHeader: 'ui-panel-heading',
  footer: 'ui-panel-footer',
} as const

export const uiText = {
  eyebrow:
    'font-body text-[10px] font-semibold uppercase text-aletis-gold-escuro dark:text-aletis-gold',
  title:
    'font-display text-base font-bold leading-tight text-aletis-grafite-escuro dark:text-aletis-cream md:text-lg',
  subtitle: 'text-xs leading-relaxed text-aletis-grafite-medio dark:text-aletis-sage',
} as const

export const uiAction = {
  iconButton: 'ui-icon-button',
  primary: 'ui-button ui-button--primary',
  secondary: 'ui-button ui-button--secondary',
  ghost: 'ui-button ui-button--ghost',
  danger: 'ui-button ui-button--danger',
} as const

export const uiDialog = {
  overlay:
    'fixed inset-0 z-[70] flex items-stretch justify-center bg-aletis-verde-escuro/70 p-0 backdrop-blur-[2px] md:items-center md:p-4',
  panel:
    'flex h-[100dvh] w-full flex-col overflow-hidden bg-card shadow-elevation-3 outline-none dark:bg-card md:h-auto md:rounded-2xl md:border md:border-aletis-borda',
  collapsedWrap: 'fixed inset-x-3 bottom-3 z-[80] sm:left-auto sm:right-5 sm:w-[430px]',
  collapsedPanel:
    'overflow-hidden rounded-2xl border border-aletis-borda bg-card shadow-elevation-3 dark:border-white/10 dark:bg-aletis-verde',
  header:
    'flex shrink-0 items-start gap-3 border-b border-aletis-borda bg-muted/50 px-4 py-4 dark:border-white/10 dark:bg-card md:px-5',
  body: 'min-h-0 flex-1 overflow-y-auto bg-card px-4 py-4 dark:bg-card md:px-5',
  footer:
    'shrink-0 border-t border-aletis-borda bg-muted/50 px-4 py-3 dark:border-white/10 dark:bg-card/[0.03] md:px-5',
  iconFrame:
    'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-aletis-borda bg-card text-aletis-verde dark:border-white/10 dark:bg-aletis-gold/15 dark:text-aletis-gold',
  miniIconFrame:
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-aletis-borda bg-card text-aletis-verde dark:border-white/10 dark:bg-aletis-gold/15 dark:text-aletis-gold',
  iconButton: uiAction.iconButton,
} as const

export const chartTheme = {
  palette: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', '#7a8580', '#947858', '#78969c'],
  tooltip: { backgroundColor: 'var(--bg-surface)', color: 'var(--text-strong)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: 'var(--shadow-popover)', fontSize: 12 },
  colors: {
    primary: 'var(--chart-1)',
    accent: 'var(--chart-2)',
    success: '#2f7b55',
    danger: '#a83232',
    warning: '#b98934',
    info: '#3f6476',
    muted: '#8a938b',
    grid: 'var(--border-default)',
    tick: 'var(--text-muted)',
  },
  axisTick: {
    fill: 'var(--text-muted)',
    fontSize: 11,
    fontFamily: 'Inter, Verdana, system-ui, sans-serif',
    fontWeight: 500,
  },
  grid: {
    stroke: 'var(--border-default)',
    strokeDasharray: '3 6',
    vertical: false,
  },
} as const

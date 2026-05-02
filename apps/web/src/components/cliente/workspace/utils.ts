// ============================================================
// Workspace utilities — formatters + cor de saúde
// ============================================================

export function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function fmtBRLCompact(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
  return fmtBRL(v)
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !isFinite(v)) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

export function fmtData(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

export function fmtDataHora(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

/** Classifica saúde 0-100 em cor padronizada do design system. */
export function healthColor(value: number): string {
  if (value >= 70) return '#27AE60'
  if (value >= 40) return '#E67E22'
  return '#C0392B'
}

export function healthLabel(value: number): string {
  if (value >= 80) return 'Excelente'
  if (value >= 60) return 'Saudável'
  if (value >= 40) return 'Atenção'
  if (value >= 20) return 'Crítica'
  return 'Severa'
}

export function diasAteVencimento(iso: string | undefined): number | null {
  if (!iso) return null
  const venc = new Date(iso).getTime()
  if (!isFinite(venc)) return null
  return Math.ceil((venc - Date.now()) / (1000 * 60 * 60 * 24))
}

// ============================================================
// Portal — formatadores, máscaras, helpers de data e fetch.
// ============================================================

export const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const formatBRLShort = (v: number): string => {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1)} bi`
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)} mi`
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`
  return formatBRL(v)
}

export function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

export function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const diff = Date.now() - then
    const min = Math.floor(diff / 60_000)
    if (min < 1) return 'agora há pouco'
    if (min < 60) return `há ${min} min`
    const h = Math.floor(min / 60)
    if (h < 24) return `há ${h}h`
    const d = Math.floor(h / 24)
    if (d < 7) return `há ${d}d`
    return formatDate(iso)
  } catch {
    return iso
  }
}

export function fmtBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`
  return `${n} B`
}

/** Wrapper de fetch autenticado. credentials envia o cookie HttpOnly portal_token. */
export async function apiCall<T = unknown>(
  path: string,
  init?: RequestInit & { token?: string | null },
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (init?.token) headers['Authorization'] = `Bearer ${init.token}`
  try {
    const resp = await fetch(path, { ...init, headers, credentials: 'same-origin' })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        error: (json as { error?: string }).error || `Erro ${resp.status}`,
      }
    }
    return { ok: true, data: (json as { data: T }).data }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'Falha de rede',
    }
  }
}

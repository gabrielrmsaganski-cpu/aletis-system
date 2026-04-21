/**
 * Concatena classes CSS ignorando falsy — alternativa leve a clsx/classnames
 * sem dependência externa.
 */
export function cn(...parts: Array<string | number | null | false | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

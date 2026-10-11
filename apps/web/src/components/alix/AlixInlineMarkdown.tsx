import React from 'react'

const MAX_INLINE_DEPTH = 6
const UNSAFE_URL_CHARACTERS = /[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\\]/u
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i

/** A fonte pode sugerir um destino; somente endereços web e caminhos locais viram links. */
function safeLinkHref(value: string): string | undefined {
  if (!value || UNSAFE_URL_CHARACTERS.test(value) || value.startsWith('//')) return undefined
  let decoded: string
  try { decoded = decodeURIComponent(value) } catch { return undefined }
  // Espaços codificados dentro de nomes e parâmetros são válidos; controles,
  // separadores invisíveis e espaços nas extremidades continuam bloqueados.
  if (decoded.trim() !== decoded || UNSAFE_URL_CHARACTERS.test(decoded.replace(/ /g, '')) || decoded.startsWith('//')) return undefined
  if (/(?:&#(?:x[\da-f]+|\d+);?|&(?:colon|tab|newline);)/i.test(decoded)) return undefined
  try {
    if (URL_SCHEME.test(value)) {
      if (!/^https?:\/\//i.test(value)) return undefined
      const parsed = new URL(value)
      return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname ? value : undefined
    }
    // Protocolos codificados não podem ser confundidos com caminhos da aplicação.
    if (URL_SCHEME.test(decoded)) return undefined
    const parsed = new URL(value, 'https://aletis.local/')
    return parsed.origin === 'https://aletis.local' ? value : undefined
  } catch { return undefined }
}

/** Renderiza **negrito**, _itálico_, código literal e links, sem interpretar HTML. */
export function renderInline(text: string): React.ReactNode {
  return renderInlineParts(text, 0)
}

function renderInlineParts(text: string, depth: number): React.ReactNode {
  if (depth >= MAX_INLINE_DEPTH) return text
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0
  const patterns: Array<{ re: RegExp; type: 'code' | 'link' | 'b' | 'i' }> = [
    { re: /`([^`]+)`/, type: 'code' },
    { re: /\[([^\]]+)\]\(([^)]+)\)/, type: 'link' },
    { re: /\*\*([^*]+)\*\*/, type: 'b' },
    { re: /(?<![a-z0-9_])_([^_]+)_(?![a-z0-9_])/i, type: 'i' },
  ]
  while (remaining.length > 0) {
    let best: { match: RegExpMatchArray; type: typeof patterns[number]['type'] } | null = null
    for (const pattern of patterns) {
      const match = remaining.match(pattern.re)
      if (match && (best == null || (match.index ?? 0) < (best.match.index ?? 0))) best = { match, type: pattern.type }
    }
    if (!best) {
      parts.push(<span key={`t-${key++}`}>{remaining}</span>)
      break
    }
    const idx = best.match.index ?? 0
    if (idx > 0) parts.push(<span key={`t-${key++}`}>{remaining.slice(0, idx)}</span>)
    if (best.type === 'b') {
      parts.push(<strong key={`b-${key++}`} className="font-semibold text-foreground dark:text-white">{renderInlineParts(best.match[1], depth + 1)}</strong>)
    } else if (best.type === 'i') {
      parts.push(<em key={`i-${key++}`} className="italic text-[var(--text-soft)] dark:text-white/70">{renderInlineParts(best.match[1], depth + 1)}</em>)
    } else if (best.type === 'code') {
      parts.push(
        <code key={`c-${key++}`} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-foreground dark:text-white/90 text-[0.88em] font-mono">
          {best.match[1]}
        </code>,
      )
    } else if (best.type === 'link') {
      const href = safeLinkHref(best.match[2])
      parts.push(href ? (
        <a key={`l-${key++}`} href={href} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
          {best.match[1]}
        </a>
      ) : <span key={`t-${key++}`}>{best.match[1]}</span>)
    }
    remaining = remaining.slice(idx + best.match[0].length)
  }
  return parts
}

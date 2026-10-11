import React from 'react'
import { renderInline } from './AlixInlineMarkdown'

function isTableSeparator(line: string): boolean {
  const t = line.trim()
  if (!t.startsWith('|')) return false
  return /^\|(\s*:?-+:?\s*\|)+\s*$/.test(t)
}

/** Parse célula a partir de uma linha `| a | b | c |`. */
function parseTableRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return t.split('|').map((c) => c.trim())
}

export function renderAlixContent(content: string | undefined | null): React.ReactNode {
  if (content == null || typeof content !== 'string') {
    return <span className="text-[var(--text-soft)] dark:text-white/50 italic">(sem conteúdo)</span>
  }
  if (content.length === 0) {
    return <span className="text-[var(--text-soft)] dark:text-white/50 italic">(resposta vazia)</span>
  }
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Linha vazia → separador (pula sequências de linhas vazias, 1 <br>)
    if (!trimmed) {
      // colapsa múltiplas vazias — só emite um gap
      let emitted = false
      while (i < lines.length && !lines[i].trim()) {
        if (!emitted) { blocks.push(<div key={`gap-${key++}`} className="h-2" />); emitted = true }
        i++
      }
      continue
    }

    const fence = trimmed.match(/^(`{3,}|~{3,})(.*)$/)
    if (fence) {
      const literal: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) literal.push(lines[i++])
      if (i < lines.length) i++
      blocks.push(<pre key={`code-${key++}`} tabIndex={0} className="my-3 max-w-full overflow-x-auto rounded-lg border border-aletis-borda bg-slate-50 p-4 text-[13px] leading-6 dark:bg-white/5"><code>{literal.join('\n')}</code></pre>)
      continue
    }

    // Header (# ## ###)
    const h = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (h) {
      const level = h[1].length
      const txt = h[2]
      const size = level === 1 ? 'text-xl' : level === 2 ? 'text-lg' : 'text-base'
      blocks.push(
        <div key={`h-${key++}`} className={`${size} font-semibold text-foreground dark:text-white mt-2 mb-1`}>
          {renderInline(txt)}
        </div>,
      )
      i++
      continue
    }

    // Horizontal rule
    if (/^-{3,}$|^_{3,}$|^\*{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${key++}`} className="my-2 border-aletis-borda dark:border-white/10" />)
      i++
      continue
    }

    // Tabela: linha começa com `|`, próxima é separador
    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = parseTableRow(lines[i])
      i += 2 // pula header + separador
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|') && !isTableSeparator(lines[i])) {
        rows.push(parseTableRow(lines[i]))
        i++
      }
      blocks.push(
        <div key={`tbl-${key++}`} tabIndex={0} role="region" aria-label="Tabela da resposta" className="my-3 max-w-full overflow-x-auto rounded-lg border border-aletis-borda dark:border-white/10">
          <table className="ui-table w-full text-[13px] leading-6 border-collapse">
            <thead className="bg-aletis-bege/40 dark:bg-white/[0.04]">
              <tr>
                {header.map((c, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-semibold text-foreground dark:text-white border-b border-aletis-borda dark:border-white/10">
                    {renderInline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b last:border-b-0 border-aletis-borda/60 dark:border-white/5">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-current align-top">
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Lista ordenada/não-ordenada — agrupa sequência
    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/)
    const olMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/)
    if (ulMatch || olMatch) {
      const items: React.ReactNode[] = []
      const ordered = !!olMatch
      while (i < lines.length) {
        const l = lines[i].trim()
        const um = l.match(/^[-*•]\s+(.+)$/)
        const om = l.match(/^\d+[.)]\s+(.+)$/)
        if (!um && !om) break
        const txt = um ? um[1] : om![1]
        items.push(
          <li key={`li-${i}`} className="text-current leading-7">
            {renderInline(txt)}
          </li>,
        )
        i++
      }
      blocks.push(
        ordered
          ? <ol key={`ol-${key++}`} className="list-decimal pl-5 my-1 space-y-0.5">{items}</ol>
          : <ul key={`ul-${key++}`} className="list-disc pl-5 my-1 space-y-0.5">{items}</ul>,
      )
      continue
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const qLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        qLines.push(lines[i].trim().slice(2))
        i++
      }
      blocks.push(
        <blockquote key={`bq-${key++}`} className="border-l-2 border-aletis-verde/50 pl-3 my-2 text-[var(--text-soft)] dark:text-white/60 italic">
          {qLines.map((l, qi) => <div key={qi}>{renderInline(l)}</div>)}
        </blockquote>,
      )
      continue
    }

    // Parágrafo normal — agrupa linhas consecutivas como um bloco
    const paraLines: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('#') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('> ') &&
      !/^(`{3,}|~{3,})/.test(lines[i].trim()) &&
      !/^-{3,}$|^_{3,}$|^\*{3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push(
      <p key={`p-${key++}`} className="text-current leading-7">
        {paraLines.map((pl, pi) => (
          <React.Fragment key={pi}>
            {pi > 0 && <br />}
            {renderInline(pl)}
          </React.Fragment>
        ))}
      </p>,
    )
  }

  return <>{blocks}</>
}

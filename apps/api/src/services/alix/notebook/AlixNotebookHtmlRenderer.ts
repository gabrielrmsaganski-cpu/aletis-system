// ============================================================
// Documento HTML ALETIS para artefatos do ALIX Notebook.
// O conteúdo é renderizado no servidor, com escape estrito de texto,
// para permitir abertura, impressão e salvamento em PDF pelo navegador.
// ============================================================

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { AlixNotebook, NotebookArtifact } from './AlixNotebookService.js'
import { NOTEBOOK_EXPORT_NOTICE, notebookCitationAnchor, notebookCitationUrl, verifiedNotebookCitations, type NotebookCitation } from './NotebookCitationIntegrity.js'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function safeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72) || 'documento_alix'
}

function formatDate(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
}

function kindLabel(kind: NotebookArtifact['kind']): string {
  const labels: Record<NotebookArtifact['kind'], string> = {
    dossie: 'Dossiê executivo',
    briefing: 'Briefing executivo',
    outline: 'Roteiro estratégico',
    parecer: 'Parecer técnico',
    proposta: 'Proposta',
    checklist: 'Checklist',
    relatorio: 'Relatório',
    memoria: 'Memória do caso',
  }
  return labels[kind]
}

function logoDataUrl(): string {
  const candidates = [
    resolve(process.cwd(), '../web/public/brand/logos/principal-04.png'),
    resolve(process.cwd(), 'apps/web/public/brand/logos/principal-04.png'),
    resolve('/root/ALETIS/aletis-system/apps/web/public/brand/logos/principal-04.png'),
  ]
  const path = candidates.find((candidate) => existsSync(candidate))
  return path ? `data:image/png;base64,${readFileSync(path).toString('base64')}` : ''
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`|\[S(\d+)\]/gi, (_match, code: string | undefined, number: string | undefined) => code !== undefined
      ? `<code>${code}</code>`
      : `<a class="citation" href="#${notebookCitationAnchor(`S${number}`)}">[S${number}]</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

function sourceAppendix(citations: NotebookCitation[]): string {
  if (!citations.length) return '<section class="sources"><h3>Fontes e limites</h3><p>Nenhuma referência documental foi registrada nesta versão.</p></section>'
  return `<section class="sources"><h3>Fontes e rastreabilidade</h3><p>As citações no texto levam aos trechos utilizados abaixo.</p>${citations.map(citation => {
    const location = [citation.page ? `página ${citation.page}` : '', citation.sheet ? `aba ${citation.sheet}` : '', citation.source].filter(Boolean).join(' · ')
    const url = notebookCitationUrl(citation)
    return `<article class="source" id="${notebookCitationAnchor(citation.id)}"><h4>[${citation.id}] ${escapeHtml(citation.filename)}</h4><p class="source-location">${escapeHtml(location)}</p>${url ? `<p><a href="${escapeHtml(url)}" rel="noreferrer noopener">Abrir fonte original</a></p>` : ''}<blockquote>${escapeHtml(citation.quote)}</blockquote></article>`
  }).join('')}</section>`
}

function documentTitle(artifact: NotebookArtifact): string {
  const title = artifact.title.replace(/\s+/g, ' ').trim()
  // Perguntas são ótimas para conversar, mas não para a capa de uma entrega.
  if (!title || /\?$/.test(title) || /^(qual|quais|como|por que|porque|o que|me explique|faça|faca)\b/i.test(title)) {
    return `${kindLabel(artifact.kind)} estratégico`
  }
  return title
}

function splitExecutiveSummary(markdown: string): { summary: string; content: string } {
  const lines = markdown.replace(/\r/g, '').split('\n')
  if (/^#\s+/.test(lines[0]?.trim() || '')) lines.shift()
  while (lines.length && !lines[0]?.trim()) lines.shift()
  const summary: string[] = []
  while (lines.length) {
    const line = lines[0].trim()
    if (!line || /^```/.test(line) || /^#{1,3}\s+/.test(line) || /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) break
    summary.push(lines.shift()!.trim())
  }
  while (lines.length && !lines[0]?.trim()) lines.shift()
  return { summary: summary.join(' '), content: lines.join('\n') }
}

function markdownToHtml(markdown: string): string {
  const output: string[] = []
  let list: 'ul' | 'ol' | null = null
  let section = 0
  let codeBlock: string[] | null = null
  const closeList = () => {
    if (list) output.push(`</${list}>`)
    list = null
  }

  for (const rawLine of markdown.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim()
    if (/^```/.test(line)) {
      closeList()
      if (codeBlock) { output.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`); codeBlock = null }
      else codeBlock = []
      continue
    }
    if (codeBlock) { codeBlock.push(rawLine); continue }
    if (!line) {
      closeList()
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      closeList()
      if (heading[1].length <= 2) {
        section += 1
        output.push(`<div class="chapter"><span>${String(section).padStart(2, '0')}</span><h3>${inlineMarkdown(heading[2])}</h3></div>`)
      } else {
        output.push(`<h4>${inlineMarkdown(heading[2])}</h4>`)
      }
      continue
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (bullet || ordered) {
      const nextList = ordered ? 'ol' : 'ul'
      if (list !== nextList) {
        closeList()
        list = nextList
        output.push(`<${list}>`)
      }
      output.push(`<li>${inlineMarkdown((bullet || ordered)![1])}</li>`)
      continue
    }
    closeList()
    output.push(`<p>${inlineMarkdown(line)}</p>`)
  }
  closeList()
  if (codeBlock) output.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`)
  return output.join('\n')
}

export interface NotebookHtmlDocument {
  html: string
  filename: string
}

export function renderNotebookArtifactHtml(notebook: AlixNotebook, artifact: NotebookArtifact): NotebookHtmlDocument {
  const citations = verifiedNotebookCitations(artifact)
  const logo = logoDataUrl()
  const title = documentTitle(artifact)
  const document = splitExecutiveSummary(artifact.markdown)
  const context = notebook.title.replace(/\s+/g, ' ').trim() || 'Cliente ALETIS'

  const html = `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(title)} · ALETIS</title>
      <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #e9e7dd; color: #17251b; font: 15px/1.72 Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sheet { width: min(210mm, calc(100% - 32px)); margin: 20px auto; overflow: hidden; background: #fff; box-shadow: 0 18px 54px rgba(23,37,27,.18); }
        .cover { min-height: 297mm; padding: 22mm 22mm 20mm; display: flex; flex-direction: column; color: #f5f2e7; background: radial-gradient(circle at 88% 12%,#38553b 0%,#17251b 46%,#102015 100%); position: relative; overflow: hidden; page-break-after: always; }
        .cover::before { content:''; position:absolute; top:-62mm; right:-63mm; width:155mm; height:155mm; border:1px solid rgba(227,189,128,.38); border-radius:50%; box-shadow:0 0 0 24mm rgba(227,189,128,.045),0 0 0 48mm rgba(227,189,128,.03); }
        .cover::after { content:''; position:absolute; left:0; bottom:0; width:100%; height:4mm; background:#cb9d52; }
        .logo { width: 74mm; max-width: 100%; height: auto; object-fit: contain; object-position: left center; }
        .brand-text { font-size: 20px; font-weight: 800; letter-spacing: .18em; }
        .rule { width: 34mm; height: 3px; margin-top: auto; background: #cb9d52; }
        .eyebrow { margin-top: 16px; color: #a87f3d; font-size: 10px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
        .cover .eyebrow { color: #e3bd80; }
        h1 { max-width: 142mm; margin: 13px 0 0; font: 800 41px/1.08 Georgia, 'Times New Roman', serif; letter-spacing:-.025em; }
        .client { margin-top: 16px; font-size: 17px; color: #d9e1d4; }
        .meta { display: grid; grid-template-columns: 1.3fr 1fr; gap: 18px; margin-top: 36px; padding-top: 18px; border-top: 1px solid rgba(245,242,231,.26); }
        .meta span { display:block; color:#b9c5ae; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
        .meta strong { display:block; margin-top:5px; color:#fff; font-size:13px; }
        .content { padding: 18mm 22mm 20mm; }
        .opening { padding: 7mm 8mm; margin: 3mm 0 12mm; border-left: 1.5mm solid #cb9d52; background: linear-gradient(90deg,#f6f3e9,#fff); color:#2d4732; font: 20px/1.48 Georgia, 'Times New Roman', serif; }
        .opening-label { display:block; margin-bottom:8px; color:#a87f3d; font:800 10px Arial,sans-serif; letter-spacing:.14em; text-transform:uppercase; }
        .chapter { display:grid; grid-template-columns:15mm 1fr; gap:5mm; align-items:baseline; margin:16mm 0 6mm; padding-top:6mm; border-top:1px solid #d9d3bc; break-after:avoid; }
        .chapter span { color:#cb9d52; font:800 12px Arial,sans-serif; letter-spacing:.1em; }
        .content h3 { margin:0; color:#17251b; font:800 24px/1.2 Georgia, 'Times New Roman', serif; letter-spacing:-.015em; }
        .content h4 { margin:8mm 0 3mm; color:#436249; font-size:11px; text-transform:uppercase; letter-spacing:.12em; }
        p { margin:0 0 5mm; } ul, ol { margin:0 0 6mm; padding:0; list-style:none; } li { position:relative; margin:3.2mm 0; padding-left:6mm; } ul li::before { content:'•'; position:absolute; left:0; color:#cb9d52; font-weight:800; } ol { counter-reset:item; } ol li { counter-increment:item; } ol li::before { content:counter(item, decimal-leading-zero); position:absolute; left:0; color:#a87f3d; font-size:11px; font-weight:800; }
        code { padding:1px 4px; border-radius:3px; background:#f2efe4; }
        .citation { color:#436249; font-size:.85em; font-weight:700; text-decoration:none; white-space:nowrap; } .sources { page-break-before:always; margin-top:12mm; } .source { margin:8mm 0; break-inside:auto; } .source h4 { break-after:avoid; } .source-location { font-size:10px; overflow-wrap:anywhere; } .source blockquote { margin:3mm 0 8mm; padding-left:4mm; border-left:1mm solid #d9d3bc; white-space:pre-wrap; overflow-wrap:anywhere; font-size:11px; line-height:1.6; } .sources a { color:#436249; } .draft-notice { padding:4mm; border:1px solid #d9d3bc; background:#f6f3e9; font-size:11px; }
        .footer { margin-top:16mm; padding-top:4mm; border-top:1px solid #d9d3bc; display:flex; justify-content:space-between; gap:16px; color:#6b7d6f; font-size:9px; }
        .actions { position:fixed; right:18px; bottom:18px; z-index:3; display:flex; gap:8px; padding:9px; border:1px solid #d9d3bc; border-radius:12px; background:rgba(255,255,255,.97); box-shadow:0 10px 28px rgba(23,37,27,.18); } .actions button { border:0; border-radius:8px; padding:10px 12px; background:#17251b; color:#fff; cursor:pointer; font-weight:700; } .actions button:last-child { background:#cb9d52; color:#17251b; }
        @media screen and (max-width:700px) { .sheet { width:100%; margin:0; } .cover { min-height:100vh; padding:42px 28px 28px; } .content { padding:32px 24px; } .opening { font-size:18px; } .chapter { grid-template-columns:32px 1fr; gap:10px; } h1 { font-size:34px; } .actions { right:10px; bottom:10px; } }
        @media print { body { background:#fff; } .sheet { width:100%; margin:0; box-shadow:none; } .cover { min-height:297mm; page-break-after:always; } .actions { display:none; } .chapter, h4 { break-after:avoid; } }
      </style>
    </head>
    <body>
      <main class="sheet">
        <section class="cover">
          ${logo ? `<img class="logo" src="${logo}" alt="ALETIS">` : '<div class="brand-text">ALETIS</div>'}
          <div class="rule"></div>
          <div class="eyebrow">ALIX Notebook · ${escapeHtml(kindLabel(artifact.kind))}</div>
          <h1>${escapeHtml(title)}</h1>
          <div class="client">Preparado para ${escapeHtml(context)}</div>
          <div class="meta"><div><span>Data de emissão</span><strong>${escapeHtml(formatDate(artifact.createdAt))}</strong></div><div><span>Classificação</span><strong>Confidencial</strong></div></div>
        </section>
        <section class="content">
          <p class="draft-notice">${escapeHtml(NOTEBOOK_EXPORT_NOTICE)}</p>
          ${document.summary ? `<div class="opening"><span class="opening-label">Síntese executiva</span>${inlineMarkdown(document.summary)}</div>` : ''}
          ${markdownToHtml(document.content) || (!document.summary ? '<p>O documento não possui conteúdo textual.</p>' : '')}
          ${sourceAppendix(citations)}
          <footer class="footer"><span>Documento confidencial · ALETIS Finanças Estratégicas & Agrobusiness</span><span>ALIX Notebook</span></footer>
        </section>
      </main>
      <div class="actions"><button type="button" onclick="window.print()">Imprimir / Salvar PDF</button><button type="button" onclick="window.close()">Fechar</button></div>
    </body>
  </html>`

  return { html, filename: `${safeFilename(title)}_aletis.html` }
}

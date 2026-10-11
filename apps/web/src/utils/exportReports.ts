// ============================================================
// ALETIS — Export utilities for reports (PDF + Excel)
// ============================================================
// jsPDF / jspdf-autotable / xlsx ENTRAM POR DYNAMIC IMPORT
// dentro de cada função → não bloam o bundle inicial. O Vite
// já agrupa esses libs em 'export-vendor' (manualChunks), e
// agora esse chunk só é baixado quando o user clica em
// "Exportar PDF/Excel".
// ============================================================

// ── Brand colors ────────────────────────────────────────────
const VERDE = '#17251b'
const GRAFITE = '#1F2937'
const VERDE_RGB: [number, number, number] = [23, 37, 27]
const GRAFITE_RGB: [number, number, number] = [31, 41, 55]
const GOLD_RGB: [number, number, number] = [203, 157, 82]
const CREAM_RGB: [number, number, number] = [245, 242, 231]
const BORDA_RGB: [number, number, number] = [217, 211, 188]
const SAGE_RGB: [number, number, number] = [178, 189, 161]
const ALETIS_REDUZIDO_ASPECT = 3358 / 2878

// ── Types ───────────────────────────────────────────────────
export interface ReportSection {
  tipo: 'kpis' | 'tabela' | 'texto'
  titulo?: string
  descricao?: string
  kpis?: { label: string; valor: string | number; tone?: 'neutral' | 'success' | 'warning' }[]
  colunas?: string[]
  linhas?: (string | number)[][]
  texto?: string
}

export interface ReportCover {
  eyebrow?: string
  resumo?: string
  kpis?: { label: string; valor: string | number; apoio?: string }[]
}

export interface ReportData {
  id: string
  titulo: string
  subtitulo?: string
  gerado: string
  cover?: ReportCover
  sections: ReportSection[]
}

// ── Formatters ──────────────────────────────────────────────
export const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export const fmtNum = (v: number): string =>
  new Intl.NumberFormat('pt-BR').format(v)

export const nowStr = (): string =>
  new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

async function loadImageDataUrl(src: string): Promise<string | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ── PDF Export ──────────────────────────────────────────────
export async function exportPDF(report: ReportData): Promise<void> {
  const [{ jsPDF }, autoTableMod, logoReduzidoCream, logoReduzidoDark] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadImageDataUrl('/brand/logos/aletis-reduzido-cream.png'),
    loadImageDataUrl('/brand/logos/aletis-reduzido-dark.png'),
  ])
  const autoTable = (autoTableMod as any).default
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14
  const contentWidth = pageWidth - marginX * 2
  let y = 20

  function drawAletisLogoFallback(x: number, top: number, mode: 'light' | 'dark', height: number) {
    const mark = height * 0.62
    const fg: [number, number, number] = mode === 'light' ? CREAM_RGB : VERDE_RGB
    const bg: [number, number, number] = mode === 'light' ? VERDE_RGB : [255, 255, 255]
    const stroke = mark * 0.08

    doc.setFillColor(...bg)
    doc.roundedRect(x, top, mark, mark, 1.5, 1.5, 'F')
    doc.setDrawColor(...fg)
    doc.setLineWidth(stroke)
    doc.rect(x + mark * 0.16, top + mark * 0.16, mark * 0.68, mark * 0.68)
    doc.triangle(x + mark * 0.35, top + mark * 0.68, x + mark * 0.5, top + mark * 0.28, x + mark * 0.65, top + mark * 0.68, 'S')
    doc.setFillColor(...fg)
    doc.rect(x + mark * 0.4, top + mark * 0.52, mark * 0.2, stroke, 'F')

    doc.setTextColor(...fg)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(height * 0.42)
    doc.text('ALETIS', x + mark + 4, top + mark * 0.46)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(height * 0.17)
    doc.text('FINANCAS ESTRATEGICAS & AGROBUSINESS', x + mark + 4, top + mark * 0.72)
  }

  function drawAletisLogo(x: number, top: number, mode: 'light' | 'dark' = 'dark', height = 18) {
    const src = mode === 'light' ? logoReduzidoDark : logoReduzidoCream
    const width = height * ALETIS_REDUZIDO_ASPECT
    if (src) {
      doc.addImage(src, 'PNG', x, top, width, height, undefined, 'FAST')
      return
    }
    drawAletisLogoFallback(x, top, mode, height)
  }

  function ensureSpace(needed: number) {
    if (y + needed <= pageHeight - 22) return
    doc.addPage()
    y = 28
    drawPageTop()
  }

  function drawPageTop() {
    drawAletisLogo(marginX, 5, 'dark', 14)
    doc.setDrawColor(...BORDA_RGB)
    doc.line(marginX, 23, pageWidth - marginX, 23)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(110, 116, 126)
    doc.text('Relatorio tecnico confidencial', pageWidth - marginX, 13, { align: 'right' })
  }

  // Cover / first page
  doc.setFillColor(...VERDE_RGB)
  doc.rect(0, 0, pageWidth, 52, 'F')
  doc.setFillColor(...GOLD_RGB)
  doc.rect(0, 50, pageWidth, 2, 'F')
  drawAletisLogo(marginX, 6, 'light', 34)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(231, 226, 211)
  doc.text('Documento confidencial', pageWidth - marginX, 15, { align: 'right' })
  doc.text(`Gerado em ${report.gerado}`, pageWidth - marginX, 22, { align: 'right' })

  y = 66
  const eyebrow = report.cover?.eyebrow
  if (eyebrow) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...GOLD_RGB)
    doc.text(eyebrow.toUpperCase(), marginX, y)
    y += 6
  }

  doc.setTextColor(...VERDE_RGB)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  const titleLines = doc.splitTextToSize(report.titulo, contentWidth)
  doc.text(titleLines, marginX, y)
  y += titleLines.length * 7.2 + 2

  if (report.subtitulo) {
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAFITE_RGB)
    const subtitleLines = doc.splitTextToSize(report.subtitulo, contentWidth)
    doc.text(subtitleLines, marginX, y)
    y += subtitleLines.length * 4.8 + 6
  }

  if (report.cover?.resumo) {
    const resumoLines = doc.splitTextToSize(report.cover.resumo, contentWidth - 10)
    const boxHeight = Math.max(20, resumoLines.length * 4.3 + 11)
    doc.setFillColor(...CREAM_RGB)
    doc.setDrawColor(...BORDA_RGB)
    doc.roundedRect(marginX, y, contentWidth, boxHeight, 3, 3, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...VERDE_RGB)
    doc.text('Resumo executivo', marginX + 5, y + 7)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.6)
    doc.setTextColor(...GRAFITE_RGB)
    doc.text(resumoLines, marginX + 5, y + 13)
    y += boxHeight + 8
  }

  const coverKpis = report.cover?.kpis ?? []
  if (coverKpis.length > 0) {
    const cols = coverKpis.length <= 2 ? 2 : 4
    const colWidth = contentWidth / cols
    coverKpis.forEach((kpi, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const x = marginX + col * colWidth
      const top = y + row * 25

      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(...BORDA_RGB)
      doc.roundedRect(x, top, colWidth - 3, 21, 2.5, 2.5, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.7)
      doc.setTextColor(102, 112, 133)
      doc.text(kpi.label.toUpperCase(), x + 3.5, top + 4.8)
      doc.setFontSize(10.5)
      doc.setTextColor(...VERDE_RGB)
      const valueLines = doc.splitTextToSize(String(kpi.valor), colWidth - 10)
      doc.text(valueLines.slice(0, 2), x + 3.5, top + 11.2)
      if (kpi.apoio) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.4)
        doc.setTextColor(120, 120, 120)
        const apoioLines = doc.splitTextToSize(kpi.apoio, colWidth - 10)
        doc.text(apoioLines.slice(0, 1), x + 3.5, top + 18)
      }
    })
    y += Math.ceil(coverKpis.length / cols) * 25 + 8
  }

  // Sections
  for (const section of report.sections) {
    ensureSpace(22)

    if (section.titulo) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...VERDE_RGB)
      doc.text(section.titulo, 14, y)
      y += 4
      doc.setDrawColor(...BORDA_RGB)
      doc.line(14, y, pageWidth - 14, y)
      y += 4
    }
    if (section.descricao) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      const descriptionLines = doc.splitTextToSize(section.descricao, contentWidth)
      doc.text(descriptionLines, marginX, y)
      y += descriptionLines.length * 3.8 + 3
    }

    if (section.tipo === 'kpis' && section.kpis) {
      const cols = 4
      const colWidth = contentWidth / cols
      const cardHeight = 18
      section.kpis.forEach((kpi, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = marginX + col * colWidth
        const yy = y + row * cardHeight
        const toneFill = kpi.tone === 'success' ? SAGE_RGB : kpi.tone === 'warning' ? [252, 244, 218] as [number, number, number] : CREAM_RGB
        doc.setFillColor(...toneFill)
        doc.setDrawColor(...BORDA_RGB)
        doc.roundedRect(x, yy, colWidth - 3, 15.5, 2, 2, 'FD')
        doc.setFontSize(7)
        doc.setTextColor(120, 120, 120)
        doc.text(kpi.label, x + 3, yy + 4)
        doc.setFontSize(9.2)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...GRAFITE_RGB)
        const valueLines = doc.splitTextToSize(String(kpi.valor), colWidth - 8)
        doc.text(valueLines.slice(0, 2), x + 3, yy + 10.2)
        doc.setFont('helvetica', 'normal')
      })
      y += Math.ceil(section.kpis.length / cols) * cardHeight + 4
    } else if (section.tipo === 'tabela' && section.colunas && section.linhas) {
      ensureSpace(32)
      autoTable(doc, {
        startY: y,
        head: [section.colunas],
        body: section.linhas.map(row => row.map(c => String(c))),
        theme: 'plain',
        headStyles: {
          fillColor: VERDE_RGB,
          textColor: 255,
          fontSize: 8,
          fontStyle: 'bold',
          cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
        },
        bodyStyles: {
          fontSize: 7.6,
          textColor: GRAFITE_RGB,
          lineColor: BORDA_RGB,
          lineWidth: 0.15,
          cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
        },
        alternateRowStyles: { fillColor: CREAM_RGB },
        margin: { left: 14, right: 14 },
        styles: { overflow: 'linebreak', valign: 'middle' },
      })
      y = (doc as any).lastAutoTable.finalY + 6
    } else if (section.tipo === 'texto' && section.texto) {
      ensureSpace(20)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...GRAFITE_RGB)
      const lines = doc.splitTextToSize(section.texto, pageWidth - 28)
      doc.text(lines, 14, y)
      y += lines.length * 4 + 4
    }
  }

  // Footer
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.setDrawColor(...BORDA_RGB)
    doc.line(14, 284, pageWidth - 14, 284)
    doc.text(
      `ALETIS - Confidencial   |   Pagina ${i} de ${pages}`,
      pageWidth / 2,
      290,
      { align: 'center' }
    )
  }

  const filename = `${report.id}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}

// ── Excel Export ────────────────────────────────────────────
export async function exportExcel(report: ReportData): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const coverData: (string | number)[][] = [
    ['ALETIS — Financas Estrategicas'],
    [report.titulo],
    [],
    ['Gerado em', report.gerado],
  ]
  if (report.subtitulo) coverData.splice(2, 0, [report.subtitulo])
  const coverSheet = XLSX.utils.aoa_to_sheet(coverData)
  coverSheet['!cols'] = [{ wch: 30 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, coverSheet, 'Capa')

  report.sections.forEach((section, idx) => {
    let sheetData: (string | number)[][] = []
    let sheetName = section.titulo || `Secao ${idx + 1}`
    sheetName = sheetName.replace(/[:\\/?*[\]]/g, '').slice(0, 31)

    if (section.tipo === 'kpis' && section.kpis) {
      sheetData = [['Indicador', 'Valor']]
      section.kpis.forEach(kpi => sheetData.push([kpi.label, String(kpi.valor)]))
    } else if (section.tipo === 'tabela' && section.colunas && section.linhas) {
      sheetData = [section.colunas, ...section.linhas.map(r => r.slice())]
    } else if (section.tipo === 'texto' && section.texto) {
      sheetData = [[section.texto]]
    }

    if (sheetData.length > 0) {
      const sheet = XLSX.utils.aoa_to_sheet(sheetData)
      const colCount = sheetData[0]?.length || 1
      sheet['!cols'] = Array(colCount).fill({ wch: 22 })
      XLSX.utils.book_append_sheet(wb, sheet, sheetName)
    }
  })

  const filename = `${report.id}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}

// ── CSV Export (generic) ────────────────────────────────────
export function exportCSV(filename: string, colunas: string[], linhas: (string | number)[][]): void {
  const escape = (v: string | number): string => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [colunas.map(escape).join(',')]
  linhas.forEach(row => lines.push(row.map(escape).join(',')))
  const csv = '\uFEFF' + lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

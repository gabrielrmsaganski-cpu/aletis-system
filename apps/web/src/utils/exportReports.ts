// ============================================================
// ALETIS — Export utilities for reports (PDF + Excel)
// ============================================================

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

// ── Brand colors ────────────────────────────────────────────
const VERDE = '#0F4C35'
const GRAFITE = '#1F2937'

// ── Types ───────────────────────────────────────────────────
export interface ReportSection {
  tipo: 'kpis' | 'tabela' | 'texto'
  titulo?: string
  kpis?: { label: string; valor: string | number }[]
  colunas?: string[]
  linhas?: (string | number)[][]
  texto?: string
}

export interface ReportData {
  id: string
  titulo: string
  subtitulo?: string
  gerado: string
  sections: ReportSection[]
}

// ── Formatters ──────────────────────────────────────────────
export const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export const fmtNum = (v: number): string =>
  new Intl.NumberFormat('pt-BR').format(v)

export const nowStr = (): string =>
  new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// ── PDF Export ──────────────────────────────────────────────
export function exportPDF(report: ReportData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 18

  // Header bar
  doc.setFillColor(VERDE)
  doc.rect(0, 0, pageWidth, 14, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('ALETIS', 14, 9)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Financas Estrategicas & Agrobusiness', 35, 9)

  // Report title
  y = 24
  doc.setTextColor(GRAFITE)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(report.titulo, 14, y)
  y += 6
  if (report.subtitulo) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(report.subtitulo, 14, y)
    y += 5
  }
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(`Gerado em ${report.gerado}`, 14, y)
  y += 8

  // Sections
  for (const section of report.sections) {
    if (y > 260) {
      doc.addPage()
      y = 20
    }

    if (section.titulo) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(VERDE)
      doc.text(section.titulo, 14, y)
      y += 4
      doc.setDrawColor(200, 200, 200)
      doc.line(14, y, pageWidth - 14, y)
      y += 4
    }

    if (section.tipo === 'kpis' && section.kpis) {
      const cols = 4
      const colWidth = (pageWidth - 28) / cols
      section.kpis.forEach((kpi, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = 14 + col * colWidth
        const yy = y + row * 18
        doc.setFillColor(248, 246, 241)
        doc.roundedRect(x, yy, colWidth - 3, 14, 2, 2, 'F')
        doc.setFontSize(7)
        doc.setTextColor(120, 120, 120)
        doc.text(kpi.label, x + 3, yy + 4)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(GRAFITE)
        doc.text(String(kpi.valor), x + 3, yy + 11)
        doc.setFont('helvetica', 'normal')
      })
      y += Math.ceil(section.kpis.length / cols) * 18 + 4
    } else if (section.tipo === 'tabela' && section.colunas && section.linhas) {
      autoTable(doc, {
        startY: y,
        head: [section.colunas],
        body: section.linhas.map(row => row.map(c => String(c))),
        theme: 'striped',
        headStyles: { fillColor: VERDE, textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 246, 241] },
        margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 6
    } else if (section.tipo === 'texto' && section.texto) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(GRAFITE)
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
    doc.text(
      `ALETIS — Confidencial   |   Pagina ${i} de ${pages}`,
      pageWidth / 2,
      290,
      { align: 'center' }
    )
  }

  const filename = `${report.id}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}

// ── Excel Export ────────────────────────────────────────────
export function exportExcel(report: ReportData): void {
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

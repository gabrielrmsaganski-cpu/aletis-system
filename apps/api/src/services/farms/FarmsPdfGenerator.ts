/**
 * PDF FARMS - relatorio da Calculadora de Viabilidade Agricola v6.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { FarmsPlano } from '@aletis/shared-types'

const A4_W = 595.28
const A4_H = 841.89
const MX = 42
const MB = 52
const MT = 44

const VERDE = rgb(0x0f / 255, 0x4c / 255, 0x35 / 255)
const DOURADO = rgb(0xc9 / 255, 0xa8 / 255, 0x4c / 255)
const GRAFITE = rgb(0x2d / 255, 0x3a / 255, 0x2e / 255)
const CINZA = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255)
const FUNDO = rgb(0xf8 / 255, 0xf6 / 255, 0xf0 / 255)
const LINHA = rgb(0xe5 / 255, 0xe7 / 255, 0xeb / 255)

type Ctx = {
  doc: PDFDocument
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  y: number
}

function text(value: unknown): string {
  return String(value ?? '-')
    .replace(/[–—]/g, '-')
    .replace(/[•]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function brl(value: number | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function num(value: number | undefined, digits = 2): string {
  return (value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function pct(value: number | undefined): string {
  return `${num((value || 0) * 100, 1)}%`
}

function culturaLabel(cultura: string): string {
  return cultura.charAt(0).toUpperCase() + cultura.slice(1)
}

function headerFooter(ctx: Ctx): void {
  ctx.page.drawRectangle({ x: 0, y: A4_H - 6, width: A4_W, height: 6, color: DOURADO })
  ctx.page.drawText('ALETIS', { x: MX, y: MB - 22, size: 8, font: ctx.bold, color: VERDE })
  ctx.page.drawText('FARMS - Viabilidade Agricola', {
    x: A4_W - MX - 150,
    y: MB - 22,
    size: 7,
    font: ctx.font,
    color: CINZA,
  })
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([A4_W, A4_H])
  ctx.y = A4_H - MT
  headerFooter(ctx)
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MB) newPage(ctx)
}

function h1(ctx: Ctx, value: string): void {
  ensure(ctx, 32)
  ctx.page.drawText(text(value).toUpperCase(), {
    x: MX,
    y: ctx.y,
    size: 12,
    font: ctx.bold,
    color: VERDE,
  })
  ctx.page.drawLine({
    start: { x: MX, y: ctx.y - 8 },
    end: { x: MX + 150, y: ctx.y - 8 },
    thickness: 1.3,
    color: DOURADO,
  })
  ctx.y -= 26
}

function h2(ctx: Ctx, value: string): void {
  ensure(ctx, 18)
  ctx.page.drawText(text(value), { x: MX, y: ctx.y, size: 9, font: ctx.bold, color: GRAFITE })
  ctx.y -= 14
}

function line(ctx: Ctx, value: string, size = 8, color = GRAFITE): void {
  ensure(ctx, size + 6)
  ctx.page.drawText(text(value).slice(0, 110), {
    x: MX,
    y: ctx.y,
    size,
    font: ctx.font,
    color,
  })
  ctx.y -= size + 5
}

function labelValue(ctx: Ctx, label: string, value: string, col: 0 | 1 | 2 = 0): void {
  const colW = (A4_W - 2 * MX) / 3
  const x = MX + colW * col
  ensure(ctx, 24)
  ctx.page.drawText(text(label).toUpperCase(), { x, y: ctx.y, size: 6, font: ctx.bold, color: CINZA })
  ctx.page.drawText(text(value).slice(0, 28), { x, y: ctx.y - 10, size: 8.5, font: ctx.font, color: GRAFITE })
  if (col === 2) ctx.y -= 24
}

function table(ctx: Ctx, headers: string[], rows: string[][], widths: number[]): void {
  const rowH = 15
  ensure(ctx, rowH * 2)
  let x = MX
  ctx.page.drawRectangle({
    x: MX,
    y: ctx.y - rowH + 4,
    width: widths.reduce((a, b) => a + b, 0),
    height: rowH,
    color: FUNDO,
  })
  headers.forEach((head, i) => {
    ctx.page.drawText(text(head).slice(0, Math.floor(widths[i] / 4.5)), {
      x: x + 3,
      y: ctx.y - 7,
      size: 7,
      font: ctx.bold,
      color: GRAFITE,
    })
    x += widths[i]
  })
  ctx.y -= rowH

  for (const row of rows) {
    ensure(ctx, rowH + 2)
    x = MX
    row.forEach((cell, i) => {
      const max = Math.max(4, Math.floor((widths[i] - 6) / 4.3))
      ctx.page.drawText(text(cell).slice(0, max), {
        x: x + 3,
        y: ctx.y - 7,
        size: 7,
        font: ctx.font,
        color: GRAFITE,
      })
      x += widths[i]
    })
    ctx.page.drawLine({
      start: { x: MX, y: ctx.y - rowH + 4 },
      end: { x: MX + widths.reduce((a, b) => a + b, 0), y: ctx.y - rowH + 4 },
      thickness: 0.25,
      color: LINHA,
    })
    ctx.y -= rowH
  }
  ctx.y -= 8
}

export async function gerarPdfFarms(plano: FarmsPlano): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([A4_W, A4_H])
  const ctx: Ctx = { doc, page, font, bold, y: A4_H - MT }
  headerFooter(ctx)

  ctx.page.drawRectangle({ x: 0, y: A4_H - 152, width: A4_W, height: 102, color: VERDE })
  ctx.page.drawText('ALETIS', { x: MX, y: A4_H - 92, size: 25, font: bold, color: DOURADO })
  ctx.page.drawText('FARMS - VIABILIDADE AGRICOLA', {
    x: MX,
    y: A4_H - 120,
    size: 13,
    font: bold,
    color: rgb(1, 1, 1),
  })
  ctx.page.drawText(text(`${culturaLabel(plano.cultura)} | Safra ${plano.safra} | ${plano.nome}`), {
    x: MX,
    y: A4_H - 139,
    size: 8.5,
    font,
    color: rgb(1, 1, 1),
  })
  ctx.y = A4_H - 190

  h1(ctx, '1. Premissas')
  labelValue(ctx, 'Cliente', plano.clienteId, 0)
  labelValue(ctx, 'Cultura', culturaLabel(plano.cultura), 1)
  labelValue(ctx, 'Status', plano.status, 2)
  labelValue(ctx, 'Area aplicada', `${num(plano.areaAplicadaHa)} ha`, 0)
  labelValue(ctx, 'Area produtiva', `${num(plano.areaProdutivaHa)} ha`, 1)
  labelValue(ctx, 'Preco base', `${brl(plano.precoBaseRsSc)} / sc`, 2)
  labelValue(ctx, 'Unidade saca', `${num(plano.unidadeSacaKg, 0)} kg`, 0)
  labelValue(ctx, 'Desembolso total', brl(plano.resultado.desembolsoTotal), 1)
  labelValue(ctx, 'Desembolso/ha', brl(plano.resultado.desembolsoPorHa), 2)
  if (plano.observacoes) line(ctx, `Observacoes: ${plano.observacoes}`, 8, CINZA)
  ctx.y -= 8

  h1(ctx, '2. Resumo financeiro')
  table(
    ctx,
    ['Indicador', 'Valor'],
    [
      ['Custos variaveis', brl(plano.resultado.totalVariavel)],
      ['Custos fixos', brl(plano.resultado.totalFixo)],
      ['Desembolso total', brl(plano.resultado.desembolsoTotal)],
      ['Desembolso em sacas', `${num(plano.resultado.desembolsoSc)} sc`],
      ['Ponto equilibrio', `${num(plano.resultado.pontoEquilibrioScHa)} sc/ha`],
      ['Preco equilibrio', `${brl(plano.resultado.precoEquilibrioRsSc)} / sc`],
    ],
    [230, 170],
  )

  h1(ctx, '3. Cenarios de producao')
  table(
    ctx,
    ['Cenario', 'Kg/ha', 'Disp. sc', 'Lucro R$', 'Margem', 'Custo/sc'],
    plano.resultado.cenarios.map((c) => [
      c.nome,
      num(c.produtividadeKgHa, 0),
      num(c.disponivelSc),
      brl(c.lucroLiquidoRs),
      pct(c.margemPct),
      brl(c.custoRsSc),
    ]),
    [90, 70, 80, 100, 70, 85],
  )

  h1(ctx, '4. Custos variaveis')
  table(
    ctx,
    ['Insumo', 'Descricao', 'Qtd/ha', 'Un.', 'R$/un', 'Total'],
    plano.resultado.itens
      .filter((it) => it.grupo === 'variavel')
      .map((it) => [
        it.centroCusto,
        it.descricao || '-',
        num(it.quantidadePorHa, 4),
        it.unidade || '-',
        brl(it.valorUnitario),
        brl(it.valorTotal),
      ]),
    [128, 124, 58, 36, 72, 77],
  )

  h1(ctx, '5. Custos fixos')
  table(
    ctx,
    ['Item', 'Base', 'Formula', 'Pct', 'Total'],
    plano.resultado.itens
      .filter((it) => it.grupo === 'fixo')
      .map((it) => [
        it.centroCusto,
        it.descricao || '-',
        it.formula,
        it.percentual !== undefined ? pct(it.percentual) : '-',
        brl(it.valorTotal),
      ]),
    [150, 150, 90, 50, 55],
  )

  h1(ctx, '6. Observacoes tecnicas')
  line(ctx, `Origem: ${plano.origemPlanilha}.`)
  line(ctx, 'Formulas nativas: total por insumo, subtotal variavel, subtotal fixo, desembolso, producao bruta, umidade, secagem, arrendamento, frete, colaboradores, assistencia tecnica, disponibilidade, lucro liquido, custo por hectare e custo por saca.')
  if (plano.resultado.avisos.length) {
    h2(ctx, 'Alertas')
    for (const aviso of plano.resultado.avisos) line(ctx, `- ${aviso}`, 8, CINZA)
  }
  line(ctx, `Emitido em ${new Date().toLocaleDateString('pt-BR')}.`, 7, CINZA)

  return doc.save()
}

/**
 * CusteioPdfGenerator — Renderiza o Plano Simples de Custeio
 * Agrícola em PDF A4 usando `pdf-lib` (pure JS, sem puppeteer).
 *
 * Layout (7 seções):
 *   1. Capa — proponente + safra + versão
 *   2. Imóvel(is) — nome, matrícula, CAR, município/UF, área
 *   3. Glebas — tabela (gleba, cultura, área, coordenadas)
 *   4. Orçamento detalhado por categoria
 *   5. Cronograma de desembolso
 *   6. Indicadores (VPL, TIR, payback, margem, K giro)
 *   7. Assinaturas (proponente + ATER + data)
 *
 * Não usa imagens/gráficos — tudo em vetores nativos do pdf-lib.
 * Isso mantém o binário baixo e evita dependências nativas.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { PlanoCusteio, ItemOrcamento } from '@aletis/shared-types'

// Cores da marca (mesmo tom usado em PdfGenerator.ts)
const COR_VERDE = rgb(0x0f / 255, 0x4c / 255, 0x35 / 255)
const COR_DOURADO = rgb(0xc9 / 255, 0xa8 / 255, 0x4c / 255)
const COR_GRAFITE = rgb(0x2d / 255, 0x3a / 255, 0x2e / 255)
const COR_CINZA = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255)
const COR_CINZA_CLARO = rgb(0xf3 / 255, 0xf4 / 255, 0xf6 / 255)
const COR_FUNDO = rgb(0xf8 / 255, 0xf6 / 255, 0xf0 / 255)

const A4_W = 595.28
const A4_H = 841.89
const MARGEM_X = 50
const MARGEM_TOP = 50
const MARGEM_BOT = 60

function brl(v: number | undefined): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  const parts = iso.slice(0, 10).split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return iso
}

function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—'
  return `${(v * 100).toFixed(2).replace('.', ',')}%`
}

/**
 * Helper — escreve texto com wrap automático. Retorna a linha Y
 * após o último render (avança para baixo). Se wrap=true, quebra
 * o texto em `maxWidth` chars aproximado.
 */
interface DrawCtx {
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  y: number
  doc: PDFDocument
}

function newPage(ctx: DrawCtx): DrawCtx {
  ctx.page = ctx.doc.addPage([A4_W, A4_H])
  ctx.y = A4_H - MARGEM_TOP
  drawHeaderFooter(ctx)
  return ctx
}

function ensureSpace(ctx: DrawCtx, needed: number): DrawCtx {
  if (ctx.y - needed < MARGEM_BOT) {
    return newPage(ctx)
  }
  return ctx
}

function drawHeaderFooter(ctx: DrawCtx): void {
  // Barra superior dourada
  ctx.page.drawRectangle({
    x: 0, y: A4_H - 6, width: A4_W, height: 6,
    color: COR_DOURADO,
  })
  // Rodapé (linha)
  ctx.page.drawLine({
    start: { x: MARGEM_X, y: MARGEM_BOT - 20 },
    end: { x: A4_W - MARGEM_X, y: MARGEM_BOT - 20 },
    thickness: 0.5,
    color: COR_CINZA,
  })
  ctx.page.drawText('ALETIS — Consultoria Financeira Agro', {
    x: MARGEM_X,
    y: MARGEM_BOT - 32,
    size: 7,
    font: ctx.font,
    color: COR_CINZA,
  })
  ctx.page.drawText('Plano Simples de Custeio Agrícola — Versão 1.1/2026', {
    x: A4_W - MARGEM_X - 200,
    y: MARGEM_BOT - 32,
    size: 7,
    font: ctx.font,
    color: COR_CINZA,
  })
}

function title(ctx: DrawCtx, text: string): void {
  ensureSpace(ctx, 40)
  ctx.page.drawLine({
    start: { x: MARGEM_X, y: ctx.y + 2 },
    end: { x: MARGEM_X + 140, y: ctx.y + 2 },
    thickness: 2,
    color: COR_DOURADO,
  })
  ctx.page.drawText(text.toUpperCase(), {
    x: MARGEM_X,
    y: ctx.y - 12,
    size: 11,
    font: ctx.bold,
    color: COR_VERDE,
  })
  ctx.y -= 28
}

function subtitle(ctx: DrawCtx, text: string): void {
  ensureSpace(ctx, 18)
  ctx.page.drawText(text, {
    x: MARGEM_X,
    y: ctx.y,
    size: 9,
    font: ctx.bold,
    color: COR_GRAFITE,
  })
  ctx.y -= 14
}

function body(ctx: DrawCtx, text: string, opts: { size?: number; color?: ReturnType<typeof rgb> } = {}): void {
  const size = opts.size ?? 9
  ensureSpace(ctx, size + 4)
  ctx.page.drawText(text, {
    x: MARGEM_X,
    y: ctx.y,
    size,
    font: ctx.font,
    color: opts.color ?? COR_GRAFITE,
  })
  ctx.y -= size + 4
}

function labelValue(ctx: DrawCtx, label: string, value: string, col: 0 | 1 = 0): void {
  const xBase = col === 0 ? MARGEM_X : MARGEM_X + 250
  ensureSpace(ctx, 22)
  ctx.page.drawText(label.toUpperCase(), {
    x: xBase,
    y: ctx.y,
    size: 7,
    font: ctx.bold,
    color: COR_CINZA,
  })
  ctx.page.drawText(value, {
    x: xBase,
    y: ctx.y - 10,
    size: 9,
    font: ctx.font,
    color: COR_GRAFITE,
  })
  if (col === 1) ctx.y -= 22
}

function drawTable(
  ctx: DrawCtx,
  headers: string[],
  rows: string[][],
  colWidths: number[],
): void {
  const rowH = 16
  const neededForHeader = rowH + 4
  ensureSpace(ctx, neededForHeader)

  let x = MARGEM_X
  // Header
  ctx.page.drawRectangle({
    x: MARGEM_X,
    y: ctx.y - rowH + 4,
    width: colWidths.reduce((a, b) => a + b, 0),
    height: rowH,
    color: COR_CINZA_CLARO,
  })
  for (let i = 0; i < headers.length; i++) {
    ctx.page.drawText(headers[i], {
      x: x + 4,
      y: ctx.y - 8,
      size: 8,
      font: ctx.bold,
      color: COR_GRAFITE,
    })
    x += colWidths[i]
  }
  ctx.y -= rowH + 2

  for (const row of rows) {
    ctx = ensureSpace(ctx, rowH)
    x = MARGEM_X
    for (let i = 0; i < row.length; i++) {
      const text = row[i] ?? ''
      // Trunca texto pra caber na coluna aproximadamente
      const maxChars = Math.max(4, Math.floor((colWidths[i] - 8) / 5))
      const truncated = text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text
      ctx.page.drawText(truncated, {
        x: x + 4,
        y: ctx.y - 8,
        size: 8,
        font: ctx.font,
        color: COR_GRAFITE,
      })
      x += colWidths[i]
    }
    ctx.page.drawLine({
      start: { x: MARGEM_X, y: ctx.y - rowH + 4 },
      end: { x: MARGEM_X + colWidths.reduce((a, b) => a + b, 0), y: ctx.y - rowH + 4 },
      thickness: 0.3,
      color: rgb(0.9, 0.9, 0.9),
    })
    ctx.y -= rowH
  }
  ctx.y -= 8
}

function formatCpfCnpj(digits: string | undefined): string {
  if (!digits) return '—'
  const d = digits.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return d
}

// ─────────────────────────────────────────────────────────
// Agregadores
// ─────────────────────────────────────────────────────────

function agrupaPorCategoria(orcamento: ItemOrcamento[]): Array<{ categoria: string; itens: ItemOrcamento[]; total: number }> {
  const mapa = new Map<string, ItemOrcamento[]>()
  for (const it of orcamento) {
    const k = it.categoria || 'outros'
    if (!mapa.has(k)) mapa.set(k, [])
    mapa.get(k)!.push(it)
  }
  return Array.from(mapa.entries()).map(([categoria, itens]) => ({
    categoria,
    itens,
    total: itens.reduce((acc, it) => acc + (it.valorTotal || 0), 0),
  }))
}

const LABEL_CATEGORIA: Record<string, string> = {
  sementes: 'Sementes',
  fertilizantes: 'Fertilizantes',
  defensivos: 'Defensivos',
  combustivel: 'Combustível',
  arrendamento: 'Arrendamento',
  servicos_maquinas: 'Serviços de Máquinas',
  mao_obra: 'Mão de Obra',
  seguros: 'Seguros',
  financeiras: 'Despesas Financeiras',
  ater: 'ATER',
  outros: 'Outros',
}

// ─────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────

/**
 * Gera o PDF do Plano Simples de Custeio.
 * Retorna Uint8Array (bytes) — o caller se responsabiliza pelo envio.
 */
export async function gerarPdfCusteio(plano: PlanoCusteio): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([A4_W, A4_H])

  const ctx: DrawCtx = {
    page,
    font,
    bold,
    y: A4_H - MARGEM_TOP,
    doc,
  }
  drawHeaderFooter(ctx)

  // ── Capa ──
  ctx.page.drawRectangle({
    x: 0, y: A4_H - 160, width: A4_W, height: 100,
    color: COR_VERDE,
  })
  ctx.page.drawText('ALETIS', {
    x: MARGEM_X,
    y: A4_H - 110,
    size: 24,
    font: bold,
    color: COR_DOURADO,
  })
  ctx.page.drawText('PLANO SIMPLES DE CUSTEIO AGRÍCOLA', {
    x: MARGEM_X,
    y: A4_H - 135,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  })
  ctx.page.drawText(`Versão 1.1 / 2026 — Safra ${plano.safra}`, {
    x: MARGEM_X,
    y: A4_H - 152,
    size: 9,
    font,
    color: rgb(1, 1, 1),
  })
  ctx.y = A4_H - 200

  // ── 1. Proponente ──
  title(ctx, '1. Identificação do Proponente')
  labelValue(ctx, 'Nome', plano.proponente.nome || '—', 0)
  labelValue(ctx, 'Tipo', plano.proponente.tipo === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física', 1)
  labelValue(ctx, 'CPF/CNPJ', formatCpfCnpj(plano.proponente.cpfCnpj), 0)
  labelValue(ctx, 'Telefone', plano.proponente.telefone1 || '—', 1)
  labelValue(ctx, 'E-mail', plano.proponente.email || '—', 0)
  labelValue(ctx, 'Grupo', plano.proponente.grupo || '—', 1)

  if (plano.proponente.ater) {
    ctx.y -= 4
    subtitle(ctx, 'Assistência Técnica (ATER)')
    labelValue(ctx, 'Empresa', plano.proponente.ater.nomeEmpresa || '—', 0)
    labelValue(ctx, 'CNPJ', formatCpfCnpj(plano.proponente.ater.cnpj), 1)
    labelValue(ctx, 'Serviço', plano.proponente.ater.servicoPrestado || '—', 0)
    labelValue(ctx, 'CPF Técnico', formatCpfCnpj(plano.proponente.ater.cpfTecnico), 1)
  }
  ctx.y -= 8

  // ── 2. Imóveis ──
  title(ctx, '2. Imóvel(is) Rural(is)')
  if (plano.imoveis.length === 0) {
    body(ctx, 'Nenhum imóvel informado.')
  } else {
    for (const im of plano.imoveis) {
      subtitle(ctx, im.nome)
      labelValue(ctx, 'Matrícula', im.matricula || '—', 0)
      labelValue(ctx, 'CAR', im.car || '—', 1)
      labelValue(ctx, 'NIRF/CIB', im.nirfCib || '—', 0)
      labelValue(ctx, 'SNCR', im.sncr || '—', 1)
      labelValue(ctx, 'Município/UF', `${im.municipio || '—'} / ${im.uf || '—'}`, 0)
      labelValue(ctx, 'Área Total (ha)', im.areaTotalHa?.toFixed(2) ?? '—', 1)
      labelValue(ctx, 'Área Beneficiada (ha)', im.areaBeneficiadaHa?.toFixed(2) ?? '—', 0)
      labelValue(ctx, 'Regime', im.regimeExploracao, 1)
      if (im.perimetro && im.perimetro.length > 0) {
        body(ctx, `Perímetro: ${im.perimetro.length} pontos de coordenadas.`, { size: 8, color: COR_CINZA })
      }
      ctx.y -= 4
    }
  }

  // ── 3. Glebas ──
  title(ctx, '3. Glebas Beneficiadas')
  if (plano.glebas.length === 0) {
    body(ctx, 'Nenhuma gleba informada.')
  } else {
    drawTable(
      ctx,
      ['Gleba', 'Cultura', 'Área (ha)', 'Ciclo', 'Centróide'],
      plano.glebas.map((g) => [
        g.nomeGleba,
        g.cultura,
        g.areaHa?.toFixed(2) ?? '—',
        g.cicloProducao || '—',
        g.centroide ? `${g.centroide.lat.toFixed(4)}, ${g.centroide.lon.toFixed(4)}` : '—',
      ]),
      [100, 120, 60, 110, 105],
    )
    const areaTotal = plano.glebas.reduce((a, g) => a + (g.areaHa || 0), 0)
    body(ctx, `Área total das glebas: ${areaTotal.toFixed(2)} ha`, { size: 9 })
  }

  // ── 4. Orçamento ──
  title(ctx, '4. Orçamento Detalhado')
  const grupos = agrupaPorCategoria(plano.orcamento)
  if (grupos.length === 0) {
    body(ctx, 'Nenhum item de orçamento informado.')
  } else {
    for (const g of grupos) {
      subtitle(ctx, `${LABEL_CATEGORIA[g.categoria] || g.categoria} — ${brl(g.total)}`)
      drawTable(
        ctx,
        ['Descrição', 'Qtd', 'Unid.', 'Preço Unit.', 'Total'],
        g.itens.map((it) => [
          it.descricao,
          it.quantidade?.toString() ?? '—',
          it.unidade,
          brl(it.precoUnitario),
          brl(it.valorTotal),
        ]),
        [220, 40, 50, 85, 100],
      )
    }
    const totalOrcamento = plano.orcamento.reduce((a, it) => a + (it.valorTotal || 0), 0)
    ensureSpace(ctx, 28)
    ctx.page.drawRectangle({
      x: MARGEM_X, y: ctx.y - 20, width: A4_W - 2 * MARGEM_X, height: 24,
      color: COR_FUNDO,
    })
    ctx.page.drawText('TOTAL ORÇAMENTO', {
      x: MARGEM_X + 10,
      y: ctx.y - 12,
      size: 10,
      font: bold,
      color: COR_VERDE,
    })
    ctx.page.drawText(brl(totalOrcamento), {
      x: A4_W - MARGEM_X - 10 - brl(totalOrcamento).length * 6,
      y: ctx.y - 12,
      size: 10,
      font: bold,
      color: COR_VERDE,
    })
    ctx.y -= 32
  }

  // ── 5. Cronograma ──
  title(ctx, '5. Cronograma de Desembolso')
  if (plano.cronograma.length === 0) {
    body(ctx, 'Cronograma não informado.')
  } else {
    drawTable(
      ctx,
      ['Fase', 'Data Prevista', 'Valor', 'Descrição'],
      plano.cronograma.map((c) => [
        c.fase,
        fmtDate(c.dataPrevista),
        brl(c.valor),
        c.descricao || '—',
      ]),
      [150, 90, 100, 155],
    )
    const totalCron = plano.cronograma.reduce((a, c) => a + (c.valor || 0), 0)
    body(ctx, `Total de desembolsos: ${brl(totalCron)}`, { size: 9 })
  }

  // ── 6. Projeto / Fontes ──
  title(ctx, '6. Projeto e Fontes de Recurso')
  labelValue(ctx, 'Ciclo de Cultivo', plano.projeto.ciclo || '—', 0)
  labelValue(ctx, 'Safra', plano.projeto.safra, 1)
  labelValue(ctx, 'Valor Solicitado', brl(plano.projeto.valorSolicitado), 0)
  labelValue(ctx, 'Contrapartida', brl(plano.projeto.valorContrapartida), 1)
  labelValue(ctx, 'Valor Total', brl(plano.projeto.valorTotal), 0)
  labelValue(ctx, 'Receita Bruta Projetada', brl(plano.projeto.receitaBrutaProjetada), 1)
  if (plano.projeto.produtividadeEsperada) {
    labelValue(
      ctx,
      'Produtividade',
      `${plano.projeto.produtividadeEsperada} ${plano.projeto.unidadeProdutividade || ''}`,
      0,
    )
    labelValue(ctx, 'Preço Projetado', brl(plano.projeto.precoProjetado), 1)
  }
  if (plano.projeto.finalidade) {
    ctx.y -= 4
    body(ctx, `Finalidade: ${plano.projeto.finalidade}`, { size: 9 })
  }
  if (plano.projeto.fontes && plano.projeto.fontes.length > 0) {
    ctx.y -= 4
    subtitle(ctx, 'Fontes de Recurso')
    drawTable(
      ctx,
      ['Fonte', 'Instituição', 'Valor'],
      plano.projeto.fontes.map((f) => [f.fonte, f.instituicao || '—', brl(f.valor)]),
      [120, 220, 155],
    )
  }

  // ── 7. Indicadores ──
  title(ctx, '7. Indicadores do Projeto')
  if (!plano.resultadoEsperado) {
    body(ctx, 'Indicadores ainda não foram calculados.', { color: COR_CINZA })
  } else {
    const ind = plano.resultadoEsperado
    labelValue(ctx, 'VPL', brl(ind.vpl), 0)
    labelValue(ctx, 'TIR (a.a.)', `${ind.tirAnual.toFixed(2).replace('.', ',')}%`, 1)
    labelValue(ctx, 'Payback (meses)', ind.paybackMeses.toString(), 0)
    labelValue(ctx, 'Margem Líquida', fmtPct(ind.margemLiquida), 1)
    labelValue(ctx, 'Necessidade de Capital de Giro', brl(ind.necessidadeCapitalGiro), 0)
    labelValue(ctx, 'Taxa de Desconto', `${ind.taxaDescontoAnual.toFixed(2)}% a.a.`, 1)
    labelValue(ctx, 'Receita Bruta Total', brl(ind.receitaBrutaTotal), 0)
    labelValue(ctx, 'Custo Total', brl(ind.custoTotal), 1)

    if (ind.avisos && ind.avisos.length > 0) {
      ctx.y -= 4
      subtitle(ctx, 'Avisos')
      for (const a of ind.avisos) body(ctx, `• ${a}`, { size: 8, color: COR_CINZA })
    }
  }

  // ── 8. Comercialização & Garantias ──
  if (plano.comercializacao || plano.avalistas.length > 0) {
    title(ctx, '8. Comercialização e Garantias')
    if (plano.comercializacao) {
      subtitle(ctx, 'Plano de Comercialização')
      labelValue(ctx, 'Canal de Venda', plano.comercializacao.canalVenda, 0)
      labelValue(ctx, 'Comprador', plano.comercializacao.compradorPrincipal || '—', 1)
      if (plano.comercializacao.percentualTravado !== undefined) {
        labelValue(ctx, '% Travado', fmtPct(plano.comercializacao.percentualTravado / 100), 0)
        labelValue(ctx, 'Preço Referência', brl(plano.comercializacao.precoReferencia), 1)
      }
      if (plano.comercializacao.fontePreco) {
        body(ctx, `Fonte do preço: ${plano.comercializacao.fontePreco}`, { size: 8, color: COR_CINZA })
      }
    }
    if (plano.avalistas.length > 0) {
      ctx.y -= 4
      subtitle(ctx, 'Avalistas e Garantias')
      drawTable(
        ctx,
        ['Nome', 'CPF/CNPJ', 'Garantia', 'Valor'],
        plano.avalistas.map((a) => [
          a.nome,
          formatCpfCnpj(a.cpfCnpj),
          a.tipoGarantia,
          brl(a.valorGarantia),
        ]),
        [180, 130, 100, 85],
      )
    }
  }

  // ── Assinaturas ──
  ensureSpace(ctx, 100)
  ctx.y -= 20
  title(ctx, 'Assinaturas')
  ctx.y -= 40
  const colW = (A4_W - 2 * MARGEM_X) / 2 - 20
  ctx.page.drawLine({
    start: { x: MARGEM_X, y: ctx.y },
    end: { x: MARGEM_X + colW, y: ctx.y },
    thickness: 0.5,
    color: COR_GRAFITE,
  })
  ctx.page.drawLine({
    start: { x: A4_W - MARGEM_X - colW, y: ctx.y },
    end: { x: A4_W - MARGEM_X, y: ctx.y },
    thickness: 0.5,
    color: COR_GRAFITE,
  })
  ctx.page.drawText('Proponente', {
    x: MARGEM_X + colW / 2 - 25,
    y: ctx.y - 12,
    size: 8,
    font: bold,
    color: COR_GRAFITE,
  })
  ctx.page.drawText('Responsável Técnico (ATER)', {
    x: A4_W - MARGEM_X - colW / 2 - 55,
    y: ctx.y - 12,
    size: 8,
    font: bold,
    color: COR_GRAFITE,
  })
  ctx.page.drawText(`Emitido em ${fmtDate(new Date().toISOString())} — Plano versão ${plano.versao}`, {
    x: MARGEM_X,
    y: MARGEM_BOT - 8,
    size: 7,
    font,
    color: COR_CINZA,
  })

  return await doc.save()
}

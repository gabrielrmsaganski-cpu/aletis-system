/**
 * RelatorioGerencialGenerator — Gera um briefing executivo em PDF
 * do produtor rural, consolidando dívidas, produção, custeio ativo,
 * exposição por credor e status das fontes de dados.
 *
 * Não é um contrato — é um dashboard-PDF sob demanda, usado pelo
 * consultor antes de reuniões e para envio rápido ao cliente.
 *
 * Renderização em `pdf-lib` seguindo o mesmo padrão de
 * `CusteioPdfGenerator.ts` (helpers drawTable, title, labelValue,
 * header/footer da marca).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { DossieAgro } from '@aletis/shared-types'
import { getCusteioService } from '../custeio/CusteioService.js'
import { getFiscalService } from '../fiscal/FiscalService.js'
import { getDossieRepository } from '../cliente/DossieRepository.js'
import { DataSourceManager, type DataSourceEntry } from '../DataSourceManager.js'

// ───── Cores da marca (iguais ao CusteioPdfGenerator) ─────
const COR_VERDE = rgb(0x0f / 255, 0x4c / 255, 0x35 / 255)
const COR_DOURADO = rgb(0xc9 / 255, 0xa8 / 255, 0x4c / 255)
const COR_GRAFITE = rgb(0x2d / 255, 0x3a / 255, 0x2e / 255)
const COR_CINZA = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255)
const COR_CINZA_CLARO = rgb(0xf3 / 255, 0xf4 / 255, 0xf6 / 255)
const COR_FUNDO = rgb(0xf8 / 255, 0xf6 / 255, 0xf0 / 255)
const COR_VERMELHO = rgb(0xb0 / 255, 0x22 / 255, 0x1a / 255)
const COR_AMBAR = rgb(0xc0 / 255, 0x80 / 255, 0x10 / 255)

const A4_W = 595.28
const A4_H = 841.89
const MARGEM_X = 50
const MARGEM_TOP = 50
const MARGEM_BOT = 60

/**
 * Shape mínima do cliente que o relatório precisa. Intencionalmente
 * duck-typed — nem tudo do objeto cliente do CRM é relevante aqui.
 * Compatível com a estrutura persistida em `routes/clientes.ts`.
 */
export interface ClienteRelatorioSnapshot {
  id: string
  nome: string
  cpfCnpj?: string
  cidade?: string
  uf?: string
  telefone?: string
  email?: string
  atividade?: string
  areaTotalHa?: number
  culturas?: string[]
  estagio?: string
  consultor?: string
  credor?: string
  valorTotalDivida?: number
  valorTotalPago?: number
  dividas?: Array<{
    contrato: string
    valorOriginal: number
    valorAtualizado: number
    vencimento: string
    status: string
    credor: string
  }>
  pagamentos?: Array<{ data: string; valor: number; descricao?: string }>
  saudeFinanceira?: number
}

// ───── Helpers de formatação ─────

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

function fmtDateTime(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(d)
}

function formatCpfCnpj(digits: string | undefined): string {
  if (!digits) return '—'
  const d = digits.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return d
}

// ───── Render helpers (mirror do CusteioPdfGenerator) ─────

interface DrawCtx {
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  y: number
  doc: PDFDocument
}

function drawHeaderFooter(ctx: DrawCtx): void {
  // Barra superior dourada
  ctx.page.drawRectangle({
    x: 0,
    y: A4_H - 6,
    width: A4_W,
    height: 6,
    color: COR_DOURADO,
  })
  // Linha do rodapé
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
  ctx.page.drawText('Relatório Gerencial Agro', {
    x: A4_W - MARGEM_X - 140,
    y: MARGEM_BOT - 32,
    size: 7,
    font: ctx.font,
    color: COR_CINZA,
  })
}

function newPage(ctx: DrawCtx): DrawCtx {
  ctx.page = ctx.doc.addPage([A4_W, A4_H])
  ctx.y = A4_H - MARGEM_TOP
  drawHeaderFooter(ctx)
  return ctx
}

function ensureSpace(ctx: DrawCtx, needed: number): DrawCtx {
  if (ctx.y - needed < MARGEM_BOT) return newPage(ctx)
  return ctx
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

function body(
  ctx: DrawCtx,
  text: string,
  opts: { size?: number; color?: ReturnType<typeof rgb> } = {},
): void {
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
  ensureSpace(ctx, rowH + 4)

  let x = MARGEM_X
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
      end: {
        x: MARGEM_X + colWidths.reduce((a, b) => a + b, 0),
        y: ctx.y - rowH + 4,
      },
      thickness: 0.3,
      color: rgb(0.9, 0.9, 0.9),
    })
    ctx.y -= rowH
  }
  ctx.y -= 8
}

// ───── Agregadores específicos do relatório ─────

/**
 * Estima comprometimento mensal aproximado a partir das dívidas
 * ativas. Usa vencimento vs hoje: se dívida ativa e venc em até
 * 12 meses, divide o saldo em parcelas mensais até o vencimento.
 * É um proxy conservador — o consultor pode sobrescrever com dados
 * reais de contrato se disponíveis.
 */
function estimarComprometimentoMensal(cliente: ClienteRelatorioSnapshot): number {
  if (!cliente.dividas || cliente.dividas.length === 0) return 0
  const hoje = new Date()
  let total = 0
  for (const d of cliente.dividas) {
    if (d.status === 'paga') continue
    const venc = new Date(d.vencimento)
    if (isNaN(venc.getTime())) continue
    const meses = Math.max(
      1,
      Math.round((venc.getTime() - hoje.getTime()) / (30 * 24 * 3600 * 1000)),
    )
    if (meses > 24) continue
    total += (d.valorAtualizado || 0) / meses
  }
  return total
}

/**
 * Score de saúde financeira 0-100 baseado em:
 *  - Razão dívida/(área*10k) como proxy de endividamento por hectare
 *  - Proporção de dívidas ativas vs renegociadas/pagas
 * Score = 100 se endividamento baixo e tudo adimplente; cai com
 * dívida alta e com proporção de dívidas ativas. Clampeado em [0,100].
 */
function calcularSaudeFinanceira(cliente: ClienteRelatorioSnapshot): number {
  if (typeof cliente.saudeFinanceira === 'number') {
    return Math.max(0, Math.min(100, cliente.saudeFinanceira))
  }
  let score = 100
  const dividaTotal = cliente.valorTotalDivida ?? 0
  const area = cliente.areaTotalHa ?? 0
  if (dividaTotal > 0 && area > 0) {
    // Agro regra de bolso: até R$ 10k/ha = saudável; R$ 30k+/ha = crítico.
    const endivPorHa = dividaTotal / area
    const penalidade = Math.min(60, Math.max(0, (endivPorHa - 10000) / 500))
    score -= penalidade
  }
  const dividas = cliente.dividas ?? []
  if (dividas.length > 0) {
    const ativas = dividas.filter((d) => d.status === 'ativa').length
    const propAtivas = ativas / dividas.length
    score -= propAtivas * 30
  }
  return Math.round(Math.max(0, Math.min(100, score)))
}

/** Agrupa dívidas por credor, retornando os top N em saldo atualizado. */
function topCredores(
  cliente: ClienteRelatorioSnapshot,
  topN = 5,
): Array<{ credor: string; saldo: number; quantidade: number }> {
  const mapa = new Map<string, { saldo: number; quantidade: number }>()
  for (const d of cliente.dividas ?? []) {
    const credor = d.credor || '—'
    const atual = mapa.get(credor) ?? { saldo: 0, quantidade: 0 }
    atual.saldo += d.valorAtualizado || 0
    atual.quantidade += 1
    mapa.set(credor, atual)
  }
  return Array.from(mapa.entries())
    .map(([credor, v]) => ({ credor, ...v }))
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, topN)
}

// ───── Entry point ─────

export interface RelatorioGerencialOptions {
  /**
   * Se true, busca dossiê agro para enriquecer seção de produção.
   * Default true.
   */
  incluirDossie?: boolean
  /**
   * Se true, consulta DataSourceManager para exibir status das fontes.
   * Default true.
   */
  incluirStatusFontes?: boolean
}

/**
 * Gera o PDF do Relatório Gerencial Agro.
 * Retorna Uint8Array — o caller serve como application/pdf.
 */
export async function gerarPdfRelatorioGerencial(
  cliente: ClienteRelatorioSnapshot,
  opts: RelatorioGerencialOptions = {},
): Promise<Uint8Array> {
  const incluirDossie = opts.incluirDossie ?? true
  const incluirStatusFontes = opts.incluirStatusFontes ?? true

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

  // ───── 1. Capa ─────
  ctx.page.drawRectangle({
    x: 0,
    y: A4_H - 160,
    width: A4_W,
    height: 100,
    color: COR_VERDE,
  })
  ctx.page.drawText('ALETIS', {
    x: MARGEM_X,
    y: A4_H - 110,
    size: 24,
    font: bold,
    color: COR_DOURADO,
  })
  ctx.page.drawText('RELATÓRIO GERENCIAL AGRO', {
    x: MARGEM_X,
    y: A4_H - 135,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  })
  ctx.page.drawText(`Emitido em ${fmtDateTime(new Date().toISOString())}`, {
    x: MARGEM_X,
    y: A4_H - 152,
    size: 9,
    font,
    color: rgb(1, 1, 1),
  })
  ctx.y = A4_H - 200

  // Bloco de identificação do cliente
  title(ctx, '1. Identificação do Produtor')
  labelValue(ctx, 'Nome', cliente.nome || '—', 0)
  labelValue(ctx, 'CPF/CNPJ', formatCpfCnpj(cliente.cpfCnpj), 1)
  labelValue(
    ctx,
    'Município / UF',
    `${cliente.cidade || '—'} / ${cliente.uf || '—'}`,
    0,
  )
  labelValue(ctx, 'Atividade', cliente.atividade || '—', 1)
  labelValue(ctx, 'Telefone', cliente.telefone || '—', 0)
  labelValue(ctx, 'E-mail', cliente.email || '—', 1)
  labelValue(ctx, 'Consultor Responsável', cliente.consultor || '—', 0)
  labelValue(ctx, 'Estágio', cliente.estagio || '—', 1)
  ctx.y -= 8

  // ───── 2. Resumo Financeiro ─────
  title(ctx, '2. Resumo Financeiro')
  const saldoAtualizado = (cliente.dividas ?? []).reduce(
    (a, d) => a + (d.valorAtualizado || 0),
    0,
  )
  const comprometimentoMensal = estimarComprometimentoMensal(cliente)
  const saude = calcularSaudeFinanceira(cliente)

  labelValue(ctx, 'Dívida Total Atualizada', brl(cliente.valorTotalDivida ?? saldoAtualizado), 0)
  labelValue(ctx, 'Saldo Devedor (soma contratos)', brl(saldoAtualizado), 1)
  labelValue(ctx, 'Total Pago', brl(cliente.valorTotalPago), 0)
  labelValue(ctx, 'Comprometimento Mensal (est.)', brl(comprometimentoMensal), 1)

  // Barra de saúde financeira
  ensureSpace(ctx, 36)
  ctx.page.drawText('SAÚDE FINANCEIRA', {
    x: MARGEM_X,
    y: ctx.y,
    size: 7,
    font: bold,
    color: COR_CINZA,
  })
  const barraW = 300
  const barraX = MARGEM_X
  const barraY = ctx.y - 18
  ctx.page.drawRectangle({
    x: barraX,
    y: barraY,
    width: barraW,
    height: 10,
    color: COR_CINZA_CLARO,
  })
  const preenchimento = Math.max(0, Math.min(100, saude)) / 100
  const corScore = saude >= 70 ? COR_VERDE : saude >= 40 ? COR_AMBAR : COR_VERMELHO
  ctx.page.drawRectangle({
    x: barraX,
    y: barraY,
    width: barraW * preenchimento,
    height: 10,
    color: corScore,
  })
  ctx.page.drawText(`${saude} / 100`, {
    x: barraX + barraW + 8,
    y: barraY + 1,
    size: 10,
    font: bold,
    color: corScore,
  })
  ctx.y -= 32

  // ───── 3. Produção (via cliente + dossiê) ─────
  title(ctx, '3. Produção')
  labelValue(ctx, 'Área Total (ha)', cliente.areaTotalHa?.toFixed(2) ?? '—', 0)
  labelValue(ctx, 'Culturas', (cliente.culturas ?? []).join(', ') || '—', 1)

  if (incluirDossie) {
    let dossie: DossieAgro | null = null
    try {
      dossie = getDossieRepository().get(cliente.id)
    } catch {
      dossie = null
    }
    if (dossie) {
      ctx.y -= 4
      subtitle(ctx, 'Dossiê Agro')
      const numPropriedades = dossie.imoveis?.propriedades?.length ?? 0
      const areaPropriedades = dossie.imoveis?.propriedades?.reduce(
        (s, p) => s + (p.areasTotaisHa || 0),
        0,
      ) ?? 0
      const safras = dossie.producao?.agricultura?.length ?? 0
      labelValue(ctx, 'Propriedades cadastradas', String(numPropriedades), 0)
      labelValue(ctx, 'Área (dossiê)', `${areaPropriedades.toFixed(2)} ha`, 1)
      labelValue(ctx, 'Linhas de produção agrícola', String(safras), 0)
      labelValue(ctx, 'Versão do dossiê', `v${dossie.versao}`, 1)

      // Tabela das primeiras 5 linhas de produção agrícola
      // (pega a safra 'atual' se houver, senão a primeira disponível)
      const linhas = (dossie.producao?.agricultura ?? []).slice(0, 5)
      if (linhas.length > 0) {
        ctx.y -= 2
        drawTable(
          ctx,
          ['Cultura', 'UF', 'Safra', 'Área (ha)', 'Produtividade'],
          linhas.map((l) => {
            const safraAtual =
              l.safras?.find((s) => s.tipo === 'atual') ?? l.safras?.[0]
            const cultura = (l.cultura as string) ?? l.outroDescricao ?? '—'
            return [
              cultura,
              (l.uf as string) ?? '—',
              safraAtual?.safra ?? '—',
              safraAtual?.areaPlantadaHa?.toFixed(1) ?? '—',
              safraAtual?.rendimentoScHa
                ? `${safraAtual.rendimentoScHa} sc/ha`
                : '—',
            ]
          }),
          [130, 40, 70, 90, 165],
        )
      }
    } else {
      body(ctx, 'Dossiê agro ainda não cadastrado.', { color: COR_CINZA, size: 8 })
    }
  }

  // ───── 4. Planos de Custeio Ativos ─────
  title(ctx, '4. Planos de Custeio Ativos')
  try {
    const planos = getCusteioService().listarPorCliente(cliente.id)
    const ativos = planos.filter((p) => p.status !== 'rejeitado')
    if (ativos.length === 0) {
      body(ctx, 'Nenhum plano de custeio cadastrado.', { color: COR_CINZA, size: 8 })
    } else {
      drawTable(
        ctx,
        ['Safra', 'Status', 'Valor Solic.', 'Receita Proj.', 'Atualizado'],
        ativos.slice(0, 6).map((p) => [
          p.safra,
          p.status,
          brl(p.projeto?.valorSolicitado),
          brl(p.projeto?.receitaBrutaProjetada),
          fmtDate(p.atualizadoEm),
        ]),
        [90, 90, 100, 100, 115],
      )
    }
  } catch (err) {
    body(ctx, `Falha ao listar custeios: ${(err as Error).message}`, {
      color: COR_VERMELHO,
      size: 8,
    })
  }

  // ───── 5. Exposição por Credor ─────
  title(ctx, '5. Exposição por Credor (Top 5)')
  const topCreds = topCredores(cliente, 5)
  if (topCreds.length === 0) {
    body(ctx, 'Nenhuma dívida cadastrada.', { color: COR_CINZA, size: 8 })
  } else {
    const totalDiv = topCreds.reduce((s, c) => s + c.saldo, 0)
    drawTable(
      ctx,
      ['Credor', 'Contratos', 'Saldo Atual', '% do total'],
      topCreds.map((c) => [
        c.credor,
        String(c.quantidade),
        brl(c.saldo),
        totalDiv > 0 ? `${((c.saldo / totalDiv) * 100).toFixed(1)}%` : '—',
      ]),
      [200, 70, 120, 105],
    )
  }

  // ───── 6. Situação Fiscal (CNDs) ─────
  title(ctx, '6. Situação Fiscal')
  try {
    const checklist = getFiscalService().calcularChecklist(cliente.id)
    labelValue(ctx, 'Score Fiscal', `${checklist.scoreFiscal} / 100`, 0)
    labelValue(ctx, 'Total de CNDs', String(checklist.totalCertidoes), 1)
    labelValue(ctx, 'Válidas', String(checklist.validas), 0)
    labelValue(ctx, 'Vencidas', String(checklist.vencidas), 1)
    labelValue(ctx, 'Positivas (com débito)', String(checklist.positivas), 0)
    labelValue(ctx, 'Ausentes (obrigatórias)', String(checklist.ausentes), 1)

    if (checklist.alertas.length > 0) {
      ctx.y -= 4
      subtitle(ctx, 'Alertas')
      for (const a of checklist.alertas.slice(0, 8)) {
        body(ctx, `• ${a}`, { size: 8, color: COR_AMBAR })
      }
    }
  } catch (err) {
    body(ctx, `Falha ao calcular checklist fiscal: ${(err as Error).message}`, {
      color: COR_VERMELHO,
      size: 8,
    })
  }

  // ───── 7. Status das Fontes de Dados ─────
  if (incluirStatusFontes) {
    title(ctx, '7. Status das Fontes de Dados')
    try {
      const dash = DataSourceManager.getInstance().getDashboardStatus()
      labelValue(ctx, 'Total de Fontes', String(dash.resumo.total), 0)
      labelValue(ctx, 'Online', String(dash.resumo.online), 1)
      labelValue(ctx, 'Degradadas', String(dash.resumo.degraded), 0)
      labelValue(ctx, 'Offline', String(dash.resumo.offline), 1)
      labelValue(ctx, 'Última verificação', fmtDateTime(dash.ultimaVerificacao), 0)

      // Apenas fontes críticas (BCB, CONAB, NASA, IBGE) — 8 no máximo
      const criticas = dash.fontes.filter(
        (f) =>
          f.nome.startsWith('bcb_') ||
          f.nome.startsWith('conab_') ||
          f.nome.startsWith('nasa_') ||
          f.nome.startsWith('ibge_'),
      )
      const amostra = criticas.slice(0, 8)
      if (amostra.length > 0) {
        ctx.y -= 4
        drawTable(
          ctx,
          ['Fonte', 'Status', 'Latência', 'Atualização'],
          amostra.map((f: DataSourceEntry) => [
            f.nome,
            f.status,
            f.latenciaMs !== null ? `${f.latenciaMs} ms` : '—',
            fmtDateTime(f.ultimaAtualizacao ?? undefined),
          ]),
          [160, 90, 70, 175],
        )
      }
    } catch (err) {
      body(ctx, `Falha ao consultar fontes: ${(err as Error).message}`, {
        color: COR_CINZA,
        size: 8,
      })
    }
  }

  // ───── Rodapé de emissão ─────
  ensureSpace(ctx, 40)
  ctx.y -= 12
  ctx.page.drawRectangle({
    x: MARGEM_X,
    y: ctx.y - 20,
    width: A4_W - 2 * MARGEM_X,
    height: 24,
    color: COR_FUNDO,
  })
  ctx.page.drawText(
    `Gerado em ${fmtDateTime(new Date().toISOString())} por ALETIS Consultoria Financeira Agro`,
    {
      x: MARGEM_X + 10,
      y: ctx.y - 12,
      size: 8,
      font: bold,
      color: COR_VERDE,
    },
  )

  return await doc.save()
}

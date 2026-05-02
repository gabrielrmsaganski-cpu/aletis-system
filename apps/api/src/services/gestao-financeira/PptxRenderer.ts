// ============================================================
// PptxRenderer — gera apresentação .pptx do diagnóstico
// (R.OP.006) com 13 slides, charts nativos, branding ALETIS.
// ============================================================
// pptxgenjs publica como CJS — precisa default ou via .default em ESM
import pptxgenjsModule from 'pptxgenjs'
const PptxGenJS: any = (pptxgenjsModule as any).default ?? pptxgenjsModule
import { getGestaoFinanceiraService } from './GestaoFinanceiraService.js'
import { getGestaoFinanceiraServiceV2 } from './GestaoFinanceiraServiceV2.js'

export interface PptxOutput {
  buffer: Buffer
  filename: string
  contentType: string
  slides: number
}

const COLORS = {
  verde: '0F4C35',
  verdeEscuro: '0A3526',
  dourado: 'D4A574',
  douradoEscuro: 'A8814F',
  grafiteEscuro: '1F2937',
  grafiteClaro: '6B7280',
  cream: 'FAF7F0',
  vermelho: 'A0392F',
  amarelo: 'F59E0B',
  branco: 'FFFFFF',
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

export async function gerarPptxDiagnostico(grupoId: string): Promise<PptxOutput> {
  const svc = getGestaoFinanceiraService()
  const svcV2 = getGestaoFinanceiraServiceV2()
  const grupo = await svc.obterGrupo(grupoId)
  if (!grupo) throw new Error(`Grupo ${grupoId} não encontrado`)
  const dash = await svcV2.calcularDashboard360(grupoId)
  const membros = await svc.listarMembros(grupoId)
  const fazendas = (dash.ativos as any).fazendas ?? []

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'ALETIS'
  pptx.company = 'ALETIS Consultoria Financeira'
  pptx.title = `Diagnóstico Financeiro · ${grupo.nomeGrupo}`
  pptx.subject = 'Diagnóstico R.OP.001 v2.0'

  const slideMaster = pptx.defineSlideMaster({
    title: 'ALETIS_MASTER',
    background: { color: COLORS.cream },
    objects: [
      { rect: { x: 0, y: 0, w: 13.33, h: 0.4, fill: { color: COLORS.verde } } },
      { rect: { x: 0, y: 7.1, w: 13.33, h: 0.4, fill: { color: COLORS.verdeEscuro } } },
      { text: { text: 'ALETIS · Diagnóstico Financeiro', options: { x: 0.3, y: 7.15, w: 6, h: 0.3, fontSize: 9, color: COLORS.cream, fontFace: 'Arial' } } },
      { text: { text: grupo.nomeGrupo, options: { x: 7, y: 7.15, w: 6, h: 0.3, fontSize: 9, color: COLORS.cream, fontFace: 'Arial', align: 'right' } } },
    ],
    slideNumber: { x: 12.7, y: 7.18, fontSize: 8, color: COLORS.cream },
  })

  // ── SLIDE 1 — CAPA ─────────────────────────────────
  const s1 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  s1.addShape('rect', { x: 0, y: 0.4, w: 13.33, h: 6.7, fill: { color: COLORS.verdeEscuro } })
  s1.addText('R.OP.001 v2.0', { x: 0.6, y: 0.8, w: 12, h: 0.4, fontSize: 12, color: COLORS.dourado, fontFace: 'Arial', bold: true, charSpacing: 5 })
  s1.addText('DIAGNÓSTICO FINANCEIRO', { x: 0.6, y: 1.3, w: 12, h: 0.6, fontSize: 22, color: COLORS.cream, fontFace: 'Arial', bold: true })
  s1.addText(grupo.nomeGrupo, { x: 0.6, y: 2.1, w: 12, h: 1.2, fontSize: 44, color: COLORS.cream, fontFace: 'Arial', bold: true })
  s1.addText(`Data base: ${grupo.dataBase}`, { x: 0.6, y: 3.5, w: 12, h: 0.4, fontSize: 14, color: COLORS.dourado, fontFace: 'Arial' })
  s1.addText('CONSULTORIA FINANCEIRA · ALETIS', { x: 0.6, y: 6.0, w: 12, h: 0.4, fontSize: 11, color: COLORS.dourado, fontFace: 'Arial', charSpacing: 3 })
  s1.addText(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, { x: 0.6, y: 6.4, w: 12, h: 0.3, fontSize: 9, color: COLORS.cream, fontFace: 'Arial' })

  // ── SLIDE 2 — Sumário ─────────────────────────────
  const s2 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s2, 'Sumário')
  const sumario = [
    '1. Identificação do Grupo',
    '2. KPIs Principais',
    '3. Composição Societária',
    '4. Ativos — Imóveis Rurais',
    '5. Atividades Econômicas (Safras)',
    '6. Endividamento — Distribuição',
    '7. EBITDA por Cenário',
    '8. Raio X — Saldo 10 anos',
    '9. DRE FCL — 3 cenários',
    '10. Garantias e LTV',
    '11. Insights Críticos',
    '12. Recomendações',
    '13. 5 Cs do Crédito',
  ]
  sumario.forEach((item, i) => {
    s2.addText(item, { x: 0.8 + (i % 2) * 6, y: 1.6 + Math.floor(i / 2) * 0.5, w: 5.5, h: 0.4, fontSize: 13, color: COLORS.grafiteEscuro, fontFace: 'Arial', bullet: { code: '25A0' } })
  })

  // ── SLIDE 3 — KPIs ─────────────────────────────────
  const s3 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s3, 'KPIs Principais')
  const i = dash.raioX.indicadores
  const kpis = [
    { label: 'Receita Projetada', value: fmtBRL(i.receitaTotal), sub: `${dash.raioX.anos.length} anos`, color: COLORS.verde },
    { label: 'EBITDA Total', value: fmtBRL(i.ebitdaTotal), sub: `margem ${fmtPct(i.margemEbitda)}`, color: i.margemEbitda > 0.25 ? COLORS.verde : i.margemEbitda > 0.15 ? COLORS.amarelo : COLORS.vermelho },
    { label: 'Dívida Atual', value: fmtBRL(dash.endividamento.saldoTotalAtual), sub: `${dash.endividamento.totalContratos} contratos`, color: COLORS.grafiteEscuro },
    { label: 'Dívida / EBITDA', value: `${i.diviPorEbitda.toFixed(2)}x`, sub: i.diviPorEbitda < 3 ? 'saudável' : i.diviPorEbitda < 5 ? 'atenção' : 'crítico', color: i.diviPorEbitda < 3 ? COLORS.verde : i.diviPorEbitda < 5 ? COLORS.amarelo : COLORS.vermelho },
    { label: 'LTV Médio', value: fmtPct(dash.ltv.ltvMercadoMedio), sub: dash.ltv.ltvMercadoMedio < 0.5 ? 'liberado' : dash.ltv.ltvMercadoMedio < 0.8 ? 'comprometido' : 'stress', color: dash.ltv.ltvMercadoMedio < 0.5 ? COLORS.verde : dash.ltv.ltvMercadoMedio < 0.8 ? COLORS.amarelo : COLORS.vermelho },
    { label: 'Saldo Final Acum.', value: fmtBRL(i.saldoFinalAcumulado), sub: `em ${dash.raioX.anos.length} anos`, color: i.saldoFinalAcumulado > 0 ? COLORS.verde : COLORS.vermelho },
  ]
  kpis.forEach((kpi, idx) => {
    const col = idx % 3
    const row = Math.floor(idx / 3)
    const x = 0.5 + col * 4.2
    const y = 1.6 + row * 2.6
    s3.addShape('roundRect', { x, y, w: 4, h: 2.3, fill: { color: COLORS.branco }, line: { color: kpi.color, width: 3 }, rectRadius: 0.1 })
    s3.addText(kpi.label, { x: x + 0.3, y: y + 0.3, w: 3.4, h: 0.4, fontSize: 11, color: COLORS.grafiteClaro, fontFace: 'Arial', charSpacing: 2 })
    s3.addText(kpi.value, { x: x + 0.3, y: y + 0.8, w: 3.4, h: 0.9, fontSize: 28, color: kpi.color, fontFace: 'Arial', bold: true })
    s3.addText(kpi.sub, { x: x + 0.3, y: y + 1.7, w: 3.4, h: 0.4, fontSize: 10, color: COLORS.grafiteClaro, fontFace: 'Arial' })
  })

  // ── SLIDE 4 — Composição Societária ───────────────
  const s4 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s4, 'Composição Societária')
  if (membros.length === 0) {
    s4.addText('Não cadastrado.', { x: 0.6, y: 2, w: 12, h: 0.5, fontSize: 14, color: COLORS.grafiteClaro, fontFace: 'Arial', italic: true })
  } else {
    const tableRows = [
      [
        { text: 'NOME', options: { color: COLORS.branco, bold: true, fill: { color: COLORS.verde } } },
        { text: 'CPF/CNPJ', options: { color: COLORS.branco, bold: true, fill: { color: COLORS.verde } } },
        { text: 'RELAÇÃO', options: { color: COLORS.branco, bold: true, fill: { color: COLORS.verde } } },
        { text: 'ATIVO', options: { color: COLORS.branco, bold: true, fill: { color: COLORS.verde } } },
      ],
      ...membros.map((m) => [m.nome, m.cpfCnpj ?? '—', m.tipoRelacao ?? '—', m.atuaAtividade ? 'Sim' : 'Não']),
    ]
    s4.addTable(tableRows as any, { x: 0.5, y: 1.6, w: 12.3, fontSize: 12, fontFace: 'Arial', color: COLORS.grafiteEscuro, border: { type: 'solid', pt: 0.5, color: COLORS.grafiteClaro } })
  }

  // ── SLIDE 5 — Imóveis Rurais ──────────────────────
  const s5 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s5, 'Ativos — Imóveis Rurais')
  if (fazendas.length === 0) {
    s5.addText('Sem fazendas cadastradas.', { x: 0.6, y: 2, w: 12, h: 0.5, fontSize: 14, color: COLORS.grafiteClaro, fontFace: 'Arial', italic: true })
  } else {
    const headers = ['FAZENDA', 'CIDADE/UF', 'MATRÍCULA', 'ÁREA TOTAL', 'PLANTIO', 'V. MERCADO/HA']
    const tableRows = [
      headers.map((h) => ({ text: h, options: { color: COLORS.branco, bold: true, fill: { color: COLORS.verde } } })),
      ...fazendas.slice(0, 10).map((f: any) => [
        f.fazenda,
        `${f.cidade ?? ''}/${f.estado ?? ''}`,
        f.matricula ?? '—',
        f.areaTotalHa ? `${parseFloat(String(f.areaTotalHa)).toFixed(0)} ha` : '—',
        f.areaPlantioHa ? `${parseFloat(String(f.areaPlantioHa)).toFixed(0)} ha` : '—',
        f.valorHaMercado ? fmtBRL(parseFloat(String(f.valorHaMercado))) : '—',
      ]),
    ]
    s5.addTable(tableRows as any, { x: 0.4, y: 1.6, w: 12.5, fontSize: 11, fontFace: 'Arial', color: COLORS.grafiteEscuro, border: { type: 'solid', pt: 0.5, color: COLORS.grafiteClaro } })
  }

  // ── SLIDE 6 — Atividades Econômicas (chart) ───────
  const s6 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s6, 'Atividades Econômicas — Receita por Cultura')
  if (dash.safras[0]?.porCultura?.length > 0) {
    const culturas = dash.safras[0].porCultura
    const chartData = [{
      name: 'Receita',
      labels: culturas.map((c: any) => c.cultura),
      values: culturas.map((c: any) => c.receitaTotal),
    }]
    s6.addChart(pptx.ChartType.bar, chartData, {
      x: 0.5, y: 1.5, w: 12.3, h: 5,
      barDir: 'bar',
      chartColors: [COLORS.verde],
      showLegend: false,
      catAxisLabelFontSize: 11,
      valAxisLabelFontSize: 10,
      valAxisLabelFormatCode: '"R$" #,##0',
    } as any)
  } else {
    s6.addText('Sem culturas cadastradas.', { x: 0.6, y: 2, w: 12, h: 0.5, fontSize: 14, color: COLORS.grafiteClaro, fontFace: 'Arial', italic: true })
  }

  // ── SLIDE 7 — Endividamento (donut) ───────────────
  const s7 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s7, 'Endividamento — Distribuição por Credor')
  if (dash.endividamento.porCredor.length > 0) {
    const chartData = [{
      name: 'Saldo',
      labels: dash.endividamento.porCredor.slice(0, 8).map((c: any) => c.credor),
      values: dash.endividamento.porCredor.slice(0, 8).map((c: any) => c.saldo),
    }]
    s7.addChart(pptx.ChartType.doughnut, chartData, {
      x: 0.5, y: 1.5, w: 8, h: 5,
      chartColors: [COLORS.verde, COLORS.dourado, COLORS.vermelho, COLORS.amarelo, '5A8A6E', '7B5B30', '94A3B8', 'DC2626'],
      dataLabelFontSize: 10,
      showLegend: true,
      legendPos: 'r',
    } as any)
    // Tabela ao lado
    const tableRows = [
      [{ text: 'CREDOR', options: { bold: true, color: COLORS.branco, fill: { color: COLORS.verde } } }, { text: '%', options: { bold: true, color: COLORS.branco, fill: { color: COLORS.verde } } }],
      ...dash.endividamento.porCredor.slice(0, 6).map((c: any) => [c.credor, fmtPct(c.pctTotal)]),
    ]
    s7.addTable(tableRows as any, { x: 9, y: 1.6, w: 4, fontSize: 10, fontFace: 'Arial' })
  } else {
    s7.addText('Sem contratos cadastrados.', { x: 0.6, y: 2, w: 12, h: 0.5, fontSize: 14, color: COLORS.grafiteClaro, fontFace: 'Arial', italic: true })
  }

  // ── SLIDE 8 — Cenários FCL (line) ─────────────────
  const s8 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s8, 'FCL — 3 Cenários (10 anos)')
  const cenariosData = dash.dre.cenarios.map((c: any) => ({
    name: c.cenario,
    labels: c.linhas.map((l: any) => String(l.ano)),
    values: c.linhas.map((l: any) => l.fclPosDivida),
  }))
  s8.addChart(pptx.ChartType.line, cenariosData, {
    x: 0.5, y: 1.5, w: 12.3, h: 5,
    chartColors: [COLORS.vermelho, COLORS.verde, COLORS.dourado],
    showLegend: true,
    legendPos: 'b',
    catAxisLabelFontSize: 10,
    valAxisLabelFontSize: 10,
    valAxisLabelFormatCode: '"R$" #,##0',
  } as any)

  // ── SLIDE 9 — Raio X (line) ───────────────────────
  const s9 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s9, 'Raio X — Saldo Acumulado 10 anos')
  const raioXData = [{
    name: 'Saldo Acumulado',
    labels: dash.raioX.anos.map((a: any) => String(a.ano)),
    values: dash.raioX.anos.map((a: any) => a.saldoAcumulado),
  }]
  s9.addChart(pptx.ChartType.area, raioXData, {
    x: 0.5, y: 1.5, w: 12.3, h: 5,
    chartColors: [COLORS.verde],
    showLegend: false,
    catAxisLabelFontSize: 10,
    valAxisLabelFontSize: 10,
  } as any)

  // ── SLIDE 10 — Garantias LTV ──────────────────────
  const s10 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s10, 'Garantias e LTV')
  s10.addText(`LTV médio: ${fmtPct(dash.ltv.ltvMercadoMedio)} · Disponível: ${fmtBRL(dash.ltv.saldoDisponivelTotalMercado)}`, { x: 0.6, y: 1.4, w: 12, h: 0.5, fontSize: 14, color: COLORS.grafiteEscuro, fontFace: 'Arial', bold: true })
  if (dash.ltv.garantias.length > 0) {
    const headers = ['TIPO', 'DESCRIÇÃO', 'V. MERCADO', 'VINCULADO', 'LTV', 'STATUS']
    const tableRows = [
      headers.map((h) => ({ text: h, options: { color: COLORS.branco, bold: true, fill: { color: COLORS.verde } } })),
      ...dash.ltv.garantias.slice(0, 10).map((g: any) => [
        g.tipo,
        g.descricao,
        fmtBRL(g.valorMercado),
        fmtBRL(g.saldoVinculado),
        fmtPct(g.ltvMercado),
        g.status,
      ]),
    ]
    s10.addTable(tableRows as any, { x: 0.4, y: 2, w: 12.5, fontSize: 11, fontFace: 'Arial' })
  } else {
    s10.addText('Sem garantias formais cadastradas. LTV calculado considera apenas valor de mercado das fazendas.', { x: 0.6, y: 2.5, w: 12, h: 0.8, fontSize: 12, color: COLORS.grafiteClaro, fontFace: 'Arial', italic: true })
  }

  // ── SLIDE 11 — Insights ───────────────────────────
  const s11 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s11, 'Insights Críticos')
  const criticos = dash.insights.filter((i: any) => i.severidade === 'critico').slice(0, 5)
  const importantes = dash.insights.filter((i: any) => i.severidade === 'importante').slice(0, 5)
  let yPos = 1.4
  if (criticos.length > 0) {
    s11.addText('🔴 CRÍTICOS', { x: 0.5, y: yPos, w: 12, h: 0.4, fontSize: 13, color: COLORS.vermelho, fontFace: 'Arial', bold: true })
    yPos += 0.5
    criticos.forEach((ins: any) => {
      s11.addShape('rect', { x: 0.6, y: yPos, w: 12.2, h: 0.6, fill: { color: 'FEE2E2' }, line: { color: COLORS.vermelho, width: 1 } })
      s11.addText(`• ${ins.titulo}`, { x: 0.8, y: yPos + 0.05, w: 11.8, h: 0.5, fontSize: 11, color: COLORS.vermelho, fontFace: 'Arial', bold: true })
      yPos += 0.7
    })
  }
  if (importantes.length > 0 && yPos < 6) {
    s11.addText('⚠ IMPORTANTES', { x: 0.5, y: yPos, w: 12, h: 0.4, fontSize: 13, color: COLORS.amarelo, fontFace: 'Arial', bold: true })
    yPos += 0.5
    importantes.slice(0, 3).forEach((ins: any) => {
      if (yPos < 6.5) {
        s11.addShape('rect', { x: 0.6, y: yPos, w: 12.2, h: 0.5, fill: { color: 'FEF3C7' }, line: { color: COLORS.amarelo, width: 1 } })
        s11.addText(`• ${ins.titulo}`, { x: 0.8, y: yPos + 0.05, w: 11.8, h: 0.4, fontSize: 11, color: COLORS.grafiteEscuro, fontFace: 'Arial' })
        yPos += 0.6
      }
    })
  }
  if (criticos.length === 0 && importantes.length === 0) {
    s11.addText('✅ Nenhum insight crítico ou importante detectado. Operação dentro dos parâmetros saudáveis.', { x: 0.6, y: 2, w: 12, h: 1, fontSize: 16, color: COLORS.verde, fontFace: 'Arial', italic: true })
  }

  // ── SLIDE 12 — Recomendações ──────────────────────
  const s12 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s12, 'Recomendações Estratégicas')
  const recomendacoes = dash.insights
    .filter((i: any) => i.recomendacao)
    .slice(0, 6)
    .map((i: any) => i.recomendacao)
  if (recomendacoes.length === 0) {
    s12.addText('Operação saudável — manter monitoramento periódico (recálculo trimestral) e atualização de premissas (Selic/IPCA/dólar).', { x: 0.6, y: 2, w: 12, h: 1, fontSize: 14, color: COLORS.grafiteEscuro, fontFace: 'Arial' })
  } else {
    recomendacoes.forEach((r: string, idx: number) => {
      s12.addShape('roundRect', { x: 0.5, y: 1.4 + idx * 0.85, w: 12.3, h: 0.75, fill: { color: COLORS.branco }, line: { color: COLORS.dourado, width: 2 }, rectRadius: 0.05 })
      s12.addText(`${idx + 1}. ${r}`, { x: 0.7, y: 1.45 + idx * 0.85, w: 12, h: 0.65, fontSize: 11, color: COLORS.grafiteEscuro, fontFace: 'Arial' })
    })
  }

  // ── SLIDE 13 — 5 Cs do Crédito ────────────────────
  const s13 = pptx.addSlide({ masterName: 'ALETIS_MASTER' })
  addTitle(s13, 'Análise pelos 5 Cs do Crédito')
  const cs = [
    { c: 'CARÁTER', desc: 'Histórico do grupo e atuação dos sócios' },
    { c: 'CAPACIDADE', desc: `FCL médio ${fmtBRL(i.fclMedio)} — ${i.fclMedio > 0 ? 'suficiente' : 'INSUFICIENTE'}` },
    { c: 'CAPITAL', desc: `Patrimônio ${fmtBRL(dash.ltv.totalValorMercado)} · Dívida ${fmtBRL(dash.endividamento.saldoTotalAtual)}` },
    { c: 'COLATERAL', desc: `LTV ${fmtPct(dash.ltv.ltvMercadoMedio)} — ${dash.ltv.ltvMercadoMedio < 0.5 ? 'liberado' : dash.ltv.ltvMercadoMedio < 0.8 ? 'comprometido' : 'stress'}` },
    { c: 'CONDIÇÕES', desc: `Cenários FCL: pess. ${fmtBRL(dash.dre.cenarios[0].totais.fclTotal)} · base ${fmtBRL(dash.dre.cenarios[1].totais.fclTotal)} · otim. ${fmtBRL(dash.dre.cenarios[2].totais.fclTotal)}` },
  ]
  cs.forEach((item, idx) => {
    s13.addShape('roundRect', { x: 0.5, y: 1.4 + idx * 1.05, w: 12.3, h: 0.95, fill: { color: COLORS.branco }, line: { color: COLORS.verde, width: 2 }, rectRadius: 0.05 })
    s13.addText(item.c, { x: 0.8, y: 1.55 + idx * 1.05, w: 2.5, h: 0.6, fontSize: 16, color: COLORS.verde, fontFace: 'Arial', bold: true })
    s13.addText(item.desc, { x: 3.5, y: 1.6 + idx * 1.05, w: 9.2, h: 0.6, fontSize: 11, color: COLORS.grafiteEscuro, fontFace: 'Arial' })
  })

  // Save
  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  const dia = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const nameSafe = grupo.nomeGrupo.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40).trim().replace(/\s+/g, '_')
  return {
    buffer: buf,
    filename: `Diagnostico_${nameSafe}_${dia}.pptx`,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    slides: 13,
  }
}

function addTitle(slide: any, text: string) {
  slide.addText(text, { x: 0.5, y: 0.55, w: 12, h: 0.6, fontSize: 22, color: COLORS.verde, fontFace: 'Arial', bold: true })
  slide.addShape('rect', { x: 0.5, y: 1.18, w: 1.5, h: 0.05, fill: { color: COLORS.dourado } })
}

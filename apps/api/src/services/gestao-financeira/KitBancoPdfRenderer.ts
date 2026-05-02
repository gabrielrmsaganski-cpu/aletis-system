// ============================================================
// KitBancoPdfRenderer — gera PDF profissional do "Kit Banco"
// (sheet 18 - BANCO da R.OP.001 v2.0) para envio à IF.
// 13 seções: composição societária, histórico, regiões,
// know-how, atividades, infraestrutura, gestão, respaldo
// patrimonial, bancarização, DRE, faturamento, demanda
// crédito, garantias.
// ============================================================
import puppeteer from 'puppeteer'
import { getGestaoFinanceiraService } from './GestaoFinanceiraService.js'
import { getGestaoFinanceiraServiceV2 } from './GestaoFinanceiraServiceV2.js'

export interface KitBancoOutput {
  buffer: Buffer
  filename: string
  contentType: string
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function escape(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function buildHtml(grupoId: string): Promise<{ html: string; nomeGrupo: string }> {
  const svc = getGestaoFinanceiraService()
  const svcV2 = getGestaoFinanceiraServiceV2()
  const grupo = await svc.obterGrupo(grupoId)
  if (!grupo) throw new Error(`Grupo ${grupoId} não encontrado`)
  const dash = await svcV2.calcularDashboard360(grupoId)
  const [membros] = await Promise.all([svc.listarMembros(grupoId)])

  const { safras, endividamento, raioX, ltv, passivos, ativos, garantias } = dash
  const i = raioX.indicadores
  const fazendas = (ativos as any).fazendas ?? []

  const cssBase = `
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1F2937; line-height: 1.45; margin: 0; }
    h1 { font-size: 22pt; color: #0F4C35; margin: 0 0 4px; letter-spacing: -0.5px; }
    h2 { font-size: 13pt; color: #0F4C35; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #D4A574; }
    h3 { font-size: 11pt; color: #1F2937; margin: 10px 0 4px; }
    p { margin: 4px 0; }
    .header { border-bottom: 3px solid #0F4C35; padding-bottom: 10px; margin-bottom: 14px; }
    .header .meta { color: #6B7280; font-size: 8.5pt; margin-top: 4px; }
    .codigo { font-family: 'Courier New', monospace; font-size: 8pt; color: #0F4C35; letter-spacing: 1px; font-weight: 700; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .kpi { padding: 8px 10px; border-radius: 6px; background: #F9FAFB; border-left: 4px solid #0F4C35; }
    .kpi-label { font-size: 7.5pt; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 13pt; font-weight: 700; color: #0F4C35; margin-top: 2px; }
    .kpi-sub { font-size: 8pt; color: #6B7280; margin-top: 1px; }
    .kpi.warn { border-left-color: #F59E0B; }
    .kpi.warn .kpi-value { color: #B45309; }
    .kpi.bad { border-left-color: #DC2626; }
    .kpi.bad .kpi-value { color: #DC2626; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9pt; }
    th { background: #0F4C35; color: white; text-align: left; padding: 6px 8px; font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 5px 8px; border-bottom: 1px solid #E5E7EB; }
    tr:nth-child(even) td { background: #FAFAF9; }
    .right { text-align: right; }
    .center { text-align: center; }
    .nowrap { white-space: nowrap; }
    .total-row td { font-weight: 700; background: #FEF3C7 !important; border-top: 2px solid #D4A574; }
    .footer { position: fixed; bottom: 8mm; left: 16mm; right: 16mm; text-align: center; font-size: 7pt; color: #6B7280; border-top: 1px solid #E5E7EB; padding-top: 4px; }
    .pagebreak { page-break-after: always; }
    .narrative { background: #F9FAFB; padding: 10px 12px; border-radius: 6px; font-size: 9.5pt; line-height: 1.55; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #D4A574; color: #0F4C35; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.5px; }
    ul { padding-left: 16px; }
    li { margin: 2px 0; }
  `

  const html = `
<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Kit Banco — ${escape(grupo.nomeGrupo)}</title><style>${cssBase}</style></head><body>

<div class="header">
  <p class="codigo">R.OP.001 v2.0 · KIT BANCO · sheet 18</p>
  <h1>${escape(grupo.nomeGrupo)}</h1>
  <p class="meta">Diagnóstico Financeiro · Data base: ${escape(grupo.dataBase)} · Emitido em ${new Date().toLocaleDateString('pt-BR')}</p>
</div>

<h2>1. Composição Societária</h2>
${membros.length === 0 ? '<p class="narrative">Não cadastrado.</p>' : `
<table><thead><tr><th>Membro</th><th>CPF/CNPJ</th><th>Relação</th><th>Atua na atividade</th></tr></thead><tbody>
${membros.map((m: any) => `<tr><td>${escape(m.nome)}</td><td>${escape(m.cpfCnpj ?? '—')}</td><td>${escape(m.tipoRelacao ?? '—')}</td><td>${m.atuaAtividade ? 'Sim' : 'Não'}</td></tr>`).join('')}
</tbody></table>`}

<h2>2. Histórico</h2>
<div class="narrative">${escape(grupo.historico ?? 'Histórico não preenchido. Recomenda-se incluir narrativa de origem do grupo, atividade rural principal, posicionamento estratégico.')}</div>

<h2>3. Regiões de Atuação</h2>
<div class="narrative">${fazendas.length === 0 ? 'Não há fazendas cadastradas.' : 'Operação distribuída em ' + fazendas.length + ' fazenda(s) nos estados: <strong>' + Array.from(new Set(fazendas.map((f: any) => f.estado).filter(Boolean))).join(', ') + '</strong>.'}</div>

<h2>4. Atividades Econômicas</h2>
${safras.length === 0 ? '<p class="narrative">Sem culturas cadastradas.</p>' : `
<table><thead><tr><th>Cultura</th><th class="right">Área (ha)</th><th class="right">Rendimento</th><th class="right">Receita projetada</th><th class="right">Margem bruta</th></tr></thead><tbody>
${safras[0]?.porCultura?.map((c: any) => `<tr>
  <td>${escape(c.cultura)}</td>
  <td class="right">${c.areaPlantadaHa.toFixed(0)}</td>
  <td class="right">${c.rendimentoScHa.toFixed(0)} sc/ha</td>
  <td class="right nowrap">${fmtBRL(c.receitaTotal)}</td>
  <td class="right">${(c.margemBruta * 100).toFixed(1)}%</td>
</tr>`).join('') ?? ''}
<tr class="total-row">
  <td>TOTAL</td>
  <td class="right">${safras[0]?.totalAreaHa?.toFixed(0) ?? '0'}</td>
  <td></td>
  <td class="right nowrap">${fmtBRL(safras[0]?.receitaTotal ?? 0)}</td>
  <td class="right">${((safras[0]?.margemBruta ?? 0) * 100).toFixed(1)}%</td>
</tr>
</tbody></table>`}

<h2>5. Infraestrutura — Imóveis Rurais</h2>
${fazendas.length === 0 ? '<p class="narrative">Não cadastrado.</p>' : `
<table><thead><tr><th>Fazenda</th><th>Município/UF</th><th>Matrícula</th><th class="right">Área total</th><th class="right">Plantio</th><th class="right">Valor mercado/ha</th></tr></thead><tbody>
${fazendas.map((f: any) => `<tr>
  <td>${escape(f.fazenda)}</td>
  <td>${escape(f.cidade ?? '')}/${escape(f.estado ?? '')}</td>
  <td>${escape(f.matricula ?? '—')}</td>
  <td class="right">${parseFloat(String(f.areaTotalHa ?? 0)).toFixed(0)} ha</td>
  <td class="right">${parseFloat(String(f.areaPlantioHa ?? 0)).toFixed(0)} ha</td>
  <td class="right nowrap">${fmtBRL(parseFloat(String(f.valorHaMercado ?? 0)))}</td>
</tr>`).join('')}
</tbody></table>`}

<h2>6. Respaldo Patrimonial</h2>
<div class="grid-3">
  <div class="kpi"><div class="kpi-label">Valor de mercado</div><div class="kpi-value">${fmtBRL(ltv.totalValorMercado)}</div><div class="kpi-sub">${fazendas.length} fazendas</div></div>
  <div class="kpi"><div class="kpi-label">Valor venda forçada</div><div class="kpi-value">${fmtBRL(ltv.totalValorForcado)}</div><div class="kpi-sub">conservador</div></div>
  <div class="kpi ${ltv.ltvMercadoMedio > 0.8 ? 'bad' : ltv.ltvMercadoMedio > 0.5 ? 'warn' : ''}"><div class="kpi-label">LTV médio</div><div class="kpi-value">${(ltv.ltvMercadoMedio * 100).toFixed(0)}%</div><div class="kpi-sub">disponível ${fmtBRL(ltv.saldoDisponivelTotalMercado)}</div></div>
</div>

<div class="pagebreak"></div>

<h2>7. Bancarização</h2>
<div class="grid-2">
  <div class="kpi"><div class="kpi-label">Dívida total atual</div><div class="kpi-value">${fmtBRL(endividamento.saldoTotalAtual)}</div><div class="kpi-sub">${endividamento.totalContratos} contratos</div></div>
  <div class="kpi ${i.diviPorEbitda > 5 ? 'bad' : i.diviPorEbitda > 3 ? 'warn' : ''}"><div class="kpi-label">Dívida / EBITDA</div><div class="kpi-value">${i.diviPorEbitda.toFixed(2)}x</div><div class="kpi-sub">${i.diviPorEbitda < 3 ? 'saudável' : i.diviPorEbitda < 5 ? 'atenção' : 'crítico'}</div></div>
</div>

<h3>Distribuição por credor</h3>
<table><thead><tr><th>Credor</th><th class="right">Saldo</th><th class="right">% do total</th><th class="right">Contratos</th></tr></thead><tbody>
${endividamento.porCredor.map((c: any) => `<tr>
  <td>${escape(c.credor)}</td>
  <td class="right nowrap">${fmtBRL(c.saldo)}</td>
  <td class="right">${(c.pctTotal * 100).toFixed(1)}%</td>
  <td class="right">${c.contratos}</td>
</tr>`).join('')}
<tr class="total-row"><td>TOTAL</td><td class="right nowrap">${fmtBRL(endividamento.saldoTotalAtual)}</td><td class="right">100%</td><td class="right">${endividamento.totalContratos}</td></tr>
</tbody></table>

<h2>8. Demonstrativo de Resultados (DRE projetado — cenário base)</h2>
${dash.dre.cenarios.find((c: any) => c.cenario === 'base') ? `
<table><thead><tr><th>Ano</th><th class="right">Receita</th><th class="right">Custo direto</th><th class="right">EBITDA</th><th class="right">Serviço dívida</th><th class="right">FCL</th></tr></thead><tbody>
${dash.dre.cenarios.find((c: any) => c.cenario === 'base').linhas.slice(0, 7).map((l: any) => `<tr>
  <td>${l.ano}</td>
  <td class="right nowrap">${fmtBRL(l.receitaBruta)}</td>
  <td class="right nowrap">${fmtBRL(l.custoDireto)}</td>
  <td class="right nowrap">${fmtBRL(l.ebitda)}</td>
  <td class="right nowrap">${fmtBRL(l.servicoDivida)}</td>
  <td class="right nowrap" style="${l.fclPosDivida < 0 ? 'color:#DC2626;font-weight:700' : ''}">${fmtBRL(l.fclPosDivida)}</td>
</tr>`).join('')}
</tbody></table>` : '<p class="narrative">Sem dados para projeção.</p>'}

<h2>9. Faturamento Anual Bruto</h2>
<div class="grid-3">
  <div class="kpi"><div class="kpi-label">Receita projetada total</div><div class="kpi-value">${fmtBRL(i.receitaTotal)}</div><div class="kpi-sub">${raioX.anos.length} anos</div></div>
  <div class="kpi ${i.margemEbitda < 0.15 ? 'warn' : ''}"><div class="kpi-label">EBITDA total</div><div class="kpi-value">${fmtBRL(i.ebitdaTotal)}</div><div class="kpi-sub">margem ${(i.margemEbitda * 100).toFixed(1)}%</div></div>
  <div class="kpi"><div class="kpi-label">FCL médio anual</div><div class="kpi-value">${fmtBRL(i.fclMedio)}</div></div>
</div>

<h2>10. Demanda de Crédito</h2>
<table><thead><tr><th>Tomador</th><th>Credor alvo</th><th>Finalidade</th><th>Modalidade</th><th class="right">Valor</th><th>Prazo</th><th>Status</th></tr></thead><tbody>
${(await svc.listarDemandas(grupoId)).length === 0
  ? '<tr><td colspan="7" class="center" style="padding:14px;color:#6B7280">Nenhuma demanda em aberto.</td></tr>'
  : (await svc.listarDemandas(grupoId)).map((d: any) => `<tr>
  <td>${escape(d.tomador ?? '—')}</td>
  <td>${escape(d.credor ?? '—')}</td>
  <td>${escape(d.finalidade ?? '—')}</td>
  <td>${escape(d.modalidade ?? '—')}</td>
  <td class="right nowrap">${fmtBRL(parseFloat(String(d.valor ?? 0)))}</td>
  <td>${escape(d.prazo ?? '—')}</td>
  <td><span class="badge">${escape(d.status ?? '—')}</span></td>
</tr>`).join('')}
</tbody></table>

<h2>11. Resumo das Garantias</h2>
${garantias.length === 0 ? '<p class="narrative">Nenhuma garantia cadastrada formalmente. Análise depende de imóveis rurais (seção 5) e fluxo de caixa.</p>' : `
<table><thead><tr><th>Tipo</th><th>Descrição</th><th>Matrícula</th><th class="right">V. Mercado</th><th class="right">Vinculado</th><th class="right">LTV</th></tr></thead><tbody>
${ltv.garantias.map((g: any) => `<tr>
  <td><span class="badge">${escape(g.tipo)}</span></td>
  <td>${escape(g.descricao)}</td>
  <td>${escape(g.matricula ?? '—')}</td>
  <td class="right nowrap">${fmtBRL(g.valorMercado)}</td>
  <td class="right nowrap">${fmtBRL(g.saldoVinculado)}</td>
  <td class="right" style="${g.ltvMercado > 0.8 ? 'color:#DC2626;font-weight:700' : g.ltvMercado > 0.5 ? 'color:#B45309' : ''}">${(g.ltvMercado * 100).toFixed(0)}%</td>
</tr>`).join('')}
</tbody></table>`}

<h2>12. Análise Financeira Consolidada</h2>
<div class="narrative">
${i.diviPorEbitda < 3 ? '<p>✅ <strong>Alavancagem saudável</strong> — Dívida/EBITDA ' + i.diviPorEbitda.toFixed(2) + 'x dentro do parâmetro bancário (≤3x).</p>' : ''}
${i.diviPorEbitda >= 3 && i.diviPorEbitda < 5 ? '<p>⚠ <strong>Alavancagem em atenção</strong> — Dívida/EBITDA ' + i.diviPorEbitda.toFixed(2) + 'x. Recomenda-se amortização extraordinária da safra atual.</p>' : ''}
${i.diviPorEbitda >= 5 ? '<p>🔴 <strong>Alavancagem crítica</strong> — Dívida/EBITDA ' + i.diviPorEbitda.toFixed(2) + 'x. Sugere-se renegociação imediata para alongamento de prazo.</p>' : ''}
${i.margemEbitda > 0.30 ? '<p>✅ Margem operacional saudável (' + (i.margemEbitda * 100).toFixed(1) + '%) — operação rentável.</p>' : i.margemEbitda > 0.15 ? '<p>⚠ Margem operacional sob pressão (' + (i.margemEbitda * 100).toFixed(1) + '%) — revisar custos diretos.</p>' : '<p>🔴 Margem operacional baixa (' + (i.margemEbitda * 100).toFixed(1) + '%) — operação no limite.</p>'}
${i.saldoFinalAcumulado > 0 ? '<p>✅ Saldo acumulado positivo no horizonte projetado (' + fmtBRL(i.saldoFinalAcumulado) + ').</p>' : '<p>🔴 Saldo acumulado negativo (' + fmtBRL(i.saldoFinalAcumulado) + ') — necessidade de funding ou renegociação.</p>'}
</div>

<h2>13. Análise pelos 5 C's do Crédito</h2>
<div class="grid-2">
  <div class="kpi"><div class="kpi-label">Caráter</div><div class="kpi-sub">Avaliado pelo histórico do grupo (seção 2) e atuação dos sócios.</div></div>
  <div class="kpi"><div class="kpi-label">Capacidade</div><div class="kpi-sub">FCL médio ${fmtBRL(i.fclMedio)} (seção 8). ${i.fclMedio > 0 ? 'Suficiente para cumprir compromissos.' : 'INSUFICIENTE no cenário base.'}</div></div>
  <div class="kpi"><div class="kpi-label">Capital</div><div class="kpi-sub">Patrimônio rural ${fmtBRL(ltv.totalValorMercado)}. Endividamento bancário ${fmtBRL(endividamento.saldoTotalAtual)}. Liquidez patrimonial: ${ltv.totalValorMercado > 0 ? ((1 - endividamento.saldoTotalAtual / ltv.totalValorMercado) * 100).toFixed(0) + '%' : '—'}.</div></div>
  <div class="kpi"><div class="kpi-label">Colateral (Garantias)</div><div class="kpi-sub">LTV médio ${(ltv.ltvMercadoMedio * 100).toFixed(0)}% — ${ltv.ltvMercadoMedio < 0.5 ? 'liberado' : ltv.ltvMercadoMedio < 0.8 ? 'comprometido' : 'em stress'}.</div></div>
  <div class="kpi"><div class="kpi-label">Condições (Cenário)</div><div class="kpi-sub">Cenário pessimista ${fmtBRL(dash.dre.cenarios[0].totais.fclTotal)} · base ${fmtBRL(dash.dre.cenarios[1].totais.fclTotal)} · otimista ${fmtBRL(dash.dre.cenarios[2].totais.fclTotal)} (10a).</div></div>
</div>

<div class="footer">
  Documento gerado por ALETIS · Sistema R.OP.001 v2.0 · ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · Página <span class="pageNumber"></span>
</div>

</body></html>
  `

  return { html, nomeGrupo: grupo.nomeGrupo }
}

export async function gerarKitBancoPdf(grupoId: string): Promise<KitBancoOutput> {
  const { html, nomeGrupo } = await buildHtml(grupoId)

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '16mm', bottom: '20mm', left: '16mm' },
      displayHeaderFooter: false,
    })
    const dia = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const nameSafe = nomeGrupo.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40).trim().replace(/\s+/g, '_')
    return {
      buffer: Buffer.from(pdf),
      filename: `KitBanco_${nameSafe}_${dia}.pdf`,
      contentType: 'application/pdf',
    }
  } finally {
    await browser.close()
  }
}

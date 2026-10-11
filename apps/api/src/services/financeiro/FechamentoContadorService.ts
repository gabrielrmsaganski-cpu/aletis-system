/**
 * FechamentoContadorService — empacota o mês completo para o contador.
 *
 * Entrega:
 *   - ZIP com todos os anexos do mês organizados por pasta
 *     (receitas/ despesas/ impostos/ extratos/)
 *   - manifesto.json descrevendo cada entidade
 *   - receitas.csv, despesas.csv, impostos.csv, extratos.csv (visão tabular)
 *   - balancete.csv com DRE mensal resumido
 *   - PDF formal (capa + DRE + DAS + balancete + checklist)
 *
 * O objetivo é que o consultor possa, a qualquer momento, gerar o pacote
 * do mês e mandar por e-mail ao contador sem trabalho adicional.
 */

import JSZip from 'jszip'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import puppeteer, { type Browser } from 'puppeteer'
import type {
  Receita,
  Despesa,
  Imposto,
  LancamentoBancario,
  DREMensal,
  CalculoDAS,
  ChecklistFechamento,
  PacoteFechamento,
  ConfiguracaoFinanceiro,
  CategoriaDespesa,
} from './types.js'
import { CATEGORIAS_DESPESA } from './types.js'
import type { FinanceiroService } from './FinanceiroService.js'
import { calcularDAS } from './simples-nacional.js'

const CATEGORIA_NOMES: Record<string, string> = Object.fromEntries(
  CATEGORIAS_DESPESA.map((c) => [c.id, c.nome])
)

const formatBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const formatDate = (iso: string): string => {
  if (!iso) return '-'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const formatCompetencia = (c: string): string => {
  const [ano, mes] = c.split('-').map(Number)
  const nomes = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  return `${nomes[mes - 1]}/${ano}`
}

const escapeCsv = (v: string | number | undefined | null): string => {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/* ────────────────── CSV helpers ────────────────── */

function receitasCsv(receitas: Receita[]): string {
  const headers = [
    'id', 'competencia', 'dataEmissao', 'dataRecebimento', 'descricao',
    'cliente', 'cnpjCpf', 'valorBruto', 'iss', 'ir', 'inss', 'valorLiquido',
    'nfseNumero', 'nfseDataEmissao', 'status', 'formaPagamento', 'anexos',
  ]
  const rows = receitas.map((r) => [
    r.id,
    r.competencia,
    r.dataEmissao.slice(0, 10),
    r.dataRecebimento?.slice(0, 10) ?? '',
    r.descricao,
    r.cliente?.nome ?? '',
    r.cliente?.cpfCnpj ?? '',
    r.valorBruto.toFixed(2).replace('.', ','),
    (r.retencoes?.iss ?? 0).toFixed(2).replace('.', ','),
    (r.retencoes?.ir ?? 0).toFixed(2).replace('.', ','),
    (r.retencoes?.inss ?? 0).toFixed(2).replace('.', ','),
    r.valorLiquido.toFixed(2).replace('.', ','),
    r.nfse?.numero ?? '',
    r.nfse?.dataEmissao?.slice(0, 10) ?? '',
    r.status,
    r.formaPagamento ?? '',
    r.anexos.map((a) => a.nomeOriginal).join('|'),
  ].map(escapeCsv).join(';'))
  return [headers.join(';'), ...rows].join('\n')
}

function despesasCsv(despesas: Despesa[]): string {
  const headers = [
    'id', 'competencia', 'dataEmissao', 'dataVencimento', 'dataPagamento',
    'descricao', 'fornecedor', 'cnpjCpf', 'categoria', 'valor',
    'status', 'formaPagamento', 'nfNumero', 'recorrente', 'anexos',
  ]
  const rows = despesas.map((d) => [
    d.id,
    d.competencia,
    d.dataEmissao.slice(0, 10),
    d.dataVencimento.slice(0, 10),
    d.dataPagamento?.slice(0, 10) ?? '',
    d.descricao,
    d.fornecedor?.nome ?? '',
    d.fornecedor?.cpfCnpj ?? '',
    CATEGORIA_NOMES[d.categoria] ?? d.categoria,
    d.valor.toFixed(2).replace('.', ','),
    d.status,
    d.formaPagamento ?? '',
    d.nf?.numero ?? '',
    d.recorrente?.ativo ? d.recorrente.frequencia : '',
    d.anexos.map((a) => a.nomeOriginal).join('|'),
  ].map(escapeCsv).join(';'))
  return [headers.join(';'), ...rows].join('\n')
}

function impostosCsv(impostos: Imposto[]): string {
  const headers = [
    'id', 'competencia', 'tipo', 'descricao', 'baseCalculo', 'aliquota',
    'valor', 'dataVencimento', 'dataPagamento', 'status', 'anexos',
  ]
  const rows = impostos.map((i) => [
    i.id,
    i.competencia,
    i.tipo,
    i.descricao,
    (i.baseCalculo ?? 0).toFixed(2).replace('.', ','),
    (i.aliquota ?? 0).toFixed(4).replace('.', ','),
    i.valor.toFixed(2).replace('.', ','),
    i.dataVencimento.slice(0, 10),
    i.dataPagamento?.slice(0, 10) ?? '',
    i.status,
    i.anexos.map((a) => a.nomeOriginal).join('|'),
  ].map(escapeCsv).join(';'))
  return [headers.join(';'), ...rows].join('\n')
}

function extratosCsv(lanc: LancamentoBancario[]): string {
  const headers = ['id', 'contaId', 'data', 'descricao', 'tipo', 'valor', 'categoria', 'vinculado', 'origem', 'fitid']
  const rows = lanc.map((l) => [
    l.id,
    l.contaId,
    l.data.slice(0, 10),
    l.descricao,
    l.tipo,
    l.valor.toFixed(2).replace('.', ','),
    l.categoria ?? '',
    l.vinculadoA ? `${l.vinculadoA.tipo}:${l.vinculadoA.id}` : '',
    l.origem,
    l.fitid ?? '',
  ].map(escapeCsv).join(';'))
  return [headers.join(';'), ...rows].join('\n')
}

function balanceteCsv(dre: DREMensal): string {
  const linhas: Array<[string, number]> = [
    ['Receita Bruta', dre.receitaBruta],
    ['(-) Retenções', -dre.retencoes],
    ['= Receita Líquida', dre.receitaLiquida],
  ]
  for (const c of CATEGORIAS_DESPESA) {
    const valor = dre.despesasPorCategoria[c.id] ?? 0
    if (valor > 0) linhas.push([`  Despesa — ${c.nome}`, -valor])
  }
  linhas.push(
    ['(=) Total Despesas', -dre.totalDespesas],
    ['    Dedutíveis', -dre.despesasDedutiveis],
    ['    Não-dedutíveis', -dre.despesasNaoDedutiveis],
    ['(-) Impostos apurados', -dre.impostosApurados],
    ['= Resultado Operacional', dre.resultadoOperacional],
    ['= Resultado Líquido', dre.resultadoLiquido],
    ['Margem Líquida (%)', dre.margemLiquida],
  )
  const rows = linhas.map(([l, v]) => `${escapeCsv(l)};${v.toFixed(2).replace('.', ',')}`)
  return ['Linha;Valor', ...rows].join('\n')
}

/* ────────────────── PDF formal ────────────────── */

function buildPdfHtml(params: {
  competencia: string
  config: ConfiguracaoFinanceiro
  dre: DREMensal
  das?: CalculoDAS
  checklist: ChecklistFechamento
  receitas: Receita[]
  despesas: Despesa[]
  impostos: Imposto[]
}): string {
  const { competencia, config, dre, das, checklist, receitas, despesas, impostos } = params
  const compFmt = formatCompetencia(competencia)
  const hoje = new Date().toLocaleDateString('pt-BR')

  const receitasRows = receitas.length
    ? receitas.map((r) => `
        <tr>
          <td>${formatDate(r.dataEmissao)}</td>
          <td>${r.descricao}</td>
          <td>${r.cliente?.nome ?? '-'}</td>
          <td>${r.nfse?.numero ?? '-'}</td>
          <td class="right">${formatBRL(r.valorBruto)}</td>
          <td class="right">${formatBRL(r.valorLiquido)}</td>
          <td><span class="badge status-${r.status}">${r.status}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="7" class="center muted">Sem receitas no mês</td></tr>`

  const despesasCategoria: Record<string, { total: number; count: number; itens: Despesa[] }> = {}
  for (const d of despesas) {
    const key = d.categoria
    if (!despesasCategoria[key]) despesasCategoria[key] = { total: 0, count: 0, itens: [] }
    despesasCategoria[key].total += d.valor
    despesasCategoria[key].count += 1
    despesasCategoria[key].itens.push(d)
  }
  const despesasBlocos = Object.entries(despesasCategoria)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, info]) => `
      <h3 class="cat-heading">${CATEGORIA_NOMES[cat] ?? cat} — ${info.count} lançamento(s) — ${formatBRL(info.total)}</h3>
      <table class="compact">
        <thead><tr><th>Data</th><th>Descrição</th><th>Fornecedor</th><th>NF</th><th class="right">Valor</th><th>Status</th></tr></thead>
        <tbody>
        ${info.itens.map((d) => `
          <tr>
            <td>${formatDate(d.dataVencimento)}</td>
            <td>${d.descricao}</td>
            <td>${d.fornecedor?.nome ?? '-'}</td>
            <td>${d.nf?.numero ?? '-'}</td>
            <td class="right">${formatBRL(d.valor)}</td>
            <td><span class="badge status-${d.status}">${d.status}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>`).join('')

  const impostosRows = impostos.length
    ? impostos.map((i) => `
        <tr>
          <td>${i.tipo.toUpperCase()}</td>
          <td>${i.descricao}</td>
          <td>${formatDate(i.dataVencimento)}</td>
          <td>${i.dataPagamento ? formatDate(i.dataPagamento) : '-'}</td>
          <td class="right">${formatBRL(i.valor)}</td>
          <td><span class="badge status-${i.status}">${i.status.replace('_', ' ')}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="6" class="center muted">Sem impostos registrados</td></tr>`

  const dreRows = [
    { label: 'Receita Bruta', valor: dre.receitaBruta, strong: true, tipo: 'positivo' },
    { label: '(−) Retenções', valor: -dre.retencoes, tipo: 'negativo' },
    { label: '= Receita Líquida', valor: dre.receitaLiquida, strong: true },
    ...CATEGORIAS_DESPESA
      .filter((c) => (dre.despesasPorCategoria[c.id] ?? 0) > 0)
      .map((c) => ({ label: `    ${c.nome}`, valor: -(dre.despesasPorCategoria[c.id] ?? 0), tipo: 'negativo' as const })),
    { label: '(−) Total Despesas', valor: -dre.totalDespesas, tipo: 'negativo' as const },
    { label: '(−) Impostos apurados', valor: -dre.impostosApurados, tipo: 'negativo' as const },
    { label: '= Resultado Líquido', valor: dre.resultadoLiquido, strong: true, tipo: dre.resultadoLiquido >= 0 ? 'positivo' as const : 'negativo' as const },
  ]

  const dreHtml = dreRows.map((r) => `
    <tr class="${(r as any).strong ? 'strong' : ''}">
      <td>${r.label}</td>
      <td class="right ${(r as any).tipo ?? ''}">${formatBRL(r.valor)}</td>
    </tr>`).join('')

  const checklistHtml = checklist.itens.map((i) => `
    <li class="${i.ok ? 'done' : 'pending'}">
      <span class="check">${i.ok ? '✓' : '○'}</span>
      <div>
        <strong>${i.titulo}</strong>
        <div class="detail">${i.detalhe}</div>
      </div>
    </li>`).join('')

  const dasSection = das ? `
    <section class="section">
      <h2>Apuração do DAS (Simples Nacional — Anexo ${config.anexoSimples})</h2>
      <div class="kv">
        <div><span class="k">Competência</span><span class="v">${compFmt}</span></div>
        <div><span class="k">Receita do mês</span><span class="v">${formatBRL(das.receitaBrutaMes)}</span></div>
        <div><span class="k">RBT12</span><span class="v">${formatBRL(das.rbt12)}</span></div>
        <div><span class="k">Faixa</span><span class="v">${das.faixa}</span></div>
        <div><span class="k">Alíquota nominal</span><span class="v">${das.aliquotaNominal.toFixed(2)}%</span></div>
        <div><span class="k">Parcela a deduzir</span><span class="v">${formatBRL(das.valorDeduzir)}</span></div>
        <div><span class="k">Alíquota efetiva</span><span class="v">${das.aliquotaEfetiva.toFixed(4)}%</span></div>
        <div><span class="k"><strong>Valor DAS</strong></span><span class="v"><strong>${formatBRL(das.valorDAS)}</strong></span></div>
        <div><span class="k">Vencimento</span><span class="v">${formatDate(das.vencimento)}</span></div>
      </div>

      <h3>Memória de cálculo</h3>
      <pre class="memoria">${das.memoriaCalculo}</pre>

      <h3>Partilha tributária</h3>
      <table>
        <thead><tr><th>Tributo</th><th class="right">Valor</th></tr></thead>
        <tbody>
          <tr><td>IRPJ</td><td class="right">${formatBRL(das.detalhamentoPartilha.irpj)}</td></tr>
          <tr><td>CSLL</td><td class="right">${formatBRL(das.detalhamentoPartilha.csll)}</td></tr>
          <tr><td>COFINS</td><td class="right">${formatBRL(das.detalhamentoPartilha.cofins)}</td></tr>
          <tr><td>PIS/Pasep</td><td class="right">${formatBRL(das.detalhamentoPartilha.pis)}</td></tr>
          <tr><td>CPP</td><td class="right">${formatBRL(das.detalhamentoPartilha.cpp)}</td></tr>
          <tr><td>ISS</td><td class="right">${formatBRL(das.detalhamentoPartilha.iss)}</td></tr>
          <tr class="strong"><td>Total</td><td class="right">${formatBRL(das.valorDAS)}</td></tr>
        </tbody>
      </table>
    </section>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Pacote de Fechamento — ${compFmt}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Segoe UI', sans-serif; font-size: 10.5pt; color: #1f2937; line-height: 1.45; }
  h1 { font-size: 22pt; color: #14532d; margin: 0 0 6pt 0; }
  h2 { font-size: 13pt; color: #14532d; margin: 16pt 0 6pt 0; padding-bottom: 3pt; border-bottom: 2px solid #16a34a; page-break-after: avoid; }
  h3 { font-size: 11pt; color: #166534; margin: 10pt 0 4pt 0; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0 10pt; font-size: 9.5pt; }
  th, td { padding: 4pt 6pt; text-align: left; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { background: #f0fdf4; color: #14532d; font-weight: 600; font-size: 9pt; text-transform: uppercase; letter-spacing: .3px; }
  table.compact th, table.compact td { padding: 3pt 5pt; font-size: 9pt; }
  .right { text-align: right; font-variant-numeric: tabular-nums; }
  .center { text-align: center; }
  .muted { color: #9ca3af; font-style: italic; }
  .strong td { font-weight: 700; background: #f9fafb; }
  .positivo { color: #166534; }
  .negativo { color: #991b1b; }
  .cover { page-break-after: always; display: flex; flex-direction: column; height: 100%; justify-content: center; align-items: center; text-align: center; }
  .cover .logo { font-size: 32pt; font-weight: 800; color: #14532d; letter-spacing: 1pt; }
  .cover .sub { font-size: 12pt; color: #6b7280; margin-top: 4pt; }
  .cover .title { font-size: 20pt; margin-top: 40pt; color: #14532d; font-weight: 700; }
  .cover .comp { font-size: 48pt; font-weight: 900; color: #16a34a; margin: 16pt 0; font-variant-numeric: tabular-nums; }
  .cover .empresa { margin-top: 40pt; font-size: 11pt; color: #374151; }
  .cover .empresa strong { display: block; font-size: 13pt; color: #14532d; }
  .cover .meta { margin-top: 30pt; font-size: 9.5pt; color: #6b7280; }
  .badge { display: inline-block; font-size: 8pt; padding: 1pt 6pt; border-radius: 99pt; background: #e5e7eb; color: #374151; }
  .badge.status-recebida, .badge.status-paga, .badge.status-pago { background: #dcfce7; color: #166534; }
  .badge.status-atrasada, .badge.status-atrasado { background: #fee2e2; color: #991b1b; }
  .badge.status-emitida, .badge.status-pendente, .badge.status-a_pagar { background: #f0d9a8; color: #92400e; }
  .badge.status-cancelada { background: #e5e7eb; color: #6b7280; text-decoration: line-through; }
  .kv { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 24pt; margin: 6pt 0 10pt; }
  .kv > div { display: flex; justify-content: space-between; padding: 3pt 0; border-bottom: 1px dotted #e5e7eb; }
  .kv .k { color: #6b7280; }
  .kv .v { font-weight: 500; color: #1f2937; font-variant-numeric: tabular-nums; }
  .memoria { background: #f9fafb; border-left: 3px solid #16a34a; padding: 8pt 10pt; font-size: 9pt; white-space: pre-wrap; font-family: 'SF Mono', 'Consolas', monospace; line-height: 1.55; color: #374151; }
  .section { page-break-inside: avoid; }
  .checklist { list-style: none; padding: 0; margin: 8pt 0; }
  .checklist li { display: flex; gap: 8pt; padding: 5pt 0; border-bottom: 1px solid #f3f4f6; }
  .checklist .check { font-size: 14pt; line-height: 1; width: 18pt; flex-shrink: 0; }
  .checklist .done .check { color: #16a34a; }
  .checklist .pending .check { color: #eab308; }
  .checklist .detail { color: #6b7280; font-size: 9pt; }
  .cat-heading { color: #166534; border-left: 3px solid #16a34a; padding-left: 8pt; margin-top: 12pt; }
  footer { position: fixed; bottom: 6mm; left: 16mm; right: 16mm; font-size: 8pt; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 4pt; }
</style>
</head>
<body>

<div class="cover">
  <div class="logo">ALETIS</div>
  <div class="sub">Consultoria Financeira & Agronegócio</div>
  <div class="title">Pacote de Fechamento Contábil</div>
  <div class="comp">${compFmt}</div>
  <div class="empresa">
    <strong>${config.empresa.razaoSocial}</strong>
    ${config.empresa.cnpj ? `CNPJ: ${config.empresa.cnpj}<br>` : ''}
    Regime: ${config.regime === 'simples_nacional' ? `Simples Nacional — Anexo ${config.anexoSimples}` : config.regime}
  </div>
  <div class="meta">
    Gerado em ${hoje}<br>
    Contador destinatário: ${config.contador.nome || '—'} ${config.contador.email ? `&lt;${config.contador.email}&gt;` : ''}
  </div>
</div>

<section class="section">
  <h2>1. Resumo Executivo</h2>
  <div class="kv">
    <div><span class="k">Receita Bruta</span><span class="v">${formatBRL(dre.receitaBruta)}</span></div>
    <div><span class="k">Receita Líquida</span><span class="v">${formatBRL(dre.receitaLiquida)}</span></div>
    <div><span class="k">Total Despesas</span><span class="v">${formatBRL(dre.totalDespesas)}</span></div>
    <div><span class="k">Impostos apurados</span><span class="v">${formatBRL(dre.impostosApurados)}</span></div>
    <div><span class="k"><strong>Resultado Líquido</strong></span><span class="v ${dre.resultadoLiquido >= 0 ? 'positivo' : 'negativo'}"><strong>${formatBRL(dre.resultadoLiquido)}</strong></span></div>
    <div><span class="k">Margem Líquida</span><span class="v">${dre.margemLiquida.toFixed(2)}%</span></div>
    <div><span class="k">Receitas lançadas</span><span class="v">${dre.contagens.receitas}</span></div>
    <div><span class="k">Despesas lançadas</span><span class="v">${dre.contagens.despesas}</span></div>
    <div><span class="k">Impostos no mês</span><span class="v">${dre.contagens.impostos}</span></div>
    <div><span class="k">Extratos importados</span><span class="v">${dre.contagens.extratos}</span></div>
  </div>
</section>

<section class="section">
  <h2>2. Demonstração de Resultado (DRE)</h2>
  <table>
    <thead><tr><th>Linha</th><th class="right">Valor</th></tr></thead>
    <tbody>${dreHtml}</tbody>
  </table>
</section>

${dasSection}

<section class="section">
  <h2>3. Receitas do Período</h2>
  <table>
    <thead><tr><th>Data</th><th>Descrição</th><th>Cliente</th><th>NFS-e</th><th class="right">Bruto</th><th class="right">Líquido</th><th>Status</th></tr></thead>
    <tbody>${receitasRows}</tbody>
  </table>
</section>

<section class="section">
  <h2>4. Despesas por Categoria</h2>
  ${despesasBlocos || '<p class="muted">Sem despesas no mês</p>'}
</section>

<section class="section">
  <h2>5. Impostos</h2>
  <table>
    <thead><tr><th>Tipo</th><th>Descrição</th><th>Vencimento</th><th>Pagamento</th><th class="right">Valor</th><th>Status</th></tr></thead>
    <tbody>${impostosRows}</tbody>
  </table>
</section>

<section class="section">
  <h2>6. Checklist de Fechamento</h2>
  <p>Status geral: <strong>${checklist.pronto ? 'PRONTO PARA ENVIO' : 'PENDÊNCIAS IDENTIFICADAS'}</strong></p>
  <ul class="checklist">
    ${checklistHtml}
  </ul>
</section>

<section class="section">
  <h2>7. Encaminhamento</h2>
  <p>Este pacote contém o ZIP com todas as notas fiscais, comprovantes, guias e extratos do período, organizados por categoria. Os CSVs anexos ao ZIP estão prontos para importação em sistema contábil.</p>
  <p style="margin-top: 20pt;">
    ${config.empresa.nomeFantasia ?? config.empresa.razaoSocial}<br>
    ${config.empresa.cnpj ? `CNPJ ${config.empresa.cnpj}` : ''}<br>
    <em>Documento gerado automaticamente em ${hoje}</em>
  </p>
</section>

<footer>ALETIS — Pacote de Fechamento ${compFmt} — documento gerado automaticamente</footer>

</body>
</html>`
}

/* ────────────────── Service ────────────────── */

let browserInstance: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance
  browserInstance = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  return browserInstance
}

export class FechamentoContadorService {
  private servico: FinanceiroService
  private outDir: string

  constructor(servico: FinanceiroService, storageRoot: string) {
    this.servico = servico
    this.outDir = join(storageRoot, 'fechamentos')
    mkdirSync(this.outDir, { recursive: true })
  }

  /** Gera o pacote completo (ZIP + PDF) do mês e retorna os caminhos. */
  async gerarPacote(competencia: string): Promise<PacoteFechamento> {
    const config = this.servico.getConfig()
    const dre = this.servico.calcularDREMensal(competencia)
    const checklist = this.servico.gerarChecklistFechamento(competencia)
    const receitas = this.servico.listarReceitas({ competencia })
    const despesas = this.servico.listarDespesas({ competencia })
    const impostos = this.servico.listarImpostos({ competencia })
    const [ano, mes] = competencia.split('-').map(Number)
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const extratos = this.servico.listarLancamentos({
      dataInicio: `${competencia}-01`,
      dataFim: `${competencia}-${String(ultimoDia).padStart(2, '0')}`,
    })

    const receitaMes = this.servico.receitaBrutaMes(competencia)
    const rbt12 = this.servico.calcularRBT12(competencia)
    const das = receitaMes > 0
      ? calcularDAS(receitaMes, rbt12, config.anexoSimples, competencia)
      : undefined

    /* ── Construir ZIP ── */
    const zip = new JSZip()

    const manifesto = {
      competencia,
      geradoEm: new Date().toISOString(),
      empresa: config.empresa,
      regime: config.regime,
      anexoSimples: config.anexoSimples,
      contador: config.contador,
      totais: {
        receitaBruta: dre.receitaBruta,
        receitaLiquida: dre.receitaLiquida,
        totalDespesas: dre.totalDespesas,
        resultadoLiquido: dre.resultadoLiquido,
        impostosApurados: dre.impostosApurados,
        das: das?.valorDAS,
      },
      contagens: {
        receitas: receitas.length,
        despesas: despesas.length,
        impostos: impostos.length,
        extratos: extratos.length,
        anexos: receitas.reduce((s, r) => s + r.anexos.length, 0)
          + despesas.reduce((s, d) => s + d.anexos.length, 0)
          + impostos.reduce((s, i) => s + i.anexos.length, 0),
      },
      checklist: {
        pronto: checklist.pronto,
        pendencias: checklist.itens.filter((i) => !i.ok).map((i) => i.titulo),
      },
    }
    zip.file('manifesto.json', JSON.stringify(manifesto, null, 2))

    // CSVs tabulares
    zip.file('receitas.csv', receitasCsv(receitas))
    zip.file('despesas.csv', despesasCsv(despesas))
    zip.file('impostos.csv', impostosCsv(impostos))
    zip.file('extratos.csv', extratosCsv(extratos))
    zip.file('balancete.csv', balanceteCsv(dre))

    // Anexos físicos organizados por subpasta
    const addAnexos = (
      subpath: 'receitas' | 'despesas' | 'impostos',
      lista: Array<{ anexos: Array<{ nomeOriginal: string; nomeArmazenado: string }>, descricao: string, id: string }>
    ) => {
      for (const entidade of lista) {
        for (const anexo of entidade.anexos) {
          const buf = this.servico.lerAnexo(anexo.nomeArmazenado)
          if (!buf) continue
          const safeDesc = entidade.descricao.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)
          zip.file(`${subpath}/${safeDesc}_${entidade.id.slice(0, 8)}/${anexo.nomeOriginal}`, buf)
        }
      }
    }
    addAnexos('receitas', receitas)
    addAnexos('despesas', despesas)
    addAnexos('impostos', impostos)

    const hasExtratoAnexo = false
    if (!hasExtratoAnexo && extratos.length > 0) {
      zip.file('extratos/lancamentos-extrato.csv', extratosCsv(extratos))
    }

    /* ── Gerar PDF ── */
    const html = buildPdfHtml({ competencia, config, dre, das, checklist, receitas, despesas, impostos })
    const browser = await getBrowser()
    const page = await browser.newPage()
    let pdfBuffer: Buffer
    try {
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
      })
      pdfBuffer = Buffer.from(pdf)
    } finally {
      await page.close()
    }

    // Incluir PDF dentro do ZIP também
    zip.file(`pacote-fechamento-${competencia}.pdf`, pdfBuffer)

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })

    /* ── Salvar arquivos em disco ── */
    const baseName = `fechamento-${competencia}`
    const zipPath = join(this.outDir, `${baseName}.zip`)
    const pdfPath = join(this.outDir, `${baseName}.pdf`)
    writeFileSync(zipPath, zipBuffer)
    writeFileSync(pdfPath, pdfBuffer)

    const pacote: PacoteFechamento = {
      competencia,
      geradoEm: new Date().toISOString(),
      dre,
      das,
      contadores: {
        totalReceitas: receitas.length,
        totalDespesas: despesas.length,
        totalImpostos: impostos.length,
        totalAnexos: manifesto.contagens.anexos,
      },
      checklist,
      caminhoZip: zipPath,
      caminhoPdf: pdfPath,
    }
    return pacote
  }

  /** Lê o arquivo gerado em disco (para download). Retorna null se não existir. */
  lerArquivo(caminho: string): Buffer | null {
    if (!existsSync(caminho)) return null
    return readFileSync(caminho)
  }
}

let singleton: FechamentoContadorService | null = null

export function getFechamentoService(servico: FinanceiroService): FechamentoContadorService {
  if (!singleton) {
    const storageRoot = join(process.cwd(), 'storage', 'financeiro')
    mkdirSync(storageRoot, { recursive: true })
    singleton = new FechamentoContadorService(servico, storageRoot)
  }
  return singleton
}

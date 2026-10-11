// ============================================================
// ALETIS — PDF Proposal Generator
// Renders professional PDF proposals using Puppeteer
// ============================================================

import puppeteer, { type Browser, type Page } from 'puppeteer';
import { formatContractMoney } from '../lib/contract-money.js';

interface PropostaData {
  id: string;
  clienteNome: string;
  credor: string;
  titulo: string;
  tipo: string;
  valorDivida: number;
  valorProposta: number;
  descontoPercentual: number;
  itens: { descricao: string; valor: number; tipo: string; data?: string }[];
  condicoes: string[];
  fundamentacao: string;
  dataCriacao: string;
  dataValidade: string;
  observacoes: string;
}

const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (iso: string): string => {
  if (!iso) return '-';
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return iso;
};

const TIPO_LABELS: Record<string, string> = {
  liquidacao: 'Liquidação Antecipada',
  renegociacao: 'Renegociação de Dívida',
  memoria_calculo: 'Memória de Cálculo',
  parcelamento: 'Parcelamento',
  acordo_judicial: 'Acordo Judicial',
};

const escapeHtmlText = (value: string): string => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function buildHtml(p: PropostaData): string {
  const tipoLabel = TIPO_LABELS[p.tipo] || p.tipo;
  const economia = p.valorDivida - p.valorProposta;

  const itensRows = p.itens.length > 0
    ? p.itens.map(item => `
        <tr>
          <td>${escapeHtmlText(item.descricao)}</td>
          <td class="right">${formatBRL(item.valor)}</td>
          <td>${escapeHtmlText(item.tipo)}</td>
          <td>${item.data ? escapeHtmlText(formatDate(item.data)) : '-'}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" class="center muted">Nenhum item detalhado</td></tr>`;

  const condicoesList = p.condicoes.length > 0
    ? p.condicoes.map(c => `<li>${escapeHtmlText(c)}</li>`).join('')
    : '<li>Condições a serem definidas em comum acordo entre as partes.</li>';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 0; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    color: #2D3A2E;
    font-size: 11px;
    line-height: 1.5;
    background: #fff;
  }

  .header {
    background: linear-gradient(135deg, #17251b 0%, #465b4a 100%);
    color: white;
    padding: 40px 50px 30px;
    position: relative;
  }
  .header::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #cb9d52, #f0d9a8, #cb9d52);
  }
  .header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 2px; }
  .header .subtitle { font-size: 12px; opacity: 0.85; font-weight: 400; }
  .header .logo { font-size: 28px; font-weight: 800; letter-spacing: 3px; margin-bottom: 10px; color: #cb9d52; }
  .header .meta { display: flex; gap: 30px; margin-top: 15px; font-size: 10px; opacity: 0.8; }

  .content { padding: 35px 50px 30px; }

  .section { margin-bottom: 25px; }
  .section-title {
    font-size: 13px;
    font-weight: 700;
    color: #17251b;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding-bottom: 6px;
    border-bottom: 2px solid #cb9d52;
    margin-bottom: 12px;
  }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 30px; }
  .info-item label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; font-weight: 600; }
  .info-item p { font-size: 12px; font-weight: 500; margin-top: 2px; }

  .values-box {
    background: #F8F6F0;
    border-radius: 10px;
    padding: 20px 25px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 15px;
    border: 1px solid #E8E0D0;
  }
  .value-card { text-align: center; }
  .value-card .amount { font-size: 20px; font-weight: 700; }
  .value-card .label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; margin-top: 3px; }
  .divida { color: #DC2626; }
  .proposta { color: #17251b; }
  .economia { color: #cb9d52; }

  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead { background: #F3F4F6; }
  th { text-align: left; padding: 8px 12px; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; border-bottom: 1px solid #D1D5DB; }
  td { padding: 8px 12px; border-bottom: 1px solid #E5E7EB; }
  .right { text-align: right; }
  .center { text-align: center; }
  .muted { color: #9CA3AF; font-style: italic; }

  .condicoes ul { list-style: none; }
  .condicoes li { padding: 5px 0 5px 18px; position: relative; font-size: 11px; }
  .condicoes li::before { content: '\\2713'; position: absolute; left: 0; color: #17251b; font-weight: 700; }

  .fundamentacao { background: #fbf9f0; border-left: 3px solid #cb9d52; padding: 12px 15px; font-size: 11px; line-height: 1.6; border-radius: 0 6px 6px 0; }

  .footer {
    margin-top: 30px;
    padding: 25px 50px;
    background: #F8F6F0;
    border-top: 1px solid #E8E0D0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer .sig { text-align: center; min-width: 200px; }
  .footer .sig-line { border-top: 1px solid #2D3A2E; margin-top: 50px; padding-top: 5px; font-size: 10px; }

  .confidential {
    text-align: center;
    font-size: 8px;
    color: #9CA3AF;
    padding: 10px 50px;
    letter-spacing: 0.5px;
  }
</style>
</head>
<body>

<div class="header">
  <div class="logo">ALETIS</div>
  <h1>${escapeHtmlText(p.titulo)}</h1>
  <div class="subtitle">${escapeHtmlText(tipoLabel)}</div>
  <div class="meta">
    <span>Doc: ${escapeHtmlText(p.id.toUpperCase())}</span>
    <span>Emissão: ${escapeHtmlText(formatDate(p.dataCriacao))}</span>
    <span>Validade: ${escapeHtmlText(formatDate(p.dataValidade))}</span>
  </div>
</div>

<div class="content">
  <div class="section">
    <div class="section-title">Informações Gerais</div>
    <div class="info-grid">
      <div class="info-item"><label>Cliente / Devedor</label><p>${escapeHtmlText(p.clienteNome)}</p></div>
      <div class="info-item"><label>Credor / Instituição</label><p>${escapeHtmlText(p.credor)}</p></div>
      <div class="info-item"><label>Tipo de Proposta</label><p>${escapeHtmlText(tipoLabel)}</p></div>
      <div class="info-item"><label>Data de Emissão</label><p>${escapeHtmlText(formatDate(p.dataCriacao))}</p></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Resumo Financeiro</div>
    <div class="values-box">
      <div class="value-card">
        <div class="amount divida">${formatBRL(p.valorDivida)}</div>
        <div class="label">Valor da Dívida</div>
      </div>
      <div class="value-card">
        <div class="amount proposta">${formatBRL(p.valorProposta)}</div>
        <div class="label">Valor Proposto</div>
      </div>
      <div class="value-card">
        <div class="amount economia">${formatBRL(economia)}</div>
        <div class="label">Economia (${p.descontoPercentual.toFixed(1)}%)</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Detalhamento</div>
    <table>
      <thead>
        <tr><th>Descrição</th><th class="right">Valor</th><th>Tipo</th><th>Data</th></tr>
      </thead>
      <tbody>${itensRows}</tbody>
    </table>
  </div>

  <div class="section condicoes">
    <div class="section-title">Condições</div>
    <ul>${condicoesList}</ul>
  </div>

  ${p.fundamentacao ? `
  <div class="section">
    <div class="section-title">Fundamentação</div>
    <div class="fundamentacao">${escapeHtmlText(p.fundamentacao)}</div>
  </div>` : ''}

  ${p.observacoes ? `
  <div class="section">
    <div class="section-title">Observações</div>
    <p style="font-size:11px; color:#6B7280;">${escapeHtmlText(p.observacoes)}</p>
  </div>` : ''}
</div>

<div class="footer">
  <div class="sig">
    <div class="sig-line">${escapeHtmlText(p.clienteNome)}<br/>Cliente / Devedor</div>
  </div>
  <div class="sig">
    <div class="sig-line">${escapeHtmlText(p.credor)}<br/>Credor / Instituição</div>
  </div>
  <div class="sig">
    <div class="sig-line">ALETIS Assessoria<br/>Consultor Responsável</div>
  </div>
</div>

<div class="confidential">
  DOCUMENTO CONFIDENCIAL — Gerado pelo sistema ALETIS em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}.
  Este documento é válido até ${escapeHtmlText(formatDate(p.dataValidade))}. Uso exclusivo das partes envolvidas.
</div>

</body>
</html>`;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return browserInstance;
}

async function prepareStaticPdfPage(page: Page): Promise<void> {
  // Os PDFs usam CSS inline, fontes instaladas e recursos incorporados.
  // Texto cadastral nunca pode executar código ou buscar URLs pelo servidor.
  await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const embedded = /^(?:data:|blob:|about:blank(?:[?#]|$))/i.test(request.url());
    void (embedded ? request.continue() : request.abort('blockedbyclient')).catch(() => undefined);
  });
}

export async function generatePropostaPdf(proposta: PropostaData): Promise<Buffer> {
  const html = buildHtml(proposta);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await prepareStaticPdfPage(page);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

// ============================================================
//  Contrato PDF (layout jurídico formal — Markdown → PDF A4)
// ============================================================

interface ContratoPdfData {
  id: string;
  titulo: string;
  tipo: string;
  dataGeracao: string;
  partes: { devedor: string; credor: string };
  valorTotal: string | number;
  conteudoMarkdown: string;
  fundamentoLegal: string[];
}

function markdownToHtml(md: string): string {
  const escapeHtml = escapeHtmlText;

  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  let inCodeBlock = false;

  for (let raw of lines) {
    const line = raw;

    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      out.push(inCodeBlock ? '<pre><code>' : '</code></pre>');
      continue;
    }
    if (inCodeBlock) {
      out.push(escapeHtml(line));
      continue;
    }

    if (/^# /.test(line)) {
      out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }
    if (/^## /.test(line)) {
      out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (/^### /.test(line)) {
      out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }
    if (/^---\s*$/.test(line)) {
      out.push('<hr/>');
      continue;
    }
    if (/^- /.test(line) || /^\* /.test(line)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${renderInline(line.slice(2))}</li>`);
      continue;
    } else if (inList && line.trim() === '') {
      out.push('</ul>');
      inList = false;
      continue;
    } else if (inList) {
      out.push('</ul>');
      inList = false;
    }

    if (line.trim() === '') {
      out.push('');
      continue;
    }

    out.push(`<p>${renderInline(line)}</p>`);
  }

  if (inList) out.push('</ul>');
  return out.join('\n');

  function renderInline(s: string): string {
    return escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  }
}

function buildContratoHtml(c: ContratoPdfData): string {
  const text = escapeHtmlText;
  const body = markdownToHtml(c.conteudoMarkdown);
  const fundamento = c.fundamentoLegal.length
    ? `<div class="fundamento-box">
         <div class="fundamento-label">Fundamentação Legal</div>
         <div class="fundamento-list">${c.fundamentoLegal.map((f) => `<span class="fund-tag">${text(f)}</span>`).join('')}</div>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 0; size: A4; }
  @page :first { margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Georgia, serif;
    color: #1a1a1a;
    font-size: 11pt;
    line-height: 1.55;
    background: #fff;
  }

  .capa {
    padding: 60px 50px 40px;
    background: linear-gradient(180deg, #17251b 0%, #465b4a 100%);
    color: white;
    page-break-after: always;
    min-height: 100vh;
    position: relative;
  }
  .capa::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 6px;
    background: linear-gradient(90deg, #cb9d52, #f0d9a8, #cb9d52);
  }
  .capa-logo { font-family: 'Segoe UI', sans-serif; font-size: 32px; letter-spacing: 6px; font-weight: 800; color: #cb9d52; margin-bottom: 40px; }
  .capa h1 { font-size: 26px; margin-bottom: 10px; line-height: 1.3; }
  .capa .tipo { font-size: 13px; opacity: 0.8; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 50px; }
  .capa .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 15px 40px; margin-top: 60px; }
  .capa .meta-item label { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.6; display: block; margin-bottom: 4px; }
  .capa .meta-item p { font-size: 13px; font-weight: 500; }

  .fundamento-box {
    margin: 40px 0 0;
    padding: 18px 20px;
    background: rgba(255,255,255,0.08);
    border-left: 3px solid #cb9d52;
    border-radius: 0 6px 6px 0;
  }
  .fundamento-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.75; margin-bottom: 8px; }
  .fundamento-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .fund-tag { font-size: 10px; padding: 3px 8px; background: rgba(201,168,76,0.25); border-radius: 4px; }

  .body {
    padding: 50px 55px 40px;
  }
  .body h1 {
    font-size: 16pt;
    margin: 20px 0 15px;
    color: #17251b;
    font-weight: bold;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 1px;
    page-break-after: avoid;
  }
  .body h2 {
    font-size: 13pt;
    margin: 22px 0 10px;
    color: #17251b;
    padding-bottom: 4px;
    border-bottom: 1px solid #cb9d52;
    page-break-after: avoid;
  }
  .body h3 { font-size: 11pt; margin: 16px 0 8px; color: #17251b; page-break-after: avoid; }
  .body p { margin-bottom: 8px; text-align: justify; text-indent: 0; }
  .body strong { color: #17251b; }
  .body ul { margin: 6px 0 10px 22px; }
  .body li { margin-bottom: 4px; }
  .body hr { border: none; border-top: 1px dashed #ccc; margin: 18px 0; }

  .footer {
    margin-top: 30px;
    padding: 18px 55px;
    text-align: center;
    font-size: 9pt;
    color: #888;
    border-top: 1px solid #eee;
  }
  .confidential {
    background: #fbf9f0;
    color: #92400E;
    padding: 10px 20px;
    margin: 20px 55px 0;
    border-radius: 4px;
    font-size: 9pt;
    text-align: center;
    border: 1px solid #f0d9a8;
  }
</style>
</head>
<body>

<div class="capa">
  <div class="capa-logo">ALETIS</div>
  <h1>${text(c.titulo)}</h1>
  <div class="tipo">${text(c.tipo.replace(/_/g, ' ').toUpperCase())}</div>

  <div class="meta">
    <div class="meta-item"><label>Documento</label><p>${text(c.id)}</p></div>
    <div class="meta-item"><label>Data de Geração</label><p>${text(new Date(c.dataGeracao).toLocaleDateString('pt-BR'))}</p></div>
    <div class="meta-item"><label>Devedor</label><p>${text(c.partes.devedor)}</p></div>
    <div class="meta-item"><label>Credor</label><p>${text(c.partes.credor)}</p></div>
    <div class="meta-item" style="grid-column: 1 / -1;">
      <label>Valor da Operação</label>
      <p style="font-size: 18px; color: #cb9d52; font-weight: 700;">${formatContractMoney(c.valorTotal)}</p>
    </div>
  </div>

  ${fundamento}
</div>

<div class="body">
  ${body}
</div>

<div class="confidential">
  DOCUMENTO EM MINUTA — Gerado automaticamente pelo sistema ALETIS. Requer revisão jurídica antes da assinatura.
</div>

<div class="footer">
  Emitido em ${text(new Date(c.dataGeracao).toLocaleString('pt-BR'))} · Documento ${text(c.id)}
</div>

</body>
</html>`;
}

export async function generateContratoPdf(c: ContratoPdfData): Promise<Buffer> {
  const html = buildContratoHtml(c);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await prepareStaticPdfPage(page);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

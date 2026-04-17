// ============================================================
// ALETIS — PDF Proposal Generator
// Renders professional PDF proposals using Puppeteer
// ============================================================

import puppeteer from 'puppeteer';

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

function buildHtml(p: PropostaData): string {
  const tipoLabel = TIPO_LABELS[p.tipo] || p.tipo;
  const economia = p.valorDivida - p.valorProposta;

  const itensRows = p.itens.length > 0
    ? p.itens.map(item => `
        <tr>
          <td>${item.descricao}</td>
          <td class="right">${formatBRL(item.valor)}</td>
          <td>${item.tipo}</td>
          <td>${item.data ? formatDate(item.data) : '-'}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" class="center muted">Nenhum item detalhado</td></tr>`;

  const condicoesList = p.condicoes.length > 0
    ? p.condicoes.map(c => `<li>${c}</li>`).join('')
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
    background: linear-gradient(135deg, #0F4C35 0%, #1B6B4A 100%);
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
    background: linear-gradient(90deg, #C9A84C, #E8D5A0, #C9A84C);
  }
  .header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 2px; }
  .header .subtitle { font-size: 12px; opacity: 0.85; font-weight: 400; }
  .header .logo { font-size: 28px; font-weight: 800; letter-spacing: 3px; margin-bottom: 10px; color: #C9A84C; }
  .header .meta { display: flex; gap: 30px; margin-top: 15px; font-size: 10px; opacity: 0.8; }

  .content { padding: 35px 50px 30px; }

  .section { margin-bottom: 25px; }
  .section-title {
    font-size: 13px;
    font-weight: 700;
    color: #0F4C35;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding-bottom: 6px;
    border-bottom: 2px solid #C9A84C;
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
  .proposta { color: #0F4C35; }
  .economia { color: #C9A84C; }

  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead { background: #F3F4F6; }
  th { text-align: left; padding: 8px 12px; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; border-bottom: 1px solid #D1D5DB; }
  td { padding: 8px 12px; border-bottom: 1px solid #E5E7EB; }
  .right { text-align: right; }
  .center { text-align: center; }
  .muted { color: #9CA3AF; font-style: italic; }

  .condicoes ul { list-style: none; }
  .condicoes li { padding: 5px 0 5px 18px; position: relative; font-size: 11px; }
  .condicoes li::before { content: '\\2713'; position: absolute; left: 0; color: #0F4C35; font-weight: 700; }

  .fundamentacao { background: #FFFBEB; border-left: 3px solid #C9A84C; padding: 12px 15px; font-size: 11px; line-height: 1.6; border-radius: 0 6px 6px 0; }

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
  <h1>${p.titulo}</h1>
  <div class="subtitle">${tipoLabel}</div>
  <div class="meta">
    <span>Doc: ${p.id.toUpperCase()}</span>
    <span>Emissão: ${formatDate(p.dataCriacao)}</span>
    <span>Validade: ${formatDate(p.dataValidade)}</span>
  </div>
</div>

<div class="content">
  <div class="section">
    <div class="section-title">Informações Gerais</div>
    <div class="info-grid">
      <div class="info-item"><label>Cliente / Devedor</label><p>${p.clienteNome}</p></div>
      <div class="info-item"><label>Credor / Instituição</label><p>${p.credor}</p></div>
      <div class="info-item"><label>Tipo de Proposta</label><p>${tipoLabel}</p></div>
      <div class="info-item"><label>Data de Emissão</label><p>${formatDate(p.dataCriacao)}</p></div>
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
    <div class="fundamentacao">${p.fundamentacao}</div>
  </div>` : ''}

  ${p.observacoes ? `
  <div class="section">
    <div class="section-title">Observações</div>
    <p style="font-size:11px; color:#6B7280;">${p.observacoes}</p>
  </div>` : ''}
</div>

<div class="footer">
  <div class="sig">
    <div class="sig-line">${p.clienteNome}<br/>Cliente / Devedor</div>
  </div>
  <div class="sig">
    <div class="sig-line">${p.credor}<br/>Credor / Instituição</div>
  </div>
  <div class="sig">
    <div class="sig-line">ALETIS Assessoria<br/>Consultor Responsável</div>
  </div>
</div>

<div class="confidential">
  DOCUMENTO CONFIDENCIAL — Gerado pelo sistema ALETIS em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}.
  Este documento é válido até ${formatDate(p.dataValidade)}. Uso exclusivo das partes envolvidas.
</div>

</body>
</html>`;
}

let browserInstance: puppeteer.Browser | null = null;

async function getBrowser(): Promise<puppeteer.Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return browserInstance;
}

export async function generatePropostaPdf(proposta: PropostaData): Promise<Buffer> {
  const html = buildHtml(proposta);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
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

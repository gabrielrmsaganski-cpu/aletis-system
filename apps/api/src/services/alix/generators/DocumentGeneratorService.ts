// ============================================================
// ALETIS — Alix Document Generator Service (Wave 9-GENERATE)
// Orquestra geração real de PDFs, DOCX e XLSX a partir de inputs
// estruturados vinda da Alix AI.
//
// Storage layout:
//   apps/api/storage/alix-outputs/
//     ├── <clienteId|'sem-cliente'>/<id>.<ext>
//     └── _meta/<id>.json
// ============================================================

import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

import { renderHtmlToPdfBuffer } from './PdfGenerator.js';
import { renderFluxoCaixaXlsxBuffer } from './XlsxGenerator.js';
import { renderMemoriaCalculoDocxBuffer } from './DocxGenerator.js';
import type {
  FluxoCaixaInput,
  GeneratedDocument,
  MemoriaInput,
  ParecerInput,
  PropostaInput,
  RelatorioBscInput,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Storage roots ──────────────────────────────────────────

const STORAGE_ROOT = resolve(__dirname, '..', '..', '..', '..', 'storage', 'alix-outputs');
const META_DIR = join(STORAGE_ROOT, '_meta');
const TEMPLATES_DIR = join(__dirname, 'templates');

const MIME: Record<'pdf' | 'docx' | 'xlsx', string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// ── Helpers ────────────────────────────────────────────────

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

async function loadTemplate(name: string): Promise<string> {
  return fs.readFile(join(TEMPLATES_DIR, name), 'utf8');
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function todayBR(): string {
  return new Date().toLocaleDateString('pt-BR');
}

function escapeHtml(input: unknown): string {
  const s = input == null ? '' : String(input);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(data, key) ? data[key] : '',
  );
}

interface PersistInput {
  kind: 'pdf' | 'docx' | 'xlsx';
  buffer: Buffer;
  baseName: string;
  clienteId?: string;
  metadata?: Record<string, unknown>;
}

async function persistDocument(p: PersistInput): Promise<GeneratedDocument> {
  const id = crypto.randomUUID();
  const safeClienteId = (p.clienteId ?? 'sem-cliente').replace(/[^\w.-]/g, '_');
  const dir = join(STORAGE_ROOT, safeClienteId);
  await ensureDir(dir);
  await ensureDir(META_DIR);

  const filename = `${p.baseName}-${id.slice(0, 8)}.${p.kind}`;
  const absPath = join(dir, filename);
  await fs.writeFile(absPath, p.buffer);

  const stat = await fs.stat(absPath);
  const doc: GeneratedDocument = {
    id,
    kind: p.kind,
    filename,
    sizeBytes: stat.size,
    createdAt: new Date().toISOString(),
    path: absPath,
    downloadUrl: `/api/alix/documents/generated/${id}`,
    mimetype: MIME[p.kind],
    clienteId: p.clienteId,
    metadata: p.metadata ?? {},
  };

  await fs.writeFile(
    join(META_DIR, `${id}.json`),
    JSON.stringify(doc, null, 2),
    'utf8',
  );

  return doc;
}

/** Loads the persisted metadata for a given document id. */
export async function loadGeneratedDocumentMeta(
  id: string,
): Promise<GeneratedDocument | null> {
  // Basic validation to prevent traversal
  if (!/^[0-9a-fA-F-]{8,}$/.test(id)) return null;
  try {
    const raw = await fs.readFile(join(META_DIR, `${id}.json`), 'utf8');
    return JSON.parse(raw) as GeneratedDocument;
  } catch {
    return null;
  }
}

// ── Amortization (Price table) ─────────────────────────────

function calcularParcelaPrice(
  principal: number,
  parcelas: number,
  taxaMensal: number,
): number {
  if (parcelas <= 0) return 0;
  if (taxaMensal <= 0) return principal / parcelas;
  const i = taxaMensal;
  return (principal * i * Math.pow(1 + i, parcelas)) / (Math.pow(1 + i, parcelas) - 1);
}

interface CronogramaLinha {
  mes: number;
  parcela: number;
  juros: number;
  amortizacao: number;
  saldo: number;
  label: string;
}

function gerarCronograma(
  principal: number,
  parcelas: number,
  taxaMensal: number,
  carencia: number,
): CronogramaLinha[] {
  const linhas: CronogramaLinha[] = [];
  let saldo = principal;

  // Carência: só juros (capitaliza no saldo)
  for (let m = 1; m <= carencia; m++) {
    const juros = saldo * taxaMensal;
    saldo += juros; // capitalização durante carência
    linhas.push({
      mes: m,
      parcela: 0,
      juros,
      amortizacao: 0,
      saldo,
      label: `${m} (carência)`,
    });
  }

  const parcela = calcularParcelaPrice(saldo, parcelas, taxaMensal);
  for (let k = 1; k <= parcelas; k++) {
    const juros = saldo * taxaMensal;
    const amortizacao = parcela - juros;
    saldo = Math.max(0, saldo - amortizacao);
    linhas.push({
      mes: carencia + k,
      parcela,
      juros,
      amortizacao,
      saldo,
      label: `${carencia + k}`,
    });
  }

  return linhas;
}

// ── Public API ─────────────────────────────────────────────

export class DocumentGeneratorService {
  private static _instance: DocumentGeneratorService | null = null;

  static getInstance(): DocumentGeneratorService {
    if (!this._instance) this._instance = new DocumentGeneratorService();
    return this._instance;
  }

  /** Utilitário cru: renderiza HTML para PDF e persiste. */
  async generateHtmlToPdf(
    html: string,
    filename: string,
    opts: { clienteId?: string; landscape?: boolean; metadata?: Record<string, unknown> } = {},
  ): Promise<GeneratedDocument> {
    const pdf = await renderHtmlToPdfBuffer(html, { landscape: opts.landscape });
    return persistDocument({
      kind: 'pdf',
      buffer: pdf,
      baseName: filename.replace(/\.pdf$/i, ''),
      clienteId: opts.clienteId,
      metadata: opts.metadata ?? { source: 'html' },
    });
  }

  async generateProposta(input: PropostaInput): Promise<GeneratedDocument> {
    const template = await loadTemplate('proposta-reestruturacao.html');
    const dataEmissao = input.dataEmissao ?? todayBR();
    const consultor = input.consultor ?? 'Christian Kohler';

    const cronograma = gerarCronograma(
      input.dividaAtualBRL,
      input.parcelasMeses,
      input.taxaMensalPct / 100,
      input.carenciaMeses,
    );

    // Parcela estimada = primeira parcela regular (pós-carência)
    const primeiraRegular = cronograma.find((l) => l.parcela > 0);
    const parcelaFormatada = primeiraRegular
      ? formatBRL(primeiraRegular.parcela)
      : formatBRL(0);

    const cronogramaRows = cronograma
      .map(
        (l) => `
      <tr>
        <td class="num">${escapeHtml(l.label)}</td>
        <td class="num">${l.parcela > 0 ? formatBRL(l.parcela) : '—'}</td>
        <td class="num">${formatBRL(l.juros)}</td>
        <td class="num">${formatBRL(l.amortizacao)}</td>
        <td class="num">${formatBRL(l.saldo)}</td>
      </tr>`,
      )
      .join('');

    const html = render(template, {
      CLIENTE_NOME: escapeHtml(input.clienteNome),
      CREDOR_NOME: escapeHtml(input.credorNome),
      DIVIDA_FORMATADA: formatBRL(input.dividaAtualBRL),
      PARCELAS: String(input.parcelasMeses),
      TAXA_PCT: input.taxaMensalPct.toFixed(2),
      CARENCIA: String(input.carenciaMeses),
      PARCELA_FORMATADA: parcelaFormatada,
      DATA_EMISSAO: escapeHtml(dataEmissao),
      CONSULTOR: escapeHtml(consultor),
      OBSERVACOES: escapeHtml(
        input.observacoes ??
          'Proposta sujeita à análise documental e validação pelo credor.',
      ),
      CRONOGRAMA_ROWS: cronogramaRows,
    });

    const pdf = await renderHtmlToPdfBuffer(html);
    return persistDocument({
      kind: 'pdf',
      buffer: pdf,
      baseName: `proposta-${slugify(input.clienteNome)}`,
      clienteId: input.clienteId,
      metadata: {
        tipo: 'proposta-reestruturacao',
        credor: input.credorNome,
        dividaAtualBRL: input.dividaAtualBRL,
        parcelasMeses: input.parcelasMeses,
        taxaMensalPct: input.taxaMensalPct,
        carenciaMeses: input.carenciaMeses,
        parcelaEstimada: primeiraRegular?.parcela ?? 0,
      },
    });
  }

  async generateParecer(input: ParecerInput): Promise<GeneratedDocument> {
    const template = await loadTemplate('parecer-tecnico.html');
    const dataEmissao = input.dataEmissao ?? todayBR();
    const consultor = input.consultor ?? 'Christian Kohler';

    const anexosList =
      input.anexos && input.anexos.length > 0
        ? input.anexos.map((a) => `<li>${escapeHtml(a)}</li>`).join('')
        : '<li>Não há anexos para este parecer.</li>';

    const html = render(template, {
      CLIENTE_NOME: escapeHtml(input.clienteNome),
      ASSUNTO: escapeHtml(input.assunto),
      DIAGNOSTICO: escapeHtml(input.diagnostico),
      VIABILIDADE: escapeHtml(input.viabilidade),
      RECOMENDACAO: escapeHtml(input.recomendacao),
      ANEXOS_LIST: anexosList,
      DATA_EMISSAO: escapeHtml(dataEmissao),
      CONSULTOR: escapeHtml(consultor),
    });

    const pdf = await renderHtmlToPdfBuffer(html);
    return persistDocument({
      kind: 'pdf',
      buffer: pdf,
      baseName: `parecer-${slugify(input.clienteNome)}`,
      clienteId: input.clienteId,
      metadata: {
        tipo: 'parecer-tecnico',
        assunto: input.assunto,
      },
    });
  }

  async generateRelatorioBsc(input: RelatorioBscInput): Promise<GeneratedDocument> {
    const template = await loadTemplate('relatorio-bsc.html');
    const dataEmissao = input.dataEmissao ?? todayBR();
    const consultor = input.consultor ?? 'Christian Kohler';

    const cards = input.perspectivas
      .map((p) => {
        const kpiRows = p.kpis
          .map(
            (k) => `
          <tr>
            <td>${escapeHtml(k.nome)}</td>
            <td class="num">${escapeHtml(k.valorAtual)}${k.unidade ? ' ' + escapeHtml(k.unidade) : ''}</td>
            <td class="num">${escapeHtml(k.meta)}${k.unidade ? ' ' + escapeHtml(k.unidade) : ''}</td>
            <td><span class="badge ${escapeHtml(k.status)}">${escapeHtml(k.status.toUpperCase())}</span></td>
          </tr>`,
          )
          .join('');

        return `
      <div class="card">
        <h3>${escapeHtml(p.nome)}</h3>
        ${p.resumo ? `<p class="resumo">${escapeHtml(p.resumo)}</p>` : ''}
        <table class="kpi">
          <thead>
            <tr>
              <th>KPI</th>
              <th class="num">Atual</th>
              <th class="num">Meta</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${kpiRows}</tbody>
        </table>
      </div>`;
      })
      .join('');

    const html = render(template, {
      CLIENTE_NOME: escapeHtml(input.clienteNome),
      PERIODO: escapeHtml(input.periodo),
      CARDS: cards,
      OBSERVACOES: escapeHtml(
        input.observacoes ?? 'Sem observações adicionais para o período.',
      ),
      DATA_EMISSAO: escapeHtml(dataEmissao),
      CONSULTOR: escapeHtml(consultor),
    });

    const pdf = await renderHtmlToPdfBuffer(html);
    return persistDocument({
      kind: 'pdf',
      buffer: pdf,
      baseName: `bsc-${slugify(input.clienteNome)}`,
      clienteId: input.clienteId,
      metadata: {
        tipo: 'relatorio-bsc',
        periodo: input.periodo,
        perspectivas: input.perspectivas.length,
      },
    });
  }

  async generateFluxoCaixaXlsx(input: FluxoCaixaInput): Promise<GeneratedDocument> {
    const buffer = await renderFluxoCaixaXlsxBuffer(input);
    return persistDocument({
      kind: 'xlsx',
      buffer,
      baseName: `fluxo-caixa-${slugify(input.clienteNome)}`,
      clienteId: input.clienteId,
      metadata: {
        tipo: 'fluxo-caixa-12-meses',
        periodoReferencia: input.periodoReferencia,
        meses: input.meses.length,
      },
    });
  }

  async generateMemoriaCalculo(input: MemoriaInput): Promise<GeneratedDocument> {
    const buffer = await renderMemoriaCalculoDocxBuffer(input);
    return persistDocument({
      kind: 'docx',
      buffer,
      baseName: `memoria-calculo-${slugify(input.clienteNome)}`,
      clienteId: input.clienteId,
      metadata: {
        tipo: 'memoria-calculo',
        titulo: input.titulo,
        itens: input.itens.length,
      },
    });
  }
}

function slugify(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'documento';
}

export const documentGeneratorService = DocumentGeneratorService.getInstance();
export { STORAGE_ROOT as ALIX_OUTPUTS_ROOT, META_DIR as ALIX_OUTPUTS_META_DIR };

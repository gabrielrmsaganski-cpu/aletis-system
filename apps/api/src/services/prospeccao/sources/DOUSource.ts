// ============================================================
// DOUSource — leads a partir do Diário Oficial da União
// ============================================================
// Fonte pública: https://www.in.gov.br — imprensa nacional
// Busca atos com CPF/CNPJ agro em contexto de crise:
//   • Recuperação judicial / insolvência
//   • Falência / liquidação judicial
//   • Leilão / alienação / arrematação de imóvel rural
//   • Penhora / constrição patrimonial
//
// Persistência: storage/prospeccao/dou-leads.json
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { LeadRaw, DebtRecord, JudicialEvent, JudicialTipo } from '../types';
import type { LeadSource, LeadSourceManifest } from './LeadSource';

interface DOUStats {
  scanned: number;
  matched: number;
  agroMatched: number;
  withDocs: number;
  detailFetched: number;
  discardReasons: Record<string, number>;
}

interface DOULeadFile {
  manifest: {
    generatedAt: string;
    source: string;
    searchedAt: string;
    stats: DOUStats;
  };
  leads: LeadRaw[];
}

interface DOUAto {
  titulo: string;
  texto: string;
  dataPublicacao: string;
  url?: string;
  /** Query que trouxe este ato (ex.: "recuperação judicial agropecuária"). Vira sinal agro implícito. */
  queryOrigem?: string;
}

interface DetectionResult {
  crisis: string[];
  agro: string[];
  judicialTypes: JudicialTipo[];
}

interface LeadExtraction {
  leads: LeadRaw[];
  detection: DetectionResult;
  docs: { cnpjs: string[]; cpfs: string[] };
  normalizedText: string;
  discardReason?: string;
}

const AGRO_KEYWORDS_DOU = [
  'agropecuária', 'agropecuaria', 'agrícola', 'agricola', 'agronegócio', 'agronegocio',
  'rural', 'fazenda', 'sítio', 'sitio', 'pecuária', 'pecuaria', 'produtor rural',
  'soja', 'milho', 'café', 'cafe', 'algodão', 'algodao', 'grãos', 'graos',
  'cooperativa agrícola', 'cooperativa rural', 'imóvel rural', 'imovel rural',
  'matrícula rural', 'matricula rural', 'gleba', 'lavoura', 'safra', 'bovinocultura',
  'avicultura', 'suinocultura', 'cerealista', 'usina', 'cana-de-açúcar', 'cana de açucar',
  // Ampliação: sinônimos comuns no DOU (frigorífico, silo, armazém)
  'frigorífico', 'frigorifico', 'silo', 'armazém', 'armazem', 'agricultor', 'agricultora',
  'pecuarista', 'avicultora', 'avicultor', 'lácteo', 'lacteo', 'laticínio', 'laticinio',
  'arroz', 'trigo', 'feijão', 'feijao', 'mandioca', 'cooperativa de produtores',
  'matrícula de imóvel rural', 'matricula de imovel rural', 'bovino', 'bovinos',
];

const AGRO_FALSE_POSITIVES = [
  'ministério da agricultura',
  'ministerio da agricultura',
  'secretaria de agricultura',
  'superintendência de agricultura',
  'superintendencia de agricultura',
  'universidade federal',
  'siape',
  'pesquisadora lotad',
];

const CRISIS_PATTERNS: Array<{ tipo: JudicialTipo; label: string; regex: RegExp; severidade: JudicialEvent['severidade'] }> = [
  { tipo: 'recuperacao_judicial', label: 'recuperação judicial', regex: /recuperac[aã]o\s+judicial|RJ\s+agro|processo\s+de\s+recupera[cç][aã]o/gi, severidade: 'alta' },
  { tipo: 'falencia', label: 'falência', regex: /fal[êe]ncia|decretad[ao]s?\s+a\s+fal[êe]ncia|fal[ií]do/gi, severidade: 'alta' },
  { tipo: 'insolvencia', label: 'insolvência', regex: /insolv[êe]ncia/gi, severidade: 'media' },
  { tipo: 'liquidacao_judicial', label: 'liquidação judicial', regex: /liquida[cç][aã]o\s+judicial/gi, severidade: 'alta' },
  { tipo: 'leilao', label: 'leilão', regex: /leil[aã]o\s+(judicial|extrajudicial|p[úu]blico)?|edital\s+de\s+leil[aã]o|hasta\s+p[úu]blica|arremata[cç][aã]o|aliena[cç][aã]o\s+judicial/gi, severidade: 'media' },
  { tipo: 'penhora', label: 'penhora', regex: /penhora|constri[cç][aã]o\s+judicial|indisponibilidade\s+de\s+bens|bloqueio\s+judicial/gi, severidade: 'media' },
  // Execução (fiscal e judicial) é o canal mais frequente de cobrança rural —
  // antes de PGFN bater 39k leads, era o sinal mais confiável no DOU.
  { tipo: 'penhora', label: 'execução', regex: /execu[cç][aã]o\s+(fiscal|judicial|de\s+t[íi]tulo)/gi, severidade: 'media' },
];

const CNPJ_REGEX = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g;
const CPF_REGEX = /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g;

function cleanDoc(doc: string): string {
  return doc.replace(/\D/g, '');
}

function normalizeText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[“”"'`´]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function summarizeAto(ato: DOUAto, normalizedText: string): string {
  const resumo = normalizedText.slice(0, 220).trim();
  return resumo || ato.titulo.slice(0, 220).trim();
}

function detectCrisisAgro(text: string): DetectionResult {
  let normalized = normalizeText(text);
  for (const fp of AGRO_FALSE_POSITIVES) {
    normalized = normalized.replace(new RegExp(normalizeText(fp).replace(/\s+/g, '\\s+'), 'g'), ' ');
  }

  const crisis = Array.from(new Set(
    CRISIS_PATTERNS
      .filter((pattern) => pattern.regex.test(normalized))
      .map((pattern) => pattern.label)
  ));

  const judicialTypes = Array.from(new Set(
    CRISIS_PATTERNS
      .filter((pattern) => pattern.regex.test(normalized))
      .map((pattern) => pattern.tipo)
  ));

  const agro = Array.from(new Set(
    AGRO_KEYWORDS_DOU.filter((keyword) => normalized.includes(normalizeText(keyword)))
  ));

  return { crisis, agro, judicialTypes };
}

export function extractDocs(text: string): { cnpjs: string[]; cpfs: string[] } {
  const cnpjs = Array.from(text.matchAll(CNPJ_REGEX), (m) => cleanDoc(m[1]))
    .filter((value) => value.length === 14);
  const cpfs = Array.from(text.matchAll(CPF_REGEX), (m) => cleanDoc(m[1]))
    .filter((value) => value.length === 11 && !/^(\d)\1+$/.test(value));
  return {
    cnpjs: Array.from(new Set(cnpjs)),
    cpfs: Array.from(new Set(cpfs)),
  };
}

function buildJudicialEvents(ato: DOUAto, detection: DetectionResult, normalizedText: string): JudicialEvent[] {
  const resumo = summarizeAto(ato, normalizedText);
  return detection.judicialTypes.map((tipo) => {
    const pattern = CRISIS_PATTERNS.find((item) => item.tipo === tipo)!;
    return {
      tipo,
      fonte: 'DOU',
      data: ato.dataPublicacao || new Date().toISOString().slice(0, 10),
      resumo,
      url: ato.url,
      severidade: pattern.severidade,
    };
  });
}

function buildSignals(detection: DetectionResult): string[] {
  return [
    ...detection.crisis.map((item) => `DOU:${normalizeText(item).replace(/\s+/g, '-')}`),
    ...detection.agro.map((item) => `DOU:agro:${normalizeText(item).replace(/\s+/g, '-')}`),
  ];
}

const NON_JUDICIAL_TITLE_PATTERNS = [
  /EXTRATO\s+DE\s+(CONTRATO|RESCISAO|DISPENSA|TERMO)/,
  /EDITAL\s+DE\s+NOTIFICAC[AÃ]O\s+DE\s+AUTUAC[AÃ]O/,
  /AVISO\s+DE\s+PENALIDADE/,
  /AVISO\s+DE\s+LICITAC[AÃ]O/,
  /AVISO\s+DE\s+DISPENSA/,
  /PORTARIA/,
  /NOMEAC[AÃ]O/,
  /DESIGNAC[AÃ]O/,
  /CONCESS[AÃ]O\s+DE\s+APOSENTADORIA/,
];

function isAdministrativeTitle(titulo: string): boolean {
  const n = normalizeText(titulo);
  return NON_JUDICIAL_TITLE_PATTERNS.some((re) => re.test(n));
}

export function atoToLeads(ato: DOUAto): LeadExtraction {
  // Título administrativo explícito? descarta antes de tudo — se o DOU marcou
  // o ato como RESCISÃO DE CONTRATO, ele não é uma RJ/falência, por mais que
  // o snippet vizinho da busca venha contaminado com outros atos.
  if (isAdministrativeTitle(ato.titulo)) {
    return {
      leads: [],
      detection: { crisis: [], agro: [], judicialTypes: [] },
      docs: { cnpjs: [], cpfs: [] },
      normalizedText: '',
      discardReason: 'titulo_administrativo',
    };
  }

  const normalizedText = normalizeText(`${ato.titulo} ${ato.texto}`);
  const detection = detectCrisisAgro(normalizedText);
  if (detection.crisis.length === 0) {
    return { leads: [], detection, docs: { cnpjs: [], cpfs: [] }, normalizedText, discardReason: 'sem_crise' };
  }
  // Exigimos agro explícito no texto. Não aceitamos "query agro → agro implícito"
  // porque a página de resultados do DOU contamina snippets de atos vizinhos,
  // gerando falsos positivos em massa.
  if (detection.agro.length === 0) {
    return { leads: [], detection, docs: { cnpjs: [], cpfs: [] }, normalizedText, discardReason: 'sem_agro' };
  }

  const docs = extractDocs(`${ato.titulo} ${ato.texto}`);
  if (docs.cnpjs.length === 0 && docs.cpfs.length === 0) {
    return { leads: [], detection, docs, normalizedText, discardReason: 'sem_documento' };
  }

  const now = ato.dataPublicacao || new Date().toISOString().slice(0, 10);
  const signals = buildSignals(detection);
  const judicialEvents = buildJudicialEvents(ato, detection, normalizedText);
  const nomeBase = `[DOU ${now}] ${ato.titulo.slice(0, 120)}`;
  const leads: LeadRaw[] = [];

  for (const cnpj of docs.cnpjs) {
    leads.push({
      cpfCnpj: cnpj,
      cpfCnpjClean: cnpj,
      tipoPessoa: 'PJ',
      nome: nomeBase,
      uf: '',
      agroSignals: signals,
      debts: [] as DebtRecord[],
      totalDivida: 0,
      qtdInscricoes: 0,
      primeiraInscricao: now,
      ultimaInscricao: now,
      temAjuizada: true,
      judicialEvents,
    });
  }

  for (const cpf of docs.cpfs) {
    leads.push({
      cpfCnpj: cpf,
      cpfCnpjClean: cpf,
      tipoPessoa: 'PF',
      nome: nomeBase,
      uf: '',
      agroSignals: signals,
      debts: [] as DebtRecord[],
      totalDivida: 0,
      qtdInscricoes: 0,
      primeiraInscricao: now,
      ultimaInscricao: now,
      temAjuizada: true,
      judicialEvents,
    });
  }

  return { leads, detection, docs, normalizedText };
}

export class DOUSource implements LeadSource {
  readonly fonte = 'DOU';

  private leads: LeadRaw[] = [];
  private byCpfCnpj = new Map<string, LeadRaw>();
  private fileManifest: DOULeadFile['manifest'] | null = null;
  private loaded = false;

  constructor(private readonly storagePath: string) {}

  private indexPath(): string {
    return join(this.storagePath, 'dou-leads.json');
  }

  load(): void {
    if (this.loaded) return;
    const path = this.indexPath();
    if (!existsSync(path)) {
      console.log('[DOUSource] Índice não encontrado — rode scripts/ingest-dou.ts ou aguarde cron');
      this.loaded = true;
      return;
    }
    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed: DOULeadFile = JSON.parse(raw);
      this.leads = parsed.leads;
      this.fileManifest = parsed.manifest;
      for (const lead of this.leads) this.byCpfCnpj.set(lead.cpfCnpjClean, lead);
      console.log(`[DOUSource] ${this.leads.length} leads DOU carregados (gerado ${parsed.manifest.generatedAt})`);
    } catch (err) {
      console.warn('[DOUSource] falha carregando:', (err as Error).message);
    }
    this.loaded = true;
  }

  all(): LeadRaw[] {
    this.load();
    return this.leads;
  }

  /** Limpa o cache em memória para forçar releitura do disco na próxima load(). */
  reload(): void {
    this.loaded = false;
    this.leads = [];
    this.byCpfCnpj.clear();
    this.fileManifest = null;
  }

  find(cpfCnpj: string): LeadRaw | null {
    this.load();
    return this.byCpfCnpj.get(cpfCnpj.replace(/\D/g, '')) ?? null;
  }

  manifest(): LeadSourceManifest {
    this.load();
    return {
      fonte: this.fonte,
      descricao: 'Diário Oficial da União — empresas/pessoas agro em RJ, falência, penhora ou leilão judicial',
      contagem: this.leads.length,
      lastIngestAt: this.fileManifest?.generatedAt ?? null,
      extra: this.fileManifest?.stats as Record<string, unknown> | undefined,
    };
  }

  saveLeads(newLeads: LeadRaw[], stats: DOUStats): void {
    this.load();
    for (const lead of newLeads) {
      const existing = this.byCpfCnpj.get(lead.cpfCnpjClean);
      if (existing) {
        existing.agroSignals = Array.from(new Set([...(existing.agroSignals ?? []), ...(lead.agroSignals ?? [])]));
        if (lead.judicialEvents?.length) {
          const eventKeys = new Set((existing.judicialEvents ?? []).map((event) => `${event.tipo}:${event.data}:${event.resumo}`));
          const merged = [...(existing.judicialEvents ?? [])];
          for (const event of lead.judicialEvents) {
            const key = `${event.tipo}:${event.data}:${event.resumo}`;
            if (!eventKeys.has(key)) {
              merged.push(event);
              eventKeys.add(key);
            }
          }
          existing.judicialEvents = merged;
        }
        if (lead.ultimaInscricao > existing.ultimaInscricao) {
          existing.ultimaInscricao = lead.ultimaInscricao;
        }
      } else {
        this.leads.push(lead);
        this.byCpfCnpj.set(lead.cpfCnpjClean, lead);
      }
    }

    this.fileManifest = {
      generatedAt: new Date().toISOString(),
      source: 'Diário Oficial da União (in.gov.br)',
      searchedAt: new Date().toISOString(),
      stats,
    };

    const path = this.indexPath();
    mkdirSync(dirname(path), { recursive: true });
    const file: DOULeadFile = { manifest: this.fileManifest, leads: this.leads };
    writeFileSync(path, JSON.stringify(file, null, 2));
    console.log(`[DOUSource] Persistido ${this.leads.length} leads (+${newLeads.length} desta ingest)`);
  }
}

export async function fetchDOUAtosViaPuppeteer(opts: { query?: string; days?: number } = {}): Promise<DOUAto[]> {
  const puppeteerMod = await import('puppeteer');
  const puppeteer = puppeteerMod.default ?? puppeteerMod;

  const queries = opts.query
    ? [opts.query]
    : [
        'recuperação judicial agropecuária',
        'falência agropecuária',
        'leilão judicial fazenda',
        'alienação judicial imóvel rural',
        'penhora produtor rural',
      ];
  const days = opts.days ?? 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

  let browser: any = null;
  const allAtos: DOUAto[] = [];
  const seen = new Set<string>();
  try {
    browser = await puppeteer.launch({
      headless: 'new' as any,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    for (const query of queries) {
      try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0');
        const url = `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(query)}&publishFrom=${fmt(start)}&publishTo=${fmt(end)}&s=todos&exactDate=personalizado&delta=50`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 });
        try {
          await page.waitForSelector('.resultado, .resultados, .search-results-resultado, a[href*="/web/dou/-/"]', { timeout: 10_000 });
        } catch {}

        // Código passado como string evita que o tsx/esbuild injete helpers
        // (__name, __defProp) que não existem no runtime do browser do Puppeteer.
        const atos = (await page.evaluate(`(function() {
          var out = [];
          function pickLocalSnippet(link, container) {
            var el = container || link.closest('li, article, div.resultado, div.search-result');
            if (!el) return (link.textContent || '').trim();
            var dedicated = el.querySelector('.hit-abstract, .description, .abstract, .snippet, p');
            if (dedicated) return (dedicated.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 800);
            var clone = el.cloneNode(true);
            var ownHref = link.getAttribute('href');
            var others = clone.querySelectorAll('a[href*="/dou/-/"]');
            for (var i = 0; i < others.length; i++) {
              if (others[i].getAttribute('href') !== ownHref) others[i].remove();
            }
            return (clone.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 800);
          }
          var containers = Array.prototype.slice.call(
            document.querySelectorAll('div.resultado, div.search-result, div.card-resultado, .row.entry, li.result-item')
          );
          if (containers.length > 0) {
            for (var ci = 0; ci < containers.length; ci++) {
              var container = containers[ci];
              var link = container.querySelector('a[href*="/dou/-/"]');
              if (!link) continue;
              var titulo = (link.textContent || '').replace(/\\s+/g, ' ').trim();
              out.push({ titulo: titulo, url: link.href, snippet: pickLocalSnippet(link, container) });
            }
          } else {
            var links = Array.prototype.slice.call(
              document.querySelectorAll('a[href*="/web/dou/-/"], a[href*="/en/web/dou/-/"]')
            );
            for (var li = 0; li < links.length; li++) {
              var l = links[li];
              var tt = (l.textContent || '').replace(/\\s+/g, ' ').trim();
              if (tt.length < 10) continue;
              out.push({ titulo: tt, url: l.href, snippet: pickLocalSnippet(l, null) });
            }
          }
          return out;
        })()`)) as Array<{ titulo: string; url: string; snippet: string }>;

        for (const ato of atos) {
          if (seen.has(ato.url)) continue;
          seen.add(ato.url);
          allAtos.push({
            titulo: ato.titulo.slice(0, 250),
            texto: `${ato.titulo}\n\n${ato.snippet}`,
            dataPublicacao: end.toISOString().slice(0, 10),
            url: ato.url,
            queryOrigem: query,
          });
        }
        await page.close();
      } catch (err) {
        console.warn(`[DOUSource/puppeteer] query="${query}" erro:`, (err as Error).message);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(`[DOUSource/puppeteer] ${allAtos.length} atos únicos das ${queries.length} queries`);
  return allAtos;
}

export async function fetchDOUAtos(opts: { query?: string; days?: number } = {}): Promise<DOUAto[]> {
  const queries = opts.query
    ? [opts.query]
    : [
        'recuperação judicial agropecuária',
        'falência agropecuária',
        'leilão judicial fazenda',
        'leilão judicial imóvel rural',
        'alienação judicial agropecuária',
        'penhora produtor rural',
      ];
  const days = opts.days ?? 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
  };

  const allAtos: DOUAto[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    const url = `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(query)}&publishFrom=${fmt(start)}&publishTo=${fmt(end)}&s=todos&exactDate=personalizado&delta=50`;
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        console.warn(`[DOUSource] fetch HTTP ${response.status} query="${query}"`);
        continue;
      }
      const html = await response.text();
      const atoRegex = /<a[^>]+href="(\/en\/web\/dou\/-\/[^"]+|\/web\/dou\/-\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      for (const match of html.matchAll(atoRegex)) {
        const href = match[1];
        const titulo = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 250);
        if (!titulo || titulo.length < 15) continue;
        if (seenUrls.has(href)) continue;
        seenUrls.add(href);
        allAtos.push({
          titulo,
          texto: titulo,
          dataPublicacao: end.toISOString().slice(0, 10),
          url: href.startsWith('http') ? href : `https://www.in.gov.br${href}`,
          queryOrigem: query,
        });
      }
    } catch (err) {
      console.warn(`[DOUSource] erro query="${query}":`, (err as Error).message);
    }
  }

  console.log(`[DOUSource] fetch: ${allAtos.length} atos únicos das ${queries.length} queries`);
  return allAtos;
}

export async function fetchDOUAtoDetalhe(atoUrl: string): Promise<string | null> {
  try {
    const response = await fetch(atoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(/<div[^>]+class="[^"]*texto-dou[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="rodape/i)
      ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      ?? html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (!match) return null;
    return match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
}

export async function ingestDOUOnce(
  source: DOUSource,
  opts: { usePuppeteer?: boolean } = {},
): Promise<{ scanned: number; matched: number; agroMatched: number; newLeads: number; enrichedByDetail: number; withDocs: number; discardReasons: Record<string, number> }> {
  const usePuppeteer = opts.usePuppeteer ?? ((process.env.DOU_USE_PUPPETEER ?? 'true').toLowerCase() !== 'false');
  let atos: DOUAto[] = [];
  if (usePuppeteer) {
    try {
      atos = await fetchDOUAtosViaPuppeteer({ days: 30 });
    } catch (err) {
      console.warn('[DOUSource] Puppeteer falhou, fallback para fetch HTML:', (err as Error).message);
      atos = await fetchDOUAtos({ days: 30 });
    }
  } else {
    atos = await fetchDOUAtos({ days: 30 });
  }

  let matched = 0;
  let agroMatched = 0;
  let withDocs = 0;
  let detailFetched = 0;
  const discardReasons: Record<string, number> = {};
  const allLeads: LeadRaw[] = [];

  const addDiscard = (reason: string | undefined) => {
    if (!reason) return;
    discardReasons[reason] = (discardReasons[reason] || 0) + 1;
  };

  const firstPassResults = atos.map((ato) => ({ ato, extraction: atoToLeads(ato) }));
  for (const result of firstPassResults) {
    if (result.extraction.detection.crisis.length > 0) matched++;
    if (result.extraction.detection.crisis.length > 0 && result.extraction.detection.agro.length > 0) {
      agroMatched++;
    }
    if (result.extraction.leads.length > 0) {
      withDocs++;
      allLeads.push(...result.extraction.leads);
    } else {
      addDiscard(result.extraction.discardReason);
    }
  }

  // 2º passe: buscar detalhe de atos cujo snippet foi insuficiente. Inclui:
  // - sem_documento (snippet detectou crise+agro mas não viu CPF/CNPJ)
  // - sem_crise (snippet curto demais, título não administrativo — pode ser edital judicial)
  // - sem_agro (crise presente mas agro não confirmado no snippet)
  // Não inclui: titulo_administrativo (descarte firme).
  const AMBIGUOUS_DISCARDS = new Set(['sem_documento', 'sem_crise', 'sem_agro']);
  const atosSemDoc = firstPassResults
    .filter(({ ato, extraction }) => ato.url && AMBIGUOUS_DISCARDS.has(extraction.discardReason ?? ''))
    .map(({ ato }) => ato);

  console.log(`[DOUSource] 2º passe: ${atosSemDoc.length} atos ambíguos → fetch detalhe (cap=80)`);
  for (const ato of atosSemDoc.slice(0, 80)) {
    try {
      const texto = await fetchDOUAtoDetalhe(ato.url!);
      detailFetched++;
      if (!texto) {
        addDiscard('detalhe_vazio');
        continue;
      }
      const extraction = atoToLeads({ ...ato, texto: `${ato.titulo}\n\n${ato.texto}\n\n${texto}`, queryOrigem: ato.queryOrigem });
      if (extraction.leads.length > 0) {
        withDocs++;
        allLeads.push(...extraction.leads);
      } else {
        addDiscard(`detalhe_${extraction.discardReason ?? 'sem_match'}`);
      }
    } catch {
      addDiscard('detalhe_erro');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const stats: DOUStats = {
    scanned: atos.length,
    matched,
    agroMatched,
    withDocs,
    detailFetched,
    discardReasons,
  };
  source.saveLeads(allLeads, stats);
  return {
    scanned: stats.scanned,
    matched: stats.matched,
    agroMatched: stats.agroMatched,
    newLeads: allLeads.length,
    enrichedByDetail: stats.detailFetched,
    withDocs: stats.withDocs,
    discardReasons: stats.discardReasons,
  };
}

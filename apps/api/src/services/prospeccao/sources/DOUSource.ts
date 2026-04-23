// ============================================================
// DOUSource — leads a partir do Diário Oficial da União
// ============================================================
// Fonte pública: https://www.in.gov.br — imprensa nacional
// Busca atos com CPF/CNPJ agro em contexto de crise:
//   • Recuperação judicial (RJ) decretada
//   • Falência decretada
//   • Leilão judicial de imóvel rural
//   • Penhora anunciada
//
// Cada ato tem o CPF/CNPJ completo no corpo do texto — usamos regex
// para extrair. Filtra por co-ocorrência de keywords agro + crise.
//
// Persistência: apps/api/storage/prospeccao/dou-leads.json
// (ingest roda manualmente via scripts/ingest-dou.ts ou no cron diário)
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { LeadRaw, DebtRecord } from '../types';
import type { LeadSource, LeadSourceManifest } from './LeadSource';

interface DOULeadFile {
  manifest: {
    generatedAt: string;
    source: string;
    searchedAt: string;
    stats: { scanned: number; matched: number; agroMatched: number };
  };
  leads: LeadRaw[];
}

// Padrões agro para co-ocorrência com termos de crise
const AGRO_KEYWORDS_DOU = [
  'agropecuária', 'agropecuaria', 'agrícola', 'agricola', 'agronegócio', 'agronegocio',
  'rural', 'fazenda', 'sítio', 'sitio', 'pecuária', 'pecuaria',
  'produtor rural', 'soja', 'milho', 'café', 'cafe', 'algodão', 'algodao',
  'grãos', 'graos', 'cooperativa agrícola', 'cooperativa rural',
];

const CRISIS_KEYWORDS = [
  'recuperação judicial', 'recuperacao judicial', 'decretada a falência', 'decretada a falencia',
  'leilão judicial', 'leilao judicial', 'leilão de imóvel rural',
  'alienação judicial', 'alienacao judicial',
  'penhora', 'arrematação', 'arrematacao',
];

const CNPJ_REGEX = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g;
const CPF_REGEX = /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g;

/**
 * Fonte de leads derivada do DOU — empresas e pessoas agro em crise
 * (recuperação judicial, falência, leilão judicial).
 */
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
      for (const l of this.leads) this.byCpfCnpj.set(l.cpfCnpjClean, l);
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

  find(cpfCnpj: string): LeadRaw | null {
    this.load();
    return this.byCpfCnpj.get(cpfCnpj.replace(/\D/g, '')) ?? null;
  }

  manifest(): LeadSourceManifest {
    this.load();
    return {
      fonte: this.fonte,
      descricao: 'Diário Oficial da União — empresas/pessoas agro em RJ, falência ou leilão judicial',
      contagem: this.leads.length,
      lastIngestAt: this.fileManifest?.generatedAt ?? null,
      extra: this.fileManifest?.stats,
    };
  }

  /**
   * Persiste novos leads detectados via ingest. Merge-in com os existentes,
   * preservando signals de crise acumulados.
   */
  saveLeads(newLeads: LeadRaw[], stats: { scanned: number; matched: number; agroMatched: number }): void {
    this.load();
    for (const l of newLeads) {
      const existing = this.byCpfCnpj.get(l.cpfCnpjClean);
      if (existing) {
        // Merge agroSignals (usado para crise keywords)
        const mergedSignals = Array.from(new Set([...existing.agroSignals, ...l.agroSignals]));
        existing.agroSignals = mergedSignals;
        // Mantém último ato visto via ultimaInscricao
        if (l.ultimaInscricao > existing.ultimaInscricao) {
          existing.ultimaInscricao = l.ultimaInscricao;
        }
      } else {
        this.leads.push(l);
        this.byCpfCnpj.set(l.cpfCnpjClean, l);
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

// ─────────────────────────────────────────────────────────
// Ingest utilities (usados pelo cron/script)
// ─────────────────────────────────────────────────────────

/**
 * Normaliza CPF/CNPJ para formato só-dígitos.
 */
function cleanDoc(doc: string): string {
  return doc.replace(/\D/g, '');
}

/**
 * Detecta keywords de crise + agro num bloco de texto do DOU.
 * Retorna array de crise keywords encontradas.
 */
export function detectCrisisAgro(text: string): { crisis: string[]; agro: string[] } {
  const lower = text.toLowerCase();
  const crisis = CRISIS_KEYWORDS.filter(k => lower.includes(k.toLowerCase()));
  const agro = AGRO_KEYWORDS_DOU.filter(k => lower.includes(k.toLowerCase()));
  return { crisis, agro };
}

/**
 * Extrai CPFs e CNPJs de um bloco de texto.
 */
export function extractDocs(text: string): { cnpjs: string[]; cpfs: string[] } {
  const cnpjs = Array.from(text.matchAll(CNPJ_REGEX), m => cleanDoc(m[1]))
    .filter(c => c.length === 14);
  const cpfs = Array.from(text.matchAll(CPF_REGEX), m => cleanDoc(m[1]))
    .filter(c => c.length === 11 && !/^(\d)\1+$/.test(c)); // exclui 111.111.111-11
  return { cnpjs: Array.from(new Set(cnpjs)), cpfs: Array.from(new Set(cpfs)) };
}

/**
 * Converte um ato DOU em LeadRaw(s) — um por CPF/CNPJ extraído com contexto agro.
 */
export function atoToLeads(ato: {
  titulo: string;
  texto: string;
  dataPublicacao: string;
  url?: string;
}): LeadRaw[] {
  const { crisis, agro } = detectCrisisAgro(ato.titulo + ' ' + ato.texto);
  if (crisis.length === 0 || agro.length === 0) return [];

  const { cnpjs, cpfs } = extractDocs(ato.texto);
  const leads: LeadRaw[] = [];
  const now = ato.dataPublicacao || new Date().toISOString().slice(0, 10);

  // Signal composto identifica o evento (ex: "DOU:rj-agropecuaria")
  const signals = [...crisis.map(c => `DOU:${c.replace(/\s+/g, '-')}`), ...agro.map(a => `DOU:agro:${a}`)];

  for (const cnpj of cnpjs) {
    leads.push({
      cpfCnpj: cnpj,
      cpfCnpjClean: cnpj,
      tipoPessoa: 'PJ',
      nome: `[DOU ${now}] ${ato.titulo.slice(0, 80)}`,
      uf: '', // DOU não expõe UF diretamente — pode enriquecer via BrasilAPI
      agroSignals: signals,
      debts: [] as DebtRecord[],
      totalDivida: 0,
      qtdInscricoes: 0,
      primeiraInscricao: now,
      ultimaInscricao: now,
      temAjuizada: true, // DOU = sempre ajuizado
    });
  }
  for (const cpf of cpfs) {
    leads.push({
      cpfCnpj: cpf,
      cpfCnpjClean: cpf,
      tipoPessoa: 'PF',
      nome: `[DOU ${now}] ${ato.titulo.slice(0, 80)}`,
      uf: '',
      agroSignals: signals,
      debts: [] as DebtRecord[],
      totalDivida: 0,
      qtdInscricoes: 0,
      primeiraInscricao: now,
      ultimaInscricao: now,
      temAjuizada: true,
    });
  }
  return leads;
}

/**
 * Scraper do DOU — consulta imprensa nacional via URL pública de busca.
 * A API oficial é o in.gov.br/consulta — aceita query por texto.
 * Retorna atos recentes (últimos 30 dias por padrão).
 */
export async function fetchDOUAtos(opts: { query?: string; days?: number } = {}): Promise<Array<{ titulo: string; texto: string; dataPublicacao: string; url?: string }>> {
  const queries = opts.query
    ? [opts.query]
    : [
        'recuperação judicial agropecuária',
        'falência agropecuária',
        'leilão judicial fazenda',
        'leilão judicial imóvel rural',
        'alienação judicial agropecuária',
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

  const allAtos: Array<{ titulo: string; texto: string; dataPublicacao: string; url?: string }> = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    const url = `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(query)}&publishFrom=${fmt(start)}&publishTo=${fmt(end)}&s=todos&exactDate=personalizado&delta=50`;
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) {
        console.warn(`[DOUSource] fetch HTTP ${r.status} query="${query}"`);
        continue;
      }
      const html = await r.text();
      // Estrutura do DOU: blocos com <a href="/web/dou/-/..." class="resultados"> ou divs
      const atoRegex = /<a[^>]+href="(\/en\/web\/dou\/-\/[^"]+|\/web\/dou\/-\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      for (const m of html.matchAll(atoRegex)) {
        const href = m[1];
        const titulo = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 250);
        if (!titulo || titulo.length < 15) continue;
        if (seenUrls.has(href)) continue;
        seenUrls.add(href);
        allAtos.push({
          titulo,
          texto: titulo, // Primeiro passe: só título. Segunda onda: fetchar ato completo.
          dataPublicacao: end.toISOString().slice(0, 10),
          url: href.startsWith('http') ? href : `https://www.in.gov.br${href}`,
        });
      }
    } catch (err) {
      console.warn(`[DOUSource] erro query="${query}":`, (err as Error).message);
    }
  }
  console.log(`[DOUSource] fetch: ${allAtos.length} atos únicos das ${queries.length} queries`);
  return allAtos;
}

/**
 * Fetch do texto completo de um ato DOU (para extrair CPF/CNPJ).
 */
export async function fetchDOUAtoDetalhe(atoUrl: string): Promise<string | null> {
  try {
    const r = await fetch(atoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    // Extrai conteúdo principal — área entre <div class="texto-dou"> e </div>, ou body
    const match = html.match(/<div[^>]+class="[^"]*texto-dou[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="rodape/i)
      ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (!match) return null;
    return match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
}

/**
 * Pipeline completo de ingest: busca DOU, extrai leads agro em crise, persiste.
 */
export async function ingestDOUOnce(source: DOUSource): Promise<{ scanned: number; matched: number; agroMatched: number; newLeads: number }> {
  const atos = await fetchDOUAtos({ days: 30 });
  let matched = 0;
  let agroMatched = 0;
  const allLeads: LeadRaw[] = [];

  // Primeiro passe: tenta extrair CPF/CNPJ só dos títulos
  for (const ato of atos) {
    const leads = atoToLeads(ato);
    if (leads.length > 0) agroMatched++;
    matched++;
    allLeads.push(...leads);
  }

  // Segundo passe: nos atos com agroSignal mas SEM CPF/CNPJ no título,
  // fetcha o texto completo (rate-limited). Só para atos claramente de crise.
  let enriched = 0;
  const atosSemDoc = atos.filter(ato => {
    if (!ato.url) return false;
    const { crisis, agro } = detectCrisisAgro(ato.titulo);
    if (crisis.length === 0 || agro.length === 0) return false;
    // Se já extraímos CPF/CNPJ do título, pula
    const { cnpjs, cpfs } = extractDocs(ato.titulo);
    return cnpjs.length === 0 && cpfs.length === 0;
  });
  // Limitamos a 20 detalhes por ingest pra não demorar demais
  for (const ato of atosSemDoc.slice(0, 20)) {
    try {
      const texto = await fetchDOUAtoDetalhe(ato.url!);
      if (!texto) continue;
      const leadsDetalhe = atoToLeads({ ...ato, texto });
      if (leadsDetalhe.length > 0) {
        enriched++;
        allLeads.push(...leadsDetalhe);
      }
    } catch {
      /* silently */
    }
    await new Promise(res => setTimeout(res, 500)); // rate-limit
  }
  console.log(`[DOUSource] Segundo passe enriqueceu ${enriched} atos com texto completo`);

  const stats = { scanned: atos.length, matched, agroMatched };
  source.saveLeads(allLeads, stats);
  return { ...stats, newLeads: allLeads.length };
}

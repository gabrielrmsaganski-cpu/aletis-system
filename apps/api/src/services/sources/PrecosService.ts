// ============================================================
// ALETIS — Preços Service
// Commodity prices: CEPEA/ESALQ scraping, B3, CONAB
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import NodeCache from 'node-cache';
import { LastObservationStore } from './LastObservationStore.js';
import type { DataSourceManager } from '../DataSourceManager.js';
import { bypassCloudflareAndFetch } from '../captcha/CloudflareBypass.js';
import { parseMoneyPtBr } from '../../lib/parseMoneyPtBr.js';

// ── Types ────────────────────────────────────────────────────

export interface CotacaoCommodity {
  commodity: string;
  preco: number;
  unidade: string;
  variacao: number;     // % change
  data: string;
  moeda: string;
  fonte: 'api' | 'cache' | 'fallback';
  descricao?: string;
  estado?: 'disponivel' | 'atrasado';
  coletadoEm?: string;
  referencia?: string;
  praca?: string;
  fonteUrl?: string;
}

export interface HistoricoCommodity {
  commodity: string;
  unidade: string;
  dados: { data: string; valor: number }[];
  fonte: 'api' | 'cache' | 'fallback';
}

export interface PrevisaoSafra {
  safra: string;
  culturas: SafraCultura[];
  atualizadoEm: string;
  fonte: 'api' | 'cache' | 'fallback';
}

export interface SafraCultura {
  cultura: string;
  areaPlantada: number;       // mil hectares
  producao: number;           // mil toneladas
  produtividade: number;      // kg/ha
  variacaoProducao: number;   // % vs safra anterior
}

const COMMODITY_NAMES: Record<string, string> = { boi: 'boi_gordo', cafe: 'cafe_arabica' };

// ── CEPEA URL Map ────────────────────────────────────────────

const CEPEA_URLS: Record<string, string> = {
  soja: 'https://www.cepea.esalq.usp.br/br/indicador/soja.aspx',
  milho: 'https://www.cepea.esalq.usp.br/br/indicador/milho.aspx',
  boi: 'https://www.cepea.esalq.usp.br/br/indicador/boi-gordo.aspx',
  cafe: 'https://www.cepea.esalq.usp.br/br/indicador/cafe.aspx',
  algodao: 'https://www.cepea.esalq.usp.br/br/indicador/algodao.aspx',
};

interface IndicatorIdentity {
  descricao: string;
  unidade: string;
  praca: string;
}

export interface ParsedIndicatorQuote {
  preco: number;
  variacao: number;
  data: string;
  indicador: IndicatorIdentity;
}

const compact = (value: string): string => value.replace(/\s+/g, ' ').trim();
const normalized = (value: string): string => compact(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

function observationDate(value: string): string | null {
  const match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(Date.parse(iso))
    && new Date(iso).toISOString().slice(0, 10) === iso && iso <= new Date().toISOString().slice(0, 10) ? iso : null;
}

function indicatorIdentity(commodity: string, title: string, context: string): IndicatorIdentity | null {
  const name = normalized(title);
  const text = normalized(context);
  if (!/CEPEA|ESALQ/.test(text)) return null;
  const titleMatches: Record<string, RegExp> = {
    soja: /SOJA.*\bPARANA\b/,
    milho: /MILHO/,
    boi: /BOI GORDO/,
    cafe: /CAFE.*ARABICA/,
    algodao: /ALGODAO/,
  };
  if (!titleMatches[commodity]?.test(name)) return null;
  // Não confundir soja Paraná com Paranaguá, boi à vista com prazo, ou arábica com robusta.
  if ((commodity === 'soja' && /PARANAGUA/.test(name)) || (commodity === 'boi' && /PRAZO|BEZERRO/.test(name))) return null;
  const hasBRL = /R\$|REAIS/.test(text);
  const unit = commodity === 'algodao' && /CENT(?:AVOS)?\b/.test(text) && /\b(?:LB|LP)\b|LIBRA/.test(text) && hasBRL ? 'centavos R$/libra-peso'
    : commodity === 'boi' && /ARROBA|@/.test(text) && hasBRL ? 'R$/@'
    : ['soja', 'milho', 'cafe'].includes(commodity) && /60\s*KG/.test(text) && hasBRL ? 'R$/saca 60kg' : null;
  if (!unit) return null;
  // O indicador identifica uma cesta própria de praças. Não deduzir uma cidade de um nome genérico.
  const praca = commodity === 'soja' ? 'Paraná'
    : /CAMPINAS/.test(name) ? 'Campinas (SP)'
    : /SAO PAULO|\bSP\b/.test(name) ? 'São Paulo'
    : `Referência agregada: ${compact(title)}`;
  return { descricao: compact(title), unidade: unit, praca };
}

function quoteFromTable($: cheerio.CheerioAPI, table: Parameters<cheerio.CheerioAPI>[0], identity: IndicatorIdentity): ParsedIndicatorQuote | null {
  const priceHeader = $(table).find('thead th').eq(1).text();
  if (priceHeader && !/R\$|reais/i.test(priceHeader)) return null;
  const quotes: ParsedIndicatorQuote[] = [];
  for (const row of $(table).find('tbody tr').toArray()) {
    const cells = $(row).find('td');
    if (cells.length < 3) continue;
    const data = compact(cells.eq(0).text());
    const amount = compact(cells.eq(1).text());
    const variation = compact(cells.eq(2).text()).replace(/%$/, '').trim();
    // A célula toda precisa ser um número; anúncios, faixas e textos não são valores.
    if (!observationDate(data) || !/^(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(amount)
        || !/^[+-]?\d+(?:[,.]\d{1,4})?$/.test(variation)) continue;
    const parsed = parseMoneyPtBr(amount).amount;
    if (!parsed || /^0\.00$/.test(parsed)) continue;
    // Conversão somente na fronteira do contrato legado; validação monetária usa decimal/BigInt.
    quotes.push({ preco: Number(parsed), variacao: Number(variation.replace(',', '.')), data, indicador: identity });
  }
  return quotes.sort((a, b) => observationDate(b.data)!.localeCompare(observationDate(a.data)!))[0] || null;
}

/** Uma tabela só recebe metadados da própria seção, nunca do ticker ou de outra commodity. */
export function parseNoticiasAgricolasQuote(commodity: string, html: string): ParsedIndicatorQuote | null {
  const $ = cheerio.load(html);
  for (const table of $('table.cot-fisicas').toArray()) {
    const section = $(table).closest('.cotacao');
    const title = section.length
      ? compact(section.children('.info').find('h2,h3,h4').first().text())
      : compact([$(table).prev('h2,h3,h4').text(), $(table).parent().prev('h2,h3,h4').text()].join(' '));
    // Texto de células adjacentes precisa de separador: "lb" + "Variação" não vira uma unidade desconhecida.
    const headers = $(table).find('caption,thead th').toArray().map(cell => compact($(cell).text())).join(' ');
    const source = section.length ? compact(section.children('.info').find('.fonte').text()) : '';
    const context = compact(`${title} ${source} ${headers}`);
    const identity = indicatorIdentity(commodity, title, context);
    if (!identity) continue;
    const quote = quoteFromTable($, table, identity);
    if (quote) return quote;
  }
  return null;
}

/** O CEPEA publica o preço em imagenet-indicadorN e a unidade nas notas da mesma seção. */
export function parseCepeaQuote(commodity: string, html: string): ParsedIndicatorQuote | null {
  const $ = cheerio.load(html);
  if (!/CEPEA|ESALQ/i.test($('title').text())) return null;
  for (const table of $('table[id^="imagenet-indicador"]').toArray()) {
    const section = $(table).parents('div.imagenet-col-12').first();
    if (!section.length || section.find('table').length !== 1) continue;
    const content = compact(section.text());
    const position = content.indexOf(compact($(table).text()));
    if (position < 1) continue;
    const title = content.slice(0, position).trim();
    const next = section.next();
    const adjacentNote = next.find('table').length === 0 && /nota/i.test(next.text()) ? next.text() : '';
    const identity = indicatorIdentity(commodity, title, `${content} ${adjacentNote}`);
    // A primeira coluna monetária deve ser em reais, não a coluna de conversão para dólares.
    if (!identity || !/R\$/i.test($(table).find('thead th').eq(1).text())) continue;
    const quote = quoteFromTable($, table, identity);
    if (quote) return quote;
  }
  return null;
}

// ── Service Class ────────────────────────────────────────────

export class PrecosService {
  private readonly observations = new LastObservationStore('cepea');
  private readonly cache: NodeCache;
  private readonly httpScraper: AxiosInstance;
  private readonly httpCONAB: AxiosInstance;
  private readonly manager: DataSourceManager;
  private readonly inFlight = new Map<string, Promise<CotacaoCommodity>>();

  constructor(manager: DataSourceManager) {
    this.manager = manager;

    this.cache = new NodeCache({
      stdTTL: 1800,
      checkperiod: 120,
      useClones: false,
    });

    this.httpScraper = axios.create({
      timeout: 5000,
      headers: {
        'User-Agent': 'ALETIS-System/2.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      maxRedirects: 5,
    });

    this.httpCONAB = axios.create({
      baseURL: 'https://portaldeinformacoes.conab.gov.br',
      timeout: 5000,
      headers: { 'User-Agent': 'ALETIS-System/1.0' },
    });
  }

  // ── Private: CEPEA Scraper ───────────────────────────────

  private async scrapeCEPEA(commodity: string): Promise<CotacaoCommodity> {
    const pending = this.inFlight.get(commodity);
    if (pending) return pending;
    const request = this.fetchCEPEA(commodity).finally(() => { this.inFlight.delete(commodity); });
    this.inFlight.set(commodity, request);
    return request;
  }

  private async fetchCEPEA(commodity: string): Promise<CotacaoCommodity> {
    const url = CEPEA_URLS[commodity];
    if (!url) throw new Error(`Commodity ${commodity} não suportada para scraping CEPEA`);

    const sourceName = `cepea_${commodity}`;
    const cacheKey = `precos_${commodity}`;

    const cached = this.cache.get<CotacaoCommodity>(cacheKey);
    if (cached) {
      console.log(`[Preços] ${commodity} retornado do cache`);
      return { ...cached, fonte: cached.fonte === 'fallback' ? 'fallback' : 'cache' };
    }

    const startTime = Date.now();

    // A republicação é útil quando identifica o mesmo indicador e sua unidade.
    // Em falhas transitórias, conserva-se a última observação com a data original.

    // Passo 1: NoticiasAgricolas (primário)
    try {
      const na = await this.scrapeNoticiasAgricolas(commodity);
      if (na && na.preco > 0) {
        const latencia = Date.now() - startTime;
        return this.finalizarCotacao(commodity, sourceName, na.preco, na.variacao, na.data, latencia, cacheKey, na.indicador, `https://www.noticiasagricolas.com.br/cotacoes/${commodity}`);
      }
    } catch (err) {
      console.warn(
        `[Preços] NoticiasAgricolas ${commodity} falhou: ${err instanceof Error ? err.message : 'erro'}`
      );
    }

    // Passo 2: CEPEA direto via HTTP (raramente funciona, mas ping barato)
    try {
      const resp = await this.httpScraper.get(url);
      if (!/Just a moment|_cf_chl_opt|Enable JavaScript/i.test(resp.data)) {
        const quote = parseCepeaQuote(commodity, resp.data);
        if (quote) {
          const latencia = Date.now() - startTime;
          return this.finalizarCotacao(commodity, sourceName, quote.preco, quote.variacao, quote.data, latencia, cacheKey, quote.indicador, url);
        }
      }
    } catch {
      /* segue */
    }

    // Passo 3: CEPEA direto via Puppeteer stealth (passa CF quando o fingerprint
    // do navegador convence — sem custo de captcha)
    try {
      console.log(`[Preços] CEPEA ${commodity}: tentando bypass Puppeteer`);
      const result = await bypassCloudflareAndFetch(url, {
        maxChallengeWaitMs: 15_000,
        totalTimeoutMs: 35_000,
        readySelector: 'table[id^="imagenet-indicador"]',
      });
      const quote = parseCepeaQuote(commodity, result.html);
      if (quote) {
        const latencia = Date.now() - startTime;
        return this.finalizarCotacao(commodity, sourceName, quote.preco, quote.variacao, quote.data, latencia, cacheKey, quote.indicador, url);
      }
    } catch (err) {
      console.warn(
        `[Preços] CEPEA Puppeteer ${commodity}: ${err instanceof Error ? err.message : 'erro'}`
      );
    }

    // Sem coleta válida, somente uma observação real preservada pode ser exibida.
    const latencia = Date.now() - startTime;
    this.manager.updateSourceStatus(sourceName, 'offline', latencia, 'todas as fontes falharam');
    const last = this.observations.get<CotacaoCommodity>(cacheKey);
    if (last) return { ...last, fonte: 'cache', estado: 'atrasado' };
    throw new Error(`Cotação ${commodity} indisponível; nenhuma observação real preservada.`);
  }

  /**
   * Republicações são aceitas apenas quando a própria tabela identifica o indicador e a unidade.
   * Formato da tabela: <table class="cot-fisicas"> com colunas
   * Data | Valor R$/Saca | Variação (%). Não usa Cloudflare.
   */
  private async scrapeNoticiasAgricolas(commodity: string): Promise<ParsedIndicatorQuote | null> {
    const NA_URLS: Record<string, string> = {
      soja: 'https://www.noticiasagricolas.com.br/cotacoes/soja',
      milho: 'https://www.noticiasagricolas.com.br/cotacoes/milho',
      boi: 'https://www.noticiasagricolas.com.br/cotacoes/boi',
      cafe: 'https://www.noticiasagricolas.com.br/cotacoes/cafe',
      algodao: 'https://www.noticiasagricolas.com.br/cotacoes/algodao',
    };
    const url = NA_URLS[commodity];
    if (!url) return null;

    const resp = await this.httpScraper.get(url, { timeout: 12_000 });
    return parseNoticiasAgricolasQuote(commodity, resp.data);
  }

  private finalizarCotacao(
    commodity: string,
    sourceName: string,
    preco: number,
    variacao: number,
    data: string,
    latencia: number,
    cacheKey: string,
    indicador: IndicatorIdentity,
    fonteUrl: string
  ): CotacaoCommodity {
    const observed = observationDate(data);
    if (!observed) throw new Error('Cotação sem data observada válida');
    this.manager.updateSourceStatus(sourceName, 'online', latencia);
    const result: CotacaoCommodity = {
      commodity: COMMODITY_NAMES[commodity] || commodity,
      preco,
      unidade: indicador.unidade,
      variacao: isNaN(variacao) ? 0 : variacao,
      data: observed,
      coletadoEm: new Date().toISOString(),
      moeda: 'BRL',
      descricao: indicador.descricao,
      referencia: indicador.descricao,
      praca: indicador.praca,
      fonteUrl,
      fonte: 'api',
    };
    this.observations.set(cacheKey, result);
    const history = this.observations.get<CotacaoCommodity[]>(`${cacheKey}_history`) || [];
    this.observations.set(`${cacheKey}_history`, [...history.filter(h => h.data !== result.data), result].sort((a, b) => a.data.localeCompare(b.data)).slice(-500));
    this.cache.set(cacheKey, result, 1800);
    return result;
  }

  /**
   * Scraper alternativo — AgroLink republica indicadores CEPEA sem
   * proteção Cloudflare. Usado como fallback quando o CEPEA direto falha.
   */
  private async scrapeAgroLink(commodity: string): Promise<{
    preco: number;
    variacao: number;
    data: string;
  } | null> {
    const AGROLINK_URLS: Record<string, string> = {
      soja: 'https://www.agrolink.com.br/cotacoes/graos/soja',
      milho: 'https://www.agrolink.com.br/cotacoes/graos/milho',
      boi: 'https://www.agrolink.com.br/cotacoes/pecuaria/boi-gordo',
      cafe: 'https://www.agrolink.com.br/cotacoes/graos/cafe',
      algodao: 'https://www.agrolink.com.br/cotacoes/graos/algodao',
    };
    const url = AGROLINK_URLS[commodity];
    if (!url) return null;

    const resp = await this.httpScraper.get(url, { timeout: 10_000 });
    const $ = cheerio.load(resp.data);

    const parseNumber = (txt: string): number => {
      const n = parseFloat(
        txt
          .replace(/R\$|\s/g, '')
          .replace(/%/g, '')
          .replace(/\./g, '')
          .replace(',', '.')
      );
      return isNaN(n) ? 0 : n;
    };

    // AgroLink tem uma tabela com colunas: Praça | Preço | Variação | Data
    // Tentamos a primeira linha CEPEA
    let preco = 0;
    let variacao = 0;
    let data = '';

    const rows = $('table tr');
    rows.each((_i, row) => {
      if (preco > 0) return;
      const text = $(row).text();
      if (/CEPEA|ESALQ|Indicador/i.test(text)) {
        const cells = $(row).find('td');
        if (cells.length >= 3) {
          // Tenta várias colunas pra achar o preço
          for (let i = 1; i < cells.length; i++) {
            const v = parseNumber(cells.eq(i).text());
            if (v > 0 && v < 100_000) {
              preco = v;
              // Variação costuma ser a próxima coluna numérica pequena
              if (i + 1 < cells.length) variacao = parseNumber(cells.eq(i + 1).text());
              // Data costuma ser a última coluna
              data = cells.eq(cells.length - 1).text().trim();
              break;
            }
          }
        }
      }
    });

    // Fallback: primeira linha de dados
    if (preco <= 0 && rows.length > 1) {
      const cells = rows.eq(1).find('td');
      for (let i = 0; i < cells.length; i++) {
        const v = parseNumber(cells.eq(i).text());
        if (v > 0 && v < 100_000) {
          preco = v;
          if (i + 1 < cells.length) variacao = parseNumber(cells.eq(i + 1).text());
          break;
        }
      }
    }

    if (preco <= 0) return null;
    return { preco, variacao, data };
  }

  // ── Public: Individual Commodity Quotes ───────────────────

  async getCotacaoSoja(): Promise<CotacaoCommodity> {
    return this.scrapeCEPEA('soja');
  }

  async getCotacaoMilho(): Promise<CotacaoCommodity> {
    return this.scrapeCEPEA('milho');
  }

  async getCotacaoBoi(): Promise<CotacaoCommodity> {
    return this.scrapeCEPEA('boi');
  }

  async getCotacaoCafe(): Promise<CotacaoCommodity> {
    return this.scrapeCEPEA('cafe');
  }

  async getCotacaoAlgodao(): Promise<CotacaoCommodity> {
    return this.scrapeCEPEA('algodao');
  }

  // ── Public: All Commodity Quotes ─────────────────────────

  async getAllCotacoes(): Promise<Record<string, CotacaoCommodity>> {
    const [soja, milho, boi, cafe, algodao] = await Promise.allSettled([
      this.getCotacaoSoja(),
      this.getCotacaoMilho(),
      this.getCotacaoBoi(),
      this.getCotacaoCafe(),
      this.getCotacaoAlgodao(),
    ]);

    const available: Record<string, CotacaoCommodity> = {};
    for (const [key, result] of Object.entries({ soja, milho, boi, cafe, algodao })) {
      if (result.status === 'fulfilled') available[key] = result.value;
    }
    if (!Object.keys(available).length) throw new Error('Cotações indisponíveis; nenhuma observação real preservada.');
    return available;
  }

  // ── Public: Historical Commodity Data ────────────────────

  async getHistoricoCommodity(
    commodity: string,
    dias: number = 30
  ): Promise<HistoricoCommodity> {
    const points = this.observations.get<CotacaoCommodity[]>(`precos_${commodity}_history`) || [];
    const last = points.at(-1);
    const cutoff = Date.now() - dias * 86400000;
    const comparable = points.filter(p => p.unidade === last?.unidade && p.descricao === last?.descricao && Date.parse(p.data) >= cutoff);
    return { commodity, unidade: last?.unidade || '', dados: comparable.map(p => ({ data: p.data, valor: p.preco })), fonte: comparable.length ? 'cache' : 'fallback' };
  }

  // ── Public: CONAB Crop Forecast ──────────────────────────

  async getPrevisaoSafra(): Promise<PrevisaoSafra> {
    const cacheKey = 'precos_safra_conab';
    const cached = this.cache.get<PrevisaoSafra>(cacheKey);
    if (cached) {
      console.log('[Preços] Previsão safra retornada do cache');
      return { ...cached, fonte: cached.fonte === 'fallback' ? 'fallback' : 'cache' };
    }

    const startTime = Date.now();
    try {
      console.log('[Preços] Buscando previsão de safra CONAB');
      // CONAB's API requires specific endpoints that may change
      // We attempt to fetch the latest crop survey data
      const response = await this.httpCONAB.get('/api/safras/graos', {
        timeout: 5000,
      });
      const latencia = Date.now() - startTime;

      if (!response.data) {
        throw new Error('Resposta vazia da CONAB');
      }


      // Parse CONAB response (structure varies)
      const data = response.data;
      const culturas: SafraCultura[] = [];

      const rows = Array.isArray(data.culturas) ? data.culturas : [];
      if (rows.length) {
        for (const item of rows) {
          culturas.push({
            cultura: item.cultura || item.produto || '',
            areaPlantada: parseFloat(item.area_plantada || item.area || '0'),
            producao: parseFloat(item.producao || '0'),
            produtividade: parseFloat(item.produtividade || '0'),
            variacaoProducao: parseFloat(item.variacao || '0'),
          });
        }
      }

      const observed = data.atualizadoEm || data.data;
      if (!culturas.length || !data.safra || !observed || !Number.isFinite(Date.parse(observed))) throw new Error('Safra sem observações e referência verificáveis');
      const result: PrevisaoSafra = {
        safra: data.safra,
        culturas,
        atualizadoEm: observed,
        fonte: 'api',
      };

      this.observations.set(cacheKey, result);
      this.manager.updateSourceStatus('conab_safra', 'online', latencia);
      this.cache.set(cacheKey, result, 86400);
      console.log(`[Preços] Safra CONAB OK em ${latencia}ms: ${result.culturas.length} culturas`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('conab_safra', 'offline', latencia, msg);
      console.warn(`[Preços] Erro CONAB: ${msg}. Usando fallback.`);

      const last = this.observations.get<PrevisaoSafra>(cacheKey);
      if (last) return { ...last, fonte: 'cache' };
      throw new Error('Safra indisponível; nenhuma observação real preservada.');
    }
  }
}

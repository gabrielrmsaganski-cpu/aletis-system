// ============================================================
// ALETIS — Exchange Rate Service (cascade)
// USD/EUR/CNY/GBP vs BRL with 4-source redundancy:
//   1. BCB OLINDA PTAX (official USD)   — primary for USD
//   2. Frankfurter (ECB)                — primary for others, history
//   3. open.er-api.com                  — secondary
//   4. AwesomeAPI                       — last resort (rate-limited)
// Falhas preservam a última observação real e sua data; sem dados, não há cotação.
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import { LastObservationStore } from './LastObservationStore.js';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface CotacaoCambio {
  moeda: string;
  nome: string;
  bid: number;
  ask: number | null;
  high: number | null;
  low: number | null;
  varBid: number | null;
  pctChange: number | null;
  timestamp: string;
  createDate: string;
  fonte: 'api' | 'cache' | 'fallback';
  estado?: 'disponivel' | 'atrasado';
  periodoVariacao?: '24h' | 'pregao_anterior' | null;
  provedor?: string; // 'BCB PTAX' | 'Frankfurter' | 'open.er-api' | 'AwesomeAPI' | 'fallback'
}

export interface HistoricoCambio {
  moeda: string;
  cotacoes: { data: string; valor: number; alta: number | null; baixa: number | null }[];
  fonte: 'api' | 'cache' | 'fallback';
  estado?: 'disponivel' | 'atrasado';
  periodoVariacao?: '24h' | 'pregao_anterior' | null;
  atualizadoEm: string;
  provedor?: string;
}

// ── Names & fallback ────────────────────────────────────────

const NOMES: Record<string, string> = {
  'USD-BRL': 'Dólar Americano',
  'EUR-BRL': 'Euro',
  'CNY-BRL': 'Yuan Chinês',
  'GBP-BRL': 'Libra Esterlina',
  'JPY-BRL': 'Iene Japonês',
  'ARS-BRL': 'Peso Argentino',
};

// ── Helpers ──────────────────────────────────────────────────

function formatMDY(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${d.getFullYear()}`;
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

function previousBusinessDay(ref = new Date()): Date {
  const d = new Date(ref);
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

// ── Service ──────────────────────────────────────────────────

export class AwesomeApiService {
  private readonly observations = new LastObservationStore('cambio');
  private http: AxiosInstance;
  private bcb: AxiosInstance;
  private frankfurter: AxiosInstance;
  private erApi: AxiosInstance;
  private cache: NodeCache;
  private dsm: DataSourceManager;

  constructor(dsm: DataSourceManager) {
    this.dsm = dsm;
    this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    const ua = { 'User-Agent': 'ALETIS/1.0 (+rural-credit)' };
    this.http = axios.create({ baseURL: 'https://economia.awesomeapi.com.br/', timeout: 6000, headers: ua });
    this.bcb = axios.create({ baseURL: 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/', timeout: 8000, headers: ua });
    this.frankfurter = axios.create({ baseURL: 'https://api.frankfurter.dev/v1/', timeout: 6000, headers: ua });
    this.erApi = axios.create({ baseURL: 'https://open.er-api.com/v6/', timeout: 6000, headers: ua });
  }

  // ── Current quotes (cascade) ──────────────────────────────

  async getCotacoesAtuais(pares: string[] = ['USD-BRL', 'EUR-BRL', 'CNY-BRL', 'GBP-BRL']): Promise<CotacaoCambio[]> {
    const cacheKey = `cambio_atual_${pares.join(',')}`;
    const cached = this.cache.get<CotacaoCambio[]>(cacheKey);
    if (cached) {
      return cached.map(c => ({ ...c, fonte: 'cache' as const, estado: c.estado === 'atrasado' || Date.now() - Date.parse(c.createDate) > 7 * 86400000 ? 'atrasado' : 'disponivel' }));
    }

    // Try in order: Frankfurter (one call gets all) → er-api → AwesomeAPI
    const providers = [
      () => this.fetchFromFrankfurter(pares),
      () => this.fetchFromErApi(pares),
      () => this.fetchFromAwesome(pares),
    ];

    for (const fn of providers) {
      try {
        const result = await fn();
        if (result.length === pares.length) {
          // For USD-BRL, overlay BCB PTAX (most authoritative) if available
          const usdIdx = result.findIndex(r => r.moeda === 'USD-BRL');
          if (usdIdx >= 0) {
            const ptax = await this.fetchUsdFromBcbPtax().catch(() => null);
            if (ptax) result[usdIdx] = ptax;
          }
          for (const quote of result) quote.estado = Date.now() - Date.parse(quote.createDate) > 7 * 86400000 ? 'atrasado' : 'disponivel';
          this.observations.set(cacheKey, result);
          this.cache.set(cacheKey, result);
          return result;
        }
      } catch {
        continue;
      }
    }

    this.dsm.updateSourceStatus('awesome_cambio', 'degraded', 0, 'Provedores indisponíveis');
    const last = this.observations.get<CotacaoCambio[]>(cacheKey);
    return last?.map(c => ({ ...c, fonte: 'cache', estado: 'atrasado' })) || [];
  }

  // ── Provider 1: BCB OLINDA PTAX (USD oficial) ─────────────

  private async fetchUsdFromBcbPtax(): Promise<CotacaoCambio | null> {
    const start = Date.now();
    // PTAX publishes per business day; try today, then previous 4 business days
    let ref = new Date();
    for (let i = 0; i < 5; i++) {
      const dataStr = formatMDY(ref);
      try {
        const resp = await this.bcb.get(
          `CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dataStr}'&$format=json`
        );
        const arr = resp.data?.value;
        if (Array.isArray(arr) && arr.length > 0) {
          const latest = arr[arr.length - 1];
          const bid = Number(latest.cotacaoCompra);
          const ask = Number(latest.cotacaoVenda);
          if (bid > 0 && ask > 0) {
            this.dsm.updateSourceStatus('bcb_dolar_ptax', 'online', Date.now() - start);
            return {
              moeda: 'USD-BRL',
              nome: 'Dólar Americano',
              bid,
              ask,
              high: null,
              low: null,
              varBid: null,
              pctChange: null,
              timestamp: String(Math.floor(new Date(latest.dataHoraCotacao).getTime() / 1000)),
              createDate: latest.dataHoraCotacao,
              fonte: 'api',
              provedor: 'BCB PTAX',
            };
          }
        }
      } catch { /* try previous day */ }
      ref = previousBusinessDay(ref);
    }
    return null;
  }

  // ── Provider 2: Frankfurter (ECB) — one call for all pairs

  private async fetchFromFrankfurter(pares: string[]): Promise<CotacaoCambio[]> {
    const start = Date.now();
    // Group by "base": USD-BRL → base=USD, symbol=BRL; but we can use any base.
    // Use BRL as the target: call base=USD symbols=BRL, base=EUR symbols=BRL, etc.
    const results: CotacaoCambio[] = [];
    const bases = Array.from(new Set(pares.map(p => p.split('-')[0])));
    const latestByBase: Record<string, { rate: number; date: string }> = {};
    const previousByBase: Record<string, number> = {};

    for (const base of bases) {
      const resp = await this.frankfurter.get(`latest?base=${base}&symbols=BRL`);
      const rate = resp.data?.rates?.BRL;
      const date = resp.data?.date;
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) throw new Error(`Frankfurter: no rate for ${base}`);
      if (!Number.isFinite(Date.parse(date))) throw new Error('Cotação sem data válida');
      latestByBase[base] = { rate, date };

      // Try to get previous day for pctChange
      try {
        const prevResp = await this.frankfurter.get(`${isoDate(previousBusinessDay(new Date(date)))}?base=${base}&symbols=BRL`);
        const prevRate = prevResp.data?.rates?.BRL;
        if (typeof prevRate === 'number' && prevRate > 0 && prevResp.data.date < date) previousByBase[base] = prevRate;
      } catch { /* best-effort */ }
    }

    for (const par of pares) {
      const base = par.split('-')[0];
      const entry = latestByBase[base];
      if (!entry) continue;
      const prev = previousByBase[base];
      const varBid = prev ? +(entry.rate - prev).toFixed(4) : null;
      const pctChange = prev ? +(((entry.rate - prev) / prev) * 100).toFixed(3) : null;
      results.push({
        moeda: par,
        nome: NOMES[par] || par,
        bid: +entry.rate.toFixed(4),
        ask: null,
        high: null,
        low: null,
        varBid,
        pctChange,
        periodoVariacao: 'pregao_anterior',
        timestamp: String(Math.floor(new Date(entry.date).getTime() / 1000)),
        createDate: `${entry.date} 00:00:00`,
        fonte: 'api',
        provedor: 'Frankfurter (ECB)',
      });
    }

    this.dsm.updateSourceStatus('awesome_cambio', 'online', Date.now() - start);
    return results;
  }

  // ── Provider 3: open.er-api.com ───────────────────────────

  private async fetchFromErApi(pares: string[]): Promise<CotacaoCambio[]> {
    const start = Date.now();
    const results: CotacaoCambio[] = [];
    const bases = Array.from(new Set(pares.map(p => p.split('-')[0])));

    for (const base of bases) {
      const resp = await this.erApi.get(`latest/${base}`);
      if (resp.data?.result !== 'success') throw new Error('er-api: not success');
      const rate = resp.data?.rates?.BRL;
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) throw new Error(`er-api: no BRL rate for ${base}`);
      const date = resp.data?.time_last_update_utc;
      if (!Number.isFinite(Date.parse(date))) throw new Error('Cotação sem data válida');

      for (const par of pares.filter(p => p.split('-')[0] === base)) {
        results.push({
          moeda: par,
          nome: NOMES[par] || par,
          bid: +rate.toFixed(4),
          ask: null,
          high: null,
          low: null,
          varBid: null,
          pctChange: null,
          timestamp: String(Math.floor(new Date(date).getTime() / 1000)),
          createDate: date,
          fonte: 'api',
          provedor: 'open.er-api',
        });
      }
    }

    this.dsm.updateSourceStatus('awesome_cambio', 'online', Date.now() - start);
    return results;
  }

  // ── Provider 4: AwesomeAPI (rate-limited) ─────────────────

  private async fetchFromAwesome(pares: string[]): Promise<CotacaoCambio[]> {
    const start = Date.now();
    const resp = await this.http.get(`json/last/${pares.join(',')}`);
    const data = resp.data;
    const cotacoes: CotacaoCambio[] = Object.values(data).map((item: any) => ({
      moeda: `${item.code}-${item.codein}`,
      nome: item.name,
      bid: parseFloat(item.bid),
      ask: parseFloat(item.ask),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      varBid: parseFloat(item.varBid),
      pctChange: parseFloat(item.pctChange),
      timestamp: item.timestamp,
      createDate: item.create_date,
      fonte: 'api',
      provedor: 'AwesomeAPI',
      periodoVariacao: '24h',
    }));
    if (cotacoes.length !== pares.length || cotacoes.some(c => !pares.includes(c.moeda) || !Number.isFinite(c.bid) || c.bid <= 0 || !Number.isFinite(Date.parse(c.createDate)))) throw new Error('Cotações inválidas');
    this.dsm.updateSourceStatus('awesome_cambio', 'online', Date.now() - start);
    return cotacoes;
  }

  // ── History (cascade) ─────────────────────────────────────

  async getHistoricoDiario(par: string = 'USD-BRL', dias: number = 30): Promise<HistoricoCambio> {
    if (!/^[A-Z]{3}-[A-Z]{3}$/.test(par) || !Number.isInteger(dias) || dias < 1 || dias > 365) throw new Error('Par ou período cambial inválido');
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - dias);
    const start = isoDate(startDate);
    const end = isoDate(endDate);
    // O endpoint diário pode devolver N pregões, não N dias corridos.
    // O recorte também se aplica ao cache quando a janela avança.
    const inPeriod = (points: HistoricoCambio['cotacoes']) => points.filter(point =>
      Number.isFinite(point.valor) && point.valor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(point.data) &&
      Number.isFinite(Date.parse(point.data)) && point.data >= start && point.data <= end,
    ).sort((a, b) => a.data.localeCompare(b.data));
    const cacheKey = `cambio_hist_${par}_${dias}`;
    const cached = this.cache.get<HistoricoCambio>(cacheKey);
    if (cached) return { ...cached, cotacoes: inPeriod(cached.cotacoes), fonte: 'cache' };

    const [base, quote] = par.split('-');

    // Try Frankfurter range endpoint (supports any currency combination)
    try {
      const resp = await this.frankfurter.get(
        `${isoDate(startDate)}..${isoDate(endDate)}?base=${base}&symbols=${quote}`
      );
      const rates = resp.data?.rates;
      if (rates && typeof rates === 'object') {
        const cotacoes = inPeriod(Object.entries(rates)
          .map(([data, obj]: [string, any]) => ({
            data,
            valor: Number(obj[quote]),
            alta: null,
            baixa: null,
          })));

        if (cotacoes.length > 0) {
          const result: HistoricoCambio = {
            moeda: par,
            cotacoes,
            fonte: 'api',
            estado: Date.now() - Date.parse(cotacoes.at(-1)!.data) > 7 * 86400000 ? 'atrasado' : 'disponivel',
            atualizadoEm: cotacoes.at(-1)!.data,
            provedor: 'Frankfurter (ECB)',
          };
          this.observations.set(cacheKey, result);
          this.cache.set(cacheKey, result, 3600);
          return result;
        }
      }
    } catch { /* fall through */ }

    // Fallback: AwesomeAPI daily
    try {
      const resp = await this.http.get(`json/daily/${par}/${dias}`);
      const items = resp.data;
      if (!Array.isArray(items) || items.length === 0) throw new Error('Histórico vazio');
      const cotacoes = inPeriod(items.map((item: any) => ({
        data: item.create_date?.split(' ')[0] || new Date(parseInt(item.timestamp) * 1000).toISOString().slice(0, 10),
        valor: parseFloat(item.bid),
        alta: parseFloat(item.high),
        baixa: parseFloat(item.low),
      })));
      if (!cotacoes.length) throw new Error('Histórico sem observações válidas');
      const result: HistoricoCambio = {
        moeda: par,
        cotacoes,
        fonte: 'api',
        estado: Date.now() - Date.parse(cotacoes.at(-1)!.data) > 7 * 86400000 ? 'atrasado' : 'disponivel',
        atualizadoEm: cotacoes.at(-1)!.data,
        provedor: 'AwesomeAPI',
      };
      this.observations.set(cacheKey, result);
      this.cache.set(cacheKey, result, 3600);
      return result;
    } catch { /* fall through */ }

    const last = this.observations.get<HistoricoCambio>(cacheKey);
    return last ? { ...last, cotacoes: inPeriod(last.cotacoes), fonte: 'cache', estado: 'atrasado' } : { moeda: par, cotacoes: [], fonte: 'fallback', atualizadoEm: '', provedor: 'indisponível' };
  }
}

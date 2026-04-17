// ============================================================
// ALETIS — Exchange Rate Service (cascade)
// USD/EUR/CNY/GBP vs BRL with 4-source redundancy:
//   1. BCB OLINDA PTAX (official USD)   — primary for USD
//   2. Frankfurter (ECB)                — primary for others, history
//   3. open.er-api.com                  — secondary
//   4. AwesomeAPI                       — last resort (rate-limited)
// Never fails: hardcoded fallback keeps the UI alive.
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface CotacaoCambio {
  moeda: string;
  nome: string;
  bid: number;
  ask: number;
  high: number;
  low: number;
  varBid: number;
  pctChange: number;
  timestamp: string;
  createDate: string;
  fonte: 'api' | 'cache' | 'fallback';
  provedor?: string; // 'BCB PTAX' | 'Frankfurter' | 'open.er-api' | 'AwesomeAPI' | 'fallback'
}

export interface HistoricoCambio {
  moeda: string;
  cotacoes: { data: string; valor: number; alta: number; baixa: number }[];
  fonte: 'api' | 'cache' | 'fallback';
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

const FALLBACK_RATES: Record<string, Omit<CotacaoCambio, 'fonte' | 'provedor'>> = {
  'USD-BRL': { moeda: 'USD-BRL', nome: 'Dólar Americano', bid: 5.00, ask: 5.01, high: 5.05, low: 4.95, varBid: -0.02, pctChange: -0.4, timestamp: '', createDate: '' },
  'EUR-BRL': { moeda: 'EUR-BRL', nome: 'Euro', bid: 5.70, ask: 5.71, high: 5.75, low: 5.65, varBid: 0.01, pctChange: 0.2, timestamp: '', createDate: '' },
  'CNY-BRL': { moeda: 'CNY-BRL', nome: 'Yuan Chinês', bid: 0.69, ask: 0.70, high: 0.71, low: 0.68, varBid: 0.0, pctChange: 0.0, timestamp: '', createDate: '' },
  'GBP-BRL': { moeda: 'GBP-BRL', nome: 'Libra Esterlina', bid: 6.35, ask: 6.36, high: 6.40, low: 6.30, varBid: 0.02, pctChange: 0.3, timestamp: '', createDate: '' },
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
      this.dsm.updateSourceStatus('awesome_cambio', 'online', 0);
      return cached.map(c => ({ ...c, fonte: 'cache' as const }));
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
          this.cache.set(cacheKey, result);
          return result;
        }
      } catch {
        continue;
      }
    }

    // Last resort: fallback
    this.dsm.updateSourceStatus('awesome_cambio', 'degraded', 0, 'all providers exhausted');
    return pares.map(par => {
      const fb = FALLBACK_RATES[par] || { ...FALLBACK_RATES['USD-BRL'], moeda: par, nome: NOMES[par] || par };
      return { ...fb, fonte: 'fallback' as const, provedor: 'fallback' };
    });
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
              high: Math.max(bid, ask),
              low: Math.min(bid, ask),
              varBid: 0,
              pctChange: 0,
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
      if (typeof rate !== 'number') throw new Error(`Frankfurter: no rate for ${base}`);
      latestByBase[base] = { rate, date };

      // Try to get previous day for pctChange
      try {
        const prevResp = await this.frankfurter.get(`${isoDate(previousBusinessDay(new Date(date)))}?base=${base}&symbols=BRL`);
        const prevRate = prevResp.data?.rates?.BRL;
        if (typeof prevRate === 'number') previousByBase[base] = prevRate;
      } catch { /* best-effort */ }
    }

    for (const par of pares) {
      const base = par.split('-')[0];
      const entry = latestByBase[base];
      if (!entry) continue;
      const prev = previousByBase[base];
      const varBid = prev ? +(entry.rate - prev).toFixed(4) : 0;
      const pctChange = prev ? +(((entry.rate - prev) / prev) * 100).toFixed(3) : 0;
      results.push({
        moeda: par,
        nome: NOMES[par] || par,
        bid: +entry.rate.toFixed(4),
        ask: +(entry.rate * 1.001).toFixed(4),
        high: +entry.rate.toFixed(4),
        low: +entry.rate.toFixed(4),
        varBid,
        pctChange,
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
      if (typeof rate !== 'number') throw new Error(`er-api: no BRL rate for ${base}`);
      const date = resp.data?.time_last_update_utc;

      for (const par of pares.filter(p => p.split('-')[0] === base)) {
        results.push({
          moeda: par,
          nome: NOMES[par] || par,
          bid: +rate.toFixed(4),
          ask: +(rate * 1.001).toFixed(4),
          high: +rate.toFixed(4),
          low: +rate.toFixed(4),
          varBid: 0,
          pctChange: 0,
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
    }));
    this.dsm.updateSourceStatus('awesome_cambio', 'online', Date.now() - start);
    return cotacoes;
  }

  // ── History (cascade) ─────────────────────────────────────

  async getHistoricoDiario(par: string = 'USD-BRL', dias: number = 30): Promise<HistoricoCambio> {
    const cacheKey = `cambio_hist_${par}_${dias}`;
    const cached = this.cache.get<HistoricoCambio>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const [base, quote] = par.split('-');

    // Try Frankfurter range endpoint (supports any currency combination)
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dias);
      const resp = await this.frankfurter.get(
        `${isoDate(startDate)}..${isoDate(endDate)}?base=${base}&symbols=${quote}`
      );
      const rates = resp.data?.rates;
      if (rates && typeof rates === 'object') {
        const cotacoes = Object.entries(rates)
          .map(([data, obj]: [string, any]) => ({
            data,
            valor: Number(obj[quote]),
            alta: Number(obj[quote]),
            baixa: Number(obj[quote]),
          }))
          .filter(c => c.valor > 0)
          .sort((a, b) => a.data.localeCompare(b.data));

        if (cotacoes.length > 0) {
          const result: HistoricoCambio = {
            moeda: par,
            cotacoes,
            fonte: 'api',
            atualizadoEm: new Date().toISOString(),
            provedor: 'Frankfurter (ECB)',
          };
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
      const cotacoes = items.map((item: any) => ({
        data: item.create_date?.split(' ')[0] || new Date(parseInt(item.timestamp) * 1000).toISOString().slice(0, 10),
        valor: parseFloat(item.bid),
        alta: parseFloat(item.high),
        baixa: parseFloat(item.low),
      })).reverse();
      const result: HistoricoCambio = {
        moeda: par,
        cotacoes,
        fonte: 'api',
        atualizadoEm: new Date().toISOString(),
        provedor: 'AwesomeAPI',
      };
      this.cache.set(cacheKey, result, 3600);
      return result;
    } catch { /* fall through */ }

    // Synthetic fallback
    const cotacoes = [];
    const basePrice = FALLBACK_RATES[par]?.bid || 5.0;
    for (let i = dias; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const variation = (Math.random() - 0.5) * 0.1;
      const val = basePrice + variation;
      cotacoes.push({
        data: isoDate(d),
        valor: Math.round(val * 10000) / 10000,
        alta: Math.round((val + 0.03) * 10000) / 10000,
        baixa: Math.round((val - 0.03) * 10000) / 10000,
      });
    }
    return {
      moeda: par,
      cotacoes,
      fonte: 'fallback',
      atualizadoEm: new Date().toISOString(),
      provedor: 'fallback',
    };
  }
}

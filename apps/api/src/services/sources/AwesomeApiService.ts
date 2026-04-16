// ============================================================
// ALETIS — AwesomeAPI Exchange Rate Service
// Real-time USD/BRL, EUR/BRL, CNY/BRL with history
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
}

export interface HistoricoCambio {
  moeda: string;
  cotacoes: { data: string; valor: number; alta: number; baixa: number }[];
  fonte: 'api' | 'cache' | 'fallback';
  atualizadoEm: string;
}

// ── Fallback ────────────────────────────────────────────────

const FALLBACK_RATES: Record<string, Omit<CotacaoCambio, 'fonte'>> = {
  'USD-BRL': { moeda: 'USD-BRL', nome: 'Dolar Americano', bid: 5.00, ask: 5.01, high: 5.05, low: 4.95, varBid: -0.02, pctChange: -0.4, timestamp: '', createDate: '' },
  'EUR-BRL': { moeda: 'EUR-BRL', nome: 'Euro', bid: 5.70, ask: 5.71, high: 5.75, low: 5.65, varBid: 0.01, pctChange: 0.2, timestamp: '', createDate: '' },
  'CNY-BRL': { moeda: 'CNY-BRL', nome: 'Yuan Chines', bid: 0.69, ask: 0.70, high: 0.71, low: 0.68, varBid: 0.0, pctChange: 0.0, timestamp: '', createDate: '' },
  'GBP-BRL': { moeda: 'GBP-BRL', nome: 'Libra Esterlina', bid: 6.35, ask: 6.36, high: 6.40, low: 6.30, varBid: 0.02, pctChange: 0.3, timestamp: '', createDate: '' },
};

// ── Service Class ───────────────────────────────────────────

export class AwesomeApiService {
  private http: AxiosInstance;
  private cache: NodeCache;
  private dsm: DataSourceManager;

  constructor(dsm: DataSourceManager) {
    this.dsm = dsm;
    this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    this.http = axios.create({
      baseURL: 'https://economia.awesomeapi.com.br/',
      timeout: 8000,
    });
  }

  async getCotacoesAtuais(pares: string[] = ['USD-BRL', 'EUR-BRL', 'CNY-BRL', 'GBP-BRL']): Promise<CotacaoCambio[]> {
    const cacheKey = `awesome_cotacoes_${pares.join(',')}`;
    const cached = this.cache.get<CotacaoCambio[]>(cacheKey);
    if (cached) {
      this.dsm.updateSourceStatus('awesome_cambio', 'online', 0);
      return cached.map(c => ({ ...c, fonte: 'cache' as const }));
    }

    const start = Date.now();
    try {
      const response = await this.http.get(`json/last/${pares.join(',')}`);
      const data = response.data;

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
        fonte: 'api' as const,
      }));

      this.cache.set(cacheKey, cotacoes);
      this.dsm.updateSourceStatus('awesome_cambio', 'online', Date.now() - start);
      return cotacoes;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[AwesomeAPI] Cotacoes falhou: ${msg}`);
      this.dsm.updateSourceStatus('awesome_cambio', 'degraded', Date.now() - start, msg);

      return pares.map(par => {
        const fb = FALLBACK_RATES[par] || FALLBACK_RATES['USD-BRL'];
        return { ...fb, moeda: par, fonte: 'fallback' as const };
      });
    }
  }

  async getHistoricoDiario(par: string = 'USD-BRL', dias: number = 30): Promise<HistoricoCambio> {
    const cacheKey = `awesome_historico_${par}_${dias}`;
    const cached = this.cache.get<HistoricoCambio>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const start = Date.now();
    try {
      const response = await this.http.get(`json/daily/${par}/${dias}`);
      const items = response.data;

      if (!Array.isArray(items) || items.length === 0) throw new Error('Historico vazio');

      const cotacoes = items.map((item: any) => ({
        data: item.create_date?.split(' ')[0] || new Date(parseInt(item.timestamp) * 1000).toISOString().slice(0, 10),
        valor: parseFloat(item.bid),
        alta: parseFloat(item.high),
        baixa: parseFloat(item.low),
      }));

      const result: HistoricoCambio = {
        moeda: par,
        cotacoes,
        fonte: 'api',
        atualizadoEm: new Date().toISOString(),
      };

      this.cache.set(cacheKey, result, 3600);
      this.dsm.updateSourceStatus('awesome_cambio', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[AwesomeAPI] Historico falhou: ${msg}`);

      // Generate synthetic history
      const cotacoes = [];
      const basePrice = FALLBACK_RATES[par]?.bid || 5.0;
      for (let i = dias; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const variation = (Math.random() - 0.5) * 0.1;
        const val = basePrice + variation;
        cotacoes.push({
          data: d.toISOString().slice(0, 10),
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
      };
    }
  }
}

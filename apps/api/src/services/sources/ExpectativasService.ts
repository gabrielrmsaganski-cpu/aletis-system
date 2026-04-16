// ============================================================
// ALETIS — BCB Expectativas Service (Boletim Focus)
// Market consensus forecasts from 100+ financial institutions
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface ExpectativaAnual {
  indicador: string;
  data: string;
  dataReferencia: string;
  media: number;
  mediana: number;
  desvioPadrao: number;
  minimo: number;
  maximo: number;
  numeroRespondentes: number;
  baseCalculo: number;
}

export interface ExpectativasMercado {
  indicador: string;
  expectativas: ExpectativaAnual[];
  fonte: 'api' | 'cache' | 'fallback';
  atualizadoEm: string;
}

// ── Fallback Data ───────────────────────────────────────────

const FALLBACK: Record<string, ExpectativaAnual[]> = {
  Selic: [
    { indicador: 'Selic', data: '2026-04-11', dataReferencia: '2026', media: 14.75, mediana: 14.75, desvioPadrao: 0.5, minimo: 13.5, maximo: 16.0, numeroRespondentes: 120, baseCalculo: 0 },
    { indicador: 'Selic', data: '2026-04-11', dataReferencia: '2027', media: 12.50, mediana: 12.50, desvioPadrao: 0.8, minimo: 10.5, maximo: 14.5, numeroRespondentes: 115, baseCalculo: 0 },
  ],
  IPCA: [
    { indicador: 'IPCA', data: '2026-04-11', dataReferencia: '2026', media: 5.65, mediana: 5.60, desvioPadrao: 0.4, minimo: 4.5, maximo: 7.0, numeroRespondentes: 130, baseCalculo: 0 },
    { indicador: 'IPCA', data: '2026-04-11', dataReferencia: '2027', media: 4.50, mediana: 4.50, desvioPadrao: 0.6, minimo: 3.2, maximo: 6.0, numeroRespondentes: 125, baseCalculo: 0 },
  ],
  'Câmbio': [
    { indicador: 'Câmbio', data: '2026-04-11', dataReferencia: '2026', media: 5.40, mediana: 5.37, desvioPadrao: 0.3, minimo: 4.80, maximo: 6.20, numeroRespondentes: 110, baseCalculo: 0 },
    { indicador: 'Câmbio', data: '2026-04-11', dataReferencia: '2027', media: 5.50, mediana: 5.48, desvioPadrao: 0.4, minimo: 4.90, maximo: 6.50, numeroRespondentes: 105, baseCalculo: 0 },
  ],
  'IGP-M': [
    { indicador: 'IGP-M', data: '2026-04-11', dataReferencia: '2026', media: 5.20, mediana: 5.15, desvioPadrao: 0.5, minimo: 3.8, maximo: 7.0, numeroRespondentes: 90, baseCalculo: 0 },
  ],
  'PIB Total': [
    { indicador: 'PIB Total', data: '2026-04-11', dataReferencia: '2026', media: 2.10, mediana: 2.06, desvioPadrao: 0.3, minimo: 1.2, maximo: 3.0, numeroRespondentes: 100, baseCalculo: 0 },
  ],
};

// ── Service Class ───────────────────────────────────────────

export class ExpectativasService {
  private http: AxiosInstance;
  private cache: NodeCache;
  private dsm: DataSourceManager;

  constructor(dsm: DataSourceManager) {
    this.dsm = dsm;
    this.cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
    this.http = axios.create({
      baseURL: 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/',
      timeout: 10000,
      headers: { 'Accept': 'application/json' },
    });
  }

  async getExpectativasAnuais(indicador: string, top: number = 10): Promise<ExpectativasMercado> {
    const cacheKey = `expectativas_anuais_${indicador}`;
    const cached = this.cache.get<ExpectativasMercado>(cacheKey);
    if (cached) {
      this.dsm.updateSourceStatus('bcb_expectativas', 'online', 0);
      return { ...cached, fonte: 'cache' };
    }

    const start = Date.now();
    try {
      const url = `ExpectativasMercadoAnuais?$top=${top}&$format=json&$filter=Indicador%20eq%20'${encodeURIComponent(indicador)}'&$orderby=Data%20desc`;
      const response = await this.http.get(url);
      const items = response.data?.value || [];

      if (items.length === 0) throw new Error('Nenhuma expectativa retornada');

      const expectativas: ExpectativaAnual[] = items.map((item: any) => ({
        indicador: item.Indicador,
        data: item.Data,
        dataReferencia: item.DataReferencia,
        media: item.Media,
        mediana: item.Mediana,
        desvioPadrao: item.DesvioPadrao,
        minimo: item.Minimo,
        maximo: item.Maximo,
        numeroRespondentes: item.numeroRespondentes ?? 0,
        baseCalculo: item.baseCalculo ?? 0,
      }));

      const result: ExpectativasMercado = {
        indicador,
        expectativas,
        fonte: 'api',
        atualizadoEm: new Date().toISOString(),
      };

      this.cache.set(cacheKey, result);
      this.dsm.updateSourceStatus('bcb_expectativas', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[Expectativas] Falha ${indicador}: ${msg}`);
      this.dsm.updateSourceStatus('bcb_expectativas', 'degraded', Date.now() - start, msg);

      const fallback = FALLBACK[indicador] || FALLBACK['Selic'];
      return {
        indicador,
        expectativas: fallback,
        fonte: 'fallback',
        atualizadoEm: new Date().toISOString(),
      };
    }
  }

  async getAllExpectativas(): Promise<Record<string, ExpectativasMercado>> {
    const indicadores = ['Selic', 'IPCA', 'Câmbio', 'IGP-M', 'PIB Total'];
    const results: Record<string, ExpectativasMercado> = {};

    const promises = indicadores.map(async (ind) => {
      results[ind] = await this.getExpectativasAnuais(ind, 6);
    });

    await Promise.allSettled(promises);
    return results;
  }
}

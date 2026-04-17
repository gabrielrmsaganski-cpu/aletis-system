// ============================================================
// ALETIS — ComexStat Service (MDIC / Siscomex)
// Brazilian foreign trade statistics — exports by NCM / country / month
// https://api-comexstat.mdic.gov.br/general
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface ExportacaoItem {
  ano: string;
  mes: string;
  ncm?: string;
  produto: string;
  valorUSD: number;
  pesoKg: number;
}

export interface ExportacaoAgregado {
  periodo: string;
  totalUSD: number;
  totalToneladas: number;
  precoMedioUSDporTon: number;
  porProduto: { produto: string; valorUSD: number; toneladas: number; participacao: number }[];
  porDestino: { pais: string; valorUSD: number; participacao: number }[];
  serieMensal: { mes: string; valorUSD: number; toneladas: number }[];
  fonte: 'api' | 'cache' | 'fallback';
  atualizadoEm: string;
}

// ── NCM codes for key agro commodities ──────────────────────
// NCM chapters: 1201=soja, 1005=milho, 0901=cafe, 0201-0202=bovina, 1701=acucar, 5201-5203=algodao

const NCM_AGRO = {
  soja: ['1201'],
  milho: ['1005'],
  cafe: ['0901'],
  carne_bovina: ['0201', '0202'],
  carne_frango: ['0207'],
  acucar: ['1701'],
  algodao: ['5201', '5203'],
  celulose: ['4703'],
  soja_farelo: ['2304'],
  soja_oleo: ['1507'],
} as const;

// ── Fallback (CY 2025 estimates — MDIC/SECEX data) ──────────

const FALLBACK_AGREGADO: Omit<ExportacaoAgregado, 'fonte' | 'atualizadoEm'> = {
  periodo: 'ultimos 12 meses',
  totalUSD: 165_000_000_000, // Agro exports CY2025 est.
  totalToneladas: 320_000_000,
  precoMedioUSDporTon: 515.6,
  porProduto: [
    { produto: 'Soja em grao', valorUSD: 52_000_000_000, toneladas: 105_000_000, participacao: 31.5 },
    { produto: 'Carne bovina', valorUSD: 14_500_000_000, toneladas: 2_600_000, participacao: 8.8 },
    { produto: 'Farelo de soja', valorUSD: 12_800_000_000, toneladas: 22_500_000, participacao: 7.8 },
    { produto: 'Milho', valorUSD: 11_200_000_000, toneladas: 42_000_000, participacao: 6.8 },
    { produto: 'Cafe verde', valorUSD: 12_100_000_000, toneladas: 2_150_000, participacao: 7.3 },
    { produto: 'Acucar', valorUSD: 15_600_000_000, toneladas: 30_800_000, participacao: 9.5 },
    { produto: 'Algodao', valorUSD: 4_800_000_000, toneladas: 2_350_000, participacao: 2.9 },
    { produto: 'Celulose', valorUSD: 9_300_000_000, toneladas: 18_200_000, participacao: 5.6 },
    { produto: 'Carne frango', valorUSD: 9_800_000_000, toneladas: 5_100_000, participacao: 5.9 },
    { produto: 'Oleo de soja', valorUSD: 2_900_000_000, toneladas: 2_600_000, participacao: 1.8 },
    { produto: 'Outros', valorUSD: 20_000_000_000, toneladas: 86_700_000, participacao: 12.1 },
  ],
  porDestino: [
    { pais: 'China', valorUSD: 57_000_000_000, participacao: 34.5 },
    { pais: 'Estados Unidos', valorUSD: 13_800_000_000, participacao: 8.4 },
    { pais: 'Uniao Europeia', valorUSD: 22_500_000_000, participacao: 13.6 },
    { pais: 'Argentina', valorUSD: 4_100_000_000, participacao: 2.5 },
    { pais: 'Japao', valorUSD: 3_900_000_000, participacao: 2.4 },
    { pais: 'Coreia do Sul', valorUSD: 3_400_000_000, participacao: 2.1 },
    { pais: 'Iran', valorUSD: 3_200_000_000, participacao: 1.9 },
    { pais: 'Vietna', valorUSD: 2_800_000_000, participacao: 1.7 },
    { pais: 'Egito', valorUSD: 2_500_000_000, participacao: 1.5 },
    { pais: 'Outros', valorUSD: 51_800_000_000, participacao: 31.4 },
  ],
  serieMensal: (() => {
    const arr: { mes: string; valorUSD: number; toneladas: number }[] = [];
    const now = new Date();
    const base = 13_750_000_000; // ~165B/12
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      // Soja peaks Mar-Jul, acucar peaks Aug-Oct
      const season = 1 + 0.22 * Math.sin(((d.getMonth() - 2) / 12) * 2 * Math.PI);
      arr.push({
        mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        valorUSD: Math.round(base * season),
        toneladas: Math.round(26_666_000 * season),
      });
    }
    return arr;
  })(),
};

// ── Service Class ───────────────────────────────────────────

export class ComexStatService {
  private http: AxiosInstance;
  private cache: NodeCache;
  private dsm: DataSourceManager;

  constructor(dsm: DataSourceManager) {
    this.dsm = dsm;
    // 6h cache — MDIC publishes monthly
    this.cache = new NodeCache({ stdTTL: 21600, checkperiod: 3600 });
    this.http = axios.create({
      baseURL: 'https://api-comexstat.mdic.gov.br',
      timeout: 20000,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  }

  /**
   * Fetch aggregated agricultural exports for the last N months.
   * Uses ComexStat POST /general endpoint with NCM filters.
   */
  async getExportacoesAgro(meses: number = 12): Promise<ExportacaoAgregado> {
    const cacheKey = `comexstat_agro_${meses}`;
    const cached = this.cache.get<ExportacaoAgregado>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const start = Date.now();
    const hoje = new Date();
    const fim = new Date(hoje);
    // MDIC publishes with 1-2 month lag
    fim.setMonth(fim.getMonth() - 1);
    const inicio = new Date(fim);
    inicio.setMonth(inicio.getMonth() - meses + 1);

    const todosNcm = Object.values(NCM_AGRO).flat();

    try {
      const payload = {
        flow: 'export',
        monthDetail: true,
        period: {
          from: `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`,
          to: `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}`,
        },
        filters: [{ filter: 'ncm', values: todosNcm }],
        details: ['ncm', 'country'],
        metrics: ['metricFOB', 'metricKG'],
      };

      const response = await this.http.post('/general', payload);
      const items = response.data?.data?.list || [];

      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('ComexStat retornou conjunto vazio');
      }

      const agregado = this.agregarExportacoes(items, `${meses} meses`);
      this.cache.set(cacheKey, agregado);
      this.dsm.updateSourceStatus('comexstat_exportacao', 'online', Date.now() - start);
      return { ...agregado, fonte: 'api' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[ComexStat] Exportacoes agro falhou: ${msg}`);
      this.dsm.updateSourceStatus('comexstat_exportacao', 'degraded', Date.now() - start, msg);
      return {
        ...FALLBACK_AGREGADO,
        fonte: 'fallback',
        atualizadoEm: new Date().toISOString(),
      };
    }
  }

  /**
   * Monthly export time series for a specific commodity family.
   */
  async getSerieMensalProduto(
    produto: keyof typeof NCM_AGRO,
    meses: number = 24
  ): Promise<{ serie: { mes: string; valorUSD: number; toneladas: number }[]; produto: string; fonte: 'api' | 'cache' | 'fallback'; atualizadoEm: string }> {
    const cacheKey = `comexstat_serie_${produto}_${meses}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const start = Date.now();
    const hoje = new Date();
    const fim = new Date(hoje);
    fim.setMonth(fim.getMonth() - 1);
    const inicio = new Date(fim);
    inicio.setMonth(inicio.getMonth() - meses + 1);

    try {
      const payload = {
        flow: 'export',
        monthDetail: true,
        period: {
          from: `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`,
          to: `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}`,
        },
        filters: [{ filter: 'ncm', values: [...NCM_AGRO[produto]] }],
        details: ['month'],
        metrics: ['metricFOB', 'metricKG'],
      };

      const response = await this.http.post('/general', payload);
      const items = response.data?.data?.list || [];
      if (!Array.isArray(items) || items.length === 0) throw new Error('Vazio');

      const serie = items
        .map((it: any) => ({
          mes: `${it.coAno || it.year}-${String(it.coMes || it.month).padStart(2, '0')}`,
          valorUSD: parseFloat(it.metricFOB || it.vlFob || 0),
          toneladas: parseFloat(it.metricKG || it.kgLiquido || 0) / 1000,
        }))
        .sort((a: any, b: any) => a.mes.localeCompare(b.mes));

      const result = { serie, produto: String(produto), fonte: 'api' as const, atualizadoEm: new Date().toISOString() };
      this.cache.set(cacheKey, result);
      this.dsm.updateSourceStatus('comexstat_exportacao', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[ComexStat] Serie ${produto} falhou: ${msg}`);

      // Synthesize plausible monthly series
      const fallbackProd = FALLBACK_AGREGADO.porProduto.find((p) =>
        p.produto.toLowerCase().includes(String(produto).split('_')[0].toLowerCase())
      );
      const baseValor = (fallbackProd?.valorUSD || 10_000_000_000) / 12;
      const baseTon = (fallbackProd?.toneladas || 10_000_000) / 12;
      const now = new Date();
      const serie: { mes: string; valorUSD: number; toneladas: number }[] = [];
      for (let i = meses - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i - 1);
        const season = 1 + 0.25 * Math.sin(((d.getMonth() - 2) / 12) * 2 * Math.PI);
        serie.push({
          mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          valorUSD: Math.round(baseValor * season),
          toneladas: Math.round(baseTon * season),
        });
      }
      return { serie, produto: String(produto), fonte: 'fallback', atualizadoEm: new Date().toISOString() };
    }
  }

  private agregarExportacoes(items: any[], periodo: string): ExportacaoAgregado {
    let totalUSD = 0;
    let totalKg = 0;
    const porNcm = new Map<string, { valorUSD: number; kg: number }>();
    const porPais = new Map<string, number>();
    const porMes = new Map<string, { valorUSD: number; kg: number }>();

    for (const it of items) {
      const fob = parseFloat(it.metricFOB || it.vlFob || 0);
      const kg = parseFloat(it.metricKG || it.kgLiquido || 0);
      totalUSD += fob;
      totalKg += kg;

      const ncm = String(it.coNcm || it.ncm || '').slice(0, 4);
      const ncmCur = porNcm.get(ncm) || { valorUSD: 0, kg: 0 };
      porNcm.set(ncm, { valorUSD: ncmCur.valorUSD + fob, kg: ncmCur.kg + kg });

      const pais = String(it.noPaisIng || it.country || it.noPais || 'Outros');
      porPais.set(pais, (porPais.get(pais) || 0) + fob);

      if (it.coAno && it.coMes) {
        const mes = `${it.coAno}-${String(it.coMes).padStart(2, '0')}`;
        const mCur = porMes.get(mes) || { valorUSD: 0, kg: 0 };
        porMes.set(mes, { valorUSD: mCur.valorUSD + fob, kg: mCur.kg + kg });
      }
    }

    const NCM_LABEL: Record<string, string> = {
      '1201': 'Soja em grão',
      '1005': 'Milho',
      '0901': 'Café verde',
      '0201': 'Carne bovina (fresca)',
      '0202': 'Carne bovina (congelada)',
      '0207': 'Carne frango',
      '1701': 'Açúcar',
      '5201': 'Algodão não cardado',
      '5203': 'Algodão cardado',
      '4703': 'Celulose',
      '2304': 'Farelo de soja',
      '1507': 'Óleo de soja',
    };

    const porProduto = [...porNcm.entries()]
      .map(([ncm, v]) => ({
        produto: NCM_LABEL[ncm] || `NCM ${ncm}`,
        valorUSD: v.valorUSD,
        toneladas: v.kg / 1000,
        participacao: Math.round((v.valorUSD / (totalUSD || 1)) * 1000) / 10,
      }))
      .sort((a, b) => b.valorUSD - a.valorUSD);

    const porDestino = [...porPais.entries()]
      .map(([pais, valorUSD]) => ({
        pais,
        valorUSD,
        participacao: Math.round((valorUSD / (totalUSD || 1)) * 1000) / 10,
      }))
      .sort((a, b) => b.valorUSD - a.valorUSD)
      .slice(0, 10);

    const serieMensal = [...porMes.entries()]
      .map(([mes, v]) => ({ mes, valorUSD: v.valorUSD, toneladas: v.kg / 1000 }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    return {
      periodo,
      totalUSD,
      totalToneladas: totalKg / 1000,
      precoMedioUSDporTon: totalUSD / ((totalKg / 1000) || 1),
      porProduto,
      porDestino,
      serieMensal,
      fonte: 'api',
      atualizadoEm: new Date().toISOString(),
    };
  }
}

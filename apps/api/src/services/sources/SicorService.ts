// ============================================================
// ALETIS — BCB SICOR Service
// Sistema de Operacoes do Credito Rural (OData)
// Granular rural credit data — contracts, volumes, crops, states
// https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface SicorContrato {
  anoMes: string;
  uf: string;
  produto: string;
  finalidade: string;
  fonteRecurso: string;
  qtdContratos: number;
  valorTotal: number;
  areaFinanciada: number;
  modalidade: string;
}

export interface SicorAgregado {
  periodo: string;
  totalContratos: number;
  valorTotal: number;
  valorMedio: number;
  areaTotal: number;
  topProdutos: { produto: string; valor: number; participacao: number }[];
  topUFs: { uf: string; valor: number; contratos: number }[];
  porFinalidade: { finalidade: string; valor: number; participacao: number }[];
  fonte: 'api' | 'cache' | 'fallback';
  atualizadoEm: string;
}

// ── Fallback (CY 2025 estimates — directional only) ─────────

const FALLBACK_AGREGADO: Omit<SicorAgregado, 'fonte' | 'atualizadoEm'> = {
  periodo: 'ultimos 12 meses',
  totalContratos: 2_845_000,
  valorTotal: 460_000_000_000,
  valorMedio: 161_722,
  areaTotal: 85_000_000,
  topProdutos: [
    { produto: 'Soja', valor: 145_000_000_000, participacao: 31.5 },
    { produto: 'Milho', valor: 92_000_000_000, participacao: 20.0 },
    { produto: 'Cana-de-acucar', valor: 54_000_000_000, participacao: 11.7 },
    { produto: 'Cafe', valor: 38_000_000_000, participacao: 8.3 },
    { produto: 'Bovinocultura', valor: 62_000_000_000, participacao: 13.5 },
    { produto: 'Algodao', valor: 18_000_000_000, participacao: 3.9 },
    { produto: 'Outros', valor: 51_000_000_000, participacao: 11.1 },
  ],
  topUFs: [
    { uf: 'MT', valor: 92_000_000_000, contratos: 186_000 },
    { uf: 'PR', valor: 68_000_000_000, contratos: 310_000 },
    { uf: 'RS', valor: 61_000_000_000, contratos: 290_000 },
    { uf: 'SP', valor: 54_000_000_000, contratos: 225_000 },
    { uf: 'GO', valor: 48_000_000_000, contratos: 165_000 },
    { uf: 'MS', valor: 38_000_000_000, contratos: 145_000 },
    { uf: 'MG', valor: 35_000_000_000, contratos: 280_000 },
  ],
  porFinalidade: [
    { finalidade: 'Custeio', valor: 245_000_000_000, participacao: 53.3 },
    { finalidade: 'Investimento', valor: 112_000_000_000, participacao: 24.3 },
    { finalidade: 'Comercializacao', valor: 68_000_000_000, participacao: 14.8 },
    { finalidade: 'Industrializacao', valor: 35_000_000_000, participacao: 7.6 },
  ],
};

// ── Service Class ───────────────────────────────────────────

export class SicorService {
  private http: AxiosInstance;
  private cache: NodeCache;
  private dsm: DataSourceManager;

  constructor(dsm: DataSourceManager) {
    this.dsm = dsm;
    // Long TTL — SICOR updates monthly
    this.cache = new NodeCache({ stdTTL: 21600, checkperiod: 3600 });
    this.http = axios.create({
      baseURL: 'https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/',
      timeout: 15000,
      headers: { Accept: 'application/json' },
    });
  }

  /**
   * Fetch aggregated rural credit data for the last N months.
   * Uses SICOR OData endpoint with $apply group/aggregate query.
   */
  async getAgregado(mesesAtras: number = 12): Promise<SicorAgregado> {
    const cacheKey = `sicor_agregado_${mesesAtras}`;
    const cached = this.cache.get<SicorAgregado>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const start = Date.now();
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setMonth(inicio.getMonth() - mesesAtras);
    const anoMesInicio = `${inicio.getFullYear()}${String(inicio.getMonth() + 1).padStart(2, '0')}`;

    try {
      // SICOR has several tables — ContratosOperacaoRural is the detailed one
      // Here we attempt a group-by query. If the schema varies, we fall back gracefully.
      const response = await this.http.get('ContratosOperacaoRural', {
        params: {
          $top: '5000',
          $filter: `AnoMesEmissao ge '${anoMesInicio}'`,
          $select: 'AnoMesEmissao,cdUF,cdProduto,cdFinalidade,cdFonteRecurso,VlCusteio,VlInvestimento,AreaFinanciada',
          $format: 'json',
        },
      });

      const items = response.data?.value || [];
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('SICOR retornou conjunto vazio');
      }

      const agregado = this.agregarContratos(items, `${mesesAtras} meses`);
      this.cache.set(cacheKey, agregado);
      this.dsm.updateSourceStatus('bcb_sicor', 'online', Date.now() - start);
      return { ...agregado, fonte: 'api' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[SICOR] Agregado falhou: ${msg}`);
      this.dsm.updateSourceStatus('bcb_sicor', 'degraded', Date.now() - start, msg);
      return {
        ...FALLBACK_AGREGADO,
        fonte: 'fallback',
        atualizadoEm: new Date().toISOString(),
      };
    }
  }

  /**
   * Monthly time series of rural credit concessions (volume + count).
   * Uses BCB SGS series 20568 (rural credit disbursed monthly) as primary,
   * since SICOR direct aggregation at monthly granularity is heavy.
   */
  async getSerieMensal(meses: number = 24): Promise<{ serie: { mes: string; valor: number }[]; fonte: 'api' | 'cache' | 'fallback'; atualizadoEm: string }> {
    const cacheKey = `sicor_serie_${meses}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const start = Date.now();
    try {
      // BCB SGS 20568 = rural credit disbursed monthly (R$ millions)
      const dataFim = new Date();
      const dataInicio = new Date(dataFim);
      dataInicio.setMonth(dataInicio.getMonth() - meses);
      const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

      const resp = await axios.get('https://api.bcb.gov.br/dados/serie/bcdata.sgs.20568/dados', {
        params: {
          formato: 'json',
          dataInicial: fmt(dataInicio),
          dataFinal: fmt(dataFim),
        },
        timeout: 12000,
      });
      const items = resp.data;
      if (!Array.isArray(items) || items.length === 0) throw new Error('SGS retornou vazio');

      const serie = items.map((it: any) => {
        const [d, m, y] = (it.data as string).split('/');
        return {
          mes: `${y}-${m}`,
          valor: parseFloat(String(it.valor).replace(',', '.')) * 1_000_000, // to R$
        };
      });

      const result = { serie, fonte: 'api' as const, atualizadoEm: new Date().toISOString() };
      this.cache.set(cacheKey, result);
      this.dsm.updateSourceStatus('bcb_sicor', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[SICOR] Serie mensal falhou: ${msg}`);

      // Synthesize a plausible series based on fallback totals
      const serie = [];
      const base = FALLBACK_AGREGADO.valorTotal / 12;
      const now = new Date();
      for (let i = meses - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        const season = 1 + 0.15 * Math.sin((d.getMonth() / 12) * 2 * Math.PI); // peak at harvest/planting
        const trend = 1 + (meses - i) * 0.005;
        serie.push({
          mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          valor: Math.round(base * season * trend),
        });
      }
      return { serie, fonte: 'fallback', atualizadoEm: new Date().toISOString() };
    }
  }

  private agregarContratos(items: any[], periodo: string): SicorAgregado {
    let valorTotal = 0;
    let totalContratos = 0;
    let areaTotal = 0;
    const porProduto = new Map<string, number>();
    const porUF = new Map<string, { valor: number; contratos: number }>();
    const porFinalidade = new Map<string, number>();

    for (const it of items) {
      const valor = (parseFloat(it.VlCusteio || 0) + parseFloat(it.VlInvestimento || 0)) || 0;
      valorTotal += valor;
      totalContratos += 1;
      areaTotal += parseFloat(it.AreaFinanciada || 0);

      const prod = String(it.cdProduto || 'Outros');
      porProduto.set(prod, (porProduto.get(prod) || 0) + valor);

      const uf = String(it.cdUF || 'NA');
      const ufCur = porUF.get(uf) || { valor: 0, contratos: 0 };
      porUF.set(uf, { valor: ufCur.valor + valor, contratos: ufCur.contratos + 1 });

      const fin = String(it.cdFinalidade || 'Custeio');
      porFinalidade.set(fin, (porFinalidade.get(fin) || 0) + valor);
    }

    const topProdutos = [...porProduto.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([produto, valor]) => ({
        produto,
        valor,
        participacao: Math.round((valor / valorTotal) * 1000) / 10,
      }));

    const topUFs = [...porUF.entries()]
      .sort((a, b) => b[1].valor - a[1].valor)
      .slice(0, 10)
      .map(([uf, v]) => ({ uf, valor: v.valor, contratos: v.contratos }));

    const porFinalidadeArr = [...porFinalidade.entries()].map(([finalidade, valor]) => ({
      finalidade,
      valor,
      participacao: Math.round((valor / valorTotal) * 1000) / 10,
    }));

    return {
      periodo,
      totalContratos,
      valorTotal,
      valorMedio: valorTotal / (totalContratos || 1),
      areaTotal,
      topProdutos,
      topUFs,
      porFinalidade: porFinalidadeArr,
      fonte: 'api',
      atualizadoEm: new Date().toISOString(),
    };
  }
}

// ============================================================
// ALETIS — BCB SICOR Service
// Sistema de Operações do Crédito Rural (OData)
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

// Falha de coleta não produz referências nem séries artificiais no fluxo operacional.

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
      throw new Error('SICOR indisponível: não há observações verificadas para esta consulta.', { cause: error });
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

      this.dsm.updateSourceStatus('bcb_sicor', 'degraded', Date.now() - start, msg);
      throw new Error('SICOR indisponível: não há série mensal verificada para esta consulta.', { cause: error });
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

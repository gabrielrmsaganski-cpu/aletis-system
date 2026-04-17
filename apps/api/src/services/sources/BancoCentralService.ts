// ============================================================
// ALETIS — Banco Central do Brasil Service
// Real integrations with BCB SGS API and OLINDA PTAX
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface SerieTemporalBCB {
  data: string;
  valor: string;
}

export interface IndicadorBCB {
  nome: string;
  serie: number;
  valor: number;
  data: string;
  unidade: string;
  fonte: 'api' | 'cache' | 'fallback';
  historico?: { data: string; valor: number }[];
}

export interface CotacaoPTAX {
  cotacaoCompra: number;
  cotacaoVenda: number;
  dataHoraCotacao: string;
  fonte: 'api' | 'cache' | 'fallback';
}

export interface CreditoRuralData {
  volume: number;
  periodo: string;
  unidade: string;
  fonte: 'api' | 'cache' | 'fallback';
  historico?: { data: string; valor: number }[];
}

// ── Fallback Data (realistic values for when APIs are down) ──

const FALLBACK_DATA = {
  selic: { valor: 14.25, data: '2026-04-15', unidade: '% a.a.' },
  ipca: { valor: 0.56, data: '2026-03-01', unidade: '% mensal' },
  igpm: { valor: 0.24, data: '2026-03-01', unidade: '% mensal' },
  cdi: { valor: 14.15, data: '2026-04-15', unidade: '% a.a.' },
  ptax: { cotacaoCompra: 5.72, cotacaoVenda: 5.73, dataHoraCotacao: '2026-04-15 13:00:00' },
  creditoRural: { volume: 42500000000, periodo: '2026-03', unidade: 'R$ (milhoes)' },
};

// ── Service Class ────────────────────────────────────────────

export class BancoCentralService {
  private readonly cache: NodeCache;
  private readonly httpSGS: AxiosInstance;
  private readonly httpOLINDA: AxiosInstance;
  private readonly manager: DataSourceManager;

  constructor(manager: DataSourceManager) {
    this.manager = manager;

    this.cache = new NodeCache({
      stdTTL: 3600,
      checkperiod: 120,
      useClones: false,
    });

    this.httpSGS = axios.create({
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ALETIS-System/1.0',
      },
    });

    this.httpOLINDA = axios.create({
      baseURL: 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/',
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ALETIS-System/1.0',
      },
    });
  }

  // ── Private: Generic SGS Fetcher ─────────────────────────

  private async fetchSerieSGS(
    serie: number,
    sourceName: string,
    dias: number = 30
  ): Promise<SerieTemporalBCB[]> {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - dias);

    const dataInicial = this.formatDateBR(start);
    const dataFinal = this.formatDateBR(end);

    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`;

    console.log(`[BCB] Buscando série ${serie} (${sourceName}): ${dataInicial} a ${dataFinal}`);

    const startTime = Date.now();
    try {
      const response = await this.httpSGS.get<SerieTemporalBCB[]>(url);
      const latencia = Date.now() - startTime;

      if (response.data && response.data.length > 0) {
        this.manager.updateSourceStatus(sourceName, 'online', latencia);
        console.log(`[BCB] Série ${serie} OK: ${response.data.length} registros em ${latencia}ms`);
        return response.data;
      }

      this.manager.updateSourceStatus(sourceName, 'degraded', latencia, 'Resposta vazia');
      return [];
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus(sourceName, 'offline', latencia, msg);
      console.warn(`[BCB] Erro na série ${serie} (${sourceName}): ${msg}`);
      throw error;
    }
  }

  private parseSGSData(data: SerieTemporalBCB[]): { data: string; valor: number }[] {
    return data
      .map((item) => ({
        data: this.parseDateBR(item.data),
        valor: parseFloat(item.valor),
      }))
      .filter((item) => !isNaN(item.valor));
  }

  // ── Public: Taxa Selic (SGS 432) ─────────────────────────

  async fetchSelic(): Promise<IndicadorBCB> {
    const cacheKey = 'bcb_selic';
    const cached = this.cache.get<IndicadorBCB>(cacheKey);
    if (cached) {
      console.log('[BCB] Selic retornada do cache');
      return { ...cached, fonte: 'cache' };
    }

    try {
      const rawData = await this.fetchSerieSGS(432, 'bcb_selic', 60);
      const parsed = this.parseSGSData(rawData);

      if (parsed.length === 0) throw new Error('Sem dados');

      const ultimo = parsed[parsed.length - 1];
      const result: IndicadorBCB = {
        nome: 'Taxa Selic Meta',
        serie: 432,
        valor: ultimo.valor,
        data: ultimo.data,
        unidade: '% a.a.',
        fonte: 'api',
        historico: parsed.slice(-12),
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch {
      console.warn('[BCB] Usando fallback para Selic');
      const fallback: IndicadorBCB = {
        nome: 'Taxa Selic Meta',
        serie: 432,
        valor: FALLBACK_DATA.selic.valor,
        data: FALLBACK_DATA.selic.data,
        unidade: FALLBACK_DATA.selic.unidade,
        fonte: 'fallback',
      };
      this.cache.set(cacheKey, fallback, 300); // cache fallback for 5 min
      return fallback;
    }
  }

  // ── Public: IPCA (SGS 433) ───────────────────────────────

  async fetchIPCA(): Promise<IndicadorBCB> {
    const cacheKey = 'bcb_ipca';
    const cached = this.cache.get<IndicadorBCB>(cacheKey);
    if (cached) {
      console.log('[BCB] IPCA retornado do cache');
      return { ...cached, fonte: 'cache' };
    }

    try {
      const rawData = await this.fetchSerieSGS(433, 'bcb_ipca', 180);
      const parsed = this.parseSGSData(rawData);

      if (parsed.length === 0) throw new Error('Sem dados');

      const ultimo = parsed[parsed.length - 1];
      const result: IndicadorBCB = {
        nome: 'IPCA Mensal',
        serie: 433,
        valor: ultimo.valor,
        data: ultimo.data,
        unidade: '% mensal',
        fonte: 'api',
        historico: parsed.slice(-12),
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch {
      console.warn('[BCB] Usando fallback para IPCA');
      const fallback: IndicadorBCB = {
        nome: 'IPCA Mensal',
        serie: 433,
        valor: FALLBACK_DATA.ipca.valor,
        data: FALLBACK_DATA.ipca.data,
        unidade: FALLBACK_DATA.ipca.unidade,
        fonte: 'fallback',
      };
      this.cache.set(cacheKey, fallback, 300);
      return fallback;
    }
  }

  // ── Public: IGP-M (SGS 189) ──────────────────────────────

  async fetchIGPM(): Promise<IndicadorBCB> {
    const cacheKey = 'bcb_igpm';
    const cached = this.cache.get<IndicadorBCB>(cacheKey);
    if (cached) {
      console.log('[BCB] IGP-M retornado do cache');
      return { ...cached, fonte: 'cache' };
    }

    try {
      const rawData = await this.fetchSerieSGS(189, 'bcb_igpm', 180);
      const parsed = this.parseSGSData(rawData);

      if (parsed.length === 0) throw new Error('Sem dados');

      const ultimo = parsed[parsed.length - 1];
      const result: IndicadorBCB = {
        nome: 'IGP-M Mensal',
        serie: 189,
        valor: ultimo.valor,
        data: ultimo.data,
        unidade: '% mensal',
        fonte: 'api',
        historico: parsed.slice(-12),
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch {
      console.warn('[BCB] Usando fallback para IGP-M');
      const fallback: IndicadorBCB = {
        nome: 'IGP-M Mensal',
        serie: 189,
        valor: FALLBACK_DATA.igpm.valor,
        data: FALLBACK_DATA.igpm.data,
        unidade: FALLBACK_DATA.igpm.unidade,
        fonte: 'fallback',
      };
      this.cache.set(cacheKey, fallback, 300);
      return fallback;
    }
  }

  // ── Public: CDI (SGS 12) ─────────────────────────────────

  async fetchCDI(): Promise<IndicadorBCB> {
    const cacheKey = 'bcb_cdi';
    const cached = this.cache.get<IndicadorBCB>(cacheKey);
    if (cached) {
      console.log('[BCB] CDI retornado do cache');
      return { ...cached, fonte: 'cache' };
    }

    try {
      const rawData = await this.fetchSerieSGS(12, 'bcb_cdi', 30);
      const parsed = this.parseSGSData(rawData);

      if (parsed.length === 0) throw new Error('Sem dados');

      const ultimo = parsed[parsed.length - 1];
      // CDI diario: anualizar
      const cdiAnual = (Math.pow(1 + ultimo.valor / 100, 252) - 1) * 100;
      const result: IndicadorBCB = {
        nome: 'Taxa CDI',
        serie: 12,
        valor: parseFloat(cdiAnual.toFixed(2)),
        data: ultimo.data,
        unidade: '% a.a.',
        fonte: 'api',
        historico: parsed.slice(-30),
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch {
      console.warn('[BCB] Usando fallback para CDI');
      const fallback: IndicadorBCB = {
        nome: 'Taxa CDI',
        serie: 12,
        valor: FALLBACK_DATA.cdi.valor,
        data: FALLBACK_DATA.cdi.data,
        unidade: FALLBACK_DATA.cdi.unidade,
        fonte: 'fallback',
      };
      this.cache.set(cacheKey, fallback, 300);
      return fallback;
    }
  }

  // ── Public: Dólar PTAX ───────────────────────────────────

  async fetchDolarPTAX(): Promise<CotacaoPTAX> {
    const cacheKey = 'bcb_dolar_ptax';
    const cached = this.cache.get<CotacaoPTAX>(cacheKey);
    if (cached) {
      console.log('[BCB] PTAX retornada do cache');
      return { ...cached, fonte: 'cache' };
    }

    const startTime = Date.now();
    try {
      // Try today first, then yesterday (weekends/holidays)
      const dates = this.getRecentBusinessDates(3);

      for (const dateStr of dates) {
        try {
          const url = `CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`;
          console.log(`[BCB] Buscando PTAX para ${dateStr}`);

          const response = await this.httpOLINDA.get(url);
          const latencia = Date.now() - startTime;

          if (response.data?.value && response.data.value.length > 0) {
            const cotacao = response.data.value[response.data.value.length - 1];
            this.manager.updateSourceStatus('bcb_dolar_ptax', 'online', latencia);

            const result: CotacaoPTAX = {
              cotacaoCompra: cotacao.cotacaoCompra,
              cotacaoVenda: cotacao.cotacaoVenda,
              dataHoraCotacao: cotacao.dataHoraCotacao,
              fonte: 'api',
            };

            this.cache.set(cacheKey, result, 1800);
            console.log(`[BCB] PTAX OK: Venda R$ ${result.cotacaoVenda} em ${latencia}ms`);
            return result;
          }
        } catch {
          // Try next date
          continue;
        }
      }

      throw new Error('Nenhuma cotação encontrada nos últimos 3 dias úteis');
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('bcb_dolar_ptax', 'offline', latencia, msg);
      console.warn(`[BCB] Erro PTAX: ${msg}. Usando fallback.`);

      const fallback: CotacaoPTAX = {
        cotacaoCompra: FALLBACK_DATA.ptax.cotacaoCompra,
        cotacaoVenda: FALLBACK_DATA.ptax.cotacaoVenda,
        dataHoraCotacao: FALLBACK_DATA.ptax.dataHoraCotacao,
        fonte: 'fallback',
      };
      this.cache.set(cacheKey, fallback, 300);
      return fallback;
    }
  }

  // ── Public: IC-Br Agricultural Commodity Index (SGS 27574) ──

  async fetchICBrAgro(): Promise<IndicadorBCB> {
    const cacheKey = 'bcb_icbr_agro';
    const cached = this.cache.get<IndicadorBCB>(cacheKey);
    if (cached) {
      this.manager.updateSourceStatus('bcb_icbr_agro', 'online', 0);
      return { ...cached, fonte: 'cache' };
    }

    const start = Date.now();
    try {
      const dados = await this.fetchSerieSGS(27574, 'bcb_icbr_agro', 90);
      if (dados.length === 0) throw new Error('IC-Br Agro retornou vazio');

      const ultimo = dados[dados.length - 1];
      const historico = dados.map(d => ({
        data: this.parseDateBR(d.data),
        valor: parseFloat(d.valor),
      }));

      const result: IndicadorBCB = {
        nome: 'IC-Br Agropecuário',
        serie: 27574,
        valor: parseFloat(ultimo.valor),
        data: this.parseDateBR(ultimo.data),
        unidade: 'indice',
        fonte: 'api',
        historico,
      };

      this.cache.set(cacheKey, result, 3600);
      this.manager.updateSourceStatus('bcb_icbr_agro', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[BCB] IC-Br Agro falhou: ${msg}`);
      this.manager.updateSourceStatus('bcb_icbr_agro', 'degraded', Date.now() - start, msg);

      return {
        nome: 'IC-Br Agropecuário',
        serie: 27574,
        valor: 446.0,
        data: '2026-03-01',
        unidade: 'indice',
        fonte: 'fallback',
      };
    }
  }

  // ── Public: IC-Br Sub-Indices ─────────────────────────────

  async fetchICBrCompleto(): Promise<{
    agro: IndicadorBCB;
    energia: IndicadorBCB;
    metal: IndicadorBCB;
    fonte: 'api' | 'cache' | 'fallback';
    atualizadoEm: string;
  }> {
    const cacheKey = 'bcb_icbr_completo';
    const cached = this.cache.get<{ agro: IndicadorBCB; energia: IndicadorBCB; metal: IndicadorBCB; fonte: 'api' | 'cache' | 'fallback'; atualizadoEm: string }>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const [agroResult, energiaResult, metalResult] = await Promise.allSettled([
      this.fetchICBrAgro(),
      this.fetchICBrSubIndex(27575, 'bcb_icbr_energia', 'IC-Br Energia', 433.17),
      this.fetchICBrSubIndex(27576, 'bcb_icbr_metal', 'IC-Br Metal', 215.49),
    ]);

    const agro = agroResult.status === 'fulfilled' ? agroResult.value
      : { nome: 'IC-Br Agropecuário', serie: 27574, valor: 446.0, data: '2026-03-01', unidade: 'indice', fonte: 'fallback' as const };
    const energia = energiaResult.status === 'fulfilled' ? energiaResult.value
      : { nome: 'IC-Br Energia', serie: 27575, valor: 433.17, data: '2026-03-01', unidade: 'indice', fonte: 'fallback' as const };
    const metal = metalResult.status === 'fulfilled' ? metalResult.value
      : { nome: 'IC-Br Metal', serie: 27576, valor: 215.49, data: '2026-03-01', unidade: 'indice', fonte: 'fallback' as const };

    const fonteGeral = [agro, energia, metal].some(i => i.fonte === 'api') ? 'api' as const
      : [agro, energia, metal].some(i => i.fonte === 'cache') ? 'cache' as const : 'fallback' as const;

    const result = { agro, energia, metal, fonte: fonteGeral, atualizadoEm: new Date().toISOString() };
    this.cache.set(cacheKey, result, 3600);
    return result;
  }

  private async fetchICBrSubIndex(serie: number, sourceName: string, nome: string, fallbackValor: number): Promise<IndicadorBCB> {
    const cacheKey = sourceName;
    const cached = this.cache.get<IndicadorBCB>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const start = Date.now();
    try {
      const dados = await this.fetchSerieSGS(serie, sourceName, 90);
      if (dados.length === 0) throw new Error(`${nome} retornou vazio`);

      const ultimo = dados[dados.length - 1];
      const historico = dados.map(d => ({ data: this.parseDateBR(d.data), valor: parseFloat(d.valor) }));

      const result: IndicadorBCB = {
        nome,
        serie,
        valor: parseFloat(ultimo.valor),
        data: this.parseDateBR(ultimo.data),
        unidade: 'indice',
        fonte: 'api',
        historico,
      };

      this.cache.set(cacheKey, result, 3600);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[BCB] ${nome} falhou: ${msg}`);
      this.manager.updateSourceStatus(sourceName, 'degraded', Date.now() - start, msg);
      return { nome, serie, valor: fallbackValor, data: '2026-03-01', unidade: 'indice', fonte: 'fallback' };
    }
  }

  // ── Public: EMBI+ Brazil Country Risk (SGS 21340) ─────────

  async fetchEMBI(): Promise<IndicadorBCB> {
    const cacheKey = 'bcb_embi';
    const cached = this.cache.get<IndicadorBCB>(cacheKey);
    if (cached) {
      this.manager.updateSourceStatus('bcb_embi', 'online', 0);
      return { ...cached, fonte: 'cache' };
    }

    const start = Date.now();
    try {
      const dados = await this.fetchSerieSGS(21340, 'bcb_embi', 180);
      if (dados.length === 0) throw new Error('EMBI+ retornou vazio');

      const ultimo = dados[dados.length - 1];
      const historico = dados.map(d => ({
        data: this.parseDateBR(d.data),
        valor: parseFloat(d.valor),
      }));

      const result: IndicadorBCB = {
        nome: 'EMBI+ Brasil (Risco País)',
        serie: 21340,
        valor: parseFloat(ultimo.valor),
        data: this.parseDateBR(ultimo.data),
        unidade: 'pontos-base',
        fonte: 'api',
        historico,
      };

      this.cache.set(cacheKey, result, 3600);
      this.manager.updateSourceStatus('bcb_embi', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[BCB] EMBI+ falhou: ${msg}`);
      this.manager.updateSourceStatus('bcb_embi', 'degraded', Date.now() - start, msg);

      return {
        nome: 'EMBI+ Brasil (Risco País)',
        serie: 21340,
        valor: 758.10,
        data: '2025-12-01',
        unidade: 'indice',
        fonte: 'fallback',
      };
    }
  }

  // ── Public: Crédito Rural (SGS 25469) ────────────────────

  async fetchCreditoRural(): Promise<CreditoRuralData> {
    const cacheKey = 'bcb_credito_rural';
    const cached = this.cache.get<CreditoRuralData>(cacheKey);
    if (cached) {
      console.log('[BCB] Crédito Rural retornado do cache');
      return { ...cached, fonte: 'cache' };
    }

    try {
      const rawData = await this.fetchSerieSGS(25469, 'bcb_credito_rural', 365);
      const parsed = this.parseSGSData(rawData);

      if (parsed.length === 0) throw new Error('Sem dados');

      const ultimo = parsed[parsed.length - 1];
      const result: CreditoRuralData = {
        volume: ultimo.valor * 1000000, // SGS returns in millions
        periodo: ultimo.data,
        unidade: 'R$',
        fonte: 'api',
        historico: parsed.slice(-12),
      };

      this.cache.set(cacheKey, result, 7200);
      return result;
    } catch {
      console.warn('[BCB] Usando fallback para Crédito Rural');
      const fallback: CreditoRuralData = {
        volume: FALLBACK_DATA.creditoRural.volume,
        periodo: FALLBACK_DATA.creditoRural.periodo,
        unidade: 'R$',
        fonte: 'fallback',
      };
      this.cache.set(cacheKey, fallback, 300);
      return fallback;
    }
  }

  // ── Convenience: Get All Indicators ──────────────────────

  async getAllIndicators(): Promise<{
    selic: IndicadorBCB;
    ipca: IndicadorBCB;
    igpm: IndicadorBCB;
    cdi: IndicadorBCB;
    ptax: CotacaoPTAX;
    creditoRural: CreditoRuralData;
  }> {
    const [selic, ipca, igpm, cdi, ptax, creditoRural] = await Promise.allSettled([
      this.fetchSelic(),
      this.fetchIPCA(),
      this.fetchIGPM(),
      this.fetchCDI(),
      this.fetchDolarPTAX(),
      this.fetchCreditoRural(),
    ]);

    return {
      selic: selic.status === 'fulfilled' ? selic.value : this.buildFallbackIndicador('Taxa Selic Meta', 432, FALLBACK_DATA.selic),
      ipca: ipca.status === 'fulfilled' ? ipca.value : this.buildFallbackIndicador('IPCA Mensal', 433, FALLBACK_DATA.ipca),
      igpm: igpm.status === 'fulfilled' ? igpm.value : this.buildFallbackIndicador('IGP-M Mensal', 189, FALLBACK_DATA.igpm),
      cdi: cdi.status === 'fulfilled' ? cdi.value : this.buildFallbackIndicador('Taxa CDI', 12, FALLBACK_DATA.cdi),
      ptax: ptax.status === 'fulfilled' ? ptax.value : { ...FALLBACK_DATA.ptax, fonte: 'fallback' as const },
      creditoRural: creditoRural.status === 'fulfilled' ? creditoRural.value : { ...FALLBACK_DATA.creditoRural, unidade: 'R$', fonte: 'fallback' as const },
    };
  }

  // ── Private Helpers ──────────────────────────────────────

  private buildFallbackIndicador(
    nome: string,
    serie: number,
    fb: { valor: number; data: string; unidade: string }
  ): IndicadorBCB {
    return {
      nome,
      serie,
      valor: fb.valor,
      data: fb.data,
      unidade: fb.unidade,
      fonte: 'fallback',
    };
  }

  private formatDateBR(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  private parseDateBR(dateBR: string): string {
    // Input: "dd/mm/yyyy", Output: "yyyy-mm-dd"
    const parts = dateBR.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateBR;
  }

  private getRecentBusinessDates(count: number): string[] {
    const dates: string[] = [];
    const date = new Date();

    while (dates.length < count) {
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        // PTAX expects MM-DD-YYYY
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const yyyy = date.getFullYear();
        dates.push(`${mm}-${dd}-${yyyy}`);
      }
      date.setDate(date.getDate() - 1);
    }

    return dates;
  }
}

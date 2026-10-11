// ============================================================
// ALETIS — Clima Service
// Integrations: INMET, CPTEC/INPE (BrasilAPI), NASA POWER
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface PrevisaoClima {
  cidade: string;
  estado: string;
  atualizadoEm: string;
  clima: PrevisaoDia[];
  fonte: 'api' | 'cache' | 'fallback';
}

export interface PrevisaoDia {
  data: string;
  condicao: string;
  condicaoDesc: string;
  min: number;
  max: number;
  indiceUv: number;
}

export interface EstacaoDados {
  codigo: string;
  nome: string;
  uf: string;
  data: string;
  temperatura: number | null;
  umidade: number | null;
  pressao: number | null;
  ventoVelocidade: number | null;
  ventoRajada: number | null;
  chuva: number | null;
  radiacao: number | null;
  fonte: 'api' | 'cache' | 'fallback';
}

export interface NASAPowerData {
  latitude: number;
  longitude: number;
  periodoInicio: string;
  periodoFim: string;
  parametros: {
    T2M: Record<string, number>;       // Temperatura 2m (C)
    PRECTOTCORR: Record<string, number>; // Precipitação (mm/dia)
    RH2M: Record<string, number>;      // Umidade relativa 2m (%)
  };
  resumo: {
    tempMedia: number | null;
    precipAcumulada: number | null;
    umidadeMedia: number | null;
  };
  fonte: 'api' | 'cache' | 'fallback';
}

export interface AlertaClima {
  estado: string;
  tipo: string;
  severidade: 'baixa' | 'media' | 'alta' | 'extrema';
  descricao: string;
  dataInicio: string;
  dataFim: string;
  fonte: 'api' | 'cache' | 'fallback';
}

// ── Service Class ────────────────────────────────────────────

export class ClimaService {
  private readonly cache: NodeCache;
  private readonly httpINMET: AxiosInstance;
  private readonly httpBrasilAPI: AxiosInstance;
  private readonly httpNASA: AxiosInstance;
  private readonly manager: DataSourceManager;

  constructor(manager: DataSourceManager) {
    this.manager = manager;

    this.cache = new NodeCache({
      stdTTL: 1800,
      checkperiod: 120,
      useClones: false,
    });

    this.httpINMET = axios.create({
      baseURL: 'https://apitempo.inmet.gov.br',
      timeout: 5000,
      headers: { 'User-Agent': 'ALETIS-System/1.0' },
    });

    this.httpBrasilAPI = axios.create({
      baseURL: 'https://brasilapi.com.br/api/cptec/v1',
      timeout: 5000,
      headers: { 'User-Agent': 'ALETIS-System/1.0' },
    });

    this.httpNASA = axios.create({
      baseURL: 'https://power.larc.nasa.gov/api/temporal/daily/point',
      timeout: 15000, // NASA can be slow
      headers: { 'User-Agent': 'ALETIS-System/1.0' },
    });
  }

  // ── Public: Previsão do Tempo (CPTEC/BrasilAPI) ──────────

  async getPrevisao(codigoCidade: string, dias: number = 4): Promise<PrevisaoClima> {
    const cacheKey = `clima_previsao_${codigoCidade}_${dias}`;
    const cached = this.cache.get<PrevisaoClima>(cacheKey);
    if (cached) {
      console.log(`[Clima] Previsão ${codigoCidade} retornada do cache`);
      // Fallbacks antigos podem ainda existir na memória durante uma atualização.
      // Eles nunca podem ganhar o rótulo de cache, que é reservado a observações reais.
      return cached.fonte === 'fallback' ? cached : { ...cached, fonte: 'cache' };
    }

    const startTime = Date.now();
    try {
      console.log(`[Clima] Buscando previsão CPTEC para cidade ${codigoCidade}, ${dias} dias`);
      const response = await this.httpBrasilAPI.get(`/clima/previsao/${dias}/${codigoCidade}`);
      const latencia = Date.now() - startTime;

      if (!response.data || !response.data.clima) {
        throw new Error('Resposta inválida da BrasilAPI');
      }

      this.manager.updateSourceStatus('cptec_previsao', 'online', latencia);

      const result: PrevisaoClima = {
        cidade: response.data.cidade || codigoCidade,
        estado: response.data.estado || '',
        atualizadoEm: typeof response.data.atualizado_em === 'string' ? response.data.atualizado_em : '',
        clima: response.data.clima.map((dia: Record<string, unknown>) => ({
          data: dia.data as string,
          condicao: dia.condicao as string,
          condicaoDesc: dia.condicao_desc as string,
          min: dia.min as number,
          max: dia.max as number,
          indiceUv: dia.indice_uv as number,
        })),
        fonte: 'api',
      };

      this.cache.set(cacheKey, result, 3600);
      console.log(`[Clima] Previsão ${codigoCidade} OK em ${latencia}ms`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('cptec_previsao', 'offline', latencia, msg);
      console.warn(`[Clima] Erro previsao ${codigoCidade}: ${msg}. Sem previsão publicada.`);

      const fallback: PrevisaoClima = {
        cidade: codigoCidade,
        estado: '',
        atualizadoEm: '',
        clima: [],
        fonte: 'fallback',
      };

      return fallback;
    }
  }

  // ── Public: Dados de Estação INMET ───────────────────────

  async getEstacaoData(codigoEstacao: string): Promise<EstacaoDados> {
    const cacheKey = `clima_estacao_${codigoEstacao}`;
    const cached = this.cache.get<EstacaoDados>(cacheKey);
    if (cached) {
      console.log(`[Clima] Estação ${codigoEstacao} retornada do cache`);
      return cached.fonte === 'fallback' ? cached : { ...cached, fonte: 'cache' };
    }

    const startTime = Date.now();
    try {
      const today = new Date().toISOString().split('T')[0];
      console.log(`[Clima] Buscando dados INMET estacao ${codigoEstacao} para ${today}`);

      const response = await this.httpINMET.get(`/estacao/dados/${today}/${codigoEstacao}`);
      const latencia = Date.now() - startTime;

      if (!response.data || (Array.isArray(response.data) && response.data.length === 0)) {
        throw new Error('Sem dados para estação');
      }

      this.manager.updateSourceStatus('inmet_estacao', 'online', latencia);

      // INMET returns array of hourly readings; take the latest
      const readings = Array.isArray(response.data) ? response.data : [response.data];
      const latest = readings[readings.length - 1];

      const result: EstacaoDados = {
        codigo: codigoEstacao,
        nome: latest.DC_NOME || codigoEstacao,
        uf: latest.SG_ESTADO || '',
        data: typeof latest.DT_MEDICAO === 'string' ? latest.DT_MEDICAO : '',
        temperatura: this.parseFloat(latest.TEM_INS),
        umidade: this.parseFloat(latest.UMD_INS),
        pressao: this.parseFloat(latest.PRE_INS),
        ventoVelocidade: this.parseFloat(latest.VEN_VEL),
        ventoRajada: this.parseFloat(latest.VEN_RAJ),
        chuva: this.parseFloat(latest.CHUVA),
        radiacao: this.parseFloat(latest.RAD_GLO),
        fonte: 'api',
      };

      this.cache.set(cacheKey, result, 1800);
      console.log(`[Clima] Estação ${codigoEstacao} OK em ${latencia}ms`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('inmet_estacao', 'offline', latencia, msg);
      console.warn(`[Clima] Erro estação ${codigoEstacao}: ${msg}. Sem observação publicada.`);

      const fallback: EstacaoDados = {
        codigo: codigoEstacao,
        nome: `Estação ${codigoEstacao}`,
        uf: '',
        data: '',
        temperatura: null,
        umidade: null,
        pressao: null,
        ventoVelocidade: null,
        ventoRajada: null,
        chuva: null,
        radiacao: null,
        fonte: 'fallback',
      };

      return fallback;
    }
  }

  // ── Public: NASA POWER Historical Climate ────────────────

  async getDadosNASA(
    lat: number,
    lon: number,
    startDate: string,
    endDate: string
  ): Promise<NASAPowerData> {
    const cacheKey = `nasa_${lat}_${lon}_${startDate}_${endDate}`;
    const cached = this.cache.get<NASAPowerData>(cacheKey);
    if (cached) {
      console.log(`[Clima] NASA POWER dados retornados do cache`);
      return cached.fonte === 'fallback' ? cached : { ...cached, fonte: 'cache' };
    }

    const startTime = Date.now();
    try {
      const startFormatted = startDate.replace(/-/g, '');
      const endFormatted = endDate.replace(/-/g, '');

      console.log(`[Clima] Buscando NASA POWER: lat=${lat}, lon=${lon}, ${startDate} a ${endDate}`);

      const response = await this.httpNASA.get('', {
        params: {
          start: startFormatted,
          end: endFormatted,
          latitude: lat,
          longitude: lon,
          community: 'AG',
          parameters: 'T2M,PRECTOTCORR,RH2M',
          format: 'json',
        },
      });
      const latencia = Date.now() - startTime;

      if (!response.data?.properties?.parameter) {
        throw new Error('Resposta inválida da NASA POWER');
      }

      this.manager.updateSourceStatus('nasa_power', 'online', latencia);

      const params = response.data.properties.parameter;
      const t2m = params.T2M || {};
      const prec = params.PRECTOTCORR || {};
      const rh2m = params.RH2M || {};

      // Calculate summary statistics
      const tempValues = Object.values(t2m).filter((v): v is number => typeof v === 'number' && v > -999);
      const precValues = Object.values(prec).filter((v): v is number => typeof v === 'number' && v > -999);
      const rhValues = Object.values(rh2m).filter((v): v is number => typeof v === 'number' && v > -999);

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      const sum = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) : null;

      const result: NASAPowerData = {
        latitude: lat,
        longitude: lon,
        periodoInicio: startDate,
        periodoFim: endDate,
        parametros: {
          T2M: t2m,
          PRECTOTCORR: prec,
          RH2M: rh2m,
        },
        resumo: {
          tempMedia: avg(tempValues) === null ? null : parseFloat(avg(tempValues)!.toFixed(1)),
          precipAcumulada: sum(precValues) === null ? null : parseFloat(sum(precValues)!.toFixed(1)),
          umidadeMedia: avg(rhValues) === null ? null : parseFloat(avg(rhValues)!.toFixed(1)),
        },
        fonte: 'api',
      };

      this.cache.set(cacheKey, result, 86400);
      console.log(`[Clima] NASA POWER OK em ${latencia}ms: temp media ${result.resumo.tempMedia ?? 'indisponível'}C`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('nasa_power', 'offline', latencia, msg);
      console.warn(`[Clima] Erro NASA POWER: ${msg}. Sem série publicada.`);

      const fallback: NASAPowerData = {
        latitude: lat,
        longitude: lon,
        periodoInicio: startDate,
        periodoFim: endDate,
        parametros: {
          T2M: {},
          PRECTOTCORR: {},
          RH2M: {},
        },
        resumo: {
          tempMedia: null,
          precipAcumulada: null,
          umidadeMedia: null,
        },
        fonte: 'fallback',
      };

      return fallback;
    }
  }

  // ── Public: Alertas por Região ───────────────────────────

  async getAlertasRegiao(_estado: string): Promise<AlertaClima[]> {
    // O endpoint CPTEC /ondas descreve condições do litoral, não avisos por UF.
    // Sem um conector de avisos com contrato verificado, o consumidor sinaliza
    // indisponibilidade. Não convertemos ondas nem referências locais em alertas.
    return [];
  }

  // ── Private Helpers ──────────────────────────────────────

  private parseFloat(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return Number.isFinite(num) && num > -900 ? num : null;
  }
}

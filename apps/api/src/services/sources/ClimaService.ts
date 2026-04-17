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
    tempMedia: number;
    precipAcumulada: number;
    umidadeMedia: number;
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

// ── Fallback Data ────────────────────────────────────────────

const FALLBACK_PREVISAO: PrevisaoDia[] = [
  { data: '2026-04-16', condicao: 'ps', condicaoDesc: 'Parcialmente Nublado', min: 18, max: 29, indiceUv: 8 },
  { data: '2026-04-17', condicao: 'cl', condicaoDesc: 'Céu Limpo', min: 17, max: 31, indiceUv: 10 },
  { data: '2026-04-18', condicao: 'c', condicaoDesc: 'Chuva', min: 19, max: 26, indiceUv: 4 },
  { data: '2026-04-19', condicao: 'ps', condicaoDesc: 'Parcialmente Nublado', min: 16, max: 27, indiceUv: 7 },
];

const FALLBACK_ESTACAO: Omit<EstacaoDados, 'codigo' | 'nome' | 'uf'> = {
  data: '2026-04-16',
  temperatura: 24.5,
  umidade: 62,
  pressao: 1013.2,
  ventoVelocidade: 3.2,
  ventoRajada: 8.1,
  chuva: 0,
  radiacao: 1850,
  fonte: 'fallback',
};

const FALLBACK_ALERTAS: AlertaClima[] = [
  {
    estado: 'MS',
    tipo: 'Chuva Intensa',
    severidade: 'media',
    descricao: 'Previsão de chuvas intensas nas próximas 24h com acumulado entre 50 e 100mm',
    dataInicio: '2026-04-16T00:00:00',
    dataFim: '2026-04-17T23:59:59',
    fonte: 'fallback',
  },
  {
    estado: 'GO',
    tipo: 'Onda de Calor',
    severidade: 'alta',
    descricao: 'Temperaturas acima de 38°C previstas para os próximos 3 dias',
    dataInicio: '2026-04-16T00:00:00',
    dataFim: '2026-04-19T23:59:59',
    fonte: 'fallback',
  },
];

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
      return { ...cached, fonte: 'cache' };
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
        atualizadoEm: response.data.atualizado_em || new Date().toISOString(),
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
      console.warn(`[Clima] Erro previsao ${codigoCidade}: ${msg}. Usando fallback.`);

      const fallback: PrevisaoClima = {
        cidade: codigoCidade,
        estado: '',
        atualizadoEm: new Date().toISOString(),
        clima: FALLBACK_PREVISAO.slice(0, dias),
        fonte: 'fallback',
      };

      this.cache.set(cacheKey, fallback, 300);
      return fallback;
    }
  }

  // ── Public: Dados de Estação INMET ───────────────────────

  async getEstacaoData(codigoEstacao: string): Promise<EstacaoDados> {
    const cacheKey = `clima_estacao_${codigoEstacao}`;
    const cached = this.cache.get<EstacaoDados>(cacheKey);
    if (cached) {
      console.log(`[Clima] Estação ${codigoEstacao} retornada do cache`);
      return { ...cached, fonte: 'cache' };
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
        data: latest.DT_MEDICAO || today,
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
      console.warn(`[Clima] Erro estação ${codigoEstacao}: ${msg}. Usando fallback.`);

      const fallback: EstacaoDados = {
        codigo: codigoEstacao,
        nome: `Estação ${codigoEstacao}`,
        uf: '',
        ...FALLBACK_ESTACAO,
      };

      this.cache.set(cacheKey, fallback, 300);
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
      return { ...cached, fonte: 'cache' };
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

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);

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
          tempMedia: parseFloat(avg(tempValues).toFixed(1)),
          precipAcumulada: parseFloat(sum(precValues).toFixed(1)),
          umidadeMedia: parseFloat(avg(rhValues).toFixed(1)),
        },
        fonte: 'api',
      };

      this.cache.set(cacheKey, result, 86400);
      console.log(`[Clima] NASA POWER OK em ${latencia}ms: temp media ${result.resumo.tempMedia}C`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('nasa_power', 'offline', latencia, msg);
      console.warn(`[Clima] Erro NASA POWER: ${msg}. Usando fallback.`);

      const fallback: NASAPowerData = {
        latitude: lat,
        longitude: lon,
        periodoInicio: startDate,
        periodoFim: endDate,
        parametros: {
          T2M: { '20260401': 25.3, '20260402': 26.1, '20260403': 24.8 },
          PRECTOTCORR: { '20260401': 2.1, '20260402': 0, '20260403': 12.5 },
          RH2M: { '20260401': 68, '20260402': 55, '20260403': 82 },
        },
        resumo: {
          tempMedia: 25.4,
          precipAcumulada: 14.6,
          umidadeMedia: 68.3,
        },
        fonte: 'fallback',
      };

      this.cache.set(cacheKey, fallback, 300);
      return fallback;
    }
  }

  // ── Public: Alertas por Região ───────────────────────────

  async getAlertasRegiao(estado: string): Promise<AlertaClima[]> {
    const cacheKey = `clima_alertas_${estado}`;
    const cached = this.cache.get<AlertaClima[]>(cacheKey);
    if (cached) {
      console.log(`[Clima] Alertas ${estado} retornados do cache`);
      return cached.map((a) => ({ ...a, fonte: 'cache' as const }));
    }

    const startTime = Date.now();
    try {
      // BrasilAPI has a weather alerts endpoint
      console.log(`[Clima] Buscando alertas para ${estado}`);
      const response = await this.httpBrasilAPI.get(`/ondas`);
      const latencia = Date.now() - startTime;

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Resposta inválida');
      }

      // Filter for the requested state if the data supports it
      const alertas: AlertaClima[] = response.data
        .filter((a: Record<string, unknown>) => {
          const aEstado = (a.estado as string) || '';
          return !estado || aEstado.toUpperCase() === estado.toUpperCase();
        })
        .slice(0, 10)
        .map((a: Record<string, unknown>) => ({
          estado: (a.estado as string) || estado,
          tipo: (a.descricao as string) || 'Alerta meteorológico',
          severidade: this.mapSeveridade(a.aviso as string),
          descricao: (a.descricao as string) || '',
          dataInicio: (a.data_inicio as string) || new Date().toISOString(),
          dataFim: (a.data_fim as string) || new Date().toISOString(),
          fonte: 'api' as const,
        }));

      this.cache.set(cacheKey, alertas, 3600);
      console.log(`[Clima] Alertas ${estado} OK em ${latencia}ms: ${alertas.length} alertas`);
      return alertas;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[Clima] Erro alertas ${estado}: ${msg}. Usando fallback.`);

      const fallback = FALLBACK_ALERTAS.filter(
        (a) => !estado || a.estado.toUpperCase() === estado.toUpperCase()
      );

      // If no match for the state, return generic ones
      const result = fallback.length > 0 ? fallback : FALLBACK_ALERTAS.map((a) => ({
        ...a,
        estado,
      }));

      this.cache.set(cacheKey, result, 300);
      return result;
    }
  }

  // ── Private Helpers ──────────────────────────────────────

  private parseFloat(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  }

  private mapSeveridade(aviso: string | undefined): AlertaClima['severidade'] {
    if (!aviso) return 'baixa';
    const lower = aviso.toLowerCase();
    if (lower.includes('extremo') || lower.includes('grande perigo')) return 'extrema';
    if (lower.includes('perigo') || lower.includes('alto')) return 'alta';
    if (lower.includes('moderado') || lower.includes('medio')) return 'media';
    return 'baixa';
  }
}

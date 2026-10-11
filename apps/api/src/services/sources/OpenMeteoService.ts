// ============================================================
// ALETIS — Open-Meteo Weather Service
// Free, no-auth weather API with agricultural parameters
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import { LastObservationStore } from './LastObservationStore.js';
import type { DataSourceManager } from '../DataSourceManager.js';

// A API publica hora civil junto de utc_offset_seconds. Data sem sufixo não é UTC.
function observationInstant(value: unknown, offsetSeconds: unknown): string | null {
  if (typeof value !== 'string') return null;
  const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  if (!explicitZone && (typeof offsetSeconds !== 'number' || !Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) > 86400)) return null;
  const timestamp = explicitZone ? Date.parse(value) : Date.parse(value + 'Z') - (offsetSeconds as number) * 1000;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

// ── Types ────────────────────────────────────────────────────

export interface OpenMeteoForecast {
  latitude: number;
  longitude: number;
  timezone: string;
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    rain_sum: number[];
    et0_fao_evapotranspiration: number[];
    windspeed_10m_max: number[];
    uv_index_max: number[];
  };
  hourly?: {
    time: string[];
    soil_moisture_0_to_7cm: number[];
    soil_temperature_6cm: number[];
    relative_humidity_2m: number[];
  };
  estado?: 'disponivel' | 'atrasado';
  observadoEm?: string;
  coletadoEm?: string;
  emitidoEm?: string | null;
  validoAte?: string;
  fonte: 'api' | 'cache' | 'fallback';
  atualizadoEm: string;
}

export interface OpenMeteoHistorical {
  latitude: number;
  longitude: number;
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    et0_fao_evapotranspiration: number[];
  };
  estado?: 'disponivel' | 'atrasado';
  observadoEm?: string;
  coletadoEm?: string;
  emitidoEm?: string | null;
  validoAte?: string;
  fonte: 'api' | 'cache' | 'fallback';
  atualizadoEm: string;
}

export interface OpenMeteoCurrent {
  temperature: number;
  humidity: number;
  precipitation: number;
  rain: number;
  weatherCode: number;
  windSpeed: number;
  windDirection: number;
  estado?: 'disponivel' | 'atrasado';
  observadoEm?: string;
  coletadoEm?: string;
  emitidoEm?: string | null;
  validoAte?: string;
  fonte: 'api' | 'cache' | 'fallback';
}

// ── Service Class ───────────────────────────────────────────

export class OpenMeteoService {
  private readonly observations = new LastObservationStore('openmeteo');
  private http: AxiosInstance;
  private archiveHttp: AxiosInstance;
  private cache: NodeCache;
  private dsm: DataSourceManager;

  constructor(dsm: DataSourceManager) {
    this.dsm = dsm;
    this.cache = new NodeCache({ stdTTL: 1800, checkperiod: 60 });
    this.http = axios.create({
      baseURL: 'https://api.open-meteo.com/v1/',
      timeout: 10000,
    });
    this.archiveHttp = axios.create({
      baseURL: 'https://archive-api.open-meteo.com/v1/',
      timeout: 15000,
    });
  }

  async getForecast(lat: number, lon: number, days: number = 7): Promise<OpenMeteoForecast> {
    const cacheKey = `openmeteo_forecast_${lat}_${lon}_${days}`;
    const cached = this.cache.get<OpenMeteoForecast>(cacheKey);
    if (cached) {
      return { ...cached, fonte: 'cache' };
    }

    const start = Date.now();
    try {
      const params = {
        latitude: lat,
        longitude: lon,
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,et0_fao_evapotranspiration,windspeed_10m_max,uv_index_max',
        hourly: 'soil_moisture_0_to_7cm,soil_temperature_6cm,relative_humidity_2m',
        timezone: 'America/Sao_Paulo',
        forecast_days: days,
      };

      const response = await this.http.get('forecast', { params });
      const data = response.data;
      if (!Array.isArray(data?.daily?.time) || !data.daily.time.length || !data.daily.time.every((d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) || params.daily.split(',').some(key => !Array.isArray(data.daily[key]) || data.daily[key].length !== data.daily.time.length || !data.daily[key].every((v: unknown) => typeof v === 'number' && Number.isFinite(v)))) {
        throw new Error('Resposta meteorológica sem observações válidas');
      }

      const result: OpenMeteoForecast = {
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
        daily: data.daily,
        validoAte: data.daily.time.at(-1),
        coletadoEm: new Date().toISOString(),
        emitidoEm: null,
        hourly: data.hourly,
        fonte: 'api',
        atualizadoEm: new Date().toISOString(),
      };

      this.observations.set(cacheKey, result);

      this.cache.set(cacheKey, result);
      this.dsm.updateSourceStatus('openmeteo_forecast', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const last = this.observations.get<any>(cacheKey);
      if (last) {
        this.dsm.updateSourceStatus('openmeteo_forecast', 'degraded', Date.now() - start, 'Última previsão real preservada; atualização falhou');
        return { ...last, fonte: 'cache', estado: 'atrasado' };
      }
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[OpenMeteo] Forecast falhou para ${lat},${lon}: ${msg}`);
      this.dsm.updateSourceStatus('openmeteo_forecast', 'degraded', Date.now() - start, msg);

      throw new Error('Previsão meteorológica indisponível: nenhuma previsão real foi recebida.');
    }
  }

  async getCurrent(lat: number, lon: number): Promise<OpenMeteoCurrent> {
    const cacheKey = `openmeteo_current_${lat}_${lon}`;
    const cached = this.cache.get<OpenMeteoCurrent>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const start = Date.now();
    try {
      const params = {
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m',
        timezone: 'America/Sao_Paulo',
      };

      const response = await this.http.get('forecast', { params });
      const c = response.data.current;
      const observadoEm = observationInstant(c?.time, response.data.utc_offset_seconds);
      if (!c || !observadoEm || params.current.split(',').some(key => !Number.isFinite(c[key]))) {
        throw new Error('Condições meteorológicas inválidas');
      }

      const result: OpenMeteoCurrent = {
        observadoEm,
        coletadoEm: new Date().toISOString(),
        temperature: c.temperature_2m,
        humidity: c.relative_humidity_2m,
        precipitation: c.precipitation,
        rain: c.rain,
        weatherCode: c.weather_code,
        windSpeed: c.wind_speed_10m,
        windDirection: c.wind_direction_10m,
        fonte: 'api',
      };

      this.observations.set(cacheKey, result);

      this.cache.set(cacheKey, result, 900); // 15 min TTL
      this.dsm.updateSourceStatus('openmeteo_forecast', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const last = this.observations.get<any>(cacheKey);
      if (last && typeof last.observadoEm === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(last.observadoEm)) {
        this.dsm.updateSourceStatus('openmeteo_forecast', 'degraded', Date.now() - start, 'Última previsão real preservada; atualização falhou');
        return { ...last, fonte: 'cache', estado: 'atrasado' };
      }
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.dsm.updateSourceStatus('openmeteo_forecast', 'degraded', Date.now() - start, msg);
      throw new Error('Condições meteorológicas atuais indisponíveis.');
    }
  }

  async getHistorical(lat: number, lon: number, startDate: string, endDate: string): Promise<OpenMeteoHistorical> {
    const cacheKey = `openmeteo_hist_${lat}_${lon}_${startDate}_${endDate}`;
    const cached = this.cache.get<OpenMeteoHistorical>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const start = Date.now();
    try {
      const params = {
        latitude: lat,
        longitude: lon,
        start_date: startDate,
        end_date: endDate,
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration',
        timezone: 'America/Sao_Paulo',
      };

      const response = await this.archiveHttp.get('archive', { params });
      const data = response.data;
      if (!Array.isArray(data?.daily?.time) || !data.daily.time.length || !data.daily.time.every((d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) || params.daily.split(',').some(key => !Array.isArray(data.daily[key]) || data.daily[key].length !== data.daily.time.length || !data.daily[key].every((v: unknown) => typeof v === 'number' && Number.isFinite(v)))) {
        throw new Error('Resposta meteorológica sem observações válidas');
      }

      const result: OpenMeteoHistorical = {
        latitude: data.latitude,
        longitude: data.longitude,
        daily: data.daily,
        validoAte: data.daily.time.at(-1),
        coletadoEm: new Date().toISOString(),
        emitidoEm: null,
        fonte: 'api',
        atualizadoEm: new Date().toISOString(),
      };

      this.observations.set(cacheKey, result);

      this.cache.set(cacheKey, result, 86400); // 24h cache for historical
      this.dsm.updateSourceStatus('openmeteo_forecast', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const last = this.observations.get<any>(cacheKey);
      if (last) {
        this.dsm.updateSourceStatus('openmeteo_forecast', 'degraded', Date.now() - start, 'Última previsão real preservada; atualização falhou');
        return { ...last, fonte: 'cache', estado: 'atrasado' };
      }
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[OpenMeteo] Historical falhou: ${msg}`);
      return {
        latitude: lat,
        longitude: lon,
        daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [], et0_fao_evapotranspiration: [] },
        fonte: 'fallback',
        atualizadoEm: new Date().toISOString(),
      };
    }
  }

}

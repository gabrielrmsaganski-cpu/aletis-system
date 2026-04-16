// ============================================================
// ALETIS — Open-Meteo Weather Service
// Free, no-auth weather API with agricultural parameters
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import type { DataSourceManager } from '../DataSourceManager.js';

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
  fonte: 'api' | 'cache' | 'fallback';
}

// ── Service Class ───────────────────────────────────────────

export class OpenMeteoService {
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
      this.dsm.updateSourceStatus('openmeteo_forecast', 'online', 0);
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

      const result: OpenMeteoForecast = {
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
        daily: data.daily,
        hourly: data.hourly,
        fonte: 'api',
        atualizadoEm: new Date().toISOString(),
      };

      this.cache.set(cacheKey, result);
      this.dsm.updateSourceStatus('openmeteo_forecast', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[OpenMeteo] Forecast falhou para ${lat},${lon}: ${msg}`);
      this.dsm.updateSourceStatus('openmeteo_forecast', 'degraded', Date.now() - start, msg);

      return this.generateFallbackForecast(lat, lon, days);
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

      const result: OpenMeteoCurrent = {
        temperature: c.temperature_2m,
        humidity: c.relative_humidity_2m,
        precipitation: c.precipitation,
        rain: c.rain,
        weatherCode: c.weather_code,
        windSpeed: c.wind_speed_10m,
        windDirection: c.wind_direction_10m,
        fonte: 'api',
      };

      this.cache.set(cacheKey, result, 900); // 15 min TTL
      this.dsm.updateSourceStatus('openmeteo_forecast', 'online', Date.now() - start);
      return result;
    } catch (error) {
      return {
        temperature: 25 + (lat + 15) * 0.3,
        humidity: 65,
        precipitation: 0,
        rain: 0,
        weatherCode: 1,
        windSpeed: 8,
        windDirection: 180,
        fonte: 'fallback',
      };
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

      const result: OpenMeteoHistorical = {
        latitude: data.latitude,
        longitude: data.longitude,
        daily: data.daily,
        fonte: 'api',
        atualizadoEm: new Date().toISOString(),
      };

      this.cache.set(cacheKey, result, 86400); // 24h cache for historical
      this.dsm.updateSourceStatus('openmeteo_forecast', 'online', Date.now() - start);
      return result;
    } catch (error) {
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

  private generateFallbackForecast(lat: number, lon: number, days: number): OpenMeteoForecast {
    const time: string[] = [];
    const tMax: number[] = [];
    const tMin: number[] = [];
    const precip: number[] = [];
    const rain: number[] = [];
    const et0: number[] = [];
    const wind: number[] = [];
    const uv: number[] = [];

    const now = new Date();
    const baseTempMax = 28 + (lat + 15) * 0.4;
    const baseTempMin = baseTempMax - 10;

    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      time.push(d.toISOString().slice(0, 10));

      const variation = Math.sin(i * 0.8) * 3;
      tMax.push(Math.round((baseTempMax + variation) * 10) / 10);
      tMin.push(Math.round((baseTempMin + variation) * 10) / 10);
      precip.push(Math.round(Math.random() * 15 * 10) / 10);
      rain.push(precip[i] * 0.9);
      et0.push(Math.round((3.5 + Math.random() * 2) * 10) / 10);
      wind.push(Math.round((5 + Math.random() * 15) * 10) / 10);
      uv.push(Math.round((4 + Math.random() * 8) * 10) / 10);
    }

    return {
      latitude: lat,
      longitude: lon,
      timezone: 'America/Sao_Paulo',
      daily: {
        time,
        temperature_2m_max: tMax,
        temperature_2m_min: tMin,
        precipitation_sum: precip,
        rain_sum: rain,
        et0_fao_evapotranspiration: et0,
        windspeed_10m_max: wind,
        uv_index_max: uv,
      },
      fonte: 'fallback',
      atualizadoEm: new Date().toISOString(),
    };
  }
}

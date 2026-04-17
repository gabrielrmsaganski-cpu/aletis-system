// ============================================================
// ALETIS — NASA FIRMS Fire Hotspot Service
// Active fire detections from VIIRS (Suomi NPP) satellite
// Source: https://firms.modaps.eosdis.nasa.gov (free, no API key)
// Data: 24h active fires for South America, filtered to Brazil
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface FocoIncendio {
  latitude: number;
  longitude: number;
  brilho: number;
  potencia: number; // FRP (Fire Radiative Power) in MW
  confianca: string;
  data: string;
  hora: string;
  diurno: boolean;
}

export interface IncendiosResumo {
  totalFocos: number;
  focosUltimas24h: number;
  porRegiao: Record<string, number>;
  porEstado: Record<string, number>;
  maioresIncendios: FocoIncendio[];
  centroide: { lat: number; lng: number };
  fonte: 'api' | 'cache' | 'fallback';
  atualizadoEm: string;
}

// ── Brazil Bounding Box ─────────────────────────────────────

const BRAZIL_BOUNDS = {
  latMin: -33.75, latMax: 5.27,
  lonMin: -73.99, lonMax: -34.79,
};

// ── Approximate UF from coordinates ─────────────────────────
// Simplified: uses center-of-mass rectangles per state

const UF_BOXES: { uf: string; latMin: number; latMax: number; lonMin: number; lonMax: number }[] = [
  { uf: 'AM', latMin: -9.82, latMax: 2.22, lonMin: -73.99, lonMax: -56.10 },
  { uf: 'PA', latMin: -9.39, latMax: 2.59, lonMin: -58.90, lonMax: -46.06 },
  { uf: 'MT', latMin: -18.04, latMax: -7.35, lonMin: -61.63, lonMax: -50.22 },
  { uf: 'GO', latMin: -19.50, latMax: -12.40, lonMin: -53.25, lonMax: -45.91 },
  { uf: 'TO', latMin: -13.47, latMax: -5.17, lonMin: -50.73, lonMax: -45.72 },
  { uf: 'MA', latMin: -10.26, latMax: -1.05, lonMin: -48.76, lonMax: -41.82 },
  { uf: 'MG', latMin: -22.92, latMax: -14.24, lonMin: -51.05, lonMax: -39.86 },
  { uf: 'BA', latMin: -18.35, latMax: -8.53, lonMin: -46.62, lonMax: -37.34 },
  { uf: 'MS', latMin: -24.07, latMax: -17.17, lonMin: -57.79, lonMax: -50.93 },
  { uf: 'SP', latMin: -25.31, latMax: -19.78, lonMin: -53.11, lonMax: -44.16 },
  { uf: 'PR', latMin: -26.72, latMax: -22.52, lonMin: -54.62, lonMax: -48.02 },
  { uf: 'RS', latMin: -33.75, latMax: -27.08, lonMin: -57.64, lonMax: -49.69 },
  { uf: 'SC', latMin: -29.39, latMax: -25.96, lonMin: -53.83, lonMax: -48.56 },
  { uf: 'PI', latMin: -10.93, latMax: -2.74, lonMin: -45.99, lonMax: -40.37 },
  { uf: 'RO', latMin: -13.69, latMax: -7.97, lonMin: -66.62, lonMax: -59.77 },
  { uf: 'AC', latMin: -11.14, latMax: -7.11, lonMin: -73.99, lonMax: -66.62 },
  { uf: 'RR', latMin: 0.00, latMax: 5.27, lonMin: -64.82, lonMax: -58.88 },
  { uf: 'AP', latMin: -1.24, latMax: 4.44, lonMin: -54.87, lonMax: -49.88 },
  { uf: 'CE', latMin: -7.86, latMax: -2.78, lonMin: -41.42, lonMax: -37.25 },
  { uf: 'RN', latMin: -6.98, latMax: -4.83, lonMin: -38.58, lonMax: -34.95 },
  { uf: 'PB', latMin: -8.31, latMax: -6.03, lonMin: -38.77, lonMax: -34.79 },
  { uf: 'PE', latMin: -9.48, latMax: -7.33, lonMin: -41.36, lonMax: -34.86 },
  { uf: 'AL', latMin: -10.50, latMax: -8.81, lonMin: -37.94, lonMax: -35.16 },
  { uf: 'SE', latMin: -11.57, latMax: -9.51, lonMin: -38.25, lonMax: -36.39 },
  { uf: 'RJ', latMin: -23.37, latMax: -20.76, lonMin: -44.89, lonMax: -40.96 },
  { uf: 'ES', latMin: -21.30, latMax: -17.89, lonMin: -41.88, lonMax: -39.67 },
  { uf: 'DF', latMin: -16.05, latMax: -15.50, lonMin: -48.29, lonMax: -47.31 },
];

const REGIAO_MAP: Record<string, string> = {
  AM: 'Norte', PA: 'Norte', RO: 'Norte', AC: 'Norte', RR: 'Norte', AP: 'Norte', TO: 'Norte',
  MA: 'Nordeste', PI: 'Nordeste', CE: 'Nordeste', RN: 'Nordeste', PB: 'Nordeste',
  PE: 'Nordeste', AL: 'Nordeste', SE: 'Nordeste', BA: 'Nordeste',
  MG: 'Sudeste', SP: 'Sudeste', RJ: 'Sudeste', ES: 'Sudeste',
  PR: 'Sul', SC: 'Sul', RS: 'Sul',
  MT: 'Centro-Oeste', MS: 'Centro-Oeste', GO: 'Centro-Oeste', DF: 'Centro-Oeste',
};

function getUFFromCoords(lat: number, lon: number): string {
  for (const box of UF_BOXES) {
    if (lat >= box.latMin && lat <= box.latMax && lon >= box.lonMin && lon <= box.lonMax) {
      return box.uf;
    }
  }
  return 'Outro';
}

// ── Service Class ────────────────────────────────────────────

export class NasaFirmsService {
  private readonly cache: NodeCache;
  private readonly http: AxiosInstance;
  private readonly manager: DataSourceManager;

  constructor(manager: DataSourceManager) {
    this.manager = manager;

    this.cache = new NodeCache({
      stdTTL: 1800, // fires update every 3h, cache 30min
      checkperiod: 300,
      useClones: false,
    });

    this.http = axios.create({
      timeout: 20000, // large file
      headers: {
        'User-Agent': 'ALETIS-System/1.0',
        'Accept': 'text/csv,*/*',
      },
    });
  }

  // ── Public: Get Fire Hotspots Summary for Brazil ───────────

  async getIncendiosBrasil(): Promise<IncendiosResumo> {
    const cacheKey = 'firms_brasil';
    const cached = this.cache.get<IncendiosResumo>(cacheKey);
    if (cached) {
      console.log('[FIRMS] Incêndios Brasil retornados do cache');
      return { ...cached, fonte: 'cache' };
    }

    const startTime = Date.now();
    try {
      console.log('[FIRMS] Baixando dados de focos ativos (24h, South America)...');
      const response = await this.http.get(
        'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_24h.csv',
        { responseType: 'text' }
      );
      const latencia = Date.now() - startTime;

      const lines = (response.data as string).split('\n');
      console.log(`[FIRMS] CSV baixado: ${lines.length} linhas em ${latencia}ms`);

      // Parse and filter for Brazil
      const focos: FocoIncendio[] = [];
      const porEstado: Record<string, number> = {};
      const porRegiao: Record<string, number> = {};

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 13) continue;

        const lat = parseFloat(cols[0]);
        const lon = parseFloat(cols[1]);

        // Filter for Brazil bounding box
        if (lat < BRAZIL_BOUNDS.latMin || lat > BRAZIL_BOUNDS.latMax) continue;
        if (lon < BRAZIL_BOUNDS.lonMin || lon > BRAZIL_BOUNDS.lonMax) continue;

        const brilho = parseFloat(cols[2]);
        const data = cols[5];
        const hora = cols[6];
        const confianca = cols[8];
        const frp = parseFloat(cols[11]);
        const diurno = cols[12]?.trim() === 'D';

        const foco: FocoIncendio = {
          latitude: lat, longitude: lon,
          brilho, potencia: isNaN(frp) ? 0 : frp,
          confianca, data, hora, diurno,
        };
        focos.push(foco);

        const uf = getUFFromCoords(lat, lon);
        porEstado[uf] = (porEstado[uf] || 0) + 1;
        const regiao = REGIAO_MAP[uf] || 'Outro';
        porRegiao[regiao] = (porRegiao[regiao] || 0) + 1;
      }

      // Top 10 fires by FRP
      const maioresIncendios = focos
        .sort((a, b) => b.potencia - a.potencia)
        .slice(0, 10);

      // Centroid
      const centroide = focos.length > 0
        ? {
            lat: focos.reduce((s, f) => s + f.latitude, 0) / focos.length,
            lng: focos.reduce((s, f) => s + f.longitude, 0) / focos.length,
          }
        : { lat: -14.24, lng: -51.93 }; // Brazil center

      const result: IncendiosResumo = {
        totalFocos: focos.length,
        focosUltimas24h: focos.length,
        porRegiao,
        porEstado,
        maioresIncendios,
        centroide,
        fonte: 'api',
        atualizadoEm: new Date().toISOString(),
      };

      this.manager.updateSourceStatus('nasa_firms', 'online', latencia);
      this.cache.set(cacheKey, result, 1800);
      console.log(`[FIRMS] ${focos.length} focos de incêndio no Brasil em ${latencia}ms`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('nasa_firms', 'offline', latencia, msg);
      console.warn(`[FIRMS] Erro: ${msg}. Usando fallback.`);

      // Minimal fallback
      const fallback: IncendiosResumo = {
        totalFocos: 0,
        focosUltimas24h: 0,
        porRegiao: {},
        porEstado: {},
        maioresIncendios: [],
        centroide: { lat: -14.24, lng: -51.93 },
        fonte: 'fallback',
        atualizadoEm: new Date().toISOString(),
      };
      this.cache.set(cacheKey, fallback, 300);
      return fallback;
    }
  }

  // ── Public: Get Fires Near a Coordinate ────────────────────

  async getIncendiosProximos(lat: number, lon: number, raioKm: number = 100): Promise<{
    focos: FocoIncendio[];
    totalProximo: number;
    risco: 'baixo' | 'medio' | 'alto' | 'critico';
    fonte: 'api' | 'cache' | 'fallback';
  }> {
    const resumo = await this.getIncendiosBrasil();

    if (resumo.fonte === 'fallback') {
      return { focos: [], totalProximo: 0, risco: 'baixo', fonte: 'fallback' };
    }

    // Re-fetch to get all focos (not just top 10)
    const allFocos = await this.getAllFocos();

    const proximos = allFocos.filter(f => {
      const dist = this.haversineKm(lat, lon, f.latitude, f.longitude);
      return dist <= raioKm;
    });

    const risco = proximos.length === 0 ? 'baixo'
      : proximos.length <= 5 ? 'medio'
      : proximos.length <= 20 ? 'alto'
      : 'critico';

    return {
      focos: proximos.slice(0, 20),
      totalProximo: proximos.length,
      risco,
      fonte: resumo.fonte,
    };
  }

  // ── Private: Get all Brazil focos ──────────────────────────

  private async getAllFocos(): Promise<FocoIncendio[]> {
    const cacheKey = 'firms_all_focos';
    const cached = this.cache.get<FocoIncendio[]>(cacheKey);
    if (cached) return cached;

    const response = await this.http.get(
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_24h.csv',
      { responseType: 'text' }
    );

    const lines = (response.data as string).split('\n');
    const focos: FocoIncendio[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 13) continue;

      const lat = parseFloat(cols[0]);
      const lon = parseFloat(cols[1]);

      if (lat < BRAZIL_BOUNDS.latMin || lat > BRAZIL_BOUNDS.latMax) continue;
      if (lon < BRAZIL_BOUNDS.lonMin || lon > BRAZIL_BOUNDS.lonMax) continue;

      focos.push({
        latitude: lat, longitude: lon,
        brilho: parseFloat(cols[2]),
        potencia: parseFloat(cols[11]) || 0,
        confianca: cols[8],
        data: cols[5], hora: cols[6],
        diurno: cols[12]?.trim() === 'D',
      });
    }

    this.cache.set(cacheKey, focos, 1800);
    return focos;
  }

  // ── Private: Haversine Distance ────────────────────────────

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

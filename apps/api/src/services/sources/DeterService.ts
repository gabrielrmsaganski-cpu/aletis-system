// ============================================================
// ALETIS — INPE/DETER Deforestation Alerts Service
// ============================================================
//
// Provides access to INPE's DETER-AMZ (Amazonia) and DETER-CER
// (Cerrado) near-real-time deforestation alerts. Essential for
// compliance with Resolucao CMN n.o 5.081/2023 (and 2024-26
// regulamentations) which requires credit rural applicants to
// prove absence of recent deforestation in the beneficiary
// property.
//
// Primary source: INPE TerraBrasilis
//   WFS: https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/
//   Download: https://terrabrasilis.dpi.inpe.br/file-delivery/download/
//
// Fallback: apps/api/storage/deter_fallback.json (curated)
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { DataSourceManager } from '../DataSourceManager.js';
import type {
  AlertaDesmatamento,
  AlertasDesmatamento,
  ResumoDesmatamento,
  BiomaDesmatamento,
  ClasseDesmatamento,
  FonteDesmatamento,
} from '@aletis/shared-types/src/desmatamento.js';

// ── Paths & constants ───────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FALLBACK_PATH = join(__dirname, '../../../storage/deter_fallback.json');

const TERRABRASILIS_WFS_AMZ =
  'https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/deter_amz/wfs';
const TERRABRASILIS_WFS_CER =
  'https://terrabrasilis.dpi.inpe.br/geoserver/deter-cerrado/deter_cerrado/wfs';

// Map of DETER class codes to our domain model.
const CLASSE_MAP: Record<string, ClasseDesmatamento> = {
  DESMATAMENTO_CR: 'CORTE_RASO',
  CORTE_RASO: 'CORTE_RASO',
  DESMATAMENTO: 'CORTE_RASO',
  DEGRADACAO: 'DEGRADACAO',
  DG: 'DEGRADACAO',
  MINERACAO: 'MINERACAO',
  CICATRIZ_QUEIMADA: 'CICATRIZ_QUEIMADA',
  CQ: 'CICATRIZ_QUEIMADA',
};

function mapClasse(raw: string | null | undefined): ClasseDesmatamento {
  if (!raw) return 'OUTRO';
  const up = String(raw).toUpperCase().replace(/\s+/g, '_');
  return CLASSE_MAP[up] ?? 'OUTRO';
}

// ── Fallback type (loosely structured) ──────────────────────

interface FallbackData {
  atualizadoEm: string;
  periodo: string;
  alertasPorMunicipio: Record<string, AlertaDesmatamento[]>;
  resumoNacional: {
    totalAlertas: number;
    areaTotalHa: number;
    porBioma: { bioma: BiomaDesmatamento; areaHa: number; alertas: number }[];
    porUF: { uf: string; areaHa: number; alertas: number }[];
    topMunicipios: { codigoIbge: string; municipio: string; uf: string; areaHa: number }[];
  };
  municipiosEmbargados: string[];
}

// ── Service ────────────────────────────────────────────────

export class DeterService {
  private readonly cache: NodeCache;
  private readonly http: AxiosInstance;
  private readonly manager: DataSourceManager;
  private fallback: FallbackData | null = null;

  constructor(manager: DataSourceManager) {
    this.manager = manager;
    this.cache = new NodeCache({ stdTTL: 21600, checkperiod: 3600, useClones: false });
    this.http = axios.create({
      timeout: 12_000,
      headers: {
        'User-Agent': 'ALETIS-System/1.0 (+https://aletis.com.br)',
        Accept: 'application/json',
      },
    });
  }

  // ── Public: per-municipality alerts ──────────────────────

  async buscarAlertasPorMunicipio(
    codigoIbge: string,
    dataInicio?: string,
    dataFim?: string
  ): Promise<AlertasDesmatamento> {
    const cacheKey = `deter_mun_${codigoIbge}_${dataInicio ?? ''}_${dataFim ?? ''}`;
    const cached = this.cache.get<AlertasDesmatamento>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const start = Date.now();
    try {
      // WFS CQL filter: DETER exposes the attribute "municipality" (ibge) in some layers.
      // The schema evolves; we accept either "municipali" (truncated) or "cd_geocmu".
      const cql =
        `(cd_geocmu='${codigoIbge}' OR municipali='${codigoIbge}')` +
        (dataInicio ? ` AND view_date>=${dataInicio}` : '') +
        (dataFim ? ` AND view_date<=${dataFim}` : '');

      const resp = await this.http.get(TERRABRASILIS_WFS_AMZ, {
        params: {
          service: 'WFS',
          version: '1.0.0',
          request: 'GetFeature',
          typeName: 'deter-amz:deter_amz',
          outputFormat: 'application/json',
          maxFeatures: 500,
          CQL_FILTER: cql,
        },
      });

      const features = resp.data?.features ?? [];
      const alertas = features.map((f: any) => this.featureToAlerta(f, 'Amazônia'));

      const result = this.buildAlertasAggregate(alertas, codigoIbge);
      this.cache.set(cacheKey, result);
      this.manager.updateSourceStatus('inpe_deter', 'online', Date.now() - start);
      return { ...result, fonte: 'api' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[DETER] WFS falhou para ${codigoIbge}: ${msg}. Usando fallback.`);
      this.manager.updateSourceStatus('inpe_deter', 'degraded', Date.now() - start, msg);
      return this.fallbackPorMunicipio(codigoIbge);
    }
  }

  // ── Public: per-CAR alerts (501 if not implementable) ───

  async buscarAlertasPorImovelCAR(numeroCAR: string): Promise<AlertasDesmatamento> {
    // Proper implementation requires spatial intersection between a CAR
    // polygon and the DETER alert polygons — the CAR shape needs to come
    // from SICAR (another service). For now we return an empty aggregate
    // with a clear bloqueio explaining what the integration needs.
    return {
      alertas: [],
      total: 0,
      areaTotalHa: 0,
      bloqueios: [
        `Integração CAR x DETER ainda não implementada. numeroCAR=${numeroCAR}. ` +
          `Requer shape do CAR via SICAR para intersecção com alertas DETER.`,
      ],
      atualizadoEm: new Date().toISOString(),
      fonte: 'fallback',
    };
  }

  // ── Public: national summary ─────────────────────────────

  async resumoNacional(periodo?: string): Promise<ResumoDesmatamento> {
    const cacheKey = `deter_resumo_${periodo ?? 'default'}`;
    const cached = this.cache.get<ResumoDesmatamento>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    // The national summary typically comes from INPE's PRODES yearly release
    // (a PDF/CSV) or the TerraBrasilis REST endpoint. Here we prefer the
    // curated fallback since aggregating WFS over all biomes is heavy.
    const fb = this.loadFallback();
    const start = Date.now();
    try {
      // Minimal live probe — fetch a small slice from AMZ WFS to confirm the
      // source is responsive and not stale. If it fails, we still return the
      // curated dataset and flag source as degraded.
      await this.http.get(TERRABRASILIS_WFS_AMZ, {
        params: {
          service: 'WFS',
          version: '1.0.0',
          request: 'GetFeature',
          typeName: 'deter-amz:deter_amz',
          outputFormat: 'application/json',
          maxFeatures: 1,
        },
        timeout: 6000,
      });
      this.manager.updateSourceStatus('inpe_deter', 'online', Date.now() - start);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('inpe_deter', 'degraded', Date.now() - start, msg);
    }

    const result: ResumoDesmatamento = {
      periodo: periodo ?? fb.periodo,
      areaTotalHa: fb.resumoNacional.areaTotalHa,
      totalAlertas: fb.resumoNacional.totalAlertas,
      porBioma: fb.resumoNacional.porBioma,
      porUF: fb.resumoNacional.porUF,
      topMunicipios: fb.resumoNacional.topMunicipios,
      atualizadoEm: fb.atualizadoEm,
      fonte: 'fallback',
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  // ── Private: load curated fallback (lazy) ────────────────

  private loadFallback(): FallbackData {
    if (this.fallback) return this.fallback;
    try {
      const raw = readFileSync(FALLBACK_PATH, 'utf8');
      this.fallback = JSON.parse(raw) as FallbackData;
      return this.fallback;
    } catch (error) {
      console.warn(
        `[DETER] Nao foi possivel carregar fallback (${FALLBACK_PATH}): ${String(error)}`
      );
      // Last-resort empty structure
      this.fallback = {
        atualizadoEm: new Date().toISOString(),
        periodo: 'n/d',
        alertasPorMunicipio: {},
        resumoNacional: {
          totalAlertas: 0,
          areaTotalHa: 0,
          porBioma: [],
          porUF: [],
          topMunicipios: [],
        },
        municipiosEmbargados: [],
      };
      return this.fallback;
    }
  }

  // ── Private: fallback for municipio ──────────────────────

  private fallbackPorMunicipio(codigoIbge: string): AlertasDesmatamento {
    const fb = this.loadFallback();
    const alertas = fb.alertasPorMunicipio[codigoIbge] ?? [];
    return this.buildAlertasAggregate(alertas, codigoIbge, 'fallback');
  }

  // ── Private: build aggregate from alert list ─────────────

  private buildAlertasAggregate(
    alertas: AlertaDesmatamento[],
    codigoIbge: string,
    fonte: 'api' | 'cache' | 'fallback' = 'api'
  ): AlertasDesmatamento {
    const fb = this.loadFallback();
    const bloqueios: string[] = [];
    if (fb.municipiosEmbargados.includes(codigoIbge)) {
      bloqueios.push(
        'Município consta na lista de embargos IBAMA/INPE — restrições para concessão de crédito rural.'
      );
    }
    const recenteLimite = Date.now() - 365 * 24 * 3600 * 1000;
    const recentes = alertas.filter(
      (a) => new Date(a.dataDeteccao).getTime() >= recenteLimite
    );
    if (recentes.length > 0) {
      bloqueios.push(
        `${recentes.length} alerta(s) de desmatamento nos últimos 12 meses — pode comprometer Pronaf/Pronamp (Res. CMN 5.081/2023).`
      );
    }

    const areaTotalHa = alertas.reduce((s, a) => s + (a.areaHa || 0), 0);

    return {
      alertas,
      total: alertas.length,
      areaTotalHa: Math.round(areaTotalHa * 100) / 100,
      bloqueios,
      atualizadoEm: new Date().toISOString(),
      fonte,
    };
  }

  // ── Private: convert WFS feature to domain alerta ────────

  private featureToAlerta(
    feature: any,
    biomaDefault: BiomaDesmatamento
  ): AlertaDesmatamento {
    const props = feature?.properties ?? {};
    const geom = feature?.geometry;
    let lat: number | undefined;
    let lon: number | undefined;
    if (geom?.coordinates) {
      const flat = JSON.stringify(geom.coordinates).match(/-?\d+\.?\d*/g);
      if (flat && flat.length >= 2) {
        // coordinates are [lon, lat]
        lon = parseFloat(flat[0]);
        lat = parseFloat(flat[1]);
      }
    }
    const fonte: FonteDesmatamento = 'DETER';
    return {
      id: String(props.id ?? props.uid ?? feature.id ?? `${Date.now()}-${Math.random()}`),
      dataDeteccao: String(props.view_date ?? props.date ?? props.dataDeteccao ?? '')
        .slice(0, 10),
      bioma: (props.bioma as BiomaDesmatamento) ?? biomaDefault,
      uf: String(props.uf ?? props.uf_sigla ?? ''),
      codigoIbge: props.cd_geocmu ?? props.municipali ?? undefined,
      areaHa: Number(props.areatotalha ?? props.areamunkm ?? props.area_ha ?? 0),
      classe: mapClasse(props.classname ?? props.classe ?? props.class_name),
      fonte,
      latitude: lat,
      longitude: lon,
    };
  }
}

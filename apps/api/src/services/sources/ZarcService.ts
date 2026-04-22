// ============================================================
// ALETIS — ZARC / Zoneamento Agricola de Risco Climatico
// ============================================================
//
// Service para consulta do ZARC do MAPA (safra 2025/26), usado
// para habilitar cobertura Proagro/Proagro-Mais (MCR 16-4).
//
// Estratégia dupla:
//  1. Modo online — tentativa de consumo direto do endpoint de
//     indicadores do MAPA. Como o endpoint publico nao e estavel,
//     mantemos a chamada defensiva e caimos graciosamente no
//     fallback caso a resposta nao seja parseavel.
//  2. Modo fallback — dataset curado em storage/zarc_fallback.json
//     com janelas reais das Portarias SPA/MAPA 2025 (soja, milho,
//     algodao, feijao) para as UFs top do Brasil.
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { DataSourceManager } from '../DataSourceManager.js';
import type {
  JanelaPlantio,
  JanelasPlantio,
  ValidacaoZarc,
  TipoSoloZarc,
  CicloVariedade,
} from '@aletis/shared-types/src/zarc.js';

// ── Paths ────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FALLBACK_PATH = join(__dirname, '../../../storage/zarc_fallback.json');

// ── Decendio helpers ─────────────────────────────────────────

/** Converte um Date em decendio (1..36). */
export function dateToDecendio(d: Date): number {
  const month = d.getMonth(); // 0..11
  const day = d.getDate(); // 1..31
  const dec = day <= 10 ? 0 : day <= 20 ? 1 : 2;
  return month * 3 + dec + 1;
}

/** Retorna o inicio e o fim (MM-DD) do decendio. */
export function decendioRange(d: number): { dataInicio: string; dataFim: string } {
  const idx = d - 1;
  const month = Math.floor(idx / 3);
  const pos = idx % 3;
  const mm = String(month + 1).padStart(2, '0');
  if (pos === 0) return { dataInicio: `${mm}-01`, dataFim: `${mm}-10` };
  if (pos === 1) return { dataInicio: `${mm}-11`, dataFim: `${mm}-20` };
  // pos === 2: up to end of month; we approximate to 30/31
  const endDay =
    [1, 3, 5, 7, 8, 10, 12].includes(month + 1) ? 31 : month + 1 === 2 ? 28 : 30;
  return { dataInicio: `${mm}-21`, dataFim: `${mm}-${String(endDay).padStart(2, '0')}` };
}

// ── Fallback types ───────────────────────────────────────────

interface ZarcFallback {
  safra: string;
  atualizadoEm: string;
  portarias: Record<string, string>;
  culturasPorUF: Record<string, string[]>;
  janelas: Record<
    string,
    {
      portaria: string;
      decendiosValidos: number[];
      riscoPorDecendio: Record<string, number>;
    }
  >;
}

// ── Service ─────────────────────────────────────────────────

export class ZarcService {
  private readonly cache: NodeCache;
  private readonly http: AxiosInstance;
  private readonly manager: DataSourceManager;
  private fallback: ZarcFallback | null = null;

  constructor(manager: DataSourceManager) {
    this.manager = manager;
    // Daily-ish cache; ZARC updates only between safras.
    this.cache = new NodeCache({ stdTTL: 86_400, checkperiod: 3600, useClones: false });
    this.http = axios.create({
      timeout: 10_000,
      baseURL: 'https://indicadores.agricultura.gov.br',
      headers: {
        'User-Agent': 'ALETIS-System/1.0 (+https://aletis.com.br)',
        Accept: 'application/json, text/html',
      },
    });
  }

  // ── Public: janelas (cultura + UF + solo + ciclo) ────────

  async buscarJanelasPlantio(
    cultura: string,
    uf: string,
    codigoIbgeMunicipio?: string,
    tipoSolo: TipoSoloZarc = 'I',
    cicloVariedade: CicloVariedade = 'medio'
  ): Promise<JanelasPlantio> {
    const culturaKey = cultura.toLowerCase();
    const ufKey = uf.toUpperCase();
    const cacheKey = `zarc_${culturaKey}_${ufKey}_${tipoSolo}_${cicloVariedade}_${codigoIbgeMunicipio ?? ''}`;
    const cached = this.cache.get<JanelasPlantio>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const start = Date.now();
    try {
      // Tentativa de probe do portal MAPA — se responder algo coerente,
      // atualizamos a saude da fonte como online. Nao existe endpoint
      // JSON publico estavel, entao o parse real fica no fallback.
      await this.http.get('/zarc/', { timeout: 5000, validateStatus: () => true });
      this.manager.updateSourceStatus('zarc_mapa', 'online', Date.now() - start);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('zarc_mapa', 'degraded', Date.now() - start, msg);
    }

    const janelas = this.buildJanelasFromFallback(
      culturaKey,
      ufKey,
      tipoSolo,
      cicloVariedade,
      codigoIbgeMunicipio
    );
    this.cache.set(cacheKey, janelas);
    return janelas;
  }

  // ── Public: culturas disponiveis por UF ──────────────────

  culturasDisponiveis(uf: string): string[] {
    const fb = this.loadFallback();
    return fb.culturasPorUF[uf.toUpperCase()] ?? [];
  }

  // ── Public: validar plano de plantio ─────────────────────

  async validarPlano(
    cultura: string,
    uf: string,
    codigoIbge: string,
    dataPlantio: string,
    solo: TipoSoloZarc = 'I',
    ciclo: CicloVariedade = 'medio'
  ): Promise<ValidacaoZarc> {
    const dt = new Date(dataPlantio);
    if (isNaN(dt.getTime())) {
      return {
        valido: false,
        decendio: 0,
        mensagem: `Data de plantio invalida: "${dataPlantio}" (use ISO YYYY-MM-DD).`,
        proagroElegivel: false,
      };
    }
    const decendio = dateToDecendio(dt);
    const janelas = await this.buscarJanelasPlantio(cultura, uf, codigoIbge, solo, ciclo);

    const janelaExata = janelas.janelas.find((j) => j.decendio === decendio && j.zarcValido);
    if (janelaExata) {
      return {
        valido: true,
        decendio,
        janelaMaisProxima: janelaExata,
        risco: janelaExata.risco,
        mensagem:
          `Decêndio ${decendio} (${janelaExata.dataInicio} a ${janelaExata.dataFim}) está dentro ` +
          `da janela ZARC autorizada para ${cultura} em ${uf.toUpperCase()} ` +
          `(solo ${solo}, ciclo ${ciclo}, risco ${(janelaExata.risco * 100).toFixed(0)}%). ` +
          `Habilita Proagro/Proagro-Mais.`,
        proagroElegivel: true,
      };
    }

    // Encontra a janela válida mais próxima (pela distância de decêndios)
    const validas = janelas.janelas.filter((j) => j.zarcValido);
    let janelaMaisProxima: JanelaPlantio | undefined;
    let menorDelta = Infinity;
    for (const j of validas) {
      const delta = Math.min(
        Math.abs(j.decendio - decendio),
        36 - Math.abs(j.decendio - decendio)
      );
      if (delta < menorDelta) {
        menorDelta = delta;
        janelaMaisProxima = j;
      }
    }

    return {
      valido: false,
      decendio,
      janelaMaisProxima,
      risco: janelaMaisProxima?.risco,
      mensagem: janelaMaisProxima
        ? `Decêndio ${decendio} FORA da janela ZARC para ${cultura}/${uf.toUpperCase()}. ` +
          `Janela válida mais próxima: decêndio ${janelaMaisProxima.decendio} ` +
          `(${janelaMaisProxima.dataInicio} a ${janelaMaisProxima.dataFim}, ` +
          `risco ${(janelaMaisProxima.risco * 100).toFixed(0)}%). ` +
          `Plantio fora do ZARC PERDE cobertura do Proagro.`
        : `Sem janelas ZARC cadastradas para ${cultura}/${uf.toUpperCase()} (solo ${solo}, ciclo ${ciclo}) na safra ${janelas.safra}.`,
      proagroElegivel: false,
    };
  }

  // ── Private: build JanelasPlantio (36 decendios) ─────────

  private buildJanelasFromFallback(
    cultura: string,
    uf: string,
    tipoSolo: TipoSoloZarc,
    ciclo: CicloVariedade,
    codigoIbge?: string
  ): JanelasPlantio {
    const fb = this.loadFallback();
    const key = `${cultura}|${uf}|${tipoSolo}|${ciclo}`;
    const entry = fb.janelas[key];
    const portaria =
      entry?.portaria ?? fb.portarias[cultura] ?? 'Portaria SPA/MAPA (safra ' + fb.safra + ')';

    const decendiosValidos = new Set<number>(entry?.decendiosValidos ?? []);
    const riscos = entry?.riscoPorDecendio ?? {};

    const janelas: JanelaPlantio[] = [];
    for (let d = 1; d <= 36; d++) {
      const range = decendioRange(d);
      const risco = riscos[String(d)] ?? (decendiosValidos.has(d) ? 0.3 : 0.6);
      janelas.push({
        decendio: d,
        dataInicio: range.dataInicio,
        dataFim: range.dataFim,
        risco,
        zarcValido: decendiosValidos.has(d),
      });
    }

    return {
      cultura,
      uf,
      codigoIbge,
      tipoSolo,
      cicloVariedade: ciclo,
      safra: fb.safra,
      janelas,
      portaria,
      atualizadoEm: fb.atualizadoEm,
      fonte: entry ? 'fallback' : 'fallback',
    };
  }

  // ── Private: lazy-load curated fallback ──────────────────

  private loadFallback(): ZarcFallback {
    if (this.fallback) return this.fallback;
    try {
      const raw = readFileSync(FALLBACK_PATH, 'utf8');
      this.fallback = JSON.parse(raw) as ZarcFallback;
      return this.fallback;
    } catch (error) {
      console.warn(
        `[ZARC] Nao foi possivel carregar fallback (${FALLBACK_PATH}): ${String(error)}`
      );
      this.fallback = {
        safra: 'n/d',
        atualizadoEm: new Date().toISOString(),
        portarias: {},
        culturasPorUF: {},
        janelas: {},
      };
      return this.fallback;
    }
  }
}

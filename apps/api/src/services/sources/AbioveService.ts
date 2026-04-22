// ============================================================
// ALETIS — ABIOVE / Moratoria da Soja
// ============================================================
//
// Fornece acesso ao status da Moratoria da Soja (ABIOVE/ANEC/GTS)
// e checagem de elegibilidade de municipios no bioma Amazonia.
// A moratoria veda a compra de soja de areas desmatadas no bioma
// Amazonia apos 22/07/2008 e e condicao comercial pelas tradings
// signatarias (Cargill, Bunge, ADM, Amaggi, LDC, COFCO).
//
// Fonte: dataset curado (storage/abiove_fallback.json) baseado
// em comunicados ABIOVE e monitoramento GTS. Nao ha API publica.
// ============================================================

import NodeCache from 'node-cache';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { DataSourceManager } from '../DataSourceManager.js';
import type {
  StatusMoratoria,
  ElegibilidadeMoratoria,
} from '@aletis/shared-types/src/abiove.js';

// ── Paths ────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FALLBACK_PATH = join(__dirname, '../../../storage/abiove_fallback.json');

interface AbioveFallback {
  status: StatusMoratoria;
  municipiosMonitorados: Record<
    string,
    { municipio: string; uf: string; bioma: string; noBiomaAmazonia: boolean }
  >;
  municipiosRestritos: string[];
  atualizadoEm: string;
}

// ── Service ─────────────────────────────────────────────────

export class AbioveService {
  private readonly cache: NodeCache;
  private readonly manager: DataSourceManager;
  private fallback: AbioveFallback | null = null;

  constructor(manager: DataSourceManager) {
    this.manager = manager;
    // Weekly cache — moratoria changes rarely.
    this.cache = new NodeCache({ stdTTL: 604_800, checkperiod: 86_400, useClones: false });
  }

  // ── Public: status atual da moratoria ────────────────────

  statusMoratoriaSoja(): StatusMoratoria {
    const cached = this.cache.get<StatusMoratoria>('abiove_status');
    if (cached) return cached;

    const start = Date.now();
    const fb = this.loadFallback();
    this.manager.updateSourceStatus('abiove_moratoria', 'online', Date.now() - start);
    this.cache.set('abiove_status', fb.status);
    return fb.status;
  }

  // ── Public: elegibilidade de um municipio ────────────────

  elegibilidadeImovel(
    codigoIbge: string,
    dataDesmatamentoDetectado?: string
  ): ElegibilidadeMoratoria {
    const fb = this.loadFallback();
    const mun = fb.municipiosMonitorados[codigoIbge];
    const base: Omit<ElegibilidadeMoratoria, 'elegivelAComprarSoja' | 'restricoes' | 'alternativas'> = mun
      ? {
          municipio: mun.municipio,
          codigoIbge,
          uf: mun.uf,
          noBiomaAmazonia: mun.noBiomaAmazonia,
        }
      : {
          municipio: 'Não monitorado',
          codigoIbge,
          uf: '',
          noBiomaAmazonia: false,
        };

    const restricoes: string[] = [];
    const alternativas: string[] = [];

    // Regra 1: se nao esta no bioma Amazonia, a Moratoria da Soja nao se aplica.
    if (!base.noBiomaAmazonia) {
      return {
        ...base,
        elegivelAComprarSoja: true,
        restricoes: [],
        alternativas: [
          'Moratória da Soja não se aplica a este município (fora do bioma Amazônia). ' +
            'Ainda assim, observe Código Florestal (Lei 12.651/2012) e compliance ambiental da trading.',
        ],
      };
    }

    // Regra 2: municipio na lista de restritos (historico de desmatamento > data-limite)
    if (fb.municipiosRestritos.includes(codigoIbge)) {
      restricoes.push(
        `Município consta na lista de áreas com desmatamento pós-${fb.status.dataLimite} monitoradas pela ABIOVE/GTS.`
      );
      alternativas.push(
        'Verifique se o imóvel específico (CAR) está na lista de bloqueio; fazendas em áreas antigas podem comercializar normalmente.',
        'Solicite auditoria GTS/ABIOVE para regularização caso a área desmatada tenha sido recuperada/averbada.'
      );
    }

    // Regra 3: data de desmatamento informada pelo cliente
    if (dataDesmatamentoDetectado) {
      const dtDesm = new Date(dataDesmatamentoDetectado);
      const dtLimite = new Date(fb.status.dataLimite);
      if (!isNaN(dtDesm.getTime()) && dtDesm > dtLimite) {
        restricoes.push(
          `Desmatamento detectado em ${dataDesmatamentoDetectado} — posterior à data-limite ${fb.status.dataLimite}. Soja desta área NÃO pode ser comprada por tradings signatárias.`
        );
        alternativas.push(
          'Comercialize a safra via compradores NÃO signatários (mercado interno regional) ou aguarde programa de regularização GTS.',
          'Considere conversão para outras culturas (milho, pastagem) até regularização ambiental.'
        );
      }
    }

    return {
      ...base,
      elegivelAComprarSoja: restricoes.length === 0,
      restricoes,
      alternativas,
    };
  }

  // ── Private ──────────────────────────────────────────────

  private loadFallback(): AbioveFallback {
    if (this.fallback) return this.fallback;
    try {
      const raw = readFileSync(FALLBACK_PATH, 'utf8');
      this.fallback = JSON.parse(raw) as AbioveFallback;
      return this.fallback;
    } catch (error) {
      console.warn(
        `[ABIOVE] Nao foi possivel carregar fallback (${FALLBACK_PATH}): ${String(error)}`
      );
      this.fallback = {
        status: {
          vigente: true,
          desde: '2006-07-24',
          ultimaRevisao: 'n/d',
          dataLimite: '2008-07-22',
          signatarios: [],
          fontes: [],
          observacoes: 'Dataset indisponivel — usando valores minimos.',
        },
        municipiosMonitorados: {},
        municipiosRestritos: [],
        atualizadoEm: new Date().toISOString(),
      };
      return this.fallback;
    }
  }
}

// ============================================================
// ALETIS — CONAB Preços Service
// Weekly commodity prices from CONAB Portal de Informações
// Source: https://portaldeinformacoes.conab.gov.br/downloads/arquivos/PrecosSemanalUF.txt
// Replaces broken CEPEA scraping with real government open data
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import { LastObservationStore } from './LastObservationStore.js';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface PrecoConab {
  produto: string;
  classificacao: string;
  uf: string;
  regiao: string;
  semana: string;
  nivelComercializacao: string;
  valorKg: number;
  valorSaca60kg: number;
  fonte: 'api' | 'cache' | 'fallback';
}

export interface PrecoConabResumo {
  produto: string;
  unidade: string;
  precoMedio: number;
  precoMinimo: number;
  precoMaximo: number;
  semana: string;
  estados: { uf: string; preco: number }[];
  fonte: 'api' | 'cache' | 'fallback';
  atualizadoEm: string;
  coletadoEm?: string;
  estado?: 'disponivel' | 'atrasado' | 'indisponivel';
  historico?: { data: string; valor: string; fonte: string; praca: string; unidade: string }[];
}

export interface PrecosConabCompleto {
  soja: PrecoConabResumo;
  milho: PrecoConabResumo;
  cafe_arabica: PrecoConabResumo;
  algodao: PrecoConabResumo;
  trigo: PrecoConabResumo;
  arroz: PrecoConabResumo;
  feijao: PrecoConabResumo;
  fonte: 'api' | 'cache' | 'fallback';
  atualizadoEm: string;
}

// ── Product Mapping ─────────────────────────────────────────

interface ProductFilter {
  productName: string;
  classification: string;
  nivelComercializacao: string;
  displayName: string;
  unidade: string;
  conversao: number; // multiply R$/kg by this to get display unit
}

const PRODUCT_FILTERS: Record<string, ProductFilter> = {
  soja: {
    productName: 'SOJA',
    classification: 'EM GR',
    nivelComercializacao: 'RECEBIDO',
    displayName: 'Soja em Grãos',
    unidade: 'R$/saca 60kg',
    conversao: 60,
  },
  milho: {
    productName: 'MILHO',
    classification: 'EM GR',
    nivelComercializacao: 'RECEBIDO',
    displayName: 'Milho em Grãos',
    unidade: 'R$/saca 60kg',
    conversao: 60,
  },
  cafe_arabica: {
    productName: 'CAFE',
    classification: 'AR',
    nivelComercializacao: 'ATACADO',
    displayName: 'Café Arábica',
    unidade: 'R$/saca 60kg',
    conversao: 60,
  },
  algodao: {
    productName: 'ALGODAO EM PLUMA',
    classification: '',
    nivelComercializacao: 'RECEBIDO',
    displayName: 'Algodão em Pluma',
    unidade: 'R$/arroba',
    conversao: 15,
  },
  trigo: {
    productName: 'TRIGO',
    classification: '',
    nivelComercializacao: 'RECEBIDO',
    displayName: 'Trigo',
    unidade: 'R$/saca 60kg',
    conversao: 60,
  },
  arroz: {
    productName: 'ARROZ',
    classification: 'LONGO FINO EM CASCA',
    nivelComercializacao: 'RECEBIDO',
    displayName: 'Arroz Longo Fino',
    unidade: 'R$/saca 50kg',
    conversao: 50,
  },
  feijao: {
    productName: 'FEIJAO',
    classification: 'COMUM CORES',
    nivelComercializacao: 'RECEBIDO',
    displayName: 'Feijão Cores',
    unidade: 'R$/saca 60kg',
    conversao: 60,
  },
};

// As observações do arquivo são semanais e os valores originais são em R$/kg.
export function conabWeekEnd(semana: string): string | null {
  const dates = [...semana.matchAll(/(\d{2})[-/](\d{2})[-/](\d{4})/g)];
  const last = dates.at(-1);
  if (!last) return null;
  const iso = `${last[3]}-${last[2]}-${last[1]}`;
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? iso : null;
}

// Aritmética monetária em milionésimos de real; number só na saída legada.
function parseKgPrice(value: string): bigint | null {
  const decimal = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  if (!/^\d+(?:\.\d{1,6})?$/.test(decimal)) return null;
  const [whole, fraction = ''] = decimal.split('.');
  const scaled = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  return scaled > 0n ? scaled : null;
}
function average(values: bigint[]): bigint {
  return (values.reduce((sum, value) => sum + value, 0n) + BigInt(values.length) / 2n) / BigInt(values.length);
}
function priceString(micros: bigint): string {
  const cents = (micros + 5000n) / 10000n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

interface ConabColumns {
  product: number;
  classification: number;
  productId: number;
  uf: number;
  week: number;
  level: number;
  price: number;
  unit: number;
  priceIsPerKg: boolean;
}

/** O arquivo oficial usa id_produto na terceira coluna e declara R$/kg no cabeçalho do valor. */
function conabColumns(header: string): ConabColumns {
  const names = header.replace(/^\uFEFF/, '').split(';').map(normalized);
  const index = (...aliases: string[]) => {
    const matches = names.flatMap((name, i) => aliases.includes(name) ? [i] : []);
    if (matches.length > 1) throw new Error('Cabeçalho CONAB ambíguo');
    return matches[0] ?? -1;
  };
  const perKg = index('VALOR_PRODUTO_KG');
  const columns: ConabColumns = {
    product: index('PRODUTO'),
    classification: index('CLASSIFICAO_PRODUTO', 'CLASSIFICACAO_PRODUTO', 'CLASSIFICACAO'),
    productId: index('ID_PRODUTO'),
    uf: index('UF'),
    week: names.includes('DATA_INICIAL_FINAL_SEMANA') ? index('DATA_INICIAL_FINAL_SEMANA') : index('SEMANA'),
    level: index('DSC_NIVEL_COMERCIALIZACAO', 'NIVEL_COMERCIALIZACAO', 'NIVEL'),
    price: perKg >= 0 ? perKg : index('VALOR'),
    unit: index('UNIDADE'),
    priceIsPerKg: perKg >= 0,
  };
  if ([columns.product, columns.classification, columns.uf, columns.week, columns.level, columns.price].some(i => i < 0)
      || (!columns.priceIsPerKg && columns.unit < 0)) {
    throw new Error('Arquivo CONAB sem cabeçalhos de produto, praça, semana e valor por kg');
  }
  return columns;
}

function decodeConab(data: ArrayBuffer | Uint8Array | string): string {
  if (typeof data === 'string') return data;
  // O portal já publicou latin1 apesar de declarar UTF-8 no Content-Type.
  const bytes = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return bytes.toString('latin1'); }
}

export class ConabPrecosService {
  private readonly cache = new NodeCache({ stdTTL: 3600, checkperiod: 300 });
  private readonly http: AxiosInstance;
  private readonly observations = new LastObservationStore('conab');
  private lastReal: PrecosConabCompleto | null = this.observations.get<PrecosConabCompleto>('all') || null;
  private inFlight: Promise<PrecosConabCompleto> | null = null;
  constructor(private readonly manager: DataSourceManager) {
    this.http = axios.create({ timeout: 15000, responseType: 'arraybuffer', headers: { 'User-Agent': 'ALETIS-System/1.0' } });
  }

  private cachedResult(data: PrecosConabCompleto, stale = false): PrecosConabCompleto {
    const result = { ...data, fonte: 'cache' as const };
    for (const key of Object.keys(PRODUCT_FILTERS)) {
      const item = data[key as keyof PrecosConabCompleto] as PrecoConabResumo;
      (result as unknown as Record<string, unknown>)[key] = item.fonte === 'fallback' ? item : {
        ...item, fonte: 'cache', estado: stale ? 'atrasado' : item.estado,
      };
    }
    return result;
  }

  async getAllPrecos(): Promise<PrecosConabCompleto> {
    const cached = this.cache.get<PrecosConabCompleto>('all');
    if (cached) return this.cachedResult(cached);
    if (!this.inFlight) {
      this.inFlight = this.fetchAllPrecos().finally(() => { this.inFlight = null; });
    }
    return this.inFlight;
  }

  private async fetchAllPrecos(): Promise<PrecosConabCompleto> {
    const start = Date.now();
    try {
      const response = await this.http.get('https://portaldeinformacoes.conab.gov.br/downloads/arquivos/PrecosSemanalUF.txt');
      const lines = decodeConab(response.data).split(/\r?\n/);
      if (lines.length < 2 || !lines[0].includes(';') || /<html/i.test(lines[0])) throw new Error('Arquivo CONAB inválido');
      const columns = conabColumns(lines[0]);
      const rows = lines.slice(1).map(line => line.split(';').map(v => v.trim()));
      const requiredLength = Math.max(...Object.values(columns).filter((v): v is number => typeof v === 'number')) + 1;
      const today = new Date().toISOString().slice(0, 10);
      const result = { fonte: 'api', atualizadoEm: '' } as PrecosConabCompleto;
      const coletadoEm = new Date().toISOString();
      for (const [key, filter] of Object.entries(PRODUCT_FILTERS)) {
        const weeks = new Map<string, { semana: string; values: Map<string, bigint[]>; observations: Map<string, bigint>; conflicting: boolean }>();
        for (const c of rows) {
          if (c.length < requiredLength || normalized(c[columns.product]) !== filter.productName ||
              (filter.classification && !normalized(c[columns.classification]).startsWith(filter.classification)) ||
              !normalized(c[columns.level]).includes(filter.nivelComercializacao)) continue;
          // Unidade explícita, quando presente, não pode contradizer o cabeçalho por kg.
          if (columns.unit >= 0 && !/^(?:1\s*)?kg$/i.test(c[columns.unit])) continue;
          const date = conabWeekEnd(c[columns.week]);
          const valor = parseKgPrice(c[columns.price]);
          const uf = c[columns.uf];
          if (!date || date > today || valor == null || !/^[A-Z]{2}$/.test(uf)) continue;
          if (!weeks.has(date)) weeks.set(date, { semana: c[columns.week], values: new Map(), observations: new Map(), conflicting: false });
          const week = weeks.get(date)!;
          const identity = [normalized(c[columns.product]), normalized(c[columns.classification]), columns.productId >= 0 ? c[columns.productId] : '', 'KG', uf, normalized(c[columns.level])].join('|');
          const previous = week.observations.get(identity);
          if (previous !== undefined) {
            // Repetir a mesma linha não altera seu peso; valores conflitantes não formam uma média confiável.
            if (previous !== valor) week.conflicting = true;
            continue;
          }
          week.observations.set(identity, valor);
          const values = week.values;
          values.set(uf, [...(values.get(uf) || []), valor]);
        }
        const dates = [...weeks.keys()].filter(date => !weeks.get(date)!.conflicting).sort();
        const date = dates.at(-1);
        let item: PrecoConabResumo = { produto: filter.displayName, unidade: filter.unidade, precoMedio: 0, precoMinimo: 0, precoMaximo: 0, semana: '', estados: [], fonte: 'fallback', atualizadoEm: '', estado: 'indisponivel', historico: [] };
        if (date) {
          const latest = weeks.get(date)!;
          const ufs = [...latest.values.keys()].sort();
          const estados = ufs.map(uf => ({ uf, preco: Number(priceString(average(latest.values.get(uf)!) * BigInt(filter.conversao))) }));
          const praca = `Média das UFs: ${ufs.join(', ')}`;
          const latestCoverage = [...latest.observations.keys()].sort().join(';');
          const historico = dates.filter(d => [...weeks.get(d)!.observations.keys()].sort().join(';') === latestCoverage)
            .slice(-60).map(data => ({ data, valor: priceString(average(ufs.map(uf => average(weeks.get(data)!.values.get(uf)!) * BigInt(filter.conversao)))), fonte: 'CONAB', praca, unidade: filter.unidade }));
          item = { produto: filter.displayName, unidade: filter.unidade, precoMedio: Number(historico.at(-1)!.valor), precoMinimo: Math.min(...estados.map(e => e.preco)), precoMaximo: Math.max(...estados.map(e => e.preco)), semana: latest.semana, estados, fonte: 'api', atualizadoEm: date, coletadoEm, estado: Date.now() - Date.parse(date) > 14 * 86400000 ? 'atrasado' : 'disponivel', historico };
        } else if (this.lastReal) {
          const previous = this.lastReal[key as keyof PrecosConabCompleto] as PrecoConabResumo;
          if (previous.fonte !== 'fallback') item = { ...previous, fonte: 'cache', estado: 'atrasado' };
        }
        (result as unknown as Record<string, unknown>)[key] = item;
      }
      const items = Object.keys(PRODUCT_FILTERS).map(k => result[k as keyof PrecosConabCompleto] as PrecoConabResumo);
      const valid = items.filter(v => v.fonte === 'api');
      if (!valid.length) throw new Error('CONAB sem observações válidas com unidade e data');
      result.atualizadoEm = valid.map(v => v.atualizadoEm).sort().at(-1)!;
      this.lastReal = result;
      this.observations.set('all', result);
      this.cache.set('all', result);
      this.manager.updateSourceStatus('conab_precos', valid.length === items.length ? 'online' : 'degraded', Date.now() - start, valid.length === items.length ? undefined : 'Cobertura parcial de commodities', { observadoEm: result.atualizadoEm, coletadoEm });
      return result;
    } catch (error) {
      this.manager.updateSourceStatus('conab_precos', 'degraded', Date.now() - start, error instanceof Error ? error.message : 'Falha CONAB');
      if (this.lastReal) return this.cachedResult(this.lastReal, true);
      throw new Error('Preços CONAB indisponíveis; nenhuma observação real preservada.');
    }
  }
  async getPreco(commodity: string): Promise<PrecoConabResumo> {
    const all = await this.getAllPrecos();
    const key = commodity.toLowerCase().replace(/[- ]/g, '_');
    const item = all[key as keyof PrecosConabCompleto];
    if (!item || typeof item !== 'object' || item.fonte === 'fallback') throw new Error('Commodity indisponível');
    return item;
  }
  async getPrecosPorUF(uf: string): Promise<Record<string, { produto: string; preco: number; unidade: string }>> {
    const all = await this.getAllPrecos();
    const result: Record<string, { produto: string; preco: number; unidade: string }> = {};
    for (const key of Object.keys(PRODUCT_FILTERS)) {
      const item = all[key as keyof PrecosConabCompleto] as PrecoConabResumo;
      const state = item.estados.find(e => e.uf === uf.toUpperCase());
      if (state && item.fonte !== 'fallback') result[key] = { produto: item.produto, preco: state.preco, unidade: item.unidade };
    }
    return result;
  }
}

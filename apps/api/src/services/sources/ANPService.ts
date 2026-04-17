// ============================================================
// ALETIS — ANP Service
// Fuel price integrations: diesel, ethanol by state
// Source: ANP (Agência Nacional do Petróleo, Gás Natural e Biocombustíveis)
// Real endpoint: dados-abertos CSV files at gov.br
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface PrecoCombustivel {
  combustivel: string;
  estado: string;
  precoMedio: number;
  precoMinimo: number;
  precoMaximo: number;
  unidade: string;
  dataReferencia: string;
  numeroPesquisas: number;
  fonte: 'api' | 'cache' | 'fallback';
}

export interface PrecoCombustivelResumo {
  diesel: PrecoCombustivel;
  gasolina: PrecoCombustivel;
  estados: Record<string, { diesel: number; gasolina: number }>;
  fonte: 'api' | 'cache' | 'fallback';
  atualizadoEm: string;
}

// ── Fallback Data (realistic 2026 fuel prices per state) ─────

const FALLBACK_DIESEL: Record<string, Omit<PrecoCombustivel, 'fonte'>> = {
  SP: { combustivel: 'Diesel S10', estado: 'SP', precoMedio: 6.28, precoMinimo: 5.89, precoMaximo: 6.79, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 2847 },
  MG: { combustivel: 'Diesel S10', estado: 'MG', precoMedio: 6.35, precoMinimo: 5.95, precoMaximo: 6.89, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 1923 },
  PR: { combustivel: 'Diesel S10', estado: 'PR', precoMedio: 6.18, precoMinimo: 5.79, precoMaximo: 6.59, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 1456 },
  GO: { combustivel: 'Diesel S10', estado: 'GO', precoMedio: 6.22, precoMinimo: 5.85, precoMaximo: 6.65, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 987 },
  MT: { combustivel: 'Diesel S10', estado: 'MT', precoMedio: 6.45, precoMinimo: 6.05, precoMaximo: 6.99, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 834 },
  MS: { combustivel: 'Diesel S10', estado: 'MS', precoMedio: 6.38, precoMinimo: 5.99, precoMaximo: 6.89, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 612 },
  RS: { combustivel: 'Diesel S10', estado: 'RS', precoMedio: 6.32, precoMinimo: 5.92, precoMaximo: 6.75, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 1678 },
  BA: { combustivel: 'Diesel S10', estado: 'BA', precoMedio: 6.41, precoMinimo: 5.98, precoMaximo: 6.95, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 1234 },
  RJ: { combustivel: 'Diesel S10', estado: 'RJ', precoMedio: 6.52, precoMinimo: 6.09, precoMaximo: 7.05, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 1567 },
  SC: { combustivel: 'Diesel S10', estado: 'SC', precoMedio: 6.25, precoMinimo: 5.85, precoMaximo: 6.69, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 1089 },
};

const FALLBACK_ETANOL: Record<string, Omit<PrecoCombustivel, 'fonte'>> = {
  SP: { combustivel: 'Etanol Hidratado', estado: 'SP', precoMedio: 3.89, precoMinimo: 3.45, precoMaximo: 4.39, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 3456 },
  MG: { combustivel: 'Etanol Hidratado', estado: 'MG', precoMedio: 4.12, precoMinimo: 3.69, precoMaximo: 4.59, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 2134 },
  PR: { combustivel: 'Etanol Hidratado', estado: 'PR', precoMedio: 4.05, precoMinimo: 3.59, precoMaximo: 4.49, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 1567 },
  GO: { combustivel: 'Etanol Hidratado', estado: 'GO', precoMedio: 3.95, precoMinimo: 3.49, precoMaximo: 4.39, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 876 },
  MT: { combustivel: 'Etanol Hidratado', estado: 'MT', precoMedio: 4.25, precoMinimo: 3.79, precoMaximo: 4.69, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 654 },
  MS: { combustivel: 'Etanol Hidratado', estado: 'MS', precoMedio: 4.18, precoMinimo: 3.69, precoMaximo: 4.59, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 534 },
  RS: { combustivel: 'Etanol Hidratado', estado: 'RS', precoMedio: 4.35, precoMinimo: 3.89, precoMaximo: 4.79, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 1789 },
  BA: { combustivel: 'Etanol Hidratado', estado: 'BA', precoMedio: 4.42, precoMinimo: 3.95, precoMaximo: 4.89, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 1123 },
  RJ: { combustivel: 'Etanol Hidratado', estado: 'RJ', precoMedio: 4.55, precoMinimo: 4.05, precoMaximo: 5.09, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 1432 },
  SC: { combustivel: 'Etanol Hidratado', estado: 'SC', precoMedio: 4.29, precoMinimo: 3.85, precoMaximo: 4.69, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 987 },
};

// ── ANP CSV URL Builder ─────────────────────────────────────
// ANP publishes monthly CSVs at:
// https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsan/{YYYY}/{MM}-dados-abertos-precos-diesel-gnv.csv
// https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsan/{YYYY}/{MM}-dados-abertos-precos-gasolina-etanol.csv

function getANPDieselUrls(): string[] {
  const now = new Date();
  const urls: string[] = [];
  // Try current month and previous month
  for (let offset = 0; offset <= 2; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    urls.push(`https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsan/${y}/${m}-dados-abertos-precos-diesel-gnv.csv`);
  }
  return urls;
}

function getANPGasolinaUrls(): string[] {
  const now = new Date();
  const urls: string[] = [];
  for (let offset = 0; offset <= 2; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    urls.push(`https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsan/${y}/${m}-dados-abertos-precos-gasolina-etanol.csv`);
  }
  return urls;
}

// ── Service Class ────────────────────────────────────────────

export class ANPService {
  private readonly cache: NodeCache;
  private readonly http: AxiosInstance;
  private readonly manager: DataSourceManager;

  constructor(manager: DataSourceManager) {
    this.manager = manager;

    this.cache = new NodeCache({
      stdTTL: 86400, // ANP updates weekly
      checkperiod: 3600,
      useClones: false,
    });

    this.http = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': 'ALETIS-System/1.0',
        'Accept': 'text/csv,*/*',
      },
      maxRedirects: 5,
    });
  }

  // ── Public: Preço Diesel por Estado ──────────────────────

  async getPrecoDiesel(estado: string): Promise<PrecoCombustivel> {
    const uf = estado.toUpperCase();
    const cacheKey = `anp_diesel_${uf}`;
    const cached = this.cache.get<PrecoCombustivel>(cacheKey);
    if (cached) {
      console.log(`[ANP] Diesel ${uf} retornado do cache`);
      return { ...cached, fonte: 'cache' };
    }

    return this.fetchRealDiesel(uf, cacheKey);
  }

  // ── Public: Preço Etanol por Estado ──────────────────────

  async getPrecoEtanol(estado: string): Promise<PrecoCombustivel> {
    const uf = estado.toUpperCase();
    const cacheKey = `anp_etanol_${uf}`;
    const cached = this.cache.get<PrecoCombustivel>(cacheKey);
    if (cached) {
      console.log(`[ANP] Etanol ${uf} retornado do cache`);
      return { ...cached, fonte: 'cache' };
    }

    return this.fetchRealEtanol(uf, cacheKey);
  }

  // ── Public: All Fuel Prices for a State ──────────────────

  async getPrecosCombustiveis(estado: string): Promise<{
    diesel: PrecoCombustivel;
    etanol: PrecoCombustivel;
  }> {
    const [diesel, etanol] = await Promise.allSettled([
      this.getPrecoDiesel(estado),
      this.getPrecoEtanol(estado),
    ]);

    const uf = estado.toUpperCase();

    return {
      diesel: diesel.status === 'fulfilled'
        ? diesel.value
        : { ...(FALLBACK_DIESEL[uf] || FALLBACK_DIESEL.SP), estado: uf, fonte: 'fallback' as const },
      etanol: etanol.status === 'fulfilled'
        ? etanol.value
        : { ...(FALLBACK_ETANOL[uf] || FALLBACK_ETANOL.SP), estado: uf, fonte: 'fallback' as const },
    };
  }

  // ── Public: All States Diesel Summary ────────────────────

  async getDieselNacional(): Promise<PrecoCombustivelResumo> {
    const cacheKey = 'anp_diesel_nacional';
    const cached = this.cache.get<PrecoCombustivelResumo>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const startTime = Date.now();
    try {
      const csvData = await this.downloadCSV(getANPDieselUrls());
      const latencia = Date.now() - startTime;

      const parsed = this.parseANPDieselCSV(csvData);
      this.manager.updateSourceStatus('anp_diesel', 'online', latencia);

      // Cache individual state results too
      for (const [uf, data] of Object.entries(parsed.porEstado)) {
        this.cache.set(`anp_diesel_${uf}`, data, 86400);
      }

      const estados: Record<string, { diesel: number; gasolina: number }> = {};
      for (const [uf, data] of Object.entries(parsed.porEstado)) {
        estados[uf] = { diesel: data.precoMedio, gasolina: 0 };
      }

      const result: PrecoCombustivelResumo = {
        diesel: parsed.nacional,
        gasolina: { combustivel: 'Gasolina Comum', estado: 'BR', precoMedio: 0, precoMinimo: 0, precoMaximo: 0, unidade: 'R$/litro', dataReferencia: parsed.nacional.dataReferencia, numeroPesquisas: 0, fonte: 'api' },
        estados,
        fonte: 'api',
        atualizadoEm: new Date().toISOString(),
      };

      this.cache.set(cacheKey, result, 86400);
      console.log(`[ANP] Diesel nacional OK em ${latencia}ms: ${Object.keys(parsed.porEstado).length} estados`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('anp_diesel', 'offline', latencia, msg);
      console.warn(`[ANP] Erro diesel nacional: ${msg}. Usando fallback.`);

      const estados: Record<string, { diesel: number; gasolina: number }> = {};
      for (const [uf, data] of Object.entries(FALLBACK_DIESEL)) {
        estados[uf] = { diesel: data.precoMedio, gasolina: 0 };
      }

      return {
        diesel: { ...FALLBACK_DIESEL.SP, estado: 'BR', fonte: 'fallback' },
        gasolina: { combustivel: 'Gasolina Comum', estado: 'BR', precoMedio: 0, precoMinimo: 0, precoMaximo: 0, unidade: 'R$/litro', dataReferencia: '2026-04-13', numeroPesquisas: 0, fonte: 'fallback' },
        estados,
        fonte: 'fallback',
        atualizadoEm: new Date().toISOString(),
      };
    }
  }

  // ── Private: Download CSV with fallback to older months ──

  private async downloadCSV(urls: string[]): Promise<string> {
    for (const url of urls) {
      try {
        console.log(`[ANP] Tentando: ${url}`);
        const response = await this.http.get(url, { responseType: 'text' });
        if (response.data && typeof response.data === 'string' && response.data.length > 100) {
          console.log(`[ANP] CSV obtido: ${response.data.split('\n').length} linhas`);
          return response.data;
        }
      } catch {
        continue;
      }
    }
    throw new Error('Nenhum CSV ANP disponível nos últimos 3 meses');
  }

  // ── Private: Fetch Real Diesel from CSV ──────────────────

  private async fetchRealDiesel(uf: string, cacheKey: string): Promise<PrecoCombustivel> {
    const startTime = Date.now();
    try {
      const csvData = await this.downloadCSV(getANPDieselUrls());
      const latencia = Date.now() - startTime;

      // ANP diesel CSV format (semicolon separated):
      // Regiao - Sigla;Estado - Sigla;Municipio;Revenda;CNPJ;Rua;Numero;Complemento;Bairro;Cep;Produto;Data da Coleta;Valor de Venda;Valor de Compra;Unidade de Medida;Bandeira
      const lines = csvData.split('\n');
      let totalVenda = 0;
      let minVenda = Infinity;
      let maxVenda = 0;
      let count = 0;
      let lastDate = '';

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';');
        if (cols.length < 13) continue;

        const estado = (cols[1] || '').trim();
        const produto = (cols[10] || '').trim().toUpperCase();
        const dataColeta = (cols[11] || '').trim();
        const valorVenda = this.parseBRNumber(cols[12]);

        if (estado !== uf) continue;
        if (!produto.includes('DIESEL S10')) continue;
        if (valorVenda <= 0 || valorVenda > 15) continue; // sanity

        totalVenda += valorVenda;
        if (valorVenda < minVenda) minVenda = valorVenda;
        if (valorVenda > maxVenda) maxVenda = valorVenda;
        if (dataColeta > lastDate) lastDate = dataColeta;
        count++;
      }

      if (count === 0) throw new Error(`Nenhum dado Diesel S10 para ${uf}`);

      const result: PrecoCombustivel = {
        combustivel: 'Diesel S10',
        estado: uf,
        precoMedio: Number((totalVenda / count).toFixed(2)),
        precoMinimo: Number(minVenda.toFixed(2)),
        precoMaximo: Number(maxVenda.toFixed(2)),
        unidade: 'R$/litro',
        dataReferencia: this.parseDateBR(lastDate),
        numeroPesquisas: count,
        fonte: 'api',
      };

      this.manager.updateSourceStatus('anp_diesel', 'online', latencia);
      this.cache.set(cacheKey, result, 86400);
      console.log(`[ANP] Diesel ${uf} OK em ${latencia}ms: R$ ${result.precoMedio} (${count} postos)`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('anp_diesel', 'offline', latencia, msg);
      console.warn(`[ANP] Erro diesel ${uf}: ${msg}. Usando fallback.`);

      const fb = FALLBACK_DIESEL[uf] || FALLBACK_DIESEL.SP;
      const result: PrecoCombustivel = { ...fb, estado: uf, fonte: 'fallback' };
      this.cache.set(cacheKey, result, 300);
      return result;
    }
  }

  // ── Private: Fetch Real Etanol from CSV ──────────────────

  private async fetchRealEtanol(uf: string, cacheKey: string): Promise<PrecoCombustivel> {
    const startTime = Date.now();
    try {
      const csvData = await this.downloadCSV(getANPGasolinaUrls());
      const latencia = Date.now() - startTime;

      const lines = csvData.split('\n');
      let totalVenda = 0;
      let minVenda = Infinity;
      let maxVenda = 0;
      let count = 0;
      let lastDate = '';

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';');
        if (cols.length < 13) continue;

        const estado = (cols[1] || '').trim();
        const produto = (cols[10] || '').trim().toUpperCase();
        const dataColeta = (cols[11] || '').trim();
        const valorVenda = this.parseBRNumber(cols[12]);

        if (estado !== uf) continue;
        if (!produto.includes('ETANOL')) continue;
        if (valorVenda <= 0 || valorVenda > 15) continue;

        totalVenda += valorVenda;
        if (valorVenda < minVenda) minVenda = valorVenda;
        if (valorVenda > maxVenda) maxVenda = valorVenda;
        if (dataColeta > lastDate) lastDate = dataColeta;
        count++;
      }

      if (count === 0) throw new Error(`Nenhum dado Etanol para ${uf}`);

      const result: PrecoCombustivel = {
        combustivel: 'Etanol Hidratado',
        estado: uf,
        precoMedio: Number((totalVenda / count).toFixed(2)),
        precoMinimo: Number(minVenda.toFixed(2)),
        precoMaximo: Number(maxVenda.toFixed(2)),
        unidade: 'R$/litro',
        dataReferencia: this.parseDateBR(lastDate),
        numeroPesquisas: count,
        fonte: 'api',
      };

      this.manager.updateSourceStatus('anp_etanol', 'online', latencia);
      this.cache.set(cacheKey, result, 86400);
      console.log(`[ANP] Etanol ${uf} OK em ${latencia}ms: R$ ${result.precoMedio} (${count} postos)`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('anp_etanol', 'offline', latencia, msg);
      console.warn(`[ANP] Erro etanol ${uf}: ${msg}. Usando fallback.`);

      const fb = FALLBACK_ETANOL[uf] || FALLBACK_ETANOL.SP;
      const result: PrecoCombustivel = { ...fb, estado: uf, fonte: 'fallback' };
      this.cache.set(cacheKey, result, 300);
      return result;
    }
  }

  // ── Private: Parse ANP Diesel CSV for all states ─────────

  private parseANPDieselCSV(csvData: string): {
    nacional: PrecoCombustivel;
    porEstado: Record<string, PrecoCombustivel>;
  } {
    const lines = csvData.split('\n');
    const byState = new Map<string, { total: number; min: number; max: number; count: number; lastDate: string }>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';');
      if (cols.length < 13) continue;

      const estado = (cols[1] || '').trim();
      const produto = (cols[10] || '').trim().toUpperCase();
      const dataColeta = (cols[11] || '').trim();
      const valorVenda = this.parseBRNumber(cols[12]);

      if (!produto.includes('DIESEL S10')) continue;
      if (valorVenda <= 0 || valorVenda > 15) continue;

      if (!byState.has(estado)) {
        byState.set(estado, { total: 0, min: Infinity, max: 0, count: 0, lastDate: '' });
      }
      const s = byState.get(estado)!;
      s.total += valorVenda;
      if (valorVenda < s.min) s.min = valorVenda;
      if (valorVenda > s.max) s.max = valorVenda;
      if (dataColeta > s.lastDate) s.lastDate = dataColeta;
      s.count++;
    }

    const porEstado: Record<string, PrecoCombustivel> = {};
    let totalNacional = 0;
    let minNacional = Infinity;
    let maxNacional = 0;
    let countNacional = 0;
    let lastDateNacional = '';

    for (const [uf, s] of byState) {
      porEstado[uf] = {
        combustivel: 'Diesel S10',
        estado: uf,
        precoMedio: Number((s.total / s.count).toFixed(2)),
        precoMinimo: Number(s.min.toFixed(2)),
        precoMaximo: Number(s.max.toFixed(2)),
        unidade: 'R$/litro',
        dataReferencia: this.parseDateBR(s.lastDate),
        numeroPesquisas: s.count,
        fonte: 'api',
      };

      totalNacional += s.total;
      if (s.min < minNacional) minNacional = s.min;
      if (s.max > maxNacional) maxNacional = s.max;
      countNacional += s.count;
      if (s.lastDate > lastDateNacional) lastDateNacional = s.lastDate;
    }

    return {
      nacional: {
        combustivel: 'Diesel S10',
        estado: 'BR',
        precoMedio: countNacional > 0 ? Number((totalNacional / countNacional).toFixed(2)) : 0,
        precoMinimo: minNacional === Infinity ? 0 : Number(minNacional.toFixed(2)),
        precoMaximo: Number(maxNacional.toFixed(2)),
        unidade: 'R$/litro',
        dataReferencia: this.parseDateBR(lastDateNacional),
        numeroPesquisas: countNacional,
        fonte: 'api',
      },
      porEstado,
    };
  }

  // ── Private Helpers ──────────────────────────────────────

  private parseBRNumber(val: string | undefined): number {
    if (!val) return 0;
    const cleaned = val.trim().replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  private parseDateBR(dateStr: string): string {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    // Convert DD/MM/YYYY to YYYY-MM-DD
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  }
}

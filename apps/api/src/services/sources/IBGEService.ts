// ============================================================
// ALETIS — IBGE Service
// Integrations: IBGE Localidades, SIDRA (producao agricola, censo)
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import type { DataSourceManager } from '../DataSourceManager.js';

// ── Types ────────────────────────────────────────────────────

export interface Municipio {
  id: number;
  nome: string;
  microrregiao: {
    id: number;
    nome: string;
    mesorregiao: {
      id: number;
      nome: string;
      UF: {
        id: number;
        sigla: string;
        nome: string;
      };
    };
  };
}

export interface MunicipioSimplificado {
  codigoIbge: number;
  nome: string;
  microrregiao: string;
  mesorregiao: string;
  uf: string;
}

export interface ProducaoAgricola {
  codigoIbge: string;
  municipio: string;
  produtos: ProdutoAgricola[];
  ano: string;
  fonte: 'api' | 'cache' | 'fallback';
}

export interface ProdutoAgricola {
  produto: string;
  areaPlantada: number;       // hectares
  areaColhida: number;        // hectares
  producao: number;            // toneladas
  rendimentoMedio: number;     // kg/ha
  valorProducao: number;       // R$ mil
}

export interface EstruturaFundiaria {
  uf: string;
  totalEstabelecimentos: number;
  areaTotal: number;            // hectares
  distribuicao: FaixaFundiaria[];
  ano: string;
  fonte: 'api' | 'cache' | 'fallback';
}

export interface FaixaFundiaria {
  faixa: string;
  estabelecimentos: number;
  area: number;                 // hectares
  percentualEstabelecimentos: number;
  percentualArea: number;
}

// ── Fallback Data ────────────────────────────────────────────

const FALLBACK_MUNICIPIOS_SP: MunicipioSimplificado[] = [
  { codigoIbge: 3550308, nome: 'Sao Paulo', microrregiao: 'Sao Paulo', mesorregiao: 'Metropolitana de Sao Paulo', uf: 'SP' },
  { codigoIbge: 3509502, nome: 'Campinas', microrregiao: 'Campinas', mesorregiao: 'Campinas', uf: 'SP' },
  { codigoIbge: 3543402, nome: 'Ribeirao Preto', microrregiao: 'Ribeirao Preto', mesorregiao: 'Ribeirao Preto', uf: 'SP' },
  { codigoIbge: 3549805, nome: 'Sao Jose do Rio Preto', microrregiao: 'Sao Jose do Rio Preto', mesorregiao: 'Sao Jose do Rio Preto', uf: 'SP' },
  { codigoIbge: 3552205, nome: 'Sorocaba', microrregiao: 'Sorocaba', mesorregiao: 'Macro Metropolitana Paulista', uf: 'SP' },
];

const FALLBACK_PRODUCAO: ProdutoAgricola[] = [
  { produto: 'Soja (em grao)', areaPlantada: 4200, areaColhida: 4180, producao: 14600, rendimentoMedio: 3492, valorProducao: 72800 },
  { produto: 'Milho (em grao)', areaPlantada: 3800, areaColhida: 3750, producao: 22500, rendimentoMedio: 6000, valorProducao: 45000 },
  { produto: 'Cana-de-acucar', areaPlantada: 5500, areaColhida: 5450, producao: 435000, rendimentoMedio: 79816, valorProducao: 130500 },
  { produto: 'Cafe (em grao)', areaPlantada: 210, areaColhida: 200, producao: 450, rendimentoMedio: 2250, valorProducao: 18000 },
  { produto: 'Laranja', areaPlantada: 380, areaColhida: 370, producao: 9250, rendimentoMedio: 25000, valorProducao: 46250 },
];

const FALLBACK_ESTRUTURA_SP: EstruturaFundiaria = {
  uf: 'SP',
  totalEstabelecimentos: 188452,
  areaTotal: 16423000,
  distribuicao: [
    { faixa: 'Menos de 10 ha', estabelecimentos: 89430, area: 412000, percentualEstabelecimentos: 47.5, percentualArea: 2.5 },
    { faixa: '10 a 50 ha', estabelecimentos: 52760, area: 1380000, percentualEstabelecimentos: 28.0, percentualArea: 8.4 },
    { faixa: '50 a 200 ha', estabelecimentos: 28270, area: 2910000, percentualEstabelecimentos: 15.0, percentualArea: 17.7 },
    { faixa: '200 a 1000 ha', estabelecimentos: 14115, area: 5680000, percentualEstabelecimentos: 7.5, percentualArea: 34.6 },
    { faixa: 'Mais de 1000 ha', estabelecimentos: 3877, area: 6041000, percentualEstabelecimentos: 2.1, percentualArea: 36.8 },
  ],
  ano: '2017',
  fonte: 'fallback',
};

// ── Service Class ────────────────────────────────────────────

export class IBGEService {
  private readonly cache: NodeCache;
  private readonly httpLocalidades: AxiosInstance;
  private readonly httpSIDRA: AxiosInstance;
  private readonly manager: DataSourceManager;

  constructor(manager: DataSourceManager) {
    this.manager = manager;

    this.cache = new NodeCache({
      stdTTL: 86400, // IBGE data changes infrequently
      checkperiod: 3600,
      useClones: false,
    });

    this.httpLocalidades = axios.create({
      baseURL: 'https://servicodados.ibge.gov.br/api/v1/localidades',
      timeout: 5000,
      headers: { 'User-Agent': 'ALETIS-System/1.0' },
    });

    this.httpSIDRA = axios.create({
      baseURL: 'https://apisidra.ibge.gov.br/values',
      timeout: 10000, // SIDRA can be slow
      headers: { 'User-Agent': 'ALETIS-System/1.0' },
    });
  }

  // ── Public: Municipios por UF ────────────────────────────

  async getMunicipios(uf: string): Promise<MunicipioSimplificado[]> {
    const cacheKey = `ibge_municipios_${uf.toUpperCase()}`;
    const cached = this.cache.get<MunicipioSimplificado[]>(cacheKey);
    if (cached) {
      console.log(`[IBGE] Municipios ${uf} retornados do cache`);
      return cached;
    }

    const startTime = Date.now();
    try {
      console.log(`[IBGE] Buscando municipios de ${uf}`);
      const response = await this.httpLocalidades.get<Municipio[]>(
        `/estados/${uf.toUpperCase()}/municipios?orderBy=nome`
      );
      const latencia = Date.now() - startTime;

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('Resposta vazia');
      }

      this.manager.updateSourceStatus('ibge_municipios', 'online', latencia);

      const municipios: MunicipioSimplificado[] = response.data.map((m) => ({
        codigoIbge: m.id,
        nome: m.nome,
        microrregiao: m.microrregiao?.nome || '',
        mesorregiao: m.microrregiao?.mesorregiao?.nome || '',
        uf: m.microrregiao?.mesorregiao?.UF?.sigla || uf.toUpperCase(),
      }));

      this.cache.set(cacheKey, municipios);
      console.log(`[IBGE] Municipios ${uf} OK em ${latencia}ms: ${municipios.length} municipios`);
      return municipios;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('ibge_municipios', 'offline', latencia, msg);
      console.warn(`[IBGE] Erro municipios ${uf}: ${msg}. Usando fallback.`);

      // Return state-appropriate fallback or generic
      if (uf.toUpperCase() === 'SP') {
        this.cache.set(cacheKey, FALLBACK_MUNICIPIOS_SP, 300);
        return FALLBACK_MUNICIPIOS_SP;
      }

      const genericFallback: MunicipioSimplificado[] = [
        { codigoIbge: 0, nome: `Capital de ${uf}`, microrregiao: '', mesorregiao: '', uf: uf.toUpperCase() },
      ];
      this.cache.set(cacheKey, genericFallback, 300);
      return genericFallback;
    }
  }

  // ── Public: Producao Agricola Municipal (LSPA) ───────────

  async getProducaoAgricola(codigoIbge: string): Promise<ProducaoAgricola> {
    const cacheKey = `ibge_producao_${codigoIbge}`;
    const cached = this.cache.get<ProducaoAgricola>(cacheKey);
    if (cached) {
      console.log(`[IBGE] Producao ${codigoIbge} retornada do cache`);
      return { ...cached, fonte: 'cache' };
    }

    const startTime = Date.now();
    try {
      // SIDRA Table 5457 = LSPA (Levantamento Sistematico da Producao Agricola)
      // n6/{codigoIbge} = municipal level
      // v/109,216,214,112,215 = area plantada, area colhida, producao, rendimento, valor
      // p/last 1 = most recent period
      // c48/0 = all products (total)
      const sidraUrl = `/t/5457/n6/${codigoIbge}/v/109,216,214,112,215/p/last%201/c48/39443,39441,39442,39430,39436`;

      console.log(`[IBGE] Buscando producao agricola SIDRA para ${codigoIbge}`);
      const response = await this.httpSIDRA.get(sidraUrl);
      const latencia = Date.now() - startTime;

      if (!response.data || !Array.isArray(response.data) || response.data.length <= 1) {
        throw new Error('Sem dados SIDRA');
      }

      this.manager.updateSourceStatus('ibge_producao_agricola', 'online', latencia);

      // SIDRA returns a header row + data rows
      // Each row has: Nivel Territorial, Unidade Territorial, Variavel, Ano, Produto, Valor
      const rows = response.data.slice(1); // skip header
      const productMap = new Map<string, Partial<ProdutoAgricola>>();

      for (const row of rows) {
        const produto = row.D4N || row['Produto das lavouras'] || '';
        const variavel = row.D2N || row['Variavel'] || '';
        const valor = parseFloat(row.V || '0');

        if (!produto) continue;

        if (!productMap.has(produto)) {
          productMap.set(produto, { produto });
        }

        const entry = productMap.get(produto)!;

        if (variavel.includes('plantada')) entry.areaPlantada = valor;
        else if (variavel.includes('colhida')) entry.areaColhida = valor;
        else if (variavel.includes('Produ')) entry.producao = valor;
        else if (variavel.includes('Rendimento')) entry.rendimentoMedio = valor;
        else if (variavel.includes('Valor')) entry.valorProducao = valor;
      }

      const produtos: ProdutoAgricola[] = Array.from(productMap.values()).map((p) => ({
        produto: p.produto || '',
        areaPlantada: p.areaPlantada || 0,
        areaColhida: p.areaColhida || 0,
        producao: p.producao || 0,
        rendimentoMedio: p.rendimentoMedio || 0,
        valorProducao: p.valorProducao || 0,
      }));

      const municipioNome = rows[0]?.D1N || rows[0]?.['Municipio'] || codigoIbge;
      const ano = rows[0]?.D3N || rows[0]?.['Ano'] || new Date().getFullYear().toString();

      const result: ProducaoAgricola = {
        codigoIbge,
        municipio: municipioNome,
        produtos: produtos.length > 0 ? produtos : FALLBACK_PRODUCAO,
        ano,
        fonte: 'api',
      };

      this.cache.set(cacheKey, result, 86400);
      console.log(`[IBGE] Producao ${codigoIbge} OK em ${latencia}ms: ${produtos.length} produtos`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('ibge_producao_agricola', 'offline', latencia, msg);
      console.warn(`[IBGE] Erro producao ${codigoIbge}: ${msg}. Usando fallback.`);

      const fallback: ProducaoAgricola = {
        codigoIbge,
        municipio: `Municipio ${codigoIbge}`,
        produtos: FALLBACK_PRODUCAO,
        ano: new Date().getFullYear().toString(),
        fonte: 'fallback',
      };

      this.cache.set(cacheKey, fallback, 300);
      return fallback;
    }
  }

  // ── Public: Estrutura Fundiaria ──────────────────────────

  async getEstruturaFundiaria(uf: string): Promise<EstruturaFundiaria> {
    const cacheKey = `ibge_fundiaria_${uf.toUpperCase()}`;
    const cached = this.cache.get<EstruturaFundiaria>(cacheKey);
    if (cached) {
      console.log(`[IBGE] Estrutura fundiaria ${uf} retornada do cache`);
      return { ...cached, fonte: 'cache' };
    }

    const startTime = Date.now();
    try {
      // SIDRA Table 6778 = Censo Agropecuario 2017
      // Grupos de area total (classificacao c220)
      // n3/{codigoUF} = state level
      // v/184 = number of establishments, v/2375 = total area
      const ufCode = this.getUFCode(uf);
      const sidraUrl = `/t/6778/n3/${ufCode}/v/184,2375/p/last%201/c220/110085,110086,110087,110088,110089`;

      console.log(`[IBGE] Buscando estrutura fundiaria SIDRA para ${uf} (${ufCode})`);
      const response = await this.httpSIDRA.get(sidraUrl);
      const latencia = Date.now() - startTime;

      if (!response.data || !Array.isArray(response.data) || response.data.length <= 1) {
        throw new Error('Sem dados SIDRA');
      }

      this.manager.updateSourceStatus('ibge_estrutura_fundiaria', 'online', latencia);

      const rows = response.data.slice(1);
      const faixaMap = new Map<string, { estabelecimentos: number; area: number }>();

      for (const row of rows) {
        const faixa = row.D4N || row['Grupo de area total'] || '';
        const variavel = row.D2N || row['Variavel'] || '';
        const valor = parseFloat(row.V || '0');

        if (!faixa) continue;

        if (!faixaMap.has(faixa)) {
          faixaMap.set(faixa, { estabelecimentos: 0, area: 0 });
        }

        const entry = faixaMap.get(faixa)!;
        if (variavel.includes('estabelecimento') || variavel.includes('Numero')) {
          entry.estabelecimentos = valor;
        } else if (variavel.includes('rea') || variavel.includes('Area')) {
          entry.area = valor;
        }
      }

      let totalEstab = 0;
      let totalArea = 0;
      const distribuicao: FaixaFundiaria[] = [];

      for (const [faixa, data] of faixaMap) {
        totalEstab += data.estabelecimentos;
        totalArea += data.area;
        distribuicao.push({
          faixa,
          estabelecimentos: data.estabelecimentos,
          area: data.area,
          percentualEstabelecimentos: 0,
          percentualArea: 0,
        });
      }

      // Calculate percentages
      for (const d of distribuicao) {
        d.percentualEstabelecimentos = totalEstab > 0
          ? parseFloat(((d.estabelecimentos / totalEstab) * 100).toFixed(1))
          : 0;
        d.percentualArea = totalArea > 0
          ? parseFloat(((d.area / totalArea) * 100).toFixed(1))
          : 0;
      }

      const result: EstruturaFundiaria = {
        uf: uf.toUpperCase(),
        totalEstabelecimentos: totalEstab,
        areaTotal: totalArea,
        distribuicao: distribuicao.length > 0 ? distribuicao : FALLBACK_ESTRUTURA_SP.distribuicao,
        ano: '2017',
        fonte: 'api',
      };

      this.cache.set(cacheKey, result, 86400);
      console.log(`[IBGE] Fundiaria ${uf} OK em ${latencia}ms: ${distribuicao.length} faixas`);
      return result;
    } catch (error) {
      const latencia = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.manager.updateSourceStatus('ibge_estrutura_fundiaria', 'offline', latencia, msg);
      console.warn(`[IBGE] Erro fundiaria ${uf}: ${msg}. Usando fallback.`);

      const fallback: EstruturaFundiaria = {
        ...FALLBACK_ESTRUTURA_SP,
        uf: uf.toUpperCase(),
        fonte: 'fallback',
      };

      this.cache.set(cacheKey, fallback, 300);
      return fallback;
    }
  }

  // ── Private Helpers ──────────────────────────────────────

  private getUFCode(uf: string): number {
    const codes: Record<string, number> = {
      RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17,
      MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
      MG: 31, ES: 32, RJ: 33, SP: 35,
      PR: 41, SC: 42, RS: 43,
      MS: 50, MT: 51, GO: 52, DF: 53,
    };
    return codes[uf.toUpperCase()] || 35; // default SP
  }
}

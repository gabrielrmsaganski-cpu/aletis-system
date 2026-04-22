// ============================================================
// ALETIS Data Source Manager — Central Orchestrator
// Manages registry, health, and access to all external data sources
// ============================================================

import NodeCache from 'node-cache';
import { BancoCentralService } from './sources/BancoCentralService.js';
import { ClimaService } from './sources/ClimaService.js';
import { PrecosService } from './sources/PrecosService.js';
import { IBGEService } from './sources/IBGEService.js';
import { ANPService } from './sources/ANPService.js';
import { ExpectativasService } from './sources/ExpectativasService.js';
import { OpenMeteoService } from './sources/OpenMeteoService.js';
import { AwesomeApiService } from './sources/AwesomeApiService.js';
import { SidraLSPAService } from './sources/SidraLSPAService.js';
import { ConabPrecosService } from './sources/ConabPrecosService.js';
import { NasaFirmsService } from './sources/NasaFirmsService.js';
import { SicorService } from './sources/SicorService.js';
import { ComexStatService } from './sources/ComexStatService.js';
import { DeterService } from './sources/DeterService.js';
import { ZarcService } from './sources/ZarcService.js';
import { AbioveService } from './sources/AbioveService.js';
import { SicorBacenService } from './sources/SicorBacenService.js';

// ── Types ────────────────────────────────────────────────────

export type DataSourceCategory =
  | 'PRECOS'
  | 'PRODUCAO'
  | 'CLIMA'
  | 'CREDITO'
  | 'MERCADO_EXTERNO'
  | 'TERRA'
  | 'INFRAESTRUTURA'
  | 'JURIDICO';

export type SourceHealth = 'online' | 'degraded' | 'offline' | 'unknown';

export interface DataSourceEntry {
  nome: string;
  descricao: string;
  categoria: DataSourceCategory;
  url: string;
  status: SourceHealth;
  ultimaAtualizacao: string | null;
  latenciaMs: number | null;
  erros24h: number;
  ultimoErro: string | null;
  ttlSegundos: number;
}

export interface SourceFetchResult<T = unknown> {
  dados: T;
  fonte: 'api' | 'cache' | 'fallback';
  latenciaMs: number;
  atualizadoEm: string;
  erro?: string;
}

// ── Registry ─────────────────────────────────────────────────

const SOURCE_REGISTRY: Omit<DataSourceEntry, 'status' | 'ultimaAtualizacao' | 'latenciaMs' | 'erros24h' | 'ultimoErro'>[] = [
  {
    nome: 'bcb_selic',
    descricao: 'Taxa Selic Meta — Banco Central do Brasil (SGS 432)',
    categoria: 'CREDITO',
    url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados',
    ttlSegundos: 3600,
  },
  {
    nome: 'bcb_ipca',
    descricao: 'IPCA Mensal — Banco Central do Brasil (SGS 433)',
    categoria: 'CREDITO',
    url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados',
    ttlSegundos: 3600,
  },
  {
    nome: 'bcb_igpm',
    descricao: 'IGP-M Mensal — Banco Central do Brasil (SGS 189)',
    categoria: 'CREDITO',
    url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados',
    ttlSegundos: 3600,
  },
  {
    nome: 'bcb_dolar_ptax',
    descricao: 'Dólar PTAX Venda — Banco Central do Brasil (OLINDA)',
    categoria: 'MERCADO_EXTERNO',
    url: 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/',
    ttlSegundos: 1800,
  },
  {
    nome: 'bcb_cdi',
    descricao: 'Taxa CDI — Banco Central do Brasil (SGS 12)',
    categoria: 'CREDITO',
    url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados',
    ttlSegundos: 3600,
  },
  {
    nome: 'bcb_credito_rural',
    descricao: 'Volume de Crédito Rural — Banco Central do Brasil',
    categoria: 'CREDITO',
    url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.25469/dados',
    ttlSegundos: 7200,
  },
  {
    nome: 'cepea_soja',
    descricao: 'Indicador Soja CEPEA/ESALQ Paraná',
    categoria: 'PRECOS',
    url: 'https://www.cepea.esalq.usp.br/br/indicador/soja.aspx',
    ttlSegundos: 1800,
  },
  {
    nome: 'cepea_milho',
    descricao: 'Indicador Milho CEPEA/ESALQ',
    categoria: 'PRECOS',
    url: 'https://www.cepea.esalq.usp.br/br/indicador/milho.aspx',
    ttlSegundos: 1800,
  },
  {
    nome: 'cepea_boi',
    descricao: 'Indicador Boi Gordo CEPEA/ESALQ',
    categoria: 'PRECOS',
    url: 'https://www.cepea.esalq.usp.br/br/indicador/boi-gordo.aspx',
    ttlSegundos: 1800,
  },
  {
    nome: 'cepea_cafe',
    descricao: 'Indicador Café Arábica CEPEA/ESALQ',
    categoria: 'PRECOS',
    url: 'https://www.cepea.esalq.usp.br/br/indicador/cafe.aspx',
    ttlSegundos: 1800,
  },
  {
    nome: 'cepea_algodao',
    descricao: 'Indicador Algodão CEPEA/ESALQ',
    categoria: 'PRECOS',
    url: 'https://www.cepea.esalq.usp.br/br/indicador/algodao.aspx',
    ttlSegundos: 1800,
  },
  {
    nome: 'inmet_estacao',
    descricao: 'Dados de Estações Meteorológicas — INMET',
    categoria: 'CLIMA',
    url: 'https://apitempo.inmet.gov.br/estacao/dados/',
    ttlSegundos: 1800,
  },
  {
    nome: 'cptec_previsao',
    descricao: 'Previsão do Tempo — CPTEC/INPE via BrasilAPI',
    categoria: 'CLIMA',
    url: 'https://brasilapi.com.br/api/cptec/v1/clima/previsao/',
    ttlSegundos: 3600,
  },
  {
    nome: 'nasa_power',
    descricao: 'Dados Climáticos Históricos — NASA POWER',
    categoria: 'CLIMA',
    url: 'https://power.larc.nasa.gov/api/temporal/daily/point',
    ttlSegundos: 86400,
  },
  {
    nome: 'ibge_municipios',
    descricao: 'Municípios — IBGE Localidades',
    categoria: 'TERRA',
    url: 'https://servicodados.ibge.gov.br/api/v1/localidades/',
    ttlSegundos: 86400,
  },
  {
    nome: 'ibge_producao_agricola',
    descricao: 'Produção Agrícola Municipal — IBGE SIDRA',
    categoria: 'PRODUCAO',
    url: 'https://apisidra.ibge.gov.br/values/',
    ttlSegundos: 86400,
  },
  {
    nome: 'ibge_estrutura_fundiaria',
    descricao: 'Estrutura Fundiária — IBGE Censo Agropecuário',
    categoria: 'TERRA',
    url: 'https://apisidra.ibge.gov.br/values/',
    ttlSegundos: 86400,
  },
  {
    nome: 'anp_diesel',
    descricao: 'Preços Diesel — ANP',
    categoria: 'INFRAESTRUTURA',
    url: 'https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/',
    ttlSegundos: 86400,
  },
  {
    nome: 'anp_etanol',
    descricao: 'Preços Etanol — ANP',
    categoria: 'INFRAESTRUTURA',
    url: 'https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/',
    ttlSegundos: 86400,
  },
  {
    nome: 'conab_safra',
    descricao: 'Previsão de Safra — CONAB',
    categoria: 'PRODUCAO',
    url: 'https://portaldeinformacoes.conab.gov.br/',
    ttlSegundos: 86400,
  },
  // ── New Sources (Wave 1) ──
  {
    nome: 'bcb_expectativas',
    descricao: 'Expectativas de Mercado (Boletim Focus) — BCB OLINDA',
    categoria: 'CREDITO',
    url: 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/',
    ttlSegundos: 3600,
  },
  {
    nome: 'bcb_icbr_agro',
    descricao: 'IC-Br Índice de Commodities Agropecuárias — BCB SGS 27574',
    categoria: 'PRECOS',
    url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.27574/dados',
    ttlSegundos: 3600,
  },
  {
    nome: 'bcb_embi',
    descricao: 'EMBI+ Brasil Risco País — BCB SGS 21340',
    categoria: 'CREDITO',
    url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.21340/dados',
    ttlSegundos: 3600,
  },
  {
    nome: 'openmeteo_forecast',
    descricao: 'Previsão Meteorológica Agrícola — Open-Meteo (solo, evapotranspiração)',
    categoria: 'CLIMA',
    url: 'https://api.open-meteo.com/v1/forecast',
    ttlSegundos: 1800,
  },
  {
    nome: 'awesome_cambio',
    descricao: 'Cotações Cambiais Real-time — AwesomeAPI',
    categoria: 'MERCADO_EXTERNO',
    url: 'https://economia.awesomeapi.com.br/json/last/',
    ttlSegundos: 300,
  },
  {
    nome: 'ibge_lspa',
    descricao: 'LSPA Produção Mensal de Safra — IBGE SIDRA Tabela 6588',
    categoria: 'PRODUCAO',
    url: 'https://apisidra.ibge.gov.br/values/t/6588/',
    ttlSegundos: 86400,
  },
  // ── New Sources (Wave 2) ──
  {
    nome: 'conab_precos',
    descricao: 'Preços Semanais de Commodities por UF — CONAB Portal de Informações',
    categoria: 'PRECOS',
    url: 'https://portaldeinformacoes.conab.gov.br/downloads/arquivos/PrecosSemanalUF.txt',
    ttlSegundos: 3600,
  },
  {
    nome: 'nasa_firms',
    descricao: 'Focos de Incêndio Ativos (24h) — NASA FIRMS VIIRS Suomi NPP',
    categoria: 'CLIMA',
    url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/',
    ttlSegundos: 1800,
  },
  {
    nome: 'bcb_icbr_energia',
    descricao: 'IC-Br Índice de Commodities Energia — BCB SGS 27575',
    categoria: 'PRECOS',
    url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.27575/dados',
    ttlSegundos: 3600,
  },
  {
    nome: 'bcb_icbr_metal',
    descricao: 'IC-Br Índice de Commodities Metal — BCB SGS 27576',
    categoria: 'PRECOS',
    url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.27576/dados',
    ttlSegundos: 3600,
  },
  // ── Fase 6: Crédito Rural Granular + Comércio Exterior ──
  {
    nome: 'bcb_sicor',
    descricao: 'SICOR — Operações de Crédito Rural granulares por UF/produto/finalidade (BCB OLINDA)',
    categoria: 'CREDITO',
    url: 'https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/',
    ttlSegundos: 21600,
  },
  {
    nome: 'comexstat_exportacao',
    descricao: 'ComexStat — Exportações brasileiras por NCM, país e mês (MDIC/Siscomex)',
    categoria: 'MERCADO_EXTERNO',
    url: 'https://api-comexstat.mdic.gov.br/general',
    ttlSegundos: 21600,
  },
  // ── Wave 7a: Integrações Agro 2025/26 ──
  {
    nome: 'inpe_deter',
    descricao: 'INPE/DETER — Alertas de desmatamento (Amazônia + Cerrado), via TerraBrasilis WFS',
    categoria: 'TERRA',
    url: 'https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/deter_amz/wfs',
    ttlSegundos: 21600,
  },
  {
    nome: 'zarc_mapa',
    descricao: 'ZARC — Zoneamento Agrícola de Risco Climático safra 2025/26 (MAPA/SPA)',
    categoria: 'PRODUCAO',
    url: 'https://indicadores.agricultura.gov.br/zarc/',
    ttlSegundos: 86400,
  },
  {
    nome: 'abiove_moratoria',
    descricao: 'ABIOVE — Status da Moratória da Soja + elegibilidade por município (bioma Amazônia)',
    categoria: 'TERRA',
    url: 'https://abiove.org.br/sustentabilidade/moratoria-da-soja/',
    ttlSegundos: 604800,
  },
  // ── Wave 8c: SICOR Bacen OData (custeio/investimento/comercialização) ──
  {
    nome: 'sicor_bacen',
    descricao: 'SICOR — Operações Contratadas por UF/produto/mês (Bacen OLINDA OData v2): custeio, investimento e comercialização',
    categoria: 'CREDITO',
    url: 'https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/',
    ttlSegundos: 21600,
  },
];

// ── DataSourceManager Class ──────────────────────────────────

export class DataSourceManager {
  private static instance: DataSourceManager;

  private registry: Map<string, DataSourceEntry> = new Map();
  private statusCache: NodeCache;
  private errorCounts: Map<string, number> = new Map();

  // Service instances
  public readonly bancoCentral: BancoCentralService;
  public readonly clima: ClimaService;
  public readonly precos: PrecosService;
  public readonly ibge: IBGEService;
  public readonly anp: ANPService;
  public readonly expectativas: ExpectativasService;
  public readonly openMeteo: OpenMeteoService;
  public readonly awesomeApi: AwesomeApiService;
  public readonly sidraLSPA: SidraLSPAService;
  public readonly conabPrecos: ConabPrecosService;
  public readonly nasaFirms: NasaFirmsService;
  public readonly sicor: SicorService;
  public readonly comexStat: ComexStatService;
  public readonly deter: DeterService;
  public readonly zarc: ZarcService;
  public readonly abiove: AbioveService;
  public readonly sicorBacen: SicorBacenService;

  private constructor() {
    this.statusCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

    // Initialize registry
    for (const source of SOURCE_REGISTRY) {
      this.registry.set(source.nome, {
        ...source,
        status: 'unknown',
        ultimaAtualizacao: null,
        latenciaMs: null,
        erros24h: 0,
        ultimoErro: null,
      });
    }

    // Initialize service instances
    this.bancoCentral = new BancoCentralService(this);
    this.clima = new ClimaService(this);
    this.precos = new PrecosService(this);
    this.ibge = new IBGEService(this);
    this.anp = new ANPService(this);
    this.expectativas = new ExpectativasService(this);
    this.openMeteo = new OpenMeteoService(this);
    this.awesomeApi = new AwesomeApiService(this);
    this.sidraLSPA = new SidraLSPAService(this);
    this.conabPrecos = new ConabPrecosService(this);
    this.nasaFirms = new NasaFirmsService(this);
    this.sicor = new SicorService(this);
    this.comexStat = new ComexStatService(this);
    this.deter = new DeterService(this);
    this.zarc = new ZarcService(this);
    this.abiove = new AbioveService(this);
    this.sicorBacen = new SicorBacenService(this);

    console.log(`[DataSourceManager] Inicializado com ${this.registry.size} fontes de dados registradas`);
  }

  static getInstance(): DataSourceManager {
    if (!DataSourceManager.instance) {
      DataSourceManager.instance = new DataSourceManager();
    }
    return DataSourceManager.instance;
  }

  // ── Source Status Management ─────────────────────────────

  /**
   * Update source status after a fetch attempt
   */
  updateSourceStatus(
    nome: string,
    status: SourceHealth,
    latenciaMs: number,
    erro?: string
  ): void {
    const entry = this.registry.get(nome);
    if (!entry) return;

    entry.status = status;
    entry.latenciaMs = latenciaMs;
    entry.ultimaAtualizacao = new Date().toISOString();

    if (erro) {
      entry.ultimoErro = erro;
      const currentErrors = this.errorCounts.get(nome) ?? 0;
      this.errorCounts.set(nome, currentErrors + 1);
      entry.erros24h = currentErrors + 1;
    }

    this.registry.set(nome, entry);
  }

  /**
   * Returns health status for all registered data sources
   */
  getSourceStatus(): DataSourceEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Returns status for a single source by name
   */
  getSourceStatusByName(nome: string): DataSourceEntry | undefined {
    return this.registry.get(nome);
  }

  /**
   * Returns all sources in a given category
   */
  getSourcesByCategory(categoria: DataSourceCategory): DataSourceEntry[] {
    return Array.from(this.registry.values()).filter(
      (s) => s.categoria === categoria
    );
  }

  // ── Wave 7a: Named service accessors ─────────────────────

  getDeterService(): DeterService {
    return this.deter;
  }

  getZarcService(): ZarcService {
    return this.zarc;
  }

  getAbioveService(): AbioveService {
    return this.abiove;
  }

  // ── Wave 8c: SICOR Bacen accessor ────────────────────────

  getSicorService(): SicorBacenService {
    return this.sicorBacen;
  }

  // ── Data Fetch Orchestration ─────────────────────────────

  /**
   * Fetch data from a specific named source
   */
  async fetchSource(nome: string): Promise<SourceFetchResult> {
    switch (nome) {
      case 'bcb_selic':
        return this.wrapResult(nome, () => this.bancoCentral.fetchSelic());
      case 'bcb_ipca':
        return this.wrapResult(nome, () => this.bancoCentral.fetchIPCA());
      case 'bcb_igpm':
        return this.wrapResult(nome, () => this.bancoCentral.fetchIGPM());
      case 'bcb_dolar_ptax':
        return this.wrapResult(nome, () => this.bancoCentral.fetchDolarPTAX());
      case 'bcb_cdi':
        return this.wrapResult(nome, () => this.bancoCentral.fetchCDI());
      case 'bcb_credito_rural':
        return this.wrapResult(nome, () => this.bancoCentral.fetchCreditoRural());
      case 'cepea_soja':
        return this.wrapResult(nome, () => this.precos.getCotacaoSoja());
      case 'cepea_milho':
        return this.wrapResult(nome, () => this.precos.getCotacaoMilho());
      case 'cepea_boi':
        return this.wrapResult(nome, () => this.precos.getCotacaoBoi());
      case 'cepea_cafe':
        return this.wrapResult(nome, () => this.precos.getCotacaoCafe());
      case 'cepea_algodao':
        return this.wrapResult(nome, () => this.precos.getCotacaoAlgodao());
      case 'ibge_municipios':
        return this.wrapResult(nome, () => this.ibge.getMunicipios('SP'));
      case 'ibge_producao_agricola':
        return this.wrapResult(nome, () => this.ibge.getProducaoAgricola('3550308'));
      case 'anp_diesel':
        return this.wrapResult(nome, () => this.anp.getPrecoDiesel('SP'));
      case 'anp_etanol':
        return this.wrapResult(nome, () => this.anp.getPrecoEtanol('SP'));
      case 'bcb_expectativas':
        return this.wrapResult(nome, () => this.expectativas.getAllExpectativas());
      case 'bcb_icbr_agro':
        return this.wrapResult(nome, () => this.bancoCentral.fetchICBrAgro());
      case 'bcb_embi':
        return this.wrapResult(nome, () => this.bancoCentral.fetchEMBI());
      case 'openmeteo_forecast':
        return this.wrapResult(nome, () => this.openMeteo.getForecast(-24.7, -53.7));
      case 'awesome_cambio':
        return this.wrapResult(nome, () => this.awesomeApi.getCotacoesAtuais());
      case 'ibge_lspa':
        return this.wrapResult(nome, () => this.sidraLSPA.getSafraBrasil());
      case 'conab_precos':
        return this.wrapResult(nome, () => this.conabPrecos.getAllPrecos());
      case 'nasa_firms':
        return this.wrapResult(nome, () => this.nasaFirms.getIncendiosBrasil());
      case 'bcb_icbr_energia':
      case 'bcb_icbr_metal':
        return this.wrapResult(nome, () => this.bancoCentral.fetchICBrCompleto());
      case 'bcb_sicor':
        return this.wrapResult(nome, () => this.sicor.getAgregado(12));
      case 'comexstat_exportacao':
        return this.wrapResult(nome, () => this.comexStat.getExportacoesAgro(12));
      case 'inpe_deter':
        return this.wrapResult(nome, () => this.deter.resumoNacional());
      case 'zarc_mapa':
        return this.wrapResult(nome, () => this.zarc.buscarJanelasPlantio('soja', 'MT'));
      case 'abiove_moratoria':
        return this.wrapResult(nome, async () => this.abiove.statusMoratoriaSoja());
      case 'sicor_bacen':
        return this.wrapResult(nome, () =>
          this.sicorBacen.buscarContratosCusteio({ top: 10 })
        );
      default:
        return {
          dados: null,
          fonte: 'fallback',
          latenciaMs: 0,
          atualizadoEm: new Date().toISOString(),
          erro: `Fonte '${nome}' não reconhecida`,
        };
    }
  }

  /**
   * Fetch all data for a given category
   */
  async getAllData(categoria: DataSourceCategory): Promise<Record<string, SourceFetchResult>> {
    const sources = this.getSourcesByCategory(categoria);
    const results: Record<string, SourceFetchResult> = {};

    const promises = sources.map(async (source) => {
      try {
        results[source.nome] = await this.fetchSource(source.nome);
      } catch (error) {
        results[source.nome] = {
          dados: null,
          fonte: 'fallback',
          latenciaMs: 0,
          atualizadoEm: new Date().toISOString(),
          erro: error instanceof Error ? error.message : 'Erro desconhecido',
        };
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Run a health check on all sources (quick ping)
   */
  async healthCheck(): Promise<{ total: number; online: number; degraded: number; offline: number; unknown: number }> {
    const sources = this.getSourceStatus();
    const counts = { total: sources.length, online: 0, degraded: 0, offline: 0, unknown: 0 };

    for (const source of sources) {
      counts[source.status]++;
    }

    return counts;
  }

  /**
   * Probes all registered sources with a lightweight HEAD/GET request and
   * updates their status accordingly. Intended to populate the dashboard
   * status even when individual sources haven't been consumed yet.
   *
   * Semantics: any HTTP response (2xx, 3xx, 4xx) counts as "online" —
   * it means the endpoint is reachable. Only network errors, DNS failures,
   * or timeouts flip the status to "offline". HTTP 5xx → "degraded".
   */
  async probeAllSources(options?: {
    concurrency?: number;
    timeoutMs?: number;
  }): Promise<{
    probed: number;
    online: number;
    degraded: number;
    offline: number;
    durationMs: number;
  }> {
    const concurrency = options?.concurrency ?? 6;
    const timeoutMs = options?.timeoutMs ?? 4000;
    const entries = Array.from(this.registry.values());
    const started = Date.now();
    const summary = { probed: 0, online: 0, degraded: 0, offline: 0 };

    const axiosProbe = (await import('axios')).default;

    const probeOne = async (entry: DataSourceEntry) => {
      const start = Date.now();
      try {
        const resp = await axiosProbe.request({
          method: 'GET',
          url: entry.url,
          timeout: timeoutMs,
          maxContentLength: 2048,
          maxBodyLength: 2048,
          validateStatus: () => true,
          responseType: 'text',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; ALETIS-HealthCheck/1.0; +https://aletis.com.br)',
            Accept: '*/*',
          },
        });
        const latencia = Date.now() - start;
        if (resp.status >= 500) {
          this.updateSourceStatus(entry.nome, 'degraded', latencia, `HTTP ${resp.status}`);
          summary.degraded++;
        } else {
          // 2xx, 3xx, 4xx — endpoint responde. 4xx geralmente é falta de parâmetro.
          this.updateSourceStatus(entry.nome, 'online', latencia);
          summary.online++;
        }
      } catch (error) {
        const latencia = Date.now() - start;
        const msg = error instanceof Error ? error.message : 'probe failed';
        this.updateSourceStatus(entry.nome, 'offline', latencia, msg);
        summary.offline++;
      }
      summary.probed++;
    };

    // Paralelismo limitado
    const queue = [...entries];
    const workers: Promise<void>[] = [];
    const runner = async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        await probeOne(next);
      }
    };
    for (let i = 0; i < Math.min(concurrency, entries.length); i++) {
      workers.push(runner());
    }
    await Promise.all(workers);

    return { ...summary, durationMs: Date.now() - started };
  }

  // ── Summary for Dashboard ────────────────────────────────

  /**
   * Returns a summary object suitable for the dashboard
   */
  getDashboardStatus(): {
    fontes: DataSourceEntry[];
    resumo: { total: number; online: number; degraded: number; offline: number; unknown: number };
    ultimaVerificacao: string;
  } {
    const fontes = this.getSourceStatus();
    const resumo = { total: fontes.length, online: 0, degraded: 0, offline: 0, unknown: 0 };

    for (const f of fontes) {
      resumo[f.status]++;
    }

    return {
      fontes,
      resumo,
      ultimaVerificacao: new Date().toISOString(),
    };
  }

  // ── Private Helpers ──────────────────────────────────────

  private async wrapResult(
    nome: string,
    fetcher: () => Promise<unknown>
  ): Promise<SourceFetchResult> {
    const start = Date.now();
    try {
      const dados = await fetcher();
      const latenciaMs = Date.now() - start;
      return {
        dados,
        fonte: 'api',
        latenciaMs,
        atualizadoEm: new Date().toISOString(),
      };
    } catch (error) {
      const latenciaMs = Date.now() - start;
      return {
        dados: null,
        fonte: 'fallback',
        latenciaMs,
        atualizadoEm: new Date().toISOString(),
        erro: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Reset error counts (called periodically)
   */
  resetErrorCounts(): void {
    this.errorCounts.clear();
    for (const [nome, entry] of this.registry) {
      entry.erros24h = 0;
      this.registry.set(nome, entry);
    }
  }
}

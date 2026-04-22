// ============================================================
// ALETIS — BCB SICOR (OLINDA OData v2) — Wave 8c
// ============================================================
//
// Sistema de Operações do Crédito Rural (SICOR). Fornece leitura
// direta de contratos agregados por (UF, produto, mês, programa,
// modalidade) via OData v4 público do portal OLINDA.
//
// Base: https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/
//
// EntitySets descobertos em sondagem inicial do /$metadata:
//   • CusteioRegiaoUFProduto       — custeio por região/UF/produto
//   • InvestRegiaoUFProduto        — investimento por região/UF/produto
//   • ComercRegiaoUFProduto        — comercialização por região/UF/produto
//   • CusteioMunicipioProduto      — custeio por município/produto
//   • InvestMunicipioProduto       — investimento por município/produto
//   • CusteioInvestimentoComercialIndustrialSemFiltros  — agregado geral
//   • ProgramaSubprograma, ProgramaSubprogramaRegiaoUF
//   • FonteRecursos, FonteRecursosIF
//   • SegmentoIF, SegmentoIFRegiaoUF, SegmentoTipoPessoa
//   • RegiaoUF, RegiaoUFGenero, Faixa, FaixaUF
//
// Os 3 EntitySets escolhidos são os únicos usados pelo Alix:
//   custeio | investimento | comercialização — por UF/produto/mês.
//
// Campos típicos (ver `packages/shared-types/src/sicor.ts`):
//   nomeProduto, nomeRegiao, nomeUF, AnoEmissao, MesEmissao,
//   cdPrograma, cdSubPrograma, cdFonteRecurso, cdTipoSeguro,
//   QtdCusteio/QtdInvest/QtdComerc, VlCusteio/VlInvest/VlComerc,
//   Atividade, cdModalidade, AreaCusteio (só custeio).
//
// TTL: 6h — dados SICOR publicados mensalmente.
// Fallback: apps/api/storage/sicor_fallback.json
// ============================================================

import axios, { type AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { DataSourceManager } from '../DataSourceManager.js';
import type {
  ContratoSicor,
  FonteDadosSicor,
  ModalidadeSicor,
  ParametrosConsultaSicor,
  RespostaConsultaSicor,
  ResumoSicorUfAno,
} from '@aletis/shared-types/src/sicor.js';

// ── Paths & constants ───────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FALLBACK_PATH = join(__dirname, '../../../storage/sicor_fallback.json');

const SICOR_BASE_URL =
  'https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/';

const ENTITY_SET_BY_MODALIDADE: Record<ModalidadeSicor, string> = {
  custeio: 'CusteioRegiaoUFProduto',
  investimento: 'InvestRegiaoUFProduto',
  comercializacao: 'ComercRegiaoUFProduto',
};

const QTD_FIELD_BY_MODALIDADE: Record<ModalidadeSicor, string> = {
  custeio: 'QtdCusteio',
  investimento: 'QtdInvest',
  comercializacao: 'QtdComerc',
};

const VALOR_FIELD_BY_MODALIDADE: Record<ModalidadeSicor, string> = {
  custeio: 'VlCusteio',
  investimento: 'VlInvest',
  comercializacao: 'VlComerc',
};

const AREA_FIELD_BY_MODALIDADE: Record<ModalidadeSicor, string | null> = {
  custeio: 'AreaCusteio',
  investimento: null,
  comercializacao: null,
};

// Lista curada de UFs válidas — serve como whitelist para $filter.
const UFS_VALIDAS = new Set([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
  'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]);

// ── Fallback type ───────────────────────────────────────────

interface SicorFallback {
  atualizadoEm: string;
  periodo: string;
  observacoes: string;
  contratos: Array<ContratoSicor & { modalidade: ModalidadeSicor }>;
}

// ── Service ─────────────────────────────────────────────────

export class SicorBacenService {
  private readonly cache: NodeCache;
  private readonly http: AxiosInstance;
  private readonly manager: DataSourceManager;
  private fallback: SicorFallback | null = null;

  constructor(manager: DataSourceManager) {
    this.manager = manager;
    // TTL 6h — dados SICOR publicados mensalmente.
    this.cache = new NodeCache({ stdTTL: 21_600, checkperiod: 3_600, useClones: false });
    this.http = axios.create({
      baseURL: SICOR_BASE_URL,
      timeout: 15_000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ALETIS-System/1.0 (+https://aletis.com.br)',
      },
      // OData é chato com espaços codificados como "+"; força %20
      // (usa encodeURIComponent, compatível com URL literal de espaços).
      paramsSerializer: {
        serialize: (p: Record<string, unknown>) =>
          Object.entries(p)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(
              ([k, v]) =>
                `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
            )
            .join('&'),
      },
    });
  }

  // ── Public: consultas por modalidade ─────────────────────

  async buscarContratosCusteio(
    params: ParametrosConsultaSicor = {}
  ): Promise<RespostaConsultaSicor> {
    return this.buscarPorModalidade('custeio', params);
  }

  async buscarContratosInvestimento(
    params: ParametrosConsultaSicor = {}
  ): Promise<RespostaConsultaSicor> {
    return this.buscarPorModalidade('investimento', params);
  }

  async buscarContratosComercializacao(
    params: ParametrosConsultaSicor = {}
  ): Promise<RespostaConsultaSicor> {
    return this.buscarPorModalidade('comercializacao', params);
  }

  // ── Public: resumo UF × ano consolidado ──────────────────

  async resumoUfAno(uf: string, ano: number): Promise<ResumoSicorUfAno> {
    const ufNorm = (uf || '').toUpperCase().trim();
    if (!UFS_VALIDAS.has(ufNorm)) {
      throw new Error(`UF inválida: "${uf}". Use sigla de 2 letras (ex: MT, SP).`);
    }
    if (!Number.isInteger(ano) || ano < 2013 || ano > 2100) {
      throw new Error(`Ano inválido: ${ano}. Use um inteiro entre 2013 e ${new Date().getFullYear() + 1}.`);
    }

    const cacheKey = `resumo_${ufNorm}_${ano}`;
    const cached = this.cache.get<ResumoSicorUfAno>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const anoMesInicial = `${ano}01`;
    const anoMesFinal = `${ano}12`;
    const filtros: ParametrosConsultaSicor = {
      uf: ufNorm,
      anoMesInicial,
      anoMesFinal,
      top: 1000,
    };

    const [custeio, investimento, comercializacao] = await Promise.all([
      this.buscarContratosCusteio(filtros).catch(() => null),
      this.buscarContratosInvestimento(filtros).catch(() => null),
      this.buscarContratosComercializacao(filtros).catch(() => null),
    ]);

    const modalidades = [
      { mod: 'custeio' as const, resp: custeio },
      { mod: 'investimento' as const, resp: investimento },
      { mod: 'comercializacao' as const, resp: comercializacao },
    ];

    // Se todas as três modalidades caíram (ou só retornaram fallback),
    // marcamos a fonte consolidada como fallback.
    const algumDaApi = modalidades.some((m) => m.resp?.fonte === 'api');
    const todosFallback = modalidades.every((m) => !m.resp || m.resp.fonte === 'fallback');

    let valorTotalBRL = 0;
    let totalContratos = 0;
    const porProduto = new Map<string, { valorBRL: number; contratos: number }>();
    const porModalidade: ResumoSicorUfAno['porModalidade'] = [];

    for (const { mod, resp } of modalidades) {
      const valor = resp?.valorTotal ?? 0;
      const contratos = resp?.total ?? 0;
      valorTotalBRL += valor;
      totalContratos += contratos;
      porModalidade.push({
        modalidade: mod,
        valorBRL: Math.round(valor * 100) / 100,
        contratos,
        participacaoPercentual: 0, // preenchido abaixo
      });

      for (const c of resp?.contratos ?? []) {
        const cur = porProduto.get(c.nomeProduto) ?? { valorBRL: 0, contratos: 0 };
        cur.valorBRL += c.valorContratado;
        cur.contratos += c.qtdContratos;
        porProduto.set(c.nomeProduto, cur);
      }
    }

    // Calcula participação por modalidade
    for (const m of porModalidade) {
      m.participacaoPercentual = valorTotalBRL > 0
        ? Math.round((m.valorBRL / valorTotalBRL) * 10_000) / 100
        : 0;
    }

    const topProdutos = [...porProduto.entries()]
      .sort((a, b) => b[1].valorBRL - a[1].valorBRL)
      .slice(0, 10)
      .map(([produto, v]) => ({
        produto,
        valorBRL: Math.round(v.valorBRL * 100) / 100,
        contratos: v.contratos,
        participacaoPercentual: valorTotalBRL > 0
          ? Math.round((v.valorBRL / valorTotalBRL) * 10_000) / 100
          : 0,
      }));

    const ticketMedioBRL = totalContratos > 0
      ? Math.round((valorTotalBRL / totalContratos) * 100) / 100
      : 0;

    const fonte: FonteDadosSicor = algumDaApi ? 'api' : todosFallback ? 'fallback' : 'api';

    const result: ResumoSicorUfAno = {
      uf: ufNorm,
      ano,
      valorTotalBRL: Math.round(valorTotalBRL * 100) / 100,
      totalContratos,
      ticketMedioBRL,
      porModalidade,
      topProdutos,
      fonte,
      atualizadoEm: new Date().toISOString(),
      observacoes: todosFallback
        ? 'OData OLINDA indisponível — números estimados a partir de fallback curado.'
        : undefined,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  // ── Private: consulta genérica por modalidade ────────────

  private async buscarPorModalidade(
    modalidade: ModalidadeSicor,
    params: ParametrosConsultaSicor
  ): Promise<RespostaConsultaSicor> {
    const filtros = this.normalizarParams(params);
    const cacheKey = `mod_${modalidade}_${JSON.stringify(filtros)}`;
    const cached = this.cache.get<RespostaConsultaSicor>(cacheKey);
    if (cached) return { ...cached, fonte: 'cache' };

    const entitySet = ENTITY_SET_BY_MODALIDADE[modalidade];
    const qtdField = QTD_FIELD_BY_MODALIDADE[modalidade];
    const valorField = VALOR_FIELD_BY_MODALIDADE[modalidade];
    const areaField = AREA_FIELD_BY_MODALIDADE[modalidade];

    const start = Date.now();
    try {
      const odataFilter = this.montarFilter(filtros);
      const top = Math.min(Math.max(filtros.top ?? 500, 1), 5000);
      const skip = Math.max(filtros.skip ?? 0, 0);

      // $skip=0 dispara HTTP 500 no SICOR OLINDA — só envia se > 0.
      const response = await this.http.get(entitySet, {
        params: {
          $top: String(top),
          ...(skip > 0 ? { $skip: String(skip) } : {}),
          ...(odataFilter ? { $filter: odataFilter } : {}),
          $format: 'json',
        },
      });

      const items = Array.isArray(response.data?.value) ? response.data.value : [];
      const contratos = items.map((it: Record<string, unknown>) =>
        this.mapItemToContrato(modalidade, it, qtdField, valorField, areaField)
      );

      const valorTotal = contratos.reduce((s: number, c: ContratoSicor) => s + c.valorContratado, 0);
      const areaTotalHa = contratos.reduce(
        (s: number, c: ContratoSicor) => s + (c.areaFinanciada ?? 0),
        0
      );
      const totalContratos = contratos.reduce(
        (s: number, c: ContratoSicor) => s + c.qtdContratos,
        0
      );
      const ticketMedio = totalContratos > 0 ? valorTotal / totalContratos : 0;

      const result: RespostaConsultaSicor = {
        modalidade,
        contratos,
        total: totalContratos,
        valorTotal: Math.round(valorTotal * 100) / 100,
        areaTotalHa: Math.round(areaTotalHa * 100) / 100,
        ticketMedio: Math.round(ticketMedio * 100) / 100,
        filtros,
        fonte: 'api',
        atualizadoEm: new Date().toISOString(),
      };

      this.cache.set(cacheKey, result);
      this.manager.updateSourceStatus('sicor_bacen', 'online', Date.now() - start);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.warn(`[SICOR] OData ${modalidade} falhou: ${msg}. Usando fallback.`);
      this.manager.updateSourceStatus('sicor_bacen', 'degraded', Date.now() - start, msg);
      return this.fallbackPorModalidade(modalidade, filtros);
    }
  }

  // ── Private: fallback por modalidade ─────────────────────

  private fallbackPorModalidade(
    modalidade: ModalidadeSicor,
    filtros: ParametrosConsultaSicor
  ): RespostaConsultaSicor {
    const fb = this.loadFallback();
    const contratos = fb.contratos
      .filter((c) => c.modalidade === modalidade)
      .filter((c) => {
        if (filtros.uf && c.nomeUF !== filtros.uf) return false;
        if (filtros.produto && !c.nomeProduto.toUpperCase().includes(filtros.produto.toUpperCase())) {
          return false;
        }
        const anoMes = `${c.anoEmissao}${c.mesEmissao}`;
        if (filtros.anoMesInicial && anoMes < filtros.anoMesInicial) return false;
        if (filtros.anoMesFinal && anoMes > filtros.anoMesFinal) return false;
        return true;
      })
      .slice(0, filtros.top ?? 500);

    const valorTotal = contratos.reduce((s, c) => s + c.valorContratado, 0);
    const areaTotalHa = contratos.reduce((s, c) => s + (c.areaFinanciada ?? 0), 0);
    const totalContratos = contratos.reduce((s, c) => s + c.qtdContratos, 0);
    const ticketMedio = totalContratos > 0 ? valorTotal / totalContratos : 0;

    return {
      modalidade,
      contratos,
      total: totalContratos,
      valorTotal: Math.round(valorTotal * 100) / 100,
      areaTotalHa: Math.round(areaTotalHa * 100) / 100,
      ticketMedio: Math.round(ticketMedio * 100) / 100,
      filtros,
      fonte: 'fallback',
      atualizadoEm: fb.atualizadoEm,
    };
  }

  // ── Private: mapeia item OData → ContratoSicor ───────────

  private mapItemToContrato(
    modalidade: ModalidadeSicor,
    it: Record<string, unknown>,
    qtdField: string,
    valorField: string,
    areaField: string | null
  ): ContratoSicor {
    const num = (v: unknown): number => {
      if (v === null || v === undefined || v === '') return 0;
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n : 0;
    };
    const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

    const area = areaField ? num(it[areaField]) : 0;

    // O OData do SICOR retorna nomeProduto com aspas duplas
    // embutidas literalmente (ex: "\"SOJA\""). Normalizamos aqui.
    const produtoBruto = str(it.nomeProduto);
    const produtoLimpo = produtoBruto.replace(/^"(.*)"$/, '$1').trim();

    return {
      modalidade,
      nomeProduto: produtoLimpo,
      nomeRegiao: str(it.nomeRegiao),
      nomeUF: str(it.nomeUF).toUpperCase(),
      anoEmissao: str(it.AnoEmissao),
      mesEmissao: String(str(it.MesEmissao)).padStart(2, '0'),
      cdPrograma: str(it.cdPrograma),
      cdSubPrograma: str(it.cdSubPrograma),
      cdFonteRecurso: str(it.cdFonteRecurso),
      cdTipoSeguro: str(it.cdTipoSeguro),
      qtdContratos: Math.round(num(it[qtdField])),
      valorContratado: num(it[valorField]),
      areaFinanciada: areaField ? (area || null) : null,
      atividade: str(it.Atividade),
      cdModalidade: str(it.cdModalidade),
    };
  }

  // ── Private: monta $filter OData ─────────────────────────
  //
  // Nota: o OData SICOR é sensível a filtros compostos com
  // disjunções aninhadas (retorna HTTP 500 em alguns casos).
  // Usamos uma estratégia simples e defensiva: filtros conjuntivos
  // ("and" apenas), com semântica de mês aplicada SOMENTE quando
  // o intervalo cai num único ano. Para intervalos multi-ano, o
  // filtro cai em ano-apenas (e a janela de mês vira filtro
  // client-side no mapItemToContrato consumer, se necessário).

  private montarFilter(params: ParametrosConsultaSicor): string | null {
    const clauses: string[] = [];

    if (params.uf) {
      clauses.push(`nomeUF eq '${this.escapeOData(params.uf)}'`);
    }

    if (params.produto) {
      // O OData SICOR retorna produtos com aspas duplas embutidas
      // no valor (ex: nomeProduto = "\"SOJA\""). Para filtrar
      // corretamente precisamos incluir essas aspas no literal.
      const prod = params.produto.toUpperCase().replace(/^"|"$/g, '');
      clauses.push(`nomeProduto eq '${this.escapeOData(`"${prod}"`)}'`);
    }

    const { ano: anoIni, mes: mesIni } = params.anoMesInicial
      ? this.parseAnoMes(params.anoMesInicial)
      : { ano: '', mes: '' };
    const { ano: anoFim, mes: mesFim } = params.anoMesFinal
      ? this.parseAnoMes(params.anoMesFinal)
      : { ano: '', mes: '' };

    if (anoIni && anoFim && anoIni === anoFim) {
      // Mesmo ano — filtra mês APENAS se for um intervalo estrito
      // (não cobre o ano inteiro). O OData devolve 500 em filtros
      // redundantes tipo MesEmissao ge '01' and MesEmissao le '12'.
      clauses.push(`AnoEmissao eq '${anoIni}'`);
      const inicioEmJaneiro = !mesIni || mesIni === '01';
      const fimEmDezembro = !mesFim || mesFim === '12';
      if (!(inicioEmJaneiro && fimEmDezembro)) {
        if (mesIni && mesIni !== '01') clauses.push(`MesEmissao ge '${mesIni}'`);
        if (mesFim && mesFim !== '12') clauses.push(`MesEmissao le '${mesFim}'`);
      }
    } else {
      if (anoIni) clauses.push(`AnoEmissao ge '${anoIni}'`);
      if (anoFim) clauses.push(`AnoEmissao le '${anoFim}'`);
    }

    return clauses.length > 0 ? clauses.join(' and ') : null;
  }

  private parseAnoMes(anoMes: string): { ano: string; mes: string } {
    const s = String(anoMes).replace(/\D/g, '');
    if (s.length < 5) {
      return { ano: s.slice(0, 4), mes: '01' };
    }
    return { ano: s.slice(0, 4), mes: s.slice(4, 6).padStart(2, '0') };
  }

  private escapeOData(s: string): string {
    return String(s).replace(/'/g, "''");
  }

  private normalizarParams(params: ParametrosConsultaSicor): ParametrosConsultaSicor {
    const out: ParametrosConsultaSicor = {};
    if (params.uf) {
      const uf = String(params.uf).toUpperCase().trim();
      if (UFS_VALIDAS.has(uf)) out.uf = uf;
    }
    if (params.produto) {
      out.produto = String(params.produto).trim();
    }
    if (params.anoMesInicial) {
      out.anoMesInicial = String(params.anoMesInicial).replace(/\D/g, '').slice(0, 6);
    }
    if (params.anoMesFinal) {
      out.anoMesFinal = String(params.anoMesFinal).replace(/\D/g, '').slice(0, 6);
    }
    if (params.top !== undefined) {
      const t = Number(params.top);
      if (Number.isFinite(t)) out.top = Math.min(Math.max(Math.floor(t), 1), 5000);
    }
    if (params.skip !== undefined) {
      const s = Number(params.skip);
      if (Number.isFinite(s)) out.skip = Math.max(Math.floor(s), 0);
    }
    return out;
  }

  // ── Private: load fallback (lazy) ────────────────────────

  private loadFallback(): SicorFallback {
    if (this.fallback) return this.fallback;
    try {
      const raw = readFileSync(FALLBACK_PATH, 'utf8');
      this.fallback = JSON.parse(raw) as SicorFallback;
      return this.fallback;
    } catch (error) {
      console.warn(
        `[SICOR] Nao foi possivel carregar fallback (${FALLBACK_PATH}): ${String(error)}`
      );
      this.fallback = {
        atualizadoEm: new Date().toISOString(),
        periodo: 'n/d',
        observacoes: 'Fallback indisponível.',
        contratos: [],
      };
      return this.fallback;
    }
  }
}

// ── Singleton accessor (optional) ───────────────────────────
let singleton: SicorBacenService | null = null;

export function getSicorService(manager: DataSourceManager): SicorBacenService {
  if (!singleton) singleton = new SicorBacenService(manager);
  return singleton;
}

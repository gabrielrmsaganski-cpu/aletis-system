// ============================================================
// ContractExtractor — Extração estruturada de contratos de crédito rural
// Estratégia: Map-Reduce por cláusulas para contratos longos
// ============================================================

import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js';
import { getModelForRole } from '../../llm/LLMConfig.js';
import type { IngestedDocument } from '../intake/types.js';
import type { ContratoExtractedData, ExtractedEntity, DocumentEvidence, GarantiaTipo, ClausulaRiscoTipo } from '@aletis/shared-types';

const MAP_MODEL = getModelForRole('doc_extractor');
const REDUCE_MODEL = getModelForRole('doc_analyzer');
const MAX_CHUNKS = 40;
const TARGET_CHUNK_CHARS = 12_000;
const MIN_CHUNK_CHARS = 400;
const MAP_CONCURRENCY = 4;

function splitOversized(value: string, maxChars = TARGET_CHUNK_CHARS): string[] {
  if (value.length <= maxChars) return [value];
  const pieces: string[] = [];
  let rest = value.trim();
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const breakAt = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('. '));
    const end = breakAt >= Math.floor(maxChars * 0.55) ? breakAt + 1 : maxChars;
    pieces.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

// ── Regex para quebrar contrato em chunks por cláusula/seção ──
function splitIntoChunks(text: string): string[] {
  // Padrão: CLÁUSULA N (título), SEÇÃO X, CAPÍTULO N, PARÁGRAFO N
  const clauseRegex = /\b(CL[ÁA]USULA\s+\d+[ºo°]?|SE[ÇC][ÃA]O\s+\w+|CAP[ÍI]TULO\s+\w+|PAR[ÁA]GRAFO\s+\d+[ºo°]?)\b/gi;

  const boundaries: number[] = [0];
  let m: RegExpExecArray | null;
  while ((m = clauseRegex.exec(text)) !== null) {
    boundaries.push(m.index);
  }
  boundaries.push(text.length);

  const sections: string[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const chunk = text.slice(start, end).trim();
    if (chunk.length >= MIN_CHUNK_CHARS) {
      sections.push(chunk);
    } else if (sections.length > 0) {
      // Junta chunk pequeno ao anterior
      sections[sections.length - 1] += '\n\n' + chunk;
    } else {
      sections.push(chunk);
    }
  }

  const expanded = sections.flatMap((section) => splitOversized(section));
  const chunks: string[] = [];
  for (const section of expanded) {
    const previous = chunks[chunks.length - 1];
    if (previous && previous.length + section.length + 2 <= TARGET_CHUNK_CHARS) {
      chunks[chunks.length - 1] = `${previous}\n\n${section}`;
    } else if (section) {
      chunks.push(section);
    }
  }

  if (chunks.length <= MAX_CHUNKS) return chunks;

  // Contratos excepcionalmente extensos são redistribuídos sem descartar o final.
  const completeText = chunks.join('\n\n');
  const target = Math.ceil(completeText.length / MAX_CHUNKS);
  return Array.from({ length: MAX_CHUNKS }, (_, index) =>
    completeText.slice(index * target, Math.min(completeText.length, (index + 1) * target)).trim(),
  ).filter(Boolean);
}

// ── Prompt de extração por chunk (MAP) ──

const MAP_PROMPT = `Você é um extrator jurídico de contratos de crédito rural brasileiros.
Analise o TRECHO abaixo e extraia entidades em JSON.

Regras:
- NUNCA invente dados. Se não estiver no trecho, omita.
- Responda SOMENTE com JSON válido (sem markdown).
- Extrai apenas o que está neste trecho; não suponha o restante do contrato.
- CPF/CNPJ: apenas dígitos. Valores: número (não formatado).
- Datas: ISO-8601 (YYYY-MM-DD) quando possível.

Formato de saída:
{
  "entidades": [
    {
      "tipo": "pessoa|empresa|endereco|imovel_rural|divida|banco|valor|data|clausula|outro",
      "categoria": "string (ex: devedor, avalista, credor, garantia_real)",
      "nome": "string",
      "cpfCnpj": "string (apenas dígitos)",
      "endereco": "string",
      "valor": number,
      "moeda": "BRL",
      "data": "YYYY-MM-DD",
      "descricao": "string",
      "fonte": "trecho literal do documento",
      "confianca": 0.0-1.0,
      "clause": "identificador da cláusula/seção"
    }
  ],
  "valoresContrato": {
    "valorLiberado": number,
    "valorAtualizado": number,
    "taxaContratadaAa": number,
    "taxaCetAa": number,
    "carenciaMeses": number,
    "prazoMeses": number,
    "indexadorCorrecao": "string"
  },
  "garantias": [
    {"tipo": "hipoteca|penhor|aval|fianca|alienacao_fiduciaria|cedula_credito_rural|outro", "descricao": "string"}
  ],
  "clausulasRisco": [
    {"tipo": "aceleracao|anatocismo|descaracterizacao|multa|mora|penalidade|outro", "texto": "string", "severidade": "baixa|media|alta|critica"}
  ]
}`;

interface MapResult {
  entidades: ExtractedEntity[];
  valoresContrato?: {
    valorLiberado?: number;
    valorAtualizado?: number;
    taxaContratadaAa?: number;
    taxaCetAa?: number;
    carenciaMeses?: number;
    prazoMeses?: number;
    indexadorCorrecao?: string;
  };
  garantias?: Array<{ tipo: string; descricao: string }>;
  clausulasRisco?: Array<{ tipo: string; texto: string; severidade: string }>;
}

const ENTITY_SCHEMA = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: ['pessoa', 'empresa', 'endereco', 'imovel_rural', 'divida', 'banco', 'valor', 'data', 'clausula', 'outro'] },
    categoria: { type: 'string' }, nome: { type: 'string' }, cpfCnpj: { type: 'string' },
    endereco: { type: 'string' }, valor: { type: 'number' }, moeda: { type: 'string' },
    data: { type: 'string' }, descricao: { type: 'string' }, fonte: { type: 'string' },
    confianca: { type: 'number', minimum: 0, maximum: 1 }, clause: { type: 'string' },
  },
  required: ['tipo', 'categoria', 'fonte', 'confianca'],
};

const MAP_SCHEMA = {
  type: 'object',
  properties: {
    entidades: { type: 'array', items: ENTITY_SCHEMA },
    valoresContrato: {
      type: 'object',
      properties: {
        valorLiberado: { type: 'number' }, valorAtualizado: { type: 'number' },
        taxaContratadaAa: { type: 'number' }, taxaCetAa: { type: 'number' },
        carenciaMeses: { type: 'number' }, prazoMeses: { type: 'number' }, indexadorCorrecao: { type: 'string' },
      },
    },
    garantias: { type: 'array', items: { type: 'object', properties: { tipo: { type: 'string' }, descricao: { type: 'string' } }, required: ['tipo', 'descricao'] } },
    clausulasRisco: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['aceleracao', 'anatocismo', 'descaracterizacao', 'multa', 'mora', 'penalidade', 'outro'] },
          texto: { type: 'string' }, severidade: { type: 'string', enum: ['baixa', 'media', 'alta', 'critica'] },
        },
        required: ['tipo', 'texto', 'severidade'],
      },
    },
  },
  required: ['entidades', 'valoresContrato', 'garantias', 'clausulasRisco'],
};

async function extractChunk(chunk: string, chunkIndex: number, totalChunks: number): Promise<MapResult> {
  const context = `[TRECHO ${chunkIndex + 1}/${totalChunks}]\n${chunk}`;
  try {
    const result = await generateStructured<MapResult>(
      [{ role: 'user', content: context }],
      {
        name: 'mapa_trecho_contrato',
        schema: MAP_SCHEMA,
        model: MAP_MODEL,
        maxTokens: 1500,
        system: MAP_PROMPT,
        reasoning: { effort: 'low' },
      },
    );
    const parsed = result.data;
    return {
      entidades: (Array.isArray(parsed.entidades) ? parsed.entidades : [])
        .filter((entity) => containsLiteral(chunk, entity.fonte)),
      valoresContrato: parsed.valoresContrato,
      garantias: Array.isArray(parsed.garantias) ? parsed.garantias : [],
      clausulasRisco: Array.isArray(parsed.clausulasRisco) ? parsed.clausulasRisco : [],
    };
  } catch (err) {
    console.warn(`[ContractExtractor] Map chunk ${chunkIndex + 1}/${totalChunks} falhou:`, (err as Error).message);
    return { entidades: [] };
  }
}

// ── Prompt de consolidação (REDUCE) ──

const REDUCE_PROMPT = `Você é um consolidador jurídico de contratos de crédito rural.
Receba os resultados parciais de extração de múltiplos trechos de um contrato e CONSOLIDE em um único JSON canônico.

Regras de consolidação:
1. Entidades iguais (mesmo CPF ou nome similar) devem ser unificadas, mantendo a mais completa.
2. Valores devem ser consistentes: se houver divergência, escolha o que aparece mais vezes ou no trecho de maior confiança.
3. Garantias duplicadas devem ser deduplicadas.
4. Cláusulas de risco devem ser unificadas (mesmo tipo = uma só, com texto concatenado).
5. Partes: identifique claramente devedor, cônjuge, avalistas, fiadores e credor.
6. Imóveis: se houver CAR, CCIR, matrícula ou endereço rural, classifique como imovel_rural.
7. Taxas: converta para % ao ano (aa) se estiver em outro formato.
8. Responda SOMENTE com JSON válido.

Formato de saída:
{
  "tipoContrato": "credito_rural_pronaf|credito_rural_pronamp|credito_rural_mcr|custeio|investimento|outro",
  "numeroContrato": "string",
  "dataContratacao": "YYYY-MM-DD",
  "dataVencimento": "YYYY-MM-DD",
  "carenciaMeses": number,
  "prazoMeses": number,
  "valorLiberado": number,
  "valorAtualizado": number,
  "taxaContratadaAa": number,
  "taxaCetAa": number,
  "indexadorCorrecao": "string",
  "partes": {
    "devedor": {"nome": "string", "cpfCnpj": "string", "endereco": "string"},
    "conjuge": {"nome": "string", "cpfCnpj": "string"},
    "avalistas": [{"nome": "string", "cpfCnpj": "string"}],
    "fiadores": [{"nome": "string", "cpfCnpj": "string"}]
  },
  "credor": {"nome": "string", "cpfCnpj": "string"},
  "garantias": [{"tipo": "string", "descricao": "string", "valor": number}],
  "imoveisVinculados": [{"nome": "string", "car": "string", "ccir": "string", "matricula": "string", "endereco": "string", "areaHa": number}],
  "clausulasRisco": [{"tipo": "string", "texto": "string", "severidade": "baixa|media|alta|critica", "confianca": 0.0-1.0}],
  "cronogramaAmortizacao": [{"parcela": number, "dataVencimento": "YYYY-MM-DD", "valor": number, "tipo": "string"}],
  "lacunas": ["string"]
}`;

interface ReduceResult {
  tipoContrato?: string;
  numeroContrato?: string;
  dataContratacao?: string;
  dataVencimento?: string;
  carenciaMeses?: number;
  prazoMeses?: number;
  valorLiberado?: number;
  valorAtualizado?: number;
  taxaContratadaAa?: number;
  taxaCetAa?: number;
  indexadorCorrecao?: string;
  partes?: {
    devedor?: Record<string, unknown>;
    conjuge?: Record<string, unknown>;
    avalistas?: Record<string, unknown>[];
    fiadores?: Record<string, unknown>[];
  };
  credor?: Record<string, unknown>;
  garantias?: Array<Record<string, unknown>>;
  imoveisVinculados?: Array<Record<string, unknown>>;
  clausulasRisco?: Array<Record<string, unknown>>;
  cronogramaAmortizacao?: Array<Record<string, unknown>>;
  lacunas?: string[];
}

const PARTY_SCHEMA = {
  type: 'object',
  properties: { nome: { type: 'string' }, cpfCnpj: { type: 'string' }, endereco: { type: 'string' }, fonte: { type: 'string' } },
  required: ['nome', 'fonte'],
};

const REDUCE_SCHEMA = {
  type: 'object',
  properties: {
    tipoContrato: { type: 'string', enum: ['credito_rural_pronaf', 'credito_rural_pronamp', 'credito_rural_mcr', 'custeio', 'investimento', 'outro'] },
    numeroContrato: { type: 'string' }, dataContratacao: { type: 'string' }, dataVencimento: { type: 'string' },
    carenciaMeses: { type: 'number' }, prazoMeses: { type: 'number' }, valorLiberado: { type: 'number' },
    valorAtualizado: { type: 'number' }, taxaContratadaAa: { type: 'number' }, taxaCetAa: { type: 'number' },
    indexadorCorrecao: { type: 'string' },
    partes: {
      type: 'object',
      properties: {
        devedor: PARTY_SCHEMA, conjuge: PARTY_SCHEMA,
        avalistas: { type: 'array', items: PARTY_SCHEMA }, fiadores: { type: 'array', items: PARTY_SCHEMA },
      },
      required: ['devedor', 'avalistas', 'fiadores'],
    },
    credor: PARTY_SCHEMA,
    garantias: { type: 'array', items: { type: 'object', properties: { tipo: { type: 'string' }, descricao: { type: 'string' }, valor: { type: 'number' } }, required: ['tipo', 'descricao'] } },
    imoveisVinculados: {
      type: 'array',
      items: {
        type: 'object',
        properties: { nome: { type: 'string' }, car: { type: 'string' }, ccir: { type: 'string' }, matricula: { type: 'string' }, endereco: { type: 'string' }, areaHa: { type: 'number' }, fonte: { type: 'string' } },
        required: ['nome', 'fonte'],
      },
    },
    clausulasRisco: {
      type: 'array',
      items: {
        type: 'object',
        properties: { tipo: { type: 'string' }, texto: { type: 'string' }, severidade: { type: 'string', enum: ['baixa', 'media', 'alta', 'critica'] }, confianca: { type: 'number', minimum: 0, maximum: 1 } },
        required: ['tipo', 'texto', 'severidade', 'confianca'],
      },
    },
    cronogramaAmortizacao: {
      type: 'array',
      items: {
        type: 'object',
        properties: { parcela: { type: 'number' }, dataVencimento: { type: 'string' }, valor: { type: 'number' }, tipo: { type: 'string', enum: ['amortizacao', 'juros', 'parcela'] } },
        required: ['parcela', 'dataVencimento', 'valor', 'tipo'],
      },
    },
    lacunas: { type: 'array', items: { type: 'string' } },
  },
};

async function reduceChunks(mapResults: MapResult[]): Promise<ReduceResult> {
  if (!isOpenAIEnabled()) {
    return {};
  }

  const consolidated = {
    entidades: mapResults.flatMap((m) => m.entidades),
    valoresContrato: mapResults.find((m) => m.valoresContrato)?.valoresContrato,
    garantias: mapResults.flatMap((m) => m.garantias ?? []),
    clausulasRisco: mapResults.flatMap((m) => m.clausulasRisco ?? []),
  };

  const context = JSON.stringify(consolidated, null, 2).slice(0, 180000);

  try {
    const result = await generateStructured<ReduceResult>(
      [{ role: 'user', content: context }],
      {
        name: 'contrato_credito_rural',
        schema: REDUCE_SCHEMA,
        model: REDUCE_MODEL,
        maxTokens: 5000,
        system: REDUCE_PROMPT,
        reasoning: { effort: 'high' },
      },
    );
    return result.data;
  } catch (err) {
    console.warn('[ContractExtractor] Reduce falhou:', (err as Error).message);
    // Fallback: retorna dados brutos consolidados sem estruturar
    return {
      entidades: consolidated.entidades,
      valoresContrato: consolidated.valoresContrato,
      garantias: consolidated.garantias,
      clausulasRisco: consolidated.clausulasRisco,
      lacunas: ['Falha na consolidação final do contrato. Revisão manual recomendada.'],
    } as ReduceResult;
  }
}

// ── Helpers de normalização ──

function normalizedText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function containsLiteral(corpus: string, value: unknown): boolean {
  const quote = normalizedText(value);
  return quote.length >= 3 && normalizedText(corpus).includes(quote);
}

function localizedNumbers(value: unknown): number[] {
  return String(value ?? '').match(/-?\d[\d.\s]*(?:,\d+)?/g)?.map((raw) => {
    const compact = raw.replace(/\s/g, '');
    return Number(compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact);
  }).filter(Number.isFinite) ?? [];
}

function textSupportsNumber(corpus: string, value: unknown): boolean {
  const expected = Number(value);
  if (!Number.isFinite(expected)) return false;
  return localizedNumbers(corpus).some((candidate) =>
    Math.abs(candidate - expected) <= Math.max(0.01, Math.abs(expected) * 0.000001));
}

function toExtractedEntity(r: Record<string, unknown> | undefined, categoria: string, corpus: string): ExtractedEntity | undefined {
  if (!r) return undefined;
  const nome = String(r.nome || r.razaoSocial || r.razao_social || '');
  const fonte = String(r.fonte || '');
  if (!nome || !containsLiteral(corpus, fonte) || !containsLiteral(fonte, nome)) return undefined;
  return {
    tipo: (r.tipo as any) || 'pessoa',
    categoria,
    nome,
    cpfCnpj: normalizeCpfCnpj(r.cpfCnpj || r.cpf || r.cnpj),
    endereco: String(r.endereco || r.enderecoCompleto || r.municipio || ''),
    telefone: String(r.telefone || ''),
    email: String(r.email || ''),
    valor: typeof r.valor === 'number' ? r.valor : undefined,
    moeda: 'BRL',
    data: String(r.data || ''),
    descricao: String(r.descricao || ''),
    fonte,
    confianca: Number(r.confiança ?? r.confianza ?? r.confidence ?? 0.7),
    clause: String(r.clause || ''),
  };
}

function normalizeCpfCnpj(value: unknown): string | undefined {
  if (!value) return undefined;
  const s = String(value).replace(/\D/g, '');
  if (s.length === 11 || s.length === 14) return s;
  return undefined;
}

function inferTipoContrato(reduced: ReduceResult): ContratoExtractedData['tipoContrato'] {
  const text = JSON.stringify(reduced).toLowerCase();
  if (/pronaf/.test(text)) return 'credito_rural_pronaf';
  if (/pronamp/.test(text)) return 'credito_rural_pronamp';
  if (/mcr\s*6|microcr[eé]dito/.test(text)) return 'credito_rural_mcr';
  if (/custeio/.test(text)) return 'custeio';
  if (/investimento/.test(text)) return 'investimento';
  return 'outro';
}

function buildGarantias(reduced: ReduceResult, corpus: string): ContratoExtractedData['garantias'] {
  const raw = Array.isArray(reduced.garantias) ? reduced.garantias : [];
  return raw.filter((g) => containsLiteral(corpus, g.descricao)).map((g) => ({
    tipo: normalizeGarantiaTipo(String(g.tipo)),
    descricao: String(g.descricao || ''),
    valor: typeof g.valor === 'number' ? g.valor : undefined,
  }));
}

function normalizeGarantiaTipo(raw: string): GarantiaTipo {
  const t = raw.toLowerCase();
  if (/hipoteca/.test(t)) return 'hipoteca';
  if (/penhor/.test(t)) return 'penhor';
  if (/aval/.test(t)) return 'aval';
  if (/fian[çc]/.test(t)) return 'fianca';
  if (/fiduci/.test(t)) return 'alienacao_fiduciaria';
  if (/cedula|ccr|cpr/.test(t)) return 'cedula_credito_rural';
  return 'outro';
}

function buildImoveis(reduced: ReduceResult, corpus: string): ExtractedEntity[] {
  const raw = Array.isArray(reduced.imoveisVinculados) ? reduced.imoveisVinculados : [];
  return raw.filter((i) => containsLiteral(corpus, i.fonte)).map((i) => ({
    tipo: 'imovel_rural',
    categoria: 'imovel_garantia',
    nome: String(i.nome || i.municipio || 'Imóvel rural'),
    endereco: String(i.endereco || `${i.municipio || ''}, ${i.uf || ''}`),
    descricao: `CAR: ${i.car || '—'}, CCIR: ${i.ccir || '—'}, Matrícula: ${i.matricula || '—'}`,
    fonte: String(i.fonte || JSON.stringify(i)),
    confianca: Number(i.confiança ?? i.confianza ?? i.confidence ?? 0.6),
  }));
}

function buildClausulasRisco(reduced: ReduceResult, corpus: string): ContratoExtractedData['clausulasRisco'] {
  const raw = Array.isArray(reduced.clausulasRisco) ? reduced.clausulasRisco : [];
  const seen = new Set<string>();
  const out: ContratoExtractedData['clausulasRisco'] = [];
  for (const c of raw) {
    if (!containsLiteral(corpus, c.texto)) continue;
    const tipo = normalizeClausulaRiscoTipo(String(c.tipo));
    const key = `${tipo}:${String(c.texto || '').slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tipo,
      texto: String(c.texto || ''),
      severidade: normalizeSeveridade(String(c.severidade)),
      confianca: Number(c.confiança ?? c.confianza ?? c.confidence ?? 0.6),
    });
  }
  return out;
}

function normalizeClausulaRiscoTipo(raw: string): ClausulaRiscoTipo {
  const t = raw.toLowerCase();
  if (/aceler/.test(t)) return 'aceleracao';
  if (/anatoc/.test(t)) return 'anatocismo';
  if (/descaracteriz/.test(t)) return 'descaracterizacao';
  if (/multa/.test(t)) return 'multa';
  if (/mora/.test(t)) return 'mora';
  if (/penalidade/.test(t)) return 'penalidade';
  return 'outro';
}

function normalizeSeveridade(raw: string): 'baixa' | 'media' | 'alta' | 'critica' {
  const t = raw.toLowerCase();
  if (/critic/.test(t) || /grave/.test(t)) return 'critica';
  if (/alt/.test(t) || /sever/.test(t)) return 'alta';
  if (/medi/.test(t) || /moderad/.test(t)) return 'media';
  return 'baixa';
}

// ── API pública ──

export interface ContractExtractionResult {
  data: ContratoExtractedData;
  evidencias: DocumentEvidence[];
  lacunas: string[];
  confianca: number;
}

export async function extractContract(doc: IngestedDocument): Promise<ContractExtractionResult | null> {
  if (!isOpenAIEnabled()) return null;

  const text = doc.extractedText ?? '';
  if (!text.trim()) return null;

  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return null;

  // Map
  const mapResults = new Array<MapResult>(chunks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(MAP_CONCURRENCY, chunks.length) }, async () => {
    while (cursor < chunks.length) {
      const index = cursor;
      cursor += 1;
      mapResults[index] = await extractChunk(chunks[index], index, chunks.length);
    }
  });
  await Promise.all(workers);

  // Reduce
  const reduced = await reduceChunks(mapResults);

  // Monta ContratoExtractedData
  const tipoContrato = inferTipoContrato(reduced);
  const devedor = toExtractedEntity(reduced.partes?.devedor, 'devedor', text);
  const conjuge = toExtractedEntity(reduced.partes?.conjuge, 'conjuge', text);
  const avalistas = (Array.isArray(reduced.partes?.avalistas) ? reduced.partes!.avalistas! : [])
    .map((a) => toExtractedEntity(a as Record<string, unknown>, 'avalista', text))
    .filter(Boolean) as ExtractedEntity[];
  const fiadores = (Array.isArray(reduced.partes?.fiadores) ? reduced.partes!.fiadores! : [])
    .map((f) => toExtractedEntity(f as Record<string, unknown>, 'fiador', text))
    .filter(Boolean) as ExtractedEntity[];
  const credor = toExtractedEntity(reduced.credor, 'credor', text);

  if (!devedor || !credor) {
    return null;
  }

  const data: ContratoExtractedData = {
    tipoContrato,
    numeroContrato: containsLiteral(text, reduced.numeroContrato) ? String(reduced.numeroContrato) : undefined,
    dataContratacao: containsLiteral(text, reduced.dataContratacao) ? String(reduced.dataContratacao) : undefined,
    dataVencimento: containsLiteral(text, reduced.dataVencimento) ? String(reduced.dataVencimento) : undefined,
    carenciaMeses: textSupportsNumber(text, reduced.carenciaMeses) ? Number(reduced.carenciaMeses) : undefined,
    prazoMeses: textSupportsNumber(text, reduced.prazoMeses) ? Number(reduced.prazoMeses) : undefined,
    valorLiberado: textSupportsNumber(text, reduced.valorLiberado) ? Number(reduced.valorLiberado) : undefined,
    valorAtualizado: textSupportsNumber(text, reduced.valorAtualizado) ? Number(reduced.valorAtualizado) : undefined,
    taxaContratadaAa: textSupportsNumber(text, reduced.taxaContratadaAa) ? Number(reduced.taxaContratadaAa) : undefined,
    taxaCetAa: textSupportsNumber(text, reduced.taxaCetAa) ? Number(reduced.taxaCetAa) : undefined,
    indexadorCorrecao: containsLiteral(text, reduced.indexadorCorrecao) ? String(reduced.indexadorCorrecao) : undefined,
    partes: { devedor, conjuge, avalistas, fiadores },
    credor,
    garantias: buildGarantias(reduced, text),
    imoveisVinculados: buildImoveis(reduced, text),
    clausulasRisco: buildClausulasRisco(reduced, text),
    cronogramaAmortizacao: Array.isArray(reduced.cronogramaAmortizacao)
      ? reduced.cronogramaAmortizacao.map((c) => ({
          parcela: Number(c.parcela) || 0,
          dataVencimento: String(c.dataVencimento || ''),
          valor: Number(c.valor) || 0,
          tipo: String(c.tipo || 'parcela') as any,
        }))
      : undefined,
  };

  // Evidências
  const evidencias: DocumentEvidence[] = [];
  for (const e of mapResults.flatMap((m) => m.entidades)) {
    if (containsLiteral(text, e.fonte) && (e.cpfCnpj || e.valor || (e.nome && e.categoria))) {
      evidencias.push({
        field: e.categoria,
        value: e.cpfCnpj || e.valor || e.nome,
        fonte: e.fonte,
        trecho: e.fonte,
        page: e.page,
        confianca: e.confianca,
      });
    }
  }

  // Lacunas
  const lacunas = Array.isArray(reduced.lacunas)
    ? reduced.lacunas
    : [];
  if (!data.valorLiberado && !data.valorAtualizado) lacunas.push('Valor do contrato não identificado');
  if (!data.dataVencimento) lacunas.push('Data de vencimento não identificada');
  if (data.garantias.length === 0) lacunas.push('Garantias não identificadas');

  // Confiança geral
  const confValues = evidencias.map((e) => e.confianca).filter((n) => Number.isFinite(n));
  const confianca = confValues.length ? confValues.reduce((a, b) => a + b, 0) / confValues.length : 0.5;

  return { data, evidencias, lacunas, confianca };
}

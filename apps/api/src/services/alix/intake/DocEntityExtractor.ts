// ============================================================
// DocEntityExtractor — extração genérica de entidades de docs
// Wave 10-INTAKE-ENHANCEMENT
// ============================================================
// Independente do tipo do documento (PDF, DOCX, XLSX, imagem),
// extrai entidades estruturadas relevantes para CRM / análise:
//   - Pessoas/Empresas (nome, CPF/CNPJ, endereço, contato)
//   - Valores monetários
//   - Datas
//   - Bancos/Instituições
//   - Produtos/Serviços
//   - Referências (contratos, propostas, laudos)
//
// Usa Structured Outputs da OpenAI.
// ============================================================

import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js'
import { getModelForRole } from '../../llm/LLMConfig.js'
import { buildDocumentReadingPlan, boundedReadingNumber, documentReadingCoverage, type DocumentReadingCoverage } from './DocumentReadingPlan.js'
import type { DocumentKind } from './types.js'

const MODEL = getModelForRole('doc_extractor')

export interface DocEntity {
  tipo: 'pessoa' | 'empresa' | 'banco' | 'produto' | 'servico' | 'referencia' | 'valor' | 'data' | 'endereco' | 'outro'
  categoria: string // sub-tipo descritivo, ex: "proprietario", "avalista", "credor", "devedor"
  nome?: string
  cpfCnpj?: string
  endereco?: string
  telefone?: string
  email?: string
  valor?: number
  moeda?: string
  data?: string // ISO-8601 quando possível
  descricao?: string
  fonte: string // trecho do documento que originou a entidade
  confianca: number // 0-1
}

export interface DocEntityExtraction {
  tipoDocumento: string // classificação livre, ex: "Relatório de Análise de Crédito"
  entidades: DocEntity[]
  resumoExecutivo: string // 2-3 frases do que o documento contém
  acoesSugeridas: string[] // ações que o sistema pode tomar automaticamente
  camposEstruturados: Record<string, unknown> // extra: qualquer campo específico do tipo
  readingCoverage?: DocumentReadingCoverage
  fieldConflicts?: Array<{ field: string; values: unknown[] }>
}

const SYSTEM_PROMPT = `Você é um extrator de entidades de documentos comerciais, financeiros e agro brasileiros.

Extraia SEMPRE que possível:
1. **Pessoas e Empresas**: nome completo/razão social, CPF ou CNPJ (apenas dígitos), endereço, telefone, e-mail
2. **Valores monetários**: valor numérico + moeda (BRL/USD)
3. **Datas**: em ISO-YYYY-MM-DD quando possível
4. **Bancos/Instituições**: nome e código se houver
5. **Referências**: números de contrato, proposta, processo, laudo, matrícula
6. **Produtos/Serviços**: descrição do que está sendo contratado/vendido/analisado

Regras:
- NUNCA invente dados. Se não estiver no texto, omita.
- CPF tem 11 dígitos, CNPJ tem 14 dígitos. Normalize removendo pontos/traços.
- Para endereços, extraia completo quando possível (rua, número, bairro, cidade, UF, CEP).
- Se houver múltiplas pessoas, extraia TODAS (proprietário, cônjuge, avalista, sócio, etc).
- Se o documento for uma planilha, extraia as colunas relevantes como entidades.
- Classifique o tipo do documento com base no conteúdo (ex: "Relatório de Análise de Crédito", "Proposta Comercial", "Contrato de Prestação de Serviços", "Extrato Bancário", "Laudo Técnico", "Nota Fiscal", "Documento Pessoal", "Outro").

Responda SOMENTE com JSON válido no formato exato abaixo (sem markdown, sem explicações fora do JSON):

{
  "tipoDocumento": "string",
  "entidades": [
    {
      "tipo": "pessoa|empresa|banco|produto|servico|referencia|valor|data|endereco|outro",
      "categoria": "string (ex: proprietario, avalista, credor, devedor, emissor, analista)",
      "nome": "string opcional",
      "cpfCnpj": "string opcional (apenas digitos)",
      "endereco": "string opcional",
      "telefone": "string opcional",
      "email": "string opcional",
      "valor": number opcional,
      "moeda": "string opcional",
      "data": "YYYY-MM-DD opcional",
      "descricao": "string opcional",
      "fonte": "trecho exato do texto que originou esta entidade",
      "confianca": 0.0-1.0
    }
  ],
  "resumoExecutivo": "string",
  "acoesSugeridas": ["ação 1", "ação 2"],
  "camposEstruturados": [{"campo":"string","valor":"string","fonte":"trecho literal"}]
}

Se não houver entidades identificáveis, retorne entidades vazias e resumoExecutivo descrevendo o tipo do documento.`

async function extractEntitySegment(params: {
  text: string
  filename?: string
  kind?: string
  pageCount?: number
  signal?: AbortSignal
}): Promise<DocEntityExtraction | null> {
  if (!isOpenAIEnabled()) return null

  const text = params.text || ''
  if (!text.trim()) return null

  // Este texto corresponde a um segmento consecutivo do plano de leitura.
  const truncated = text

  const context = `Documento: ${params.filename || 'desconhecido'}\nTipo: ${params.kind || 'desconhecido'}\nPáginas: ${params.pageCount || 'N/A'}\n\n--- CONTEÚDO ---\n${truncated}`

  try {
    const result = await generateStructured<{
      tipoDocumento: string
      entidades: Array<Record<string, unknown>>
      resumoExecutivo: string
      acoesSugeridas: string[]
      camposEstruturados: Array<{ campo: string; valor: string; fonte: string }>
    }>(
      [
        {
          role: 'user',
          content: context,
        } as any,
      ],
      {
        name: 'entidades_documento',
        schema: {
          type: 'object',
          properties: {
            tipoDocumento: { type: 'string' },
            entidades: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tipo: { type: 'string', enum: ['pessoa', 'empresa', 'banco', 'produto', 'servico', 'referencia', 'valor', 'data', 'endereco', 'outro'] },
                  categoria: { type: 'string' }, nome: { type: 'string' }, cpfCnpj: { type: 'string' },
                  endereco: { type: 'string' }, telefone: { type: 'string' }, email: { type: 'string' },
                  valor: { type: 'number' }, moeda: { type: 'string' }, data: { type: 'string' },
                  descricao: { type: 'string' }, fonte: { type: 'string' },
                  confianca: { type: 'number', minimum: 0, maximum: 1 },
                },
                required: ['tipo', 'categoria', 'fonte', 'confianca'],
              },
            },
            resumoExecutivo: { type: 'string' },
            acoesSugeridas: { type: 'array', items: { type: 'string' } },
            camposEstruturados: {
              type: 'array',
              items: {
                type: 'object',
                properties: { campo: { type: 'string' }, valor: { type: 'string' }, fonte: { type: 'string' } },
                required: ['campo', 'valor', 'fonte'],
              },
            },
          },
          required: ['tipoDocumento', 'entidades', 'resumoExecutivo', 'acoesSugeridas', 'camposEstruturados'],
        },
        model: MODEL,
        maxTokens: 4000,
        signal: params.signal,
        system: SYSTEM_PROMPT,
        reasoning: { effort: 'low' },
      },
    )
    const parsed = result.data
    if (!parsed || typeof parsed.tipoDocumento !== 'string' || !Array.isArray(parsed.entidades) || !Array.isArray(parsed.camposEstruturados)) return null

    return {
      tipoDocumento: parsed.tipoDocumento || 'Outro',
      entidades: Array.isArray(parsed.entidades)
        ? parsed.entidades.map(normalizeEntity).filter((entity) => entityIsGrounded(entity, truncated))
        : [],
      resumoExecutivo: parsed.resumoExecutivo || '',
      acoesSugeridas: Array.isArray(parsed.acoesSugeridas) ? parsed.acoesSugeridas : [],
      camposEstruturados: Object.fromEntries(
        (parsed.camposEstruturados || [])
          .filter((item) => containsLiteral(truncated, item.fonte))
          .map((item) => [item.campo, { valor: item.valor, fonte: item.fonte }]),
      ),
    }
  } catch (err) {
    return null
  }
}

/** Todas as faixas são planejadas; orçamento ou falha nunca vira leitura completa. */
export async function extractEntitiesFromDocument(params: {
  text: string; filename?: string; kind?: string; pageCount?: number
}): Promise<DocEntityExtraction | null> {
  if (!isOpenAIEnabled() || !params.text?.trim()) return null
  const plan = buildDocumentReadingPlan({ kind: (params.kind || 'text') as DocumentKind, extractedText: params.text, pageCount: params.pageCount, metadata: {} }, { segmentCharacters: 16_000 })
  const limit = boundedReadingNumber(process.env.ALIX_ENTITY_MAX_SEGMENTS, 16, 1, 64)
  const timeout = boundedReadingNumber(process.env.ALIX_ENTITY_TIMEOUT_MS, 60_000, 1_000, 120_000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const results = new Map<number, DocEntityExtraction>()
  const failed: number[] = []
  let cursor = 0
  try {
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (cursor < Math.min(plan.segments.length, limit) && !controller.signal.aborted) {
        const segment = plan.segments[cursor++]
        const result = await extractEntitySegment({ ...params, text: segment.text, signal: controller.signal })
        if (result) results.set(segment.index, result)
        else failed.push(segment.index)
      }
    }))
  } finally { clearTimeout(timer) }
  const ordered = [...results].sort((a, b) => a[0] - b[0]).map(([, result]) => result)
  const entities = new Map<string, DocEntity>()
  for (const result of ordered) for (const entity of result.entidades) {
    const key = JSON.stringify({ ...entity, confianca: undefined })
    if (!entities.has(key) || entities.get(key)!.confianca < entity.confianca) entities.set(key, entity)
  }
  const fields: Record<string, unknown> = {}
  const variants = new Map<string, unknown[]>()
  for (const result of ordered) for (const [field, value] of Object.entries(result.camposEstruturados)) {
    const previous = variants.get(field) || []
    if (!previous.some(item => JSON.stringify(item) === JSON.stringify(value))) previous.push(value)
    variants.set(field, previous)
    if (!(field in fields)) fields[field] = value
  }
  const fieldConflicts = [...variants].filter(([, values]) => values.length > 1).map(([field, values]) => ({ field, values }))
  const limitations = []
  if (plan.segments.length > limit) limitations.push(`Limite de ${limit} segmentos por extração automática; a análise profunda permite continuar a leitura.`)
  if (controller.signal.aborted) limitations.push('Tempo desta rodada de extração atingido; há segmentos pendentes.')
  if (fieldConflicts.length) limitations.push(`${fieldConflicts.length} campo(s) com versões documentais divergentes preservadas para revisão.`)
  return {
    tipoDocumento: ordered[0]?.tipoDocumento || 'Outro',
    entidades: [...entities.values()],
    resumoExecutivo: ordered.map(result => result.resumoExecutivo).filter(Boolean).join('\n'),
    acoesSugeridas: [...new Set(ordered.flatMap(result => result.acoesSugeridas))],
    camposEstruturados: fields, fieldConflicts,
    readingCoverage: documentReadingCoverage(plan, results.keys(), failed, limitations),
  }
}

function normalizeEntity(e: any): DocEntity {
  return {
    tipo: ['pessoa', 'empresa', 'banco', 'produto', 'servico', 'referencia', 'valor', 'data', 'endereco', 'outro'].includes(e?.tipo)
      ? e.tipo
      : 'outro',
    categoria: String(e?.categoria || 'outro'),
    nome: e?.nome ? String(e.nome) : undefined,
    cpfCnpj: normalizeCpfCnpj(e?.cpfCnpj),
    endereco: e?.endereco ? String(e.endereco) : undefined,
    telefone: e?.telefone ? String(e.telefone) : undefined,
    email: e?.email ? String(e.email) : undefined,
    valor: typeof e?.valor === 'number' ? e.valor : undefined,
    moeda: e?.moeda ? String(e.moeda) : undefined,
    data: e?.data ? String(e.data) : undefined,
    descricao: e?.descricao ? String(e.descricao) : undefined,
    fonte: String(e?.fonte || ''),
    confianca: Math.min(1, Math.max(0, Number(e?.confianca || 0))),
  }
}

function normalizedText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function containsLiteral(corpus: string, value: unknown): boolean {
  const quote = normalizedText(value)
  return quote.length >= 3 && normalizedText(corpus).includes(quote)
}

function entityIsGrounded(entity: DocEntity, corpus: string): boolean {
  if (!containsLiteral(corpus, entity.fonte)) return false
  if (entity.cpfCnpj && !entity.fonte.replace(/\D/g, '').includes(entity.cpfCnpj)) return false
  if (entity.nome && !containsLiteral(entity.fonte, entity.nome)) return false
  if (typeof entity.valor === 'number') {
    const numbers = entity.fonte.match(/-?\d[\d.\s]*(?:,\d+)?/g)?.map((raw) => {
      const compact = raw.replace(/\s/g, '')
      return Number(compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact)
    }).filter(Number.isFinite) ?? []
    if (!numbers.some((value) => Math.abs(value - entity.valor!) <= Math.max(0.01, Math.abs(entity.valor!) * 0.000001))) return false
  }
  return true
}

function normalizeCpfCnpj(raw: unknown): string | undefined {
  if (!raw) return undefined
  const s = String(raw).replace(/\D/g, '')
  if (s.length === 11 || s.length === 14) return s
  return undefined
}

import type { DocumentEvidence } from '@aletis/shared-types'

const stringField = (description?: string) => ({ type: 'string', ...(description ? { description } : {}) })
const numberField = (description?: string) => ({ type: 'number', ...(description ? { description } : {}) })
const stringArray = { type: 'array', items: { type: 'string' } }

const evidenceSchema = {
  type: 'array',
  description: 'Evidencias apenas para campos encontrados literalmente no documento.',
  items: {
    type: 'object',
    properties: {
      field: stringField('Nome exato do campo extraido'),
      value: stringField('Valor textual normalizado'),
      trecho: stringField('Trecho curto e literal que comprova o valor'),
      page: { type: 'integer', minimum: 1 },
      confianca: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['field', 'value', 'trecho', 'confianca'],
  },
}

function documentSchema(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      ...properties,
      evidencias: evidenceSchema,
      lacunas: stringArray,
    },
  }
}

export const DOCUMENT_STRUCTURED_SCHEMAS = {
  classification: {
    type: 'object',
    properties: {
      tipo: { type: 'string', enum: ['contrato_credito_rural', 'proposta_comercial', 'extrato_bancario', 'documento_pessoal', 'laudo_tecnico', 'planilha_gestao', 'outro'] },
      confianca: { type: 'number', minimum: 0, maximum: 1 },
      justificativa: stringField('Uma frase baseada no conteudo observado'),
    },
    required: ['tipo', 'confianca', 'justificativa'],
  },
  identity: documentSchema({
    tipoDocumento: stringField(), nome: stringField(), cpf: stringField(), rg: stringField(),
    dataNascimento: stringField(), nomePai: stringField(), nomeMae: stringField(),
    enderecoCompleto: stringField(), cidade: stringField(), uf: stringField(), cep: stringField(),
  }),
  bankStatement: documentSchema({
    instituicao: stringField(), conta: stringField(), agencia: stringField(), nomeTitular: stringField(),
    cpfCnpjTitular: stringField(), periodoInicio: stringField(), periodoFim: stringField(),
    saldoInicial: numberField(), saldoFinal: numberField(), mediaMovimentacaoMensal: numberField(),
  }),
  proposal: documentSchema({
    nomeCliente: stringField(), cpfCnpj: stringField(), cidade: stringField(), uf: stringField(),
    telefone: stringField(), email: stringField(), endereco: stringField(), dividaTotal: numberField(),
    credor: stringField(), estrategia: stringField(), honorarios: numberField(), bancos: stringArray,
  }),
  spreadsheet: documentSchema({
    nomeProdutor: stringField(), cpfCnpj: stringField(), municipio: stringField(), uf: stringField(),
    areaTotalHa: numberField(), culturasPrincipais: stringArray, receitaBrutaEstimada: numberField(),
    custoTotalEstimado: numberField(), margemBrutaEstimada: numberField(), dividaTotalDeclarada: numberField(),
    instituicoesCredoras: stringArray,
  }),
  technicalReport: documentSchema({
    nomeProprietario: stringField(), cpfCnpj: stringField(), municipio: stringField(), uf: stringField(),
    areaTotalHa: numberField(), areaAgricultavelHa: numberField(), culturas: stringArray,
    car: stringField(), ccir: stringField(), matricula: stringField(), valorAvaliacao: numberField(),
    dataLaudo: stringField(), engenheiroResponsavel: stringField(), crea: stringField(),
  }),
}

export function mapDocumentEvidence(
  value: unknown,
  fonte: string,
  documentText?: string,
  allowedFields?: Set<string>,
): DocumentEvidence[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw): DocumentEvidence[] => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    const field = String(item.field || '').trim()
    const trecho = String(item.trecho || '').trim()
    if (!field || !trecho || (allowedFields && !allowedFields.has(field))) return []
    if (documentText && !containsLiteralEvidence(documentText, trecho)) return []
    const page = Number(item.page)
    return [{
      field,
      value: item.value,
      fonte,
      trecho: trecho.slice(0, 500),
      page: Number.isInteger(page) && page > 0 ? page : undefined,
      confianca: Math.max(0, Math.min(1, Number(item.confianca) || 0)),
    }]
  })
}

function normalizedText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function containsLiteralEvidence(documentText: string, trecho: string): boolean {
  const corpus = normalizedText(documentText)
  const quote = normalizedText(trecho)
  return quote.length >= 3 && corpus.includes(quote)
}

function localizedNumbers(value: unknown): number[] {
  return String(value ?? '')
    .match(/-?\d[\d.\s]*(?:,\d+)?/g)
    ?.map((raw) => {
      const compact = raw.replace(/\s/g, '')
      const normalized = compact.includes(',')
        ? compact.replace(/\./g, '').replace(',', '.')
        : compact
      return Number(normalized)
    })
    .filter(Number.isFinite) ?? []
}

function evidenceValueMatches(evidence: DocumentEvidence, expected: unknown): boolean {
  if (expected === undefined || expected === null || expected === '') return false
  const snippet = evidence.trecho
  const digits = onlyDigits(expected)
  if ((digits.length === 11 || digits.length === 14) && onlyDigits(snippet).includes(digits)) return true

  if (typeof expected === 'number') {
    return localizedNumbers(snippet).some((candidate) => Math.abs(candidate - expected) <= Math.max(0.01, Math.abs(expected) * 0.000001))
  }

  const normalizedExpected = normalizedText(expected)
  const normalizedSnippet = normalizedText(snippet)
  if (normalizedExpected.length >= 3 && normalizedSnippet.includes(normalizedExpected)) return true

  const expectedNumbers = localizedNumbers(expected)
  const snippetNumbers = localizedNumbers(snippet)
  return expectedNumbers.some((number) => snippetNumbers.some((candidate) => Math.abs(candidate - number) < 0.001))
}

export function hasDocumentEvidence(
  evidences: DocumentEvidence[],
  fields: string | string[],
  expected?: unknown,
): boolean {
  const accepted = new Set((Array.isArray(fields) ? fields : [fields]).map(normalizedText))
  return evidences.some((evidence) => {
    if (!accepted.has(normalizedText(evidence.field))) return false
    return expected === undefined ? true : evidenceValueMatches(evidence, expected)
  })
}

export function literalEvidenceFromMatch(
  documentText: string,
  match: RegExpMatchArray | null,
  field: string,
  value: unknown,
  fonte: string,
  confianca: number,
): DocumentEvidence | null {
  if (!match || match.index === undefined) return null
  const start = Math.max(0, match.index - 60)
  const end = Math.min(documentText.length, match.index + match[0].length + 60)
  return { field, value, fonte, trecho: documentText.slice(start, end).trim(), confianca }
}

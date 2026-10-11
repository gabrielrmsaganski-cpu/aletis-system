// ============================================================
// ALETIS - consolidacao profunda de documentos para novo cliente
// ============================================================

import { buildDocumentFinancialReview, documentMoney, documentMoneyMatches } from '../crm/DocumentFinancialReview.js'
import { parseMoneyPtBr } from '../../../lib/parseMoneyPtBr.js'
import type { DocumentFinancialReview } from '@aletis/shared-types'
import type { DocumentExtractionResult, DocumentEvidence as SmartEvidence } from '@aletis/shared-types'

import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js'
import { getModelForRole } from '../../llm/LLMConfig.js'
import type { IngestedDocument } from './types.js'

export type OnboardingDocumentType =
  | 'proposta'
  | 'contrato'
  | 'identidade'
  | 'fiscal'
  | 'patrimonio'
  | 'agro'
  | 'documento'
  | 'outros'

export interface OnboardingEvidence {
  campo: string
  valor?: unknown
  documentoId: string
  arquivo: string
  fonte: string
  trecho: string
  pagina?: number
  confianca: number
}

export interface OnboardingDocumentPreview {
  filename: string
  mimetype: string
  sizeBytes: number
  tipoArquivo: OnboardingDocumentType
  tipoDocumento: string
  resumo: string
  textoExtraidoChars: number
  campos: Record<string, unknown>
  camposAusentes: string[]
  confianca: number
  origem: 'ia' | 'heuristica'
  alixDocumentId: string
  evidencias: OnboardingEvidence[]
  riscos: string[]
  lacunas: string[]
  acoesSugeridas: string[]
  processamento: 'profundo' | 'basico'
  estadoProcessamento: 'queued' | 'processing' | 'extracting' | 'completed' | 'completed_basic' | 'failed'
  erro?: string
  revisaoFinanceira?: DocumentFinancialReview
}

export interface OnboardingFieldOption {
  value: unknown
  fontes: string[]
  documentoIds: string[]
  confianca: number
  evidencias: OnboardingEvidence[]
  recomendadoPelaIa?: boolean
}

export interface OnboardingFieldConflict {
  campo: string
  opcoes: OnboardingFieldOption[]
  recomendacao?: string
}

export interface ClientOnboardingDossier {
  campos: Record<string, unknown>
  resumo: string
  camposAusentes: string[]
  confianca: number
  completude: number
  qualidade: number
  origem: 'ia' | 'heuristica'
  documentos: OnboardingDocumentPreview[]
  sessionId?: string
  propostaDetectada: boolean
  contratoDetectado: boolean
  fontesPorCampo: Record<string, string[]>
  evidenciasPorCampo: Record<string, OnboardingEvidence[]>
  conflitos: OnboardingFieldConflict[]
  alertas: string[]
  lacunasCriticas: string[]
  acoesRecomendadas: string[]
}

interface FieldCandidate {
  field: string
  value: unknown
  doc: IngestedDocument
  confidence: number
  authority: number
  evidences: OnboardingEvidence[]
}

const MONEY_FIELDS = new Set(['valorTotalDivida', 'valorTotalPago'])
const BRAZILIAN_UFS = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])
const CONFLICT_FIELDS = new Set([
  'nome', 'cpfCnpj', 'email', 'telefone', 'whatsapp', 'cep', 'endereco',
  'cidade', 'uf', 'atividade', 'areaTotalHa', 'carCodigoImovel', 'credor',
  'modalidadeCredito', 'valorTotalDivida', 'valorTotalPago',
])

const FIELD_ALIASES: Record<string, string> = {
  nomecliente: 'nome', nomeprodutor: 'nome', nomeproprietario: 'nome', nometitular: 'nome',
  razaosocial: 'nome', devedor: 'nome', emitente: 'nome', nome: 'nome',
  cpf: 'cpfCnpj', cnpj: 'cpfCnpj', cpfcnpj: 'cpfCnpj', cpfcnpjtitular: 'cpfCnpj',
  municipio: 'cidade', cidade: 'cidade', uf: 'uf', email: 'email', telefone: 'telefone',
  endereco: 'endereco', enderecocompleto: 'endereco', cep: 'cep', atividade: 'atividade',
  areatotalha: 'areaTotalHa', areaha: 'areaTotalHa', culturas: 'culturas',
  culturasprincipais: 'culturas', car: 'carCodigoImovel', codigocar: 'carCodigoImovel',
  carcodigoimovel: 'carCodigoImovel', instituicao: 'credor', banco: 'credor', credor: 'credor',
  divida: 'valorTotalDivida', dividatotal: 'valorTotalDivida', valoratualizado: 'valorTotalDivida',
  saldodevedor: 'valorTotalDivida', saldoatualtotal: 'valorTotalDivida', saldodevedortotal: 'valorTotalDivida', modalidade: 'modalidadeCredito', tipocontrato: 'modalidadeCredito',
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  return String(value).trim().length > 0
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function canonicalField(field: unknown): string {
  const normalized = String(field ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
  return FIELD_ALIASES[normalized] || String(field ?? '').trim()
}

function normalizeCpfCnpj(value: unknown): string | undefined {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 11 || digits.length === 14 ? digits : undefined
}

function moneyString(value: unknown): string | undefined {
  return documentMoney(value)
}

function normalizedValue(field: string, value: unknown): string {
  if (MONEY_FIELDS.has(field)) return moneyString(value) || ''
  if (field === 'cpfCnpj') return normalizeCpfCnpj(value) || ''
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item).toLocaleLowerCase('pt-BR')).sort().join('|')
  }
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000)
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function smartExtraction(doc: IngestedDocument): DocumentExtractionResult | null {
  const value = doc.metadata?.smartExtraction
  return value && typeof value === 'object' ? value as DocumentExtractionResult : null
}

function documentType(extraction: DocumentExtractionResult | null, doc: IngestedDocument): OnboardingDocumentType {
  const type = extraction?.tipoDocumento || cleanText(doc.metadata?.smartExtractionClass && (doc.metadata.smartExtractionClass as any).tipo)
  if (type === 'proposta_comercial') return 'proposta'
  if (type === 'contrato_credito_rural') return 'contrato'
  if (type === 'documento_pessoal') return 'identidade'
  if (type === 'extrato_bancario') return 'fiscal'
  if (type === 'laudo_tecnico') return 'patrimonio'
  if (type === 'planilha_gestao') return 'agro'
  return doc.kind === 'xlsx' || doc.kind === 'csv' ? 'documento' : 'outros'
}

function authorityFor(field: string, type: OnboardingDocumentType): number {
  if (['nome', 'cpfCnpj', 'email', 'telefone', 'endereco', 'cep', 'cidade', 'uf'].includes(field)) {
    return type === 'identidade' ? 1 : type === 'contrato' ? 0.9 : type === 'proposta' ? 0.8 : 0.65
  }
  if (['valorTotalDivida', 'credor', 'modalidadeCredito'].includes(field)) {
    return type === 'contrato' ? 1 : type === 'fiscal' ? 0.9 : type === 'proposta' ? 0.8 : 0.65
  }
  if (['areaTotalHa', 'culturas', 'carCodigoImovel', 'atividade'].includes(field)) {
    return type === 'patrimonio' ? 1 : type === 'agro' ? 0.95 : type === 'contrato' ? 0.8 : 0.65
  }
  return 0.7
}

function evidenceForField(doc: IngestedDocument, field: string, value: unknown): OnboardingEvidence[] {
  const extraction = smartExtraction(doc)
  const monetary = MONEY_FIELDS.has(field)
  const matches = (extraction?.evidencias || []).filter(item => canonicalField(item.field) === field
    && (!monetary || documentMoneyMatches(item.trecho, value, field === 'valorTotalDivida' ? 'global_current' : undefined)))
  if (monetary && matches.length === 0) {
    const sourceEvidence = (doc.evidences || []).filter(item => documentMoneyMatches(item.text, value, field === 'valorTotalDivida' ? 'global_current' : undefined))
    const textQuote = String(doc.extractedText || '').split(/\n|(?<=[.!?])\s+/).find(text => documentMoneyMatches(text, value, field === 'valorTotalDivida' ? 'global_current' : undefined))
    const actualSources = sourceEvidence.length ? sourceEvidence.map(item => ({ text: item.text, source: item.source, page: item.page, confidence: item.confidence }))
      : textQuote ? [{ text: textQuote, source: `${doc.filename}:texto_extraido`, page: undefined, confidence: 0.45 }] : []
    return actualSources.slice(0, 5).map(item => ({ campo: field, valor: value, documentoId: doc.id, arquivo: doc.filename,
      fonte: item.source, trecho: cleanText(item.text, 500), pagina: item.page, confianca: item.confidence ?? 0.45 }))
  }
  const source = matches.length ? matches : [{
    field,
    value,
    fonte: `${doc.filename}:${field}`,
    trecho: cleanText(doc.summary || value),
    confianca: extraction?.confianca || 0.45,
  } satisfies SmartEvidence]
  return source.slice(0, 5).map((item) => ({
    campo: field,
    valor: item.value ?? value,
    documentoId: doc.id,
    arquivo: doc.filename,
    fonte: cleanText(item.fonte, 240) || doc.filename,
    trecho: cleanText(item.trecho || value, 500),
    pagina: item.page,
    confianca: Math.max(0, Math.min(1, Number(item.confianca) || 0)),
  }))
}

function fieldsFromSmart(doc: IngestedDocument, extraction: DocumentExtractionResult): Record<string, unknown> {
  const cliente = extraction.clienteData || {}
  const endereco = cliente.endereco || {}
  const fields: Record<string, unknown> = {
    nome: cliente.nome,
    cpfCnpj: normalizeCpfCnpj(cliente.cpfCnpj),
    tipo: cliente.tipoPessoa === 'PJ' ? 'pessoa_juridica' : cliente.tipoPessoa === 'PF' ? 'pessoa_fisica' : undefined,
    email: cliente.email,
    telefone: cliente.telefone,
    whatsapp: cliente.telefone,
    cep: endereco.cep,
    endereco: endereco.logradouro,
    numero: endereco.numero,
    complemento: endereco.complemento,
    bairro: endereco.bairro,
    cidade: cliente.cidade || endereco.cidade,
    uf: cliente.uf || endereco.uf,
    atividade: cliente.atividade,
    areaTotalHa: cliente.areaTotalHa,
    culturas: cliente.culturas,
    carCodigoImovel: cliente.carCodigoImovel,
  }
  const dividas = Array.isArray(extraction.dividas) ? extraction.dividas : []
  const review = buildDocumentFinancialReview(dividas.map(d => ({ ...d })), extraction.evidencias)
  if (review.saldoAtualTotalComprovado !== undefined) fields.valorTotalDivida = review.saldoAtualTotalComprovado
  const credores = Array.from(new Set(dividas.map((debt) => cleanText(debt.credor, 160)).filter(Boolean)))
  if (credores.length) fields.credor = credores.join(', ')
  const modalidades = Array.from(new Set(dividas.map((debt) => cleanText(debt.modalidade, 120)).filter(Boolean)))
  if (modalidades.length) fields.modalidadeCredito = modalidades.join(', ')
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => hasValue(value)))
}

function fieldsFromEntities(doc: IngestedDocument): Record<string, unknown> {
  const entities = Array.isArray(doc.metadata?.entities) ? doc.metadata.entities as Array<Record<string, unknown>> : []
  const identity = entities
    .filter((item) => item.tipo === 'pessoa' || item.tipo === 'empresa')
    .sort((a, b) => Number(Boolean(normalizeCpfCnpj(b.cpfCnpj))) - Number(Boolean(normalizeCpfCnpj(a.cpfCnpj))))[0]
  const bank = entities.find((item) => item.tipo === 'banco' && item.nome)
  const debts = entities.filter(item => item.tipo === 'valor' && documentMoneyMatches(item.fonte ?? item.source, item.valor, 'global_current'))
  const totals = new Set(debts.map(item => documentMoney(item.valor)))
  const debt = totals.size === 1 ? debts[0] : undefined
  return Object.fromEntries(Object.entries({
    nome: identity?.nome,
    cpfCnpj: normalizeCpfCnpj(identity?.cpfCnpj),
    tipo: identity?.tipo === 'empresa' ? 'pessoa_juridica' : identity ? 'pessoa_fisica' : undefined,
    email: identity?.email,
    telefone: identity?.telefone,
    endereco: identity?.endereco,
    credor: bank?.nome,
    valorTotalDivida: documentMoney(debt?.valor),
  }).filter(([, value]) => hasValue(value)))
}

/** Extração local mínima para o preview rápido, sem depender de IA. */
function fieldsFromText(doc: IngestedDocument): Record<string, unknown> {
  const text = String(doc.extractedText || '')
  if (!text.trim()) return {}
  const compact = text.replace(/\s+/g, ' ')
  const cpf = compact.match(/\b(?:CPF|CNPJ)?\s*[:\-]?\s*(\d{3}\.?\d{3}\.?\d{3}\-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}\-?\d{2})\b/i)?.[1]
  const email = compact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  const telefone = compact.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[\-\s]?\d{4}/)?.[0]
  const cep = compact.match(/\b\d{5}-?\d{3}\b/)?.[0]
  const ufCandidate = compact.match(/\b(?:UF|estado)\s*[:\-]?\s*([A-Z]{2})\b/i)?.[1]?.toUpperCase()
  const uf = ufCandidate && BRAZILIAN_UFS.has(ufCandidate) ? ufCandidate : undefined
  const nome = compact.match(/(?:nome|raz[aã]o social|titular|devedor)\s*[:\-]\s*([A-ZÀ-Ú][^;|\n]{2,100})/i)?.[1]?.trim()
  const moneyMatches = [...compact.matchAll(/(?:saldo\s+(?:devedor|atualizado|total)|d[ií]vida\s+total|d[ée]bito\s+total)[^R$\d]{0,20}R?\$?\s*([\d.]+(?:,\d{2})?)/gi)]
  const moneyValues = new Set(moneyMatches.map(match => parseMoneyPtBr(match[1]).amount).filter((value): value is string => value !== null && documentMoneyMatches(compact, value, 'global_current')))
  const money = moneyValues.size === 1 ? moneyValues.values().next().value : undefined
  return Object.fromEntries(Object.entries({
    nome: nome?.replace(/[.,]$/, ''),
    cpfCnpj: normalizeCpfCnpj(cpf),
    email,
    telefone: telefone && telefone.replace(/\D/g, '') !== normalizeCpfCnpj(cpf) ? telefone.trim() : undefined,
    whatsapp: telefone && telefone.replace(/\D/g, '') !== normalizeCpfCnpj(cpf) ? telefone.trim() : undefined,
    cep,
    uf,
    valorTotalDivida: documentMoney(money),
  }).filter(([, value]) => hasValue(value)))
}

function candidatesFromDocument(doc: IngestedDocument): FieldCandidate[] {
  const extraction = smartExtraction(doc)
  const fields = extraction ? fieldsFromSmart(doc, extraction) : {
    ...fieldsFromText(doc),
    ...fieldsFromEntities(doc),
  }
  const type = documentType(extraction, doc)
  const baseConfidence = Math.max(0, Math.min(1, extraction?.confianca || Number((doc.metadata as any)?.agroConfianca) || 0.5))
  return Object.entries(fields).map(([field, value]) => ({
    field,
    value,
    doc,
    confidence: baseConfidence,
    authority: authorityFor(field, type),
    evidences: evidenceForField(doc, field, value),
  }))
}

export function buildOnboardingDocumentPreview(doc: IngestedDocument): OnboardingDocumentPreview {
  const extraction = smartExtraction(doc)
  const campos = extraction ? fieldsFromSmart(doc, extraction) : {
    ...fieldsFromText(doc),
    ...fieldsFromEntities(doc),
  }
  const revisaoFinanceira = extraction ? buildDocumentFinancialReview((extraction.dividas || []).map(d => ({ ...d })), extraction.evidencias) : undefined
  const tipoArquivo = documentType(extraction, doc)
  const required = ['nome', 'cpfCnpj', 'cidade', 'uf']
  const confidence = Math.max(0, Math.min(1, extraction?.confianca || Number((doc.metadata as any)?.agroConfianca) || 0.45))
  const evidencias = Object.entries(campos).flatMap(([field, value]) => evidenceForField(doc, field, value))
  const riscos = Array.isArray(extraction?.riscos) ? extraction.riscos.map((item) => cleanText(item, 300)).filter(Boolean) : []
  const lacunas = Array.isArray(extraction?.lacunas) ? extraction.lacunas.map((item) => cleanText(item, 160)).filter(Boolean) : []
  lacunas.push(...(revisaoFinanceira?.pendencias.map(p => `${p.campo}: ${p.orientacao}`) || []))
  const acoes = Array.isArray(extraction?.acoesSugeridas) ? extraction.acoesSugeridas.map((item) => cleanText(item, 260)).filter(Boolean) : []
  const tipoDocumento = extraction?.tipoDocumento || cleanText((doc.metadata as any)?.entityDocumentType || doc.kind)
  const rawState = String(doc.metadata?.processingState || (extraction ? 'completed' : 'completed_basic'))
  const estadoProcessamento = ['queued', 'processing', 'extracting', 'completed', 'completed_basic', 'failed'].includes(rawState)
    ? rawState as OnboardingDocumentPreview['estadoProcessamento']
    : 'completed_basic'
  return {
    filename: doc.filename,
    mimetype: doc.mimetype,
    sizeBytes: doc.sizeBytes,
    tipoArquivo,
    tipoDocumento,
    resumo: cleanText((doc.metadata as any)?.entitySummary || doc.summary || (
      estadoProcessamento === 'queued' ? 'Arquivo recebido e aguardando leitura.'
        : estadoProcessamento === 'processing' ? 'Leitura e OCR em andamento.'
          : estadoProcessamento === 'extracting' ? 'Texto lido; extração estruturada em andamento.'
            : `${tipoDocumento} processado`
    ), 900),
    textoExtraidoChars: doc.extractedText?.length || 0,
    campos,
    revisaoFinanceira,
    camposAusentes: Array.from(new Set([...required.filter((field) => !hasValue(campos[field])), ...lacunas])).slice(0, 30),
    confianca: confidence,
    origem: extraction ? 'ia' : 'heuristica',
    alixDocumentId: doc.id,
    evidencias: evidencias.slice(0, 80),
    riscos: riscos.slice(0, 30),
    lacunas: lacunas.slice(0, 30),
    acoesSugeridas: acoes.slice(0, 20),
    processamento: extraction ? 'profundo' : 'basico',
    estadoProcessamento,
    erro: estadoProcessamento === 'failed' ? cleanText(doc.metadata?.processingError, 500) || 'Falha durante a leitura do documento.' : undefined,
  }
}

function consolidateCandidates(documents: IngestedDocument[]): {
  campos: Record<string, unknown>
  fontesPorCampo: Record<string, string[]>
  evidenciasPorCampo: Record<string, OnboardingEvidence[]>
  conflitos: OnboardingFieldConflict[]
} {
  const grouped = new Map<string, Map<string, FieldCandidate[]>>()
  for (const candidate of documents.flatMap(candidatesFromDocument)) {
    const key = normalizedValue(candidate.field, candidate.value)
    if (!key) continue
    const byValue = grouped.get(candidate.field) || new Map<string, FieldCandidate[]>()
    const values = byValue.get(key) || []
    values.push(candidate)
    byValue.set(key, values)
    grouped.set(candidate.field, byValue)
  }

  const campos: Record<string, unknown> = {}
  const fontesPorCampo: Record<string, string[]> = {}
  const evidenciasPorCampo: Record<string, OnboardingEvidence[]> = {}
  const conflitos: OnboardingFieldConflict[] = []

  for (const [field, byValue] of grouped) {
    const options = [...byValue.values()].map((items): OnboardingFieldOption & { score: number } => {
      const confidence = items.reduce((sum, item) => sum + item.confidence * item.authority, 0) / items.length
      const sources = Array.from(new Set(items.map((item) => item.doc.filename)))
      const documentIds = Array.from(new Set(items.map((item) => item.doc.id)))
      const evidences = items.flatMap((item) => item.evidences)
      return {
        value: items[0].value,
        fontes: sources,
        documentoIds: documentIds,
        confianca: Math.max(0, Math.min(1, confidence)),
        evidencias: evidences,
        // Autoridade/confiança da fonte prevalece sobre repetição em documentos
        // menos confiáveis; consenso serve apenas como desempate progressivo.
        score: confidence * 5 + Math.min(sources.length, 3) * 0.3,
      }
    }).sort((a, b) => b.score - a.score)

    const best = options[0]
    // Divergência monetária requer escolha da equipe; confiança não decide saldo por conta própria.
    if (!MONEY_FIELDS.has(field) || options.length === 1) campos[field] = best.value
    fontesPorCampo[field] = best.fontes
    evidenciasPorCampo[field] = best.evidencias
    if (CONFLICT_FIELDS.has(field) && options.length > 1) {
      conflitos.push({
        campo: field,
        opcoes: options.map(({ score: _score, ...option }) => option),
      })
    }
  }
  return { campos, fontesPorCampo, evidenciasPorCampo, conflitos }
}

function completeness(campos: Record<string, unknown>, documents: OnboardingDocumentPreview[]): number {
  const checks: Array<[number, boolean]> = [
    [18, hasValue(campos.nome)],
    [16, hasValue(campos.cpfCnpj)],
    [10, hasValue(campos.cidade)],
    [8, hasValue(campos.uf)],
    [8, hasValue(campos.telefone) || hasValue(campos.whatsapp) || hasValue(campos.email)],
    [8, hasValue(campos.atividade)],
    [8, hasValue(campos.areaTotalHa) || hasValue(campos.carCodigoImovel)],
    [10, hasValue(campos.valorTotalDivida)],
    [8, hasValue(campos.credor)],
    [6, documents.length > 0],
  ]
  return checks.reduce((score, [weight, met]) => score + (met ? weight : 0), 0) / 100
}

async function synthesizeWithOpenAI(params: {
  previews: OnboardingDocumentPreview[]
  campos: Record<string, unknown>
  conflitos: OnboardingFieldConflict[]
}): Promise<{
  resumoExecutivo: string
  alertas: string[]
  lacunasCriticas: string[]
  acoesRecomendadas: string[]
  recomendacoesConflitos: Array<{ campo: string; valor: string; justificativa: string }>
} | null> {
  if (!isOpenAIEnabled()) return null
  const context = params.previews.map((doc) => ({
    documentoId: doc.alixDocumentId,
    arquivo: doc.filename,
    tipoDocumento: doc.tipoDocumento,
    campos: doc.campos,
    confianca: doc.confianca,
    riscos: doc.riscos,
    lacunas: doc.lacunas,
    evidencias: doc.evidencias.slice(0, 30),
  }))
  const result = await generateStructured<{
    resumoExecutivo: string
    alertas: string[]
    lacunasCriticas: string[]
    acoesRecomendadas: string[]
    recomendacoesConflitos: Array<{ campo: string; valor: string; justificativa: string }>
  }>([{ role: 'user', content: JSON.stringify({ camposConsolidados: params.campos, conflitos: params.conflitos, documentos: context }) }], {
    name: 'dossie_onboarding_cliente',
    model: getModelForRole('onboarding_dossier'),
    maxTokens: 5_000,
    reasoning: { effort: 'high', context: 'current_turn' },
    verbosity: 'medium',
    metadata: { workflow: 'crm.client_onboarding.dossier' },
    system: [
      'Você consolida dossiês para cadastro de clientes da ALETIS, consultoria financeira e agro.',
      'Analise relações e divergências entre todos os documentos, não cada arquivo isoladamente.',
      'Use somente valores presentes nos campos e evidências fornecidos. Nunca complete dados por suposição.',
      'Diferencie conflito real de variação de grafia/formatação. Para conflito, recomende a fonte mais autoritativa e explique em uma frase.',
      'Aponte identidade inconsistente, valores financeiros divergentes, vencimentos, garantias, partes relacionadas e documentos essenciais ausentes.',
      'As ações devem ser concretas para o consultor concluir o cadastro e iniciar o diagnóstico.',
    ].join('\n'),
    schema: {
      type: 'object',
      properties: {
        resumoExecutivo: { type: 'string' },
        alertas: { type: 'array', items: { type: 'string' } },
        lacunasCriticas: { type: 'array', items: { type: 'string' } },
        acoesRecomendadas: { type: 'array', items: { type: 'string' } },
        recomendacoesConflitos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              campo: { type: 'string' },
              valor: { type: 'string' },
              justificativa: { type: 'string' },
            },
            required: ['campo', 'valor', 'justificativa'],
          },
        },
      },
      required: ['resumoExecutivo', 'alertas', 'lacunasCriticas', 'acoesRecomendadas', 'recomendacoesConflitos'],
    },
  })
  return result.data
}

export async function buildClientOnboardingDossier(
  documents: IngestedDocument[],
  options: { useAi?: boolean } = {},
): Promise<ClientOnboardingDossier> {
  const previews = documents.map(buildOnboardingDocumentPreview)
  const consolidated = consolidateCandidates(documents)
  const required = ['nome', 'cidade', 'uf']
  const camposAusentes = required.filter((field) => !hasValue(consolidated.campos[field]))
  const baseConfidence = previews.length
    ? previews.reduce((sum, document) => sum + document.confianca, 0) / previews.length
    : 0
  const completude = completeness(consolidated.campos, previews)
  const riscos = Array.from(new Set(previews.flatMap((document) => document.riscos))).slice(0, 30)
  const lacunas = Array.from(new Set(previews.flatMap((document) => document.lacunas))).slice(0, 30)
  const actions = Array.from(new Set(previews.flatMap((document) => document.acoesSugeridas))).slice(0, 20)
  let ai: Awaited<ReturnType<typeof synthesizeWithOpenAI>> = null
  if (options.useAi !== false && isOpenAIEnabled()) {
    try {
      ai = await synthesizeWithOpenAI({ previews, campos: consolidated.campos, conflitos: consolidated.conflitos })
    } catch {
      ai = null
    }
  }

  for (const recommendation of ai?.recomendacoesConflitos || []) {
    const conflict = consolidated.conflitos.find((item) => item.campo === recommendation.campo)
    if (!conflict) continue
    const target = normalizedValue(conflict.campo, recommendation.valor)
    const option = conflict.opcoes.find((item) => normalizedValue(conflict.campo, item.value) === target)
    if (option) option.recomendadoPelaIa = true
    conflict.recomendacao = cleanText(recommendation.justificativa, 320)
  }

  const summary = ai?.resumoExecutivo || (
    previews.length
      ? `${previews.length} documento(s) processado(s) em conjunto; ${Object.keys(consolidated.campos).length} campo(s) aproveitável(is) e ${consolidated.conflitos.length} divergência(s).`
      : 'Nenhum documento disponível para consolidação.'
  )
  return {
    campos: consolidated.campos,
    resumo: summary,
    camposAusentes,
    confianca: baseConfidence,
    completude,
    qualidade: Math.max(0, Math.min(1, (baseConfidence + completude) / 2)),
    origem: ai || previews.some((document) => document.origem === 'ia') ? 'ia' : 'heuristica',
    documentos: previews,
    sessionId: documents[0]?.sessionId,
    propostaDetectada: previews.some((document) => document.tipoArquivo === 'proposta'),
    contratoDetectado: previews.some((document) => document.tipoArquivo === 'contrato'),
    fontesPorCampo: consolidated.fontesPorCampo,
    evidenciasPorCampo: consolidated.evidenciasPorCampo,
    conflitos: consolidated.conflitos,
    alertas: Array.from(new Set([...(ai?.alertas || []), ...riscos])).slice(0, 30),
    lacunasCriticas: Array.from(new Set([...(ai?.lacunasCriticas || []), ...camposAusentes, ...lacunas])).slice(0, 30),
    acoesRecomendadas: Array.from(new Set([...(ai?.acoesRecomendadas || []), ...actions])).slice(0, 20),
  }
}

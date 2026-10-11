export type ClientDocumentType =
  | 'auto'
  | 'proposta'
  | 'contrato'
  | 'identidade'
  | 'fiscal'
  | 'patrimonio'
  | 'agro'
  | 'documento'
  | 'outros'

export type ClientDocumentStatus =
  | 'aguardando'
  | 'analisando'
  | 'pronto'
  | 'erro'
  | 'enviando'
  | 'enviado'

export interface IntakeCampos {
  [field: string]: unknown
  culturas?: string[] | string
  tags?: string[] | string
  areaTotalHa?: string | number
  valorTotalDivida?: string | number
  valorTotalPago?: string | number
}

export interface IntakeDocumentoPreview {
  filename: string
  mimetype: string
  sizeBytes: number
  tipoArquivo: Exclude<ClientDocumentType, 'auto'>
  resumo?: string
  textoExtraidoChars: number
  campos: IntakeCampos
  camposAusentes: string[]
  confianca: number
  origem: 'ia' | 'heuristica'
  alixDocumentId?: string
  tipoDocumento?: string
  evidencias?: IntakeEvidence[]
  riscos?: string[]
  lacunas?: string[]
  acoesSugeridas?: string[]
  processamento?: 'profundo' | 'basico'
  estadoProcessamento?: 'queued' | 'processing' | 'extracting' | 'completed' | 'completed_basic' | 'failed'
  erro?: string
}

export interface IntakeEvidence {
  campo: string
  valor?: unknown
  documentoId: string
  arquivo: string
  fonte: string
  trecho: string
  pagina?: number
  confianca: number
}

export interface IntakeFieldOption {
  value: unknown
  fontes: string[]
  documentoIds?: string[]
  confianca: number
  evidencias?: IntakeEvidence[]
  recomendadoPelaIa?: boolean
}

export interface IntakeConflict {
  campo: string
  opcoes: IntakeFieldOption[]
  recomendacao?: string
}

export interface IntakeDocumentPreview {
  campos: IntakeCampos
  resumo?: string
  camposAusentes?: string[]
  confianca?: number
  origem?: 'ia' | 'heuristica'
  documentos: IntakeDocumentoPreview[]
  sessionId?: string
  propostaDetectada?: boolean
  contratoDetectado?: boolean
  fontesPorCampo?: Record<string, string[]>
  evidenciasPorCampo?: Record<string, IntakeEvidence[]>
  conflitos?: IntakeConflict[]
  completude?: number
  qualidade?: number
  alertas?: string[]
  lacunasCriticas?: string[]
  acoesRecomendadas?: string[]
}

export interface NovoClienteAnexo {
  id: string
  file: File
  tipo: ClientDocumentType
  status: ClientDocumentStatus
  preview?: IntakeDocumentoPreview
  error?: string
}

export interface IntakeProgress {
  concluidos: number
  total: number
  loteAtual: number
  totalLotes: number
}

export const CLIENT_DOCUMENT_TYPE_LABEL: Record<ClientDocumentType, string> = {
  auto: 'IA decide',
  proposta: 'Proposta',
  contrato: 'Contrato',
  identidade: 'Identificação',
  fiscal: 'Fiscal',
  patrimonio: 'Patrimônio',
  agro: 'Rural / Agro',
  documento: 'Documento geral',
  outros: 'Outros',
}

export const INTAKE_FIELD_LABELS: Record<string, string> = {
  nome: 'Nome / razão social',
  cpfCnpj: 'CPF / CNPJ',
  tipo: 'Tipo de pessoa',
  email: 'E-mail',
  telefone: 'Telefone',
  whatsapp: 'WhatsApp',
  cep: 'CEP',
  endereco: 'Endereço',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cidade: 'Cidade',
  uf: 'UF',
  atividade: 'Atividade',
  areaTotalHa: 'Área total',
  culturas: 'Culturas',
  carCodigoImovel: 'Código CAR',
  credor: 'Credor',
  modalidadeCredito: 'Modalidade de crédito',
  valorTotalDivida: 'Dívida total',
  valorTotalPago: 'Total pago',
  observacoes: 'Observações',
  estagio: 'Estágio',
  consultor: 'Consultor',
  escritorio: 'Escritório',
  tags: 'Tags',
}

const CONFLICT_FIELDS = new Set([
  'nome', 'cpfCnpj', 'email', 'telefone', 'whatsapp', 'cep', 'endereco',
  'cidade', 'uf', 'atividade', 'areaTotalHa', 'carCodigoImovel', 'credor',
  'modalidadeCredito', 'valorTotalDivida', 'valorTotalPago',
])

function hasValue(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  return String(value).trim().length > 0
}

function normalizedValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLocaleLowerCase('pt-BR')).sort().join('|')
  }
  if (typeof value === 'number') return String(Math.round(value * 100) / 100)
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function fieldCandidates(documentos: IntakeDocumentoPreview[]) {
  const byField = new Map<string, Map<string, IntakeFieldOption>>()
  for (const documento of documentos) {
    for (const [campo, value] of Object.entries(documento.campos || {})) {
      if (!hasValue(value)) continue
      const key = normalizedValue(value)
      if (!key) continue
      const groups = byField.get(campo) ?? new Map<string, IntakeFieldOption>()
      const existing = groups.get(key)
      if (existing) {
        existing.fontes.push(documento.filename)
        existing.confianca = Math.max(existing.confianca, documento.confianca)
      } else {
        groups.set(key, {
          value,
          fontes: [documento.filename],
          confianca: documento.confianca,
        })
      }
      byField.set(campo, groups)
    }
  }
  return byField
}

export function consolidateDocumentPreviews(documentos: IntakeDocumentoPreview[]): IntakeDocumentPreview {
  const validos = documentos.filter((documento) => !documento.erro)
  const campos: IntakeCampos = {}
  const fontesPorCampo: Record<string, string[]> = {}
  const conflitos: IntakeConflict[] = []

  for (const [campo, groups] of fieldCandidates(validos)) {
    const opcoes = [...groups.values()].sort((a, b) => {
      const scoreA = a.fontes.length * 2 + a.confianca
      const scoreB = b.fontes.length * 2 + b.confianca
      return scoreB - scoreA
    })
    campos[campo] = opcoes[0].value
    fontesPorCampo[campo] = opcoes[0].fontes
    if (CONFLICT_FIELDS.has(campo) && opcoes.length > 1) conflitos.push({ campo, opcoes })
  }

  const required = ['nome', 'cpfCnpj', 'cidade', 'uf']
  const camposAusentes = required.filter((campo) => !hasValue(campos[campo]))
  const confianca = validos.length
    ? validos.reduce((total, documento) => total + documento.confianca, 0) / validos.length
    : 0
  const tipos = validos.reduce<Record<string, number>>((acc, documento) => {
    acc[documento.tipoArquivo] = (acc[documento.tipoArquivo] ?? 0) + 1
    return acc
  }, {})
  const separacao = Object.entries(tipos)
    .map(([tipo, total]) => `${total} ${CLIENT_DOCUMENT_TYPE_LABEL[tipo as ClientDocumentType].toLocaleLowerCase('pt-BR')}`)
    .join(', ')

  return {
    campos,
    documentos,
    camposAusentes,
    confianca,
    origem: validos.some((documento) => documento.origem === 'ia') ? 'ia' : 'heuristica',
    propostaDetectada: validos.some((documento) => documento.tipoArquivo === 'proposta'),
    fontesPorCampo,
    conflitos,
    resumo: validos.length
      ? `${validos.length} documento(s) lido(s) e separado(s): ${separacao}.`
      : 'Nenhum documento pôde ser consolidado.',
  }
}

export function documentFingerprint(file: File): string {
  return `${file.name.toLocaleLowerCase('pt-BR')}::${file.size}::${file.lastModified}`
}

export function documentUploadCategory(tipo: ClientDocumentType): string {
  if (tipo === 'contrato' || tipo === 'identidade' || tipo === 'fiscal' || tipo === 'patrimonio' || tipo === 'agro') return tipo
  return 'outros'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

export function displayIntakeValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'number') return value.toLocaleString('pt-BR')
  return String(value ?? '')
}

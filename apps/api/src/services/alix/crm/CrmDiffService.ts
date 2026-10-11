// ============================================================
// ALETIS — CRM diff documental
//
// Mostra o que a ALIX vai preencher, anexar ou deixar em conflito
// antes/depois de atualizar um cliente existente.
// ============================================================

import { documentMoney } from './DocumentFinancialReview.js'

export interface CrmFieldChange {
  field: string
  current?: unknown
  incoming: unknown
  action: 'fill_empty' | 'conflict'
}

export interface CrmDebtConflict {
  key: string
  current: unknown
  incoming: unknown
  fields: string[]
}

export interface CrmPropertyConflict {
  key: string
  current: unknown
  incoming: unknown
  fields: string[]
}

export interface ClienteDocumentDiff {
  summary: {
    camposNovos: number
    camposConflitantes: number
    dividasNovas: number
    dividasConflitantes: number
    propriedadesNovas: number
    propriedadesConflitantes: number
    totalConflitos: number
  }
  novosCampos: CrmFieldChange[]
  camposConflitantes: CrmFieldChange[]
  novasDividas: unknown[]
  dividasConflitantes: CrmDebtConflict[]
  novasPropriedades: unknown[]
  propriedadesConflitantes: CrmPropertyConflict[]
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return true
}

function comparable(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : ''
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim().toLowerCase()
  if (Array.isArray(value)) return value.map(comparable).sort().join('|')
  if (typeof value === 'object') return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort()).toLowerCase()
  return String(value).trim().toLowerCase()
}

function objectValue(input: unknown, key: string): unknown {
  return input && typeof input === 'object' ? (input as Record<string, unknown>)[key] : undefined
}

function debtKey(input: unknown): string {
  const contrato = comparable(objectValue(input, 'contrato') || objectValue(input, 'numeroContrato'))
  if (contrato) return `contrato:${contrato}`
  const credor = comparable(objectValue(input, 'credor'))
  const valor = comparable(objectValue(input, 'valorAtualizado') ?? objectValue(input, 'valorOriginal'))
  const vencimento = comparable(objectValue(input, 'vencimento'))
  return [credor, valor, vencimento].filter(Boolean).join('|')
}

function propertyKey(input: unknown): string {
  const car = comparable(objectValue(input, 'car') || objectValue(input, 'carCodigoImovel'))
  if (car) return `car:${car}`
  const matricula = comparable(objectValue(input, 'matricula'))
  if (matricula) return `matricula:${matricula}`
  const ccir = comparable(objectValue(input, 'ccir'))
  if (ccir) return `ccir:${ccir}`
  const municipio = comparable(objectValue(input, 'municipio'))
  const area = comparable(objectValue(input, 'areaHa') || objectValue(input, 'areaTotal'))
  return [municipio, area].filter(Boolean).join('|')
}

function differingFields(current: unknown, incoming: unknown, fields: string[]): string[] {
  return fields.filter((field) => {
    const a = objectValue(current, field)
    const b = objectValue(incoming, field)
    const monetary = field === 'valorOriginal' || field === 'valorAtualizado'
    const left = monetary ? documentMoney(a) : comparable(a)
    const right = monetary ? documentMoney(b) : comparable(b)
    return hasValue(a) && hasValue(b) && left !== right
  })
}

export function buildClienteDocumentDiff(
  clienteExistente: Record<string, unknown>,
  payload: Record<string, unknown>,
): ClienteDocumentDiff {
  const novosCampos: CrmFieldChange[] = []
  const camposConflitantes: CrmFieldChange[] = []
  const scalarFields = ['cidade', 'uf', 'telefone', 'email', 'atividade', 'areaTotalHa', 'carCodigoImovel', 'observacoes'] as const

  for (const field of scalarFields) {
    const incoming = payload[field]
    if (!hasValue(incoming)) continue
    const current = clienteExistente[field]
    if (!hasValue(current)) {
      novosCampos.push({ field, current, incoming, action: 'fill_empty' })
    } else if (comparable(current) !== comparable(incoming)) {
      camposConflitantes.push({ field, current, incoming, action: 'conflict' })
    }
  }

  if (hasValue(payload.endereco)) {
    const current = clienteExistente.endereco
    if (!hasValue(current)) {
      novosCampos.push({ field: 'endereco', current, incoming: payload.endereco, action: 'fill_empty' })
    } else if (comparable(current) !== comparable(payload.endereco)) {
      camposConflitantes.push({ field: 'endereco', current, incoming: payload.endereco, action: 'conflict' })
    }
  }

  if (Array.isArray(payload.culturas) && payload.culturas.length > 0) {
    const current = clienteExistente.culturas
    if (!hasValue(current)) {
      novosCampos.push({ field: 'culturas', current, incoming: payload.culturas, action: 'fill_empty' })
    } else if (comparable(current) !== comparable(payload.culturas)) {
      camposConflitantes.push({ field: 'culturas', current, incoming: payload.culturas, action: 'conflict' })
    }
  }

  const existingDividas = Array.isArray(clienteExistente.dividas) ? clienteExistente.dividas : []
  const incomingDividas = Array.isArray(payload.dividas) ? payload.dividas : []
  const existingDebtMap = new Map<string, unknown>()
  for (const divida of existingDividas) {
    const key = debtKey(divida)
    if (key) existingDebtMap.set(key, divida)
  }
  const novasDividas: unknown[] = []
  const dividasConflitantes: CrmDebtConflict[] = []
  for (const divida of incomingDividas) {
    const key = debtKey(divida)
    const current = key ? existingDebtMap.get(key) : undefined
    if (!current) {
      novasDividas.push(divida)
      continue
    }
    const fields = differingFields(current, divida, ['credor', 'valorOriginal', 'valorAtualizado', 'vencimento', 'status', 'taxaContratadaAa', 'modalidade'])
    if (fields.length > 0) dividasConflitantes.push({ key, current, incoming: divida, fields })
  }

  const existingProps = Array.isArray(clienteExistente.propriedades) ? clienteExistente.propriedades : []
  const incomingProps = Array.isArray(payload.propriedades) ? payload.propriedades : []
  const existingPropMap = new Map<string, unknown>()
  for (const prop of existingProps) {
    const key = propertyKey(prop)
    if (key) existingPropMap.set(key, prop)
  }
  const novasPropriedades: unknown[] = []
  const propriedadesConflitantes: CrmPropertyConflict[] = []
  for (const prop of incomingProps) {
    const key = propertyKey(prop)
    const current = key ? existingPropMap.get(key) : undefined
    if (!current) {
      novasPropriedades.push(prop)
      continue
    }
    const fields = differingFields(current, prop, ['nome', 'municipio', 'uf', 'areaHa', 'areaTotal', 'ccir', 'matricula', 'condicao'])
    if (fields.length > 0) propriedadesConflitantes.push({ key, current, incoming: prop, fields })
  }

  return {
    summary: {
      camposNovos: novosCampos.length,
      camposConflitantes: camposConflitantes.length,
      dividasNovas: novasDividas.length,
      dividasConflitantes: dividasConflitantes.length,
      propriedadesNovas: novasPropriedades.length,
      propriedadesConflitantes: propriedadesConflitantes.length,
      totalConflitos: camposConflitantes.length + dividasConflitantes.length + propriedadesConflitantes.length,
    },
    novosCampos,
    camposConflitantes,
    novasDividas,
    dividasConflitantes,
    novasPropriedades,
    propriedadesConflitantes,
  }
}

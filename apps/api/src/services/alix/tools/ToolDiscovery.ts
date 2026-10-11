import { z } from 'zod'
import type { LLMTool, LLMToolRegistry } from '../../llm/types.js'

export const DISCOVERY_TOOL_NAMES = ['descobrir_ferramentas', 'executar_ferramenta_descoberta'] as const
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const discoverInput = z.object({ consulta: z.string().max(500).default(''), limite: z.number().int().min(1).max(12).default(8) })
const executeInput = z.object({ nome: z.string().min(1).max(128), argumentosJson: z.string().max(100_000) })

/** Validação estrutural dos schemas registrados, sem converter/coagir valores. */
export function validateToolArguments(value: unknown, schema: unknown, path = 'argumentos'): string[] {
  if (!schema || typeof schema !== 'object') return []
  const s = schema as Record<string, any>
  const errors: string[] = []
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : []
  if (types.length && !types.some((t: string) => t === type || (t === 'integer' && Number.isInteger(value)))) return [`${path}: tipo esperado ${types.join('|')}`]
  if (Array.isArray(s.enum) && !s.enum.some((item: unknown) => JSON.stringify(item) === JSON.stringify(value))) errors.push(`${path}: valor fora das opções permitidas`)
  if ('const' in s && JSON.stringify(value) !== JSON.stringify(s.const)) errors.push(`${path}: valor diferente do esperado`)
  for (const branch of s.allOf || []) errors.push(...validateToolArguments(value, branch, path))
  for (const kind of ['anyOf', 'oneOf']) if (Array.isArray(s[kind])) {
    const matched = s[kind].filter((branch: unknown) => validateToolArguments(value, branch, path).length === 0).length
    if (!matched || (kind === 'oneOf' && matched !== 1)) errors.push(`${path}: estrutura não corresponde ao schema`)
  }
  if (type === 'object') {
    const record = value as Record<string, unknown>
    for (const key of s.required || []) if (!(key in record)) errors.push(`${path}.${key}: obrigatório`)
    for (const [key, item] of Object.entries(record)) {
      if (s.properties?.[key]) errors.push(...validateToolArguments(item, s.properties[key], `${path}.${key}`))
      else if (s.additionalProperties === false) errors.push(`${path}.${key}: campo não permitido`)
      else if (typeof s.additionalProperties === 'object') errors.push(...validateToolArguments(item, s.additionalProperties, `${path}.${key}`))
    }
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => errors.push(...validateToolArguments(item, s.items, `${path}[${index}]`)))
    if (s.minItems !== undefined && value.length < s.minItems) errors.push(`${path}: poucos itens`)
    if (s.maxItems !== undefined && value.length > s.maxItems) errors.push(`${path}: itens demais`)
  }
  if (typeof value === 'string') {
    if (s.minLength !== undefined && value.length < s.minLength) errors.push(`${path}: texto curto demais`)
    if (s.maxLength !== undefined && value.length > s.maxLength) errors.push(`${path}: texto longo demais`)
    if (s.pattern && !new RegExp(s.pattern).test(value)) errors.push(`${path}: formato inválido`)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (s.minimum !== undefined && value < s.minimum) || (s.maximum !== undefined && value > s.maximum)) errors.push(`${path}: número fora dos limites`)
  }
  return errors
}

/** Catálogo por turno. Só executa ferramentas realmente registradas e descobertas. */
export function buildToolDiscovery(catalog: LLMToolRegistry): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const specs = Object.values(catalog).map((entry) => entry.spec)
  const discovered = new Set<string>()
  const tools: LLMTool[] = [{
    name: DISCOVERY_TOOL_NAMES[0],
    description: 'Pesquisa o catálogo REAL completo de capacidades desta chamada. Use se a ferramenta desejada não estiver entre as opções iniciais. Retorna nome, descrição e schema para execução; não executa nem confirma ações.',
    input_schema: { type: 'object', properties: { consulta: { type: 'string', description: 'Objetivo, palavras-chave ou nome exato da ferramenta' }, limite: { type: 'integer', minimum: 1, maximum: 12 } }, required: ['consulta'] },
  }, {
    name: DISCOVERY_TOOL_NAMES[1],
    description: 'Executa uma ferramenta retornada por descobrir_ferramentas, usando argumentosJson conforme o schema REAL descoberto. Preserva as validações, confirmações e resultado do handler original. Uma intenção pendente não significa ação concluída.',
    input_schema: { type: 'object', properties: { nome: { type: 'string' }, argumentosJson: { type: 'string', description: 'Objeto JSON válido com os argumentos exigidos pelo schema' } }, required: ['nome', 'argumentosJson'] },
  }]
  const registry: LLMToolRegistry = {
    [tools[0].name]: { spec: tools[0], handler: async (input) => {
      const parsed = discoverInput.safeParse(input)
      if (!parsed.success) return { ok: false, error: 'Consulta de catálogo inválida.', issues: parsed.error.issues }
      const query = normalize(parsed.data.consulta)
      const words = query.split(/\W+/).filter((word) => word.length > 2)
      const ranked = specs.map((spec) => {
        const name = normalize(spec.name)
        const description = normalize(spec.description)
        const score = (name === query ? 1000 : 0) + words.reduce((sum, word) => sum + (name.includes(word) ? 10 : description.includes(word) ? 2 : 0), 0)
        return { spec, score }
      }).filter((item) => !query || item.score > 0).sort((a, b) => b.score - a.score || a.spec.name.localeCompare(b.spec.name))
      const matches = ranked.slice(0, parsed.data.limite).map(({ spec }) => spec)
      matches.forEach((spec) => discovered.add(spec.name))
      return { ok: true, totalCatalogo: specs.length, totalEncontradas: ranked.length, ferramentas: matches, orientacao: matches.length ? 'Use executar_ferramenta_descoberta com o nome e argumentos do schema. O retorno da execução define o que ocorreu.' : 'Nenhuma ferramenta corresponde à consulta. Reformule a busca; não afirme que realizou uma capacidade ausente.' }
    } },
    [tools[1].name]: { spec: tools[1], handler: async (input) => {
      const parsed = executeInput.safeParse(input)
      if (!parsed.success) return { ok: false, error: 'Informe nome e argumentosJson válidos.' }
      const { nome, argumentosJson } = parsed.data
      const entry = Object.hasOwn(catalog, nome) ? catalog[nome] : undefined
      if (!entry || !discovered.has(nome)) return { ok: false, error: 'Ferramenta não descoberta nesta chamada. Consulte descobrir_ferramentas primeiro.' }
      let args: unknown
      try { args = JSON.parse(argumentosJson) } catch { return { ok: false, error: 'argumentosJson não é JSON válido.' } }
      if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'argumentosJson deve conter um objeto.' }
      const issues = validateToolArguments(args, entry.spec.input_schema)
      if (issues.length) return { ok: false, error: 'Argumentos não correspondem ao schema da ferramenta.', issues }
      // Retorno original: nenhuma conversão automática de erro em sucesso.
      return entry.handler(args as Record<string, unknown>)
    } },
  }
  return { tools, registry }
}

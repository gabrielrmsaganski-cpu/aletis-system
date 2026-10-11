export type AlixTaskType = 'quick' | 'lookup' | 'extraction' | 'operation' | 'research' | 'analysis' | 'complex_work'

export interface RoutingModel {
  id: string
  deployment: string
  provider: 'foundry' | 'openai'
  availability: 'available' | 'unavailable' | 'unknown'
  capabilities: readonly string[]
  label: string
  protocols?: readonly string[]
}

export interface RoutingCatalog {
  checkedAt: string
  provider: 'foundry' | 'openai'
  configured: boolean
  models: readonly RoutingModel[]
}

export interface AlixModelSelectionRequest {
  message: string
  analysisMode?: 'standard' | 'deep'
  workMode?: string
  attachmentCount?: number
  modelPreference?: string
}

export interface AlixModelSelection {
  mode: 'auto' | 'manual'
  model: string
  modelLabel: string
  deployment: string
  requestedModel?: string
  preferredModel: string
  provider: 'foundry' | 'openai'
  reason: string
  taskType: AlixTaskType
  fallback: boolean
  catalogCheckedAt: string
  reasoningEffort?: 'low' | 'medium' | 'high'
  maxIterations: number
  maxOutputTokens: number
}

export class AlixModelSelectionError extends Error {
  constructor(public readonly code: 'provider_unavailable' | 'model_unavailable' | 'capability_unavailable', message: string) {
    super(message)
    this.name = 'AlixModelSelectionError'
  }
}

const MODELS = {
  luna: 'gpt-5.6-luna',
  terra: 'gpt-5.6-terra',
  sol: 'gpt-5.6-sol',
  astra: 'gpt-6-astra',
} as const

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

interface TaskProfile {
  type: AlixTaskType
  family: keyof typeof MODELS
  reason: string
  effort: 'low' | 'medium' | 'high'
  iterations: number
  output: number
}

/** Política operacional verificável: o classificador não faz uma chamada de IA adicional. */
export function classifyAlixTask(request: AlixModelSelectionRequest): TaskProfile {
  // Restrições como "não cadastre nada" não são pedidos de cadastro. A remoção
  // serve só à classificação; o modelo recebe a mensagem original integral.
  const message = normalized(request.message).replace(
    /\b(?:nao|nunca|sem)\s+(?:(?:quero|preciso|deve|fazer|realizar|executar|voce|que)\s+)*(?:cadastr\w*|atualiz\w*|registr\w*|preench\w*|cri\w*|adicion\w*|vincul\w*|agend\w*|salv\w*|pesquis\w*|investig\w*|busc\w*)\b.*?(?=\s+(?:mas|apenas|somente)\s+|[.!?;,]|$)/g,
    ' ',
  )
  const attachments = Math.max(0, Math.floor(request.attachmentCount || 0))
  const profile = (type: AlixTaskType, family: TaskProfile['family'], reason: string, effort: TaskProfile['effort'], iterations: number, output: number): TaskProfile => ({ type, family, reason, effort, iterations, output })
  if (attachments === 0 && /^(oi|ola|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|tudo bem)[!?.\s]*$/.test(message)) {
    return profile('quick', 'luna', 'Conversa breve, sem investigação ou alteração de registros.', 'low', 4, 1200)
  }

  const extraction = /\b(extrai\w*|extracao|classifi\w*|transcrev\w*|transcricao|resum\w*|converta|tabela)\b/.test(message)
  const operation = /\b(cadastr\w*|atualiz\w*|registr\w*|preench\w*|complet\w*|crie|criar|adicione|adicionar|vincul\w*|agend\w*|salv\w*)\b/.test(message)
  const research = /\b(pesquis\w*|investig\w*|busque na (web|internet)|noticias|fontes externas|legislacao|jurisprudencia)\b/.test(message)
  const analysis = /\b(analis\w*|diagnostic\w*|compar\w*|estrateg\w*|cenari\w*|viabilidade|reestrutur\w*|renegoci\w*|parecer|dossie|due diligence)\b/.test(message)
  const intensive = /\b(profund\w*|minucios\w*|exaustiv\w*|extrem\w*|multipl\w*|ponta a ponta|do inicio ao fim|todas as fontes|todo o sistema)\b/.test(message)
  const financial = /\b(divid\w*|financeir\w*|contrat\w*|garanti\w*|taxa\w*|credor\w*|pagamento\w*)\b/.test(message)
  const modeResearch = request.workMode === 'research'
  const modeAnalysis = ['negotiation', 'due_diligence', 'document_generation'].includes(request.workMode || '')
  const stages = [extraction, operation, research, analysis].filter(Boolean).length
  const largeScope = attachments >= 4 || message.length > 6000

  if ((analysis || research) && ((intensive && (stages >= 2 || attachments >= 2)) || (largeScope && stages >= 2) || (stages >= 3 && request.analysisMode === 'deep'))) {
    return profile('complex_work', 'astra', 'Trabalho com várias etapas e fontes, que exige análise e conferência aprofundadas.', 'high', 16, 12000)
  }
  if (analysis || modeAnalysis || largeScope || (financial && (operation || extraction) && attachments >= 2)) {
    return profile('analysis', 'sol', attachments >= 2 ? 'Análise e cruzamento de documentos ou decisões financeiras que exigem maior profundidade.' : 'Pedido de diagnóstico, comparação ou estratégia que exige análise detalhada.', request.analysisMode === 'deep' ? 'high' : 'medium', 12, 8000)
  }
  if (research || modeResearch) {
    return profile('research', intensive ? 'sol' : 'terra', 'Pesquisa com consulta às fontes e verificação da origem das informações.', 'medium', 12, 6000)
  }
  if (operation) {
    return profile('operation', 'terra', 'Tarefa operacional: localizar registros, conferir dados e aplicar as ações autorizadas.', 'medium', 12, 5000)
  }
  if (extraction && attachments <= 2 && message.length < 2500) {
    return profile('extraction', 'luna', 'Extração, classificação ou resumo com escopo delimitado; os campos continuam vinculados às fontes.', 'low', 8, 5000)
  }
  return profile('lookup', 'terra', 'Consulta operacional ao ALETIS, com uso das ferramentas e dos dados disponíveis.', 'low', 10, 5000)
}

function preferences(family: TaskProfile['family']): string[] {
  const ordered: Record<TaskProfile['family'], Array<TaskProfile['family']>> = {
    luna: ['luna', 'terra', 'sol', 'astra'],
    terra: ['terra', 'sol', 'astra', 'luna'],
    sol: ['sol', 'astra', 'terra', 'luna'],
    astra: ['astra', 'sol', 'terra', 'luna'],
  }
  return ordered[family].map(key => MODELS[key])
}

function configuredChatModel(): string | undefined {
  const configured = process.env.ALIX_CHAT_MODEL?.trim()
  return configured && Object.values(MODELS).includes(configured as (typeof MODELS)[keyof typeof MODELS])
    ? configured
    : undefined
}

/** Só escolhe entre deployments disponíveis e com os recursos usados pelo chat. */
export function selectAlixModel(catalog: RoutingCatalog, request: AlixModelSelectionRequest): AlixModelSelection {
  if (!catalog.configured) {
    throw new AlixModelSelectionError('provider_unavailable', 'A conexão de IA ainda não está configurada. Consulte o estado dos modelos na ALIX.')
  }
  const task = classifyAlixTask(request)
  const requested = request.modelPreference?.trim()
  const manual = Boolean(requested && requested !== 'auto')
  const requiredCapabilities = ['chat', 'tool_calling', ...((request.attachmentCount || 0) > 0 ? ['vision'] : [])]
  const available = catalog.models.filter(model => model.availability === 'available')
  const compatible = available.filter(model => requiredCapabilities.every(capability => model.capabilities.includes(capability)) && (!model.protocols || model.protocols.includes('responses')))
  let chosen: RoutingModel | undefined
  const configuredDefault = manual ? undefined : configuredChatModel()
  const order = configuredDefault
    ? [configuredDefault, ...preferences(task.family).filter((id) => id !== configuredDefault)]
    : preferences(task.family)
  if (manual) {
    const found = available.find(model => model.id === requested)
    if (!found) throw new AlixModelSelectionError('model_unavailable', `O modelo selecionado (${requested}) não consta como disponível na conexão atual. Escolha Automático ou outro modelo disponível.`)
    chosen = compatible.find(model => model.id === requested)
    if (!chosen) throw new AlixModelSelectionError('capability_unavailable', `O modelo selecionado não tem todos os recursos necessários para esta conversa${(request.attachmentCount || 0) > 0 ? ' e seus anexos' : ''}.`)
  } else {
    chosen = order.map(id => compatible.find(model => model.id === id)).find(Boolean)
      || compatible.slice().sort((a, b) => a.id.localeCompare(b.id))[0]
  }
  if (!chosen) throw new AlixModelSelectionError('provider_unavailable', 'Nenhum modelo disponível foi confirmado com os recursos necessários. A ALIX não iniciou uma geração com um modelo presumido.')

  const fallback = !manual && chosen.id !== order[0]
  return {
    mode: manual ? 'manual' : 'auto',
    model: chosen.id,
    modelLabel: chosen.label,
    deployment: chosen.deployment,
    ...(manual ? { requestedModel: requested } : {}),
    preferredModel: manual ? requested! : order[0],
    provider: chosen.provider,
    reason: manual
      ? `Modelo escolhido por você. ${task.reason}`
      : fallback
        ? `${configuredDefault ? `${configuredDefault} é a IA principal configurada para a ALIX.` : task.reason} ${order[0]} não está disponível com os recursos necessários; foi selecionado ${chosen.label}.`
        : configuredDefault
          ? `${chosen.label} é a IA principal configurada para a ALIX.`
          : task.reason,
    taskType: task.type,
    fallback,
    catalogCheckedAt: catalog.checkedAt,
    ...(chosen.capabilities.includes('reasoning') ? { reasoningEffort: task.effort } : {}),
    maxIterations: task.iterations,
    maxOutputTokens: task.output,
  }
}

export async function resolveAlixModelSelection(request: AlixModelSelectionRequest): Promise<AlixModelSelection> {
  const { getRuntimeModelCatalog } = await import('../../llm/ModelCatalog.js')
  return selectAlixModel(await getRuntimeModelCatalog(), request)
}

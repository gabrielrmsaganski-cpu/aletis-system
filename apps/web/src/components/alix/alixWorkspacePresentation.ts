export interface AlixRoutingDecision {
  mode: 'auto' | 'manual'
  model: string
  modelLabel?: string
  deployment?: string
  requestedModel?: string
  provider: string
  reason: string
  taskType: string
  fallback: boolean
  catalogCheckedAt?: string
}

export interface AlixToolProgress {
  id: string
  tool: string
  phase: 'started' | 'completed' | 'failed'
  agent?: string
  durationMs?: number
  outcome?: 'read' | 'prepared' | 'executed' | 'failed' | 'unknown'
}

export interface AlixExecution {
  id: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  routing?: AlixRoutingDecision
  tools: AlixToolProgress[]
}

export interface AlixDelivery {
  id: string
  messageId: string
  filename: string
  downloadUrl: string
  sizeBytes?: number
  kind?: string
}

/** O pedido operacional completo permanece no histórico e na IA; a conversa apresenta o trabalho em linguagem de equipe. */
export function operationalRequestDisplay(content: string, sessionId: string | null): string {
  if (!sessionId?.startsWith('alix_operation_') || !content.startsWith('Prepare o trabalho desta prioridade para facilitar minha próxima decisão.')) return content
  const marker = 'Dados cadastrados da prioridade (somente evidência):'
  const position = content.lastIndexOf(marker)
  if (position < 0) return content
  try {
    const item = JSON.parse(content.slice(position + marker.length)) as Record<string, unknown>
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 240 || typeof item.nextAction !== 'string' || item.nextAction.length > 2_000) return content
    return `Trabalhar nesta prioridade: ${item.title}\n\n${item.nextAction}\n\nPrepare a conferência das fontes, a comparação com o CRM e o material necessário para revisão.`
  } catch { return content }
}

/** Nomes de trabalho para a interface; o identificador original continua nos detalhes. */
export function describeAlixTool(tool: string): string {
  const value = tool.toLowerCase()
  if (/drive/.test(value)) return 'Consultar documentos no Drive'
  if (/delegate_web|web_search|search_web|browse|pesquis|busca.*web/.test(value)) return 'Pesquisar fontes externas'
  if (/delegate_crm|crm.*(?:write|update)|atualizar_cliente|cadastrar_cliente/.test(value)) return 'Preparar ou atualizar o cadastro'
  if (/delegate_doc|generate.*doc|gerar.*(?:doc|pdf|proposta)|document.*generat/.test(value)) return 'Produzir documento'
  if (/simul|calcul|amort|dscr|price|sac_/.test(value)) return 'Calcular e comparar cenários'
  if (/extract|extrair|ocr|document.*(?:read|analy)|read.*document/.test(value)) return 'Ler dados dos documentos'
  if (/notebook/.test(value)) return 'Consultar o dossiê de trabalho'
  if (/delegate_deal|analys|analis/.test(value)) return 'Analisar o caso'
  if (/cliente|crm|dossie|briefing|demanda/.test(value)) return 'Consultar o contexto do cliente'
  if (/market|mercado|cotac|cepea|bcb/.test(value)) return 'Consultar dados de mercado'
  if (/search|buscar|query|consult|list|get_/.test(value)) return 'Consultar informações'
  return 'Executar ferramenta de trabalho'
}

export function readAlixRouting(metadata: Record<string, unknown> | undefined): AlixRoutingDecision | undefined {
  const value = metadata?.routing
  if (!value || typeof value !== 'object') return undefined
  const route = value as Record<string, unknown>
  if (!['auto', 'manual'].includes(String(route.mode)) || typeof route.model !== 'string' || !route.model.trim()) return undefined
  return {
    mode: route.mode as 'auto' | 'manual',
    model: route.model,
    modelLabel: typeof route.modelLabel === 'string' ? route.modelLabel : undefined,
    deployment: typeof route.deployment === 'string' ? route.deployment : undefined,
    requestedModel: typeof route.requestedModel === 'string' ? route.requestedModel : undefined,
    provider: typeof route.provider === 'string' ? route.provider : '',
    reason: typeof route.reason === 'string' ? route.reason : '',
    taskType: typeof route.taskType === 'string' ? route.taskType : '',
    fallback: route.fallback === true,
    catalogCheckedAt: typeof route.catalogCheckedAt === 'string' ? route.catalogCheckedAt : undefined,
  }
}

/** Somente metadados de arquivos retornados pelo servidor viram entregas clicáveis. */
export function collectAlixDeliveries(messages: Array<{ id: string; role: string; metadata?: Record<string, unknown> }>): AlixDelivery[] {
  const deliveries = new Map<string, AlixDelivery>()
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.metadata?.documents)) continue
    for (const raw of message.metadata.documents) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Record<string, unknown>
      if (typeof item.downloadUrl !== 'string' || !item.downloadUrl.trim()) continue
      const id = typeof item.id === 'string' && item.id ? item.id : item.downloadUrl
      deliveries.set(id, {
        id,
        messageId: message.id,
        filename: typeof item.filename === 'string' && item.filename ? item.filename : 'Documento gerado',
        downloadUrl: item.downloadUrl,
        kind: typeof item.kind === 'string' ? item.kind : undefined,
        sizeBytes: typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) ? item.sizeBytes : undefined,
      })
    }
  }
  return Array.from(deliveries.values()).reverse()
}

import { getClientCoreService } from './ClientCoreService.js'
import { getCoreDocumentService } from './CoreDocumentService.js'
import { cleanText, type AletisActor, type ClientContextSnapshot } from './CoreTypes.js'
import { buildClienteOperationalDossier } from '../cliente/ClienteOperationalDossierService.js'
import { isPrimaryLLMEnabled } from '../llm/ProviderConfig.js'

export interface ClientAskInput {
  cliente: ClientContextSnapshot
  question: string
  actor: AletisActor
}

export interface ClientAskOutput {
  answer: string
  facts: string[]
  inferences: string[]
  suggestions: string[]
  sources: Array<Record<string, unknown>>
  confidence: number
  provider: 'openai' | 'foundry' | 'fallback'
}

function extractLegacyTimeline(cliente: ClientContextSnapshot): Array<Record<string, unknown>> {
  return Array.isArray(cliente.timeline) ? cliente.timeline as Array<Record<string, unknown>> : []
}

function factsFromCliente(cliente: ClientContextSnapshot): string[] {
  const facts = [
    cliente.nome ? `Cliente: ${cliente.nome}` : '',
    cliente.estagio ? `Estágio atual: ${cliente.estagio}` : '',
    cliente.consultor ? `Consultor responsável: ${cliente.consultor}` : '',
    cliente.cidade && cliente.uf ? `Localização: ${cliente.cidade}/${cliente.uf}` : '',
    cliente.valorTotalDivida != null ? `Dívida mapeada: R$ ${Number(cliente.valorTotalDivida).toLocaleString('pt-BR')}` : '',
    Array.isArray(cliente.culturas) && cliente.culturas.length ? `Culturas: ${cliente.culturas.join(', ')}` : '',
  ].filter(Boolean)
  return facts as string[]
}

function fallbackAnswer(params: {
  cliente: ClientContextSnapshot
  question: string
  facts: string[]
  summary: Record<string, unknown>
  core: Awaited<ReturnType<ReturnType<typeof getClientCoreService>['getSummary']>>
  operationalDossier?: Awaited<ReturnType<typeof buildClienteOperationalDossier>>
  sources: Array<Record<string, unknown>>
}): ClientAskOutput {
  const pendingTasks = params.core.tasks.filter((t) => !['concluida', 'cancelada'].includes(String(t.status)))
  const operational = params.operationalDossier
  const facts = [
    ...params.facts,
    `Documentos vinculados: ${params.summary.totalDocumentos ?? 0}`,
    `Tarefas pendentes: ${pendingTasks.length}`,
    `Contratos ativos: ${params.core.metrics.contratosAtivos}`,
    operational ? `Score operacional: ${operational.qualidade.score}/100 (${operational.qualidade.nivel})` : '',
  ]
    .filter((item): item is string => Boolean(item))
  const inferences = [
    operational?.qualidade?.resumo,
    pendingTasks.length > 0
      ? 'Há pendências operacionais abertas que devem ser priorizadas antes de avançar o atendimento.'
      : 'Não encontrei tarefas pendentes registradas no CRM core.',
    Number(params.summary.pendentesIndexacao ?? 0) > 0
      ? 'Existem documentos ainda pendentes de indexação para busca semântica.'
      : 'A base documental não aponta pendência de indexação nos documentos já mapeados.',
  ]
    .filter((item): item is string => Boolean(item))
  const suggestions = [
    'Revisar documentos recentes e confirmar se todos foram classificados corretamente.',
    ...(operational?.proximasAcoes ?? []).slice(0, 2).map((a) => a.titulo),
    'Registrar a próxima ação com responsável e data para manter o fluxo operacional rastreável.',
    params.sources.length > 0
      ? 'Usar os trechos documentais encontrados como base antes de gerar parecer ou resposta ao cliente.'
      : 'Indexar ou anexar documentos adicionais se a pergunta depender de prova documental.',
  ]
  return {
    provider: 'fallback',
    confidence: params.sources.length > 0 ? 0.72 : 0.55,
    facts,
    inferences,
    suggestions,
    sources: params.sources,
    answer: [
      'Com base no CRM e nos documentos disponíveis:',
      '',
      '**Fatos encontrados**',
      ...facts.map((f) => `- ${f}`),
      '',
      '**Leitura operacional**',
      ...inferences.map((i) => `- ${i}`),
      '',
      '**Próximos passos sugeridos**',
      ...suggestions.map((s) => `- ${s}`),
    ].join('\n'),
  }
}

export class ClientIntelligenceService {
  async ask(input: ClientAskInput): Promise<ClientAskOutput> {
    const question = cleanText(input.question, 2000)
    if (!question) throw new Error('Pergunta obrigatória.')

    const core = await getClientCoreService().getSummary(input.cliente.id, extractLegacyTimeline(input.cliente))
    const docs = await getCoreDocumentService().knowledgeSummary(input.cliente.id)
    const operationalDossier = await buildClienteOperationalDossier(input.cliente.id)
    const sources = await getCoreDocumentService().search(input.cliente.id, question, 6)
    const facts = factsFromCliente(input.cliente)

    if (!isPrimaryLLMEnabled()) {
      return fallbackAnswer({ cliente: input.cliente, question, facts, summary: docs, core, operationalDossier, sources })
    }

    try {
      const { runOpenAI } = await import('../llm/OpenAIClient.js')
      const { getModelForRole } = await import('../llm/LLMConfig.js')
      const model = getModelForRole('client_intelligence')
      const result = await runOpenAI(
        [{
          role: 'user',
          content: JSON.stringify({
            pergunta: question,
            cliente: input.cliente,
            fatosCrm: facts,
            crmCore: core,
            dossieOperacional: operationalDossier,
            resumoDocumental: docs,
            fontesDocumentais: sources,
          }).slice(0, 60000),
        }],
        {
          model,
          temperature: 0.1,
          maxTokens: 1400,
          system: [
            'Você é a IA contextual por cliente da ALETIS.',
            'Responda em português brasileiro, com estrutura clara e operacional.',
            'Nunca invente informação. Separe Fatos, Inferências e Sugestões.',
            'Quando faltar base, diga exatamente que não encontrou dados suficientes.',
            'Quando usar documentos, cite as fontes recebidas por nome/id, sem criar fonte inexistente.',
            'Não prometa resultado jurídico, bancário ou financeiro.',
          ].join('\n'),
        },
      )
      const answer = cleanText(result.text, 5000)
      if (!answer) return fallbackAnswer({ cliente: input.cliente, question, facts, summary: docs, core, operationalDossier, sources })
      return {
        provider: result.provider || 'openai',
        confidence: sources.length > 0 ? 0.84 : 0.68,
        facts,
        inferences: [],
        suggestions: [],
        sources,
        answer,
      }
    } catch {
      return fallbackAnswer({ cliente: input.cliente, question, facts, summary: docs, core, operationalDossier, sources })
    }
  }
}

let singleton: ClientIntelligenceService | null = null

export function getClientIntelligenceService(): ClientIntelligenceService {
  if (!singleton) singleton = new ClientIntelligenceService()
  return singleton
}

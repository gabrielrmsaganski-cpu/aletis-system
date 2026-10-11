// ============================================================
// ALETIS — ALIX Command Center
//
// Endpoint determinístico para dashboard e página da ALIX. Não pede para
// o modelo "imaginar" o dia: cruza CRM, propostas, insights proativos,
// confirmações HITL, mercado e memória persistente.
// ============================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { clientes } from './clientes.js'
import { propostas, propostasInteligentes } from './propostas.js'
import { getDb, isPgEnabled } from '../db/client.js'
import { alixDocumentOnboardingReview } from '../db/schema.js'
import { DataSourceManager } from '../services/DataSourceManager.js'
import { MarketBriefService } from '../services/MarketBriefService.js'
import { getAlixConfirmationStore } from '../services/alix/AlixConfirmationStore.js'
import { getAlixMemoryService } from '../services/alix/memory/AlixMemoryService.js'
import { getProactiveService, type Insight } from '../services/alix/ProactiveService.js'
import { getProspeccaoService } from '../services/prospeccao/ProspeccaoService.js'
import { isOpenAIEnabled } from '../services/llm/OpenAIClient.js'
import { MODEL_REGISTRY, getModelForRole } from '../services/llm/LLMConfig.js'
import { getAlixMissionService } from '../services/alix/workspace/AlixMissionService.js'
import { getDocumentPipelineService } from '../services/alix/intake/DocumentPipelineService.js'

type Tone = 'info' | 'atencao' | 'critico' | 'ok'

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseYmd(value: unknown): string {
  if (!value) return ''
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function daysUntil(value: unknown): number | null {
  const ymd = parseYmd(value)
  if (!ymd) return null
  const base = new Date(`${todayYmd()}T00:00:00.000Z`).getTime()
  const target = new Date(`${ymd}T00:00:00.000Z`).getTime()
  return Math.round((target - base) / 86_400_000)
}

function fmtBRL(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 'R$ 0'
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1).replace('.', ',')} bi`
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace('.', ',')} mi`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0).replace('.', ',')} mil`
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
}

function safeText(value: unknown, max = 240): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text
}

function activeStage(stage: unknown): boolean {
  return ['lead', 'prospeccao', 'qualificacao', 'analise', 'diagnostico_em_analise', 'coleta_documentos', 'proposta', 'proposta_enviada', 'negociacao', 'acordo', 'acompanhamento']
    .includes(String(stage || '').toLowerCase())
}

async function pendingDocumentReviews(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const db = getDb()
    const rows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(alixDocumentOnboardingReview)
      .where(inArray(alixDocumentOnboardingReview.status, ['needs_review', 'ready_for_hitl', 'blocked_duplicate']))
    return Number(rows[0]?.total || 0)
  } catch {
    return 0
  }
}

function insightTone(i: Insight): Tone {
  if (i.urgencia === 'critico') return 'critico'
  if (i.urgencia === 'importante') return 'atencao'
  return 'info'
}

function compactInsights(items: Insight[]): Insight[] {
  const byKey = new Map<string, Insight>()
  for (const item of items) {
    const payload = item.payload || {}
    const key = [
      item.tipo,
      payload.uniqueKey,
      payload.clienteId,
      payload.propostaId,
      item.titulo,
    ].filter(Boolean).join(':')
    const prev = byKey.get(key)
    if (!prev || String(item.ts || '').localeCompare(String(prev.ts || '')) > 0) {
      byKey.set(key, item)
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
    .slice(0, 200)
}

export default async function alixCommandCenterRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/alix/command-center',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const query = z.object({ includeMarket: z.enum(['true', 'false']).optional() }).safeParse(_req.query)
      if (!query.success) return reply.status(400).send({ success: false, error: 'Parâmetros de consulta inválidos.' })
      const includeMarket = query.data.includeMarket !== 'false'
      const geradoEm = new Date().toISOString()
      const allClientes = Array.from(clientes.values()) as any[]
      const allPropostas = [
        ...Array.from(propostas.values()).map((p: any) => ({ ...p, kind: 'padrao' })),
        ...Array.from(propostasInteligentes.values()).map((p: any) => ({
          id: p.id,
          clienteId: p.cliente?.id,
          clienteNome: p.cliente?.nome,
          titulo: p.secoes?.capa?.titulo || 'Proposta inteligente',
          credor: p.credor,
          status: 'gerada',
          valorDivida: p.metricasChave?.valorDividaAtualizado,
          valorProposta: p.metricasChave?.valorPropostaEstruturada,
          dataValidade: p.dataValidade,
          kind: 'inteligente',
        })),
      ]

      const ativos = allClientes.filter((c) => activeStage(c.estagio))
      let acoesHoje = 0
      let acoesAtrasadas = 0
      let semProximaAcao = 0
      const prioridades: Array<{
        id: string
        tipo: string
        titulo: string
        detalhe: string
        tone: Tone
        to?: string
      }> = []

      for (const c of ativos) {
        const clienteId = String(c.id)
        const nome = safeText(c.nome || clienteId, 80)
        const acao = c.proximaAcao && typeof c.proximaAcao === 'object' ? c.proximaAcao : null
        const prazo = acao?.data ? daysUntil(acao.data) : null
        const saude = Number(c.saudeFinanceira ?? c.saude ?? 0)
        const divida = Number(c.valorTotalDivida ?? c.valorDivida ?? 0)

        if (prazo != null && prazo < 0) {
          acoesAtrasadas++
          prioridades.push({
            id: `acao-atrasada-${clienteId}`,
            tipo: 'crm',
            titulo: `${nome} · ação atrasada`,
            detalhe: `${Math.abs(prazo)} dia(s) em atraso · ${safeText(acao?.descricao || 'sem descrição', 140)}`,
            tone: prazo <= -3 ? 'critico' : 'atencao',
            to: `/clientes/${clienteId}`,
          })
        } else if (prazo === 0) {
          acoesHoje++
          prioridades.push({
            id: `acao-hoje-${clienteId}`,
            tipo: 'crm',
            titulo: `${nome} · ação hoje`,
            detalhe: safeText(acao?.descricao || 'próxima ação do dia', 160),
            tone: 'atencao',
            to: `/clientes/${clienteId}`,
          })
        } else if (!acao && ['proposta', 'proposta_enviada', 'negociacao', 'acordo'].includes(String(c.estagio || '').toLowerCase())) {
          semProximaAcao++
          prioridades.push({
            id: `sem-acao-${clienteId}`,
            tipo: 'crm',
            titulo: `${nome} · sem próximo passo`,
            detalhe: `Estágio ${safeText(c.estagio, 40)} · ${fmtBRL(divida)} mapeados`,
            tone: 'atencao',
            to: `/clientes/${clienteId}`,
          })
        }

        if (saude > 0 && saude < 45) {
          prioridades.push({
            id: `saude-${clienteId}`,
            tipo: 'risco',
            titulo: `${nome} · risco financeiro`,
            detalhe: `Saúde ${saude}/100 · ${fmtBRL(divida)} em dívida mapeada`,
            tone: 'critico',
            to: `/clientes/${clienteId}`,
          })
        }
      }

      const propostasAbertas = allPropostas.filter((p: any) =>
        !['aceita', 'rejeitada', 'expirada', 'concluida', 'concluída'].includes(String(p.status || '').toLowerCase()),
      )
      let propostasVencendo = 0
      for (const p of propostasAbertas) {
        const prazo = daysUntil((p as any).dataValidade || (p as any).prazoValidade || (p as any).validoAte)
        if (prazo != null && prazo >= 0 && prazo <= 7) {
          propostasVencendo++
          prioridades.push({
            id: `proposta-${p.id}`,
            tipo: 'proposta',
            titulo: `${safeText((p as any).clienteNome || 'Cliente', 70)} · proposta vencendo`,
            detalhe: `${prazo === 0 ? 'vence hoje' : `vence em ${prazo}d`} · ${(p as any).credor || 'credor a confirmar'} · ${fmtBRL((p as any).valorProposta)}`,
            tone: prazo <= 2 ? 'critico' : 'atencao',
            to: p.kind === 'padrao'
              ? `/propostas?proposta=${encodeURIComponent(String(p.id))}`
              : p.clienteId ? `/clientes/${encodeURIComponent(String(p.clienteId))}` : '/propostas',
          })
        }
      }

      let insights: Insight[] = []
      try {
        const proactive = getProactiveService(getProspeccaoService(), `${process.cwd()}/storage`)
        // Prazos e próximas ações já são recalculados acima com o cadastro atual.
        // Um insight persistido há dias não pode reabrir um alerta resolvido nem
        // repetir uma contagem regressiva que já expirou.
        const recalculatedTypes = new Set(['proposta-vencendo', 'crm-acao-hoje', 'crm-acao-vencida', 'crm-sem-proxima-acao'])
        insights = compactInsights((await proactive.getRecentInsights(7)).filter(item => !recalculatedTypes.has(item.tipo)))
      } catch {
        insights = []
      }

      for (const i of insights.slice(0, 12)) {
        if (i.urgencia === 'info') continue
        const clienteId = String((i.payload || {}).clienteId || '')
        prioridades.push({
          id: i.id,
          tipo: i.tipo,
          titulo: safeText(i.titulo, 90),
          detalhe: safeText(i.detalhes, 180),
          tone: insightTone(i),
          to: clienteId ? `/clientes/${clienteId}` : undefined,
        })
      }

      const urgRank = { critico: 3, atencao: 2, info: 1, ok: 0 } as const
      prioridades.sort((a, b) => urgRank[b.tone] - urgRank[a.tone])

      const confirmations = getAlixConfirmationStore().listActive()
      const memoriaClientes = await getAlixMemoryService().list().catch(() => [])
      const [docsPendentes, missionStats, pipelineStats] = await Promise.all([
        pendingDocumentReviews(),
        getAlixMissionService().stats().catch(() => ({ total: 0, byStatus: {}, costUsd: '0.000000' })),
        getDocumentPipelineService().stats().catch(() => ({ total: 0, byStatus: {}, openFindings: 0 })),
      ])
      const missionStatus = (missionStats.byStatus || {}) as Record<string, number>
      const missoesAtivas = Number(missionStatus.queued || 0) + Number(missionStatus.running || 0)
      const achadosDocumentais = Number(pipelineStats.openFindings || 0)

      let mercado: any = null
      if (includeMarket) try {
        const brief = await new MarketBriefService(DataSourceManager.getInstance()).generateBrief()
        mercado = {
          geradoEm: brief.geradoEm,
          fonteOrigem: brief.fonteOrigem,
          narrativaCurta: brief.narrativaCurta,
          macro: brief.macro,
          alertas: brief.alertas.slice(0, 5),
          topAltas: brief.topAltas.slice(0, 3),
          topBaixas: brief.topBaixas.slice(0, 3),
        }
      } catch (err) {
        mercado = {
          geradoEm,
          fonteOrigem: 'indisponivel',
          narrativaCurta: `Brief de mercado indisponível: ${(err as Error).message}`,
          macro: {},
          alertas: [],
          topAltas: [],
          topBaixas: [],
        }
      }

      const tarefasHoje = [
        acoesAtrasadas > 0 ? `Resolver ${acoesAtrasadas} ação(ões) atrasada(s) no CRM.` : '',
        acoesHoje > 0 ? `Executar ${acoesHoje} ação(ões) marcada(s) para hoje.` : '',
        semProximaAcao > 0 ? `Definir próximo passo em ${semProximaAcao} negociação(ões).` : '',
        propostasVencendo > 0 ? `Revisar ${propostasVencendo} proposta(s) com validade curta.` : '',
        docsPendentes > 0 ? `Revisar ${docsPendentes} documento(s) analisado(s) pela ALIX.` : '',
        missoesAtivas > 0 ? `Acompanhar ${missoesAtivas} missão(ões) ativa(s) na Central de Tarefas.` : '',
        achadosDocumentais > 0 ? `Resolver ${achadosDocumentais} achado(s) da esteira documental.` : '',
        confirmations.length > 0 ? `Aprovar ou rejeitar ${confirmations.length} ação(ões) pendente(s) da ALIX.` : '',
      ].filter(Boolean)

      const configuredRoles = {
        orchestrator: getModelForRole('orchestrator'),
        dealAnalyzer: getModelForRole('deal_analyzer'),
        crmWriter: getModelForRole('crm_writer'),
        docExtractor: getModelForRole('doc_extractor'),
      }

      return reply.status(200).send({
        success: true,
        data: {
          geradoEm,
          headline: prioridades[0]?.titulo || 'Carteira sem urgência crítica registrada',
          resumo:
            prioridades[0]?.detalhe ||
            'CRM, propostas e mercado sem bloqueio operacional relevante no momento.',
          ai: {
            operacional: isOpenAIEnabled(),
            memoriaClientes: memoriaClientes.length,
            ferramentasDisponiveis: 70,
            modelosConfigurados: Object.keys(configuredRoles).length,
            modelosLiberados: Object.keys(MODEL_REGISTRY).length,
          },
          kpis: {
            clientes: allClientes.length,
            clientesAtivos: ativos.length,
            propostasAbertas: propostasAbertas.length,
            propostasVencendo,
            acoesHoje,
            acoesAtrasadas,
            semProximaAcao,
            documentosParaRevisar: docsPendentes,
            missoesAtivas,
            achadosDocumentais,
            confirmacoesPendentes: confirmations.length,
            insightsCriticos: insights.filter((i) => i.urgencia === 'critico').length,
            insightsImportantes: insights.filter((i) => i.urgencia === 'importante').length,
          },
          tarefasHoje,
          prioridades: prioridades.slice(0, 8),
          mercado,
          status: {
            llm: isOpenAIEnabled() ? 'operacional' : 'sem-chave',
            memoria: memoriaClientes.length > 0 ? 'ativa' : 'sem-registros',
            hitl: confirmations.length > 0 ? 'pendente' : 'sem-pendencias',
          },
          workspace: {
            missions: missionStats,
            documentPipeline: pipelineStats,
          },
        },
      })
    },
  )

  console.log('[ALIX] Command Center route registrada: GET /api/alix/command-center')
}

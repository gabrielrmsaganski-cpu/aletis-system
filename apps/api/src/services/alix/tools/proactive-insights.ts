// ============================================================
// proactive-insights — tools de resposta a insights proativos (Wave A5)
// ============================================================
// Fecha o loop entre ALIX proativa e o Christian: ALIX dispara um
// insight (lead-quente, stage-stuck, whatsapp-mudo, etc.), e quando
// Christian age (ou pede para ignorar), ALIX registra a resposta em
// alix-insights/responses.jsonl e marca o insight como "consumido"
// — sem isso, ele volta a aparecer na lista de pendentes.
//
// Tools:
//   listar_insights_pendentes
//   responder_insight
// ============================================================

import { mkdirSync } from 'fs'
import { appendFile } from 'fs/promises'
import { join } from 'path'
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js'
import { getProactiveService } from '../ProactiveService.js'
import { getProspeccaoService } from '../../prospeccao/ProspeccaoService.js'

export type RespostaAcao = 'ack' | 'done' | 'snooze' | 'descartar'

export interface InsightResponse {
  ts: string
  insightId: string
  acao: RespostaAcao
  nota?: string
  snoozeUntil?: string
  /** Quem respondeu — sessão ALIX (UI/WhatsApp) ou marcado por humano */
  origem: 'alix' | 'manual'
}

function storageDir(): string {
  return process.env.ALIX_STORAGE_DIR || join(process.cwd(), 'storage')
}

function responsesFile(): string {
  return join(storageDir(), 'alix-insights', 'responses.jsonl')
}

async function appendResponse(resp: InsightResponse): Promise<void> {
  const file = responsesFile()
  try {
    mkdirSync(join(storageDir(), 'alix-insights'), { recursive: true })
    await appendFile(file, JSON.stringify(resp) + '\n')
  } catch (err) {
    console.warn('[proactive-insights] append falhou:', (err as Error).message)
  }
}

export function buildProactiveInsightsTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = []
  const registry: ClaudeToolRegistry = {}

  // ── listar_insights_pendentes ─────────────────────────────
  tools.push({
    name: 'listar_insights_pendentes',
    description:
      'Lista os insights proativos não-respondidos dos últimos N dias (default 7). ' +
      'Use no INÍCIO da conversa para descobrir o que está em aberto e o que merece atenção. ' +
      'Cada insight tem id, tipo, urgência, título e payload — use o id em responder_insight.',
    input_schema: {
      type: 'object',
      properties: {
        dias: { type: 'number', description: 'Janela em dias (default 7)' },
        urgenciaMinima: {
          type: 'string',
          enum: ['info', 'importante', 'critico'],
          description: 'Filtra por urgência mínima (default importante)',
        },
        tipo: {
          type: 'string',
          description: 'Filtra por tipo (lead-enriquecido, stage-stuck, whatsapp-mudo, novo-lead-quente, etc.)',
        },
      },
    },
  })
  registry['listar_insights_pendentes'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const dias = Math.max(1, Math.min(30, Number(input?.dias) || 7))
      const urgFilter = String(input?.urgenciaMinima || 'importante') as 'info' | 'importante' | 'critico'
      const tipoFilter = input?.tipo ? String(input.tipo) : null
      const orderUrg = { info: 0, importante: 1, critico: 2 } as const
      const minScore = orderUrg[urgFilter] ?? 1

      const proactive = getProactiveService(getProspeccaoService(), storageDir())
      const all = await proactive.getRecentInsights(dias)

      // Carrega responses para filtrar os já-respondidos
      const respondidos = new Set<string>()
      const snoozedUntil = new Map<string, number>()
      try {
        const fs = await import('fs')
        const file = responsesFile()
        if (fs.existsSync(file)) {
          const raw = fs.readFileSync(file, 'utf-8').trim()
          for (const line of raw.split('\n')) {
            if (!line) continue
            try {
              const r = JSON.parse(line) as InsightResponse
              if (r.acao === 'snooze' && r.snoozeUntil) {
                const until = new Date(r.snoozeUntil).getTime()
                if (until > Date.now()) {
                  snoozedUntil.set(r.insightId, until)
                  continue
                }
              }
              respondidos.add(r.insightId)
            } catch {/* linha corrompida */}
          }
        }
      } catch {/* sem responses ainda */}

      const filtrados = all.filter((i) => {
        if (respondidos.has(i.id)) return false
        if (snoozedUntil.has(i.id)) return false
        if ((orderUrg[i.urgencia] ?? 0) < minScore) return false
        if (tipoFilter && i.tipo !== tipoFilter) return false
        return true
      })

      // Resumo por tipo + lista detalhada (cap 25 para não inflar contexto)
      const porTipo: Record<string, number> = {}
      for (const i of filtrados) porTipo[i.tipo] = (porTipo[i.tipo] ?? 0) + 1

      return {
        total: filtrados.length,
        janelaDias: dias,
        porTipo,
        insights: filtrados.slice(0, 25).map((i) => ({
          id: i.id,
          tipo: i.tipo,
          urgencia: i.urgencia,
          titulo: i.titulo,
          detalhes: i.detalhes,
          quando: i.ts,
          payload: i.payload,
        })),
      }
    },
  }

  // ── responder_insight ─────────────────────────────────────
  tools.push({
    name: 'responder_insight',
    description:
      'Marca um insight como respondido (fechando o loop com a ALIX proativa). ' +
      'Ações: "ack" (vi e ciente, sem ação), "done" (já agi, ex: contatei lead), ' +
      '"snooze" (ignorar até X), "descartar" (não me interessa similar no futuro). ' +
      'Use quando Christian disser "fiz contato com X", "deixa pra próxima semana", ' +
      '"não quero mais ver isso", etc. SEMPRE peça confirmação se for "descartar".',
    input_schema: {
      type: 'object',
      properties: {
        insightId: { type: 'string', description: 'ID do insight (formato ins_…)' },
        acao: {
          type: 'string',
          enum: ['ack', 'done', 'snooze', 'descartar'],
          description: 'O que Christian quer fazer com esse insight',
        },
        nota: { type: 'string', description: 'Anotação opcional (ex.: "contatei dia X, retorno na quinta")' },
        snoozeUntilDias: {
          type: 'number',
          description: 'Se acao=snooze, em quantos dias re-mostrar (default 7)',
        },
      },
      required: ['insightId', 'acao'],
    },
  })
  registry['responder_insight'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const insightId = String(input?.insightId || '').trim()
      const acao = String(input?.acao || '').trim() as RespostaAcao
      if (!insightId) return { ok: false, error: 'insightId obrigatório' }
      if (!['ack', 'done', 'snooze', 'descartar'].includes(acao)) {
        return { ok: false, error: `acao inválida — use ack|done|snooze|descartar` }
      }
      const resp: InsightResponse = {
        ts: new Date().toISOString(),
        insightId,
        acao,
        nota: input?.nota ? String(input.nota).slice(0, 500) : undefined,
        origem: 'alix',
      }
      if (acao === 'snooze') {
        const dias = Math.max(1, Math.min(60, Number(input?.snoozeUntilDias) || 7))
        resp.snoozeUntil = new Date(Date.now() + dias * 86400_000).toISOString()
      }
      await appendResponse(resp)
      return {
        ok: true,
        registrado: resp,
        mensagem:
          acao === 'snooze'
            ? `Insight em snooze até ${resp.snoozeUntil}.`
            : acao === 'done'
            ? 'Insight marcado como concluído. Vou acompanhar follow-up se aplicável.'
            : acao === 'descartar'
            ? 'Insight descartado. Vou suprimir similares por 30 dias.'
            : 'Insight reconhecido (ack).',
      }
    },
  }

  return { tools, registry }
}

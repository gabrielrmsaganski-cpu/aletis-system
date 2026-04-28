// ============================================================
// deal-room — tools ALIX para gerenciar negociações por credor
// ============================================================
// Permite a ALIX:
//   - listar_negociacoes_cliente(clienteId)
//   - resumo_negociacoes_cliente(clienteId)
//   - abrir_negociacao(clienteId, credor, ...)
//   - atualizar_negociacao(id, ...)
//   - adicionar_nota_negociacao(id, texto)
//
// Toda escrita é HITL — ALIX deve sempre confirmar com Christian
// antes de criar ou alterar negociação.
// ============================================================

import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js'
import { getDealRoomService, type NegociacaoStatus } from '../../dealRoom/DealRoomService.js'

export function buildDealRoomTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = []
  const registry: ClaudeToolRegistry = {}

  // ── listar_negociacoes_cliente ─────────────────────────────
  tools.push({
    name: 'listar_negociacoes_cliente',
    description:
      'Lista negociações ativas e encerradas de um cliente, agrupadas por status. ' +
      'Use ANTES de criar/atualizar para verificar o que já existe e evitar duplicação.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'ID do cliente no CRM' },
      },
      required: ['clienteId'],
    },
  })
  registry['listar_negociacoes_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const list = await getDealRoomService().listByCliente(String(input.clienteId))
      return {
        total: list.length,
        negociacoes: list.map((n) => ({
          id: n.id,
          credor: n.credor,
          status: n.status,
          responsavel: n.responsavel,
          valor_atual: n.valorAtual ? Number(n.valorAtual) : null,
          valor_proposto: n.valorProposto ? Number(n.valorProposto) : null,
          economia_potencial:
            n.valorAtual && n.valorProposto
              ? Number(n.valorAtual) - Number(n.valorProposto)
              : null,
          taxa_atual: n.taxaAtual ? Number(n.taxaAtual) : null,
          taxa_proposta: n.taxaProposta ? Number(n.taxaProposta) : null,
          prazo_meses: n.prazoMeses,
          carencia_meses: n.carenciaMeses,
          proxima_data: n.proximaData,
          historico_count: Array.isArray(n.historico) ? (n.historico as any[]).length : 0,
          ultima_interacao: n.ultimaInteracao,
        })),
      }
    },
  }

  // ── resumo_negociacoes_cliente ─────────────────────────────
  tools.push({
    name: 'resumo_negociacoes_cliente',
    description:
      'Devolve o resumo agregado das negociações de um cliente: total por status, ' +
      'valor em negociação ativa, próximo deadline. Útil para o briefing inicial ' +
      'antes de Christian abrir o Command Center do cliente.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
      },
      required: ['clienteId'],
    },
  })
  registry['resumo_negociacoes_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      return getDealRoomService().resumoCliente(String(input.clienteId))
    },
  }

  // ── abrir_negociacao ────────────────────────────────────────
  tools.push({
    name: 'abrir_negociacao',
    description:
      'Abre uma nova negociação no Deal Room para um cliente × credor. SEMPRE confirme ' +
      'com Christian antes de chamar (HITL). Devolve o ID da negociação criada para ' +
      'usar em atualizar_negociacao depois.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        credor: { type: 'string', description: 'Nome do banco/credor (Sicoob, Banco do Brasil, ...)' },
        responsavel: { type: 'string', description: 'Quem está liderando essa negociação' },
        valorAtual: { type: 'number', description: 'Saldo devedor atual com o credor' },
        valorProposto: { type: 'number', description: 'Valor proposto na negociação' },
        taxaAtual: { type: 'number', description: 'Taxa de juros atual (% a.a.)' },
        taxaProposta: { type: 'number', description: 'Taxa proposta (% a.a.)' },
        prazoMeses: { type: 'number' },
        carenciaMeses: { type: 'number' },
        garantias: { type: 'array', items: { type: 'string' } },
        observacoes: { type: 'string' },
        proximaData: { type: 'string', description: 'ISO date do próximo deadline (ex.: 2026-05-15)' },
      },
      required: ['clienteId', 'credor'],
    },
  })
  registry['abrir_negociacao'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      try {
        const n = await getDealRoomService().create({
          clienteId: String(input.clienteId),
          credor: String(input.credor),
          responsavel: input.responsavel ? String(input.responsavel) : undefined,
          valorAtual: input.valorAtual != null ? Number(input.valorAtual) : undefined,
          valorProposto: input.valorProposto != null ? Number(input.valorProposto) : undefined,
          taxaAtual: input.taxaAtual != null ? Number(input.taxaAtual) : undefined,
          taxaProposta: input.taxaProposta != null ? Number(input.taxaProposta) : undefined,
          prazoMeses: input.prazoMeses != null ? Number(input.prazoMeses) : undefined,
          carenciaMeses: input.carenciaMeses != null ? Number(input.carenciaMeses) : undefined,
          garantias: Array.isArray(input.garantias) ? input.garantias.map(String) : undefined,
          observacoes: input.observacoes ? String(input.observacoes) : undefined,
          proximaData: input.proximaData ? String(input.proximaData) : undefined,
        })
        return {
          ok: true,
          id: n.id,
          credor: n.credor,
          status: n.status,
          mensagem: `Negociação aberta com ${n.credor} (id ${n.id.slice(0, 12)}). Status inicial: negociando.`,
        }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  }

  // ── atualizar_negociacao ────────────────────────────────────
  tools.push({
    name: 'atualizar_negociacao',
    description:
      'Atualiza uma negociação existente: muda status, valores, taxa, prazo, observações ou ' +
      'próximo deadline. Mudança de status entra automaticamente no histórico. SEMPRE ' +
      'confirme com Christian antes (HITL). Use listar_negociacoes_cliente para descobrir o id.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID da negociação (formato neg_…)' },
        status: {
          type: 'string',
          enum: ['negociando', 'contraproposta', 'aguardando_doc', 'aprovado', 'recusado', 'encerrado', 'suspenso'],
        },
        valorAtual: { type: 'number' },
        valorProposto: { type: 'number' },
        taxaAtual: { type: 'number' },
        taxaProposta: { type: 'number' },
        prazoMeses: { type: 'number' },
        carenciaMeses: { type: 'number' },
        observacoes: { type: 'string' },
        proximaData: { type: 'string' },
      },
      required: ['id'],
    },
  })
  registry['atualizar_negociacao'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      try {
        const updated = await getDealRoomService().update(String(input.id), {
          status: input.status as NegociacaoStatus | undefined,
          valorAtual: input.valorAtual != null ? Number(input.valorAtual) : undefined,
          valorProposto: input.valorProposto != null ? Number(input.valorProposto) : undefined,
          taxaAtual: input.taxaAtual != null ? Number(input.taxaAtual) : undefined,
          taxaProposta: input.taxaProposta != null ? Number(input.taxaProposta) : undefined,
          prazoMeses: input.prazoMeses != null ? Number(input.prazoMeses) : undefined,
          carenciaMeses: input.carenciaMeses != null ? Number(input.carenciaMeses) : undefined,
          observacoes: input.observacoes != null ? String(input.observacoes) : undefined,
          proximaData: input.proximaData != null ? String(input.proximaData) : undefined,
        })
        if (!updated) return { ok: false, error: `Negociação ${input.id} não encontrada` }
        return {
          ok: true,
          id: updated.id,
          status: updated.status,
          mensagem: `Negociação atualizada (${updated.credor} · ${updated.status}).`,
        }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  }

  // ── adicionar_nota_negociacao ───────────────────────────────
  tools.push({
    name: 'adicionar_nota_negociacao',
    description:
      'Adiciona uma nota livre ao histórico de uma negociação (sem alterar status/valores). ' +
      'Use para registrar reuniões, ligações, decisões. tipo aceita: ' +
      '"reuniao" | "nota" | "doc_solicitado" | "doc_recebido" | "contraproposta".',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        texto: { type: 'string' },
        tipo: { type: 'string', description: 'reuniao | nota | doc_solicitado | doc_recebido | contraproposta (default nota)' },
      },
      required: ['id', 'texto'],
    },
  })
  registry['adicionar_nota_negociacao'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      try {
        const updated = await getDealRoomService().update(String(input.id), {
          appendHistorico: {
            ts: new Date().toISOString(),
            tipo: (input.tipo as any) ?? 'nota',
            texto: String(input.texto).slice(0, 2000),
          },
        })
        if (!updated) return { ok: false, error: `Negociação ${input.id} não encontrada` }
        const hist = Array.isArray(updated.historico) ? (updated.historico as any[]) : []
        return {
          ok: true,
          id: updated.id,
          historico_count: hist.length,
          mensagem: `Nota adicionada ao histórico (${updated.credor}).`,
        }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  }

  return { tools, registry }
}

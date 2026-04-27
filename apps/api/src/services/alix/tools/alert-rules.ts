// ============================================================
// alert-rules — tools para definir e gerenciar alertas por cliente
// ============================================================
// Wave B1 — habilita Christian a registrar regras tipo "me avisa
// quando soja > 130 para o cliente X" via conversa natural com ALIX.
// ============================================================

import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js'
import { getAlertRulesService, type AlertOperador, type AlertTipo } from '../AlertRulesService.js'

export function buildAlertRulesTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = []
  const registry: ClaudeToolRegistry = {}

  // ── definir_alerta_cliente ──────────────────────────────────
  tools.push({
    name: 'definir_alerta_cliente',
    description:
      'Define um alerta de mercado vinculado a um cliente. Quando o preço/indicador bate o threshold, ' +
      'a ALIX dispara insight automaticamente (cooldown default 7d). ' +
      'Use quando Christian disser "me avisa quando soja passar de X", "alerta se dólar cair abaixo de Y", etc. ' +
      'SEMPRE valide o clienteId antes (use crm_buscar_cliente).',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'ID do cliente no CRM' },
        tipo: { type: 'string', enum: ['commodity', 'cambio', 'macro'], description: 'commodity=soja/milho/boi/cafe/algodao · cambio=usd/eur/cny · macro=selic/ipca12m/cdi/igpm12m' },
        simbolo: { type: 'string', description: 'soja|milho|boi|cafe|algodao|usd|eur|cny|selic|ipca12m|cdi|igpm12m' },
        operador: { type: 'string', enum: ['>', '<', '>=', '<='] },
        valor: { type: 'number', description: 'Threshold numérico (commodity em R$/saca ou R$/@; cambio em BRL; macro em %)' },
        motivo: { type: 'string', description: 'Por que o alerta importa (ex.: "exposição grande em soja, sensível a queda")' },
        cooldownDias: { type: 'number', description: 'Dias entre disparos do mesmo alerta (default 7)' },
      },
      required: ['clienteId', 'tipo', 'simbolo', 'operador', 'valor'],
    },
  })
  registry['definir_alerta_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      try {
        const svc = getAlertRulesService()
        const rule = await svc.create({
          clienteId: String(input.clienteId).trim(),
          tipo: String(input.tipo) as AlertTipo,
          simbolo: String(input.simbolo),
          operador: String(input.operador) as AlertOperador,
          valor: Number(input.valor),
          motivo: input.motivo ? String(input.motivo) : undefined,
          cooldownDias: input.cooldownDias != null ? Number(input.cooldownDias) : undefined,
        })
        return { ok: true, rule, mensagem: `Alerta criado: ${rule.simbolo} ${rule.operador} ${rule.valor} (cooldown ${rule.cooldownDias}d)` }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  }

  // ── listar_alertas_cliente ──────────────────────────────────
  tools.push({
    name: 'listar_alertas_cliente',
    description: 'Lista todas as regras de alerta de um cliente (ou de TODOS se clienteId omitido).',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'Se omitido, retorna alertas de todos os clientes' },
      },
    },
  })
  registry['listar_alertas_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const svc = getAlertRulesService()
      const rules = input?.clienteId ? svc.list(String(input.clienteId)) : svc.listAll()
      return {
        total: rules.length,
        rules: rules.map(r => ({
          id: r.id,
          clienteId: r.clienteId,
          tipo: r.tipo,
          simbolo: r.simbolo,
          regra: `${r.simbolo} ${r.operador} ${r.valor}`,
          motivo: r.motivo,
          ativo: r.ativo,
          cooldownDias: r.cooldownDias,
          ultimoDisparo: r.ultimoDisparo,
          criadoEm: r.criadoEm,
        })),
      }
    },
  }

  // ── remover_alerta ──────────────────────────────────────────
  tools.push({
    name: 'remover_alerta',
    description: 'Remove uma regra de alerta pelo ruleId (formato rule_…).',
    input_schema: {
      type: 'object',
      properties: {
        ruleId: { type: 'string' },
      },
      required: ['ruleId'],
    },
  })
  registry['remover_alerta'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const svc = getAlertRulesService()
      const ok = await svc.delete(String(input.ruleId).trim())
      return { ok, mensagem: ok ? 'Regra removida.' : 'Regra não encontrada.' }
    },
  }

  return { tools, registry }
}

// ============================================================
// Alix Insano F4 — Tools HITL do CRMWriter
// Cada tool chama o handler do AlixService que cria pending
// confirmation e retorna confirmationId para o LLM surfacear.
// ============================================================

import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';

export interface CrmWriterHandlers {
  handle_criar_cliente: (i: Record<string, unknown>) => unknown;
  handle_promover_lead_para_cliente: (i: Record<string, unknown>) => unknown;
  handle_criar_proposta_inteligente: (i: Record<string, unknown>) => unknown;
  handle_atualizar_proposta: (i: Record<string, unknown>) => unknown;
}

export function buildCrmWriterTools(h: CrmWriterHandlers): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = [
    {
      name: 'criar_cliente',
      description: 'Cria novo cliente no CRM. ALTO IMPACTO — cria pending confirmation que requer aprovação humana antes de persistir.',
      input_schema: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          tipoPessoa: { type: 'string', enum: ['PF', 'PJ'] },
          cpfCnpj: { type: 'string', description: 'Só dígitos' },
          uf: { type: 'string' },
          email: { type: 'string' },
          telefone: { type: 'string' },
          dividaTotal: { type: 'number' },
          origem: { type: 'string' },
        },
        required: ['nome', 'cpfCnpj'],
      },
    },
    {
      name: 'promover_lead_para_cliente',
      description: 'Promove lead da Prospecção para cliente, reaproveitando enriquecimento. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: { cpfCnpj: { type: 'string' } },
        required: ['cpfCnpj'],
      },
    },
    {
      name: 'criar_proposta_inteligente',
      description: 'Cria proposta inteligente (15 seções) para cliente existente. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          dividaTotal: { type: 'number' },
          estrategia: { type: 'string' },
          bancos: { type: 'array', items: { type: 'string' } },
          observacao: { type: 'string' },
        },
        required: ['clienteId', 'dividaTotal'],
      },
    },
    {
      name: 'atualizar_proposta',
      description: 'Atualiza campos de proposta existente. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          estrategia: { type: 'string' },
          dividaTotal: { type: 'number' },
          observacao: { type: 'string' },
          status: { type: 'string' },
          valor: { type: 'number' },
          prazoMeses: { type: 'number' },
          taxaNominal: { type: 'number' },
        },
        required: ['id'],
      },
    },
  ];

  const registry: ClaudeToolRegistry = {
    criar_cliente: { spec: tools[0], handler: async (i) => h.handle_criar_cliente(i) },
    promover_lead_para_cliente: { spec: tools[1], handler: async (i) => h.handle_promover_lead_para_cliente(i) },
    criar_proposta_inteligente: { spec: tools[2], handler: async (i) => h.handle_criar_proposta_inteligente(i) },
    atualizar_proposta: { spec: tools[3], handler: async (i) => h.handle_atualizar_proposta(i) },
  };

  return { tools, registry };
}

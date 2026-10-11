// ============================================================
// Alix Insano F5 — Tools de geração de documentos (DocGenerator)
// Reaproveita os geradores reais do Wave 9 (tool_gerar_*) expostos
// via AlixService. Agente apenas orquestra chamada → retorna URL.
// ============================================================

import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js';

export interface DocGeneratorHandlers {
  tool_gerar_proposta_reestruturacao: (i: Record<string, unknown>) => unknown;
  tool_gerar_parecer_tecnico: (i: Record<string, unknown>) => unknown;
  tool_gerar_relatorio_bsc: (i: Record<string, unknown>) => unknown;
  tool_gerar_fluxo_caixa_xlsx: (i: Record<string, unknown>) => unknown;
  tool_gerar_memoria_calculo_docx: (i: Record<string, unknown>) => unknown;
  tool_gerar_plano_custeio_pdf: (i: Record<string, unknown>) => unknown;
}

export function buildDocGeneratorTools(h: DocGeneratorHandlers): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = [
    {
      name: 'gerar_proposta_reestruturacao',
      description: 'Gera PDF REAL de proposta de reestruturação de dívida (layout ALETIS, cronograma Price com carência). Retorna downloadUrl.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          clienteNome: { type: 'string' },
          credorNome: { type: 'string' },
          dividaAtualBRL: { type: 'number' },
          parcelasMeses: { type: 'number' },
          taxaMensalPct: { type: 'number', description: 'Taxa mensal em % (ex: 0.85)' },
          carenciaMeses: { type: 'number' },
          observacoes: { type: 'string' },
          consultor: { type: 'string' },
        },
        required: ['clienteId', 'clienteNome', 'credorNome', 'dividaAtualBRL', 'parcelasMeses', 'taxaMensalPct', 'carenciaMeses'],
      },
    },
    {
      name: 'gerar_parecer_tecnico',
      description: 'Gera PDF REAL de parecer técnico (diagnóstico + viabilidade + recomendação + anexos).',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          clienteNome: { type: 'string' },
          assunto: { type: 'string' },
          diagnostico: { type: 'string' },
          viabilidade: { type: 'string' },
          recomendacao: { type: 'string' },
          anexos: { type: 'array', items: { type: 'string' } },
          consultor: { type: 'string' },
        },
        required: ['clienteId', 'clienteNome', 'assunto', 'diagnostico', 'viabilidade', 'recomendacao'],
      },
    },
    {
      name: 'gerar_relatorio_bsc',
      description: 'Gera PDF REAL de relatório BSC Kaplan-Norton (4 perspectivas com KPIs e semáforo).',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          clienteNome: { type: 'string' },
          periodo: { type: 'string' },
          perspectivas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string', enum: ['Financeira', 'Cliente', 'Processos', 'Aprendizado'] },
                resumo: { type: 'string' },
                kpis: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      nome: { type: 'string' },
                      valorAtual: { type: ['string', 'number'] },
                      meta: { type: ['string', 'number'] },
                      unidade: { type: 'string' },
                      status: { type: 'string', enum: ['verde', 'amarelo', 'vermelho'] },
                    },
                    required: ['nome', 'valorAtual', 'meta', 'status'],
                  },
                },
              },
              required: ['nome', 'kpis'],
            },
          },
          observacoes: { type: 'string' },
          consultor: { type: 'string' },
        },
        required: ['clienteId', 'clienteNome', 'periodo', 'perspectivas'],
      },
    },
    {
      name: 'gerar_fluxo_caixa_xlsx',
      description: 'Gera XLSX REAL de fluxo de caixa 12 meses (receita, custo, parcela crédito, saldo, saldo acumulado).',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          clienteNome: { type: 'string' },
          periodoReferencia: { type: 'string' },
          meses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                mes: { type: 'string' },
                receitaProducao: { type: 'number' },
                custoOperacional: { type: 'number' },
                parcelaCredito: { type: 'number' },
              },
              required: ['mes', 'receitaProducao', 'custoOperacional', 'parcelaCredito'],
            },
          },
          observacoes: { type: 'string' },
        },
        required: ['clienteId', 'clienteNome', 'periodoReferencia', 'meses'],
      },
    },
    {
      name: 'gerar_memoria_calculo_docx',
      description: 'Gera DOCX REAL (Word editável) de memória de cálculo com premissas, itens e conclusão.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          clienteNome: { type: 'string' },
          titulo: { type: 'string' },
          premissas: { type: 'array', items: { type: 'string' } },
          itens: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titulo: { type: 'string' },
                descricao: { type: 'string' },
                formula: { type: 'string' },
                resultado: { type: 'string' },
              },
              required: ['titulo', 'descricao'],
            },
          },
          conclusao: { type: 'string' },
          consultor: { type: 'string' },
        },
        required: ['clienteId', 'clienteNome', 'titulo', 'premissas', 'itens', 'conclusao'],
      },
    },
    {
      name: 'gerar_plano_custeio_pdf',
      description: 'Gera PDF REAL de plano de custeio agrícola para um plano já criado no sistema.',
      input_schema: {
        type: 'object',
        properties: {
          planoId: { type: 'string' },
        },
        required: ['planoId'],
      },
    },
  ];

  const registry: LLMToolRegistry = {
    gerar_proposta_reestruturacao: { spec: tools[0], handler: async (i) => h.tool_gerar_proposta_reestruturacao(i) },
    gerar_parecer_tecnico: { spec: tools[1], handler: async (i) => h.tool_gerar_parecer_tecnico(i) },
    gerar_relatorio_bsc: { spec: tools[2], handler: async (i) => h.tool_gerar_relatorio_bsc(i) },
    gerar_fluxo_caixa_xlsx: { spec: tools[3], handler: async (i) => h.tool_gerar_fluxo_caixa_xlsx(i) },
    gerar_memoria_calculo_docx: { spec: tools[4], handler: async (i) => h.tool_gerar_memoria_calculo_docx(i) },
    gerar_plano_custeio_pdf: { spec: tools[5], handler: async (i) => h.tool_gerar_plano_custeio_pdf(i) },
  };

  return { tools, registry };
}

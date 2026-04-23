// ============================================================
// DocGeneratorAgent — geração de artefatos reais (F5)
// Reaproveita os geradores Wave 9 via AlixService.getDocGeneratorHandlers()
// ============================================================

import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import { buildDocGeneratorTools } from '../docs/generator-tools.js';
import type { AlixService } from '../../AlixService.js';

export class DocGeneratorAgent extends BaseAgent {
  name = 'DocGenerator';
  model = process.env.ALIX_DOC_GENERATOR_MODEL || 'claude-sonnet-4-6';
  maxTokens = 6000;
  maxIterations = 8;

  constructor(private alix: AlixService) {
    super();
  }

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o DocGenerator da ALETIS — sub-agente do Alix.

Missão: receber input estruturado e gerar o artefato apropriado (PDF/DOCX/XLSX).

Tools disponíveis:
- gerar_proposta_reestruturacao: PDF de proposta Price com carência
- gerar_parecer_tecnico: PDF parecer (diagnóstico + viabilidade + recomendação)
- gerar_relatorio_bsc: PDF BSC Kaplan-Norton (4 perspectivas)
- gerar_fluxo_caixa_xlsx: XLSX fluxo 12 meses
- gerar_memoria_calculo_docx: DOCX Word editável
- gerar_plano_custeio_pdf: PDF plano de custeio (formato Sicredi)

Regras:
1. Valide que payload tem campos obrigatórios antes de chamar.
2. Se faltar dado, retorne ao orquestrador pedindo o que falta — não invente.
3. Retorne downloadUrl do artefato gerado.
4. Escolha a tool correta baseado no "tipo" informado.

Contexto:
- sessionId: ${ctx.sessionId}
${ctx.clienteId ? `- clienteId: ${ctx.clienteId}` : ''}`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    return buildDocGeneratorTools(this.alix.getDocGeneratorHandlers());
  }
}

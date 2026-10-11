import { test } from 'vitest';
import assert from 'node:assert';
import { WebResearcherAgent } from '../../src/services/alix/agents/WebResearcherAgent.ts';
import { DealAnalyzerAgent } from '../../src/services/alix/agents/DealAnalyzerAgent.ts';
import { CRMWriterAgent } from '../../src/services/alix/agents/CRMWriterAgent.ts';
import { DocGeneratorAgent } from '../../src/services/alix/agents/DocGeneratorAgent.ts';

const ctxBase = { sessionId: 's', orchestratorHistory: [], parentToolCalls: [], hitl: true };

test('WebResearcherAgent metadata', () => {
  const a = new WebResearcherAgent();
  assert.strictEqual(a.name, 'WebResearcher');
  assert.strictEqual(a.model, 'gpt-5.6-terra');
});

test('WebResearcherAgent.buildTools inclui fetch_url e consultar_cnpj_detalhado', () => {
  const a = new WebResearcherAgent();
  const { tools } = a.buildTools(ctxBase);
  const names = tools.map(t => t.name);
  assert.ok(names.includes('fetch_url'));
  assert.ok(names.includes('consultar_cnpj_detalhado'));
});

test('DealAnalyzerAgent default sem thinking', () => {
  const a = new DealAnalyzerAgent();
  assert.strictEqual(a.thinking, undefined);
});

test('DealAnalyzerAgent com thinkingSupported=true', () => {
  const a = new DealAnalyzerAgent({ thinkingSupported: true });
  assert.strictEqual(a.thinking?.type, 'enabled');
});

test('DealAnalyzerAgent usa modelo analítico padrão', () => {
  delete process.env.ALIX_DEAL_ANALYZER_MODEL;
  const a = new DealAnalyzerAgent();
  assert.strictEqual(a.model, 'gpt-5.6-sol');
});

test('DealAnalyzerAgent.buildTools inclui tools de prospecção', () => {
  const a = new DealAnalyzerAgent();
  const { tools } = a.buildTools(ctxBase);
  const names = tools.map(t => t.name);
  assert.ok(names.includes('buscar_lead'));
  assert.ok(names.includes('listar_leads_filtrados'));
});

test('CRMWriterAgent tem tools HITL + leitura CRM para evitar duplicidade', () => {
  const fakeAlix = {
    handle_criar_cliente: () => ({}),
    handle_promover_lead_para_cliente: () => ({}),
    handle_criar_proposta_inteligente: () => ({}),
    handle_atualizar_proposta: () => ({}),
    handle_atualizar_dossie_dividas: () => ({}),
    handle_anexar_documento_cliente: () => ({}),
    handle_definir_proxima_acao_cliente: () => ({}),
    handle_registrar_contato_cliente: () => ({}),
    handle_alterar_estagio_cliente: () => ({}),
    handle_onboarding_cliente_completo: () => ({}),
    handle_atualizar_cliente_completo: () => ({}),
    handle_criar_demanda_cliente: () => ({}),
    handle_atualizar_demanda_cliente: () => ({}),
    handle_registrar_atividade_demanda: () => ({}),
    handle_gerenciar_checklist_demanda: () => ({}),
  };
  const a = new CRMWriterAgent(fakeAlix as any);
  const { tools } = a.buildTools(ctxBase);
  assert.strictEqual(tools.length, 21);
  const names = tools.map(t => t.name).sort();
  assert.deepStrictEqual(names, [
    'alterar_estagio_cliente',
    'anexar_documento_cliente',
    'atualizar_cliente_completo',
    'atualizar_demanda_cliente',
    'atualizar_dossie_dividas',
    'atualizar_proposta',
    'buscar_cliente',
    'criar_cliente',
    'criar_demanda_cliente',
    'criar_proposta_inteligente',
    'definir_proxima_acao_cliente',
    'gerenciar_checklist_demanda',
    'listar_clientes',
    'listar_demandas_cliente',
    'listar_propostas_cliente',
    'onboarding_cliente_completo',
    'promover_lead_para_cliente',
    'registrar_atividade_demanda',
    'registrar_contato_cliente',
    'resumo_portfolio_crm',
    'ver_documento_anexado',
  ]);
});

test('DocGeneratorAgent combina geradores reais com leitura de contexto CRM', () => {
  const fakeAlix = {
    getDocGeneratorHandlers: () => ({
      tool_gerar_proposta_reestruturacao: () => ({}),
      tool_gerar_parecer_tecnico: () => ({}),
      tool_gerar_relatorio_bsc: () => ({}),
      tool_gerar_fluxo_caixa_xlsx: () => ({}),
      tool_gerar_memoria_calculo_docx: () => ({}),
      tool_gerar_plano_custeio_pdf: () => ({}),
    }),
  };
  const a = new DocGeneratorAgent(fakeAlix as any);
  assert.strictEqual(a.name, 'DocGenerator');
  const { tools } = a.buildTools(ctxBase);
  assert.ok(tools.length > 6);
  const names = tools.map(t => t.name).sort();
  for (const name of [
    'buscar_cliente',
    'contexto_cliente_operacional',
    'gerar_fluxo_caixa_xlsx',
    'gerar_memoria_calculo_docx',
    'gerar_parecer_tecnico',
    'gerar_plano_custeio_pdf',
    'gerar_proposta_reestruturacao',
    'gerar_relatorio_bsc',
    'ver_documento_anexado',
  ]) assert.ok(names.includes(name), `${name} deve estar disponível`);
});

test('tool documental do subagente recusa ID fora dos anexos delegados', async () => {
  const fakeAlix = { getDocGeneratorHandlers: () => ({}) };
  const agent = new DocGeneratorAgent(fakeAlix as any);
  const { registry } = agent.buildTools({ ...ctxBase, documentIds: ['doc-autorizado'] });
  const result = await registry.ver_documento_anexado.handler({ documentoId: 'doc-fora-do-turno' }) as any;

  assert.strictEqual(result.ok, false);
  assert.match(result.error, /não pertence aos anexos/i);
});

import { test } from 'node:test';
import assert from 'node:assert';
import { WebResearcherAgent } from '../../src/services/alix/agents/WebResearcherAgent.ts';
import { DealAnalyzerAgent } from '../../src/services/alix/agents/DealAnalyzerAgent.ts';
import { CRMWriterAgent } from '../../src/services/alix/agents/CRMWriterAgent.ts';
import { DocGeneratorAgent } from '../../src/services/alix/agents/DocGeneratorAgent.ts';

const ctxBase = { sessionId: 's', orchestratorHistory: [], parentToolCalls: [], hitl: true };

test('WebResearcherAgent metadata', () => {
  const a = new WebResearcherAgent();
  assert.strictEqual(a.name, 'WebResearcher');
  assert.strictEqual(a.model, 'claude-sonnet-4-6');
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

test('DealAnalyzerAgent usa Opus 4.7 por padrão', () => {
  delete process.env.ALIX_DEAL_ANALYZER_MODEL;
  const a = new DealAnalyzerAgent();
  assert.strictEqual(a.model, 'claude-opus-4-7');
});

test('DealAnalyzerAgent.buildTools inclui tools de prospecção', () => {
  const a = new DealAnalyzerAgent();
  const { tools } = a.buildTools(ctxBase);
  const names = tools.map(t => t.name);
  assert.ok(names.includes('buscar_lead'));
  assert.ok(names.includes('listar_leads_filtrados'));
});

test('CRMWriterAgent F4+F5 tem 6 tools HITL', () => {
  const fakeAlix = {
    handle_criar_cliente: () => ({}),
    handle_promover_lead_para_cliente: () => ({}),
    handle_criar_proposta_inteligente: () => ({}),
    handle_atualizar_proposta: () => ({}),
    handle_atualizar_dossie_dividas: () => ({}),
    handle_anexar_documento_cliente: () => ({}),
  };
  const a = new CRMWriterAgent(fakeAlix as any);
  const { tools } = a.buildTools(ctxBase);
  assert.strictEqual(tools.length, 6);
  const names = tools.map(t => t.name).sort();
  assert.deepStrictEqual(names, [
    'anexar_documento_cliente',
    'atualizar_dossie_dividas',
    'atualizar_proposta',
    'criar_cliente',
    'criar_proposta_inteligente',
    'promover_lead_para_cliente',
  ]);
});

test('DocGeneratorAgent F5 tem 6 tools reais (gerar_proposta, parecer, bsc, fluxo, memoria, custeio_pdf)', () => {
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
  assert.strictEqual(tools.length, 6);
  const names = tools.map(t => t.name).sort();
  assert.deepStrictEqual(names, [
    'gerar_fluxo_caixa_xlsx',
    'gerar_memoria_calculo_docx',
    'gerar_parecer_tecnico',
    'gerar_plano_custeio_pdf',
    'gerar_proposta_reestruturacao',
    'gerar_relatorio_bsc',
  ]);
});

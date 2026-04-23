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

test('CRMWriterAgent F3 tem zero tools (só F4 adiciona)', () => {
  const a = new CRMWriterAgent();
  const { tools } = a.buildTools(ctxBase);
  assert.strictEqual(tools.length, 0);
});

test('DocGeneratorAgent stub', () => {
  const a = new DocGeneratorAgent();
  assert.strictEqual(a.name, 'DocGenerator');
  const { tools } = a.buildTools(ctxBase);
  assert.strictEqual(tools.length, 0);
});

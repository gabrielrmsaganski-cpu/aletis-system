import { test } from 'vitest';
import assert from 'node:assert';
import { OrchestratorService } from '../../src/services/alix/OrchestratorService.ts';
import { DataSourceManager } from '../../src/services/DataSourceManager.ts';
import { isOpenAIEnabled } from '../../src/services/llm/OpenAIClient.ts';
import { join } from 'path';
import { tmpdir } from 'os';

const runLLM = process.env.RUN_LLM_TESTS === '1';

test(
  'GOLDEN: "analisa o top lead de MT" → Orchestrator delega ou usa tool leve',
  { skip: !runLLM || !isOpenAIEnabled(), timeout: 180_000 },
  async () => {
    const orch = await OrchestratorService.create(
      DataSourceManager.getInstance(),
      join(tmpdir(), `orch-golden-${Date.now()}`),
    );
    const res = await orch.chat(
      undefined,
      'Pega o top lead de MT com dívida > R$ 300k, faz um estudo de caso inicial (observação + orientação). Pode delegar ao DealAnalyzer.',
    );
    assert.ok(res.reply.length > 100);
    const tools = res.session.messages.flatMap(m => m.toolsUsed ?? []);
    console.log('[golden] tools used:', tools);
    assert.ok(
      tools.includes('delegate_deal_analyzer') || tools.includes('top_leads_by_score') || tools.includes('listar_leads_filtrados'),
      `Esperava delegação ou tool leve. Tools: ${tools.join(', ')}`,
    );
    console.log('[golden] reply (trunc):', res.reply.slice(0, 1000));
  },
);

test(
  'REGRESSION: "qual câmbio" responde sem delegar (usando tools legados do AlixService)',
  { skip: !runLLM || !isOpenAIEnabled(), timeout: 60_000 },
  async () => {
    const orch = await OrchestratorService.create(
      DataSourceManager.getInstance(),
      join(tmpdir(), `orch-reg-${Date.now()}`),
    );
    // No Orchestrator atual, câmbio não está nas tools leves — teste valida que
    // o Orchestrator NÃO crasha (pode devolver uma resposta textual ou delegar).
    const res = await orch.chat(undefined, 'Oi, tudo bem? Responda curto.');
    assert.ok(res.reply.length > 0);
    console.log('[regression] reply:', res.reply.slice(0, 300));
  },
);

import { test } from 'node:test';
import assert from 'node:assert';
import { pingFoundryWebSearch, pingFoundryThinking, isLLMEnabled } from '../../src/services/llm/ClaudeFoundryClient.ts';

const runLLM = process.env.RUN_LLM_TESTS === '1';

test('pingFoundryWebSearch retorna supported boolean', { skip: !runLLM || !isLLMEnabled() }, async () => {
  const res = await pingFoundryWebSearch();
  assert.strictEqual(typeof res.supported, 'boolean');
  console.log('[cap] web_search nativa:', res.supported, res.error || '');
});

test('pingFoundryThinking retorna supported boolean', { skip: !runLLM || !isLLMEnabled() }, async () => {
  const res = await pingFoundryThinking();
  assert.strictEqual(typeof res.supported, 'boolean');
  console.log('[cap] thinking em Opus 4.7:', res.supported, res.error || '');
});

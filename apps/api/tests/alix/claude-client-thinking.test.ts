import { test } from 'node:test';
import assert from 'node:assert';
import type { ClaudeRunOpts } from '../../src/services/llm/ClaudeFoundryClient.ts';

test('ClaudeRunOpts aceita campo thinking', () => {
  const opts: ClaudeRunOpts = {
    thinking: { type: 'enabled', budget_tokens: 8000 },
  };
  assert.strictEqual(opts.thinking?.type, 'enabled');
  assert.strictEqual(opts.thinking?.budget_tokens, 8000);
});

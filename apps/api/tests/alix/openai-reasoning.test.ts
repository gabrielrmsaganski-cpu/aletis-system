import { test } from 'vitest'
import assert from 'node:assert'
import type { LLMRunOpts } from '../../src/services/llm/OpenAIClient.ts'

test('LLMRunOpts aceita reasoning nativo da Responses API', () => {
  const opts: LLMRunOpts = { reasoning: { effort: 'high', summary: 'auto' } }
  assert.strictEqual(opts.reasoning?.effort, 'high')
  assert.strictEqual(opts.reasoning?.summary, 'auto')
})

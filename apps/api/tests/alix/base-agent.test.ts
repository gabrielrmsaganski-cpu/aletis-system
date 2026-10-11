import { test } from 'vitest';
import assert from 'node:assert';
import { BaseAgent } from '../../src/services/alix/agents/BaseAgent.ts';
import { DelegationLoopError } from '../../src/services/alix/agents/types.ts';

test('BaseAgent.guardDepth bloqueia aninhamento >= 3', () => {
  assert.throws(
    () => BaseAgent.guardDepth(['A', 'B', 'C']),
    (err: unknown) => err instanceof DelegationLoopError,
  );
});

test('BaseAgent.guardDepth permite até 2', () => {
  BaseAgent.guardDepth(['A', 'B']); // sem erro
  assert.ok(true);
});

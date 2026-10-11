import { test } from 'vitest';
import assert from 'node:assert';
import { AlixConfirmationStore } from '../../src/services/alix/AlixConfirmationStore.ts';

test('golden: HITL batch aplica em ordem, respeita dependências e registra resultado por item', async () => {
  const store = new AlixConfirmationStore();
  const batch = store.createBatch('sess-hitl', 'Criar cliente e proposta', [
    { toolName: 'criar_cliente', description: 'Criar cliente João', payload: { nome: 'João' } },
    {
      toolName: 'criar_proposta_inteligente',
      description: 'Criar proposta João',
      payload: { valor: 100000 },
      dependsOn: 0,
    },
  ]);

  assert.strictEqual(batch.pendings.length, 2);
  assert.deepStrictEqual(batch.pendings[1].dependsOn, [batch.pendings[0].id]);

  const executionOrder: string[] = [];
  const result = await store.applyBatch(batch.batchId, async (pending) => {
    executionOrder.push(pending.toolName);
    return { ok: true, tool: pending.toolName };
  });

  assert.deepStrictEqual(executionOrder, ['criar_cliente', 'criar_proposta_inteligente']);
  assert.strictEqual(result.applied.length, 2);
  assert.strictEqual(result.failed.length, 0);
  assert.strictEqual(result.skipped.length, 0);
  assert.strictEqual(store.getBatch(batch.batchId)?.status, 'all_applied');
  assert.strictEqual(store.get(batch.pendings[0].id), null);
});

import { test } from 'vitest';
import assert from 'node:assert';
import { AlixConfirmationStore } from '../../src/services/alix/AlixConfirmationStore.ts';

test('createBatch agrupa pendings com dependsOn', () => {
  const store = new AlixConfirmationStore();
  const batch = store.createBatch('sess1', 'Onboarding', [
    { toolName: 'criar_cliente', description: 'Cria cliente', payload: { nome: 'X' } },
    { toolName: 'criar_proposta', description: 'Cria proposta', payload: {}, dependsOn: 0 },
  ]);
  assert.strictEqual(batch.pendings.length, 2);
  assert.strictEqual(batch.pendings[1].dependsOn?.[0], batch.pendings[0].id);
  assert.strictEqual(batch.status, 'pending');
});

test('topological apply: ordem correta + skip em falha', async () => {
  const store = new AlixConfirmationStore();
  const batch = store.createBatch('sess1', 'Test', [
    { toolName: 'a', description: 'A', payload: {} },
    { toolName: 'b', description: 'B', payload: {}, dependsOn: 0 },
    { toolName: 'c', description: 'C', payload: {}, dependsOn: 1 },
  ]);
  const order: string[] = [];
  const results = await store.applyBatch(batch.batchId, async (p) => {
    order.push(p.toolName);
    if (p.toolName === 'b') throw new Error('fail B');
    return { ok: true };
  });
  assert.deepStrictEqual(order, ['a', 'b']);
  assert.strictEqual(results.applied.length, 1);
  assert.strictEqual(results.failed.length, 1);
  assert.strictEqual(results.skipped.length, 1);
  assert.strictEqual(results.skipped[0].toolName, 'c');
});

test('event bus emite batch:created/progress/done', async () => {
  const store = new AlixConfirmationStore();
  const events: string[] = [];
  store.on((ev) => events.push(ev.type));
  const batch = store.createBatch('s', 'x', [{ toolName: 'a', description: 'A', payload: {} }]);
  await store.applyBatch(batch.batchId, async () => ({ ok: true }));
  assert.ok(events.includes('batch:created'));
  assert.ok(events.includes('batch:progress'));
  assert.ok(events.includes('batch:done'));
});

test('cancelBatch retira pendings do store', () => {
  const store = new AlixConfirmationStore();
  const batch = store.createBatch('s', 't', [
    { toolName: 'a', description: 'A', payload: {} },
  ]);
  const id = batch.pendings[0].id;
  assert.ok(store.get(id));
  const cancelled = store.cancelBatch(batch.batchId);
  assert.strictEqual(cancelled?.status, 'cancelled');
  assert.strictEqual(store.get(id), null);
});

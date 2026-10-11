import { test } from 'vitest';
import assert from 'node:assert';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { AlixService } from '../../src/services/AlixService.ts';
import { createExecutorRegistry, getExecutorFromRegistry } from '../../src/services/alix/tools/unified-registry.ts';

test('golden: executores de escrita ficam atrás do registry tipado e HITL', async () => {
  const registry = createExecutorRegistry({
    criar_cliente: {
      meta: {
        owner: 'legacy-alix',
        risk: 'write',
        requiresConfirmation: true,
        tags: ['hitl'],
      },
      handler: async (payload) => ({ ok: true, payload }),
    },
  });

  assert.strictEqual(registry.criar_cliente.meta.requiresConfirmation, true);
  assert.strictEqual(registry.criar_cliente.meta.risk, 'write');
  const executor = getExecutorFromRegistry(registry, 'criar_cliente');
  assert.deepStrictEqual(await executor?.({ nome: 'João' }), { ok: true, payload: { nome: 'João' } });
  assert.strictEqual(getExecutorFromRegistry(registry, 'desconhecida'), null);
});

test('golden: AlixService não expõe executor para tool desconhecida', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alix-tool-safety-'));
  try {
    const svc = new AlixService({} as any, dir);
    assert.strictEqual(typeof svc.getExecutor('criar_cliente'), 'function');
    assert.strictEqual(svc.getExecutor('apagar_tudo_sem_hitl'), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

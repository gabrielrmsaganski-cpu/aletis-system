import { test } from 'vitest';
import assert from 'node:assert';
import { OrchestratorService } from '../../src/services/alix/OrchestratorService.ts';
import { DataSourceManager } from '../../src/services/DataSourceManager.ts';
import { join } from 'path';
import { tmpdir } from 'os';

test('OrchestratorService.create instancia sem LLM', async () => {
  // força LLM disabled para evitar ping real
  process.env.ALIX_USE_LLM = 'false';
  const orch = await OrchestratorService.create(
    DataSourceManager.getInstance(),
    join(tmpdir(), `orch-${Date.now()}`),
  );
  assert.ok(orch);
  assert.ok(typeof orch.model === 'string');
  delete process.env.ALIX_USE_LLM;
});

import { test } from 'vitest';
import assert from 'node:assert';
import { buildFetchUrlTool } from '../../src/services/alix/tools/websearch/fetchUrl.ts';

test('fetch_url tool tem schema exigindo URL', () => {
  const { tools } = buildFetchUrlTool();
  assert.strictEqual(tools[0].name, 'fetch_url');
  assert.ok(((tools[0].input_schema as any).required ?? []).includes('url'));
});

test('fetch_url rejeita url não http(s)', async () => {
  const { registry } = buildFetchUrlTool();
  const r = await registry['fetch_url'].handler({ url: 'file:///etc/passwd' });
  assert.ok((r as any).error);
});

import { test } from 'vitest';
import assert from 'node:assert';
import { buildProspeccaoTools } from '../../src/services/alix/tools/prospeccao.ts';

test('buildProspeccaoTools retorna 6 tools com schemas', () => {
  const { tools } = buildProspeccaoTools();
  const names = tools.map(t => t.name).sort();
  assert.deepStrictEqual(names, [
    'buscar_lead',
    'enriquecer_lead',
    'listar_leads_filtrados',
    'registrar_contato_lead',
    'stats_prospeccao',
    'top_leads_by_score',
  ]);
  for (const t of tools) {
    assert.strictEqual(t.input_schema.type, 'object');
    assert.ok(typeof t.description === 'string' && t.description.length > 10);
  }
});

test('handler buscar_lead retorna erro claro se lead inexistente', async () => {
  const { registry } = buildProspeccaoTools();
  const out = await registry['buscar_lead'].handler({ cpfCnpj: '00000000000' });
  assert.ok(out && typeof out === 'object');
  const parsed = out as { ok?: boolean; error?: string };
  assert.ok(parsed.ok === false || typeof parsed.error === 'string');
});

test('handler listar_leads_filtrados retorna leads + total', async () => {
  const { registry } = buildProspeccaoTools();
  const out = await registry['listar_leads_filtrados'].handler({ limit: 3 }) as any;
  assert.ok(Array.isArray(out.leads));
  assert.strictEqual(typeof out.total, 'number');
});

import { test } from 'node:test';
import assert from 'node:assert';
import { buildCrmWriterTools } from '../../src/services/alix/crm/writer-tools.ts';

test('buildCrmWriterTools retorna 4 tools HITL', () => {
  const { tools } = buildCrmWriterTools({
    handle_criar_cliente: () => ({}),
    handle_promover_lead_para_cliente: () => ({}),
    handle_criar_proposta_inteligente: () => ({}),
    handle_atualizar_proposta: () => ({}),
  });
  const names = tools.map(t => t.name).sort();
  assert.deepStrictEqual(names, [
    'atualizar_proposta',
    'criar_cliente',
    'criar_proposta_inteligente',
    'promover_lead_para_cliente',
  ]);
});

test('handler criar_cliente chama callback com input', async () => {
  let received: Record<string, unknown> | null = null;
  const { registry } = buildCrmWriterTools({
    handle_criar_cliente: (i) => { received = i; return { ok: true }; },
    handle_promover_lead_para_cliente: () => ({}),
    handle_criar_proposta_inteligente: () => ({}),
    handle_atualizar_proposta: () => ({}),
  });
  await registry['criar_cliente'].handler({ nome: 'X', cpfCnpj: '123' });
  assert.deepStrictEqual(received, { nome: 'X', cpfCnpj: '123' });
});

test('todas as 4 tools tem schema com required', () => {
  const { tools } = buildCrmWriterTools({
    handle_criar_cliente: () => ({}),
    handle_promover_lead_para_cliente: () => ({}),
    handle_criar_proposta_inteligente: () => ({}),
    handle_atualizar_proposta: () => ({}),
  });
  for (const t of tools) {
    assert.ok((t.input_schema as any).required?.length > 0, `${t.name} deve ter required`);
  }
});

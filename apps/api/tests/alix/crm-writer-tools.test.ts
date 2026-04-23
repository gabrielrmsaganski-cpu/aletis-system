import { test } from 'node:test';
import assert from 'node:assert';
import { buildCrmWriterTools } from '../../src/services/alix/crm/writer-tools.ts';

const emptyHandlers = {
  handle_criar_cliente: () => ({}),
  handle_promover_lead_para_cliente: () => ({}),
  handle_criar_proposta_inteligente: () => ({}),
  handle_atualizar_proposta: () => ({}),
  handle_atualizar_dossie_dividas: () => ({}),
  handle_anexar_documento_cliente: () => ({}),
};

test('buildCrmWriterTools retorna 6 tools HITL', () => {
  const { tools } = buildCrmWriterTools(emptyHandlers);
  const names = tools.map(t => t.name).sort();
  assert.deepStrictEqual(names, [
    'anexar_documento_cliente',
    'atualizar_dossie_dividas',
    'atualizar_proposta',
    'criar_cliente',
    'criar_proposta_inteligente',
    'promover_lead_para_cliente',
  ]);
});

test('handler criar_cliente chama callback com input', async () => {
  let received: Record<string, unknown> | null = null;
  const { registry } = buildCrmWriterTools({
    ...emptyHandlers,
    handle_criar_cliente: (i) => { received = i; return { ok: true }; },
  });
  await registry['criar_cliente'].handler({ nome: 'X', cpfCnpj: '123' });
  assert.deepStrictEqual(received, { nome: 'X', cpfCnpj: '123' });
});

test('todas as 6 tools tem schema com required', () => {
  const { tools } = buildCrmWriterTools(emptyHandlers);
  for (const t of tools) {
    assert.ok((t.input_schema as any).required?.length > 0, `${t.name} deve ter required`);
  }
});

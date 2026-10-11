import { test } from 'vitest';
import assert from 'node:assert';
import { buildCrmWriterTools } from '../../src/services/alix/crm/writer-tools.ts';

const emptyHandlers = {
  handle_criar_cliente: () => ({}),
  handle_promover_lead_para_cliente: () => ({}),
  handle_criar_proposta_inteligente: () => ({}),
  handle_atualizar_proposta: () => ({}),
  handle_atualizar_dossie_dividas: () => ({}),
  handle_anexar_documento_cliente: () => ({}),
  handle_definir_proxima_acao_cliente: () => ({}),
  handle_registrar_contato_cliente: () => ({}),
  handle_alterar_estagio_cliente: () => ({}),
  handle_onboarding_cliente_completo: () => ({}),
  handle_atualizar_cliente_completo: () => ({}),
  handle_criar_demanda_cliente: () => ({}),
  handle_atualizar_demanda_cliente: () => ({}),
  handle_registrar_atividade_demanda: () => ({}),
  handle_gerenciar_checklist_demanda: () => ({}),
};

test('buildCrmWriterTools retorna 15 tools HITL', () => {
  const { tools } = buildCrmWriterTools(emptyHandlers);
  const names = tools.map(t => t.name).sort();
  assert.deepStrictEqual(names, [
    'alterar_estagio_cliente',
    'anexar_documento_cliente',
    'atualizar_cliente_completo',
    'atualizar_demanda_cliente',
    'atualizar_dossie_dividas',
    'atualizar_proposta',
    'criar_cliente',
    'criar_demanda_cliente',
    'criar_proposta_inteligente',
    'definir_proxima_acao_cliente',
    'gerenciar_checklist_demanda',
    'onboarding_cliente_completo',
    'promover_lead_para_cliente',
    'registrar_atividade_demanda',
    'registrar_contato_cliente',
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

test('todas as 15 tools tem schema com required', () => {
  const { tools } = buildCrmWriterTools(emptyHandlers);
  for (const t of tools) {
    assert.ok((t.input_schema as any).required?.length > 0, `${t.name} deve ter required`);
  }
});

test('onboarding_cliente_completo expõe campos enriquecidos de documento', () => {
  const { tools } = buildCrmWriterTools(emptyHandlers);
  const onboarding = tools.find((t) => t.name === 'onboarding_cliente_completo');
  assert.ok(onboarding);
  const props = (onboarding.input_schema as any).properties;
  for (const key of ['endereco', 'atividade', 'areaTotalHa', 'culturas', 'carCodigoImovel', 'dividas', 'propriedades']) {
    assert.ok(props[key], `schema deve expor ${key}`);
  }
});

test('todas as entradas de criação de cliente exigem escritório humano', () => {
  const { tools } = buildCrmWriterTools(emptyHandlers);
  for (const name of ['criar_cliente', 'promover_lead_para_cliente', 'onboarding_cliente_completo']) {
    const tool = tools.find((item) => item.name === name);
    assert.ok(tool, `${name} deve existir`);
    const schema = tool.input_schema as any;
    assert.ok(schema.required.includes('escritorio'), `${name} deve exigir escritorio`);
    assert.deepStrictEqual(schema.properties.escritorio.enum, ['Aletis', 'Canarana']);
  }
});

test('schemas do CRMWriter declaram items em todos os arrays', () => {
  const { tools } = buildCrmWriterTools(emptyHandlers);
  const visit = (node: any, path: string) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'array') {
      assert.ok(node.items, `${path} deve declarar items`);
      visit(node.items, `${path}.items`);
    }
    for (const [key, value] of Object.entries(node.properties ?? {})) {
      visit(value, `${path}.${key}`);
    }
  };

  for (const tool of tools) {
    visit(tool.input_schema, tool.name);
  }
});

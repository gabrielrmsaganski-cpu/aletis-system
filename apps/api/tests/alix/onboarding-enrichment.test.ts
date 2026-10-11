import { test, vi } from 'vitest';
vi.mock('../../src/services/alix/memory/AlixMemoryService.js', () => ({ getAlixMemoryService: () => ({ appendNota: vi.fn() }) }));
vi.mock('../../src/services/alix/intake/DocumentVaultBridgeService.js', () => ({ attachAlixDocumentToCliente: vi.fn(async () => null) }));
import assert from 'node:assert';
import { join } from 'path';
import { tmpdir } from 'os';
import { DataSourceManager } from '../../src/services/DataSourceManager.ts';
import {
  AlixService,
  registerCrmWriteBackends,
  registerStores,
} from '../../src/services/AlixService.ts';

test('onboarding_cliente_completo preserva dados ricos extraídos do documento', async () => {
  const clientes: any[] = [];
  const propostas: any[] = [];

  registerStores({
    clientes: () => clientes,
    propostas: () => [],
    propostasInteligentes: () => propostas,
  });

  registerCrmWriteBackends({
    setCliente: async (cliente) => {
      clientes.push(cliente);
    },
    setPropostaInteligente: async (proposta) => {
      propostas.push(proposta);
    },
    getCliente: (id) => clientes.find((c) => c.id === id),
    patchCliente: async (id, partial, timelineEvent) => {
      const cliente = clientes.find((c) => c.id === id);
      Object.assign(cliente, partial);
      if (timelineEvent) cliente.timeline.push(timelineEvent);
      return cliente;
    },
    deleteCliente: async (id) => {
      const idx = clientes.findIndex((c) => c.id === id);
      if (idx >= 0) clientes.splice(idx, 1);
    },
  });

  const service = new AlixService(DataSourceManager.getInstance(), join(tmpdir(), `alix-onb-${Date.now()}`));
  const executor = service.getExecutor('onboarding_cliente_completo');
  assert.ok(executor);

  const result = await executor({
    nome: 'João da Silva',
    tipoPessoa: 'PF',
    cpfCnpj: '12345678901',
    dividaTotal: 950000,
    cidade: 'Toledo',
    uf: 'PR',
    escritorio: 'Aletis',
    endereco: {
      logradouro: 'Estrada Rural',
      numero: '100',
      cidade: 'Toledo',
      uf: 'PR',
      cep: '85900000',
    },
    atividade: 'Produtor rural - grãos',
    areaTotalHa: 320,
    culturas: ['soja', 'milho'],
    carCodigoImovel: 'PR-4127700-ABCDE',
    dividas: [{
      contrato: 'CCR-001',
      numeroContrato: 'CCR-001',
      valorOriginal: 900000,
      valorAtualizado: 950000,
      vencimento: '2028-12-31',
      status: 'ativa',
      credor: 'Sicoob',
      taxaContratadaAa: 13.5,
      garantias: ['hipoteca matricula 123'],
    }],
    propriedades: [{
      nome: 'Fazenda Santa Rita',
      municipio: 'Toledo',
      uf: 'PR',
      areaHa: 320,
      car: 'PR-4127700-ABCDE',
      matricula: '123',
      condicao: 'proprietario',
    }],
    documentoId: 'doc-guard-1',
    sessionId: 'sess-guard-1',
    confiancaDocumento: 0.91,
    evidencias: [
      { field: 'nome', trecho: 'João da Silva', fonte: 'doc', confianca: 0.92 },
      { field: 'cpfCnpj', trecho: 'CPF 12345678901', fonte: 'doc', confianca: 0.92 },
      { field: 'dividaTotal', trecho: 'Saldo total R$ 950.000,00', fonte: 'doc', confianca: 0.9 },
      { field: 'dividas', trecho: 'Contrato CCR-001. Valor original R$ 900.000,00. Saldo atualizado R$ 950.000,00.', fonte: 'doc', confianca: 0.9 },
      { field: 'propriedades', trecho: 'CAR PR-4127700-ABCDE. Matrícula 123. Área 320 ha.', fonte: 'doc', confianca: 0.9 },
    ],
  }) as any;

  assert.strictEqual(result.ok, true);
  assert.strictEqual(clientes.length, 1);
  assert.strictEqual(propostas.length, 1);

  const cliente = clientes[0];
  assert.strictEqual(cliente.valorTotalDivida, '950000.00');
  assert.strictEqual(cliente.dividas[0].valorOriginal, '900000.00');
  assert.strictEqual(cliente.dividas[0].valorAtualizado, '950000.00');
  assert.strictEqual(propostas[0].dividaTotal, '950000.00');
  assert.strictEqual(cliente.atividade, 'Produtor rural - grãos');
  assert.strictEqual(cliente.areaTotalHa, 320);
  assert.deepStrictEqual(cliente.culturas, ['soja', 'milho']);
  assert.strictEqual(cliente.carCodigoImovel, 'PR-4127700-ABCDE');
  assert.strictEqual(cliente.endereco.logradouro, 'Estrada Rural');
  assert.strictEqual(cliente.dividas[0].numeroContrato, 'CCR-001');
  assert.strictEqual(cliente.propriedades[0].car, 'PR-4127700-ABCDE');
  assert.strictEqual(result.guardrail.ok, true);
});

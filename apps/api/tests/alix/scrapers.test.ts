import { test } from 'node:test';
import assert from 'node:assert';
import { buildCnpjTool } from '../../src/services/alix/tools/websearch/scrapers/cnpj.ts';
import { buildCvmTool } from '../../src/services/alix/tools/websearch/scrapers/cvm.ts';
import { buildJusbrasilTool } from '../../src/services/alix/tools/websearch/scrapers/jusbrasil.ts';

test('consultar_cnpj_detalhado rejeita cnpj curto', async () => {
  const { registry } = buildCnpjTool();
  const r = await registry['consultar_cnpj_detalhado'].handler({ cnpj: '123' });
  assert.ok((r as any).error);
});

test('consultar_cvm retorna suggestedQuery', async () => {
  const { registry } = buildCvmTool();
  const r = await registry['consultar_cvm'].handler({ cnpj: '12345678000199' }) as any;
  assert.ok(r.ok);
  assert.ok(r.suggestedQuery.includes('cvm.gov.br'));
});

test('consultar_jusbrasil retorna suggestedQuery', async () => {
  const { registry } = buildJusbrasilTool();
  const r = await registry['consultar_jusbrasil'].handler({ termo: '12345678901' }) as any;
  assert.ok(r.suggestedQuery.includes('jusbrasil.com.br'));
});

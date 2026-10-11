import { test } from 'vitest';
import assert from 'node:assert';
import { dirname, join } from 'node:path';
import { stat, rm } from 'node:fs/promises';
import { DocumentGeneratorService } from '../../src/services/alix/generators/DocumentGeneratorService.ts';

test('golden: geração documental produz artefato persistido e metadados servíveis', async () => {
  const svc = DocumentGeneratorService.getInstance();
  const doc = await svc.generateFluxoCaixaXlsx({
    clienteId: 'golden-cli',
    clienteNome: 'Cliente Golden',
    periodoReferencia: '2026',
    meses: [
      { mes: '2026-01', receitaProducao: 100000, custoOperacional: 40000, parcelaCredito: 12000 },
      { mes: '2026-02', receitaProducao: 110000, custoOperacional: 42000, parcelaCredito: 12000 },
    ],
    observacoes: 'Golden test geração documental.',
  });

  try {
    const file = await stat(doc.path);
    assert.strictEqual(doc.kind, 'xlsx');
    assert.strictEqual(doc.clienteId, 'golden-cli');
    assert.ok(doc.downloadUrl.includes('/api/alix/documents/generated/'));
    assert.ok(file.size > 1000);
    assert.strictEqual(doc.sizeBytes, file.size);
  } finally {
    await rm(doc.path, { force: true });
    await rm(join(dirname(doc.path), '..', '_meta', `${doc.id}.json`), { force: true });
  }
});

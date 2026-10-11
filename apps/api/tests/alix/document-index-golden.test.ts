import { test } from 'vitest';
import assert from 'node:assert';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { DocumentIndexService } from '../../src/services/alix/intake/DocumentIndexService.ts';
import type { IngestedDocument } from '../../src/services/alix/intake/types.ts';

test('golden: índice documental preserva página, OCR, tabela, entidade, fonte e confiança', async () => {
  process.env.ALETIS_PG_ENABLED = '0';
  const dir = await mkdtemp(join(tmpdir(), 'alix-index-golden-'));
  try {
    const svc = new DocumentIndexService(dir);
    const doc: IngestedDocument = {
      id: 'doc-golden',
      sessionId: 'sess-golden',
      clienteId: 'cli-1',
      filename: 'contrato-cpr.pdf',
      mimetype: 'application/pdf',
      sizeBytes: 1234,
      uploadedAt: '2026-05-13T00:00:00.000Z',
      kind: 'pdf',
      extractedText: 'CPR rural com vencimento em 2027 e garantia em soja.',
      pageCount: 2,
      metadata: {
        sha256: 'abc123',
        tablePreviews: [{ sheet: 'Resumo', headers: ['Campo', 'Valor'], rows: [['Valor', '100000']] }],
        entities: [{ tipo: 'valor', valor: 100000, moeda: 'BRL', confianca: 0.88 }],
      },
      chunks: [{
        id: 'chunk-p2',
        ordinal: 0,
        kind: 'ocr',
        text: 'Valor da CPR: R$ 100.000,00. Fonte OCR.',
        source: 'pdf:p2:ocr:tesseract',
        pageStart: 2,
        pageEnd: 2,
        confidence: 0.72,
        evidenceIds: ['ev-p2'],
      }],
      evidences: [{
        id: 'ev-p2',
        kind: 'ocr',
        source: 'pdf:p2:ocr:tesseract',
        page: 2,
        text: 'Valor da CPR: R$ 100.000,00. Fonte OCR.',
        confidence: 0.72,
      }],
    };

    const index = await svc.indexDocument(doc);
    assert.strictEqual(index.documentId, 'doc-golden');
    assert.strictEqual(index.clienteId, 'cli-1');
    assert.ok(index.chunks.some((c) => c.kind === 'ocr' && c.pageStart === 2 && c.confidence === 0.72));
    assert.ok(index.evidences.some((e) => e.kind === 'table' && e.sheet === 'Resumo'));
    assert.ok(index.evidences.some((e) => e.kind === 'entity' && e.entityType === 'valor'));

    const hits = await svc.search({ sessionId: 'sess-golden', clienteId: 'cli-1', query: 'CPR 100000 OCR' });
    assert.ok(hits.length >= 1);
    assert.strictEqual(hits[0].documentId, 'doc-golden');
    assert.strictEqual(hits[0].page, 2);
    assert.strictEqual(hits[0].source, 'pdf:p2:ocr:tesseract');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

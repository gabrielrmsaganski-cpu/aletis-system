// ============================================================
// ALETIS — Smoke test for Alix Document Generators (Wave 9-GENERATE)
// Exercita PDF (proposta), XLSX (fluxo) e DOCX (memória),
// persiste em storage/alix-outputs e testa GET via fastify.inject.
//
// Nota: montamos um Fastify in-process dedicado ao teste em vez
// de usar `buildApp` (que auto-inicia o server.listen(3001)).
// ============================================================

import Fastify, { type FastifyInstance } from 'fastify';

import { documentGeneratorService } from '../src/services/alix/generators/DocumentGeneratorService.js';
import { closeBrowser } from '../src/services/alix/generators/PdfGenerator.js';
import alixGeneratorsRoutes from '../src/routes/alix-generators.js';

interface SmokeResult {
  kind: string;
  filename: string;
  sizeBytes: number;
  downloadUrl: string;
  httpStatus?: number;
  contentType?: string;
}

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: 'warn' } });
  await app.register(alixGeneratorsRoutes);
  await app.ready();
  return app;
}

async function main(): Promise<void> {
  const results: SmokeResult[] = [];
  let app: FastifyInstance | null = null;

  try {
    // 1) Proposta PDF
    const proposta = await documentGeneratorService.generateProposta({
      clienteId: 'smoke-cli-001',
      clienteNome: 'Fazenda Smoke Teste LTDA',
      credorNome: 'Banco Agro Demo S.A.',
      dividaAtualBRL: 1_850_000,
      parcelasMeses: 60,
      taxaMensalPct: 0.95,
      carenciaMeses: 6,
      observacoes:
        'Proposta gerada por smoke test — parâmetros ilustrativos. Acordo sujeito à homologação jurídica.',
      consultor: 'Christian Kohler',
    });
    console.log('[smoke] proposta:', proposta.downloadUrl, proposta.sizeBytes, 'bytes');
    results.push({
      kind: proposta.kind,
      filename: proposta.filename,
      sizeBytes: proposta.sizeBytes,
      downloadUrl: proposta.downloadUrl,
    });

    // 2) Fluxo de Caixa XLSX
    const meses = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
    ].map((m, i) => ({
      mes: `${m}/2026`,
      receitaProducao: 280_000 + i * 5_000,
      custoOperacional: 160_000 + i * 2_500,
      parcelaCredito: 32_000,
    }));
    const fluxo = await documentGeneratorService.generateFluxoCaixaXlsx({
      clienteId: 'smoke-cli-001',
      clienteNome: 'Fazenda Smoke Teste LTDA',
      periodoReferencia: 'Safra 2025/2026',
      meses,
      observacoes: 'Projeção baseada em preços CEPEA de referência e custos Conab.',
    });
    console.log('[smoke] fluxo:', fluxo.downloadUrl, fluxo.sizeBytes, 'bytes');
    results.push({
      kind: fluxo.kind,
      filename: fluxo.filename,
      sizeBytes: fluxo.sizeBytes,
      downloadUrl: fluxo.downloadUrl,
    });

    // 3) Memória de Cálculo DOCX
    const memoria = await documentGeneratorService.generateMemoriaCalculo({
      clienteId: 'smoke-cli-001',
      clienteNome: 'Fazenda Smoke Teste LTDA',
      titulo: 'Memória de Cálculo — Reestruturação Banco Agro Demo',
      premissas: [
        'Saldo devedor atualizado em 22/04/2026.',
        'Índice de correção: IPCA acumulado 12m.',
        'Carência de 6 meses, apenas com incidência de juros.',
        'Sistema de amortização: Tabela Price.',
      ],
      itens: [
        {
          titulo: 'Capitalização na carência',
          descricao:
            'Durante a carência, incidem apenas juros, que são capitalizados ao saldo devedor.',
          formula: 'saldo_{n+1} = saldo_n * (1 + i)',
          resultado: 'Saldo ao final da carência: R$ 1.961.500,00',
        },
        {
          titulo: 'Cálculo da parcela pós-carência',
          descricao: 'Aplicação da fórmula de Price ao saldo pós-carência com 60 parcelas.',
          formula: 'P = S * i*(1+i)^n / ((1+i)^n - 1)',
          resultado: 'Parcela aproximada: R$ 43.720,00',
        },
      ],
      conclusao:
        'Os parâmetros apresentados comprovam a viabilidade da reestruturação dentro da capacidade de pagamento projetada da unidade produtiva.',
    });
    console.log('[smoke] memoria:', memoria.downloadUrl, memoria.sizeBytes, 'bytes');
    results.push({
      kind: memoria.kind,
      filename: memoria.filename,
      sizeBytes: memoria.sizeBytes,
      downloadUrl: memoria.downloadUrl,
    });

    // Sanity: todos > 1KB
    for (const r of results) {
      if (r.sizeBytes < 1024) {
        throw new Error(`Arquivo ${r.filename} muito pequeno (${r.sizeBytes} bytes)`);
      }
    }

    // 4) HTTP download check via fastify.inject
    app = await buildTestApp();
    for (const r of results) {
      const id = r.downloadUrl.split('/').pop()!;
      const res = await app.inject({
        method: 'GET',
        url: `/api/alix/documents/generated/${id}`,
      });
      r.httpStatus = res.statusCode;
      r.contentType = res.headers['content-type'] as string | undefined;
      console.log(
        `[smoke] GET ${r.downloadUrl} → ${res.statusCode} ${r.contentType} (${res.rawPayload.length} bytes)`,
      );
      if (res.statusCode !== 200) {
        throw new Error(`Download falhou: status ${res.statusCode}`);
      }
      const dispo = res.headers['content-disposition'];
      if (!dispo || !String(dispo).startsWith('attachment')) {
        throw new Error('Content-Disposition ausente/inválido');
      }
      const expected =
        r.kind === 'pdf'
          ? 'application/pdf'
          : r.kind === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (!r.contentType || !r.contentType.includes(expected)) {
        throw new Error(`Content-Type errado: got ${r.contentType}, expected ${expected}`);
      }
    }

    console.log('\n[smoke] OK — todos os 3 documentos gerados e servidos.');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    if (app) await app.close();
    await closeBrowser();
  }
}

main().catch((err) => {
  console.error('[smoke] FAIL', err);
  process.exit(1);
});

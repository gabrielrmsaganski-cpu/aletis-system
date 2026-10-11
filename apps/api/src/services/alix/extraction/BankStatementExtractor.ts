// ============================================================
// BankStatementExtractor — Extratos bancários
// ============================================================

import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js';
import { getModelForRole } from '../../llm/LLMConfig.js';
import { DOCUMENT_STRUCTURED_SCHEMAS, hasDocumentEvidence, mapDocumentEvidence } from './DocumentStructuredSchemas.js';
import type { IngestedDocument } from '../intake/types.js';
import { buildDocumentModelContent } from '../intake/DocumentModelInput.js';
import type { DocumentEvidence, ClienteExtractionData } from '@aletis/shared-types';

const PROMPT = `Você é um extrator de extratos bancários da ALETIS.
Extraia dados estruturados. Responda APENAS com JSON válido.

{
  "instituicao": "string",
  "conta": "string",
  "agencia": "string",
  "nomeTitular": "string",
  "cpfCnpjTitular": "string (apenas dígitos)",
  "periodoInicio": "YYYY-MM-DD",
  "periodoFim": "YYYY-MM-DD",
  "saldoInicial": number,
  "saldoFinal": number,
  "mediaMovimentacaoMensal": number,
  "lacunas": ["string"]
}`;

export interface BankStatementResult {
  clienteData: ClienteExtractionData;
  instituicao?: string;
  conta?: string;
  agencia?: string;
  periodoInicio?: string;
  periodoFim?: string;
  saldoInicial?: number;
  saldoFinal?: number;
  mediaMovimentacaoMensal?: number;
  evidencias: DocumentEvidence[];
  lacunas: string[];
  confianca: number;
}

export async function extractBankStatement(doc: IngestedDocument): Promise<BankStatementResult | null> {
  if (!isOpenAIEnabled()) return null;
  const text = doc.extractedText ?? '';
  if (!text.trim() && doc.kind !== 'pdf') return null;

  try {
    const content = await buildDocumentModelContent(doc, text.slice(0, 24_000));
    const result = await generateStructured<Record<string, unknown>>(
      [{ role: 'user', content }],
      {
        name: 'extrato_bancario',
        schema: DOCUMENT_STRUCTURED_SCHEMAS.bankStatement,
        model: getModelForRole('doc_extractor'),
        maxTokens: 1_200,
        system: PROMPT,
        reasoning: { effort: 'low' },
      },
    );
    const p = result.data;

    const candidateCpfCnpj = String(p.cpfCnpjTitular || '').replace(/\D/g, '');
    const evidencias: DocumentEvidence[] = mapDocumentEvidence(p.evidencias, 'extrato', text);
    const cpfCnpj = hasDocumentEvidence(evidencias, ['cpfCnpjTitular', 'cpfCnpj'], candidateCpfCnpj) ? candidateCpfCnpj : '';
    const nomeTitular = String(p.nomeTitular || '');
    const saldoInicial = Number(p.saldoInicial);
    const saldoFinal = Number(p.saldoFinal);
    const media = Number(p.mediaMovimentacaoMensal);

    return {
      clienteData: {
        nome: hasDocumentEvidence(evidencias, 'nomeTitular', nomeTitular) ? nomeTitular : undefined,
        cpfCnpj: cpfCnpj || undefined,
      },
      instituicao: String(p.instituicao || ''),
      conta: String(p.conta || ''),
      agencia: String(p.agencia || ''),
      periodoInicio: String(p.periodoInicio || ''),
      periodoFim: String(p.periodoFim || ''),
      saldoInicial: Number.isFinite(saldoInicial) && hasDocumentEvidence(evidencias, 'saldoInicial', saldoInicial) ? saldoInicial : undefined,
      saldoFinal: Number.isFinite(saldoFinal) && hasDocumentEvidence(evidencias, 'saldoFinal', saldoFinal) ? saldoFinal : undefined,
      mediaMovimentacaoMensal: Number.isFinite(media) && hasDocumentEvidence(evidencias, 'mediaMovimentacaoMensal', media) ? media : undefined,
      evidencias,
      lacunas: Array.isArray(p.lacunas) ? p.lacunas.map(String) : [],
      confianca: evidencias.length ? evidencias.reduce((sum, item) => sum + item.confianca, 0) / evidencias.length : 0.25,
    };
  } catch (err) {
    console.warn('[BankStatementExtractor] falhou:', (err as Error).message);
    return null;
  }
}

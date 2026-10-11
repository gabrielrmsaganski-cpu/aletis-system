// ============================================================
// SpreadsheetExtractor — Planilhas de gestão financeira
// Reusa SpreadsheetProfile existente e faz extração LLM leve
// ============================================================

import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js';
import { getModelForRole } from '../../llm/LLMConfig.js';
import { DOCUMENT_STRUCTURED_SCHEMAS, hasDocumentEvidence, mapDocumentEvidence } from './DocumentStructuredSchemas.js';
import type { IngestedDocument } from '../intake/types.js';
import type { DocumentEvidence, ClienteExtractionData } from '@aletis/shared-types';

const PROMPT = `Você é um extrator de planilhas de gestão financeira rural da ALETIS.
Extraia dados estruturados do contexto da planilha. Responda APENAS com JSON.

{
  "nomeProdutor": "string",
  "cpfCnpj": "string (apenas dígitos)",
  "municipio": "string",
  "uf": "string",
  "areaTotalHa": number,
  "culturasPrincipais": ["string"],
  "receitaBrutaEstimada": number,
  "custoTotalEstimado": number,
  "margemBrutaEstimada": number,
  "dividaTotalDeclarada": number,
  "instituicoesCredoras": ["string"],
  "lacunas": ["string"]
}`;

export interface SpreadsheetResult {
  clienteData: ClienteExtractionData;
  receitaBrutaEstimada?: number;
  custoTotalEstimado?: number;
  margemBrutaEstimada?: number;
  dividaTotalDeclarada?: number;
  instituicoesCredoras: string[];
  evidencias: DocumentEvidence[];
  lacunas: string[];
  confianca: number;
}

export async function extractSpreadsheet(doc: IngestedDocument): Promise<SpreadsheetResult | null> {
  if (!isOpenAIEnabled()) return null;
  const text = doc.extractedText ?? '';
  const profile = doc.metadata.spreadsheetProfile;
  if (!text.trim() && !profile) return null;

  const context = JSON.stringify({
    filename: doc.filename,
    sheets: doc.metadata.sheets,
    tablePreviews: doc.metadata.tablePreviews?.slice(0, 3),
    spreadsheetProfile: profile,
    textoExtraido: text.slice(0, 6000),
  }, null, 2);

  try {
    const result = await generateStructured<Record<string, unknown>>(
      [{ role: 'user', content: context }],
      {
        name: 'planilha_gestao',
        schema: DOCUMENT_STRUCTURED_SCHEMAS.spreadsheet,
        model: getModelForRole('doc_extractor'),
        maxTokens: 1_400,
        system: PROMPT,
        reasoning: { effort: 'low' },
      },
    );
    const p = result.data;

    const candidateCpfCnpj = String(p.cpfCnpj || '').replace(/\D/g, '');
    const candidateArea = Number(p.areaTotalHa) || 0;
    const culturas = Array.isArray(p.culturasPrincipais) ? p.culturasPrincipais.map(String) : [];

    const evidencias: DocumentEvidence[] = mapDocumentEvidence(p.evidencias, 'planilha', text);
    const cpfCnpj = hasDocumentEvidence(evidencias, 'cpfCnpj', candidateCpfCnpj) ? candidateCpfCnpj : '';
    const area = hasDocumentEvidence(evidencias, 'areaTotalHa', candidateArea) ? candidateArea : 0;
    const nomeProdutor = String(p.nomeProdutor || '');
    const groundedNumber = (field: string, value: unknown): number | undefined => {
      const number = Number(value);
      return Number.isFinite(number) && hasDocumentEvidence(evidencias, field, number) ? number : undefined;
    };

    return {
      clienteData: {
        nome: hasDocumentEvidence(evidencias, 'nomeProdutor', nomeProdutor) ? nomeProdutor : undefined,
        cpfCnpj: cpfCnpj || undefined,
        cidade: String(p.municipio || ''),
        uf: String(p.uf || ''),
        areaTotalHa: area > 0 ? area : undefined,
        culturas: culturas.length > 0 ? culturas : undefined,
      },
      receitaBrutaEstimada: groundedNumber('receitaBrutaEstimada', p.receitaBrutaEstimada),
      custoTotalEstimado: groundedNumber('custoTotalEstimado', p.custoTotalEstimado),
      margemBrutaEstimada: groundedNumber('margemBrutaEstimada', p.margemBrutaEstimada),
      dividaTotalDeclarada: groundedNumber('dividaTotalDeclarada', p.dividaTotalDeclarada),
      instituicoesCredoras: Array.isArray(p.instituicoesCredoras) ? p.instituicoesCredoras.map(String) : [],
      evidencias,
      lacunas: Array.isArray(p.lacunas) ? p.lacunas.map(String) : [],
      confianca: evidencias.length ? evidencias.reduce((sum, item) => sum + item.confianca, 0) / evidencias.length : 0.25,
    };
  } catch (err) {
    console.warn('[SpreadsheetExtractor] falhou:', (err as Error).message);
    return null;
  }
}

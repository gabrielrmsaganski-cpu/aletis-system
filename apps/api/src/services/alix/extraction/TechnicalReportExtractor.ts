// ============================================================
// TechnicalReportExtractor — Laudos técnicos / vistorias
// ============================================================

import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js';
import { getModelForRole } from '../../llm/LLMConfig.js';
import { DOCUMENT_STRUCTURED_SCHEMAS, hasDocumentEvidence, mapDocumentEvidence } from './DocumentStructuredSchemas.js';
import type { IngestedDocument } from '../intake/types.js';
import { buildDocumentModelContent } from '../intake/DocumentModelInput.js';
import type { DocumentEvidence, ClienteExtractionData } from '@aletis/shared-types';

const PROMPT = `Você é um extrator de laudos técnicos rurais da ALETIS.
Extraia dados estruturados. Responda APENAS com JSON válido.

{
  "nomeProprietario": "string",
  "cpfCnpj": "string (apenas dígitos)",
  "municipio": "string",
  "uf": "string",
  "areaTotalHa": number,
  "areaAgricultavelHa": number,
  "culturas": ["string"],
  "car": "string",
  "ccir": "string",
  "matricula": "string",
  "valorAvaliacao": number,
  "dataLaudo": "YYYY-MM-DD",
  "engenheiroResponsavel": "string",
  "crea": "string",
  "lacunas": ["string"]
}`;

export interface TechnicalReportResult {
  clienteData: ClienteExtractionData;
  propriedades: NonNullable<ClienteExtractionData['propriedades']>;
  valorAvaliacao?: number;
  dataLaudo?: string;
  engenheiroResponsavel?: string;
  crea?: string;
  evidencias: DocumentEvidence[];
  lacunas: string[];
  confianca: number;
}

export async function extractTechnicalReport(doc: IngestedDocument): Promise<TechnicalReportResult | null> {
  if (!isOpenAIEnabled()) return null;
  const text = doc.extractedText ?? '';
  if (!text.trim() && doc.kind !== 'pdf') return null;

  try {
    const content = await buildDocumentModelContent(doc, text.slice(0, 30_000));
    const result = await generateStructured<Record<string, unknown>>(
      [{ role: 'user', content }],
      {
        name: 'laudo_tecnico',
        schema: DOCUMENT_STRUCTURED_SCHEMAS.technicalReport,
        model: getModelForRole('doc_extractor'),
        maxTokens: 1_500,
        system: PROMPT,
        reasoning: { effort: 'low' },
      },
    );
    const p = result.data;

    const candidateCpfCnpj = String(p.cpfCnpj || '').replace(/\D/g, '');
    const candidateArea = Number(p.areaTotalHa) || Number(p.areaAgricultavelHa) || 0;
    const culturas = Array.isArray(p.culturas) ? p.culturas.map(String) : [];

    const evidencias: DocumentEvidence[] = mapDocumentEvidence(p.evidencias, 'laudo', text);
    const cpfCnpj = hasDocumentEvidence(evidencias, 'cpfCnpj', candidateCpfCnpj) ? candidateCpfCnpj : '';
    const areaTotal = hasDocumentEvidence(evidencias, ['areaTotalHa', 'areaAgricultavelHa'], candidateArea) ? candidateArea : 0;
    const nomeProprietario = String(p.nomeProprietario || '');

    return {
      clienteData: {
        nome: hasDocumentEvidence(evidencias, 'nomeProprietario', nomeProprietario) ? nomeProprietario : undefined,
        cpfCnpj: cpfCnpj || undefined,
        cidade: String(p.municipio || ''),
        uf: String(p.uf || ''),
        areaTotalHa: areaTotal > 0 ? areaTotal : undefined,
        culturas: culturas.length > 0 ? culturas : undefined,
        carCodigoImovel: hasDocumentEvidence(evidencias, 'car', p.car) ? String(p.car || '') : undefined,
      },
      propriedades: [{
        nome: String(p.municipio || 'Propriedade rural'),
        municipio: String(p.municipio || ''),
        uf: String(p.uf || ''),
        areaHa: areaTotal > 0 ? areaTotal : undefined,
        car: hasDocumentEvidence(evidencias, 'car', p.car) ? String(p.car || '') : undefined,
        ccir: hasDocumentEvidence(evidencias, 'ccir', p.ccir) ? String(p.ccir || '') : undefined,
        matricula: hasDocumentEvidence(evidencias, 'matricula', p.matricula) ? String(p.matricula || '') : undefined,
        condicao: 'proprietario',
      }],
      valorAvaliacao: Number.isFinite(Number(p.valorAvaliacao)) && hasDocumentEvidence(evidencias, 'valorAvaliacao', Number(p.valorAvaliacao)) ? Number(p.valorAvaliacao) : undefined,
      dataLaudo: String(p.dataLaudo || ''),
      engenheiroResponsavel: String(p.engenheiroResponsavel || ''),
      crea: String(p.crea || ''),
      evidencias,
      lacunas: Array.isArray(p.lacunas) ? p.lacunas.map(String) : [],
      confianca: evidencias.length ? evidencias.reduce((sum, item) => sum + item.confianca, 0) / evidencias.length : 0.25,
    };
  } catch (err) {
    console.warn('[TechnicalReportExtractor] falhou:', (err as Error).message);
    return null;
  }
}

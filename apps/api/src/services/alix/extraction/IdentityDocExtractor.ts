// ============================================================
// IdentityDocExtractor — Documentos pessoais (CPF, RG, CNH)
// ============================================================

import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js';
import { getModelForRole } from '../../llm/LLMConfig.js';
import {
  DOCUMENT_STRUCTURED_SCHEMAS,
  hasDocumentEvidence,
  literalEvidenceFromMatch,
  mapDocumentEvidence,
} from './DocumentStructuredSchemas.js';
import type { IngestedDocument } from '../intake/types.js';
import { buildDocumentModelContent } from '../intake/DocumentModelInput.js';
import type { DocumentEvidence, ClienteExtractionData } from '@aletis/shared-types';

const PROMPT = `Você é um extrator de documentos pessoais da ALETIS (CPF, RG, CNH).
Extraia dados estruturados. Responda APENAS com JSON válido.

{
  "tipoDocumento": "CPF|RG|CNH|Título de Eleitor|Passaporte",
  "nome": "string",
  "cpf": "string (apenas dígitos)",
  "rg": "string",
  "dataNascimento": "YYYY-MM-DD",
  "nomePai": "string",
  "nomeMae": "string",
  "enderecoCompleto": "string",
  "cidade": "string",
  "uf": "string",
  "cep": "string",
  "lacunas": ["string"]
}`;

export interface IdentityDocResult {
  clienteData: ClienteExtractionData;
  tipoDocumento?: string;
  rg?: string;
  dataNascimento?: string;
  nomePai?: string;
  nomeMae?: string;
  evidencias: DocumentEvidence[];
  lacunas: string[];
  confianca: number;
}

export async function extractIdentityDoc(doc: IngestedDocument): Promise<IdentityDocResult | null> {
  if (!isOpenAIEnabled()) return null;
  const text = doc.extractedText ?? '';
  if (!text.trim() && doc.kind !== 'pdf') return null;

  // Tenta OCR + regex primeiro (CPF tem padrão fixo)
  const cpfRegex = /(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\s]?\d{2})/;
  const cpfMatch = text.match(cpfRegex);
  const cpfOcr = cpfMatch ? cpfMatch[1].replace(/\D/g, '') : '';

  try {
    const content = await buildDocumentModelContent(doc, text.slice(0, 12_000));
    const result = await generateStructured<Record<string, unknown>>(
      [{ role: 'user', content }],
      {
        name: 'documento_identidade',
        schema: DOCUMENT_STRUCTURED_SCHEMAS.identity,
        model: getModelForRole('doc_extractor'),
        maxTokens: 1_200,
        system: PROMPT,
        reasoning: { effort: 'low' },
      },
    );
    const p = result.data;

    const candidateCpf = cpfOcr || String(p.cpf || '').replace(/\D/g, '');
    const evidencias: DocumentEvidence[] = mapDocumentEvidence(p.evidencias, 'documento_pessoal', text);
    const cpfEvidence = literalEvidenceFromMatch(text, cpfMatch, 'cpfCnpj', candidateCpf, 'documento_pessoal', 0.95);
    if (cpfEvidence) evidencias.push(cpfEvidence);
    const cpf = hasDocumentEvidence(evidencias, ['cpf', 'cpfCnpj'], candidateCpf) ? candidateCpf : '';
    const nome = String(p.nome || '');

    return {
      clienteData: {
        nome: hasDocumentEvidence(evidencias, 'nome', nome) ? nome : undefined,
        cpfCnpj: cpf || undefined,
        cidade: String(p.cidade || ''),
        uf: String(p.uf || ''),
        endereco: parseEndereco(String(p.enderecoCompleto || '')),
      },
      tipoDocumento: String(p.tipoDocumento || ''),
      rg: String(p.rg || ''),
      dataNascimento: String(p.dataNascimento || ''),
      nomePai: String(p.nomePai || ''),
      nomeMae: String(p.nomeMae || ''),
      evidencias,
      lacunas: Array.isArray(p.lacunas) ? p.lacunas.map(String) : [],
      confianca: evidencias.length ? evidencias.reduce((sum, item) => sum + item.confianca, 0) / evidencias.length : 0.25,
    };
  } catch (err) {
    console.warn('[IdentityDocExtractor] falhou:', (err as Error).message);
    return null;
  }
}

function parseEndereco(raw: string): ClienteExtractionData['endereco'] {
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim());
  return {
    logradouro: parts[0] || undefined,
    numero: parts[1]?.match(/^\d+/) ? parts[1] : undefined,
    bairro: parts.find((p) => /bairro/i.test(p))?.replace(/bairro[\s:]*/i, '') || undefined,
    cidade: parts.find((p) => /^[A-Za-zÀ-ÿ\s]{3,}$/i.test(p) && p.length > 3 && !/estado|uf/i.test(p)) || undefined,
    uf: parts.find((p) => /^[A-Z]{2}$/i.test(p.trim()))?.toUpperCase() || undefined,
    cep: parts.find((p) => /\d{2}\.?\d{3}-?\d{3}/.test(p))?.replace(/\D/g, '') || undefined,
  };
}

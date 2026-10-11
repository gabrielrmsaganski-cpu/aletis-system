// ============================================================
// ProposalExtractor — Propostas comerciais / de renegociação
// ============================================================

import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js';
import { getModelForRole } from '../../llm/LLMConfig.js';
import { DOCUMENT_STRUCTURED_SCHEMAS, hasDocumentEvidence, mapDocumentEvidence } from './DocumentStructuredSchemas.js';
import type { IngestedDocument } from '../intake/types.js';
import { buildDocumentModelContent } from '../intake/DocumentModelInput.js';
import type { DocumentEvidence, ClienteExtractionData } from '@aletis/shared-types';

const PROMPT = `Você é um extrator de propostas comerciais e de renegociação de dívidas da ALETIS.
Extraia dados estruturados do documento. Responda APENAS com JSON válido.

{
  "nomeCliente": "string",
  "cpfCnpj": "string (apenas dígitos)",
  "cidade": "string",
  "uf": "string",
  "telefone": "string",
  "email": "string",
  "endereco": "string",
  "dividaTotal": number,
  "credor": "string",
  "estrategia": "string (ex: redução 40%, alongamento 120m)",
  "honorarios": number,
  "bancos": ["string"],
  "lacunas": ["string"]
}`;

export interface ProposalExtractionResult {
  clienteData: ClienteExtractionData;
  dividaTotal?: number;
  estrategia?: string;
  honorarios?: number;
  bancos: string[];
  evidencias: DocumentEvidence[];
  lacunas: string[];
  confianca: number;
}

export async function extractProposal(doc: IngestedDocument): Promise<ProposalExtractionResult | null> {
  if (!isOpenAIEnabled()) return null;
  const text = doc.extractedText ?? '';
  if (!text.trim() && doc.kind !== 'pdf') return null;

  try {
    const content = await buildDocumentModelContent(doc, text.slice(0, 50_000));
    const result = await generateStructured<Record<string, unknown>>(
      [{ role: 'user', content }],
      {
        name: 'proposta_comercial',
        schema: DOCUMENT_STRUCTURED_SCHEMAS.proposal,
        model: getModelForRole('doc_extractor'),
        maxTokens: 2_400,
        system: PROMPT,
        reasoning: { effort: 'medium' },
      },
    );
    const p = result.data;

    const candidateCpfCnpj = String(p.cpfCnpj || '').replace(/\D/g, '');
    const candidateDivida = Number(p.dividaTotal);
    const evidencias: DocumentEvidence[] = mapDocumentEvidence(p.evidencias, 'proposta', text);
    const cpfCnpj = hasDocumentEvidence(evidencias, 'cpfCnpj', candidateCpfCnpj) ? candidateCpfCnpj : '';
    const dividaTotal = Number.isFinite(candidateDivida) && hasDocumentEvidence(evidencias, 'dividaTotal', candidateDivida)
      ? candidateDivida
      : undefined;
    const bancos = (Array.isArray(p.bancos) ? p.bancos.map(String) : [])
      .filter((banco) => hasDocumentEvidence(evidencias, ['bancos', 'credor'], banco));
    const nomeCliente = String(p.nomeCliente || '');

    return {
      clienteData: {
        nome: hasDocumentEvidence(evidencias, 'nomeCliente', nomeCliente) ? nomeCliente : undefined,
        cpfCnpj: cpfCnpj || undefined,
        cidade: String(p.cidade || ''),
        uf: String(p.uf || ''),
        telefone: String(p.telefone || ''),
        email: String(p.email || ''),
        endereco: parseEndereco(String(p.endereco || '')),
      },
      dividaTotal: dividaTotal && dividaTotal > 0 ? dividaTotal : undefined,
      estrategia: hasDocumentEvidence(evidencias, 'estrategia', p.estrategia) ? String(p.estrategia || '') : undefined,
      honorarios: Number.isFinite(Number(p.honorarios)) && hasDocumentEvidence(evidencias, 'honorarios', Number(p.honorarios)) ? Number(p.honorarios) : undefined,
      bancos,
      evidencias,
      lacunas: Array.isArray(p.lacunas) ? p.lacunas.map(String) : [],
      confianca: evidencias.length ? evidencias.reduce((sum, item) => sum + item.confianca, 0) / evidencias.length : 0.25,
    };
  } catch (err) {
    console.warn('[ProposalExtractor] falhou:', (err as Error).message);
    return null;
  }
}

function parseEndereco(raw: string): ClienteExtractionData['endereco'] {
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim());
  return {
    logradouro: parts[0] || undefined,
    numero: parts[1]?.match(/^\d+/) ? parts[1] : undefined,
    bairro: parts.find((p) => /bairro|distrito/i.test(p))?.replace(/bairro[\s:]*/i, '') || undefined,
    cidade: parts.find((p) => /^[A-Za-zÀ-ÿ\s]{3,}$/i.test(p) && p.length > 3 && !/estado|uf/i.test(p)) || undefined,
    uf: parts.find((p) => /^[A-Z]{2}$/i.test(p.trim()))?.toUpperCase() || undefined,
    cep: parts.find((p) => /\d{2}\.?\d{3}-?\d{3}/.test(p))?.replace(/\D/g, '') || undefined,
  };
}

// ============================================================
// SmartExtractor — Orquestrador de extração inteligente
// Classifica → extrai → mapeia → retorna DocumentExtractionResult
// ============================================================

import type { IngestedDocument } from '../intake/types.js';
import type { DocumentExtractionResult, ExtractedEntity, DocumentEvidence, DocumentType, ClienteExtractionData } from '@aletis/shared-types';
import { classifyDocument } from './DocumentClassifierV2.js';
import { extractContract } from './ContractExtractor.js';
import { extractProposal } from './ProposalExtractor.js';
import { extractBankStatement } from './BankStatementExtractor.js';
import { extractIdentityDoc } from './IdentityDocExtractor.js';
import { extractTechnicalReport } from './TechnicalReportExtractor.js';
import { extractSpreadsheet } from './SpreadsheetExtractor.js';
import {
  mapContractExtraction,
  mapProposalExtraction,
  mapBankStatementExtraction,
  mapIdentityDocExtraction,
  mapTechnicalReportExtraction,
  mapSpreadsheetExtraction,
  mapGenericEntities,
} from './EntityMapper.js';

function parseBrNumber(raw: string): number | undefined {
  const value = raw.replace(/[^\d,.-]/g, '').trim()
  if (!value) return undefined
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value.replace(/\.(?=\d{3}(?:\D|$))/g, '')
  const number = Number(normalized)
  return Number.isFinite(number) ? number : undefined
}

const BRAZILIAN_UFS = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])

function toIsoDate(raw?: string): string | undefined {
  const match = raw?.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/)
  if (!match) return undefined
  const year = match[3].length === 2 ? `${Number(match[3]) < 50 ? '20' : '19'}${match[3]}` : match[3]
  return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

/** Fallback local: recupera campos explícitos mesmo sem OpenAI/OCR avançado. */
function deterministicExtraction(doc: IngestedDocument, tipo: DocumentType): DocumentExtractionResult | null {
  const text = String(doc.extractedText || '')
  if (!text.trim()) return null
  const evidencias: DocumentEvidence[] = []
  const entidades: ExtractedEntity[] = []
  const add = (field: string, value: unknown, match: RegExpMatchArray | null, confidence = 0.82) => {
    if (value === undefined || value === null || String(value).trim() === '' || !match?.[0]) return
    evidencias.push({ field, value, fonte: `${doc.filename}:texto`, trecho: match[0].trim().slice(0, 500), confianca: confidence })
  }
  const cpfMatch = text.match(/\b(?:CPF|CNPJ)?\s*[:\-]?\s*(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}|\d{2}[.\s]?\d{3}[.\s]?\d{3}\/?\d{4}[-\s]?\d{2})\b/i)
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)
  const phoneMatch = text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/)
  const nameMatch = text.match(/(?:nome(?:\s+completo)?|raz[aã]o\s+social|titular|devedor|produtor)\s*[:\-]\s*([^\n;|]{3,120})/i)
  const cityMatch = text.match(/(?:cidade|munic[ií]pio)\s*[:\-]\s*([^\n;|,]{2,80})/i)
  const ufMatch = text.match(/(?:UF|estado)\s*[:\-]?\s*([A-Z]{2})\b/i)
  const creditorMatch = text.match(/(?:credor|institui[cç][aã]o\s+financeira|banco)\s*[:\-]\s*([^\n;|]{2,100})/i)
  const moneyMatch = text.match(/(?:valor\s+(?:total|da\s+)?d[ií]vida|saldo\s+devedor|d[ií]vida)\s*[:\-]?\s*(?:R\$\s*)?([\d.]+(?:,\d{2})?)/i)
  const areaMatch = text.match(/(?:[aá]rea(?:\s+total)?|hectares?)\s*[:\-]?\s*([\d.,]+)\s*(?:ha|hectares?)?/i)
  const carMatch = text.match(/\bCAR\s*[:\-]?\s*([A-Z]{2}\-?\d{7,30})\b/i)
  const dateMatch = text.match(/(?:vencimento|data)\s*[:\-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i)
  const cpf = cpfMatch?.[1]?.replace(/\D/g, '')
  const phoneDigits = phoneMatch?.[0]?.replace(/\D/g, '')
  const telefone = phoneDigits && (phoneDigits.length === 10 || phoneDigits.length === 11) && phoneDigits !== cpf ? phoneMatch?.[0]?.trim() : undefined
  const nome = nameMatch?.[1]?.replace(/[.,]$/, '').trim()
  const cidade = cityMatch?.[1]?.trim(); const ufCandidate = ufMatch?.[1]?.toUpperCase(); const uf = ufCandidate && BRAZILIAN_UFS.has(ufCandidate) ? ufCandidate : undefined
  const credor = creditorMatch?.[1]?.replace(/[.,]$/, '').trim()
  const valor = moneyMatch?.[1] ? parseBrNumber(moneyMatch[1]) : undefined
  const area = areaMatch?.[1] ? parseBrNumber(areaMatch[1]) : undefined
  add('nome', nome, nameMatch); add('cpfCnpj', cpf, cpfMatch); add('email', emailMatch?.[0], emailMatch); add('telefone', telefone, telefone ? phoneMatch : null)
  add('cidade', cidade, cityMatch); add('uf', uf, ufMatch); add('credor', credor, creditorMatch); add('valorTotalDivida', valor, moneyMatch); add('areaTotalHa', area, areaMatch); add('carCodigoImovel', carMatch?.[1], carMatch)
  if (nome) entidades.push({ tipo: cpf?.length === 14 ? 'empresa' : 'pessoa', categoria: 'devedor', nome, cpfCnpj: cpf, telefone, email: emailMatch?.[0], fonte: nameMatch?.[0] || nome, confianca: 0.86 })
  if (credor) entidades.push({ tipo: 'banco', categoria: 'credor', nome: credor, fonte: creditorMatch?.[0] || credor, confianca: 0.82 })
  if (valor !== undefined) entidades.push({ tipo: 'valor', categoria: 'divida', valor, moeda: 'BRL', fonte: moneyMatch?.[0] || String(valor), confianca: 0.82 })
  if (!evidencias.length) return null
  const clienteData: ClienteExtractionData = { nome, cpfCnpj: cpf, tipoPessoa: cpf?.length === 14 ? 'PJ' : cpf ? 'PF' : undefined, cidade, uf, telefone, email: emailMatch?.[0], areaTotalHa: area, carCodigoImovel: carMatch?.[1] }
  return { documentoId: doc.id, sessionId: doc.sessionId, tipoDocumento: tipo, confianca: 0.78, entidades, clienteData, dividas: valor === undefined ? [] : [{ valorAtualizado: valor, credor, vencimento: toIsoDate(dateMatch?.[1]), status: 'ativa' }], propriedades: area === undefined ? [] : [{ areaHa: area, municipio: cidade, uf, car: carMatch?.[1] }], riscos: [], lacunas: [], acoesSugeridas: [], evidencias }
}

export { type DocumentExtractionResult } from '@aletis/shared-types';

export interface SmartExtractResult {
  result: DocumentExtractionResult | null;
  classification: { tipo: string; confianca: number; metodo: string };
  timingMs: number;
}

/**
 * Pipeline completo: classifica o documento, escolhe o extractor apropriado,
 * executa extração e mapeia para o modelo de dados do cliente.
 */
export async function smartExtract(doc: IngestedDocument): Promise<SmartExtractResult> {
  const t0 = Date.now();

  // 1. Classificação
  const classification = await classifyDocument(doc);

  // 2. Extração especializada
  let result: DocumentExtractionResult | null = null;

  switch (classification.tipo) {
    case 'contrato_credito_rural': {
      const contract = await extractContract(doc);
      if (contract) {
        const mapped = mapContractExtraction(doc, contract);
        result = mapped.result;
      }
      break;
    }
    case 'proposta_comercial': {
      const proposal = await extractProposal(doc);
      if (proposal) {
        const mapped = mapProposalExtraction(doc, proposal);
        result = mapped.result;
      }
      break;
    }
    case 'extrato_bancario': {
      const bank = await extractBankStatement(doc);
      if (bank) {
        const mapped = mapBankStatementExtraction(doc, bank);
        result = mapped.result;
      }
      break;
    }
    case 'documento_pessoal': {
      const identity = await extractIdentityDoc(doc);
      if (identity) {
        const mapped = mapIdentityDocExtraction(doc, identity);
        result = mapped.result;
      }
      break;
    }
    case 'laudo_tecnico': {
      const report = await extractTechnicalReport(doc);
      if (report) {
        const mapped = mapTechnicalReportExtraction(doc, report);
        result = mapped.result;
      }
      break;
    }
    case 'planilha_gestao': {
      const sheet = await extractSpreadsheet(doc);
      if (sheet) {
        const mapped = mapSpreadsheetExtraction(doc, sheet);
        result = mapped.result;
      }
      break;
    }
    default: {
      // Fallback para entidades genéricas já extraídas pelo DocEntityExtractor
      const entities = (doc.metadata as any)?.entities as ExtractedEntity[] | undefined;
      if (entities && entities.length > 0) {
        const mapped = mapGenericEntities(doc, 'outro', entities, 0.5);
        result = mapped.result;
      }
    }
  }

  // Se extração especializada falhou mas temos entidades genéricas, usa fallback
  if (!result) {
    const entities = (doc.metadata as any)?.entities as ExtractedEntity[] | undefined;
    if (entities && entities.length > 0) {
      const mapped = mapGenericEntities(doc, classification.tipo, entities, classification.confianca * 0.7);
      result = mapped.result;
    }
  }

  // Último fallback determinístico: não deixa o documento sem dados úteis
  // quando a IA está indisponível ou não reconhece o formato.
  if (!result) result = deterministicExtraction(doc, classification.tipo as DocumentType);

  const timingMs = Date.now() - t0;

  if (result) {
    console.log(
      `[SmartExtractor] ${doc.filename} → ${classification.tipo} (conf: ${(classification.confianca * 100).toFixed(0)}%, ${timingMs}ms, ${result.evidencias.length} evidências)`,
    );
  } else {
    console.warn(`[SmartExtractor] ${doc.filename} → ${classification.tipo} (conf: ${(classification.confianca * 100).toFixed(0)}%) — SEM RESULTADO`);
  }

  return { result, classification, timingMs };
}

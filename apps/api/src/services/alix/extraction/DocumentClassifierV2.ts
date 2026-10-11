// ============================================================
// DocumentClassifierV2 — Classificação de tipo de documento
// Híbrido: regex rápido (zero custo) + fallback OpenAI
// ============================================================

import type { IngestedDocument } from '../intake/types.js';
import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js';
import { getModelForRole } from '../../llm/LLMConfig.js';
import { DOCUMENT_STRUCTURED_SCHEMAS } from './DocumentStructuredSchemas.js';
import { buildDocumentModelContent } from '../intake/DocumentModelInput.js';
import type { DocumentType } from '@aletis/shared-types';

export interface ClassificationResult {
  tipo: DocumentType;
  confianca: number;
  metodo: 'regex' | 'llm';
}

const DOCUMENT_TYPES: DocumentType[] = [
  'contrato_credito_rural',
  'proposta_comercial',
  'extrato_bancario',
  'documento_pessoal',
  'laudo_tecnico',
  'planilha_gestao',
  'outro',
];

// ── Regex patterns por tipo (case-insensitive, português brasileiro) ──

const PATTERNS: Array<{ tipo: DocumentType; peso: number; re: RegExp }> = [
  // Contrato de crédito rural
  {
    tipo: 'contrato_credito_rural',
    peso: 3,
    re: /\b(contrato\s+de\s+cr[eé]dito\s+rural|c[eé]dula\s+de\s+cr[eé]dito\s+rural|pronaf|pronamp|custeio\s+rural|investimento\s+rural|mcr\s+6|mcr\s+7|carteira\s+agr[ií]cola|opera[çc][aã]o\s+de\s+cr[eé]dito|contrato\s+de\s+mutuo|contrato\s+de\s+financiamento\s+rural)\b/i,
  },
  { tipo: 'contrato_credito_rural', peso: 2, re: /\b(garantia\s+real|hipoteca\s+rural|penhor\s+agr[ií]cola|aliena[çc][aã]o\s+fiduci[aá]ria\s+rural|avalista|fiador|cedula\s+de\s+produtor\s+rural|cpr)\b/i },
  { tipo: 'contrato_credito_rural', peso: 1, re: /\b(devedor\s*\/\s*mutu[aá]rio|credor\s*\/\s*mutuante|linha\s+de\s+cr[eé]dito|taxa\s+de\s+juros\s+aa|corre[çc][aã]o\s+monet[aá]ria|amortiza[çc][aã]o|car[eê]ncia|vencimento\s+antecipado)\b/i },

  // Proposta comercial / proposta de renegociação
  {
    tipo: 'proposta_comercial',
    peso: 3,
    re: /\b(proposta\s+comercial|proposta\s+de\s+renegocia[çc][aã]o|proposta\s+de\s+reestrutura[çc][aã]o|parecer\s+t[eé]cnico\s+de\s|memorial\s+de\s+c[aá]lculo|condi[çc][oô]es\s+de\s|reestrutura[çc][aã]o\s+de\s+d[ií]vida|honor[aá]rios\s+advocat[ií]cios)\b/i,
  },

  // Extrato bancário
  {
    tipo: 'extrato_bancario',
    peso: 3,
    re: /\b(extrato\s+banc[aá]rio|extrato\s+de\s+conta\s+corrente|fatura\s+de\s+cart[aã]o|saldo\s+em\s+conta|movimenta[çc][aã]o\s+financeira|extrato\s+consolidado)\b/i,
  },
  { tipo: 'extrato_bancario', peso: 1, re: /\b(ofx|open\s+financial\s+exchange|itau|bradesco|santander|sicredi|sicoob|caixa|bb\s+banco\s+do\s+brasil|nubank|inter|c6)\b/i },

  // Documento pessoal
  {
    tipo: 'documento_pessoal',
    peso: 3,
    re: /\b(cadastro\s+de\s+pessoa\s+f[ií]sica|carteira\s+de\s+identidade|carteira\s+nacional\s+de\s+habilita[çc][aã]o|t[ií]tulo\s+de\s+eleitor|passaporte|rg\s*[:\-]?\s*\d|cpf\s*[:\-]?\s*\d{3}|registro\s+geral)\b/i,
  },

  // Laudo técnico
  {
    tipo: 'laudo_tecnico',
    peso: 3,
    re: /\b(laudo\s+t[eé]cnico|laudo\s+de\s+avalia[çc][aã]o|avalia[çc][aã]o\s+de\s|vistoria\s+t[eé]cnica|per[ií]cia\s+t[eé]cnica|relat[oó]rio\s+t[eé]cnico|engenheiro\s+agr[oô]nomo|engenheiro\s+civil|avaliador\s+ rural)\b/i,
  },

  // Planilha de gestão financeira
  {
    tipo: 'planilha_gestao',
    peso: 3,
    re: /\b(gest[aã]o\s+financeira|fluxo\s+de\s+caixa|demonstra[çc][aã]o\s+de\s+resultado|dre\s|balan[çc]o\s+patrimonial|custo\s+de\s+produ[çc][aã]o|or[çc]amento\s+agr[ií]cola|plano\s+de\s+neg[oó]cio|quadro\s+de\s+produ[çc][aã]o|foto\s+mensal)\b/i,
  },
];

// Heurística por filename
const FILENAME_PATTERNS: Array<{ tipo: DocumentType; re: RegExp }> = [
  { tipo: 'contrato_credito_rural', re: /contrato.*credito|cedula.*credito|pronaf|pronamp|mutuo/i },
  { tipo: 'proposta_comercial', re: /proposta|parecer.*tecnico|memorial.*calculo|renegociacao|reestruturacao/i },
  { tipo: 'extrato_bancario', re: /extrato|fatura|ofx/i },
  { tipo: 'documento_pessoal', re: /cpf|rg|cnh|titulo.*eleitor|identidade|passaporte/i },
  { tipo: 'laudo_tecnico', re: /laudo|vistoria|pericia|avaliacao.*imovel/i },
  { tipo: 'planilha_gestao', re: /gestao.*financeira|fluxo.*caixa|dre|balanco|custo|orcamento|foto.*mensal/i },
];

function classifyByRegex(doc: IngestedDocument): ClassificationResult | null {
  const text = (doc.extractedText ?? '').slice(0, 4000);
  const filename = doc.filename.toLowerCase();
  const scores = new Map<DocumentType, number>();

  // Texto
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      scores.set(p.tipo, (scores.get(p.tipo) || 0) + p.peso);
    }
  }

  // Filename
  for (const fp of FILENAME_PATTERNS) {
    if (fp.re.test(filename)) {
      scores.set(fp.tipo, (scores.get(fp.tipo) || 0) + 2);
    }
  }

  // Kind heuristics
  if (doc.kind === 'xlsx' || doc.kind === 'csv') {
    scores.set('planilha_gestao', (scores.get('planilha_gestao') || 0) + 1);
  }

  // AgroDocClassifier tem prioridade se detectou tipo conhecido
  const agroTipo = (doc.metadata as any)?.agroTipo as string | undefined;
  if (agroTipo === 'Contrato de Crédito Rural') {
    scores.set('contrato_credito_rural', (scores.get('contrato_credito_rural') || 0) + 4);
  }

  // Escolhe o maior score
  let best: DocumentType = 'outro';
  let bestScore = 0;
  for (const [tipo, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = tipo;
    }
  }

  // Threshold para confiar em regex: score >= 3
  if (bestScore >= 3) {
    const confianca = Math.min(0.95, 0.5 + bestScore * 0.1);
    return { tipo: best, confianca, metodo: 'regex' };
  }

  return null;
}

const LLM_CLASSIFY_PROMPT = `Você é um classificador de documentos da consultoria ALETIS (financeira/agro).
Classifique o documento em UMA das categorias abaixo. Responda APENAS com JSON válido, sem markdown.

Categorias:
- contrato_credito_rural (contratos de financiamento rural, CPR, cédula de crédito, Pronaf, Pronamp, MCR)
- proposta_comercial (propostas de renegociação, parecer técnico, memorial de cálculo)
- extrato_bancario (extrato de conta, fatura de cartão, OFX)
- documento_pessoal (CPF, RG, CNH, título de eleitor, passaporte)
- laudo_tecnico (laudo de avaliação, vistoria, perícia técnica)
- planilha_gestao (planilhas de gestão financeira, DRE, fluxo de caixa, custo de produção)
- outro (nenhum dos anteriores)

Regras:
- Use a categoria mais específica possível.
- Se for contrato de crédito rural + proposta comercial, priorize contrato_credito_rural.
- Responda apenas JSON no formato exato:

{"tipo": "string", "confianca": 0.0-1.0}

confianca: 0.9-1.0 = certeza absoluta, 0.7-0.89 = provável, 0.5-0.69 = incerto, < 0.5 = outro`;

async function classifyByLLM(doc: IngestedDocument): Promise<ClassificationResult> {
  if (!isOpenAIEnabled()) {
    return { tipo: 'outro', confianca: 0, metodo: 'llm' };
  }

  const text = (doc.extractedText ?? '').slice(0, 3000);
  const context = `Filename: ${doc.filename}\nTipo de arquivo: ${doc.kind}\nPrimeiros 3000 caracteres:\n${text}`;

  try {
    const content = await buildDocumentModelContent(doc, context);
    const result = await generateStructured<{ tipo?: string; confianca?: number }>(
      [{ role: 'user', content }],
      {
        name: 'classificacao_documento',
        schema: DOCUMENT_STRUCTURED_SCHEMAS.classification,
        model: getModelForRole('classifier'),
        maxTokens: 256,
        system: LLM_CLASSIFY_PROMPT,
        reasoning: { effort: 'low' },
      },
    );
    const parsed = result.data;

    const tipo = DOCUMENT_TYPES.includes(parsed.tipo as DocumentType)
      ? (parsed.tipo as DocumentType)
      : 'outro';

    const confianca = Math.min(1, Math.max(0, Number(parsed.confianca ?? 0.5)));

    return { tipo, confianca, metodo: 'llm' };
  } catch (err) {
    console.warn('[DocumentClassifierV2] LLM fallback falhou:', (err as Error).message);
    return { tipo: 'outro', confianca: 0, metodo: 'llm' };
  }
}

/**
 * Classifica um documento ingerido. Tenta regex primeiro (zero custo, instantâneo).
 * Se regex não tiver confiança, faz fallback para OpenAI (prompt curto, ~500 tokens).
 */
export async function classifyDocument(doc: IngestedDocument): Promise<ClassificationResult> {
  const regexResult = classifyByRegex(doc);
  if (regexResult && regexResult.confianca >= 0.85) {
    return regexResult;
  }

  const llmResult = await classifyByLLM(doc);

  // Se regex deu algo com score baixo mas LLM discordou fortemente, usa LLM
  if (regexResult && llmResult.tipo !== 'outro' && llmResult.confianca >= 0.7) {
    return llmResult;
  }

  // Se regex teve score médio, usa regex
  if (regexResult && regexResult.confianca >= 0.6) {
    return regexResult;
  }

  return llmResult;
}

// ============================================================
// LlmDocExtractor — fallback Haiku-vision para docs não classificados
// ============================================================
// Quando o AgroDocClassifier (regex-based) não consegue identificar o tipo
// do documento ou a confiança é baixa (<0.5), e temos imagem/PDF como
// imageBase64, delegamos à LLM para extrair campos estruturados.
//
// Modelo: Haiku (rápido + barato) com vision via `image_base64`.
// Saída: mesma shape do AgroDocClassification para plug-and-play.
// ============================================================
import { runClaude, isLLMEnabled } from '../../llm/ClaudeFoundryClient.js'
import type { AgroDocClassification } from './AgroDocClassifier.js'

const MODEL = process.env.ALIX_DOC_EXTRACTOR_MODEL || 'claude-haiku-4-5'

const SYSTEM_PROMPT = `Você é um extrator de documentos agro-financeiros brasileiros. Receberá uma imagem/página de documento e deve identificar o tipo e extrair campos estruturados.

Tipos possíveis: CCIR, CAR, MATRICULA, EXTRATO_BANCARIO, CONTRATO_CREDITO_RURAL, DAP, NFE_PRODUTOR, LAUDO_TECNICO, RG, CPF_CNPJ_CARD, COMPROVANTE_RESIDENCIA, COMPROVANTE_RENDA, OUTRO.

Responda SOMENTE com um JSON válido no formato:
{
  "tipo": "<TIPO>",
  "confianca": 0.0-1.0,
  "camposExtraidos": {
    "nome": "string opcional",
    "cpfCnpj": "string opcional (apenas dígitos)",
    "endereco": "string opcional",
    "valorTotal": number opcional,
    "dataEmissao": "YYYY-MM-DD opcional",
    "numeroDocumento": "string opcional",
    "emissor": "string opcional (banco, cartório, órgão)",
    "area_ha": number opcional,
    "outros": { "...": "..." }
  },
  "indicadores": ["lista", "de", "palavras-chave", "identificadas"]
}

Se não puder identificar, retorne tipo="OUTRO" com confianca baixa. NUNCA invente dados — só extraia o que de fato lê.`

export async function extractDocViaLlm(params: {
  imageBase64: string
  imageMediaType: string
  textContext?: string
}): Promise<AgroDocClassification | null> {
  if (!isLLMEnabled()) return null
  try {
    const messages = [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: params.imageMediaType,
              data: params.imageBase64,
            },
          },
          {
            type: 'text' as const,
            text:
              `Analise este documento e extraia os campos.` +
              (params.textContext ? `\n\nTexto OCR (pode estar incompleto): ${params.textContext.slice(0, 1000)}` : ''),
          },
        ] as any,
      },
    ]
    const result = await runClaude(messages as any, {
      model: MODEL,
      maxTokens: 1000,
      system: SYSTEM_PROMPT,
    })
    // Remove cercas de código caso venham
    const raw = result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    const parsed = JSON.parse(raw) as Partial<AgroDocClassification>
    return {
      tipo: (parsed.tipo || 'OUTRO') as AgroDocClassification['tipo'],
      confianca: Number(parsed.confianca || 0.6),
      camposExtraidos: parsed.camposExtraidos || {},
      indicadores: Array.isArray(parsed.indicadores) ? parsed.indicadores : [],
    }
  } catch (err) {
    console.warn('[LlmDocExtractor] falhou:', (err as Error).message)
    return null
  }
}

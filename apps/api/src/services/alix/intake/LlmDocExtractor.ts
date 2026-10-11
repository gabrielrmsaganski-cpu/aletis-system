// ============================================================
// LlmDocExtractor - fallback multimodal OpenAI para docs nao classificados
// ============================================================
// Quando o AgroDocClassifier (regex-based) não consegue identificar o tipo
// do documento ou a confiança é baixa (<0.5), e temos imagem/PDF como
// imageBase64, delegamos à LLM para extrair campos estruturados.
//
// Modelo: Haiku (rápido + barato) com vision via `image_base64`.
// Saída: mesma shape do AgroDocClassification para plug-and-play.
// ============================================================
import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js'
import { getModelForRole } from '../../llm/LLMConfig.js'
import type { AgroDocClassification } from './AgroDocClassifier.js'

const MODEL = getModelForRole('doc_extractor')

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
    "outros": [{"campo":"string","valor":"string"}]
  },
  "indicadores": ["lista", "de", "palavras-chave", "identificadas"]
}

Se não puder identificar, retorne tipo="OUTRO" com confianca baixa. NUNCA invente dados — só extraia o que de fato lê.`

export async function extractDocViaLlm(params: {
  imageBase64: string
  imageMediaType: string
  textContext?: string
}): Promise<AgroDocClassification | null> {
  if (!isOpenAIEnabled()) return null
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
    const result = await generateStructured<{
      tipo: AgroDocClassification['tipo']
      confianca: number
      camposExtraidos: Record<string, unknown> & { outros?: Array<{ campo: string; valor: string }> }
      indicadores: string[]
    }>(messages as any, {
      name: 'classificacao_agro_documento',
      schema: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['CCIR', 'CAR', 'MATRICULA', 'EXTRATO_BANCARIO', 'CONTRATO_CREDITO_RURAL', 'DAP', 'NFE_PRODUTOR', 'LAUDO_TECNICO', 'RG', 'CPF_CNPJ_CARD', 'COMPROVANTE_RESIDENCIA', 'COMPROVANTE_RENDA', 'OUTRO'] },
          confianca: { type: 'number', minimum: 0, maximum: 1 },
          camposExtraidos: {
            type: 'object',
            properties: {
              nome: { type: 'string' }, cpfCnpj: { type: 'string' }, endereco: { type: 'string' },
              valorTotal: { type: 'number' }, dataEmissao: { type: 'string' }, numeroDocumento: { type: 'string' },
              emissor: { type: 'string' }, area_ha: { type: 'number' },
              outros: { type: 'array', items: { type: 'object', properties: { campo: { type: 'string' }, valor: { type: 'string' } }, required: ['campo', 'valor'] } },
            },
          },
          indicadores: { type: 'array', items: { type: 'string' } },
        },
        required: ['tipo', 'confianca', 'camposExtraidos', 'indicadores'],
      },
      model: MODEL,
      maxTokens: 1_200,
      system: SYSTEM_PROMPT,
      reasoning: { effort: 'low' },
    })
    const parsed = result.data
    const { outros = [], ...knownFields } = parsed.camposExtraidos || {}
    return {
      tipo: (parsed.tipo || 'OUTRO') as AgroDocClassification['tipo'],
      confianca: Number(parsed.confianca || 0.6),
      camposExtraidos: {
        ...knownFields,
        ...Object.fromEntries(outros.map((item) => [item.campo, item.valor])),
      },
      indicadores: Array.isArray(parsed.indicadores) ? parsed.indicadores : [],
    }
  } catch (err) {
    console.warn('[LlmDocExtractor] falhou:', (err as Error).message)
    return null
  }
}

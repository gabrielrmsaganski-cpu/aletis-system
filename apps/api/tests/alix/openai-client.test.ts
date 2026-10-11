import { describe, expect, it } from 'vitest'
import { messagesToInput, strictifyJsonSchema } from '../../src/services/llm/OpenAIClient.js'
import { estimateCost, MODEL_REGISTRY, validateModel } from '../../src/services/llm/LLMConfig.js'

describe('politica OpenAI', () => {
  it('mantem apenas modelos oficiais selecionados', () => {
    expect(Object.keys(MODEL_REGISTRY)).toEqual(expect.arrayContaining([
      'gpt-5.6-sol',
      'gpt-6-astra',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'text-embedding-3-small',
      'gpt-4o-transcribe',
      'tts-1-hd',
    ]))
    expect(validateModel('gpt-5.6-terra').valid).toBe(true)
    expect(validateModel('claude-sonnet-4-6').valid).toBe(false)
    expect(validateModel('azure/gpt-5').valid).toBe(false)
  })

  it('calcula custo com desconto de cache', () => {
    expect(estimateCost('gpt-5.6-terra', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cached_tokens: 100_000,
    })).toBe(13.82)
  })

  it('inclui o adicional de escrita no prompt cache', () => {
    expect(estimateCost('gpt-5.6-luna', {
      input_tokens: 1_000_000,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    })).toBe(0.25)
  })

  it('usa preços públicos Sol/Astra e distingue o patamar de contexto longo', () => {
    expect(estimateCost('gpt-5.6-sol', { input_tokens: 100_000, output_tokens: 100_000 })).toBe(2.4)
    expect(estimateCost('gpt-5.6-sol-2026-07-09', { input_tokens: 300_000, output_tokens: 100_000 })).toBe(5.4)
    expect(estimateCost('gpt-6-astra', { input_tokens: 100_000, output_tokens: 100_000 })).toBe(6)
    expect(estimateCost('gpt-6-astra', { input_tokens: 300_000, output_tokens: 100_000 })).toBe(13.5)
  })
})

describe('Structured Outputs', () => {
  it('converte propriedades opcionais em nullable e fecha objetos', () => {
    const schema = strictifyJsonSchema({
      type: 'object',
      properties: {
        nome: { type: 'string' },
        telefone: { type: 'string' },
        endereco: {
          type: 'object',
          properties: { cidade: { type: 'string' } },
          required: ['cidade'],
        },
      },
      required: ['nome'],
    }) as any

    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(['nome', 'telefone', 'endereco'])
    expect(schema.properties.telefone.type).toEqual(['string', 'null'])
    expect(schema.properties.endereco.type).toEqual(['object', 'null'])
    expect(schema.properties.endereco.additionalProperties).toBe(false)
  })

  it('fecha objetos sem propriedades para não invalidar function calling estrito', () => {
    const schema = strictifyJsonSchema({
      type: 'object',
      properties: { payload: { type: 'object' } },
    }) as any

    expect(schema.properties.payload.additionalProperties).toBe(false)
    expect(schema.properties.payload.properties).toEqual({})
    expect(schema.properties.payload.required).toEqual([])
  })
})

describe('entrada multimodal de documentos', () => {
  it('converte PDF base64 no formato input_file da Responses API', () => {
    const input = messagesToInput([{
      role: 'user',
      content: [
        {
          type: 'file',
          filename: 'contrato.pdf',
          detail: 'high',
          source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' },
        },
        { type: 'input_text', text: 'Analise o contrato.' },
      ],
    }]) as any[]

    expect(input).toHaveLength(1)
    expect(input[0].role).toBe('user')
    expect(input[0].content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'input_file',
        filename: 'contrato.pdf',
        detail: 'high',
        file_data: 'data:application/pdf;base64,JVBERi0=',
      }),
      expect.objectContaining({ type: 'input_text', text: 'Analise o contrato.' }),
    ]))
  })
})

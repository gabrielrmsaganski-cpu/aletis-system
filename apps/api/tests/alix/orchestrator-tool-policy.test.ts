import { afterEach, describe, expect, it, vi } from 'vitest'
import { wrapOrchestratorTools } from '../../src/services/alix/tools/OrchestratorToolPolicy.js'
import type { LLMToolRegistry } from '../../src/services/llm/types.js'

function registry(name: string, durationMs: number): LLMToolRegistry {
  return {
    [name]: {
      spec: { name, description: name, input_schema: { type: 'object', properties: {} } },
      handler: vi.fn(() => new Promise(resolve => setTimeout(() => resolve({ ok: true, artifact: 'completed' }), durationMs))),
    },
  }
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('prazos das ferramentas do orquestrador', () => {
  it('aguarda geração do Notebook por 42 segundos sem devolver falso timeout aos 25', async () => {
    vi.useFakeTimers()
    const input = registry('gerar_documento_notebook', 42_000)
    const wrapped = wrapOrchestratorTools(input)
    let settled = false
    const result = Promise.resolve(wrapped.gerar_documento_notebook.handler({})).then(value => { settled = true; return value })
    await vi.advanceTimersByTimeAsync(25_001)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(16_999)
    expect(await result).toEqual({ ok: true, artifact: 'completed' })
    expect(input.gerar_documento_notebook.handler).toHaveBeenCalledTimes(1)
  })

  it('mantém um teto de 90 segundos para geração do Notebook', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapped = wrapOrchestratorTools(registry('gerar_documento_notebook', 120_000))
    const result = Promise.resolve(wrapped.gerar_documento_notebook.handler({}))
    await vi.advanceTimersByTimeAsync(90_000)
    expect(await result).toMatchObject({ tool: 'gerar_documento_notebook', error: 'timeout após 90000ms' })
  })

  it('preserva o prazo de 180 segundos da emissão pelo DocGenerator', async () => {
    vi.useFakeTimers()
    const wrapped = wrapOrchestratorTools(registry('delegate_doc_generator', 110_000))
    const result = Promise.resolve(wrapped.delegate_doc_generator.handler({}))
    await vi.advanceTimersByTimeAsync(110_000)
    expect(await result).toEqual({ ok: true, artifact: 'completed' })
  })

  it('preserva o timeout de consultas comuns em 25 segundos', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapped = wrapOrchestratorTools(registry('consulta_local', 40_000))
    const result = Promise.resolve(wrapped.consulta_local.handler({}))
    await vi.advanceTimersByTimeAsync(25_000)
    expect(await result).toMatchObject({ tool: 'consulta_local', error: 'timeout após 25000ms' })
  })
})

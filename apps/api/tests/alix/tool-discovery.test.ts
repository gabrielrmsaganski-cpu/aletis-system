import { expect, it, vi } from 'vitest'
import { buildToolDiscovery, validateToolArguments } from '../../src/services/alix/tools/ToolDiscovery.js'
import { selectToolsForMessage } from '../../src/services/alix/tools/ToolSelector.js'
import { observeToolRegistry, toolOutcome, type AlixToolProgress } from '../../src/services/alix/tools/ToolOutcome.js'
import { safeHandler } from '../../src/services/alix/tools/safe-handler.js'
import type { LLMToolRegistry } from '../../src/services/llm/types.js'

function registry(names: string[]): LLMToolRegistry {
  return Object.fromEntries(names.map((name) => [name, { spec: { name, description: `Capacidade ${name}`, input_schema: { type: 'object', properties: { clienteId: { type: 'string' } }, required: ['clienteId'] } }, handler: vi.fn(async (input) => ({ ok: true, entidade: input.clienteId })) }]))
}

it('descobre e executa capacidade real que não cabe na seleção inicial', async () => {
  const catalog = registry(['buscar_cliente', 'delegate_crm_writer', ...Array.from({ length: 40 }, (_, i) => `consultar_modulo_${i}`), 'gerar_relatorio_documental'])
  const discovery = buildToolDiscovery(catalog)
  const selected = selectToolsForMessage([...Object.values(catalog).map((e) => e.spec), ...discovery.tools], { ...catalog, ...discovery.registry }, 'cliente', 5)
  expect(selected.selectedNames).toEqual(expect.arrayContaining(['descobrir_ferramentas', 'executar_ferramenta_descoberta', 'delegate_crm_writer']))
  expect(selected.selectedNames).not.toContain('gerar_relatorio_documental')
  const found: any = await selected.registry.descobrir_ferramentas.handler({ consulta: 'gerar_relatorio_documental' })
  expect(found.ferramentas[0]).toEqual(catalog.gerar_relatorio_documental.spec)
  expect(catalog.gerar_relatorio_documental.handler).not.toHaveBeenCalled()
  const result = await selected.registry.executar_ferramenta_descoberta.handler({ nome: 'gerar_relatorio_documental', argumentosJson: '{"clienteId":"cliente-a"}' })
  expect(result).toEqual({ ok: true, entidade: 'cliente-a' })
})

it('mantém obrigatórias mesmo com limite insuficiente e nunca anuncia handler ausente', () => {
  const catalog = registry(['buscar_cliente', 'delegate_crm_writer', 'obrigatoria_a', 'obrigatoria_b'])
  const selected = selectToolsForMessage([...Object.values(catalog).map((e) => e.spec), { name: 'fantasma', description: '', input_schema: {} }], catalog, '', 1, ['obrigatoria_a', 'obrigatoria_b'])
  expect(selected.selectedNames).toHaveLength(4)
  expect(selected.selectedNames).not.toContain('fantasma')
})

it('não executa nome inventado, não descoberto, argumentos inválidos ou descoberta de outra chamada', async () => {
  const catalog = registry(['atualizar_cliente'])
  const first = buildToolDiscovery(catalog)
  const run = first.registry.executar_ferramenta_descoberta.handler
  expect(await run({ nome: 'atualizar_cliente', argumentosJson: '{}' })).toMatchObject({ ok: false })
  await first.registry.descobrir_ferramentas.handler({ consulta: 'atualizar_cliente' })
  for (const args of ['{}', '{"clienteId":3}', 'null', '[1]', '{']) expect(await run({ nome: 'atualizar_cliente', argumentosJson: args })).toMatchObject({ ok: false })
  expect(await run({ nome: 'ferramenta_inexistente', argumentosJson: '{}' })).toMatchObject({ ok: false })
  expect(await buildToolDiscovery(catalog).registry.executar_ferramenta_descoberta.handler({ nome: 'atualizar_cliente', argumentosJson: '{"clienteId":"a"}' })).toMatchObject({ ok: false })
  expect(catalog.atualizar_cliente.handler).not.toHaveBeenCalled()
})

it('retorna capacidade ausente explicitamente e preserva erro original do handler', async () => {
  const catalog = registry(['consultar_mercado'])
  catalog.consultar_mercado.handler = async () => ({ ok: false, error: 'Fonte indisponível' })
  const discovery = buildToolDiscovery(catalog)
  expect(await discovery.registry.descobrir_ferramentas.handler({ consulta: 'ferramentainventada' })).toMatchObject({ totalEncontradas: 0, ferramentas: [] })
  await discovery.registry.descobrir_ferramentas.handler({ consulta: 'consultar_mercado' })
  expect(await discovery.registry.executar_ferramenta_descoberta.handler({ nome: 'consultar_mercado', argumentosJson: '{"clienteId":"a"}' })).toEqual({ ok: false, error: 'Fonte indisponível' })
})

it('valida objetos aninhados e opções sem converter strings em números', () => {
  const schema = { type: 'object', required: ['itens'], properties: { itens: { type: 'array', items: { type: 'object', required: ['estado'], properties: { estado: { type: 'string', enum: ['aberto', 'fechado'] } }, additionalProperties: false } } } }
  expect(validateToolArguments({ itens: [{ estado: 'aberto' }] }, schema)).toEqual([])
  expect(validateToolArguments({ itens: [{ estado: 'inventado', extra: true }] }, schema)).toHaveLength(2)
})

it('progresso começa antes do resultado e diferencia intenção pendente de ação executada', async () => {
  let finish!: (value: unknown) => void
  const catalog = registry(['criar_demanda'])
  catalog.criar_demanda.handler = () => new Promise((resolve) => { finish = resolve })
  const events: AlixToolProgress[] = []
  const observed = observeToolRegistry(catalog, { onProgress: (event) => events.push(event) })
  const pending = observed.criar_demanda.handler({ clienteId: 'a' })
  expect(events).toHaveLength(1)
  expect(events[0].phase).toBe('started')
  finish({ metadata: { pendingConfirmation: true } })
  await pending
  expect(events[1]).toMatchObject({ id: events[0].id, phase: 'completed', outcome: 'prepared' })
  expect(toolOutcome('enviar_whatsapp', { ok: true, queued: true })).toBe('prepared')
  expect(toolOutcome('atualizar_cliente', { ok: false, error: 'Falhou' })).toBe('failed')
  expect(toolOutcome('atualizar_cliente', { executed: true, id: 'a' })).toBe('executed')
  expect(toolOutcome('atualizar_cliente', { ok: true })).toBe('unknown')
})

it('cancelamento impede nova ferramenta e exceção emite failed com evidência', async () => {
  const catalog = registry(['buscar_cliente'])
  const abort = new AbortController()
  abort.abort()
  await expect(observeToolRegistry(catalog, { signal: abort.signal }).buscar_cliente.handler({ clienteId: 'a' })).rejects.toThrow()
  expect(catalog.buscar_cliente.handler).not.toHaveBeenCalled()
  catalog.buscar_cliente.handler = async () => { throw new Error('indisponível') }
  const onResult = vi.fn()
  const events: AlixToolProgress[] = []
  await expect(observeToolRegistry(catalog, { onResult, onProgress: (event) => events.push(event) }).buscar_cliente.handler({})).rejects.toThrow('indisponível')
  expect(events.at(-1)?.phase).toBe('failed')
  expect(onResult).toHaveBeenCalledWith('buscar_cliente', {}, { ok: false, error: 'indisponível' }, expect.any(Number))
})

it('um timeout não inicia uma segunda operação idêntica ainda em andamento', async () => {
  vi.useFakeTimers()
  let finish!: (value: unknown) => void
  const effect = vi.fn(() => new Promise((resolve) => { finish = resolve }))
  const run = safeHandler(effect, { name: 'criar_demanda', timeoutMs: 20 })
  const first = run({ clienteId: 'a' })
  await vi.advanceTimersByTimeAsync(21)
  expect(await first).toMatchObject({ error: expect.stringContaining('timeout') })
  const retry = run({ clienteId: 'a' })
  finish({ ok: true, id: 'demanda-1' })
  expect(await retry).toEqual({ ok: true, id: 'demanda-1' })
  expect(effect).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

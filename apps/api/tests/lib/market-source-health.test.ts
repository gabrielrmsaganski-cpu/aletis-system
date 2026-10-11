import { describe, expect, it, vi } from 'vitest'
const request = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: { request, create: () => ({}) } }))
import { DataSourceManager, type DataSourceEntry } from '../../src/services/DataSourceManager.js'

function setup() {
  const manager = Object.create(DataSourceManager.prototype) as DataSourceManager
  const entry: DataSourceEntry = { nome: 'test', descricao: 'Test', categoria: 'PRECOS', url: 'https://example.invalid', ttlSegundos: 60, status: 'unknown', ultimaAtualizacao: null, latenciaMs: null, erros24h: 0, ultimoErro: null }
  Object.assign(manager, { registry: new Map([['test', entry]]), errorCounts: new Map(), persistFontesPg: vi.fn().mockResolvedValue(undefined) })
  return { manager, entry }
}
describe('conectividade não comprova dados', () => {
  it.each([404, 429, 500])('HTTP %s não vira online nem redata a observação', async status => {
    const { manager, entry } = setup()
    entry.ultimaObservacao = '2026-08-31'
    request.mockResolvedValue({ status, headers: { 'content-type': 'application/json' }, data: { destroy: vi.fn() } })
    const result = await manager.probeAllSources()
    expect(result.online).toBe(0)
    expect(entry.dadosDisponiveis).toBe(false)
    expect(entry.ultimaObservacao).toBe('2026-08-31')
    expect(entry.ultimaAtualizacao).toBeNull()
  })
  it('HTTP 200 HTML e JSON sem coleta validada permanecem parciais', async () => {
    for (const contentType of ['text/html', 'application/json']) {
      const { manager, entry } = setup()
      request.mockResolvedValue({ status: 200, headers: { 'content-type': contentType }, data: { destroy: vi.fn() } })
      await manager.probeAllSources()
      expect(entry).toMatchObject({ status: 'degraded', conectividade: 'conectado', dadosDisponiveis: false })
    }
  })
  it('wrapResult preserva fallback e a data fornecida pela fonte', async () => {
    const { manager, entry } = setup()
    const result = await (manager as any).wrapResult('test', async () => ({ fonte: 'fallback', data: '2026-04-10', valor: 1 }))
    expect(result).toMatchObject({ fonte: 'fallback', atualizadoEm: '2026-04-10' })
    expect(entry.status).toBe('degraded')
  })
})

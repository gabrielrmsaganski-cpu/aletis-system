import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EvolutionClient } from '../../src/services/whatsapp/evolution/EvolutionClient.js'

function clearEvolutionEnv(): void {
  delete process.env.EVOLUTION_API_URL
  delete process.env.EVOLUTION_API_KEY
  delete process.env.EVOLUTION_INSTANCE_NAME
  delete process.env.EVOLUTION_INSTANCE
}

beforeEach(() => {
  clearEvolutionEnv()
})

afterEach(() => {
  clearEvolutionEnv()
  vi.unstubAllGlobals()
})

describe('EvolutionClient runtime status', () => {
  it('informa desconectado quando a integração não está configurada', async () => {
    const status = await new EvolutionClient().getRuntimeStatus()

    expect(status.status).toBe('disconnected')
    expect(status.reachable).toBe(false)
  })

  it('reporta conectado somente quando a instância está aberta e alcançável', async () => {
    process.env.EVOLUTION_API_URL = 'https://evolution.example'
    process.env.EVOLUTION_API_KEY = 'test-key'
    process.env.EVOLUTION_INSTANCE_NAME = 'aletis-principal'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const status = await new EvolutionClient().getRuntimeStatus()

    expect(status.status).toBe('connected')
    expect(status.reachable).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['disconnected', 'disconnected'],
    ['connected', 'connected'],
    ['close', 'disconnected'],
    ['closed', 'disconnected'],
    ['offline', 'disconnected'],
    ['connecting', 'connecting'],
    ['qrcode', 'qr_available'],
    ['pairing', 'qr_available'],
    [' OPEN ', 'connected'],
    ['not_connected', 'degraded'],
  ])('interpreta o estado %s por correspondência exata', async (state, expected) => {
    process.env.EVOLUTION_API_URL = 'https://evolution.example'
    process.env.EVOLUTION_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ instance: { state } }))))
    expect(await new EvolutionClient().getRuntimeStatus()).toMatchObject({ status: expected, reachable: true })
  })

  it('lê o estado da instância mesmo quando o envelope contém status success', async () => {
    process.env.EVOLUTION_API_URL = 'https://evolution.example'
    process.env.EVOLUTION_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success', instance: { state: 'disconnected' } }))))
    expect(await new EvolutionClient().getRuntimeStatus()).toMatchObject({ status: 'disconnected' })
  })

  it('não informa conexão saudável quando o healthcheck falha', async () => {
    process.env.EVOLUTION_API_URL = 'https://evolution.example'
    process.env.EVOLUTION_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ instance: { state: 'connected' } }))))
    expect(await new EvolutionClient().getRuntimeStatus()).toMatchObject({ status: 'degraded', reachable: false })
  })

  it('informa erro se o estado da instância não puder ser consultado', async () => {
    process.env.EVOLUTION_API_URL = 'https://evolution.example'
    process.env.EVOLUTION_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockRejectedValueOnce(new Error('Connection refused')))
    expect(await new EvolutionClient().getRuntimeStatus()).toMatchObject({ status: 'error', reachable: false })
  })
})

import Fastify from 'fastify'
import { expect, it, vi } from 'vitest'
import routes from '../../src/routes/alix-command-center.js'
import { MarketBriefService } from '../../src/services/MarketBriefService.js'
import { propostas } from '../../src/routes/propostas.js'
import { ProactiveService } from '../../src/services/alix/ProactiveService.js'

it('resumo operacional pode responder sem aguardar consultas externas de mercado', async () => {
  const market = vi.spyOn(MarketBriefService.prototype, 'generateBrief').mockResolvedValue({
    geradoEm: new Date().toISOString(), fonteOrigem: 'mixed', narrativaCurta: 'Teste', macro: {},
    alertas: [], topAltas: [], topBaixas: [],
  } as any)
  const app = Fastify({ logger: false })
  try {
    await app.register(routes)
    const quick = await app.inject({ method: 'GET', url: '/api/alix/command-center?includeMarket=false' })
    expect(quick.statusCode).toBe(200)
    expect(quick.json().data.mercado).toBeNull()
    expect(market).not.toHaveBeenCalled()
    const full = await app.inject({ method: 'GET', url: '/api/alix/command-center' })
    expect(full.statusCode).toBe(200)
    expect(market).toHaveBeenCalledTimes(1)
    const invalid = await app.inject({ method: 'GET', url: '/api/alix/command-center?includeMarket=maybe' })
    expect(invalid.statusCode).toBe(400)
  } finally { await app.close(); market.mockRestore() }
})

it('recalcula validade atual e não reapresenta alertas históricos resolvidos', async () => {
  const saved = new Map(propostas)
  const expiry = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
  propostas.clear()
  for (const [id, status] of [['atual', 'enviada'], ['aceita', 'aceita'], ['expirada', 'expirada']] as const) {
    propostas.set(id, { id, status, clienteId: 'cliente-teste', clienteNome: 'Cliente teste', dataValidade: expiry, valorProposta: '1000.00' } as any)
  }
  const historical = vi.spyOn(ProactiveService.prototype, 'getRecentInsights').mockResolvedValue([
    { id: 'alerta-antigo', ts: new Date().toISOString(), tipo: 'proposta-vencendo', urgencia: 'critico', titulo: 'Proposta vencendo em 4d', detalhes: 'Prazo antigo', payload: { propostaId: 'expirada' } },
    { id: 'acao-resolvida', ts: new Date().toISOString(), tipo: 'crm-acao-vencida', urgencia: 'critico', titulo: 'Ação já resolvida', detalhes: 'Estado antigo' },
  ])
  const app = Fastify({ logger: false })
  try {
    await app.register(routes)
    const response = await app.inject({ method: 'GET', url: '/api/alix/command-center?includeMarket=false' })
    expect(response.statusCode).toBe(200)
    const data = response.json().data
    expect(data.kpis.propostasVencendo).toBe(1)
    expect(data.prioridades.filter((item: any) => item.tipo === 'proposta')).toEqual([
      expect.objectContaining({ id: 'proposta-atual', detalhe: expect.stringContaining('vence em 2d'), to: '/propostas?proposta=atual' }),
    ])
    expect(data.prioridades.map((item: any) => item.id)).not.toContain('alerta-antigo')
    expect(data.prioridades.map((item: any) => item.id)).not.toContain('acao-resolvida')
  } finally {
    await app.close()
    historical.mockRestore()
    propostas.clear()
    for (const [id, proposta] of saved) propostas.set(id, proposta)
  }
})

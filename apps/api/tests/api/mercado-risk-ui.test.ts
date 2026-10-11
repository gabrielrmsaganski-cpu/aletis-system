import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from '../../../web/node_modules/react-dom/server.node.js'
import { getFireObservation, MarketRiskFactors, MarketUnavailable, type FireRiskResponse } from '../../../web/src/components/mercado/MarketRiskFactors'

const now = Date.parse('2026-09-06T18:00:00Z')
function response(): FireRiskResponse {
  return { success: true, data: { fonte: 'api', atualizadoEm: '2026-09-06T17:00:00Z', porEstado: { MT: 220, GO: 10 }, maioresIncendios: [{ data: '2026-09-06' }] } }
}

describe('Painel de riscos: evidências e estados desconhecidos', () => {
  it('sem fonte, não afirma estiagem, ENSO ativo ou nível fixo de risco', () => {
    const html = renderToStaticMarkup(MarketRiskFactors({ observation: null }))
    expect(html).toContain('NÃO AVALIADO')
    expect(html).toContain('Sem boletim ENSO vigente')
    expect(html).not.toContain('La Niña ativa')
    expect(html).not.toContain('Estiagem prolongada')
    expect(html).not.toMatch(/MODERADO|BAIXO|ALTO|CRÍTICO/)
  })

  it('detecções verificadas mostram fonte e data sem convertê-las em grau de risco', () => {
    const observation = getFireObservation(response(), now)
    expect(observation?.porEstado).toEqual({ MT: 220, GO: 10 })
    const html = renderToStaticMarkup(MarketRiskFactors({ observation }))
    expect(html).toContain('NASA FIRMS')
    expect(html).toContain('2026-09-06')
    expect(html).toContain('MT: 220 detecções')
    expect(html).toContain('DETECÇÕES DISPONÍVEIS')
    expect(html).not.toContain('ALTO')
  })

  it.each(['fallback', 'simulacao', undefined])('origem %s não alimenta fatores de risco nem mapa', (source) => {
    const fixture = response()
    fixture.data!.fonte = source
    expect(getFireObservation(fixture, now)).toBeNull()
  })

  it('coleta recente não transforma observação antiga em condição atual', () => {
    const fixture = response()
    fixture.data!.maioresIncendios = [{ data: '2026-08-01' }]
    expect(getFireObservation(fixture, now)).toBeNull()
    fixture.data!.maioresIncendios = []
    expect(getFireObservation(fixture, now)).toBeNull()
  })

  it('cache sem detecções/documentação não declara risco baixo', () => {
    const fixture = response()
    fixture.data!.fonte = 'cache'
    fixture.data!.porEstado = {}
    fixture.data!.maioresIncendios = []
    expect(getFireObservation(fixture, now)).toBeNull()
  })

  it('painel indisponível comunica a lacuna em lugar de omitir a seção', () => {
    const html = renderToStaticMarkup(MarketUnavailable({ title: 'Crédito Rural — SICOR/BCB' }))
    expect(html).toContain('Crédito Rural')
    expect(html).toContain('Dados indisponíveis')
    expect(html).toContain('Não há observações verificadas')
  })
})

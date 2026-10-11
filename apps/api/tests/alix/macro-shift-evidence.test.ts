import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MacroShiftService, hasVerifiedMacroComparison, macroShiftLabel, observedPriceChange, type MacroSnapshot } from '../../src/services/alix/MacroShiftService.js'
import { ProactiveService } from '../../src/services/alix/ProactiveService.js'
import { MarketBriefService, type MarketBrief } from '../../src/services/MarketBriefService.js'
import { DataSourceManager } from '../../src/services/DataSourceManager.js'

vi.mock('../../src/services/alix/push/AlixPushChannel.js', () => ({ getAlixPushChannel: () => ({ sendInsight: vi.fn().mockResolvedValue({ sent: false }) }) }))
vi.mock('../../src/services/alix/AlertRulesService.js', () => ({ getAlertRulesService: () => ({ listAll: () => [] }) }))
vi.mock('../../src/services/AlixService.js', () => ({ alixGetClientes: () => [] }))

let directory: string
let service: MacroShiftService
const observation = (reference: string, base = 'bcb:433:acumulado-12m') => ({ fonte: 'Banco Central do Brasil', referencia: reference, unidade: '% em 12 meses', base, estado: 'disponivel' as const, idadeSegundos: 0 })
const brief = (day = '2026-09-06', ipca = 5, reference = '2026-08-01'): MarketBrief => ({
  data: day, geradoEm: `${day}T12:00:00Z`, macro: { selic: null, ipca12m: ipca, cdi: null, igpm12m: null, dolar: null, euro: null, dolarVariacao24h: null },
  observacoesMacro: { ipca12m: observation(reference) }, topAltas: [], topBaixas: [], commodities: [], cambio: { usd: null, eur: null, cny: null, varUsd24h: null },
  expectativasAno: { selic: null, ipca: null, pib: null, dolar: null }, alertas: [], narrativaCurta: '', narrativaExecutiva: '', fonteOrigem: 'api',
})
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
  directory = await mkdtemp(join(tmpdir(), 'aletis-macro-evidence-'))
  service = new MacroShiftService(directory)
})
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await rm(directory, { recursive: true, force: true }) })

describe('comparações macro com evidência de base e período', () => {
  it('briefing publica a base acumulada e o provedor efetivamente usado no câmbio', async () => {
    const months = Array.from({ length: 12 }, (_, index) => ({ data: new Date(Date.UTC(2025, 8 + index, 1)).toISOString().slice(0, 10), valor: 0.1 }))
    const quotes = vi.fn().mockResolvedValue([{ moeda: 'USD-BRL', bid: 5.2, fonte: 'api', provedor: 'Frankfurter (ECB)', createDate: '2026-09-04', periodoVariacao: null }])
    const dsm = { bancoCentral: { getAllIndicators: async () => ({ ipca: { valor: 0.1, serie: 433, data: '2026-08-01', unidade: '% mensal', fonte: 'api', historico: months }, ptax: { cotacaoVenda: 5.1253, dataHoraCotacao: '2026-09-04 13:00:00', fonte: 'api' } }) }, conabPrecos: { getAllPrecos: async () => ({}) }, precos: { getAllCotacoes: async () => ({}) }, awesomeApi: { getCotacoesAtuais: quotes }, expectativas: { getExpectativasAnuais: async () => null }, nasaFirms: { getIncendiosBrasil: async () => [] } } as unknown as DataSourceManager
    const generated = await new MarketBriefService(dsm).generateBrief()
    expect(generated.observacoesMacro.ipca).toMatchObject({ base: 'bcb:433:mensal', unidade: '% mensal' })
    expect(generated.observacoesMacro.ipca12m).toMatchObject({ base: 'bcb:433:acumulado-12m', unidade: '% em 12 meses' })
    expect(generated.observacoesMacro.usd).toMatchObject({ fonte: 'Frankfurter (ECB)', base: 'cambio:USD-BRL:compra' })
    quotes.mockResolvedValue([])
    expect((await new MarketBriefService(dsm).generateBrief()).observacoesMacro.usd).toMatchObject({ fonte: 'BCB PTAX', base: 'cambio:USD-BRL:venda' })
  })

  it('rejeita a comparação real defeituosa de IPCA mensal 0,07 com acumulado 4,443', async () => {
    const previous = await service.snapshotIfNeeded(brief('2026-08-30', 0.07, '2026-07-01'))
    const legacy: MacroSnapshot = { ...previous!, schemaVersion: undefined, observacoes: undefined }
    expect(service.detectShifts(brief('2026-09-06', 4.443), [legacy])).toEqual([])
    previous!.observacoes!.ipca12m.base = 'bcb:433:mensal'
    expect(service.detectShifts(brief('2026-09-06', 4.443), [previous!])).toEqual([])
  })

  it('diferença entre taxas acumuladas aparece em pontos percentuais', async () => {
    const previous = await service.snapshotIfNeeded(brief('2026-08-30', 4, '2026-07-01'))
    const [shift] = service.detectShifts(brief(), [previous!])
    expect(shift).toMatchObject({ indicador: 'IPCA 12m', delta: 100, deltaPct: null, unidadeDelta: 'bp', janela: '7d' })
    expect(macroShiftLabel(shift)).toBe('+1,00 p.p.')
    expect(hasVerifiedMacroComparison(shift)).toBe(true)
    expect(shift.descricao).toContain('2026-08-30 e 2026-09-06')
  })

  it('não chama oito dias de sete nem compara com o próprio dia', async () => {
    const eightDays = await service.snapshotIfNeeded(brief('2026-08-29', 4, '2026-07-01'))
    const sameDay = await service.snapshotIfNeeded(brief('2026-09-06', 4, '2026-07-01'))
    expect(service.detectShifts(brief(), [eightDays!, sameDay!])).toEqual([])
  })

  it('não trata mesma publicação, fonte atrasada ou unidade distinta como movimento novo', async () => {
    const previous = await service.snapshotIfNeeded(brief('2026-08-30', 4, '2026-07-01'))
    expect(service.detectShifts(brief('2026-09-06', 5, '2026-07-01'), [previous!])).toEqual([])
    const stale = brief(); stale.observacoesMacro.ipca12m.estado = 'atrasado'
    expect(service.detectShifts(stale, [previous!])).toEqual([])
    const unit = brief(); unit.observacoesMacro.ipca12m.unidade = '% mensal'
    expect(service.detectShifts(unit, [previous!])).toEqual([])
  })

  it('câmbio exige mesmo provedor e lado da cotação', async () => {
    const previousBrief = brief('2026-09-05', 5)
    previousBrief.cambio.usd = 5
    previousBrief.observacoesMacro.usd = { fonte: 'BCB PTAX', referencia: '2026-09-05', unidade: 'R$/USD', base: 'cambio:USD-BRL:compra', estado: 'disponivel', idadeSegundos: 0 }
    const previous = await service.snapshotIfNeeded(previousBrief)
    const current = brief(); current.cambio.usd = 5.25
    current.observacoesMacro.usd = { ...previousBrief.observacoesMacro.usd, referencia: '2026-09-06' }
    expect(service.detectShifts(current, [previous!])[0]).toMatchObject({ indicador: 'USD/BRL', deltaPct: 5 })
    current.observacoesMacro.usd.base = 'cambio:USD-BRL:venda'
    expect(service.detectShifts(current, [previous!])).toEqual([])
    current.observacoesMacro.usd.base = previousBrief.observacoesMacro.usd.base
    current.observacoesMacro.usd.fonte = 'AwesomeAPI'
    expect(service.detectShifts(current, [previous!])).toEqual([])
    expect(observedPriceChange(0.3, 0.2)).toEqual({ delta: '0.10000000', percent: 50 })
  })

  it('commodity exige mesma praça, fonte e unidade', async () => {
    const item = { simbolo: 'SOJA', nome: 'Soja', preco: 100, variacao7d: null, unidade: 'R$/saca 60kg', fonte: 'CONAB (disponivel)', data: '2026-08-28', praca: 'Média das UFs: MT, PR', estado: 'disponivel' as const }
    const before = brief('2026-08-30', 5); before.commodities = [item]
    const previous = await service.snapshotIfNeeded(before)
    const current = brief(); current.commodities = [{ ...item, preco: 110, data: '2026-09-04' }]
    expect(service.detectShifts(current, [previous!])[0]).toMatchObject({ indicador: 'Soja', deltaPct: 10 })
    for (const mismatch of [{ praca: 'Média das UFs: PR' }, { fonte: 'CEPEA (disponivel)' }, { unidade: 'R$/kg' }]) {
      const changed = { ...current, commodities: [{ ...current.commodities[0], ...mismatch }] }
      expect(service.detectShifts(changed, [previous!])).toEqual([])
    }
  })

  it('acrescenta um único snapshot v2 e conserva literalmente a linha legada', async () => {
    const path = join(directory, 'macro-history.jsonl')
    const legacy = JSON.stringify({ data: '2026-09-06', ts: '2026-09-06T00:00:00Z', selic: 14, ipca12m: 0.07, cdi: 13.9, igpm12m: -0.22, usd: 5.1253, eur: null, commodities: {} }) + '\n'
    await writeFile(path, legacy)
    await Promise.all([service.snapshotIfNeeded(brief()), new MacroShiftService(directory).snapshotIfNeeded(brief())])
    expect((await readFile(path, 'utf8')).startsWith(legacy)).toBe(true)
    expect(service.loadHistory().filter(row => row.schemaVersion === 2)).toHaveLength(1)
  })

  it('leitura omite alertas antigos sem evidência, preservando arquivos e outros insights', async () => {
    await mkdir(join(directory, 'alix-insights'))
    const path = join(directory, 'alix-insights', '2026-09-06.jsonl')
    const content = [{ id: 'bad', ts: '2026-09-06T12:00:00Z', tipo: 'macro-shift', titulo: 'IPCA +6247,14%', payload: { valorAtual: 4.443, valorReferencia: 0.07 } }, { id: 'other', ts: '2026-09-06T12:00:00Z', tipo: 'crm-acao-hoje', titulo: 'Conferir documento' }].map(item => JSON.stringify(item)).join('\n')
    await writeFile(path, content)
    const proactive = new ProactiveService({} as any, directory)
    expect((await proactive.getRecentInsights()).map(item => item.id)).toEqual(['other'])
    expect(await readFile(path, 'utf8')).toBe(content)
  })

  it('o timer e uma nova instância emitem uma única vez a mesma comparação confirmada', async () => {
    const before = await service.snapshotIfNeeded(brief('2026-08-30', 4, '2026-07-01'))
    vi.spyOn(DataSourceManager, 'getInstance').mockReturnValue({} as any)
    vi.spyOn(MarketBriefService.prototype, 'generateBrief').mockResolvedValue(brief())
    vi.spyOn(MacroShiftService.prototype, 'loadHistory').mockReturnValue([before!])
    vi.spyOn(MacroShiftService.prototype, 'snapshotIfNeeded').mockResolvedValue(null)
    const proactive = new ProactiveService({} as any, directory)
    const broadcast = vi.fn(); proactive.events.on('insight', broadcast)
    expect((await proactive.evaluateAlertRules()).shifts).toBe(1)
    expect((await proactive.evaluateAlertRules()).shifts).toBe(0)
    expect((await new ProactiveService({} as any, directory).evaluateAlertRules()).shifts).toBe(0)
    expect(broadcast).toHaveBeenCalledTimes(1)
    const [saved] = await proactive.getRecentInsights()
    expect(saved.titulo).toContain('+1,00 p.p.')
    expect(saved.detalhes).not.toContain('DSCR')
  })
})

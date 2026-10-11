import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONAB_HEADER, CONAB_ROWS, NA_SOJA, NA_MILHO, NA_ALGODAO, CEPEA_SOJA, CEPEA_BOI, CEPEA_CAFE } from '../fixtures/market-source-fixtures.js'

const http = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('axios', () => ({ default: { create: () => http } }))
vi.mock('../../src/services/captcha/CloudflareBypass.js', () => ({ bypassCloudflareAndFetch: vi.fn().mockRejectedValue(new Error('offline')) }))
import { ConabPrecosService } from '../../src/services/sources/ConabPrecosService.js'
import { PrecosService, parseCepeaQuote, parseNoticiasAgricolasQuote } from '../../src/services/sources/PrecosService.js'
import { collectMarketPrices } from '../../src/services/MarketBriefService.js'
import type { DataSourceManager } from '../../src/services/DataSourceManager.js'

const manager = { updateSourceStatus: vi.fn() } as unknown as DataSourceManager
const csv = (header = CONAB_HEADER, rows = CONAB_ROWS, encoding: BufferEncoding = 'utf8') => Buffer.from([header, ...rows].join('\n'), encoding)

beforeEach(() => { vi.clearAllMocks(); http.get.mockReset(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-06T12:00:00Z')) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('contrato publicado pela CONAB', () => {
  it.each(['utf8', 'latin1'] as const)('lê id_produto e valor_produto_kg sem confundir o identificador com unidade (%s)', async encoding => {
    http.get.mockResolvedValue({ data: csv(CONAB_HEADER, CONAB_ROWS, encoding) })
    const data = await new ConabPrecosService(manager).getAllPrecos()
    expect(data.soja).toMatchObject({ precoMedio: 99, unidade: 'R$/saca 60kg', atualizadoEm: '2026-08-28', fonte: 'api' })
    expect(data.soja.historico?.map(p => [p.data, p.valor])).toEqual([['2026-08-21', '90.00'], ['2026-08-28', '99.00']])
    expect(data.milho.precoMedio).toBe(72)
    expect(data.cafe_arabica.precoMedio).toBe(1327.2)
    expect(data.algodao).toMatchObject({ precoMedio: 135, unidade: 'R$/arroba' })
    expect(data.trigo.precoMedio).toBe(87)
    expect(data.arroz).toMatchObject({ precoMedio: 85, unidade: 'R$/saca 50kg' })
    expect(data.feijao.precoMedio).toBe(390)
  })

  it('localiza cabeçalhos reordenados e conserva o conjunto de produtos/UF na comparação semanal', async () => {
    const permutation = [10, 0, 7, 3, 1, 9, 2, 4, 5, 6, 8]
    const reorder = (line: string) => permutation.map(i => line.split(';')[i]).join(';')
    const rows = [...CONAB_ROWS, CONAB_ROWS[0].replace('17-08-2026 - 21-08-2026', '10-08-2026 - 14-08-2026')]
    http.get.mockResolvedValue({ data: csv('\uFEFF' + reorder(CONAB_HEADER), rows.map(reorder)) })
    const data = await new ConabPrecosService(manager).getAllPrecos()
    expect(data.soja.historico?.map(p => p.data)).toEqual(['2026-08-21', '2026-08-28'])
  })

  it('não deduz kg de uma coluna genérica, não aceita unidade conflitante e rejeita cabeçalho duplicado', async () => {
    for (const data of [
      csv(CONAB_HEADER.replace('valor_produto_kg', 'valor')),
      csv(CONAB_HEADER + ';unidade', CONAB_ROWS.map(row => row + ';SACA')),
      csv(CONAB_HEADER + ';uf', CONAB_ROWS.map(row => row + ';PR')),
    ]) {
      http.get.mockResolvedValue({ data })
      await expect(new ConabPrecosService(manager).getAllPrecos()).rejects.toThrow('indisponíveis')
    }
  })

  it('compartilha uma coleta simultânea entre consumidores', async () => {
    http.get.mockResolvedValue({ data: csv() })
    const service = new ConabPrecosService(manager)
    const results = await Promise.all([service.getAllPrecos(), service.getAllPrecos(), service.getPreco('soja')])
    expect(results).toHaveLength(3)
    expect(http.get).toHaveBeenCalledTimes(1)
  })

  it('não altera pesos por linhas repetidas e descarta uma semana com preços conflitantes para a mesma observação', async () => {
    http.get.mockResolvedValueOnce({ data: csv(CONAB_HEADER, [...CONAB_ROWS, CONAB_ROWS[2]]) })
    expect((await new ConabPrecosService(manager).getAllPrecos()).soja.precoMedio).toBe(99)
    http.get.mockResolvedValueOnce({ data: csv(CONAB_HEADER, [...CONAB_ROWS, CONAB_ROWS[2].replace(';2,20', ';3,00')]) })
    const result = (await new ConabPrecosService(manager).getAllPrecos()).soja
    expect(result).toMatchObject({ precoMedio: 90, atualizadoEm: '2026-08-21' })
  })

  it('omite variação de 7 dias quando o id do produto muda, mesmo com as mesmas UFs e unidade', async () => {
    const rows = CONAB_ROWS.map(row => row.includes('24-08-2026') && row.startsWith('SOJA;') ? row.replace(';4744;', ';9999;') : row)
    http.get.mockResolvedValue({ data: csv(CONAB_HEADER, rows) })
    const service = new ConabPrecosService(manager)
    const dsm = { conabPrecos: service, precos: { getAllCotacoes: async () => ({}) } } as unknown as DataSourceManager
    const [price] = await collectMarketPrices(dsm, ['soja'])
    expect(price).toMatchObject({ precoAtual: 99, variacao7d: null })
    expect(price.historico).toHaveLength(1)
  })

  it('omite variação de 7 dias quando só existe uma observação 14 dias antes', async () => {
    const rows = CONAB_ROWS.map(row => row.replace('17-08-2026 - 21-08-2026', '10-08-2026 - 14-08-2026'))
    http.get.mockResolvedValue({ data: csv(CONAB_HEADER, rows) })
    const dsm = { conabPrecos: new ConabPrecosService(manager), precos: { getAllCotacoes: async () => ({}) } } as unknown as DataSourceManager
    const [price] = await collectMarketPrices(dsm, ['soja'])
    expect(price).toMatchObject({ precoAtual: 99, variacao7d: null })
    expect(price.historico).toHaveLength(2)
  })
})

describe('identificação de indicador, praça, unidade e data', () => {
  it('lê o título dentro do DIV info e distingue Paraná de Paranaguá', () => {
    expect(parseNoticiasAgricolasQuote('soja', NA_SOJA)).toMatchObject({ preco: 152.1, data: '04/09/2026', indicador: { unidade: 'R$/saca 60kg', praca: 'Paraná' } })
  })

  it('conserva unidade explícita de milho/algodão e nomeia a referência agregada sem inventar cidade', () => {
    expect(parseNoticiasAgricolasQuote('milho', NA_MILHO)).toMatchObject({ preco: 70.93, indicador: { unidade: 'R$/saca 60kg', praca: 'Referência agregada: Indicador do Milho Esalq/B3' } })
    expect(parseNoticiasAgricolasQuote('algodao', NA_ALGODAO)).toMatchObject({ preco: 439.98, indicador: { unidade: 'centavos R$/libra-peso' } })
    expect(parseNoticiasAgricolasQuote('soja', NA_MILHO)).toBeNull()
  })

  it('rejeita fonte ausente, moeda errada e unidade emprestada de outra seção', () => {
    expect(parseNoticiasAgricolasQuote('milho', NA_MILHO.replace(/Cepea|Esalq/gi, 'Mercado local'))).toBeNull()
    expect(parseNoticiasAgricolasQuote('soja', NA_SOJA.replace(/R\$/g, 'US$'))).toBeNull()
    expect(parseNoticiasAgricolasQuote('soja', NA_SOJA.replace(/Saca de 60 kg/g, '') + NA_MILHO)).toBeNull()
  })

  it('rejeita datas inexistentes/futuras, números ambíguos e percentual ausente', () => {
    for (const html of [
      NA_SOJA.replace(/04\/09\/2026/g, '31/02/2026'),
      NA_SOJA.replace(/04\/09\/2026/g, '31/12/2026'),
      NA_SOJA.replace('152,10', 'de 150,00 a 160,00'),
      NA_SOJA.replace('+0,28', 'n/d'),
    ]) expect(parseNoticiasAgricolasQuote('soja', html)).toBeNull()
  })

  it('lê imagenet-indicadorN, notas locais e a observação mais recente', () => {
    expect(parseCepeaQuote('soja', CEPEA_SOJA)).toMatchObject({ preco: 152.1, data: '04/09/2026', indicador: { praca: 'Paraná' } })
    expect(parseCepeaQuote('boi', CEPEA_BOI)).toMatchObject({ preco: 347.7, indicador: { unidade: 'R$/@', praca: 'Referência agregada: INDICADOR DO BOI GORDO CEPEA/ESALQ' } })
    expect(parseCepeaQuote('cafe', CEPEA_CAFE)).toMatchObject({ preco: 1659.93, indicador: { unidade: 'R$/saca 60kg' } })
    expect(parseCepeaQuote('cafe', CEPEA_CAFE.replace('CAFÉ ARÁBICA', 'CAFÉ ROBUSTA'))).toBeNull()
    expect(parseCepeaQuote('boi', CEPEA_BOI.replace('BOI GORDO CEPEA/ESALQ', 'BOI GORDO CEPEA/ESALQ - A PRAZO'))).toBeNull()
    expect(parseCepeaQuote('soja', '<title>CEPEA</title><p>Notícia com R$ 150,00 em 04/09/2026</p>')).toBeNull()
    expect(parseCepeaQuote('soja', CEPEA_SOJA.replace(/Reais por saca de 60 kg/g, 'Unidade não informada'))).toBeNull()
  })

  it('persiste a referência da coleta e compartilha requisições por commodity', async () => {
    http.get.mockResolvedValue({ data: NA_SOJA })
    const service = new PrecosService(manager)
    const [first, second] = await Promise.all([service.getCotacaoSoja(), service.getCotacaoSoja()])
    expect(first).toMatchObject({ preco: 152.1, data: '2026-09-04', fonte: 'api', praca: 'Paraná', fonteUrl: 'https://www.noticiasagricolas.com.br/cotacoes/soja' })
    expect(second).toEqual(first)
    expect(http.get).toHaveBeenCalledTimes(1)
    const history = await service.getHistoricoCommodity('soja', 30)
    expect(history.dados).toEqual([{ data: '2026-09-04', valor: 152.1 }])
  })

  it('recupera observação real com a data original e não devolve os antigos preços constantes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    http.get.mockResolvedValueOnce({ data: NA_SOJA }).mockRejectedValue(new Error('offline'))
    const service = new PrecosService(manager)
    const first = await service.getCotacaoSoja()
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    const second = await service.getAllCotacoes()
    expect(Object.keys(second)).toEqual(['soja'])
    expect(second.soja).toMatchObject({ preco: first.preco, data: first.data, coletadoEm: first.coletadoEm, fonte: 'cache', estado: 'atrasado' })
    await expect(new PrecosService(manager).getCotacaoMilho()).rejects.toThrow('nenhuma observação real')
    await expect(new PrecosService(manager).getAllCotacoes()).rejects.toThrow('nenhuma observação real')
  })
})

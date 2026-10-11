import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setJavaScriptEnabled: vi.fn(), setRequestInterception: vi.fn(), on: vi.fn(),
  setContent: vi.fn(), pdf: vi.fn(), close: vi.fn(),
}))
vi.mock('puppeteer', () => ({ default: { launch: async () => ({ connected: true, newPage: async () => mocks }) } }))
import { generateContratoPdf, generatePropostaPdf } from '../../src/services/PdfGenerator.js'

const contract = {
  id: 'ctr-fixture', titulo: 'Minuta de contrato', tipo: 'confissao_divida', dataGeracao: '2026-09-07T00:00:00.000Z',
  partes: { devedor: 'Pessoa sintética', credor: 'Credor sintético' }, valorTotal: '90071992547409.99',
  conteudoMarkdown: '# Título\n\n**Cláusula** com *destaque*.\n\n- Item\n', fundamentoLegal: ['Código Civil'],
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset().mockResolvedValue(undefined)
  mocks.pdf.mockResolvedValue(Buffer.from('%PDF-1.7 fixture'))
})

it('dados da capa, fundamentos e Markdown hostis permanecem texto, preservando formatação e dinheiro exato', async () => {
  const tag = '<img src="https://fixture.invalid/arquivo" onerror="alert(1)">'
  const script = '<script>fetch("https://fixture.invalid/")</script>'
  const response = await generateContratoPdf({
    ...contract, id: tag, titulo: script, tipo: tag,
    partes: { devedor: tag, credor: script }, fundamentoLegal: [tag],
    conteudoMarkdown: `${contract.conteudoMarkdown}\n${script}\n\n## ${tag}\n\n\`\`\`html\n${tag}\n\`\`\``,
  })
  expect(response.toString()).toBe('%PDF-1.7 fixture')
  const html = mocks.setContent.mock.calls[0][0] as string
  expect(html).not.toMatch(/<(?:script|img)\b/i)
  expect(html).toContain('&lt;img src=&quot;https://fixture.invalid/arquivo&quot;')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('<h1>Título</h1>')
  expect(html).toContain('<strong>Cláusula</strong> com <em>destaque</em>')
  expect(html).toContain('<li>Item</li>')
  expect(html).toContain('R$\u00a090.071.992.547.409,99')
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('desativa JavaScript e bloqueia rede/arquivos antes de carregar o HTML, mantendo recursos incorporados', async () => {
  await generateContratoPdf(contract)
  expect(mocks.setJavaScriptEnabled).toHaveBeenCalledWith(false)
  expect(mocks.setRequestInterception).toHaveBeenCalledWith(true)
  expect(mocks.setJavaScriptEnabled.mock.invocationCallOrder[0]).toBeLessThan(mocks.setContent.mock.invocationCallOrder[0])
  expect(mocks.setRequestInterception.mock.invocationCallOrder[0]).toBeLessThan(mocks.setContent.mock.invocationCallOrder[0])
  const handler = mocks.on.mock.calls.find(([event]) => event === 'request')![1] as (request: unknown) => void
  for (const url of ['https://fixture.invalid/image', 'http://127.0.0.1:3011/api/health', 'http://169.254.169.254/', 'file:///etc/passwd', 'ftp://fixture.invalid/file']) {
    const request = { url: () => url, continue: vi.fn(async () => undefined), abort: vi.fn(async () => undefined) }
    handler(request)
    expect(request.abort).toHaveBeenCalledWith('blockedbyclient')
    expect(request.continue).not.toHaveBeenCalled()
  }
  for (const url of ['data:image/png;base64,AAAA', 'data:font/woff2;base64,AAAA', 'blob:null/fixture', 'about:blank']) {
    const request = { url: () => url, continue: vi.fn(async () => undefined), abort: vi.fn(async () => undefined) }
    handler(request)
    expect(request.continue).toHaveBeenCalledTimes(1)
    expect(request.abort).not.toHaveBeenCalled()
  }
})

it('falha em aplicar a proteção não carrega HTML e fecha a página', async () => {
  mocks.setJavaScriptEnabled.mockRejectedValueOnce(new Error('Falha sintética de configuração'))
  await expect(generateContratoPdf(contract)).rejects.toThrow('Falha sintética de configuração')
  expect(mocks.setContent).not.toHaveBeenCalled()
  expect(mocks.pdf).not.toHaveBeenCalled()
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('falha do renderizador conserva fechamento da página', async () => {
  mocks.pdf.mockRejectedValueOnce(new Error('Falha sintética de PDF'))
  await expect(generateContratoPdf(contract)).rejects.toThrow('Falha sintética de PDF')
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('proposta também trata todos os campos textuais como texto e conserva o layout/valores legados', async () => {
  const tag = '<img src="https://fixture.invalid/arquivo" onerror="alert(1)">'
  const script = '<script>fetch("https://fixture.invalid/")</script>'
  await generatePropostaPdf({
    id: tag, titulo: script, tipo: tag, clienteNome: tag, credor: script,
    valorDivida: 100.01, valorProposta: 90.01, descontoPercentual: 10,
    itens: [{ descricao: tag, valor: 90.01, tipo: script, data: tag }],
    condicoes: [script], fundamentacao: tag, observacoes: script,
    dataCriacao: tag, dataValidade: script,
  })
  const html = mocks.setContent.mock.calls[0][0] as string
  expect(html).not.toMatch(/<(?:script|img)\b/i)
  expect(html).toContain('&lt;img src=&quot;https://fixture.invalid/arquivo&quot;')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('<table>')
  expect(html).toContain('100,01')
  expect(html).toContain('90,01')
  expect(html).toContain('Economia (10.0%)')
  expect(mocks.setJavaScriptEnabled).toHaveBeenCalledWith(false)
  expect(mocks.setRequestInterception).toHaveBeenCalledWith(true)
  expect(mocks.on).toHaveBeenCalledWith('request', expect.any(Function))
  expect(mocks.setRequestInterception.mock.invocationCallOrder[0]).toBeLessThan(mocks.setContent.mock.invocationCallOrder[0])
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

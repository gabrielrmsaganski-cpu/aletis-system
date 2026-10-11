import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer, get } from 'node:http'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer, { type Browser } from 'puppeteer'
import { extractText } from 'unpdf'

// Prova isolada: não usa .env, banco, API ALETIS ou documentos de clientes.
assert.equal(process.env.DATABASE_URL, undefined, 'Execute com env -i; esta prova não aceita DATABASE_URL.')
const directory = await mkdtemp(join(tmpdir(), 'aletis-pdf-real-'))
const startedAt = new Date().toISOString()
const serverRequests: string[] = []
let controlRequests = 0
const server = createServer((request, response) => {
  if (request.url === '/control') controlRequests++
  else serverRequests.push(request.url || '/')
  response.writeHead(200, { 'content-type': 'image/png' })
  response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP8sAAAAASUVORK5CYII=', 'base64'))
})
await new Promise<void>((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const address = server.address()
assert(address && typeof address === 'object')
const origin = `http://127.0.0.1:${address.port}`
await new Promise<void>((resolve, reject) => {
  get(`${origin}/control`, response => { response.resume(); response.once('end', resolve) }).once('error', reject)
})
assert.equal(controlRequests, 1)

const browsers = new Set<Browser>()
const observations: Array<{
  javaScriptEnabled?: boolean; unsafeElements?: number; injectedScriptValue?: unknown;
  originalRenderRequests: number; probeRequests: string[]; failures: string[]; closed: boolean;
}> = []
const outputs: Array<Record<string, unknown>> = []
const realLaunch = puppeteer.launch.bind(puppeteer)
let browserVersion = ''
let failure: Error | undefined
let browserClosed = false

puppeteer.launch = async options => {
  // Delega ao Chromium real; somente observa instância/páginas para inspeção e fechamento.
  const browser = await realLaunch(options)
  browsers.add(browser)
  browserVersion = await browser.version()
  const newPage = browser.newPage.bind(browser)
  browser.newPage = async () => {
    const page = await newPage()
    const state: (typeof observations)[number] = { originalRenderRequests: 0, probeRequests: [], failures: [], closed: false }
    observations.push(state)
    let probing = false
    page.on('request', request => {
      if (probing) state.probeRequests.push(request.url())
      else state.originalRenderRequests++
    })
    page.on('requestfailed', request => state.failures.push(request.failure()?.errorText || 'unknown'))
    page.on('close', () => { state.closed = true })
    const render = page.pdf.bind(page)
    page.pdf = async options => {
      state.javaScriptEnabled = page.isJavaScriptEnabled()
      const dom = await page.evaluate(() => ({
        unsafeElements: document.querySelectorAll('script,img,iframe,object,embed,link').length,
        injectedScriptValue: (globalThis as { __aletisPdfInjected?: unknown }).__aletisPdfInjected ?? null,
      }))
      Object.assign(state, dom)
      assert.equal(state.javaScriptEnabled, false)
      assert.equal(state.unsafeElements, 0, 'HTML cadastral não pode criar elementos ativos.')
      assert.equal(state.injectedScriptValue, null)
      assert.equal(state.originalRenderRequests, 0)
      const bytes = await render(options)

      // Após capturar o PDF original, ensaia as defesas da mesma página com HTML ativo.
      // Os bytes retornados continuam sendo o documento real, anterior a esta sonda.
      probing = true
      const blocked = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('A sonda HTTP não foi bloqueada.')), 5_000)
        page.once('requestfailed', () => { clearTimeout(timer); resolve() })
      })
      // networkidle0 não é um sinal confiável para uma imagem abortada pelo Inspector.
      await page.setContent(`<img src="${origin}/guard-image"><script>window.__aletisPdfInjected=true;fetch('${origin}/guard-script')</script>`, { waitUntil: 'domcontentloaded' })
      await blocked
      assert.equal(await page.evaluate(() => (globalThis as { __aletisPdfInjected?: unknown }).__aletisPdfInjected ?? null), null)
      assert.deepEqual(state.probeRequests, [`${origin}/guard-image`])
      assert(state.failures.some(value => value.includes('ERR_BLOCKED_BY_CLIENT')))
      return bytes
    }
    return page
  }
  return browser
}

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
async function inspectPdf(name: string, pdf: Buffer, expected: string[]) {
  const path = join(directory, `${name}.pdf`)
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
  assert(pdf.length > 10_000, 'Renderização deve conter PDF real e fontes.')
  await writeFile(path, pdf, { mode: 0o600 })
  const parsed = await extractText(new Uint8Array(pdf), { mergePages: true })
  assert(parsed.totalPages >= 1 && parsed.totalPages <= 10)
  const text = normalize(parsed.text)
  for (const fragment of expected) assert(text.includes(normalize(fragment)), `Texto ausente em ${name}: ${fragment}`)
  await writeFile(join(directory, `${name}.txt`), parsed.text, { mode: 0o600 })
  outputs.push({ name, path, bytes: pdf.length, pages: parsed.totalPages, sha256: createHash('sha256').update(pdf).digest('hex'), verifiedText: expected })
}

try {
  const { generateContratoPdf, generatePropostaPdf } = await import('../src/services/PdfGenerator.js')
  const hostileImage = `<img src="${origin}/hostile-name" onerror="window.__aletisPdfInjected=true">`
  const hostileScript = '<script>window.__aletisPdfInjected=true</script>'
  const contract = await generateContratoPdf({
    id: 'contrato-sintetico-real-01', titulo: 'Contrato sintético <b>literal</b>', tipo: 'confissao_divida', dataGeracao: '2026-09-07T12:00:00.000Z',
    partes: { devedor: `Nome hostil ${hostileImage}`, credor: `Credor & Filhos ${hostileScript}` },
    valorTotal: '90071992547409.99',
    conteudoMarkdown: '# Minuta sintética\n\n**Parcela de exemplo:** R$ 123,45.\n\nNome literal no documento: <b>sem HTML ativo</b>.\n\n- Condição de teste\n',
    fundamentoLegal: [`Referência sintética ${hostileScript}`],
  })
  await inspectPdf('contrato', contract, ['ALETIS', 'Contrato sintético <b>literal</b>', 'R$ 90.071.992.547.409,99', 'R$ 123,45', '<img src=', '<script>window.__aletisPdfInjected=true</script>', 'Credor & Filhos'])
  const proposal = await generatePropostaPdf({
    id: 'proposta-sintetica-real-01', titulo: 'Proposta sintética <b>literal</b>', tipo: 'renegociacao',
    clienteNome: `Nome hostil ${hostileImage}`, credor: `Credor & Filhos ${hostileScript}`,
    valorDivida: 100.01, valorProposta: 90.01, descontoPercentual: 10,
    itens: [{ descricao: `Item literal ${hostileImage}`, valor: 90.01, tipo: 'parcela', data: '2026-10-01' }],
    condicoes: ['Condição sintética <b>literal</b>'], fundamentacao: `Fundamento sintético ${hostileScript}`, observacoes: 'Documento apenas para validação isolada.',
    dataCriacao: '2026-09-07', dataValidade: '2026-10-07',
  })
  await inspectPdf('proposta', proposal, ['ALETIS', 'Proposta sintética <b>literal</b>', 'R$ 100,01', 'R$ 90,01', '<img src=', '<script>window.__aletisPdfInjected=true</script>', 'Credor & Filhos'])
  assert.equal(browsers.size, 1, 'Os dois geradores devem reaproveitar o singleton.')
  assert.equal(observations.length, 2)
  assert(observations.every(page => page.closed), 'Cada gerador deve fechar sua página.')
  assert.deepEqual(serverRequests, [], 'Nenhuma requisição de nome hostil ou sonda pode atingir o servidor HTTP.')
} catch (error) {
  failure = error as Error
} finally {
  puppeteer.launch = realLaunch
  await Promise.all([...browsers].map(browser => browser.close()))
  browserClosed = [...browsers].every(browser => !browser.connected)
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

const evidence = {
  startedAt, completedAt: new Date().toISOString(), success: !failure,
  renderer: 'Puppeteer real usando services/PdfGenerator.ts', browserVersion, browserInstances: browsers.size, browserClosed,
  server: { binding: '127.0.0.1', controlRequests, rendererRequestsReceived: serverRequests.length },
  observations, outputs, ...(failure ? { error: failure.message } : {}),
}
await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 })
process.stdout.write(`${JSON.stringify({ evidencePath: join(directory, 'evidence.json'), ...evidence }, null, 2)}\n`)
if (failure) throw failure

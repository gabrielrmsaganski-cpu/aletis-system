// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { renderInline } from '../../../web/src/components/alix/AlixInlineMarkdown.tsx'

let root: ReturnType<typeof createRoot>
let element: HTMLDivElement
const sourceUrl = 'https://drive.google.com/file/d/synthetic-source/view'
const source = `**[S2] [Segundo projeto — PDF](${sourceUrl})**`
async function render(text: string, table = false) {
  const content = table
    ? React.createElement('table', {}, React.createElement('tbody', {}, React.createElement('tr', {}, React.createElement('td', {}, renderInline(text)))))
    : React.createElement('p', {}, renderInline(text))
  await act(async () => root.render(content))
}
beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede proibida nesta suíte') }))
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
})
afterEach(async () => {
  await act(async () => root.unmount())
  element.remove()
  vi.unstubAllGlobals()
})

it.each([false, true])('torna a fonte real em negrito clicável no corpo e nas células da tabela (tabela: %s)', async table => {
  await render(source, table)
  const link = element.querySelector('strong a')!
  expect(link.getAttribute('href')).toBe(sourceUrl)
  expect(link.textContent).toBe('Segundo projeto — PDF')
  expect(element.textContent).toBe('[S2] Segundo projeto — PDF')
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  expect(link.className).toBe('text-aletis-verde hover:underline')
  expect(element.querySelector('strong')?.className).toBe('font-semibold text-aletis-grafite-escuro dark:text-white')
  if (table) expect(element.querySelector('td strong a')).not.toBeNull()
})

it('preserva negrito, itálico e link combinados sem mostrar o Markdown ao consultor', async () => {
  await render(`**_Confira [a fonte](${sourceUrl})_**`)
  expect(element.querySelector('strong em a')?.getAttribute('href')).toBe(sourceUrl)
  expect(element.textContent).toBe('Confira a fonte')
  expect(element.querySelector('em')?.className).toBe('italic text-aletis-grafite-medio dark:text-white/70')
})

it('código mantém os marcadores e destinos literais, inclusive dentro de negrito', async () => {
  await render(`\`${source}\` e **\`[comando](javascript:executar)\`**`)
  expect(element.querySelectorAll('a')).toHaveLength(0)
  expect(element.querySelectorAll('code')).toHaveLength(2)
  expect(element.querySelector('code')?.textContent).toBe(source)
  expect(element.querySelector('strong code')?.textContent).toBe('[comando](javascript:executar)')
  expect(element.querySelector('code')?.className).toContain('font-mono')
})

it('aceita HTTP(S) e os caminhos usados pela aplicação', async () => {
  const urls = ['https://example.test/doc', 'http://example.test/doc', '/api/alix/documents/doc/download', './documentos/doc', '../clientes/id', 'clientes/id', '?clienteId=id', '#fontes']
  await render(urls.map((url, index) => `[Fonte ${index}](${url})`).join(' '))
  expect([...element.querySelectorAll('a')].map(link => link.getAttribute('href'))).toEqual(urls)
})

it('preserva espaços percent-encoded dentro de nomes de arquivos e parâmetros válidos', async () => {
  const urls = ['/api/docs/Projeto%20Fenner.pdf', 'https://drive.google.com/file/d/synthetic/view?nome=Projeto%20A', './documentos/Relatorio%20A.pdf']
  await render(urls.map((url, index) => `**[Fonte ${index}](${url})**`).join(' '))
  expect([...element.querySelectorAll('strong a')].map(link => link.getAttribute('href'))).toEqual(urls)
  expect(element.textContent).toBe('Fonte 0 Fonte 1 Fonte 2')
})

it('exibe somente o rótulo de protocolos executáveis ou destinos relativos a outro servidor', async () => {
  const urls = ['javascript:executar', 'JaVaScRiPt:executar', 'data:text/html,malicioso', 'vbscript:executar', 'file:///etc/hosts', '//evil.test/path', '\\evil.test/path', 'https:\\evil.test/path', 'http://']
  await render(urls.map((url, index) => `**[Fonte ${index}](${url})**`).join(' | '))
  expect(element.querySelectorAll('a')).toHaveLength(0)
  expect(element.textContent).toBe(urls.map((_, index) => `Fonte ${index}`).join(' | '))
})

it('rejeita controles, espaços e protocolos ofuscados sem criar href', async () => {
  const urls = ['java\tscript:executar', '\u0000javascript:executar', ' https://example.test', 'https://example.test/white space', 'java%0Ascript:executar', '%6aavascript%3Aexecutar', '%2F%2Fevil.test/path', '/%5Cevil.test', 'javascript&#58;executar', 'javascript&colon;executar', 'java\u200bscript:executar', '%20https://example.test', 'https://example.test/%20', 'https://example.test/a%09b']
  await render(urls.map((url, index) => `[Fonte ${index}](${url})`).join(' | '))
  expect(element.querySelectorAll('a')).toHaveLength(0)
  expect(element.textContent).toBe(urls.map((_, index) => `Fonte ${index}`).join(' | '))
})

it('texto e rótulos de origem não são interpretados como HTML', async () => {
  await render(`<script>alerta</script> [<img src=x onerror=executar>](${sourceUrl})`)
  expect(element.querySelectorAll('script, img')).toHaveLength(0)
  expect(element.querySelector('a')?.textContent).toBe('<img src=x onerror=executar>')
  expect(element.textContent).toContain('<script>alerta</script>')
})

it('marcações excessivas permanecem limitadas e conservam o texto', async () => {
  await render(`${'**_'.repeat(200)}Fonte disponível${'_**'.repeat(200)}`)
  expect(element.textContent).toContain('Fonte disponível')
  let maximum = 0
  for (const node of element.querySelectorAll('strong, em')) {
    let depth = 0
    for (let parent: Element | null = node; parent && parent !== element; parent = parent.parentElement) {
      if (['STRONG', 'EM'].includes(parent.tagName)) depth++
    }
    maximum = Math.max(maximum, depth)
  }
  expect(maximum).toBeLessThanOrEqual(6)
})

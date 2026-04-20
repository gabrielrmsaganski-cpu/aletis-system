// Script rápido: valida o scraping CEPEA ponta-a-ponta com o bypass CF.
// Uso: pnpm --filter @aletis/api exec tsx --env-file=../../.env scripts/test-cepea-scrape.ts

import {
  bypassCloudflareAndFetch,
  closeCloudflareBypassBrowser,
  getCloudflareSessionCache,
} from '../src/services/captcha/CloudflareBypass.js'
import * as cheerio from 'cheerio'

const URLS: Record<string, string> = {
  soja: 'https://www.cepea.esalq.usp.br/br/indicador/soja.aspx',
  milho: 'https://www.cepea.esalq.usp.br/br/indicador/milho.aspx',
  boi: 'https://www.cepea.esalq.usp.br/br/indicador/boi-gordo.aspx',
  cafe: 'https://www.cepea.esalq.usp.br/br/indicador/cafe.aspx',
  algodao: 'https://www.cepea.esalq.usp.br/br/indicador/algodao.aspx',
}

function parseIndicador(html: string): { preco: number; variacao: number; data: string } {
  const $ = cheerio.load(html)
  const parseNumber = (txt: string): number => {
    const n = parseFloat(
      txt
        .replace(/R\$|\s/g, '')
        .replace(/%/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
    )
    return isNaN(n) ? 0 : n
  }
  let preco = 0
  let variacao = 0
  let data = ''
  const rows = $('#imagenet table tr, table#imagenet tr')
  if (rows.length > 1) {
    const cells = rows.eq(1).find('td')
    if (cells.length >= 3) {
      data = cells.eq(0).text().trim()
      preco = parseNumber(cells.eq(1).text())
      variacao = parseNumber(cells.eq(2).text())
    }
  }
  if (preco <= 0) {
    const m = $('body').text().match(/R\$\s*([\d\.]+,\d{2})/)
    if (m) preco = parseNumber(m[1])
  }
  return { preco, variacao, data }
}

async function main() {
  const alvos = Object.entries(URLS)
  console.log(`\n=== Teste CEPEA: ${alvos.length} commodities ===\n`)

  for (const [commodity, url] of alvos) {
    console.log(`--- ${commodity.toUpperCase()} ---`)
    const t0 = Date.now()
    try {
      const result = await bypassCloudflareAndFetch(url, {
        maxChallengeWaitMs: 20_000,
        totalTimeoutMs: 45_000,
        readySelector: '#imagenet',
      })
      const { preco, variacao, data } = parseIndicador(result.html)
      const tot = Date.now() - t0
      const status = preco > 0 ? 'OK' : 'FALHOU (parser)'
      console.log(
        `${status} — preco=R$ ${preco} | var=${variacao}% | data=${data} | ${tot}ms | turnstile=${result.turnstileResolvido} | cookies=${result.cookies.length}b`
      )
      if (preco <= 0) {
        console.log(`   HTML head: ${result.html.slice(0, 200)}...`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`FALHOU — ${msg}`)
    }
  }

  console.log('\n=== Sessões CF em cache ===')
  console.log(JSON.stringify(getCloudflareSessionCache(), null, 2))

  await closeCloudflareBypassBrowser()
  console.log('\n=== Done ===')
}

main().catch((err) => {
  console.error('ERRO FATAL:', err)
  process.exit(1)
})

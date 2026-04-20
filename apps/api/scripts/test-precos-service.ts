// Valida PrecosService com fallback NoticiasAgricolas → CEPEA → AgroLink
import { DataSourceManager } from '../src/services/DataSourceManager.js'
import { closeCloudflareBypassBrowser } from '../src/services/captcha/CloudflareBypass.js'

async function main() {
  const manager = DataSourceManager.getInstance()
  const svc = manager.precos

  console.log('\n=== PrecosService.getAllCotacoes ===\n')
  const t0 = Date.now()
  const result = await svc.getAllCotacoes()
  const dt = Date.now() - t0

  for (const [key, cot] of Object.entries(result)) {
    const sinal = cot.variacao >= 0 ? '+' : ''
    console.log(
      `${key.padEnd(8)} | R$ ${cot.preco.toFixed(2).padStart(10)} | ${sinal}${cot.variacao.toFixed(2)}% | ${cot.data} | ${cot.fonte}`
    )
  }
  console.log(`\nTotal: ${dt}ms`)

  console.log('\n=== Fontes status ===')
  const statuses = manager.getSourceStatus().filter((s) => s.nome.startsWith('cepea_'))
  for (const s of statuses) {
    console.log(`  ${s.nome}: ${s.status} | ${s.latenciaMs}ms | erro: ${s.ultimoErro || '-'}`)
  }

  await closeCloudflareBypassBrowser()
  console.log('\n=== Done ===')
}

main().catch((e) => {
  console.error('ERR:', e)
  process.exit(1)
})

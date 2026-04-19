/**
 * Orquestrador de refresh SICAR — ponto único para o cron.
 *
 * Roda em 4 etapas, cada uma em subprocesso isolado para evitar contaminação
 * de estado (singletons, cache do CaptchaSolver, etc):
 *
 *   1. download-sicar.ts  → /tmp/sicar/<UF>/ (ou skip se SICAR offline)
 *   2. ingest-sicar.ts    → apps/api/storage/prospeccao/sicar-imoveis.json
 *   3. POST /api/prospeccao/sicar/reload  (hot-swap do índice na API viva)
 *   4. POST /api/clientes/enriquecer-car/backfill  (re-enriquece clientes pendentes)
 *
 * Filosofia: cada etapa é best-effort — se download falhar (UF específica),
 * seguimos; se ingest falhar, abortamos sem mexer no índice vivo; se reload
 * da API falhar (API down), logamos mas não marcamos refresh como fail (a
 * API vai recarregar sozinha no próximo restart).
 *
 * Exit codes:
 *   0  — tudo ok
 *   10 — SICAR offline (propagado do download — isso é esperado durante manutenção)
 *   30 — download falhou parcial/total
 *   40 — ingest falhou
 */
import { spawnSync } from 'child_process'
import axios from 'axios'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const API_URL = process.env.ALETIS_API_URL || 'http://localhost:3001'
const APP_DIR = join(__dirname, '..') // apps/api/
const SCRIPTS_DIR = __dirname

const log = (msg: string) => console.log(`[refresh-sicar ${new Date().toISOString()}] ${msg}`)

function runScript(script: string, extraEnv: Record<string, string> = {}): number {
  log(`=== ${script} ===`)
  const r = spawnSync('pnpm', ['exec', 'tsx', join(SCRIPTS_DIR, script)], {
    cwd: APP_DIR,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })
  if (r.error) {
    log(`falha ao executar ${script}: ${r.error.message}`)
    return 1
  }
  return r.status ?? 1
}

async function reloadApi(): Promise<boolean> {
  try {
    const res = await axios.post(`${API_URL}/api/prospeccao/sicar/reload`, {}, { timeout: 30_000 })
    log(`API reload: ${res.status} · ${JSON.stringify(res.data?.data?.stats || res.data)}`)
    return res.status === 200
  } catch (err: any) {
    log(`API reload falhou (não crítico): ${err?.message || err}`)
    return false
  }
}

async function backfillClientes(): Promise<boolean> {
  try {
    const res = await axios.post(
      `${API_URL}/api/clientes/enriquecer-car/backfill`,
      {},
      { timeout: 60_000 },
    )
    log(`backfill clientes: ${res.status} · ${JSON.stringify(res.data?.data || res.data)}`)
    return res.status === 200
  } catch (err: any) {
    log(`backfill clientes falhou (não crítico): ${err?.message || err}`)
    return false
  }
}

async function main() {
  // 1. Download
  const dl = runScript('download-sicar.ts')
  if (dl === 10) {
    log('SICAR offline — encerrando ciclo sem alterar índice')
    process.exit(10)
  }
  if (dl !== 0) {
    log(`download-sicar exit=${dl} — abortando (índice atual preservado)`)
    process.exit(30)
  }

  // 2. Ingest
  const ing = runScript('ingest-sicar.ts')
  if (ing !== 0) {
    log(`ingest-sicar exit=${ing} — índice NÃO foi regravado (mantemos o anterior)`)
    process.exit(40)
  }

  // 3. Reload (best effort)
  await reloadApi()

  // 4. Backfill clientes (best effort)
  await backfillClientes()

  log('refresh completo')
}

main().catch((err) => {
  console.error('[refresh-sicar] erro fatal:', err)
  process.exit(1)
})

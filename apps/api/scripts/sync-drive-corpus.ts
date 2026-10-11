import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { DriveCorpusIngestionService } from '../src/services/google-workspace/DriveCorpusIngestionService.js'

const { values } = parseArgs({ options: { 'private-root': { type: 'string' }, tenant: { type: 'string' }, daemon: { type: 'boolean', default: false }, once: { type: 'boolean', default: false }, 'max-events': { type: 'string', default: '1000' } }, strict: true })
if (!values['private-root']) throw new Error('Informe --private-root com o diretório privado de inventário e recibos.')
const maximum = Number(values['max-events'])
if (!Number.isInteger(maximum) || maximum < 1 || maximum > 10000) throw new Error('--max-events deve estar entre 1 e 10000.')
let fixturePool: pg.Pool | undefined
if (process.env.ALETIS_DRIVE_CORPUS_FIXTURE_FILE) {
  const url = (await readFile(process.env.ALETIS_DRIVE_CORPUS_FIXTURE_FILE, 'utf8')).trim()
  const parsed = new URL(url)
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '55436') throw new Error('A fixture deve usar a instância descartável local na porta 55436.')
  fixturePool = new pg.Pool({ connectionString: url })
}
const service = new DriveCorpusIngestionService({ privateRoot: values['private-root'], tenantId: values.tenant || process.env.ALETIS_TENANT_ID || process.env.DEFAULT_TENANT_ID || 'default', pool: fixturePool, maxEventsPerRun: maximum })
let stopped = false
let wake: (() => void) | undefined
const stop = () => { stopped = true; wake?.() }
process.on('SIGTERM', stop); process.on('SIGINT', stop)
try {
  do {
    let remaining = false
    try { const result = await service.syncOnce(); remaining = result.remaining && (result.processed > 0 || (result.metadataProcessed || 0) > 0) && !result.busy; process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...result })}\n`) }
    catch (error) {
      // Não publica caminhos privados, conteúdo documental, URL de conexão ou credenciais no log.
      process.stderr.write(`${JSON.stringify({ at: new Date().toISOString(), status: 'sync_failed', code: (error as { code?: string }).code || 'INGESTION_ERROR' })}\n`)
      if (!values.daemon || values.once) { process.exitCode = 1; break }
    }
    if (!values.daemon || values.once || stopped) break
    await new Promise<void>(resolve => { const timer = setTimeout(resolve, remaining ? 1000 : 30000); wake = () => { clearTimeout(timer); resolve() } })
    wake = undefined
  } while (!stopped)
} finally { if (fixturePool) await fixturePool.end() }
// O pool compartilhado de produção mantém sockets abertos; ao terminar --once, encerra somente este processo de manutenção.
if (!values.daemon || values.once || stopped) process.exit(process.exitCode || 0)

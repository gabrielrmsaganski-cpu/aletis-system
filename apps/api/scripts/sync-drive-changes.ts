import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { DriveChangesService } from '../src/services/google-workspace/DriveChangesService.js'
import { DriveChangesGoogleSource } from '../src/services/google-workspace/DriveChangesSource.js'
import { readDriveChangesScope } from '../src/services/google-workspace/DriveChangesScope.js'
import { driveChangesScopeSchema } from '../src/services/google-workspace/DriveChangesTypes.js'

process.umask(0o077)
const { values } = parseArgs({ options: {
  'private-root': { type: 'string' }, tenant: { type: 'string' }, 'scope-file': { type: 'string' },
  once: { type: 'boolean', default: false }, daemon: { type: 'boolean', default: false },
}, strict: true })
if (!values['private-root']) throw new Error('Informe --private-root com o inventário privado imutável.')
const tenantId = values.tenant || process.env.ALETIS_TENANT_ID || process.env.DEFAULT_TENANT_ID || 'default'
// O provider OAuth usa este mesmo tenant durante toda a execução do processo.
process.env.ALETIS_TENANT_ID = tenantId
const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim()
if (!values['scope-file'] && !process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL para ler os vínculos atuais ou informe --scope-file para uma fixture.')
const pool = values['scope-file'] ? null : new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, options: '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000' })
const controller = new AbortController()
const service = new DriveChangesService({
  privateRoot: values['private-root'], tenantId,
  source: new DriveChangesGoogleSource({ abortSignal: controller.signal }),
  getScope: async () => values['scope-file'] ? driveChangesScopeSchema.parse(JSON.parse(await readFile(values['scope-file'], 'utf8'))) : readDriveChangesScope(pool!, tenantId, rootId ? [rootId] : []),
})
let stopped = false, wake: (() => void) | undefined
const stop = () => { stopped = true; controller.abort(); wake?.() }
process.on('SIGTERM', stop); process.on('SIGINT', stop)
try {
  do {
    let retryAfterMs = 30000
    try {
      const result = await service.syncOnce()
      retryAfterMs = result.retryAfterMs
      process.stdout.write(JSON.stringify({ at: new Date().toISOString(), ...result }) + '\n')
      if ('status' in result && ['retry', 'awaiting_authorization'].includes(result.status) && (!values.daemon || values.once)) process.exitCode = 1
    } catch {
      process.stderr.write(JSON.stringify({ at: new Date().toISOString(), status: 'retry', errorCode: 'PRODUCER_UNAVAILABLE' }) + '\n')
      if (!values.daemon || values.once) process.exitCode = 1
    }
    if (!values.daemon || values.once || stopped) break
    await new Promise<void>(resolve => { const timer = setTimeout(resolve, retryAfterMs); wake = () => { clearTimeout(timer); resolve() } })
    wake = undefined
  } while (!stopped)
} finally { await pool?.end() }

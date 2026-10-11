/** Manutenção auditável. `prepare` só lê; `apply` exige dump recente, API parada e opt-in explícito. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { access, copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import pg from 'pg'
import { applyIdentityMerge, prepareIdentityMerge, identityPlanFingerprint, type IdentityMergePlan } from '../src/services/core/ClientIdentityMergeService.js'
import { serializar } from '../src/services/alix/memory/AlixMemoryService.js'
import type { MemoriaCliente } from '../src/services/alix/memory/types.js'

const [command, planPathRaw, ...args] = process.argv.slice(2)
const planPath = resolve(planPathRaw || '')
if (!['prepare', 'apply', 'sync-caches', 'recover-caches'].includes(command) || !planPathRaw) throw new Error('Uso: prepare PLANO ORIGEM CANONICO | apply PLANO DUMP STORAGE | sync-caches RESULTADO STORAGE | recover-caches PLANO DIRETORIO_OPERACAO STORAGE')
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const exists = async (path: string) => { try { await access(path); return true } catch { return false } }
const privateJson = async (path: string, value: unknown) => { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); const temporary = `${path}.${process.pid}.tmp`; try { await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); await rename(temporary, path) } finally { await rm(temporary, { force: true }) } }
interface CacheMutation { relativePath: string; beforeHash: string | null; content: string | null; afterHash: string | null }
async function runtimeStopped() {
  const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const runtime = list.find((item: any) => item.name === 'aletis-api')
  if (!runtime || runtime.pm2_env?.status !== 'stopped') throw new Error('A API aletis-api precisa estar parada na janela de manutenção.')
}
async function storagePath(input: string) {
  const path = await realpath(resolve(input || ''))
  if (!path.startsWith('/root/ALETIS/') || !path.endsWith('/apps/api/storage')) throw new Error('Storage de manutenção inválido.')
  return path
}
async function synchronize(storage: string, mutations: CacheMutation[]) {
  for (const item of mutations) {
    if (!/^(alix-memory|alix-missions|alix-sessions)\/[a-zA-Z0-9._/-]+$/.test(item.relativePath) || item.relativePath.split('/').includes('..')) throw new Error('Caminho de cache inválido.')
    const path = join(storage, item.relativePath)
    const currentHash = await exists(path) ? hash(await readFile(path)) : null
    if (currentHash === item.afterHash) continue
    if (currentHash !== item.beforeHash) throw new Error(`Cache mudou após preparação: ${item.relativePath}`)
    if (item.content === null) { await rm(path, { force: true }); continue }
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    const temporary = `${path}.identity-merge.tmp`
    await writeFile(temporary, item.content, { mode: 0o600 }); await rename(temporary, path)
  }
}

if (command === 'sync-caches') {
  await runtimeStopped()
  const result = JSON.parse(await readFile(planPath, 'utf-8'))
  if (!result.committed || !Array.isArray(result.cacheMutations)) throw new Error('Resultado de consolidação inválido.')
  await synchronize(await storagePath(args[0]), result.cacheMutations)
  process.stdout.write(JSON.stringify({ synchronized: result.cacheMutations.length, operationId: result.operationId }) + '\n')
} else {
  if (process.env.ALETIS_PG_ENABLED !== '1' || !process.env.DATABASE_URL) throw new Error('Consolidação exige PostgreSQL habilitado explicitamente.')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  try {
    if (command === 'recover-caches') {
      await runtimeStopped()
      const plan: IdentityMergePlan = JSON.parse(await readFile(planPath, 'utf-8'))
      if (identityPlanFingerprint(plan) !== plan.fingerprint) throw new Error('Plano alterado.')
      const operationDirectory = await realpath(resolve(args[0] || ''))
      if (!operationDirectory.startsWith('/root/ALETIS/backups/') || !operationDirectory.endsWith('/' + plan.operationId)) throw new Error('Diretório de recuperação inválido.')
      const originalPlan: IdentityMergePlan = JSON.parse(await readFile(join(operationDirectory, 'plan.json'), 'utf-8'))
      if (originalPlan.fingerprint !== plan.fingerprint) throw new Error('O plano difere do snapshot da manutenção.')
      const audit = await pool.query("select dados_depois from audit_log where acao='client_identity_merge' and dados_depois->>'operationId'=$1 and dados_depois->>'fingerprint'=$2", [plan.operationId, plan.fingerprint])
      const source = (await pool.query('select payload from cliente where id=$1', [plan.sourceId])).rows[0]?.payload
      if (audit.rows.length !== 1 || source?.identityMerge?.operationId !== plan.operationId || source?.identityMerge?.canonicalId !== plan.canonicalId) throw new Error('Não há confirmação inequívoca do commit; recuperação de cache recusada.')
      const cacheMutations: CacheMutation[] = JSON.parse(await readFile(join(operationDirectory, 'cache-journal-before.json'), 'utf-8'))
      const mergedMemory = (await pool.query('select payload from alix_memory where cliente_id=$1', [plan.canonicalId])).rows[0]?.payload
      const canonicalCache = cacheMutations.find(item => item.relativePath === `alix-memory/${plan.canonicalId}.md`)
      if (canonicalCache && mergedMemory) { canonicalCache.content = serializar(mergedMemory as MemoriaCliente); canonicalCache.afterHash = hash(canonicalCache.content) }
      else if (canonicalCache) cacheMutations.splice(cacheMutations.indexOf(canonicalCache), 1)
      const proof = JSON.parse(await readFile(join(operationDirectory, 'maintenance-proof.json'), 'utf-8'))
      const result = { ...audit.rows[0].dados_depois, mergedAt: source.identityMerge.mergedAt, committed: true, recovered: true, backupSha256: proof.backupSha256, cacheMutations }
      await privateJson(join(operationDirectory, 'result.json'), result)
      await synchronize(await storagePath(args[1]), cacheMutations)
      process.stdout.write(JSON.stringify({ recovered: true, synchronized: cacheMutations.length, operationId: plan.operationId }) + '\n')
    } else if (command === 'prepare') {
      const [sourceId, canonicalId] = args
      if (!sourceId || !canonicalId) throw new Error('Informe ambos os IDs.')
      const plan = await prepareIdentityMerge(pool, { sourceId, canonicalId, reason: 'Duplicidade confirmada por nome completo, CPF canônico válido, origem provisória do outro cadastro e contratos documentais coincidentes; consolidação solicitada pelo dono do sistema.' })
      await privateJson(planPath, plan)
      process.stdout.write(JSON.stringify({ prepared: true, fingerprint: plan.fingerprint, sourceId, canonicalId, identityEvidence: plan.identityEvidence, references: plan.references.map(item => ({ table: item.table, rows: item.rows.length })), memories: plan.memories.length, productionMutations: 0 }) + '\n')
    } else {
      if (process.env.ALETIS_CLIENT_MERGE_APPLY !== '1') throw new Error('Aplicação exige ALETIS_CLIENT_MERGE_APPLY=1.')
      await runtimeStopped()
      const [dumpInput, storageInput] = args, dumpPath = await realpath(resolve(dumpInput || ''))
      const dumpStat = await stat(dumpPath)
      if (!dumpPath.startsWith('/root/ALETIS/backups/') || dumpStat.size < 1024 || Date.now() - dumpStat.mtimeMs > 30 * 60 * 1000) throw new Error('Exige dump completo recente na pasta de backups ALETIS.')
      const dump = await readFile(dumpPath)
      if (dump.subarray(0, 5).toString() !== 'PGDMP' && !dump.subarray(0, 500).toString().includes('PostgreSQL database dump')) throw new Error('Backup não parece um dump PostgreSQL.')
      const storage = await storagePath(storageInput)
      const plan: IdentityMergePlan = JSON.parse(await readFile(planPath, 'utf-8'))
      if (![plan.sourceId, plan.canonicalId].every(id => /^[a-zA-Z0-9_-]{1,180}$/.test(id))) throw new Error('ID de cliente inválido para sincronização de caches.')
      const operationDirectory = join(dirname(dumpPath), plan.operationId)
      await mkdir(operationDirectory, { recursive: true, mode: 0o700 })
      await copyFile(planPath, join(operationDirectory, 'plan.json'))
      const cacheMutations: CacheMutation[] = []
      const backupCache = async (relativePath: string, content: string | null) => {
        const path = join(storage, relativePath), present = await exists(path)
        const beforeHash = present ? hash(await readFile(path)) : null
        if (present) { const backup = join(operationDirectory, 'cache-before', relativePath); await mkdir(dirname(backup), { recursive: true, mode: 0o700 }); await copyFile(path, backup) }
        cacheMutations.push({ relativePath, beforeHash, content, afterHash: content === null ? null : hash(content) })
      }
      for (const folder of ['alix-missions', 'alix-sessions']) {
        const folderPath = join(storage, folder)
        if (!await exists(folderPath)) continue
        for (const entry of await readdir(folderPath, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.json')) continue
          const relativePath = `${folder}/${entry.name}`, document = JSON.parse(await readFile(join(storage, relativePath), 'utf-8'))
          if (document.clienteId === plan.sourceId) await backupCache(relativePath, JSON.stringify({ ...document, clienteId: plan.canonicalId }, null, 2))
        }
      }
      // Capture ambos os Markdown antes da transação; os destinos são preenchidos pelo resultado canônico.
      for (const id of [plan.sourceId, plan.canonicalId]) await backupCache(`alix-memory/${id}.md`, null)
      await privateJson(join(operationDirectory, 'cache-journal-before.json'), cacheMutations)
      await privateJson(join(operationDirectory, 'maintenance-proof.json'), { backupSha256: hash(dump), backupPath: dumpPath, fingerprint: plan.fingerprint, createdAt: new Date().toISOString() })
      const result = await applyIdentityMerge(pool, plan, { actor: process.env.ALETIS_MAINTENANCE_ACTOR || 'owner-authorized:client-identity-consolidation', maintenanceMode: true })
      const canonicalCache = cacheMutations.find(item => item.relativePath === `alix-memory/${plan.canonicalId}.md`)!
      if (result.mergedMemory) { canonicalCache.content = serializar(result.mergedMemory as MemoriaCliente); canonicalCache.afterHash = hash(canonicalCache.content) }
      else cacheMutations.splice(cacheMutations.indexOf(canonicalCache), 1)
      const saved = { ...result, committed: true, backupSha256: hash(dump), cacheMutations }
      await privateJson(join(operationDirectory, 'result.json'), saved)
      await synchronize(storage, cacheMutations)
      const publicSummary = { operationId: result.operationId, mergedAt: result.mergedAt, sourceId: plan.sourceId, canonicalId: plan.canonicalId, references: result.references, historicalClientPreserved: true, financialValuesPromoted: false, cachesSynchronized: cacheMutations.length, backupSha256: saved.backupSha256, resultPath: join(operationDirectory, 'result.json') }
      await privateJson(join(operationDirectory, 'summary.json'), publicSummary)
      process.stdout.write(JSON.stringify(publicSummary) + '\n')
    }
  } finally { await pool.end() }
}

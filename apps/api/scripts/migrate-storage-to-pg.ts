/**
 * Migration unificada: TODO o storage runtime → Postgres.
 *
 * Cobre 9 entidades (16 tabelas no total contando fonte_status,
 * audit_log e financeiro_lancamento que ficam vazios aqui — esses
 * populam via probe ou OFX import).
 *
 * Idempotente: cada entidade usa upsert/append próprio do Repository
 * correspondente. Re-rodar não cria duplicatas (exceto nos
 * append-only — bsc_snapshot, alix_insight, alix_feedback — onde
 * cada run adiciona; controle via idempotência fica fora do escopo
 * deste script para preservar histórico).
 *
 * Uso:
 *   pnpm --filter @aletis/api run migrate:storage
 *
 * Pré-requisitos:
 *   ALETIS_PG_ENABLED=1, DATABASE_URL setado, migrations aplicadas
 *   (pnpm db:migrate).
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { isPgEnabled, closeDb } from '../src/db/client.js'

interface Stats {
  clientes: number
  dossies: number
  propostas: number
  alixSessions: number
  alixMemory: number
  alixInsights: number
  alixConfirmations: number
  alixFeedback: number
  bscSnapshots: number
  financeiro: number
  inventarios: number
  planosCusteio: number
}

const STORAGE_ROOT = join(process.cwd(), 'storage')

async function migrateClientes(): Promise<number> {
  const dir = join(STORAGE_ROOT, 'clientes')
  if (!existsSync(dir)) return 0
  // Os clientes vivem em memória (Map seedado em routes/clientes.ts).
  // Este script trata só dossies (analise/dossie). Clientes são populados
  // pelo boot orchestrator hydrateOrSeedClientesPg via server.ts.
  console.log('[migrate] Clientes: hidratação ocorre no boot do server, skip explícito.')
  return 0
}

async function migrateDossies(): Promise<number> {
  const dir = join(STORAGE_ROOT, 'clientes', 'dossies')
  if (!existsSync(dir)) return 0
  const repo = await import('../src/db/DossieRepository.js')
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = readFileSync(join(dir, f), 'utf-8')
      const dossie = JSON.parse(raw)
      await repo.upsertDossie(dossie)
      n++
    } catch (err) {
      console.warn(`  ⚠ falha ${f}: ${(err as Error).message}`)
    }
  }
  console.log(`[migrate] Dossies: ${n} migrados`)
  return n
}

async function migrateAlixSessions(): Promise<number> {
  const dir = join(STORAGE_ROOT, 'alix-sessions')
  if (!existsSync(dir)) return 0
  // AlixSessionRepository é importado dinamicamente pelo OrchestratorService;
  // re-implementamos upsert local pois a API não exporta a função pública.
  const { getDb } = await import('../src/db/client.js')
  const { alixSession, alixMessage } = await import('../src/db/schema.js')
  const db = getDb()
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = readFileSync(join(dir, f), 'utf-8')
      const session = JSON.parse(raw)
      if (!session.id) continue
      await db.insert(alixSession).values({
        id: session.id,
        title: session.title ?? 'sem título',
        clienteId: session.clienteId ?? null,
        criadoEm: session.createdAt ? new Date(session.createdAt) : new Date(),
        atualizadoEm: session.updatedAt ? new Date(session.updatedAt) : new Date(),
      }).onConflictDoUpdate({
        target: alixSession.id,
        set: { title: session.title ?? 'sem título', atualizadoEm: new Date() },
      })
      // Append messages (idempotente via PK msg_id).
      for (const m of (session.messages ?? [])) {
        if (!m.id) continue
        await db.insert(alixMessage).values({
          id: m.id,
          sessionId: session.id,
          role: m.role ?? 'user',
          content: m.content ?? '',
          tokensIn: m.tokensIn ?? null,
          tokensOut: m.tokensOut ?? null,
          modelo: m.modelo ?? null,
          criadoEm: m.timestamp ? new Date(m.timestamp) : new Date(),
        }).onConflictDoNothing({ target: alixMessage.id })
      }
      n++
    } catch (err) {
      console.warn(`  ⚠ falha ${f}: ${(err as Error).message}`)
    }
  }
  console.log(`[migrate] AlixSessions: ${n} migradas`)
  return n
}

async function migrateAlixMemory(): Promise<number> {
  const dir = join(STORAGE_ROOT, 'alix-memory')
  if (!existsSync(dir)) return 0
  const repo = await import('../src/db/AlixMemoryRepository.js')
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = readFileSync(join(dir, f), 'utf-8')
      const mem = JSON.parse(raw)
      if (!mem.clienteId) continue
      await repo.upsertAlixMemory(mem)
      n++
    } catch (err) {
      console.warn(`  ⚠ falha ${f}: ${(err as Error).message}`)
    }
  }
  console.log(`[migrate] AlixMemory: ${n} migradas`)
  return n
}

async function migrateAlixInsights(): Promise<number> {
  const dir = join(STORAGE_ROOT, 'alix-insights')
  if (!existsSync(dir)) return 0
  const repo = await import('../src/db/AlixMemoryRepository.js')
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue
    try {
      const raw = readFileSync(join(dir, f), 'utf-8')
      const dia = f.replace('.jsonl', '') // YYYY-MM-DD
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        const item = JSON.parse(line)
        await repo.appendAlixInsight({
          dia,
          clienteId: item.clienteId,
          tipo: item.tipo ?? 'outro',
          severidade: item.severidade,
          titulo: item.titulo ?? item.resumo ?? 'insight',
          detalhe: item.detalhe ?? item.descricao,
          ...item,
        })
        n++
      }
    } catch (err) {
      console.warn(`  ⚠ falha ${f}: ${(err as Error).message}`)
    }
  }
  console.log(`[migrate] AlixInsights: ${n} append-only`)
  return n
}

async function migrateAlixConfirmations(): Promise<number> {
  const file = join(STORAGE_ROOT, 'alix-confirmations', 'snapshot.json')
  if (!existsSync(file)) return 0
  const repo = await import('../src/db/AlixConfirmationFeedbackRepository.js')
  try {
    const raw = readFileSync(file, 'utf-8')
    if (!raw.trim()) return 0
    const data = JSON.parse(raw)
    const result = await repo.dumpConfirmations({
      pendings: data.pendings ?? [],
      batches: data.batches ?? [],
    })
    console.log(`[migrate] AlixConfirmations: ${result.written} (pendings + batches)`)
    return result.written
  } catch (err) {
    console.warn(`  ⚠ falha: ${(err as Error).message}`)
    return 0
  }
}

async function migrateAlixFeedback(): Promise<number> {
  const dir = join(STORAGE_ROOT, 'alix-feedback')
  if (!existsSync(dir)) return 0
  const repo = await import('../src/db/AlixConfirmationFeedbackRepository.js')
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue
    try {
      const raw = readFileSync(join(dir, f), 'utf-8')
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        const item = JSON.parse(line)
        await repo.appendFeedback(item)
        n++
      }
    } catch (err) {
      console.warn(`  ⚠ falha ${f}: ${(err as Error).message}`)
    }
  }
  console.log(`[migrate] AlixFeedback: ${n} append-only`)
  return n
}

async function migrateBscSnapshots(): Promise<number> {
  const dir = join(STORAGE_ROOT, 'bsc')
  if (!existsSync(dir)) return 0
  const repo = await import('../src/db/BscRepository.js')
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue
    try {
      const raw = readFileSync(join(dir, f), 'utf-8')
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        const record = JSON.parse(line)
        await repo.appendBscSnapshot(record)
        n++
      }
    } catch (err) {
      console.warn(`  ⚠ falha ${f}: ${(err as Error).message}`)
    }
  }
  console.log(`[migrate] BscSnapshots: ${n} append-only`)
  return n
}

async function migrateFinanceiro(): Promise<number> {
  const file = join(STORAGE_ROOT, 'financeiro', 'db.json')
  if (!existsSync(file)) return 0
  const repo = await import('../src/db/FinanceiroRepository.js')
  try {
    const raw = readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    const result = await repo.dumpAll({
      receitas: Object.values(data.receitas ?? {}),
      despesas: Object.values(data.despesas ?? {}),
      impostos: Object.values(data.impostos ?? {}),
      lancamentos: Object.values(data.lancamentos ?? {}),
    })
    console.log(`[migrate] Financeiro: ${result.written} entidades (receitas+despesas+impostos+lancamentos)`)
    return result.written
  } catch (err) {
    console.warn(`  ⚠ falha: ${(err as Error).message}`)
    return 0
  }
}

async function migratePropostas(): Promise<number> {
  // Propostas (legacy + inteligentes) já são populadas pelo boot
  // orchestrator hydrateOrSeedPropostasPg. Aqui só logamos o status.
  console.log('[migrate] Propostas: hidratação ocorre no boot do server, skip explícito.')
  return 0
}

async function migrateInventarios(): Promise<number> {
  const dir = join(STORAGE_ROOT, 'inventario')
  if (!existsSync(dir)) return 0
  const repo = await import('../src/db/InventarioCusteioRepository.js')
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = readFileSync(join(dir, f), 'utf-8')
      const inv = JSON.parse(raw)
      if (!inv.clienteId) continue
      await repo.upsertInventario(inv)
      n++
    } catch (err) {
      console.warn(`  ⚠ falha ${f}: ${(err as Error).message}`)
    }
  }
  console.log(`[migrate] Inventarios: ${n} migrados`)
  return n
}

async function migratePlanosCusteio(): Promise<number> {
  const dir = join(STORAGE_ROOT, 'custeio')
  if (!existsSync(dir)) return 0
  const repo = await import('../src/db/InventarioCusteioRepository.js')
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = readFileSync(join(dir, f), 'utf-8')
      const plano = JSON.parse(raw)
      if (!plano.id) continue
      await repo.upsertPlanoCusteio(plano)
      n++
    } catch (err) {
      console.warn(`  ⚠ falha ${f}: ${(err as Error).message}`)
    }
  }
  console.log(`[migrate] PlanosCusteio: ${n} migrados`)
  return n
}

async function main() {
  if (!isPgEnabled()) {
    console.error('[migrate] ALETIS_PG_ENABLED!=1 — abortando.')
    process.exit(2)
  }

  console.log(`[migrate] Storage root: ${STORAGE_ROOT}`)
  console.log(`[migrate] Existência: ${existsSync(STORAGE_ROOT) ? '✅' : '❌ pasta não existe'}`)

  const t0 = Date.now()
  const stats: Stats = {
    clientes: await migrateClientes(),
    dossies: await migrateDossies(),
    propostas: await migratePropostas(),
    alixSessions: await migrateAlixSessions(),
    alixMemory: await migrateAlixMemory(),
    alixInsights: await migrateAlixInsights(),
    alixConfirmations: await migrateAlixConfirmations(),
    alixFeedback: await migrateAlixFeedback(),
    bscSnapshots: await migrateBscSnapshots(),
    financeiro: await migrateFinanceiro(),
    inventarios: await migrateInventarios(),
    planosCusteio: await migratePlanosCusteio(),
  }
  const dur = Date.now() - t0

  console.log()
  console.log('═══════════════════════════════════════════════════════')
  console.log(`[migrate] CONCLUÍDO em ${dur}ms`)
  console.log('═══════════════════════════════════════════════════════')
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(20)}: ${v}`)
  }
  await closeDb()
}

main().catch(async (err) => {
  console.error('[migrate] FALHOU:', err)
  await closeDb().catch(() => {})
  process.exit(1)
})

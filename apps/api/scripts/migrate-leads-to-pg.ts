/**
 * Bulk-migration: storage/prospeccao/leads-agro.json (94 MB, 39k leads)
 * → tabela `lead_pgfn` no Postgres.
 *
 * Idempotente: ON CONFLICT (cnpj_cpf) faz UPDATE. Roda em batches de 1000.
 *
 * Uso:
 *   pnpm --filter @aletis/api run migrate:leads
 *
 * Pré-requisitos:
 *   ALETIS_PG_ENABLED=1, DATABASE_URL setado, migrations aplicadas.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { upsertLeadsBatch, countLeadsPgfn } from '../src/db/LeadPgfnRepository.js'
import { isPgEnabled, closeDb } from '../src/db/client.js'

interface LeadFromIndex {
  cpfCnpjClean: string
  nome: string
  uf: string
  totalDivida: number
  qtdInscricoes: number
  temAjuizada: boolean
  agroSignals?: string[]
  [key: string]: unknown
}

async function main() {
  if (!isPgEnabled()) {
    console.error('[migrate:leads] ALETIS_PG_ENABLED!=1 — abortando.')
    process.exit(2)
  }
  const path = join(process.cwd(), 'storage/prospeccao/leads-agro.json')
  if (!existsSync(path)) {
    console.error(`[migrate:leads] arquivo não encontrado: ${path}`)
    process.exit(3)
  }

  console.log(`[migrate:leads] lendo ${path}...`)
  const raw = readFileSync(path, 'utf-8')
  const parsed = JSON.parse(raw) as { leads: LeadFromIndex[] }
  const leads = parsed.leads ?? []
  console.log(`[migrate:leads] ${leads.length.toLocaleString()} leads no índice.`)

  const before = await countLeadsPgfn()
  console.log(`[migrate:leads] antes: PG tem ${before.toLocaleString()} leads.`)

  const t0 = Date.now()
  const mapped = leads.map((l) => ({
    cnpjCpf: l.cpfCnpjClean,
    nome: l.nome,
    uf: l.uf,
    totalDivida: typeof l.totalDivida === 'number' ? l.totalDivida : undefined,
    inscricoesCount: l.qtdInscricoes,
    ajuizado: !!l.temAjuizada,
    sinais: l.agroSignals,
    payload: l, // fidelidade total para consultas JSONB ad-hoc
  }))

  const result = await upsertLeadsBatch(mapped, 1000)
  const after = await countLeadsPgfn()
  const dur = Date.now() - t0

  console.log(
    `[migrate:leads] OK — escritos ${result.written.toLocaleString()} em ${result.chunks} chunks, ${dur}ms`,
  )
  console.log(`[migrate:leads] PG agora tem ${after.toLocaleString()} leads (Δ +${(after - before).toLocaleString()}).`)
  await closeDb()
}

main().catch(async (err) => {
  console.error('[migrate:leads] FALHOU:', err)
  await closeDb().catch(() => {})
  process.exit(1)
})

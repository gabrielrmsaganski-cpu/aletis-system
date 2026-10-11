/**
 * Recupera apenas extras de mensagens já existentes no PG.
 * Padrão: dry-run, transação READ ONLY. --apply precisa ser explícito.
 * Exige correspondência exata de arquivo/sessão, id da mensagem e conteúdo SQL.
 */
import { readFile, readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import pg from 'pg'
import { z } from 'zod'
import { alixMessageModel, fillMissingAlixMessageExtras, parseAlixMessageExtras } from '../src/db/AlixMessagePayload.js'

const fileSchema = z.object({
  id: z.string().min(1),
  messages: z.array(z.object({ id: z.string().min(1), content: z.string() }).passthrough()),
})

export interface BackfillOptions {
  sessionsDir: string
  sessionIds?: string[]
  all?: boolean
  apply?: boolean
}

export async function backfillAlixMessageExtras(pool: pg.Pool, options: BackfillOptions) {
  if (!!options.all === !!options.sessionIds?.length) throw new Error('Escolha --all OU pelo menos um --session-id.')
  const sessionIds = options.all
    ? (await readdir(options.sessionsDir, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => entry.name.slice(0, -5)).sort()
    : [...new Set(options.sessionIds!)]
  if (sessionIds.some(id => !id || basename(id) !== id || id === '.' || id === '..')) throw new Error('ID de sessão inválido.')
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    filesExamined: sessionIds.length,
    messagesExamined: 0,
    eligible: 0,
    updated: 0,
    unchanged: 0,
    skipped: { invalidFile: 0, noExtras: 0, noSqlMatch: 0, contentMismatch: 0 },
    entries: [] as Array<{ sessionId: string; messageId?: string; action: string }>,
  }
  const client = await pool.connect()
  try {
    await client.query(options.apply ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY')
    for (const sessionId of sessionIds) {
      let session: z.infer<typeof fileSchema>
      try {
        session = fileSchema.parse(JSON.parse(await readFile(join(options.sessionsDir, `${sessionId}.json`), 'utf8')))
        if (session.id !== sessionId || new Set(session.messages.map(m => m.id)).size !== session.messages.length) {
          throw new Error('Arquivo e sessão não correspondem ou há IDs duplicados.')
        }
      } catch {
        report.skipped.invalidFile++
        report.entries.push({ sessionId, action: 'invalid_file' })
        continue
      }
      for (const message of session.messages) {
        report.messagesExamined++
        const extras = parseAlixMessageExtras(message)
        if (!Object.keys(extras).length) { report.skipped.noExtras++; continue }
        const result = await client.query<{ content: string; payload: unknown; modelo: string | null }>(
          `SELECT content, payload, modelo FROM alix_message WHERE id = $1 AND session_id = $2${options.apply ? ' FOR UPDATE' : ''}`,
          [message.id, sessionId],
        )
        const current = result.rows[0]
        if (!current) {
          report.skipped.noSqlMatch++
          report.entries.push({ sessionId, messageId: message.id, action: 'no_sql_match' })
          continue
        }
        if (current.content !== message.content) {
          report.skipped.contentMismatch++
          report.entries.push({ sessionId, messageId: message.id, action: 'content_mismatch' })
          continue
        }
        const nextPayload = fillMissingAlixMessageExtras(current.payload, extras)
        const nextModel = current.modelo ?? alixMessageModel(parseAlixMessageExtras(nextPayload))
        if (isDeepStrictEqual(current.payload, nextPayload) && current.modelo === nextModel) {
          report.unchanged++
          continue
        }
        report.eligible++
        if (options.apply) {
          const update = await client.query(
            `UPDATE alix_message SET payload = $1::jsonb, modelo = $2
             WHERE id = $3 AND session_id = $4 AND content = $5`,
            [JSON.stringify(nextPayload), nextModel, message.id, sessionId, message.content],
          )
          report.updated += update.rowCount ?? 0
        }
        report.entries.push({ sessionId, messageId: message.id, action: options.apply ? 'updated' : 'would_update' })
      }
    }
    await client.query(options.apply ? 'COMMIT' : 'ROLLBACK')
    return report
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

async function main() {
  const args = process.argv.slice(2)
  const options: BackfillOptions = { sessionsDir: '', sessionIds: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--sessions-dir' && args[i + 1]) options.sessionsDir = resolve(args[++i])
    else if (arg === '--session-id' && args[i + 1]) options.sessionIds!.push(args[++i])
    else if (arg === '--all') options.all = true
    else if (arg === '--apply') options.apply = true
    else throw new Error('Uso: --sessions-dir PATH (--session-id ID [--session-id ID] | --all) [--apply]')
  }
  if (!options.sessionsDir || !process.env.DATABASE_URL) throw new Error('--sessions-dir e DATABASE_URL são obrigatórios.')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000 })
  try { process.stdout.write(`${JSON.stringify(await backfillAlixMessageExtras(pool, options), null, 2)}\n`) }
  finally { await pool.end() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    // Não imprime URI, conteúdo da conversa nem valores de metadata em erros de execução.
    process.stderr.write('Backfill não concluído; transação revertida. Confira argumentos, conexão e migração 0039.\n')
    process.exitCode = 1
  })
}

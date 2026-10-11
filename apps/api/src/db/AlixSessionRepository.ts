/**
 * AlixSessionRepository — dual-write best-effort para Postgres.
 *
 * O OrchestratorService continua escrevendo arquivos em
 * `storage/alix-sessions/{id}.json` (rápido, sem lock); este módulo
 * espelha sessão+mensagens no PG para queryability + restart-safety
 * (sem precisar restaurar 80+ arquivos no boot).
 *
 * Estratégia:
 *   - Sessão: UPSERT em `alix_session` por id (titulo, atualizadoEm)
 *   - Mensagens: UPSERT dos extras por id + sessão; texto, papel e data
 *     já gravados no SQL permanecem autoritativos.
 *
 * As leituras de autorização e as escritas strict propagam falhas do PG.
 * O caminho histórico best-effort mantém compatibilidade dos chats;
 * criação idempotente nunca altera uma sessão já existente.
 */
import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { alixSession as sessionTable, alixMessage as messageTable } from './schema.js'
import { alixMessageModel, parseAlixMessageExtras } from './AlixMessagePayload.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface AlixSessionAccess {
  id: string
  consultorId?: string
  clienteId?: string
}

/** Autorização exige a fonte principal e não usa cache após falha do banco. */
export async function getSessionAccess(sessionId: string): Promise<AlixSessionAccess | null> {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(sessionId)) return null
  if (isPgEnabled()) {
    const [row] = await getDb().select({ id: sessionTable.id, consultorId: sessionTable.consultorId, clienteId: sessionTable.clienteId })
      .from(sessionTable).where(eq(sessionTable.id, sessionId)).limit(1)
    return row ? { id: row.id, consultorId: row.consultorId ?? undefined, clienteId: row.clienteId ?? undefined } : null
  }
  try {
    const raw = JSON.parse(await readFile(join(process.cwd(), 'storage', 'alix-sessions', `${sessionId}.json`), 'utf8')) as Record<string, unknown>
    if (raw.id !== sessionId) return null
    return { id: sessionId, consultorId: typeof raw.consultorId === 'string' ? raw.consultorId : undefined, clienteId: typeof raw.clienteId === 'string' ? raw.clienteId : undefined }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function getSessionsAccess(sessionIds: string[]): Promise<AlixSessionAccess[]> {
  const ids = [...new Set(sessionIds)].filter(id => /^[A-Za-z0-9_-]{1,180}$/.test(id))
  if (!ids.length) return []
  if (isPgEnabled()) {
    const rows = await getDb().select({ id: sessionTable.id, consultorId: sessionTable.consultorId, clienteId: sessionTable.clienteId })
      .from(sessionTable).where(inArray(sessionTable.id, ids))
    return rows.map(row => ({ id: row.id, consultorId: row.consultorId ?? undefined, clienteId: row.clienteId ?? undefined }))
  }
  return (await Promise.all(ids.map(getSessionAccess))).filter((row): row is AlixSessionAccess => row !== null)
}

export interface SessionLike {
  id: string
  title?: string
  consultorId?: string
  clienteId?: string
  archivedAt?: number | string
  pinnedAt?: number | string
  createdAt?: number | string
  updatedAt?: number | string
  messageCount?: number
  lastMessage?: string
  messages?: Array<{
    id: string
    role: string
    content: string
    timestamp?: number | string
    [key: string]: unknown
  }>
}

const toDate = (v: number | string | undefined): Date => {
  if (!v) return new Date()
  if (typeof v === 'number') return new Date(v)
  const d = new Date(v)
  return isNaN(d.getTime()) ? new Date() : d
}

export async function upsertSession(s: SessionLike, options: { strict?: boolean } = {}): Promise<AlixSessionAccess | void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const now = new Date()
    const [saved] = await db
      .insert(sessionTable)
      .values({
        id: s.id,
        consultorId: s.consultorId ?? null,
        clienteId: s.clienteId ?? null,
        titulo: s.title ?? 'Nova conversa',
        arquivadoEm: s.archivedAt ? toDate(s.archivedAt) : null,
        fixadoEm: s.pinnedAt ? toDate(s.pinnedAt) : null,
        criadoEm: toDate(s.createdAt),
        atualizadoEm: toDate(s.updatedAt) || now,
      })
      .onConflictDoUpdate({
        target: sessionTable.id,
        set: {
          titulo: s.title ?? 'Nova conversa',
          // Escritores antigos que não carregam o campo não removem autoria.
          consultorId: sql`coalesce(${sessionTable.consultorId}, excluded.consultor_id)`,
          clienteId: s.clienteId ?? null,
          arquivadoEm: s.archivedAt ? toDate(s.archivedAt) : null,
          fixadoEm: s.pinnedAt ? toDate(s.pinnedAt) : null,
          atualizadoEm: now,
        },
        setWhere: sql`${sessionTable.consultorId} is null or excluded.consultor_id is null or ${sessionTable.consultorId} = excluded.consultor_id`,
      })
      .returning({ id: sessionTable.id, consultorId: sessionTable.consultorId, clienteId: sessionTable.clienteId })
    if (!saved) {
      throw Object.assign(new Error('Não é permitido alterar o proprietário de uma conversa por este fluxo.'), { code: 'ALIX_SESSION_OWNER_CONFLICT', statusCode: 409 })
    }

    if (s.messages && s.messages.length > 0) {
      const rows = s.messages.map((m) => {
        const extras = parseAlixMessageExtras(m)
        return {
          id: m.id,
          sessionId: s.id,
          role: m.role,
          content: m.content,
          criadoEm: toDate(m.timestamp),
          payload: Object.keys(extras).length ? extras : null,
          modelo: alixMessageModel(extras),
        }
      })
      await db.insert(messageTable).values(rows).onConflictDoUpdate({
        target: messageTable.id,
        set: {
          // Chamadas antigas sem extras não removem evidências já persistidas.
          payload: sql`CASE WHEN excluded.payload IS NULL THEN ${messageTable.payload}
            ELSE COALESCE(${messageTable.payload}, '{}'::jsonb) || excluded.payload ||
              CASE WHEN jsonb_typeof(${messageTable.payload}->'metadata') = 'object'
                AND jsonb_typeof(excluded.payload->'metadata') = 'object'
              THEN jsonb_build_object('metadata', (${messageTable.payload}->'metadata') || (excluded.payload->'metadata'))
              ELSE '{}'::jsonb END END`,
          modelo: sql`COALESCE(excluded.modelo, ${messageTable.modelo})`,
        },
        setWhere: sql`${messageTable.sessionId} = excluded.session_id
          AND (excluded.payload IS NOT NULL OR excluded.modelo IS NOT NULL)`,
      })
    }
    return { id: saved.id, consultorId: saved.consultorId ?? undefined, clienteId: saved.clienteId ?? undefined }
  } catch (err) {
    if (options.strict || (err as { code?: string }).code === 'ALIX_SESSION_OWNER_CONFLICT') throw err
    // eslint-disable-next-line no-console
    console.warn('[AlixSessionRepo.upsert] best-effort fail:', (err as Error).message)
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  if (!isPgEnabled()) return false
  try {
    const db = getDb()
    // Apaga mensagens primeiro (sem FK no schema, ordem por convenção).
    await db.delete(messageTable).where(eq(messageTable.sessionId, sessionId))
    const res = await db.delete(sessionTable).where(eq(sessionTable.id, sessionId)).returning({ id: sessionTable.id })
    return res.length > 0
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AlixSessionRepo.delete] fail:', (err as Error).message)
    return false
  }
}

/** Cria uma sessão estável sem reaplicar título, contexto ou mensagens no retry. */
export async function ensureSession(s: Omit<SessionLike, 'messages'> & { consultorId: string; clienteId: string }): Promise<SessionLike | undefined> {
  if (!isPgEnabled()) return undefined
  await getDb().insert(sessionTable).values({
    id: s.id,
    consultorId: s.consultorId,
    clienteId: s.clienteId,
    titulo: s.title ?? 'Nova conversa',
    criadoEm: toDate(s.createdAt),
    atualizadoEm: toDate(s.updatedAt),
  }).onConflictDoNothing({ target: sessionTable.id })
  const saved = await getSession(s.id, { strict: true })
  if (!saved) throw new Error('A sessão não pôde ser recuperada após a criação idempotente.')
  if (saved.consultorId !== s.consultorId || saved.clienteId !== s.clienteId) {
    throw Object.assign(new Error('A sessão já existe com outro proprietário ou cliente.'), {
      code: 'ALIX_SESSION_SCOPE_CONFLICT', statusCode: 409,
    })
  }
  return saved
}

export async function getSession(sessionId: string, options: { strict?: boolean } = {}): Promise<SessionLike | null> {
  if (!isPgEnabled()) return null
  try {
    const db = getDb()
    const rows = await db.select().from(sessionTable).where(eq(sessionTable.id, sessionId)).limit(1)
    const session = rows[0]
    if (!session) return null
    const messages = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.sessionId, sessionId))
      .orderBy(asc(messageTable.criadoEm))
    return {
      id: session.id,
      title: session.titulo ?? 'Nova conversa',
      consultorId: session.consultorId ?? undefined,
      clienteId: session.clienteId ?? undefined,
      archivedAt: session.arquivadoEm?.getTime(),
      pinnedAt: session.fixadoEm?.getTime(),
      createdAt: session.criadoEm.getTime(),
      updatedAt: session.atualizadoEm.getTime(),
      messages: messages.map((m) => ({
        ...parseAlixMessageExtras(m.payload),
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.criadoEm.getTime(),
      })),
    }
  } catch (err) {
    if (options.strict) throw err
    // eslint-disable-next-line no-console
    console.warn('[AlixSessionRepo.get] fail:', (err as Error).message)
    return null
  }
}

export async function listSessions(limit = 100): Promise<SessionLike[]> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const rows = await db
      .select({
        session: sessionTable,
        messageCount: sql<number>`(
          select count(*)::int from alix_message
          where alix_message.session_id = alix_session.id
        )`,
        lastMessage: sql<string | null>`(
          select left(alix_message.content, 240) from alix_message
          where alix_message.session_id = alix_session.id
          order by alix_message.criado_em desc limit 1
        )`,
        firstUserMessage: sql<string | null>`(
          select left(alix_message.content, 64) from alix_message
          where alix_message.session_id = alix_session.id and alix_message.role = 'user'
          order by alix_message.criado_em asc limit 1
        )`,
      })
      .from(sessionTable)
      .orderBy(desc(sessionTable.fixadoEm), desc(sessionTable.atualizadoEm))
      .limit(Math.max(1, Math.min(limit, 500)))
    return rows.map(({ session: s, messageCount, lastMessage, firstUserMessage }) => ({
      id: s.id,
      title: (!s.titulo || s.titulo === 'Nova conversa') && firstUserMessage
        ? `${firstUserMessage.trim()}${firstUserMessage.length >= 64 ? '...' : ''}`
        : s.titulo ?? 'Nova conversa',
      consultorId: s.consultorId ?? undefined,
      clienteId: s.clienteId ?? undefined,
      archivedAt: s.arquivadoEm?.getTime(),
      pinnedAt: s.fixadoEm?.getTime(),
      createdAt: s.criadoEm.getTime(),
      updatedAt: s.atualizadoEm.getTime(),
      messageCount: Number(messageCount || 0),
      lastMessage: lastMessage ?? undefined,
      messages: [],
    }))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AlixSessionRepo.list] fail:', (err as Error).message)
    return []
  }
}

export async function countSessions(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const db = getDb()
    const r = await db.select().from(sessionTable)
    return r.length
  } catch {
    return 0
  }
}

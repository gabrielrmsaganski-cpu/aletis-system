/**
 * P2-33 — audit_log emite registros para ações sensíveis.
 * Skip automático se ALETIS_PG_ENABLED!=1 (CI sem banco).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { audit } from '../../src/db/AuditLog.js'
import { isPgEnabled, getDb, closeDb } from '../../src/db/client.js'
import { auditLog as auditLogTable } from '../../src/db/schema.js'
import { eq, desc } from 'drizzle-orm'

const PG = isPgEnabled()
const describeIf = PG ? describe : describe.skip

describeIf('audit_log (Postgres append-only)', () => {
  const recurso = `cliente:test-audit-${Date.now()}`

  beforeAll(async () => {
    if (PG) {
      const db = getDb()
      await db.delete(auditLogTable).where(eq(auditLogTable.recurso, recurso))
    }
  })

  afterAll(async () => {
    if (PG) {
      const db = getDb()
      await db.delete(auditLogTable).where(eq(auditLogTable.recurso, recurso))
    }
    await closeDb()
  })

  it('insere uma linha de auditoria com ator/acao/recurso/diff', async () => {
    await audit({
      ator: 'vitest',
      acao: 'update',
      recurso,
      dadosAntes: { estagio: 'analise', valor: 100 },
      dadosDepois: { estagio: 'negociacao', valor: 100 },
    })
    const db = getDb()
    const rows = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.recurso, recurso))
      .orderBy(desc(auditLogTable.id))
    expect(rows.length).toBe(1)
    expect(rows[0].ator).toBe('vitest')
    expect(rows[0].acao).toBe('update')
    expect((rows[0].dadosAntes as { estagio: string }).estagio).toBe('analise')
    expect((rows[0].dadosDepois as { estagio: string }).estagio).toBe('negociacao')
  })

  it('múltiplos audits no mesmo recurso são append-only', async () => {
    await audit({ ator: 'vitest', acao: 'patch', recurso, dadosDepois: { observacoes: 'a' } })
    await audit({ ator: 'vitest', acao: 'patch', recurso, dadosDepois: { observacoes: 'b' } })
    const db = getDb()
    const rows = await db.select().from(auditLogTable).where(eq(auditLogTable.recurso, recurso))
    // 1 do teste anterior + 2 desse = 3
    expect(rows.length).toBe(3)
  })
})

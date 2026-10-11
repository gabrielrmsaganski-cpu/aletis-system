import { randomUUID } from 'crypto'
import { desc, eq } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { googleWorkspaceAuditLog, type GoogleWorkspaceAuditLog } from '../../db/schema.js'
import type { GoogleWorkspaceActor } from './schemas.js'

const memoryLogs: GoogleWorkspaceAuditLog[] = []

export interface GoogleAuditInput {
  actor: GoogleWorkspaceActor
  action: string
  resourceType: string
  resourceId?: string | null
  googleResourceId?: string | null
  status?: 'succeeded' | 'failed' | 'skipped'
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}

function project(row: GoogleWorkspaceAuditLog): GoogleWorkspaceAuditLog {
  return row
}

export class GoogleWorkspaceAuditService {
  async record(input: GoogleAuditInput): Promise<GoogleWorkspaceAuditLog> {
    const row = {
      id: `gwa_${randomUUID()}`,
      tenantId: input.actor.tenantId,
      userId: input.actor.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId || null,
      googleResourceId: input.googleResourceId || null,
      status: input.status || 'succeeded',
      errorMessage: input.errorMessage || null,
      metadata: input.metadata || {},
      createdAt: new Date(),
    } as GoogleWorkspaceAuditLog

    if (isPgEnabled()) {
      try {
        const [saved] = await getDb().insert(googleWorkspaceAuditLog).values(row as any).returning()
        return saved
      } catch {
        // fallback em memória para não bloquear a operação de domínio
      }
    }
    memoryLogs.unshift(row)
    return row
  }

  async list(actor: GoogleWorkspaceActor, limit = 100): Promise<GoogleWorkspaceAuditLog[]> {
    if (isPgEnabled()) {
      try {
        return await getDb()
          .select()
          .from(googleWorkspaceAuditLog)
          .where(eq(googleWorkspaceAuditLog.tenantId, actor.tenantId))
          .orderBy(desc(googleWorkspaceAuditLog.createdAt))
          .limit(Math.min(limit, 500))
      } catch {
        // fallback
      }
    }
    return memoryLogs.filter((log) => log.tenantId === actor.tenantId).slice(0, Math.min(limit, 500)).map(project)
  }
}

let singleton: GoogleWorkspaceAuditService | null = null

export function getGoogleWorkspaceAuditService(): GoogleWorkspaceAuditService {
  if (!singleton) singleton = new GoogleWorkspaceAuditService()
  return singleton
}

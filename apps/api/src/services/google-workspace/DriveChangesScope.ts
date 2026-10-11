import type { Pool } from 'pg'
import { driveChangesScopeSchema, type DriveChangesScope } from './DriveChangesTypes.js'

/** Os vínculos vêm exclusivamente dos IDs de pastas cadastradas no tenant. */
export async function readDriveChangesScope(pool: Pick<Pool, 'connect'>, tenantId: string, corporateRootIds: string[]): Promise<DriveChangesScope> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const folders = (await client.query('SELECT client_id,google_folder_id FROM client_google_drive_folder WHERE tenant_id=$1 ORDER BY client_id,google_folder_id', [tenantId])).rows
    const rows = (await client.query("SELECT id,payload->'identityMerge'->>'canonicalId' AS canonical,payload->'identityMerge'->>'status' AS status,payload->'identityConsolidation'->'aliases' AS aliases FROM cliente ORDER BY id")).rows
    const known = new Set<string>(rows.map(row => row.id))
    const aliases = new Map<string, string>()
    for (const row of rows) {
      if (row.status === 'merged' && typeof row.canonical === 'string') aliases.set(row.id, row.canonical)
      for (const alias of Array.isArray(row.aliases) ? row.aliases : []) if (typeof alias === 'string' && alias !== row.id && !known.has(alias)) aliases.set(alias, row.id)
    }
    const resolve = (id: string) => {
      const seen = new Set<string>()
      while (aliases.has(id)) { if (seen.has(id) || seen.size >= 32) return null; seen.add(id); id = aliases.get(id)! }
      return known.has(id) ? id : null
    }
    const scope = driveChangesScopeSchema.parse({ tenantId, corporateRootIds, clientFolders: folders.flatMap(folder => {
      const clientId = resolve(folder.client_id)
      return clientId ? [{ clientId, folderId: folder.google_folder_id }] : []
    }) })
    await client.query('COMMIT')
    return scope
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  finally { client.release() }
}

import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import { readDriveChangesScope } from '../../src/services/google-workspace/DriveChangesScope.js'

function fixture(folders: unknown[], clients: unknown[]) {
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes('FROM client_google_drive_folder') ? folders : sql.includes('FROM cliente ') ? clients : [] }))
  const release = vi.fn()
  return { pool: { connect: async () => ({ query, release }) } as unknown as Pool, query, release }
}

describe('escopo do produtor por vínculos persistidos', () => {
  it('lê apenas pastas do tenant e canonicaliza alias excluído, sem inferência por nome', async () => {
    const { pool, query, release } = fixture([{ client_id: 'legacy', google_folder_id: 'folder-a' }, { client_id: 'unknown', google_folder_id: 'folder-b' }], [{ id: 'canonical', aliases: ['legacy'] }])
    expect(await readDriveChangesScope(pool, 'tenant-one', ['corporate-root'])).toEqual({ tenantId: 'tenant-one', corporateRootIds: ['corporate-root'], clientFolders: [{ folderId: 'folder-a', clientId: 'canonical' }] })
    expect(query).toHaveBeenCalledWith('SELECT client_id,google_folder_id FROM client_google_drive_folder WHERE tenant_id=$1 ORDER BY client_id,google_folder_id', ['tenant-one'])
    expect(query.mock.calls[0][0]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
    expect(query.mock.calls.some(call => /INSERT|UPDATE|DELETE/.test(call[0]))).toBe(false)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('segue merge persistido e omite aliases cíclicos', async () => {
    const { pool } = fixture([{ client_id: 'old', google_folder_id: 'valid' }, { client_id: 'loop-a', google_folder_id: 'invalid' }], [
      { id: 'old', status: 'merged', canonical: 'canonical' }, { id: 'canonical' },
      { id: 'loop-a', status: 'merged', canonical: 'loop-b' }, { id: 'loop-b', status: 'merged', canonical: 'loop-a' },
    ])
    expect((await readDriveChangesScope(pool, 'tenant-one', [])).clientFolders).toEqual([{ folderId: 'valid', clientId: 'canonical' }])
  })

  it('falha de leitura causa rollback e nunca usa mapa ou snapshot como fallback', async () => {
    const { pool, query, release } = fixture([], [])
    query.mockRejectedValueOnce(new Error('fixture-read-failure'))
    await expect(readDriveChangesScope(pool, 'tenant-one', [])).rejects.toThrow('fixture-read-failure')
    expect(query).toHaveBeenCalledWith('ROLLBACK')
    expect(release).toHaveBeenCalledTimes(1)
  })
})

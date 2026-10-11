import assert from 'node:assert'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'

import { AlixService } from '../../src/services/AlixService.ts'
import { DataSourceManager } from '../../src/services/DataSourceManager.ts'

const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

test('persiste renomeação, fixação, arquivamento e restauração da conversa', async () => {
  const storage = await mkdtemp(join(tmpdir(), 'alix-session-workspace-'))
  created.push(storage)
  const service = new AlixService(DataSourceManager.getInstance(), storage)
  const session = await service.createSession('Análise inicial')

  const pinned = await service.updateSession(session.id, { title: 'Caso Safra 2026', pinned: true, clienteId: 'cli_123' })
  assert.equal(pinned?.title, 'Caso Safra 2026')
  assert.equal(pinned?.clienteId, 'cli_123')
  assert.ok(pinned?.pinnedAt)

  const archived = await service.updateSession(session.id, { archived: true })
  assert.ok(archived?.archivedAt)
  assert.equal(archived?.pinnedAt, undefined)

  const restored = await service.updateSession(session.id, { archived: false })
  assert.equal(restored?.archivedAt, undefined)

  const persisted = JSON.parse(await readFile(join(storage, `${session.id}.json`), 'utf8'))
  assert.equal(persisted.title, 'Caso Safra 2026')
  assert.equal(persisted.clienteId, 'cli_123')
  assert.equal(persisted.archivedAt, undefined)
})

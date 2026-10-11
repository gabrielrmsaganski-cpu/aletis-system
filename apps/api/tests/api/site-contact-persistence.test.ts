import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aletis-contact-'))
  vi.stubEnv('LEAD_STORAGE_DIR', directory)
  vi.stubEnv('LEAD_WEBHOOK_URL', '')
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('LEAD_EMAIL_TO', '')
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.resetModules()
})
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await rm(directory, { force: true, recursive: true })
})
function request(index: number) {
  return new Request('http://localhost/api/contato', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: `Teste ${index}`, email: `teste${index}@example.test`, telefone: '65999999999', consent: true }),
  })
}

it('não confirma contato quando nenhum destino persistiu os dados', async () => {
  const blocked = join(directory, 'arquivo')
  await writeFile(blocked, 'não é um diretório')
  vi.stubEnv('LEAD_STORAGE_DIR', blocked)
  const { POST } = await import('../../../site/src/app/api/contato/route.ts')
  const response = await POST(request(1))
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ success: false })
})

it('preserva todos os contatos recebidos concorrentemente no registro JSONL', async () => {
  const { POST } = await import('../../../site/src/app/api/contato/route.ts')
  const responses = await Promise.all(Array.from({ length: 30 }, (_, index) => POST(request(index))))
  expect(responses.every(response => response.status === 200)).toBe(true)
  const [filename] = await readdir(directory)
  const records = (await readFile(join(directory, filename), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  expect(records).toHaveLength(30)
  expect(new Set(records.map(record => record.email)).size).toBe(30)
})

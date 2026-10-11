import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { closeDb } from '../src/db/client.js'
import { fiscalArchiveService } from '../src/services/fiscal-connection/FiscalArchiveService.js'

async function main() {
  const output = resolve(process.argv[2] ?? '../../output/fiscal/paulo-2021-2026.xlsx')
  const result = await fiscalArchiveService.export('cli-002', { anos: '2021,2022,2023,2024,2025,2026' }, 'xlsx', 'sistema:sefaz-ms')
  await mkdir(dirname(output), { recursive: true, mode: 0o700 })
  await writeFile(output, result.body, { mode: 0o600 })
  process.stdout.write(JSON.stringify({ output, filename: result.filename, bytes: result.body.length, sha256: createHash('sha256').update(result.body).digest('hex') }) + '\n')
}

main().catch(error => {
  process.stderr.write((error instanceof Error ? error.message : 'Falha ao preparar a planilha fiscal.') + '\n')
  process.exitCode = 1
}).finally(closeDb)

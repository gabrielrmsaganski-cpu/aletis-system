import { createHash } from 'node:crypto'
import { generatedContractPersistence } from '../../src/db/GeneratedContractRepository.js'
import { GeneratedContractCatalog } from '../../src/services/contratos/GeneratedContractCatalog.js'
import { closeDb } from '../../src/db/client.js'

const url = new URL(process.env.DATABASE_URL ?? '')
if (url.hostname !== '127.0.0.1' || url.port !== '55436' || url.pathname !== '/aletis_implementation_fixture') {
  throw new Error('Somente o PostgreSQL descartável da implementação é permitido.')
}
try {
  const catalog = new GeneratedContractCatalog(generatedContractPersistence)
  const record = await catalog.get(process.argv[2])
  process.stdout.write(JSON.stringify(record ? {
    id: record.id,
    valorTotal: record.valorTotal,
    sha256: createHash('sha256').update(record.conteudoMarkdown).digest('hex'),
    documento: record.documento,
  } : null))
} finally {
  await closeDb()
}

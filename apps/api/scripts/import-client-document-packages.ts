import { readFile, readdir } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'

const packageSchema = z.object({
  directory: z.string().trim().min(1),
  clienteId: z.string().trim().min(1).max(120),
  demandaId: z.string().trim().min(1).max(120).optional(),
  sourcePackage: z.string().trim().min(1).max(180).optional(),
})

const planSchema = z.object({
  batchId: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9_.-]+$/),
  root: z.string().trim().min(1),
  apiUrl: z.string().url().optional(),
  concurrency: z.number().int().min(1).max(4).default(2),
  packages: z.array(packageSchema).min(1).max(100),
})

type PackagePlan = z.infer<typeof packageSchema>
type PlannedFile = {
  absolutePath: string
  sourcePath: string
  sourcePackage: string
  clienteId: string
  demandaId?: string
  categoria: string
}

const mimeByExtension: Record<string, string> = {
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.kml': 'application/xml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
}

function parseArgs(): { planPath: string; dryRun: boolean } {
  const args = process.argv.slice(2)
  const planIndex = args.indexOf('--plan')
  if (planIndex < 0 || !args[planIndex + 1]) {
    throw new Error('Uso: pnpm import:client-documents -- --plan /caminho/plano.json [--dry-run]')
  }
  return { planPath: resolve(args[planIndex + 1]), dryRun: args.includes('--dry-run') }
}

async function walk(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name.startsWith('~$')) continue
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(absolutePath))
    else if (entry.isFile()) files.push(absolutePath)
  }
  return files
}

function inferCategory(path: string): string {
  const value = path.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/cnh|identidade|certidao|nascimento|casamento|documentos pessoais/.test(value)) return 'identidade'
  if (/matricula|car\b|ccir|itr|imovel|fazenda|area|kml|outorga|planta/.test(value)) return 'patrimonio'
  if (/laudo|vistoria|safra|custeio|insumo|nota fiscal|nf |quadro safra|producao/.test(value)) return 'agro'
  if (/irpf|declaracao|recibo|fiscal/.test(value)) return 'fiscal'
  if (/contrato|acordo|confissao|proposta|divida|ccb|cessao|scr|registrato|processo|aditivo/.test(value)) return 'contrato'
  return 'outros'
}

async function planFiles(root: string, item: PackagePlan): Promise<PlannedFile[]> {
  const directory = resolve(root, item.directory)
  return (await walk(directory)).map((absolutePath) => {
    const sourcePath = relative(directory, absolutePath).split(sep).join('/')
    return {
      absolutePath,
      sourcePath,
      sourcePackage: item.sourcePackage || item.directory,
      clienteId: item.clienteId,
      demandaId: item.demandaId,
      categoria: inferCategory(sourcePath),
    }
  })
}

async function uploadFile(apiUrl: string, batchId: string, file: PlannedFile) {
  const bytes = await readFile(file.absolutePath)
  const extension = extname(file.absolutePath).toLowerCase()
  const mime = mimeByExtension[extension]
  if (!mime) throw new Error(`Extensão sem suporte: ${extension || '(sem extensão)'}`)
  if (bytes.length > 25 * 1024 * 1024) throw new Error('Arquivo excede 25 MB')

  const query = new URLSearchParams({
    categoria: file.categoria,
    importBatchId: batchId,
    sourcePackage: file.sourcePackage,
    sourcePath: file.sourcePath,
  })
  if (file.demandaId) query.set('demandaId', file.demandaId)
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), basename(file.absolutePath))
  const response = await fetch(`${apiUrl}/api/clientes/${encodeURIComponent(file.clienteId)}/documentos?${query}`, {
    method: 'POST',
    body: form,
  })
  const body = await response.json() as { success?: boolean; duplicate?: boolean; error?: string; data?: { id?: string } }
  if (!response.ok || body.success === false) throw new Error(body.error || `HTTP ${response.status}`)
  return { duplicate: body.duplicate === true, documentId: body.data?.id }
}

async function main() {
  const { planPath, dryRun } = parseArgs()
  const plan = planSchema.parse(JSON.parse(await readFile(planPath, 'utf8')))
  const root = resolve(plan.root)
  const apiUrl = (plan.apiUrl || process.env.ALETIS_API_URL || 'http://127.0.0.1:3011').replace(/\/$/, '')
  const files = (await Promise.all(plan.packages.map((item) => planFiles(root, item)))).flat()

  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'commit', batchId: plan.batchId, apiUrl, files: files.length }, null, 2))
  if (dryRun) {
    const summary = Object.entries(files.reduce<Record<string, number>>((acc, file) => {
      const key = `${file.clienteId}|${file.sourcePackage}|${file.categoria}`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})).map(([key, total]) => ({ key, total }))
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  let cursor = 0
  const results: Array<{ file: string; status: 'imported' | 'duplicate' | 'error'; documentId?: string; error?: string }> = []
  const worker = async () => {
    while (cursor < files.length) {
      const file = files[cursor++]
      try {
        const result = await uploadFile(apiUrl, plan.batchId, file)
        results.push({ file: `${file.sourcePackage}/${file.sourcePath}`, status: result.duplicate ? 'duplicate' : 'imported', documentId: result.documentId })
        process.stdout.write(result.duplicate ? '=' : '.')
      } catch (error) {
        results.push({ file: `${file.sourcePackage}/${file.sourcePath}`, status: 'error', error: (error as Error).message })
        process.stdout.write('!')
      }
    }
  }
  await Promise.all(Array.from({ length: plan.concurrency }, worker))
  process.stdout.write('\n')
  const summary = {
    total: results.length,
    imported: results.filter((item) => item.status === 'imported').length,
    duplicates: results.filter((item) => item.status === 'duplicate').length,
    errors: results.filter((item) => item.status === 'error'),
  }
  console.log(JSON.stringify(summary, null, 2))
  if (summary.errors.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})

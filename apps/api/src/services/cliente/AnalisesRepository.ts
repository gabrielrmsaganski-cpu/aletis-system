import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import type { AnaliseCliente } from './types.js'

/**
 * Persistência por-cliente das análises automáticas produzidas pelo
 * `AutoCalcOrchestrator`. Cada cliente tem um arquivo
 * `storage/clientes/<clienteId>.analise.json` — escrito via tmp+rename.
 *
 * Mantém um índice em memória reconstruído do disco ao boot.
 */
export class AnalisesRepository {
  private readonly dir: string
  private cache = new Map<string, AnaliseCliente>()

  constructor(storageDir: string) {
    this.dir = storageDir
    mkdirSync(this.dir, { recursive: true })
    this.loadAll()
  }

  save(clienteId: string, analise: AnaliseCliente): void {
    this.cache.set(clienteId, analise)
    const file = this.fileFor(clienteId)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(analise))
    renameSync(tmp, file)
  }

  get(clienteId: string): AnaliseCliente | null {
    return this.cache.get(clienteId) ?? null
  }

  has(clienteId: string): boolean {
    return this.cache.has(clienteId)
  }

  delete(clienteId: string): void {
    this.cache.delete(clienteId)
    const file = this.fileFor(clienteId)
    if (existsSync(file)) {
      try {
        unlinkSync(file)
      } catch {
        // best-effort
      }
    }
  }

  all(): Array<{ clienteId: string; analise: AnaliseCliente }> {
    return Array.from(this.cache.entries()).map(([clienteId, analise]) => ({ clienteId, analise }))
  }

  private fileFor(clienteId: string): string {
    const safe = clienteId.replace(/[^a-zA-Z0-9_-]/g, '_')
    return join(this.dir, `${safe}.analise.json`)
  }

  private loadAll(): void {
    try {
      const files = readdirSync(this.dir).filter((f) => f.endsWith('.analise.json'))
      for (const f of files) {
        try {
          const raw = readFileSync(join(this.dir, f), 'utf8')
          const analise = JSON.parse(raw) as AnaliseCliente
          const clienteId = f.replace(/\.analise\.json$/, '')
          this.cache.set(clienteId, analise)
        } catch (err) {
          console.warn(`[AnalisesRepository] falha lendo ${f}`, err)
        }
      }
    } catch {
      // dir recém-criado, ok
    }
  }
}

let _instance: AnalisesRepository | null = null

export function getAnalisesRepository(): AnalisesRepository {
  if (!_instance) {
    const dir = join(process.cwd(), 'storage/clientes')
    _instance = new AnalisesRepository(dir)
  }
  return _instance
}

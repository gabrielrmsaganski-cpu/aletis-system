// ============================================================
// InventarioService — CRUD de patrimônio por cliente
// ============================================================
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Patrimonio, InventarioCliente, TipoPatrimonio } from './types.js'

function now(): string {
  return new Date().toISOString()
}

function genId(tipo: string): string {
  return `pat_${tipo}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

const TIPOS: TipoPatrimonio[] = [
  'maquinario',
  'veiculo',
  'imovel_rural',
  'benfeitoria',
  'implemento',
  'animal',
  'estoque',
]

function emptyResumo(): InventarioCliente['resumo'] {
  const byTipo = {} as InventarioCliente['resumo']['porTipo']
  for (const t of TIPOS) byTipo[t] = { count: 0, valor: 0 }
  return { totalAtivos: 0, valorTotalAtual: 0, valorGarantiaTotal: 0, porTipo: byTipo }
}

export class InventarioService {
  private readonly storageDir: string

  constructor(storageRoot?: string) {
    const root = storageRoot || process.env.ALIX_STORAGE_DIR || join(process.cwd(), 'storage')
    this.storageDir = join(root, 'inventario')
    if (!existsSync(this.storageDir)) mkdirSync(this.storageDir, { recursive: true })
  }

  private fileFor(clienteId: string): string {
    const safeId = String(clienteId).replace(/[^a-zA-Z0-9_-]/g, '_')
    return join(this.storageDir, `${safeId}.json`)
  }

  get(clienteId: string): InventarioCliente {
    const file = this.fileFor(clienteId)
    if (!existsSync(file)) {
      return { clienteId, atualizadoEm: now(), ativos: [], resumo: emptyResumo() }
    }
    try {
      const raw = readFileSync(file, 'utf-8')
      const parsed = JSON.parse(raw) as InventarioCliente
      return { ...parsed, resumo: this.calcResumo(parsed.ativos) }
    } catch (err) {
      console.warn('[InventarioService] load falhou:', (err as Error).message)
      return { clienteId, atualizadoEm: now(), ativos: [], resumo: emptyResumo() }
    }
  }

  private save(inv: InventarioCliente): void {
    try {
      const dados: InventarioCliente = {
        ...inv,
        atualizadoEm: now(),
        resumo: this.calcResumo(inv.ativos),
      }
      writeFileSync(this.fileFor(inv.clienteId), JSON.stringify(dados, null, 2))

      // Wave-PG-16: dual-write best-effort no Postgres
      void (async () => {
        try {
          const repo = await import('../../db/InventarioCusteioRepository.js')
          await repo.upsertInventario(dados as unknown as Parameters<typeof repo.upsertInventario>[0])
        } catch (err) {
          console.warn('[InventarioService.save] dual-write PG falhou:', (err as Error).message)
        }
      })()
    } catch (err) {
      console.warn('[InventarioService] save falhou:', (err as Error).message)
      throw err
    }
  }

  private calcResumo(ativos: Patrimonio[]): InventarioCliente['resumo'] {
    const resumo = emptyResumo()
    for (const a of ativos) {
      if (a.status !== 'ativo') continue
      resumo.totalAtivos++
      const v = Number(a.valorAtual ?? a.valorAquisicao ?? 0)
      resumo.valorTotalAtual += v
      const g = Number(a.valorGarantia ?? (a.garantiaDisponivel ? v * 0.7 : 0))
      resumo.valorGarantiaTotal += g
      const b = resumo.porTipo[a.tipo]
      if (b) {
        b.count++
        b.valor += v
      }
    }
    resumo.valorTotalAtual = Number(resumo.valorTotalAtual.toFixed(2))
    resumo.valorGarantiaTotal = Number(resumo.valorGarantiaTotal.toFixed(2))
    return resumo
  }

  listarPorTipo(clienteId: string, tipo: TipoPatrimonio): Patrimonio[] {
    const inv = this.get(clienteId)
    return inv.ativos.filter((a) => a.tipo === tipo)
  }

  adicionar(clienteId: string, patrimonio: Omit<Patrimonio, 'id' | 'criadoEm' | 'atualizadoEm' | 'clienteId'>): Patrimonio {
    const inv = this.get(clienteId)
    const novo = {
      ...patrimonio,
      id: genId(patrimonio.tipo),
      clienteId,
      criadoEm: now(),
      atualizadoEm: now(),
    } as Patrimonio
    inv.ativos.push(novo)
    this.save(inv)
    return novo
  }

  atualizar(clienteId: string, id: string, patch: Partial<Patrimonio>): Patrimonio | null {
    const inv = this.get(clienteId)
    const idx = inv.ativos.findIndex((a) => a.id === id)
    if (idx < 0) return null
    const atual = inv.ativos[idx]
    const atualizado = { ...atual, ...patch, id: atual.id, clienteId, atualizadoEm: now() } as Patrimonio
    inv.ativos[idx] = atualizado
    this.save(inv)
    return atualizado
  }

  remover(clienteId: string, id: string): boolean {
    const inv = this.get(clienteId)
    const idx = inv.ativos.findIndex((a) => a.id === id)
    if (idx < 0) return false
    inv.ativos.splice(idx, 1)
    this.save(inv)
    return true
  }

  /** Muda status (ativo/vendido/baixado/manutencao) */
  mudarStatus(clienteId: string, id: string, status: Patrimonio['status'], motivo?: string): Patrimonio | null {
    return this.atualizar(clienteId, id, { status, observacoes: motivo } as any)
  }

  /** Calcula valor total de garantia potencial para negociação bancária. */
  valorGarantiaDisponivel(clienteId: string): {
    total: number
    porTipo: Record<string, { count: number; valor: number }>
    detalhes: Array<{ id: string; nome: string; tipo: string; valor: number }>
  } {
    const inv = this.get(clienteId)
    const detalhes: Array<{ id: string; nome: string; tipo: string; valor: number }> = []
    const porTipo: Record<string, { count: number; valor: number }> = {}
    let total = 0
    for (const a of inv.ativos) {
      if (a.status !== 'ativo' || !a.garantiaDisponivel) continue
      const g = Number(a.valorGarantia ?? ((a.valorAtual ?? a.valorAquisicao ?? 0) * 0.7))
      if (g <= 0) continue
      total += g
      if (!porTipo[a.tipo]) porTipo[a.tipo] = { count: 0, valor: 0 }
      porTipo[a.tipo].count++
      porTipo[a.tipo].valor += g
      detalhes.push({ id: a.id, nome: a.nome, tipo: a.tipo, valor: g })
    }
    return { total: Number(total.toFixed(2)), porTipo, detalhes }
  }
}

let _instance: InventarioService | null = null
export function getInventarioService(): InventarioService {
  if (!_instance) _instance = new InventarioService()
  return _instance
}

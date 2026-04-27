// ============================================================
// AlertRulesService — alertas de mercado por cliente (Wave B1)
// ============================================================
// Christian define regras tipo "me avisa quando soja > R$ 130/saca para
// o cliente Fazenda São José" ou "me alerta se dólar < 4.80 — meu
// cliente exportador X precisa travar hedge".
//
// Storage: storage/alix-rules/{clienteId}.json (array de AlertRule).
// Watcher em ProactiveService cruza regras com MarketBriefService a cada
// 30min e dispara insight `alerta-preco-disparado` quando bate, com
// cooldown configurável (default 7 dias) para não floodar.
// ============================================================

import { mkdirSync, existsSync, readFileSync, readdirSync } from 'fs'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

export type AlertOperador = '>' | '<' | '>=' | '<='
export type AlertTipo = 'commodity' | 'cambio' | 'macro'

export interface AlertRule {
  id: string
  clienteId: string
  tipo: AlertTipo
  /** simbolo identifica o que monitorar:
   *  - commodity: soja|milho|boi|cafe|algodao
   *  - cambio: usd|eur|cny
   *  - macro: selic|ipca12m|cdi|igpm12m */
  simbolo: string
  operador: AlertOperador
  valor: number
  unidade?: string
  motivo?: string
  ativo: boolean
  criadoEm: string
  ultimoDisparo?: string
  cooldownDias: number
}

export interface AlertEvaluation {
  rule: AlertRule
  bateu: boolean
  valorAtual: number | null
  unidadeAtual?: string
  fonte?: string
  /** Se true, está em cooldown e não deve disparar agora */
  emCooldown: boolean
}

const SIMBOLOS_VALIDOS: Record<AlertTipo, string[]> = {
  commodity: ['soja', 'milho', 'boi', 'cafe', 'algodao'],
  cambio: ['usd', 'eur', 'cny'],
  macro: ['selic', 'ipca12m', 'cdi', 'igpm12m'],
}

export class AlertRulesService {
  private readonly storageDir: string

  constructor(storageDir: string) {
    this.storageDir = join(storageDir, 'alix-rules')
    if (!existsSync(this.storageDir)) mkdirSync(this.storageDir, { recursive: true })
  }

  private fileFor(clienteId: string): string {
    // sanitiza para evitar path traversal
    const safe = clienteId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
    return join(this.storageDir, `${safe}.json`)
  }

  /** Lê regras de um cliente. Cria array vazio se arquivo não existe. */
  list(clienteId: string): AlertRule[] {
    try {
      const file = this.fileFor(clienteId)
      if (!existsSync(file)) return []
      const raw = readFileSync(file, 'utf-8')
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : []
    } catch (err) {
      console.warn(`[AlertRules] falha lendo regras de ${clienteId}:`, (err as Error).message)
      return []
    }
  }

  /** Lê todas as regras (todos clientes). Para o watcher. */
  listAll(): AlertRule[] {
    const out: AlertRule[] = []
    try {
      const files = readdirSync(this.storageDir).filter(f => f.endsWith('.json'))
      for (const f of files) {
        const clienteId = f.replace(/\.json$/, '')
        try {
          const raw = readFileSync(join(this.storageDir, f), 'utf-8')
          const arr = JSON.parse(raw)
          if (Array.isArray(arr)) out.push(...arr)
        } catch {/* skip corrupt */}
      }
    } catch {/* dir empty */}
    return out
  }

  /** Cria nova regra. Valida campos. */
  async create(params: {
    clienteId: string
    tipo: AlertTipo
    simbolo: string
    operador: AlertOperador
    valor: number
    unidade?: string
    motivo?: string
    cooldownDias?: number
  }): Promise<AlertRule> {
    const { clienteId, tipo, simbolo, operador, valor } = params
    if (!clienteId) throw new Error('clienteId obrigatório')
    if (!SIMBOLOS_VALIDOS[tipo]) throw new Error(`tipo inválido: ${tipo}`)
    const simboloKey = String(simbolo).toLowerCase()
    if (!SIMBOLOS_VALIDOS[tipo].includes(simboloKey)) {
      throw new Error(`simbolo "${simbolo}" inválido para tipo "${tipo}". Use: ${SIMBOLOS_VALIDOS[tipo].join('|')}`)
    }
    if (!['>', '<', '>=', '<='].includes(operador)) throw new Error(`operador inválido: ${operador}`)
    if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new Error(`valor numérico obrigatório`)

    const rule: AlertRule = {
      id: `rule_${randomUUID()}`,
      clienteId,
      tipo,
      simbolo: simboloKey,
      operador,
      valor,
      unidade: params.unidade,
      motivo: params.motivo?.slice(0, 300),
      ativo: true,
      criadoEm: new Date().toISOString(),
      cooldownDias: Math.max(0, Math.min(60, params.cooldownDias ?? 7)),
    }

    const all = this.list(clienteId)
    all.push(rule)
    await this.persist(clienteId, all)
    return rule
  }

  async update(ruleId: string, patch: Partial<Pick<AlertRule, 'valor' | 'operador' | 'ativo' | 'cooldownDias' | 'motivo'>>): Promise<AlertRule | null> {
    const all = this.listAll()
    const found = all.find(r => r.id === ruleId)
    if (!found) return null
    Object.assign(found, patch)
    const cliRules = all.filter(r => r.clienteId === found.clienteId)
    await this.persist(found.clienteId, cliRules)
    return found
  }

  async delete(ruleId: string): Promise<boolean> {
    const all = this.listAll()
    const found = all.find(r => r.id === ruleId)
    if (!found) return false
    const remaining = all.filter(r => r.clienteId === found.clienteId && r.id !== ruleId)
    if (remaining.length === 0) {
      try { await unlink(this.fileFor(found.clienteId)) } catch {/* ok */}
    } else {
      await this.persist(found.clienteId, remaining)
    }
    return true
  }

  /**
   * Marca uma regra como "disparada agora" — atualiza ultimoDisparo
   * e persiste. Chamado pelo watcher após emitir o insight.
   */
  async markFired(ruleId: string): Promise<void> {
    const all = this.listAll()
    const found = all.find(r => r.id === ruleId)
    if (!found) return
    found.ultimoDisparo = new Date().toISOString()
    const cliRules = all.filter(r => r.clienteId === found.clienteId)
    await this.persist(found.clienteId, cliRules)
  }

  /**
   * Avalia uma regra contra o snapshot de mercado fornecido.
   * Retorna se bateu + se está em cooldown.
   */
  evaluate(rule: AlertRule, brief: {
    macro: { selic: number | null; ipca12m: number | null; cdi: number | null; igpm12m: number | null; dolar: number | null; euro: number | null }
    cambio: { usd: number | null; eur: number | null; cny: number | null }
    commodities: Array<{ simbolo: string; preco: number; unidade: string; fonte: string }>
  }): AlertEvaluation {
    let valorAtual: number | null = null
    let unidadeAtual: string | undefined
    let fonte: string | undefined

    if (rule.tipo === 'commodity') {
      const c = brief.commodities.find(x => x.simbolo.toLowerCase() === rule.simbolo)
      if (c) {
        valorAtual = c.preco
        unidadeAtual = c.unidade
        fonte = c.fonte
      }
    } else if (rule.tipo === 'cambio') {
      if (rule.simbolo === 'usd') valorAtual = brief.cambio.usd
      else if (rule.simbolo === 'eur') valorAtual = brief.cambio.eur
      else if (rule.simbolo === 'cny') valorAtual = brief.cambio.cny
      unidadeAtual = 'BRL'
      fonte = 'AwesomeAPI'
    } else if (rule.tipo === 'macro') {
      if (rule.simbolo === 'selic') valorAtual = brief.macro.selic
      else if (rule.simbolo === 'ipca12m') valorAtual = brief.macro.ipca12m
      else if (rule.simbolo === 'cdi') valorAtual = brief.macro.cdi
      else if (rule.simbolo === 'igpm12m') valorAtual = brief.macro.igpm12m
      unidadeAtual = '%'
      fonte = 'BCB'
    }

    let bateu = false
    if (valorAtual !== null) {
      switch (rule.operador) {
        case '>': bateu = valorAtual > rule.valor; break
        case '<': bateu = valorAtual < rule.valor; break
        case '>=': bateu = valorAtual >= rule.valor; break
        case '<=': bateu = valorAtual <= rule.valor; break
      }
    }

    let emCooldown = false
    if (rule.ultimoDisparo && rule.cooldownDias > 0) {
      const cooldownMs = rule.cooldownDias * 86400_000
      const passou = Date.now() - new Date(rule.ultimoDisparo).getTime()
      emCooldown = passou < cooldownMs
    }

    return { rule, bateu, valorAtual, unidadeAtual, fonte, emCooldown }
  }

  private async persist(clienteId: string, rules: AlertRule[]): Promise<void> {
    const file = this.fileFor(clienteId)
    const tmp = `${file}.tmp`
    await writeFile(tmp, JSON.stringify(rules, null, 2))
    // rename é atômico; importamos lazy
    const { rename } = await import('fs/promises')
    await rename(tmp, file)
  }
}

let _instance: AlertRulesService | null = null
export function getAlertRulesService(storageDir?: string): AlertRulesService {
  if (!_instance) {
    const dir = storageDir || process.env.ALIX_STORAGE_DIR || join(process.cwd(), 'storage')
    _instance = new AlertRulesService(dir)
  }
  return _instance
}

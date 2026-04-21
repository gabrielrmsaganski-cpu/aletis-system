/**
 * FiscalService — CRUD e agregação de Certidões Negativas de
 * Débito (CNDs) por cliente.
 *
 * Persistência: um arquivo JSON por cliente em
 *   apps/api/storage/fiscal/{clienteId}.json
 * contendo um array de `CertidaoCND` (write-tmp + rename).
 *
 * Não depende de banco — toda agregação é feita em memória a
 * partir do array persistido.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type {
  CertidaoCND,
  CertidaoCNDCreatePayload,
  CertidaoCNDUpdatePayload,
  ChecklistFiscal,
  StatusCND,
  TipoCND,
} from '@aletis/shared-types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Resolve a partir de apps/api/src/services/fiscal → ../../storage/fiscal
const STORAGE_DIR = join(__dirname, '..', '..', '..', 'storage', 'fiscal')

/** Tipos obrigatórios para score fiscal completo. */
const TIPOS_OBRIGATORIOS_DEFAULT: TipoCND[] = [
  'federal_receita',
  'estadual',
  'municipal',
  'trabalhista',
  'fgts',
]

const LABEL_TIPO: Record<TipoCND, string> = {
  federal_receita: 'CND Federal (Receita)',
  estadual: 'CND Estadual (SEFAZ)',
  municipal: 'CND Municipal',
  trabalhista: 'CNDT Trabalhista',
  fgts: 'CRF FGTS',
  inss: 'CND Previdenciária',
  ambiental: 'Regularidade Ambiental',
}

/** Sanitiza ids para uso como nome de arquivo. */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

function genId(): string {
  return 'cnd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Retorna número de dias entre hoje e uma data ISO (positivo = futuro). */
function diasAte(iso: string | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - hoje.getTime()) / (24 * 3600 * 1000))
}

export class FiscalService {
  private readonly dir: string
  private static instance: FiscalService | null = null

  constructor(baseDir: string = STORAGE_DIR) {
    this.dir = baseDir
    mkdirSync(this.dir, { recursive: true })
  }

  static getInstance(): FiscalService {
    if (!this.instance) this.instance = new FiscalService()
    return this.instance
  }

  // ───────── FS helpers ─────────

  private fileFor(clienteId: string): string {
    return join(this.dir, `${sanitizeId(clienteId)}.json`)
  }

  private writeAtomic(clienteId: string, cnds: CertidaoCND[]): void {
    const final = this.fileFor(clienteId)
    const tmp = `${final}.tmp`
    writeFileSync(tmp, JSON.stringify(cnds, null, 2), 'utf8')
    renameSync(tmp, final)
  }

  private read(clienteId: string): CertidaoCND[] {
    const file = this.fileFor(clienteId)
    if (!existsSync(file)) return []
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'))
      return Array.isArray(raw) ? (raw as CertidaoCND[]) : []
    } catch (err) {
      console.warn(`[FiscalService] falha lendo ${file}`, err)
      return []
    }
  }

  // ───────── CRUD ─────────

  listar(clienteId: string): CertidaoCND[] {
    return this.read(clienteId).sort((a, b) =>
      (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''),
    )
  }

  adicionar(clienteId: string, payload: CertidaoCNDCreatePayload): CertidaoCND {
    const lista = this.read(clienteId)
    const agora = nowIso()
    const cnd: CertidaoCND = {
      id: genId(),
      clienteId,
      tipo: payload.tipo,
      numero: payload.numero,
      dataEmissao: payload.dataEmissao,
      dataValidade: payload.dataValidade,
      status: this.resolverStatus(payload.status, payload.dataValidade),
      url: payload.url,
      observacoes: payload.observacoes,
      criadoEm: agora,
      atualizadoEm: agora,
    }
    lista.push(cnd)
    this.writeAtomic(clienteId, lista)
    return cnd
  }

  atualizar(
    clienteId: string,
    cndId: string,
    patch: CertidaoCNDUpdatePayload,
  ): CertidaoCND | null {
    const lista = this.read(clienteId)
    const idx = lista.findIndex((c) => c.id === cndId)
    if (idx < 0) return null
    const atual = lista[idx]
    const merged: CertidaoCND = {
      ...atual,
      ...patch,
      id: atual.id,
      clienteId: atual.clienteId,
      criadoEm: atual.criadoEm,
      atualizadoEm: nowIso(),
    }
    // Recalcula status se validade ou status foi alterada
    if (patch.dataValidade !== undefined || patch.status !== undefined) {
      merged.status = this.resolverStatus(merged.status, merged.dataValidade)
    }
    lista[idx] = merged
    this.writeAtomic(clienteId, lista)
    return merged
  }

  remover(clienteId: string, cndId: string): boolean {
    const lista = this.read(clienteId)
    const n = lista.length
    const filtrada = lista.filter((c) => c.id !== cndId)
    if (filtrada.length === n) return false
    this.writeAtomic(clienteId, filtrada)
    return true
  }

  // ───────── Agregação ─────────

  /**
   * Calcula o checklist fiscal agregado.
   * Score = (validas / 5) * 100, descontando 20 pontos por CND
   * positiva (débito ativo) e 10 pontos por vencida. Clampeado
   * em [0, 100].
   * Alertas incluem validade próxima (<= 15 dias), positivas e
   * tipos obrigatórios faltando.
   */
  calcularChecklist(
    clienteId: string,
    tiposObrigatorios: TipoCND[] = TIPOS_OBRIGATORIOS_DEFAULT,
  ): ChecklistFiscal {
    const lista = this.read(clienteId)
    const alertas: string[] = []

    let validas = 0
    let vencidas = 0
    let positivas = 0
    const tiposPresentes = new Set<TipoCND>()

    for (const c of lista) {
      const efetivo = this.resolverStatus(c.status, c.dataValidade)
      tiposPresentes.add(c.tipo)

      if (efetivo === 'positiva') positivas++
      if (efetivo === 'vencida') vencidas++
      if (efetivo === 'negativa' || efetivo === 'positiva_com_efeitos') {
        validas++
      }

      const dias = diasAte(c.dataValidade)
      if (dias !== null && dias >= 0 && dias <= 15 && efetivo !== 'ausente') {
        alertas.push(
          `${LABEL_TIPO[c.tipo]} vence em ${dias} dia${dias === 1 ? '' : 's'}`,
        )
      }
      if (efetivo === 'positiva') {
        alertas.push(`${LABEL_TIPO[c.tipo]} com débito ativo (positiva)`)
      }
      if (efetivo === 'vencida') {
        alertas.push(`${LABEL_TIPO[c.tipo]} vencida — reemitir`)
      }
    }

    const tiposFaltando = tiposObrigatorios.filter((t) => !tiposPresentes.has(t))
    const ausentes = tiposFaltando.length
    for (const t of tiposFaltando) {
      alertas.push(`${LABEL_TIPO[t]} ausente — emitir`)
    }

    // Base score: quantidade de obrigatórias válidas / 5 * 100
    const validasObrigatorias = tiposObrigatorios.filter((t) => {
      const c = lista.find((x) => x.tipo === t)
      if (!c) return false
      const st = this.resolverStatus(c.status, c.dataValidade)
      return st === 'negativa' || st === 'positiva_com_efeitos'
    }).length
    let score = (validasObrigatorias / Math.max(1, tiposObrigatorios.length)) * 100
    score -= positivas * 20
    score -= vencidas * 10
    score = Math.max(0, Math.min(100, Math.round(score)))

    return {
      clienteId,
      totalCertidoes: lista.length,
      validas,
      vencidas,
      ausentes,
      positivas,
      tiposObrigatorios,
      tiposFaltando,
      scoreFiscal: score,
      ultimaAtualizacao: nowIso(),
      alertas,
    }
  }

  // ───────── Helpers ─────────

  /**
   * Normaliza status considerando a data de validade. Se a certidão
   * foi marcada como `negativa` ou `positiva_com_efeitos` mas a
   * validade já passou, o status efetivo é `vencida`. Se nada foi
   * informado, assume `ausente`.
   */
  resolverStatus(status: StatusCND | undefined, dataValidade: string | undefined): StatusCND {
    if (!status) {
      if (dataValidade) {
        const dias = diasAte(dataValidade)
        if (dias !== null && dias < 0) return 'vencida'
        return 'negativa'
      }
      return 'ausente'
    }
    if (status === 'negativa' || status === 'positiva_com_efeitos') {
      const dias = diasAte(dataValidade)
      if (dias !== null && dias < 0) return 'vencida'
    }
    return status
  }
}

export function getFiscalService(): FiscalService {
  return FiscalService.getInstance()
}

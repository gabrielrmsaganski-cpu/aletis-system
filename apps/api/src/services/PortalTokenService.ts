/**
 * PortalTokenService
 *
 * Tokens de uso único para o Portal do Cliente: magic-link de acesso
 * sem senha, reset de senha autosserviço, e refresh para sessões longas.
 *
 * Escolhas:
 *   - O token cru sai uma única vez (URL-safe, 32 bytes hex). Persistimos
 *     apenas SHA-256 → mesmo com leak do banco, ninguém consegue resgatar
 *     um token existente.
 *   - TTL curto: magic 15min · reset 30min · refresh 30 dias.
 *   - Cada token serve uma vez (consumidoEm) e fica em memória até ser
 *     persistido em PG (commit posterior). Hoje o store é volátil mas
 *     já segue o contrato que será espelhado no banco.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export type TokenTipo = 'magic' | 'reset' | 'refresh'

export interface TokenRecord {
  id: string
  clienteId: string
  tipo: TokenTipo
  tokenHash: string
  expiraEm: number
  consumidoEm?: number
  criadoEm: number
  canal?: 'email' | 'whatsapp' | 'sms'
  metadata?: Record<string, unknown>
}

const TTL_MS: Record<TokenTipo, number> = {
  magic: 15 * 60 * 1_000,
  reset: 30 * 60 * 1_000,
  refresh: 30 * 24 * 60 * 60 * 1_000,
}

/**
 * Store em memória — único por processo. Em produção, PortalRepository
 * (a vir) replica em PG via tabela portal_token. A interface deste serviço
 * não muda quando trocarmos o backend.
 */
const STORE = new Map<string, TokenRecord>()

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function newId(): string {
  return `tk-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
}

/** Emite um token cru e persiste seu hash. Retorna o cru UMA vez. */
export function emitirToken(params: {
  clienteId: string
  tipo: TokenTipo
  canal?: TokenRecord['canal']
  metadata?: TokenRecord['metadata']
}): { token: string; record: TokenRecord } {
  const tokenRaw = randomBytes(32).toString('hex')
  const tokenHash = sha256(tokenRaw)
  const agora = Date.now()
  const record: TokenRecord = {
    id: newId(),
    clienteId: params.clienteId,
    tipo: params.tipo,
    tokenHash,
    expiraEm: agora + TTL_MS[params.tipo],
    criadoEm: agora,
    canal: params.canal,
    metadata: params.metadata,
  }
  STORE.set(record.id, record)
  // Token cru carrega o id para lookup direto.
  return { token: `${record.id}.${tokenRaw}`, record }
}

/**
 * Valida e consome um token. Retorna o registro ou null se inválido,
 * expirado ou já consumido. Após retorno, o registro fica imutável.
 */
export function consumirToken(token: string, tipo: TokenTipo): TokenRecord | null {
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const id = token.slice(0, dot)
  const raw = token.slice(dot + 1)
  const record = STORE.get(id)
  if (!record) return null
  if (record.tipo !== tipo) return null
  if (record.consumidoEm) return null
  if (Date.now() > record.expiraEm) return null

  const calc = Buffer.from(sha256(raw), 'hex')
  const stored = Buffer.from(record.tokenHash, 'hex')
  if (calc.length !== stored.length || !timingSafeEqual(calc, stored)) return null

  record.consumidoEm = Date.now()
  return { ...record }
}

/** Revoga todos os tokens ativos de um cliente para um tipo. Usado em rotação de senha. */
export function revogarTokensCliente(clienteId: string, tipo: TokenTipo): number {
  let n = 0
  for (const [id, r] of STORE) {
    if (r.clienteId === clienteId && r.tipo === tipo && !r.consumidoEm) {
      r.consumidoEm = Date.now()
      STORE.delete(id) // hard remove já que está consumido
      n++
    }
  }
  return n
}

/** GC simples — chamado periodicamente do server para evitar leak. */
export function purgarExpirados(): number {
  const agora = Date.now()
  let n = 0
  for (const [id, r] of STORE) {
    if (r.consumidoEm || agora > r.expiraEm) {
      STORE.delete(id)
      n++
    }
  }
  return n
}

/** Para testes: limpa o store. */
export function _resetStore(): void {
  STORE.clear()
}

/** Para testes: snapshot. */
export function _peekStore(): TokenRecord[] {
  return Array.from(STORE.values())
}

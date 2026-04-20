/**
 * PortalAuthService
 *
 * Serviço de autenticação do Portal do Cliente. Usa `scrypt` nativo do
 * Node (zero dependências externas, resistente a brute force via custo de
 * CPU/memória) para gerar e verificar hash de senha, e `@fastify/jwt`
 * (já registrado no server) para emitir tokens de sessão.
 *
 * Credenciais ficam persistidas no próprio objeto Cliente
 * (`portalAcesso`) em memória, coerente com o padrão atual do backend.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/** Parâmetros scrypt: N=16384 (2^14), r=8, p=1 — padrão recomendado. */
const SCRYPT_KEYLEN = 64
const SCRYPT_COST = 16384

/** Estrutura persistida no Cliente.portalAcesso. */
export interface PortalAcesso {
  /** Usuário de login (CPF/CNPJ só dígitos ou e-mail). Único por cliente. */
  usuario: string
  /** Hash scrypt em hex. */
  senhaHash: string
  /** Salt em hex. */
  salt: string
  /** Habilitado para login? */
  ativo: boolean
  /** Datas auditáveis. */
  criadoEm: string
  atualizadoEm: string
  ultimoLoginEm?: string
  /** Se true, cliente precisa trocar senha no próximo login. */
  forcaTrocaSenha: boolean
}

/** Payload do JWT emitido. */
export interface PortalJwtPayload {
  sub: string              // clienteId
  usuario: string
  kind: 'portal-cliente'
}

/** Gera senha temporária legível (8 dígitos + 4 letras maiúsculas). */
export function gerarSenhaTemporaria(): string {
  const digits = Math.floor(10000000 + Math.random() * 90000000).toString()
  const letters = Array.from({ length: 4 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('')
  return `${letters}${digits}`
}

/** Produz hash scrypt da senha + salt aleatório. */
export function hashSenha(senha: string): { senhaHash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(senha, salt, SCRYPT_KEYLEN, { cost: SCRYPT_COST })
  return { senhaHash: hash.toString('hex'), salt }
}

/** Verifica senha contra hash em tempo constante. */
export function verificarSenha(senha: string, senhaHash: string, salt: string): boolean {
  const derivada = scryptSync(senha, salt, SCRYPT_KEYLEN, { cost: SCRYPT_COST })
  const armazenada = Buffer.from(senhaHash, 'hex')
  if (derivada.length !== armazenada.length) return false
  return timingSafeEqual(derivada, armazenada)
}

/** Cria ou reseta acesso de um cliente, devolvendo a senha em claro UMA vez. */
export function criarAcessoPortal(params: {
  usuario: string
  senhaInicial?: string
}): { acesso: PortalAcesso; senhaTemporaria: string } {
  const senha = params.senhaInicial?.trim() || gerarSenhaTemporaria()
  const { senhaHash, salt } = hashSenha(senha)
  const agora = new Date().toISOString()
  return {
    acesso: {
      usuario: params.usuario.trim().toLowerCase(),
      senhaHash,
      salt,
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
      forcaTrocaSenha: !params.senhaInicial,
    },
    senhaTemporaria: senha,
  }
}

/** Normaliza usuário (trim, lowercase, opcionalmente só dígitos). */
export function normalizarUsuario(input: string): string {
  return input.trim().toLowerCase()
}

/** Normaliza CPF/CNPJ só para dígitos (aceita máscara). */
export function normalizarCpfCnpj(input: string): string {
  return input.replace(/\D/g, '')
}

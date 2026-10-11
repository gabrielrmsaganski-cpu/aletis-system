import { z } from 'zod'
import { getPool, isPgEnabled } from '../../db/client.js'
import { clientes } from '../../routes/clientes.js'
import type { PortalAcesso } from '../PortalAuthService.js'

const accessSchema = z.object({
  usuario: z.string().trim().min(2).max(254), senhaHash: z.string().regex(/^[a-f0-9]{128}$/),
  salt: z.string().regex(/^[a-f0-9]{32}$/), ativo: z.boolean(), forcaTrocaSenha: z.boolean(),
  criadoEm: z.string().datetime(), atualizadoEm: z.string().datetime(), ultimoLoginEm: z.string().datetime().optional(),
}).passthrough()

function asAccess(row: Record<string, any>): PortalAcesso {
  return {
    usuario: row.usuario, senhaHash: row.senha_hash, salt: row.salt, ativo: row.ativo,
    forcaTrocaSenha: row.forca_troca_senha, criadoEm: new Date(row.criado_em).toISOString(),
    atualizadoEm: new Date(row.atualizado_em).toISOString(), ultimoLoginEm: row.ultimo_login_em ? new Date(row.ultimo_login_em).toISOString() : undefined,
  }
}

/** Credenciais duráveis e revogação consultada a cada acesso, sem depender do cache de boot. */
export async function loadPortalAccess(clienteId: string): Promise<PortalAcesso | null> {
  if (!isPgEnabled()) return clientes.get(clienteId)?.portalAcesso ?? null
  const { rows } = await getPool().query('SELECT * FROM portal_acesso WHERE cliente_id = $1', [clienteId])
  const client = clientes.get(clienteId)
  const access = rows[0] ? asAccess(rows[0]) : null
  if (client) client.portalAcesso = access ? { ...access, pushSubscriptions: client.portalAcesso?.pushSubscriptions } : undefined
  return access
}

export async function refreshPortalAccesses(): Promise<void> {
  if (!isPgEnabled()) return
  const { rows } = await getPool().query('SELECT * FROM portal_acesso')
  const byClient = new Map(rows.map(row => [row.cliente_id, asAccess(row)]))
  for (const client of clientes.values()) client.portalAcesso = byClient.has(client.id)
    ? { ...byClient.get(client.id)!, pushSubscriptions: client.portalAcesso?.pushSubscriptions }
    : undefined
}

export async function savePortalAccess(clienteId: string, input: PortalAcesso, expectedHash?: string): Promise<PortalAcesso> {
  const access = accessSchema.parse(input) as PortalAcesso
  access.usuario = access.usuario.toLocaleLowerCase('pt-BR')
  if (isPgEnabled()) {
    const tx = await getPool().connect()
    try {
      await tx.query('BEGIN')
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`portal-account:${access.usuario}`])
      const owner = await tx.query("SELECT id FROM cliente WHERE id=$1 AND (payload->'identityMerge'->>'status') IS DISTINCT FROM 'merged' FOR UPDATE", [clienteId])
      if (!owner.rowCount) throw Object.assign(new Error('Cliente não encontrado.'), { statusCode: 404 })
      const current = await tx.query('SELECT senha_hash,criado_em,atualizado_em FROM portal_acesso WHERE cliente_id=$1 FOR UPDATE', [clienteId])
      if (expectedHash && current.rows[0]?.senha_hash !== expectedHash) throw Object.assign(new Error('O acesso foi alterado. Entre novamente.'), { statusCode: 409 })
      if (current.rows[0]) {
        access.criadoEm = new Date(current.rows[0].criado_em).toISOString()
        access.atualizadoEm = new Date(Math.max(Date.now(), new Date(current.rows[0].atualizado_em).getTime() + 1)).toISOString()
      }
      const collision = await tx.query('SELECT cliente_id FROM portal_acesso WHERE lower(usuario)=$1 AND cliente_id<>$2', [access.usuario, clienteId])
      if (collision.rowCount) throw Object.assign(new Error('Este usuário já está em uso.'), { statusCode: 409 })
      await tx.query(`INSERT INTO portal_acesso (cliente_id,usuario,senha_hash,salt,ativo,forca_troca_senha,criado_em,atualizado_em,ultimo_login_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (cliente_id) DO UPDATE SET
        usuario=EXCLUDED.usuario,senha_hash=EXCLUDED.senha_hash,salt=EXCLUDED.salt,ativo=EXCLUDED.ativo,
        forca_troca_senha=EXCLUDED.forca_troca_senha,atualizado_em=EXCLUDED.atualizado_em,ultimo_login_em=EXCLUDED.ultimo_login_em`,
      [clienteId, access.usuario, access.senhaHash, access.salt, access.ativo, access.forcaTrocaSenha, access.criadoEm, access.atualizadoEm, access.ultimoLoginEm || null])
      await tx.query("UPDATE cliente SET payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{portalAcesso}',$2::jsonb,true) WHERE id=$1", [clienteId, JSON.stringify(access)])
      await tx.query('COMMIT')
    } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
  }
  const client = clientes.get(clienteId)
  if (client) client.portalAcesso = access
  return access
}

export async function deletePortalAccess(clienteId: string): Promise<void> {
  if (isPgEnabled()) {
    const tx = await getPool().connect()
    try {
      await tx.query('BEGIN')
      await tx.query('SELECT id FROM cliente WHERE id=$1 FOR UPDATE', [clienteId])
      await tx.query('DELETE FROM portal_acesso WHERE cliente_id=$1', [clienteId])
      await tx.query("UPDATE cliente SET payload=coalesce(payload,'{}'::jsonb)-'portalAcesso' WHERE id=$1", [clienteId])
      await tx.query('UPDATE portal_token SET consumido_em=now() WHERE cliente_id=$1 AND consumido_em IS NULL', [clienteId])
      await tx.query('COMMIT')
    } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
  }
  const client = clientes.get(clienteId)
  if (client) client.portalAcesso = undefined
}

export async function recordPortalLogin(clienteId: string): Promise<void> {
  const now = new Date().toISOString()
  if (isPgEnabled()) await getPool().query('UPDATE portal_acesso SET ultimo_login_em=$2 WHERE cliente_id=$1', [clienteId, now])
  const access = clientes.get(clienteId)?.portalAcesso
  if (access) access.ultimoLoginEm = now
}

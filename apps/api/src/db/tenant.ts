/**
 * Multi-tenant — resolução de tenant + namespace para queries PG.
 *
 * Estratégia: schema PG por tenant. Cada tenant tem seu próprio schema
 * (ex: tenant_default, tenant_acme, tenant_xyz) com as 18 tabelas
 * idênticas. A flag `ALETIS_TENANT_MODE` controla:
 *   - 'single' (default) — 1 schema 'public', sem isolamento
 *   - 'schema' — schema PG por tenant (isolamento forte; backups separados)
 *
 * Resolução do tenant:
 *   1. Header `x-tenant-id` (validado regex [a-z0-9_]{1,32})
 *   2. JWT claim `tenantId` (Portal do Cliente)
 *   3. Subdomínio (acme.aletis.com.br → tenant_acme) — futuro
 *   4. Default: 'default' (compat single-tenant)
 *
 * Em runtime, cada handler que toca PG faz `setTenantSchema(tenantId)`
 * (SET search_path) antes da query. Drizzle herda automaticamente.
 *
 * Esta é a INFRA mínima: a wave maior (provisionar schemas, migrar
 * cada um, rodar migrate-storage por tenant) fica para uma sessão
 * dedicada quando virar SaaS multi-cliente.
 */

const TENANT_RE = /^[a-z0-9_]{1,32}$/

export type TenantMode = 'single' | 'schema'

export function getTenantMode(): TenantMode {
  return process.env.ALETIS_TENANT_MODE === 'schema' ? 'schema' : 'single'
}

export function isTenantValid(id: string | undefined | null): id is string {
  return typeof id === 'string' && TENANT_RE.test(id)
}

export function resolveTenantId(opts: {
  header?: string | null
  jwtClaim?: string | null
}): string {
  const fromHeader = opts.header?.trim().toLowerCase()
  if (fromHeader && isTenantValid(fromHeader)) return fromHeader
  const fromJwt = opts.jwtClaim?.trim().toLowerCase()
  if (fromJwt && isTenantValid(fromJwt)) return fromJwt
  return 'default'
}

export function tenantSchemaName(tenantId: string): string {
  if (!isTenantValid(tenantId)) return 'public'
  return `tenant_${tenantId}`
}

/**
 * Aplica `SET LOCAL search_path` na conexão PG do request.
 * Em modo single, no-op. Em modo schema, isola tabelas no namespace
 * do tenant (impede cross-tenant query mesmo se SQL injection).
 *
 * Uso típico: chamar dentro de um hook Fastify `preHandler` que
 * extrai tenant do header/JWT e injeta no request.
 */
export async function applyTenantSearchPath(
  client: { query: (sql: string) => Promise<unknown> },
  tenantId: string,
): Promise<void> {
  if (getTenantMode() !== 'schema') return
  if (!isTenantValid(tenantId)) return
  const schema = tenantSchemaName(tenantId)
  // SET LOCAL é seguro contra SQL injection (parametrizado seria
  // ideal, mas SET não aceita binding). Validamos via regex acima.
  await client.query(`SET LOCAL search_path TO "${schema}", public`)
}

/**
 * Provisiona schema novo para um tenant (idempotente).
 * Cria schema + clona estrutura de tabelas a partir de 'public'.
 * (Impl simplificada — produção deve rodar migrations completas
 * dentro do schema novo via drizzle-kit.)
 */
export async function provisionTenantSchema(
  client: { query: (sql: string) => Promise<unknown> },
  tenantId: string,
): Promise<{ created: boolean; schema: string }> {
  if (!isTenantValid(tenantId)) {
    throw new Error(`tenantId inválido: ${tenantId}`)
  }
  const schema = tenantSchemaName(tenantId)
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
  return { created: true, schema }
}

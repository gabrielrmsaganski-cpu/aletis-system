/**
 * Multi-tenant — validação do helper de resolução + namespace.
 * Não exige PG (testa só a lógica pura).
 */
import { describe, it, expect } from 'vitest'
import {
  isTenantValid,
  resolveTenantId,
  tenantSchemaName,
  getTenantMode,
} from '../../src/db/tenant.js'

describe('multi-tenant resolution', () => {
  it('isTenantValid aceita [a-z0-9_]{1,32}', () => {
    expect(isTenantValid('default')).toBe(true)
    expect(isTenantValid('acme_corp_123')).toBe(true)
    expect(isTenantValid('tenant1')).toBe(true)
    expect(isTenantValid('a')).toBe(true)
  })

  it('isTenantValid rejeita inválidos', () => {
    expect(isTenantValid('')).toBe(false)
    expect(isTenantValid(null)).toBe(false)
    expect(isTenantValid(undefined)).toBe(false)
    expect(isTenantValid('TENANT-UPPERCASE')).toBe(false)
    expect(isTenantValid('with space')).toBe(false)
    expect(isTenantValid('drop;table')).toBe(false)
    expect(isTenantValid('a'.repeat(33))).toBe(false)
  })

  it('resolveTenantId prioridade header > jwt > default', () => {
    expect(resolveTenantId({ header: 'acme', jwtClaim: 'other' })).toBe('acme')
    expect(resolveTenantId({ header: null, jwtClaim: 'jwt_t' })).toBe('jwt_t')
    expect(resolveTenantId({ header: null, jwtClaim: null })).toBe('default')
    // Header inválido → cai pro JWT
    expect(resolveTenantId({ header: 'INV ALID', jwtClaim: 'jwt_t' })).toBe('jwt_t')
    // Tudo inválido → default
    expect(resolveTenantId({ header: '<xss>', jwtClaim: '!@#' })).toBe('default')
  })

  it('resolveTenantId normaliza casing', () => {
    expect(resolveTenantId({ header: 'ACME' })).toBe('acme')
  })

  it('tenantSchemaName retorna namespace seguro', () => {
    expect(tenantSchemaName('default')).toBe('tenant_default')
    expect(tenantSchemaName('acme_corp')).toBe('tenant_acme_corp')
    // Inválido fallback público
    expect(tenantSchemaName('drop;table')).toBe('public')
  })

  it('getTenantMode default single', () => {
    const before = process.env.ALETIS_TENANT_MODE
    delete process.env.ALETIS_TENANT_MODE
    expect(getTenantMode()).toBe('single')
    process.env.ALETIS_TENANT_MODE = 'schema'
    expect(getTenantMode()).toBe('schema')
    if (before == null) delete process.env.ALETIS_TENANT_MODE
    else process.env.ALETIS_TENANT_MODE = before
  })
})

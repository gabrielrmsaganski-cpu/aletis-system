// ============================================================
// ALETIS — ALIX Auth Middleware
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { internalSessionToken, resolveInternalSession } from '../lib/internal-auth.js';

export interface AlixUser {
  sub: string;
  id: string;
  nome: string;
  email?: string;
  consultorId?: string;
  role?: string;
  /** Origem atribuída apenas pelo middleware; nunca vem de claims/headers. */
  authSource?: 'internal' | 'legacy_jwt' | 'anonymous';
}

declare module 'fastify' {
  interface FastifyRequest {
    alixUser?: AlixUser;
  }
}

function authenticationRequired(): boolean {
  return process.env.ALETIS_INTERNAL_AUTH_ENABLED !== '0'
    || (process.env.ALIX_AUTH_STRICT || '').toLowerCase() === 'true';
}

function internalRole(id: string): string {
  // A identidade é verificada no servidor; headers e o corpo não concedem papel.
  const administrators = new Set((process.env.ALIX_ADMIN_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean));
  return administrators.has(id) ? 'admin_master' : 'consultor';
}

export async function alixAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const internal = resolveInternalSession(request.server, request);
  if (internal) {
    request.alixUser = {
      sub: internal.id,
      id: internal.id,
      nome: internal.nome,
      email: internal.email,
      consultorId: internal.consultorId,
      role: internalRole(internal.id),
      authSource: 'internal',
    };
    return;
  }
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    if (authenticationRequired() || internalSessionToken(request)) {
      return reply.status(401).send({ success: false, error: 'Autenticação necessária' });
    }
    // Compatibilidade exclusiva do ambiente que desliga explicitamente o guard.
    request.alixUser = { sub: 'anonymous', id: 'anonymous', nome: 'Anônimo', authSource: 'anonymous' };
    return;
  }
  try {
    await request.jwtVerify();
    const decoded = request.user as Record<string, unknown>;
    const id = decoded.id || decoded.sub;
    if (typeof id !== 'string' || !id || decoded.kind === 'internal' || decoded.kind === 'portal') {
      return reply.status(401).send({ success: false, error: 'Token inválido para a ALIX' });
    }
    request.alixUser = {
      sub: typeof decoded.sub === 'string' ? decoded.sub : id,
      id,
      nome: typeof decoded.nome === 'string' ? decoded.nome : typeof decoded.name === 'string' ? decoded.name : 'Consultor',
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
      consultorId: typeof decoded.consultorId === 'string' ? decoded.consultorId : id,
      role: typeof decoded.role === 'string' ? decoded.role : 'consultor',
      authSource: 'legacy_jwt',
    };
  } catch {
    return reply.status(401).send({ success: false, error: 'Token inválido' });
  }
}

export function applyAlixAuth(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', alixAuthMiddleware);
}

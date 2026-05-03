// ============================================================
// auth — informa o consultor logado (sistema interno).
//
// Hoje retorna o consultor canônico hardcoded — o sistema ainda
// não tem login real para os consultores ALETIS (apenas para o
// portal cliente em /api/portal/auth/*).
//
// Quando o login real for implementado, esta rota:
//   1. Valida JWT em request.headers.authorization (já há `jwt` registrado)
//   2. Resolve o consultor pelo `sub` claim
//   3. Retorna ou 401 se inválido
//
// Por enquanto: serve como fonte única de verdade do nome/cargo
// do consultor para que o frontend não tenha "Christian Kohler"
// hardcoded em 3 lugares.
// ============================================================
import type { FastifyInstance } from 'fastify'

interface ConsultorMe {
  id: string
  nome: string
  primeiroNome: string
  iniciais: string
  cargo: string
  email: string
  /** ID interno usado em comentários, changelog e audit. */
  consultorId: string
}

const FALLBACK_CONSULTOR: ConsultorMe = {
  id: 'consultor-001',
  nome: 'Christian Kohler',
  primeiroNome: 'Christian',
  iniciais: 'CK',
  cargo: 'Consultor sênior',
  email: 'christian@aletis.com.br',
  consultorId: 'consultor-001',
}

function deriveIniciais(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default async function authRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/auth/me
   * Retorna o consultor logado. Hoje sem auth real, devolve o
   * consultor canônico das envs (CONSULTOR_DEFAULT_*).
   */
  fastify.get('/api/auth/me', async (request) => {
    // Tenta JWT primeiro — se válido, usa o claim `sub` como nome
    try {
      const auth = request.headers.authorization
      if (auth?.startsWith('Bearer ')) {
        // O plugin `jwt` está registrado em server.ts. Valida silenciosamente.
        await (request as any).jwtVerify().catch(() => null)
        const decoded = (request as any).user
        if (decoded?.nome) {
          return {
            success: true,
            data: {
              id: decoded.sub ?? decoded.id ?? FALLBACK_CONSULTOR.id,
              nome: decoded.nome,
              primeiroNome: decoded.primeiroNome ?? String(decoded.nome).split(' ')[0],
              iniciais: decoded.iniciais ?? deriveIniciais(decoded.nome),
              cargo: decoded.cargo ?? 'Consultor',
              email: decoded.email ?? '',
              consultorId: decoded.consultorId ?? decoded.sub ?? FALLBACK_CONSULTOR.consultorId,
            },
          }
        }
      }
    } catch {
      // ignora — cai pro fallback abaixo
    }

    // Fallback: lê env vars CONSULTOR_NOME / CONSULTOR_EMAIL etc
    const env = process.env
    const nome = env.CONSULTOR_NOME ?? FALLBACK_CONSULTOR.nome
    const consultor: ConsultorMe = {
      id: env.CONSULTOR_ID ?? FALLBACK_CONSULTOR.id,
      nome,
      primeiroNome: env.CONSULTOR_PRIMEIRO_NOME ?? nome.split(' ')[0],
      iniciais: env.CONSULTOR_INICIAIS ?? deriveIniciais(nome),
      cargo: env.CONSULTOR_CARGO ?? FALLBACK_CONSULTOR.cargo,
      email: env.CONSULTOR_EMAIL ?? FALLBACK_CONSULTOR.email,
      consultorId: env.CONSULTOR_ID ?? FALLBACK_CONSULTOR.consultorId,
    }
    return { success: true, data: consultor }
  })
}

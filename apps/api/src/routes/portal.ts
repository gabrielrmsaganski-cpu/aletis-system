import { registerPortalMatterRoutes } from '../services/portal/PortalMatterRoutes.js'
import { registerPortalFiscalRoutes } from '../services/portal/PortalFiscalRoutes.js'
/**
 * Rotas do Portal do Cliente
 *
 * Endpoints autenticados via JWT (@fastify/jwt) que alimentam a SPA do
 * Portal (/portal-cliente). O cliente loga com usuário+senha (criados
 * pelo consultor em Configurações), recebe um token de 12h e o envia
 * no header `Authorization: Bearer <token>` para acessar seu próprio
 * contrato, timeline, documentos e chat com o consultor.
 *
 * Segurança: hash de senha via scrypt (PortalAuthService). O token só
 * carrega o id do cliente; toda autorização é feita re-buscando o
 * Cliente e confirmando que está ativo.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { clientes } from './clientes.js'
import { getPool, isPgEnabled } from '../db/client.js'
import { Decimal } from 'decimal.js'
import { portalDocumentService } from '../services/portal/PortalDocumentService.js'
import { canClientSeeUpload, publicPortalRequest, publicPortalUpload } from '../services/portal/PortalDocumentPresentation.js'
import { registerPortalDocumentRoutes } from '../services/portal/PortalDocumentRoutes.js'
import { registerPortalAlixRoutes } from '../services/portal/PortalAlixRoutes.js'
import { registerPortalConversationRoutes } from '../services/portal/PortalConversationRoutes.js'
import { registerPortalClientRequestRoutes } from '../services/portal/PortalClientRequestRoutes.js'
import { portalStageProjection } from '../services/portal/PortalStageProjection.js'
import { loadPortalAccess, refreshPortalAccesses, savePortalAccess, recordPortalLogin } from '../services/portal/PortalAccountService.js'
import { listPortalMessages, listPortalUpdates } from '../services/portal/PortalCommunicationService.js'
import {
  verificarSenha,
  hashSenha,
  normalizarUsuario,
  type PortalJwtPayload,
} from '../services/PortalAuthService.js'
import {
  emitirToken,
  consumirToken,
  revogarTokensCliente,
} from '../services/PortalTokenService.js'
import {
  enviarMagicLink,
  enviarResetSenha,
  enviarBoasVindas,
} from '../services/PortalNotificationService.js'
import {
  getVapidPublicKey,
  type PushSubscriptionRecord,
} from '../services/PushService.js'
import {
  projetarHonorarios,
} from '../services/HonorariosService.js'

import { registrarEvento, listarEventos } from '../services/PortalStore.js'
import { parseBody } from '../lib/validate.js'
import {
  LoginSchema,
  MagicRequestSchema,
  MagicRedeemSchema,
  ForgotSchema,
  ResetSchema,
  TrocarSenhaSchema,
} from './portal-schemas.js'

/* ========================================================================
 *  Helpers
 * ======================================================================== */

const formatBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/**
 * Rate limit em memória — N tentativas por chave em janela rolante.
 *
 * Bounded LRU: cap em RATE_LIMIT_MAX_KEYS para evitar memory leak por
 * IPs únicos (ataque de exhaustion). Quando ultrapassa, evict 20% mais
 * antigos. Pruna inativos (>10min) a cada `RATE_LIMIT_SWEEP_MS`.
 *
 * IMPORTANTE: este store é POR INSTÂNCIA. Em deploy multi-pod, atacante
 * pula entre pods e burla o limite — para isso, mover para
 * @fastify/rate-limit com Redis storage (issue futura, não-P0 enquanto
 * deploy é single-instance).
 */
const RATE_LIMIT = new Map<string, number[]>()
const RATE_LIMIT_MAX_KEYS = Number(process.env.PORTAL_RATE_LIMIT_MAX_KEYS) || 5000
const RATE_LIMIT_KEY_TTL_MS = Number(process.env.PORTAL_RATE_LIMIT_KEY_TTL_MS) || 10 * 60_000
const RATE_LIMIT_SWEEP_MS = Number(process.env.PORTAL_RATE_LIMIT_SWEEP_MS) || 60_000

function rateLimitSweep(): void {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_KEY_TTL_MS
  for (const [k, arr] of RATE_LIMIT.entries()) {
    const fresh = arr.filter((t) => t > cutoff)
    if (fresh.length === 0) RATE_LIMIT.delete(k)
    else if (fresh.length !== arr.length) RATE_LIMIT.set(k, fresh)
  }
  // LRU evict se passou do cap (Map preserva ordem de inserção)
  if (RATE_LIMIT.size > RATE_LIMIT_MAX_KEYS) {
    const toEvict = Math.floor(RATE_LIMIT_MAX_KEYS * 0.2)
    let i = 0
    for (const k of RATE_LIMIT.keys()) {
      RATE_LIMIT.delete(k)
      if (++i >= toEvict) break
    }
  }
}
const rateLimitSweepTimer = setInterval(rateLimitSweep, RATE_LIMIT_SWEEP_MS)
if (rateLimitSweepTimer.unref) rateLimitSweepTimer.unref()

function rateLimitCheck(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const cutoff = now - windowMs
  const arr = (RATE_LIMIT.get(key) ?? []).filter((t) => t > cutoff)
  if (arr.length >= max) {
    RATE_LIMIT.set(key, arr)
    return false
  }
  arr.push(now)
  RATE_LIMIT.set(key, arr)
  return true
}

function clientIp(req: FastifyRequest): string {
  const xfwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
  return xfwd || req.ip || 'unknown'
}

/** Resolve a URL pública do portal a partir de envs ou request origin. */
function resolvePortalBaseUrl(req: FastifyRequest): string {
  if (process.env.ALETIS_PORTAL_BASE_URL) return process.env.ALETIS_PORTAL_BASE_URL.replace(/\/$/, '')
  const origin = (req.headers.origin as string | undefined) || (req.headers.referer as string | undefined)
  if (origin) {
    try { return new URL(origin).origin } catch { /* ignore */ }
  }
  const host = req.headers['x-forwarded-host'] as string | undefined || req.headers.host
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || 'http'
  return host ? `${proto}://${host}` : 'http://localhost:5173'
}

/** Busca cliente por usuário do portal OU CPF/CNPJ OU e-mail. */
function localizarClienteParaAuth(input: string) {
  const usuario = normalizarUsuario(input)
  const digits = input.replace(/\D/g, '')
  const email = input.trim().toLowerCase()
  for (const c of clientes.values()) {
    const matchUsuario = c.portalAcesso?.usuario === usuario
    const matchCpf = digits.length > 0 && c.cpfCnpj.replace(/\D/g, '') === digits
    const matchEmail = c.email && c.email.trim().toLowerCase() === email
    if (matchUsuario || matchCpf || matchEmail) return c
  }
  return null
}

/** Computa pulse: estado consolidado do caso para o Hero do cliente. */
async function computarPulse(clienteId: string) {
  const c = clientes.get(clienteId)
  if (!c) return null
  const [requests, messages, updates] = await Promise.all([
    portalDocumentService.listarPendencias(clienteId), listPortalMessages(clienteId), listPortalUpdates(clienteId),
  ])
  const active = requests.filter(p => p.status !== 'cancelado')
  const pending = active.filter(p => p.status === 'pendente' || p.status === 'rejeitado')
  const next = [...pending].sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999') || ({urgente:0,alta:1,normal:2}[a.prioridade] - {urgente:0,alta:1,normal:2}[b.prioridade]))[0]
  const stepper = projetarStepper(clienteId).find(step => step.current)
  const dates = [c.dataCadastro, c.ultimaAtualizacao, ...requests.map(p => p.updatedAt), ...messages.map(m => m.criadoEm), ...updates.map(u => u.data)].filter(Boolean).sort()
  return {
    clienteId, nome: c.nome, estagioAtual: { id: stepper?.id, label: stepper?.label, estagioRaw: c.estagio },
    proximoPasso: next ? `${next.status === 'rejeitado' ? 'Corrija e reenvie' : 'Envie'}: ${next.titulo}` : active.some(p => p.status === 'enviado') ? 'Seus documentos foram recebidos e aguardam conferência da equipe.' : 'Acompanhe as atualizações da equipe e as solicitações de documentos neste portal.',
    pendencias: { total: active.length, pendentes: pending.length, aguardandoRevisao: active.filter(p => p.status === 'enviado').length },
    mensagensNaoLidas: messages.filter(m => m.de === 'consultor' && !m.lidaEm).length,
    ultimaAtualizacao: dates.at(-1), healthScore: active.length ? Math.round(active.filter(p => p.status === 'aprovado').length / active.length * 100) : 0,
    consultor: c.consultor || null, economiaEstimada: c.dividas.reduce((sum, d) => sum.plus(Decimal.max(0, new Decimal(d.valorOriginal || 0).minus(d.valorAtualizado || 0))), new Decimal(0)).toFixed(2),
  }
}

/** Middleware: garante JWT válido e anexa clienteId + cliente ao request.
 *
 *  Aceita o JWT via:
 *    1. Authorization: Bearer (padrão para fetch/XHR)
 *    2. Cookie HttpOnly `portal_token` (preferido para SSE — EventSource
 *       envia cookies automaticamente com withCredentials)
 *
 *  A ordem importa: Bearer wins. Cookie só atua quando o header não veio
 *  (caso típico do EventSource). */
async function autenticarPortal(request: FastifyRequest, reply: FastifyReply) {
  if (!request.headers.authorization) {
    // EventSource utiliza a mesma sessão por cookie HttpOnly.
    const cookieTok = (request as FastifyRequest & { cookies?: Record<string, string> }).cookies?.portal_token
    if (cookieTok) {
      ;(request.headers as Record<string, string>).authorization = `Bearer ${cookieTok}`
    }
  }
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({
      success: false,
      error: 'Token inválido ou expirado',
      code: 'UNAUTHORIZED',
    })
  }
  const payload = request.user as PortalJwtPayload | undefined
  if (!payload || payload.kind !== 'portal-cliente') {
    return reply.status(401).send({
      success: false,
      error: 'Token de tipo inválido',
      code: 'UNAUTHORIZED',
    })
  }
  const cliente = clientes.get(payload.sub)
  const acessoAtual = await loadPortalAccess(payload.sub)
  if (payload.authVersion !== acessoAtual?.atualizadoEm) return reply.status(401).send({ success: false, error: 'Sua sessão foi atualizada. Entre novamente.', code: 'UNAUTHORIZED' })
  if (!cliente || !cliente.portalAcesso || !cliente.portalAcesso.ativo) {
    return reply.status(403).send({
      success: false,
      error: 'Acesso revogado ou inexistente',
      code: 'FORBIDDEN',
    })
  }
  reply.header('Cache-Control', 'private, no-store')
  ;(request as any).clienteId = payload.sub
  ;(request as any).cliente = cliente
}

/** Projeção mínima e segura do cliente (sem hashes, sem dados internos). */
function projetarClienteMe(clienteId: string) {
  const c = clientes.get(clienteId)
  if (!c) return null
  return {
    id: c.id,
    nome: c.nome,
    cpfCnpj: c.cpfCnpj,
    cidade: c.cidade,
    uf: c.uf,
    email: c.email,
    telefone: c.telefone,
    atividade: c.atividade,
    areaTotalHa: c.areaTotalHa,
    culturas: c.culturas,
    estagio: c.estagio,
    consultor: c.consultor,
    credor: c.credor,
    dataCadastro: c.dataCadastro,
    forcaTrocaSenha: c.portalAcesso?.forcaTrocaSenha ?? false,
  }
}

/** Projeção do contrato para o cliente — dívidas, pagamentos e saldo. */
function projetarContrato(clienteId: string) {
  const c = clientes.get(clienteId)
  if (!c) return null
  const saldoEmAberto = Math.max(0, c.valorTotalDivida - c.valorTotalPago)
  const economia = c.dividas.reduce(
    (acc, d) => acc + Math.max(0, d.valorOriginal - d.valorAtualizado),
    0
  )
  return {
    credor: c.credor,
    valorTotalDivida: c.valorTotalDivida,
    valorTotalPago: c.valorTotalPago,
    saldoEmAberto,
    economia,
    dividas: c.dividas.map((d) => ({
      contrato: d.contrato,
      valorOriginal: d.valorOriginal,
      valorAtualizado: d.valorAtualizado,
      vencimento: d.vencimento,
      status: d.status,
      credor: d.credor,
    })),
    pagamentos: [...c.pagamentos].sort((a, b) => b.data.localeCompare(a.data)),
  }
}

function projetarStepper(clienteId: string) {
  const c = clientes.get(clienteId)
  if (!c) return []
  return portalStageProjection(c.estagio)
}

/** Timeline de eventos do cliente, ordem desc. */
async function projetarTimeline(clienteId: string) {
  const [updates, requests, uploads] = await Promise.all([listPortalUpdates(clienteId), portalDocumentService.listarPendencias(clienteId), portalDocumentService.listarUploads(clienteId)])
  return [...updates, ...requests.map(p => ({ data: p.solicitadoEm, tipo: 'solicitacao', descricao: `Documento solicitado: ${p.titulo}`, detalhes: p.descricao })),
    ...uploads.filter(canClientSeeUpload).map(u => ({ data: u.enviadoEm, tipo: 'documento', descricao: `${u.enviadoPor === 'cliente' ? 'Documento recebido' : 'Documento disponibilizado'}: ${u.nomeOriginal}`, detalhes: undefined }))]
    .sort((a,b) => b.data.localeCompare(a.data)).slice(0,100)
}

async function projetarDocumentos(clienteId: string) {
  return (await portalDocumentService.listarUploads(clienteId)).filter(u => u.enviadoPor === 'consultor' && canClientSeeUpload(u)).map(u => ({
    id: u.id, nome: u.nomeOriginal, data: u.enviadoEm, tipo: u.categoria === 'contrato' ? 'contrato' : 'comprovante',
    url: `/api/portal/uploads/${encodeURIComponent(u.id)}`, canView: true,
  }))
}

async function projetarInteligenciaPortal(clienteId: string) {
  const [requests, uploads] = await Promise.all([portalDocumentService.listarPendencias(clienteId), portalDocumentService.listarUploads(clienteId)])
  const visible = uploads.filter(canClientSeeUpload), active = requests.filter(p => p.status !== 'cancelado')
  const pending = active.filter(p => p.status === 'pendente' || p.status === 'rejeitado')
  const score = active.length ? Math.round(active.filter(p => p.status === 'aprovado').length / active.length * 100) : 0
  const priority = { urgente: 'critica', alta: 'alta', normal: 'media' }
  const porGrupo: Record<string,number> = { cadastro:0,patrimonio:0,financeiro:0,juridico:0,outros:0 }
  for (const upload of visible) porGrupo[upload.categoria === 'identidade' ? 'cadastro' : upload.categoria === 'patrimonio' ? 'patrimonio' : upload.categoria === 'fiscal' ? 'financeiro' : upload.categoria === 'contrato' ? 'juridico' : 'outros']++
  return {
    score, nivel: active.length ? `${active.filter(p => p.status === 'aprovado').length} de ${active.length} solicitações conferidas` : 'Nenhuma solicitação aberta',
    resumo: pending.length ? `Há ${pending.length} solicitação(ões) aguardando seu envio ou correção.` : active.some(p => p.status === 'enviado') ? 'A equipe está conferindo os documentos que você enviou.' : 'Os próximos pedidos e atualizações da equipe aparecerão aqui.',
    atualizadoEm: new Date().toISOString(), documentos: { total: visible.length, porGrupo, faltantes: pending.map(p => p.titulo), revisao: active.filter(p => p.status === 'rejeitado').map(p => ({id:p.id,nome:p.titulo,motivo:p.observacao || 'Reenvio solicitado pela equipe.'})) },
    proximasAcoes: pending.slice(0,5).map(p => ({ titulo:p.titulo,detalhe:p.observacao || p.descricao || 'Envie o arquivo pela solicitação correspondente.',prioridade:priority[p.prioridade] })),
    pendencias: pending.map(p => ({ id:p.id,prioridade:priority[p.prioridade],titulo:p.titulo,detalhe:p.observacao || p.descricao || '',acao:'Abrir solicitação e enviar documento' })),
    alix: { resumo:'A ALIX ajuda a entender suas solicitações, documentos enviados e atualizações compartilhadas pela equipe.',perguntasSugeridas:['Quais documentos preciso enviar agora?','Como corrijo um documento devolvido?','Qual é a última atualização do meu caso?','Meu arquivo foi recebido e está em análise?'] },
  }
}

async function portalAudit(clienteId: string, limit = 80) {
  const rows = isPgEnabled() ? (await getPool().query('SELECT id,tipo,canal,criado_em FROM portal_evento WHERE cliente_id=$1 ORDER BY criado_em DESC,id DESC LIMIT $2',[clienteId,limit])).rows.map(row => ({id:Number(row.id),tipo:row.tipo,canal:row.canal,criadoEm:new Date(row.criado_em).toISOString()})) : listarEventos(clienteId,limit).map(e => ({id:e.id,tipo:e.tipo,canal:e.canal,criadoEm:e.criadoEm}))
  return rows
}

/* ========================================================================
 *  Plugin
 * ======================================================================== */

export default async function (fastify: FastifyInstance) {
  await registerPortalDocumentRoutes(fastify, autenticarPortal)
  await registerPortalClientRequestRoutes(fastify, autenticarPortal)
  await registerPortalMatterRoutes(fastify, autenticarPortal)
  await registerPortalFiscalRoutes(fastify, autenticarPortal)
  await registerFiscalConnectionRoutes(fastify, autenticarPortal)
  await registerPortalAlixRoutes(fastify, autenticarPortal, { rateLimit: id => rateLimitCheck(`alix:${id}`, 30, 60_000) })
  await registerPortalConversationRoutes(fastify, autenticarPortal, {
    afterStaffMessage: async ({ clienteId, message }) => {
      const access = await loadPortalAccess(clienteId)
      const subscriptions = access?.pushSubscriptions ?? []
      if (!subscriptions.length) return
      const { enviarPush } = await import('../services/PushService.js')
      await enviarPush(subscriptions, {
        title: `Mensagem de ${message.autorNome}`,
        body: message.texto.length > 120 ? `${message.texto.slice(0, 117)}…` : message.texto,
        url: '/portal-cliente?tab=mensagens', tag: `chat-${clienteId}`,
      })
    },
  })
  const portalCookie = (request: FastifyRequest, reply: FastifyReply, token: string) => reply.setCookie('portal_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || request.protocol === 'https' || request.headers['x-forwarded-proto'] === 'https' || /^https:/.test(process.env.ALETIS_PORTAL_BASE_URL || ''),
    sameSite: 'lax', path: '/', maxAge: 12 * 60 * 60,
  })
  /* ── POST /api/portal/auth/login ────────────────────────────────────── */
  fastify.post(
    '/api/portal/auth/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Rate limit: 6 tentativas / 60s por IP. Janela maior protege também
      // ataques credential-stuffing distribuídos por usuário (5/60s).
      const ip = clientIp(request)
      if (!rateLimitCheck(`login:ip:${ip}`, 8, 60_000)) {
        return reply.status(429).send({ success: false, error: 'Muitas tentativas. Aguarde 1 minuto.', code: 'RATE_LIMIT' })
      }

      const parsed = parseBody(LoginSchema, request, reply)
      if (!parsed) return
      const usuarioRaw = parsed.usuario
      const senha = parsed.senha
      // Limit por usuário também
      const usuario = normalizarUsuario(usuarioRaw)
      if (!rateLimitCheck(`login:user:${usuario}`, 5, 60_000)) {
        return reply.status(429).send({ success: false, error: 'Muitas tentativas para este usuário.', code: 'RATE_LIMIT' })
      }

      await refreshPortalAccesses()
      const digitsOnly = usuarioRaw.replace(/\D/g, '')

      // Busca por usuário ou CPF/CNPJ ou e-mail
      let alvo: typeof clientes extends Map<string, infer T> ? T | undefined : never
      const emailNorm = usuarioRaw.trim().toLowerCase()
      for (const c of clientes.values()) {
        const matchUsuario = c.portalAcesso?.usuario === usuario
        const matchCpf = c.cpfCnpj.replace(/\D/g, '') === digitsOnly && digitsOnly.length > 0
        const matchEmail = c.email && c.email.trim().toLowerCase() === emailNorm
        if (matchUsuario || matchCpf || matchEmail) {
          alvo = c
          break
        }
      }

      if (!alvo || !alvo.portalAcesso) {
        return reply.status(401).send({
          success: false,
          error: 'Credenciais inválidas',
          code: 'INVALID_CREDENTIALS',
        })
      }
      // A versão assinada deve ser a mesma credencial que passou pela verificação.
      // Um reset concorrente durante o registro do login não pode renovar a senha antiga.
      const acessoVerificado = { ...alvo.portalAcesso }
      if (!acessoVerificado.ativo) {
        return reply.status(403).send({
          success: false,
          error: 'Acesso desativado. Entre em contato com seu consultor.',
          code: 'DISABLED',
        })
      }
      const ok = verificarSenha(senha, acessoVerificado.senhaHash, acessoVerificado.salt)
      if (!ok) {
        return reply.status(401).send({
          success: false,
          error: 'Credenciais inválidas',
          code: 'INVALID_CREDENTIALS',
        })
      }

      await recordPortalLogin(alvo.id)

      registrarEvento({
        clienteId: alvo.id,
        tipo: 'login',
        canal: 'web',
        ip,
        userAgent: request.headers['user-agent'] as string | undefined,
      })

      const payload: PortalJwtPayload = {
        sub: alvo.id,
        usuario: acessoVerificado.usuario,
        kind: 'portal-cliente', authVersion: acessoVerificado.atualizadoEm,
      }
      const token = fastify.jwt.sign(payload)

      // Cookie HttpOnly espelhando o token: SSE/EventSource não pode
      // setar Authorization, então a alternativa segura é cookie. O JSON
      // ainda inclui o token p/ compatibilidade com fetch existente.
      portalCookie(request, reply, token)

      return {
        success: true,
        data: {
          token,
          cliente: projetarClienteMe(alvo.id),
        },
      }
    }
  )

  /* ── POST /api/portal/auth/logout ───────────────────────────────────── */
  fastify.post('/api/portal/auth/logout', async (_request, reply) => {
    reply.clearCookie('portal_token', { path: '/' })
    return { success: true }
  })

  /* ──────────────────────────────────────────────────────────────────────
   *  ALIX no Portal — chat restrito ao caso do cliente logado
   * ────────────────────────────────────────────────────────────────────── */

  /* ──────────────────────────────────────────────────────────────────────
   *  Web Push notifications (PWA)
   * ────────────────────────────────────────────────────────────────────── */

  /* ── GET /api/portal/push/vapid-public-key ──────────────────────────── */
  fastify.get('/api/portal/push/vapid-public-key', async () => {
    return { success: true, data: { publicKey: getVapidPublicKey() } }
  })

  /* ── POST /api/portal/push/subscribe ────────────────────────────────── */
  fastify.post(
    '/api/portal/push/subscribe',
    { preHandler: autenticarPortal },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const clienteId = (req as unknown as { clienteId: string }).clienteId
      const cliente = clientes.get(clienteId)
      if (!cliente || !cliente.portalAcesso) {
        return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
      }
      const body = req.body as Partial<{
        endpoint: string
        keys: { p256dh: string; auth: string }
      }>
      if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
        return reply.status(400).send({ success: false, error: 'Subscription inválida' })
      }
      const sub: PushSubscriptionRecord = {
        endpoint: body.endpoint,
        keys: body.keys,
        ua: req.headers['user-agent'] as string | undefined,
        criadoEm: new Date().toISOString(),
      }
      const existentes = cliente.portalAcesso.pushSubscriptions ?? []
      // Dedup por endpoint — mesmo browser pode re-subscrever após limpar storage.
      cliente.portalAcesso.pushSubscriptions = [
        ...existentes.filter((s) => s.endpoint !== sub.endpoint),
        sub,
      ]
      return { success: true }
    },
  )

  /* ── POST /api/portal/push/unsubscribe ──────────────────────────────── */
  fastify.post(
    '/api/portal/push/unsubscribe',
    { preHandler: autenticarPortal },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const clienteId = (req as unknown as { clienteId: string }).clienteId
      const cliente = clientes.get(clienteId)
      if (!cliente || !cliente.portalAcesso) {
        return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
      }
      const body = req.body as Partial<{ endpoint: string }>
      if (!body?.endpoint) {
        return reply.status(400).send({ success: false, error: 'endpoint obrigatório' })
      }
      cliente.portalAcesso.pushSubscriptions = (
        cliente.portalAcesso.pushSubscriptions ?? []
      ).filter((s) => s.endpoint !== body.endpoint)
      return { success: true }
    },
  )

  /* ── GET /api/portal/auth/me ────────────────────────────────────────── */
  fastify.get(
    '/api/portal/auth/me',
    { preHandler: autenticarPortal },
    async (request: FastifyRequest) => {
      const clienteId = (request as any).clienteId as string
      return { success: true, data: projetarClienteMe(clienteId) }
    }
  )

  /* ── GET /api/portal/contrato ───────────────────────────────────────── */
  fastify.get(
    '/api/portal/contrato',
    { preHandler: autenticarPortal },
    async (request: FastifyRequest) => {
      const clienteId = (request as any).clienteId as string
      return { success: true, data: projetarContrato(clienteId) }
    }
  )

  /* ── GET /api/portal/stepper ────────────────────────────────────────── */
  fastify.get(
    '/api/portal/stepper',
    { preHandler: autenticarPortal },
    async (request: FastifyRequest) => {
      const clienteId = (request as any).clienteId as string
      return { success: true, data: projetarStepper(clienteId) }
    }
  )

  /* ── GET /api/portal/timeline ───────────────────────────────────────── */
  fastify.get(
    '/api/portal/timeline',
    { preHandler: autenticarPortal },
    async (request: FastifyRequest) => {
      const clienteId = (request as any).clienteId as string
      return { success: true, data: await projetarTimeline(clienteId) }
    }
  )

  /* ── GET /api/portal/documentos ─────────────────────────────────────── */
  fastify.get(
    '/api/portal/documentos',
    { preHandler: autenticarPortal },
    async (request: FastifyRequest) => {
      const clienteId = (request as any).clienteId as string
      return { success: true, data: await projetarDocumentos(clienteId) }
    }
  )

  /* ──────────────────────────────────────────────────────────────────────
   *  Novos endpoints — Onda 1 (magic-link, esqueci-senha, refresh,
   *  pulse, pendências, uploads).
   * ────────────────────────────────────────────────────────────────────── */

  /* ── POST /api/portal/auth/magic/request ───────────────────────────────
   * Solicita link mágico por e-mail/WhatsApp. Sempre retorna 200 vazio
   * (privacy-preserving: não revela se a conta existe). */
  fastify.post('/api/portal/auth/magic/request', async (req, reply) => {
    if (!rateLimitCheck(`magic:${clientIp(req)}`, 5, 60_000)) {
      return reply.status(429).send({ success: false, error: 'Muitas tentativas. Tente em 1 minuto.', code: 'RATE_LIMIT' })
    }
    const parsed = parseBody(MagicRequestSchema, req, reply)
    if (!parsed) return
    const id = parsed.identificador

    await refreshPortalAccesses()
    const cliente = localizarClienteParaAuth(id)
    // Sempre 200 — não confirmamos existência da conta para anonymous.
    if (cliente && cliente.portalAcesso?.ativo !== false) {
      const { token } = emitirToken({
        clienteId: cliente.id,
        tipo: 'magic',
        canal: cliente.email ? 'email' : 'whatsapp',
      })
      const base = resolvePortalBaseUrl(req)
      const url = `${base}/portal-cliente?magic=${encodeURIComponent(token)}`
      registrarEvento({
        clienteId: cliente.id, tipo: 'magic_solicitado', canal: 'web',
        ip: clientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
        detalhes: { canal: cliente.email ? 'email' : 'whatsapp' },
      })
      // fire-and-forget
      enviarMagicLink({
        destinatario: { email: cliente.email, whatsapp: cliente.telefone },
        nome: cliente.nome,
        url,
        consultor: cliente.consultor,
      }).catch(() => { /* nao_bloquear */ })
    }
    return { success: true }
  })

  /* ── POST /api/portal/auth/magic/redeem ───────────────────────────────
   * Consome o token e devolve JWT de sessão. */
  fastify.post('/api/portal/auth/magic/redeem', async (req, reply) => {
    if (!rateLimitCheck(`redeem:${clientIp(req)}`, 10, 60_000)) {
      return reply.status(429).send({ success: false, error: 'Muitas tentativas.', code: 'RATE_LIMIT' })
    }
    const parsed = parseBody(MagicRedeemSchema, req, reply)
    if (!parsed) return
    const token = parsed.token

    const rec = consumirToken(token, 'magic')
    if (!rec) {
      return reply.status(401).send({ success: false, error: 'Link inválido ou expirado', code: 'INVALID_TOKEN' })
    }
    await loadPortalAccess(rec.clienteId)
    const cliente = clientes.get(rec.clienteId)
    if (!cliente || !cliente.portalAcesso?.ativo) {
      return reply.status(403).send({ success: false, error: 'Acesso revogado', code: 'FORBIDDEN' })
    }
    const acessoVerificado = { ...cliente.portalAcesso }
    await recordPortalLogin(cliente.id)
    registrarEvento({
      clienteId: cliente.id, tipo: 'magic_consumido', canal: 'magic',
      ip: clientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    })
    const payload: PortalJwtPayload = {
      sub: cliente.id,
      usuario: acessoVerificado.usuario,
      kind: 'portal-cliente', authVersion: acessoVerificado.atualizadoEm,
    }
    const jwt = fastify.jwt.sign(payload)
    portalCookie(req, reply, jwt)
    return { success: true, data: { token: jwt, cliente: projetarClienteMe(cliente.id) } }
  })

  /* ── POST /api/portal/auth/forgot ──────────────────────────────────────
   * Esqueci minha senha — dispara link de reset. */
  fastify.post('/api/portal/auth/forgot', async (req, reply) => {
    if (!rateLimitCheck(`forgot:${clientIp(req)}`, 5, 60_000)) {
      return reply.status(429).send({ success: false, error: 'Muitas tentativas.', code: 'RATE_LIMIT' })
    }
    const parsed = parseBody(ForgotSchema, req, reply)
    if (!parsed) return
    const id = parsed.identificador

    await refreshPortalAccesses()
    const cliente = localizarClienteParaAuth(id)
    if (cliente && cliente.portalAcesso?.ativo !== false) {
      const { token } = emitirToken({ clienteId: cliente.id, tipo: 'reset' })
      const base = resolvePortalBaseUrl(req)
      const url = `${base}/portal-cliente?reset=${encodeURIComponent(token)}`
      registrarEvento({
        clienteId: cliente.id, tipo: 'reset_solicitado', canal: 'web',
        ip: clientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
      })
      enviarResetSenha({
        destinatario: { email: cliente.email, whatsapp: cliente.telefone },
        nome: cliente.nome,
        url,
      }).catch(() => { /* ignore */ })
    }
    return { success: true }
  })

  /* ── POST /api/portal/auth/reset ──────────────────────────────────────
   * Conclui reset com token + nova senha. */
  fastify.post('/api/portal/auth/reset', async (req, reply) => {
    const parsed = parseBody(ResetSchema, req, reply)
    if (!parsed) return
    const { token, novaSenha: nova } = parsed
    const rec = consumirToken(token, 'reset')
    if (!rec) {
      return reply.status(401).send({ success: false, error: 'Link inválido ou expirado', code: 'INVALID_TOKEN' })
    }
    await loadPortalAccess(rec.clienteId)
    const cliente = clientes.get(rec.clienteId)
    if (!cliente || !cliente.portalAcesso) {
      return reply.status(403).send({ success: false, error: 'Acesso indisponível', code: 'FORBIDDEN' })
    }
    const h = hashSenha(nova)
    await savePortalAccess(cliente.id, { ...cliente.portalAcesso, ...h, forcaTrocaSenha:false, atualizadoEm:new Date().toISOString() }, cliente.portalAcesso.senhaHash)
    revogarTokensCliente(cliente.id, 'reset')
    revogarTokensCliente(cliente.id, 'refresh')
    registrarEvento({
      clienteId: cliente.id, tipo: 'reset_concluido', canal: 'web',
      ip: clientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    })
    return { success: true, data: { trocada: true } }
  })

  /* ── GET /api/portal/pulse ─────────────────────────────────────────────
   * Hero state: estágio, próximo passo, pendências, msgs não lidas, health. */
  fastify.get('/api/portal/pulse', { preHandler: autenticarPortal }, async (req) => {
    const clienteId = (req as any).clienteId as string
    return { success: true, data: await computarPulse(clienteId) }
  })

  fastify.get('/api/portal/cronograma', { preHandler: autenticarPortal }, async req => {
    const c = clientes.get((req as any).clienteId)
    return {success:true,data:{totalAberto: c ? Decimal.max(0,new Decimal(c.valorTotalDivida || 0).minus(c.valorTotalPago || 0)).toFixed(2) : '0.00',parcelas:[],parcelaPadrao:0,totalParcelas:0,situacao:'nao_definido',mensagem:'O plano de pagamentos ainda não foi registrado pela equipe.'}}
  })

  /* ── GET /api/portal/honorarios ──────────────────────────────────────
   * Projeção dos honorários ALETIS para o cliente: modelo, parcelas,
   * próxima cobrança, êxito estimado em cima da economia atual. */
  fastify.get('/api/portal/honorarios', { preHandler: autenticarPortal }, async (req) => {
    const clienteId = (req as unknown as { clienteId: string }).clienteId
    const c = clientes.get(clienteId)
    if (!c) return { success: false, error: 'Cliente não encontrado' }
    if (!c.honorarios) {
      return { success: true, data: null }
    }
    const economia = c.dividas.reduce(
      (a, d) => a + Math.max(0, d.valorOriginal - d.valorAtualizado),
      0,
    )
    const saldoEmAberto = Math.max(0, c.valorTotalDivida - c.valorTotalPago)
    const projecao = projetarHonorarios(c.honorarios, {
      economia,
      saldoEmAberto,
      valorTotalDivida: c.valorTotalDivida,
      valorTotalPago: c.valorTotalPago,
    })
    return { success: true, data: projecao }
  })

  /* ── GET /api/portal/dashboard ───────────────────────────────────────
   * Endpoint agregado: substitui ~11 chamadas em paralelo por uma só.
   * Inclui também séries (economiaSerie), breakdown por credor e marcos
   * relevantes da timeline. Cliente passa a ter um payload coeso para o
   * hero cinemático sem disparar waterfall. */
  fastify.get('/api/portal/dashboard', { preHandler: autenticarPortal }, async (req) => {
    const clienteId = (req as unknown as { clienteId: string }).clienteId
    const c = clientes.get(clienteId)
    if (!c) return { success: false, error: 'Cliente não encontrado' }

    const pulse = await computarPulse(clienteId)
    const contrato = projetarContrato(clienteId)
    const stepper = projetarStepper(clienteId)
    const timeline = await projetarTimeline(clienteId)
    const documentos = await projetarDocumentos(clienteId)
    const inteligencia = await projetarInteligenciaPortal(clienteId)

    // Breakdown por credor
    const porCredor = new Map<string, { credor: string; original: number; atual: number; economia: number; pct: number }>()
    for (const d of c.dividas) {
      const k = d.credor || c.credor || '—'
      const cur = porCredor.get(k) ?? { credor: k, original: 0, atual: 0, economia: 0, pct: 0 }
      cur.original += d.valorOriginal
      cur.atual += d.valorAtualizado
      cur.economia += Math.max(0, d.valorOriginal - d.valorAtualizado)
      porCredor.set(k, cur)
    }
    const breakdownCredor = Array.from(porCredor.values())
      .map((b) => ({
        ...b,
        pct: b.original > 0 ? Math.round((b.economia / b.original) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.economia - a.economia)

    const economiaTotal = breakdownCredor.reduce((a, x) => a + x.economia, 0)
    const economiaSerie: Array<{ mes:string; economia:number; pago:number }> = []

    // Marcos da negociação extraídos da timeline
    const marcosNegociacao = (await listPortalUpdates(clienteId)).slice(0,8)

    // Honorários (opcional)
    let honorarios: ReturnType<typeof projetarHonorarios> | null = null
    if (c.honorarios) {
      honorarios = projetarHonorarios(c.honorarios, {
        economia: economiaTotal,
        saldoEmAberto: Math.max(0, c.valorTotalDivida - c.valorTotalPago),
        valorTotalDivida: c.valorTotalDivida,
        valorTotalPago: c.valorTotalPago,
      })
    }

    return {
      success: true,
      data: {
        pulse,
        contrato,
        stepper,
        timeline,
        documentos,
        inteligencia,
        honorarios,
        economiaSerie,
        breakdownCredor,
        marcosNegociacao,
      },
    }
  })

  /* ── GET /api/portal/memoria-simplificada ────────────────────────────
   * Memória "do leigo": 4 blocos plain-text do que aconteceu no caso. */
  fastify.get('/api/portal/memoria-simplificada', { preHandler: autenticarPortal }, async (req) => {
    const clienteId = (req as any).clienteId as string
    const c = clientes.get(clienteId)
    if (!c) return { success: false, error: 'Cliente não encontrado' }
    const original = c.dividas.reduce((a, d) => a + d.valorOriginal, 0)
    const atual = c.dividas.reduce((a, d) => a + d.valorAtualizado, 0)
    const economia = Math.max(0, original - atual)
    const pago = c.valorTotalPago
    const blocos = [
      {
        chave: 'origem',
        titulo: 'O que você devia',
        valor: original,
        descricao:
          `Quando você procurou a ALETIS, o saldo somado de seus ${c.dividas.length} contrato(s) era de ${formatBRL(original)}. Esse era o número "oficial" dos credores.`,
      },
      {
        chave: 'descoberta',
        titulo: 'O que descobrimos',
        valor: economia,
        descricao:
          economia > 0
            ? `Auditando os contratos peça por peça, identificamos ${formatBRL(economia)} que não deveriam estar lá — anatocismo, capitalização indevida, encargos abusivos. Esse valor virou poder de negociação na mesa.`
            : 'Os contratos foram auditados e não encontramos abusividade significativa neste momento. O foco passa a ser estrutura de pagamento e prazo.',
      },
      {
        chave: 'plano',
        titulo: 'O plano que vamos pagar',
        valor: atual,
        descricao:
          `Saldo final negociado: ${formatBRL(atual)}. Esse é o número que vai constar dos novos contratos com os credores. Confira na seção "Cronograma de pagamentos".`,
      },
      {
        chave: 'pago',
        titulo: 'O que você já pagou',
        valor: pago,
        descricao:
          pago > 0
            ? `Você já honrou ${formatBRL(pago)} do plano. Continue assim e o caso será encerrado no prazo combinado.`
            : 'Ainda não há pagamentos registrados pelo plano. Quando começarem, eles aparecem aqui.',
      },
    ]
    return { success: true, data: { economia, original, atual, pago, blocos } }
  })

  /* ── GET /api/portal/mensagens/stream ────────────────────────────────
   * SSE para mensagens em tempo real — cliente substitui polling.
   * Heartbeat 25s para manter NAT/proxy abertos. */
  fastify.get('/api/portal/mensagens/stream', { preHandler: autenticarPortal }, async (req, reply) => {
    const clienteId = (req as any).clienteId as string
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders?.()

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`)
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const initial = await listPortalMessages(clienteId)
    send('snapshot', initial)
    let lastIds = new Set(initial.map(m => m.id))
    let checking = false
    const interval = setInterval(async () => {
      if (checking || reply.raw.destroyed) return
      checking = true
      try {
        const access = await loadPortalAccess(clienteId)
        const claims = req.user as PortalJwtPayload & { exp?: number }
        if (!access?.ativo || claims.authVersion !== access.atualizadoEm || (claims.exp && claims.exp * 1000 <= Date.now())) { reply.raw.end(); return }
        const current = await listPortalMessages(clienteId)
        for (const message of current) if (!lastIds.has(message.id)) send('mensagem', message)
        lastIds = new Set(current.map(message => message.id))
      } catch { reply.raw.end() } finally { checking = false }
    }, 5_000)

    const heartbeat = setInterval(() => {
      reply.raw.write(`: heartbeat\n\n`)
    }, 25_000)

    reply.raw.on('close', () => {
      clearInterval(interval)
      clearInterval(heartbeat)
    })
  })

  /* ── GET /api/portal/auditoria ────────────────────────────────────────
   * Trilha de auditoria do cliente: últimos 50 eventos de portal
   * (login, magic, upload, mensagem, etc). LGPD-friendly: cliente
   * sempre pode ver tudo sobre si. */
  fastify.get('/api/portal/auditoria', { preHandler: autenticarPortal }, async (req) => {
    const clienteId = (req as any).clienteId as string
    const eventos = await portalAudit(clienteId)
    return { success: true, data: eventos }
  })

  /* ── GET /api/portal/exportar-meus-dados ─────────────────────────────
   * LGPD Art. 18 IV — direito de portabilidade. Baixa JSON com tudo
   * que o portal sabe do cliente (perfil, contratos, pendências,
   * uploads, mensagens, auditoria). */
  fastify.get('/api/portal/exportar-meus-dados', { preHandler: autenticarPortal }, async (req, reply) => {
    const clienteId = (req as any).clienteId as string
    const c = clientes.get(clienteId)
    if (!c) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    const dump = {
      meta: {
        geradoEm: new Date().toISOString(),
        clienteId,
        sistema: 'ALETIS Portal v1',
        baseLegal: 'LGPD Art. 18 IV — portabilidade',
      },
      perfil: projetarClienteMe(clienteId),
      contrato: projetarContrato(clienteId),
      timeline: await projetarTimeline(clienteId),
      documentos: await projetarDocumentos(clienteId),
      pendencias: (await portalDocumentService.listarPendencias(clienteId)).map(publicPortalRequest),
      uploads: (await portalDocumentService.listarUploads(clienteId)).filter(canClientSeeUpload).map(publicPortalUpload),
      mensagens: await listPortalMessages(clienteId),
      auditoria: await portalAudit(clienteId, 200),
    }
    reply.header('Content-Type', 'application/json; charset=utf-8')
    reply.header(
      'Content-Disposition',
      `attachment; filename="aletis-meus-dados-${clienteId}-${Date.now()}.json"`,
    )
    return reply.send(JSON.stringify(dump, null, 2))
  })

  /* ── POST /api/portal/assinatura/iniciar ─────────────────────────────
   * Stub de assinatura digital: gera link unique para Gov.br / Clicksign /
   * D4Sign. Hoje retorna URL placeholder sinalizando "em construção".
   * Quando integração real for plugada, mantém mesmo contrato. */
  fastify.post('/api/portal/assinatura/iniciar', { preHandler: autenticarPortal }, async (req, reply) => {
    const clienteId = (req as any).clienteId as string
    const body = req.body as { documentoId?: string; provider?: 'govbr' | 'clicksign' | 'd4sign' } | undefined
    const docId = body?.documentoId
    if (!docId) return reply.status(400).send({ success: false, error: 'documentoId obrigatório' })
    return reply.code(501).send({success:false,error:'A assinatura eletrônica ainda não foi configurada. Sua equipe informará como assinar este documento.',code:'SIGNATURE_NOT_CONFIGURED'})
  })

  /* ── POST /api/clientes/:id/portal/convidar ──────────────────────────
   * Auto-convite: cria/regera acesso E dispara magic-link via WhatsApp/email.
   * Substitui o fluxo "consultor copia senha e cola no WhatsApp". */
  fastify.post('/api/clientes/:id/portal/convidar', async (req, reply) => {
    const { id } = req.params as { id: string }
    const c = clientes.get(id)
    if (!c) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    if (!c.portalAcesso) {
      return reply.status(400).send({ success: false, error: 'Configure o acesso do portal antes de convidar.' })
    }
    const { token } = emitirToken({
      clienteId: id,
      tipo: 'magic',
      canal: c.email ? 'email' : 'whatsapp',
      metadata: { fluxo: 'convite-consultor' },
    })
    const base = resolvePortalBaseUrl(req)
    const url = `${base}/portal-cliente?magic=${encodeURIComponent(token)}`

    const out = await enviarBoasVindas({
      destinatario: { email: c.email, whatsapp: c.telefone },
      nome: c.nome,
      url,
      consultor: c.consultor,
    })
    registrarEvento({
      clienteId: id, tipo: 'magic_solicitado', canal: 'consultor',
      detalhes: { fluxo: 'convite', whatsapp: out.whatsapp, email: out.email },
    })
    return {
      success: true,
      data: {
        url,
        canais: out,
      },
    }
  })

  /* ── POST /api/portal/auth/trocar-senha ─────────────────────────────── */
  fastify.post(
    '/api/portal/auth/trocar-senha',
    { preHandler: autenticarPortal },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const clienteId = (request as any).clienteId as string
      const cliente = clientes.get(clienteId)
      if (!cliente || !cliente.portalAcesso) {
        return reply.status(404).send({ success: false, error: 'Cliente sem acesso configurado' })
      }
      const parsed = parseBody(TrocarSenhaSchema, request, reply)
      if (!parsed) return
      const { senhaAtual, novaSenha } = parsed
      const ok = verificarSenha(
        senhaAtual,
        cliente.portalAcesso.senhaHash,
        cliente.portalAcesso.salt
      )
      if (!ok) {
        return reply.status(401).send({ success: false, error: 'Senha atual incorreta' })
      }
      const { hashSenha } = await import('../services/PortalAuthService.js')
      const novo = hashSenha(novaSenha)
      const access = await savePortalAccess(cliente.id, { ...cliente.portalAcesso, ...novo, forcaTrocaSenha:false, atualizadoEm:new Date().toISOString() }, cliente.portalAcesso.senhaHash)
      const token = fastify.jwt.sign({sub:cliente.id,usuario:access.usuario,kind:'portal-cliente',authVersion:access.atualizadoEm})
      portalCookie(request, reply, token)
      return { success: true, data: { trocada: true, token } }
    }
  )
}
import { registerFiscalConnectionRoutes } from '../services/fiscal-connection/FiscalConnectionRoutes.js'

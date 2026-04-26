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
import { clientes, type PortalMensagem } from './clientes.js'
import { propostas, propostasInteligentes } from './propostas.js'
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
  listarPendencias,
  criarPendencia,
  atualizarPendencia,
  removerPendencia,
  listarUploads,
  adicionarUpload,
  buscarUpload,
  registrarEvento,
} from '../services/PortalStore.js'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/* ========================================================================
 *  Helpers
 * ======================================================================== */

const formatBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/** Storage local de uploads do portal (cofre digital).
 *  Em produção, plugar S3/MinIO via env ALETIS_PORTAL_UPLOAD_BUCKET. */
const UPLOAD_DIR = process.env.ALETIS_PORTAL_UPLOAD_DIR
  || join(process.cwd(), 'storage', 'portal-uploads')

async function ensureUploadDir(): Promise<void> {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true })
  }
}

/** Limites de upload — 25MB por arquivo, mimes seguros. */
const UPLOAD_MAX_BYTES = 25 * 1024 * 1024
const UPLOAD_ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword',
  'application/vnd.ms-excel',
  'text/plain', 'text/csv',
])

/** Rate limit em memória — N tentativas por chave em janela. Janela rolante. */
const RATE_LIMIT = new Map<string, number[]>()
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
function computarPulse(clienteId: string) {
  const c = clientes.get(clienteId)
  if (!c) return null
  const stepper = (() => {
    const idx = {
      prospeccao: 0, analise: 1, negociacao: 3, acordo: 4, encerrado: 5,
    }[c.estagio] ?? 1
    return STEP_ORDER[Math.min(idx, STEP_ORDER.length - 1)]
  })()
  const proximaSugestaoMap: Record<string, string> = {
    prospeccao: 'Aguardando análise inicial — em breve seu consultor vai pedir os primeiros documentos.',
    analise: 'Estamos auditando contratos. Verifique se há documentos pendentes na sua caixa.',
    negociacao: 'Estamos com sua proposta na mesa. Você será avisado a cada movimento dos credores.',
    acordo: 'Acordo formalizado — confira o cronograma e mantenha os pagamentos em dia.',
    encerrado: 'Caso encerrado. O Portal continua acessível para histórico e documentos.',
  }
  const pendencias = listarPendencias(clienteId)
  const pendentes = pendencias.filter((p) => p.status === 'pendente')
  const enviadosNaoRevisados = pendencias.filter((p) => p.status === 'enviado')
  const mensagens = c.portalMensagens ?? []
  const naoLidas = mensagens.filter((m) => m.de === 'consultor' && !m.lidaEm).length

  // Última atualização: maior data entre timeline, mensagens, pagamentos
  const candidatos: string[] = []
  if (c.timeline?.length) candidatos.push(c.timeline[c.timeline.length - 1].data)
  if (mensagens.length) candidatos.push(mensagens[mensagens.length - 1].criadoEm)
  if (c.pagamentos?.length) candidatos.push(c.pagamentos[c.pagamentos.length - 1].data)
  candidatos.sort()
  const ultimaAtualizacao = candidatos.length ? candidatos[candidatos.length - 1] : c.dataCadastro

  // Saúde rápida do caso (0-100, heurística simples)
  const saudeBase = c.estagio === 'encerrado' ? 100 : c.estagio === 'acordo' ? 85 : c.estagio === 'negociacao' ? 70 : 55
  const saudeAjustePend = Math.max(0, saudeBase - pendentes.length * 4)
  const healthScore = Math.min(100, Math.max(0, saudeAjustePend))

  return {
    clienteId,
    nome: c.nome,
    estagioAtual: { id: stepper.id, label: stepper.label, estagioRaw: c.estagio },
    proximoPasso: proximaSugestaoMap[c.estagio] ?? 'Acompanhe seu caso pelo Portal.',
    pendencias: {
      total: pendencias.length,
      pendentes: pendentes.length,
      aguardandoRevisao: enviadosNaoRevisados.length,
    },
    mensagensNaoLidas: naoLidas,
    ultimaAtualizacao,
    healthScore,
    consultor: c.consultor || null,
    economiaEstimada: c.dividas.reduce(
      (acc, d) => acc + Math.max(0, d.valorOriginal - d.valorAtualizado),
      0,
    ),
  }
}

/** Middleware: garante JWT válido e anexa clienteId + cliente ao request.
 *
 *  Aceita o JWT via Authorization: Bearer (padrão) ou via query string
 *  `?_t=` (necessário para EventSource/SSE, que não suporta headers
 *  customizados). O token na URL fica visível em logs do servidor; mitigar
 *  via TLS + log scrubber em produção. */
async function autenticarPortal(request: FastifyRequest, reply: FastifyReply) {
  // Se Authorization ausente mas _t query presente, sintetiza o header.
  if (!request.headers.authorization) {
    const tok = (request.query as { _t?: string } | undefined)?._t
    if (tok) {
      ;(request.headers as Record<string, string>).authorization = `Bearer ${tok}`
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
  if (!cliente || !cliente.portalAcesso || !cliente.portalAcesso.ativo) {
    return reply.status(403).send({
      success: false,
      error: 'Acesso revogado ou inexistente',
      code: 'FORBIDDEN',
    })
  }
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

/** Estepes da negociação, sempre na mesma ordem. */
const STEP_ORDER: Array<{
  id: string
  label: string
  estagiosAnteriores: Array<'prospeccao' | 'analise' | 'negociacao' | 'acordo' | 'encerrado'>
}> = [
  { id: 'analise', label: 'Análise Iniciada', estagiosAnteriores: ['prospeccao'] },
  { id: 'proposta', label: 'Proposta Elaborada', estagiosAnteriores: ['prospeccao', 'analise'] },
  { id: 'enviada', label: 'Proposta Enviada', estagiosAnteriores: ['analise'] },
  { id: 'negociacao', label: 'Em Negociação', estagiosAnteriores: ['analise'] },
  { id: 'acordo', label: 'Acordo', estagiosAnteriores: ['analise', 'negociacao'] },
  { id: 'encerrado', label: 'Concluído', estagiosAnteriores: ['acordo'] },
]

function projetarStepper(clienteId: string) {
  const c = clientes.get(clienteId)
  if (!c) return []
  const idx = {
    prospeccao: 0,
    analise: 1,
    negociacao: 3,
    acordo: 4,
    encerrado: 5,
  }[c.estagio] ?? 1
  return STEP_ORDER.map((s, i) => ({
    id: s.id,
    label: s.label,
    done: i < idx,
    current: i === idx,
  }))
}

/** Timeline de eventos do cliente, ordem desc. */
function projetarTimeline(clienteId: string) {
  const c = clientes.get(clienteId)
  if (!c) return []
  return [...c.timeline]
    .sort((a, b) => b.data.localeCompare(a.data))
    .map((e) => ({
      data: e.data,
      tipo: e.tipo,
      descricao: e.descricao,
      detalhes: e.detalhes,
    }))
}

/** Documentos disponíveis ao cliente — hoje compostos das propostas. */
function projetarDocumentos(clienteId: string) {
  const docs: Array<{
    id: string
    nome: string
    data: string
    tipo: 'proposta' | 'contrato' | 'comprovante'
    url?: string
    canView: boolean
  }> = []

  for (const p of propostas.values()) {
    if (p.clienteId !== clienteId) continue
    docs.push({
      id: p.id,
      nome: `Proposta — ${p.tipo || 'Memória de Cálculo'}`,
      data: p.dataCriacao || new Date().toISOString(),
      tipo: 'proposta',
      url: p.pdfUrl || undefined,
      canView: Boolean(p.pdfUrl),
    })
  }

  const cliAtual = clientes.get(clienteId)
  const cpfCnpjLimpo = cliAtual?.cpfCnpj.replace(/\D/g, '')
  for (const p of propostasInteligentes.values()) {
    const matchId = p.cliente.id === clienteId
    const matchCpf =
      cpfCnpjLimpo && p.cliente.cpfCnpj.replace(/\D/g, '') === cpfCnpjLimpo
    if (!matchId && !matchCpf) continue
    docs.push({
      id: p.id,
      nome: 'Memória de Cálculo Inteligente',
      data: p.dataGeracao || new Date().toISOString(),
      tipo: 'proposta',
      url: `/api/propostas/inteligente/${p.id}/pdf`,
      canView: true,
    })
  }

  const c = clientes.get(clienteId)
  if (c) {
    c.pagamentos.forEach((pg, i) => {
      docs.push({
        id: `pag-${c.id}-${i}`,
        nome: `Comprovante — ${pg.descricao}`,
        data: pg.data,
        tipo: 'comprovante',
        canView: false,
      })
    })
  }

  return docs.sort((a, b) => b.data.localeCompare(a.data))
}

/* ========================================================================
 *  Plugin
 * ======================================================================== */

export default async function (fastify: FastifyInstance) {
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

      const body = request.body as { usuario?: string; senha?: string } | undefined
      const usuarioRaw = body?.usuario?.toString() ?? ''
      const senha = body?.senha?.toString() ?? ''
      if (!usuarioRaw || !senha) {
        return reply.status(400).send({
          success: false,
          error: 'Usuário e senha são obrigatórios',
          code: 'BAD_REQUEST',
        })
      }
      // Limit por usuário também
      const usuario = normalizarUsuario(usuarioRaw)
      if (!rateLimitCheck(`login:user:${usuario}`, 5, 60_000)) {
        return reply.status(429).send({ success: false, error: 'Muitas tentativas para este usuário.', code: 'RATE_LIMIT' })
      }

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
      if (!alvo.portalAcesso.ativo) {
        return reply.status(403).send({
          success: false,
          error: 'Acesso desativado. Entre em contato com seu consultor.',
          code: 'DISABLED',
        })
      }
      const ok = verificarSenha(senha, alvo.portalAcesso.senhaHash, alvo.portalAcesso.salt)
      if (!ok) {
        return reply.status(401).send({
          success: false,
          error: 'Credenciais inválidas',
          code: 'INVALID_CREDENTIALS',
        })
      }

      alvo.portalAcesso.ultimoLoginEm = new Date().toISOString()

      registrarEvento({
        clienteId: alvo.id,
        tipo: 'login',
        canal: 'web',
        ip,
        userAgent: request.headers['user-agent'] as string | undefined,
      })

      const payload: PortalJwtPayload = {
        sub: alvo.id,
        usuario: alvo.portalAcesso.usuario,
        kind: 'portal-cliente',
      }
      const token = fastify.jwt.sign(payload)

      return {
        success: true,
        data: {
          token,
          cliente: projetarClienteMe(alvo.id),
        },
      }
    }
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
      return { success: true, data: projetarTimeline(clienteId) }
    }
  )

  /* ── GET /api/portal/documentos ─────────────────────────────────────── */
  fastify.get(
    '/api/portal/documentos',
    { preHandler: autenticarPortal },
    async (request: FastifyRequest) => {
      const clienteId = (request as any).clienteId as string
      return { success: true, data: projetarDocumentos(clienteId) }
    }
  )

  /* ── GET /api/portal/mensagens ──────────────────────────────────────── */
  fastify.get(
    '/api/portal/mensagens',
    { preHandler: autenticarPortal },
    async (request: FastifyRequest) => {
      const clienteId = (request as any).clienteId as string
      const c = clientes.get(clienteId)
      const mensagens = c?.portalMensagens ?? []
      // Marcar como lidas as mensagens do consultor
      const agora = new Date().toISOString()
      for (const m of mensagens) {
        if (m.de === 'consultor' && !m.lidaEm) m.lidaEm = agora
      }
      return { success: true, data: mensagens }
    }
  )

  /* ── POST /api/portal/mensagens ─────────────────────────────────────── */
  fastify.post(
    '/api/portal/mensagens',
    { preHandler: autenticarPortal },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const clienteId = (request as any).clienteId as string
      const cliente = clientes.get(clienteId)
      if (!cliente) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
      const body = request.body as { texto?: string } | undefined
      const texto = body?.texto?.trim()
      if (!texto) {
        return reply.status(400).send({ success: false, error: 'Mensagem vazia', code: 'BAD_REQUEST' })
      }
      if (texto.length > 2000) {
        return reply.status(400).send({ success: false, error: 'Mensagem muito longa (máx 2000)', code: 'BAD_REQUEST' })
      }
      const msg: PortalMensagem = {
        id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        de: 'cliente',
        autorNome: cliente.nome,
        texto,
        criadoEm: new Date().toISOString(),
      }
      cliente.portalMensagens = [...(cliente.portalMensagens ?? []), msg]
      return reply.status(201).send({ success: true, data: msg })
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
    const body = req.body as { identificador?: string } | undefined
    const id = body?.identificador?.trim() || ''
    if (!id) return reply.status(400).send({ success: false, error: 'Informe e-mail, CPF/CNPJ ou usuário.', code: 'BAD_REQUEST' })

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
    const body = req.body as { token?: string } | undefined
    const token = body?.token?.trim()
    if (!token) return reply.status(400).send({ success: false, error: 'Token ausente', code: 'BAD_REQUEST' })

    const rec = consumirToken(token, 'magic')
    if (!rec) {
      return reply.status(401).send({ success: false, error: 'Link inválido ou expirado', code: 'INVALID_TOKEN' })
    }
    const cliente = clientes.get(rec.clienteId)
    if (!cliente || !cliente.portalAcesso?.ativo) {
      return reply.status(403).send({ success: false, error: 'Acesso revogado', code: 'FORBIDDEN' })
    }
    cliente.portalAcesso.ultimoLoginEm = new Date().toISOString()
    registrarEvento({
      clienteId: cliente.id, tipo: 'magic_consumido', canal: 'magic',
      ip: clientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    })
    const payload: PortalJwtPayload = {
      sub: cliente.id,
      usuario: cliente.portalAcesso.usuario,
      kind: 'portal-cliente',
    }
    const jwt = fastify.jwt.sign(payload)
    return { success: true, data: { token: jwt, cliente: projetarClienteMe(cliente.id) } }
  })

  /* ── POST /api/portal/auth/forgot ──────────────────────────────────────
   * Esqueci minha senha — dispara link de reset. */
  fastify.post('/api/portal/auth/forgot', async (req, reply) => {
    if (!rateLimitCheck(`forgot:${clientIp(req)}`, 5, 60_000)) {
      return reply.status(429).send({ success: false, error: 'Muitas tentativas.', code: 'RATE_LIMIT' })
    }
    const body = req.body as { identificador?: string } | undefined
    const id = body?.identificador?.trim() || ''
    if (!id) return reply.status(400).send({ success: false, error: 'Informe identificador', code: 'BAD_REQUEST' })

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
    const body = req.body as { token?: string; novaSenha?: string } | undefined
    const token = body?.token?.trim()
    const nova = body?.novaSenha?.toString() ?? ''
    if (!token) return reply.status(400).send({ success: false, error: 'Token ausente', code: 'BAD_REQUEST' })
    if (nova.length < 8) {
      return reply.status(400).send({ success: false, error: 'Senha precisa ter ao menos 8 caracteres', code: 'WEAK_PASSWORD' })
    }
    const rec = consumirToken(token, 'reset')
    if (!rec) {
      return reply.status(401).send({ success: false, error: 'Link inválido ou expirado', code: 'INVALID_TOKEN' })
    }
    const cliente = clientes.get(rec.clienteId)
    if (!cliente || !cliente.portalAcesso) {
      return reply.status(403).send({ success: false, error: 'Acesso indisponível', code: 'FORBIDDEN' })
    }
    const h = hashSenha(nova)
    cliente.portalAcesso.senhaHash = h.senhaHash
    cliente.portalAcesso.salt = h.salt
    cliente.portalAcesso.forcaTrocaSenha = false
    cliente.portalAcesso.atualizadoEm = new Date().toISOString()
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
    return { success: true, data: computarPulse(clienteId) }
  })

  /* ── GET /api/portal/cronograma ──────────────────────────────────────
   * Cronograma de pagamentos derivado dos contratos: distribui o saldo em
   * aberto em parcelas mensais com a primeira parcela 30 dias à frente.
   * Heurística simples — em produção, plugar plano real do consultor. */
  fastify.get('/api/portal/cronograma', { preHandler: autenticarPortal }, async (req) => {
    const clienteId = (req as any).clienteId as string
    const c = clientes.get(clienteId)
    const empty = { totalAberto: 0, parcelas: [], parcelaPadrao: 0, totalParcelas: 0 }
    if (!c) return { success: true, data: empty }
    const totalAberto = Math.max(0, c.valorTotalDivida - c.valorTotalPago)
    if (totalAberto <= 0) return { success: true, data: empty }
    // Heurística: 72 meses default. Ajustar quando plano real vier.
    const N = 72
    const valorParcela = Math.round((totalAberto / N) * 100) / 100
    const parcelas: Array<{
      numero: number
      vencimento: string
      valor: number
      status: 'futuro' | 'proximo' | 'pago' | 'atrasado'
      pagoEm?: string
    }> = []
    const hoje = new Date()
    let pagosRestantes = c.pagamentos.length
    for (let i = 0; i < Math.min(N, 36); i++) {
      const d = new Date(hoje)
      d.setMonth(d.getMonth() + i + 1 - pagosRestantes)
      const passado = d.getTime() < hoje.getTime()
      const proximo = !passado && i === pagosRestantes
      parcelas.push({
        numero: i + 1,
        vencimento: d.toISOString(),
        valor: valorParcela,
        status: pagosRestantes > i
          ? 'pago'
          : passado
          ? 'atrasado'
          : proximo
          ? 'proximo'
          : 'futuro',
        pagoEm: pagosRestantes > i ? c.pagamentos[i]?.data : undefined,
      })
    }
    return { success: true, data: { totalAberto, parcelas, parcelaPadrao: valorParcela, totalParcelas: N } }
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

    // Snapshot inicial
    const c = clientes.get(clienteId)
    send('snapshot', c?.portalMensagens ?? [])
    let lastCount = c?.portalMensagens?.length ?? 0
    let lastIds = new Set((c?.portalMensagens ?? []).map((m) => m.id))

    // Poll-bridge (até WebSocket): observa mudanças no array mensagens
    // e empurra deltas. Refresh leve a cada 3s, < polling do client.
    const interval = setInterval(() => {
      const current = clientes.get(clienteId)?.portalMensagens ?? []
      if (current.length !== lastCount) {
        const novas = current.filter((m) => !lastIds.has(m.id))
        for (const m of novas) send('mensagem', m)
        lastIds = new Set(current.map((m) => m.id))
        lastCount = current.length
      }
    }, 3_000)

    const heartbeat = setInterval(() => {
      reply.raw.write(`: heartbeat\n\n`)
    }, 25_000)

    req.raw.on('close', () => {
      clearInterval(interval)
      clearInterval(heartbeat)
    })
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
    const provider = body?.provider || 'govbr'
    // Em produção: chamar provider e devolver URL. Hoje: link de demo.
    return {
      success: true,
      data: {
        provider,
        url: `https://assinatura.aletis.com.br/iniciar?cli=${encodeURIComponent(clienteId)}&doc=${encodeURIComponent(docId)}&p=${provider}`,
        expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
        modo: 'preview',
      },
    }
  })

  /* ── GET /api/portal/pendencias ────────────────────────────────────────
   * Inbox de documentos solicitados pelo consultor. */
  fastify.get('/api/portal/pendencias', { preHandler: autenticarPortal }, async (req) => {
    const clienteId = (req as any).clienteId as string
    return { success: true, data: listarPendencias(clienteId) }
  })

  /* ── POST /api/portal/upload ───────────────────────────────────────────
   * Upload de documento pelo cliente. Suporta multipart se @fastify/multipart
   * estiver registrado; senão aceita base64 em JSON (fallback). */
  fastify.post('/api/portal/upload', { preHandler: autenticarPortal, bodyLimit: 30 * 1024 * 1024 }, async (req, reply) => {
    const clienteId = (req as any).clienteId as string
    await ensureUploadDir()

    let buf: Buffer | null = null
    let nomeOriginal = 'arquivo.bin'
    let mime = 'application/octet-stream'
    let pendenciaId: string | undefined
    let categoria: string | undefined

    const ct = (req.headers['content-type'] || '').toString()
    if (ct.startsWith('application/json')) {
      const body = req.body as {
        nome?: string; mime?: string; conteudoBase64?: string;
        pendenciaId?: string; categoria?: string;
      } | undefined
      if (!body?.conteudoBase64) {
        return reply.status(400).send({ success: false, error: 'conteudoBase64 ausente', code: 'BAD_REQUEST' })
      }
      buf = Buffer.from(body.conteudoBase64, 'base64')
      nomeOriginal = (body.nome || 'arquivo.bin').slice(0, 255)
      mime = (body.mime || 'application/octet-stream').slice(0, 200)
      pendenciaId = body.pendenciaId
      categoria = body.categoria
    } else {
      // multipart: usa @fastify/multipart se disponível em runtime
      try {
        const mp = await (req as any).file?.()
        if (!mp) {
          return reply.status(400).send({ success: false, error: 'Arquivo ausente', code: 'BAD_REQUEST' })
        }
        nomeOriginal = (mp.filename || 'arquivo.bin').slice(0, 255)
        mime = (mp.mimetype || 'application/octet-stream').slice(0, 200)
        pendenciaId = (mp.fields?.pendenciaId?.value as string | undefined) || undefined
        categoria = (mp.fields?.categoria?.value as string | undefined) || undefined
        buf = await mp.toBuffer()
      } catch {
        return reply.status(415).send({ success: false, error: 'Formato não suportado. Use JSON com conteudoBase64 ou multipart.', code: 'UNSUPPORTED' })
      }
    }

    if (!buf || buf.length === 0) {
      return reply.status(400).send({ success: false, error: 'Arquivo vazio', code: 'EMPTY_FILE' })
    }
    if (buf.length > UPLOAD_MAX_BYTES) {
      return reply.status(413).send({ success: false, error: 'Arquivo excede 25MB', code: 'TOO_LARGE' })
    }
    if (!UPLOAD_ALLOWED_MIMES.has(mime)) {
      return reply.status(415).send({ success: false, error: `Tipo não permitido: ${mime}`, code: 'BAD_MIME' })
    }

    const sha = createHash('sha256').update(buf).digest('hex')
    const id = `up-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
    const ext = nomeOriginal.includes('.') ? nomeOriginal.split('.').pop()!.slice(0, 8) : 'bin'
    const nomeStorage = `${clienteId}__${id}.${ext}`
    await writeFile(join(UPLOAD_DIR, nomeStorage), buf)

    const upload = adicionarUpload({
      clienteId,
      pendenciaId,
      nomeOriginal,
      nomeStorage,
      mime,
      tamanho: buf.length,
      sha256: sha,
      categoria,
      enviadoPor: 'cliente',
      url: `/api/portal/uploads/${id}`,
    })

    if (pendenciaId) {
      atualizarPendencia(clienteId, pendenciaId, {
        status: 'enviado',
        uploadId: upload.id,
        enviadoEm: upload.enviadoEm,
      })
    }

    registrarEvento({
      clienteId, tipo: 'documento_enviado', canal: 'web',
      ip: clientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
      detalhes: { uploadId: upload.id, nome: nomeOriginal, tamanho: buf.length },
    })

    return reply.status(201).send({ success: true, data: upload })
  })

  /* ── GET /api/portal/uploads ──────────────────────────────────────────
   * Lista do cofre digital (uploads do cliente). */
  fastify.get('/api/portal/uploads', { preHandler: autenticarPortal }, async (req) => {
    const clienteId = (req as any).clienteId as string
    return { success: true, data: listarUploads(clienteId) }
  })

  /* ── GET /api/portal/uploads/:id — download ──────────────────────────
   * Download por id; só dono pode acessar. */
  fastify.get('/api/portal/uploads/:id', { preHandler: autenticarPortal }, async (req, reply) => {
    const clienteId = (req as any).clienteId as string
    const id = (req.params as { id: string }).id
    const upload = buscarUpload(clienteId, id)
    if (!upload) return reply.status(404).send({ success: false, error: 'Arquivo não encontrado' })
    try {
      const data = await readFile(join(UPLOAD_DIR, upload.nomeStorage))
      reply.header('Content-Type', upload.mime)
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(upload.nomeOriginal)}"`)
      return reply.send(data)
    } catch {
      return reply.status(410).send({ success: false, error: 'Arquivo indisponível', code: 'GONE' })
    }
  })

  /* ──────────────────────────────────────────────────────────────────────
   *  Endpoints admin (consultor) — CRUD de pendências do cliente.
   *  Sem autenticação adicional aqui (mesmo padrão das outras rotas
   *  /api/clientes/:id), assumindo proteção upstream do dashboard
   *  do consultor.
   * ────────────────────────────────────────────────────────────────────── */
  fastify.get('/api/clientes/:id/portal/pendencias', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!clientes.get(id)) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    return { success: true, data: listarPendencias(id) }
  })

  fastify.post('/api/clientes/:id/portal/pendencias', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!clientes.get(id)) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
    const body = req.body as {
      titulo?: string
      descricao?: string
      categoria?: 'fiscal' | 'contrato' | 'identidade' | 'patrimonio' | 'agro' | 'outros'
      obrigatorio?: boolean
      solicitadoPor?: string
    } | undefined
    const titulo = body?.titulo?.trim()
    if (!titulo) return reply.status(400).send({ success: false, error: 'titulo obrigatório' })
    const p = criarPendencia({
      clienteId: id,
      titulo,
      descricao: body?.descricao,
      categoria: body?.categoria || 'outros',
      obrigatorio: body?.obrigatorio !== false,
      solicitadoPor: body?.solicitadoPor,
    })
    registrarEvento({ clienteId: id, tipo: 'pendencia_criada', canal: 'consultor', detalhes: { pendenciaId: p.id, titulo } })
    return reply.status(201).send({ success: true, data: p })
  })

  fastify.patch('/api/clientes/:id/portal/pendencias/:pid', async (req, reply) => {
    const { id, pid } = req.params as { id: string; pid: string }
    const body = req.body as {
      status?: 'pendente' | 'enviado' | 'aprovado' | 'rejeitado'
      observacao?: string
    } | undefined
    const upd = atualizarPendencia(id, pid, {
      status: body?.status,
      observacao: body?.observacao,
      revisadoEm: body?.status === 'aprovado' || body?.status === 'rejeitado' ? new Date().toISOString() : undefined,
    })
    if (!upd) return reply.status(404).send({ success: false, error: 'Pendência não encontrada' })
    if (upd.status === 'aprovado' || upd.status === 'rejeitado') {
      registrarEvento({ clienteId: id, tipo: 'pendencia_resolvida', canal: 'consultor', detalhes: { pendenciaId: pid, status: upd.status } })
    }
    return { success: true, data: upd }
  })

  fastify.delete('/api/clientes/:id/portal/pendencias/:pid', async (req, reply) => {
    const { id, pid } = req.params as { id: string; pid: string }
    const ok = removerPendencia(id, pid)
    if (!ok) return reply.status(404).send({ success: false, error: 'Pendência não encontrada' })
    return { success: true }
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
      const body = request.body as { senhaAtual?: string; novaSenha?: string } | undefined
      const senhaAtual = body?.senhaAtual?.toString() ?? ''
      const novaSenha = body?.novaSenha?.toString() ?? ''
      if (!senhaAtual || !novaSenha) {
        return reply.status(400).send({ success: false, error: 'Informe senha atual e nova senha' })
      }
      if (novaSenha.length < 8) {
        return reply
          .status(400)
          .send({ success: false, error: 'Nova senha deve ter ao menos 8 caracteres' })
      }
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
      cliente.portalAcesso.senhaHash = novo.senhaHash
      cliente.portalAcesso.salt = novo.salt
      cliente.portalAcesso.forcaTrocaSenha = false
      cliente.portalAcesso.atualizadoEm = new Date().toISOString()
      return { success: true, data: { trocada: true } }
    }
  )
}

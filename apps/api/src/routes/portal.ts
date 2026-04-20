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
  normalizarUsuario,
  type PortalJwtPayload,
} from '../services/PortalAuthService.js'

/* ========================================================================
 *  Helpers
 * ======================================================================== */

/** Middleware: garante JWT válido e anexa clienteId + cliente ao request. */
async function autenticarPortal(request: FastifyRequest, reply: FastifyReply) {
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
      const usuario = normalizarUsuario(usuarioRaw)
      const digitsOnly = usuarioRaw.replace(/\D/g, '')

      // Busca por usuário ou CPF/CNPJ limpo
      let alvo: typeof clientes extends Map<string, infer T> ? T | undefined : never
      for (const c of clientes.values()) {
        const matchUsuario = c.portalAcesso?.usuario === usuario
        const matchCpf = c.cpfCnpj.replace(/\D/g, '') === digitsOnly && digitsOnly.length > 0
        if (matchUsuario || matchCpf) {
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

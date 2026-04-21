// ============================================================
// ALETIS — Dossiê Agro Canônico (rotas)
// Padrão Daycoval 2025 — CRUD + histórico de versões
// ============================================================
//
// Persistência: apps/api/storage/clientes/dossies/{clienteId}.json
// Histórico:    apps/api/storage/clientes/dossies-historico/{clienteId}/{n}.json
// Schema:       @aletis/shared-types/dossie-agro
//
// Resolução: todas as rotas recebem `:id` do CRM. Se não casar por id
// exato, tenta casar por CPF/CNPJ normalizado (só dígitos) — mesmo
// contrato que as outras rotas de cliente seguem.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { clientes } from './clientes.js'
import { getDossieRepository } from '../services/cliente/DossieRepository.js'
import { dossieAgroResumo, dossieAgroVazio, type DossieAgro } from '@aletis/shared-types'

// ── helpers ───────────────────────────────────────────────

function onlyDigits(s: string | undefined | null): string {
  return (s || '').replace(/\D/g, '')
}

/**
 * Resolve `:id` em um cliente real. Aceita:
 *  - id interno (`cli-001`)
 *  - CPF/CNPJ (com ou sem máscara)
 */
function resolverClienteId(idParam: string): { clienteId: string; nome?: string } | null {
  if (!idParam) return null
  const direct = clientes.get(idParam)
  if (direct) return { clienteId: direct.id, nome: direct.nome }

  const digits = onlyDigits(idParam)
  if (!digits) return null
  for (const c of clientes.values()) {
    if (onlyDigits(c.cpfCnpj) === digits) {
      return { clienteId: c.id, nome: c.nome }
    }
  }
  return null
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Valida minimamente o payload recebido no PUT. */
function validarDossiePayload(body: unknown): { ok: true; dossie: DossieAgro } | { ok: false; erro: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, erro: 'Body vazio ou inválido' }
  }
  const b = body as Partial<DossieAgro>
  if (!b.grupoEconomico || !b.operacional || !b.producao || !b.imoveis || !b.maquinas || !b.dividas || !b.capitalGiro || !b.relacionamentoBancario || !b.comerciais) {
    return { ok: false, erro: 'Dossiê incompleto: todas as seções devem estar presentes (use dossieAgroVazio()).' }
  }
  const dataBase = typeof b.dataBase === 'string' && b.dataBase ? b.dataBase : hojeIso()
  return {
    ok: true,
    dossie: {
      ...(b as DossieAgro),
      dataBase,
      versao: b.versao ?? 1, // Repository ignora e incrementa
      criadoEm: b.criadoEm ?? new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      clienteId: b.clienteId ?? '',
    },
  }
}

// ── plugin ────────────────────────────────────────────────

export default async function dossieRoutes(fastify: FastifyInstance): Promise<void> {
  const repo = getDossieRepository()

  /* ---- GET dossiê corrente ---- */
  fastify.get('/api/clientes/:id/dossie', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const resolved = resolverClienteId(id)
    if (!resolved) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const dossie = repo.get(resolved.clienteId)
    if (!dossie) {
      // resposta 404 padronizada — a UI cria o dossiê vazio no primeiro save
      reply.status(404)
      return {
        success: false,
        error: 'Dossiê ainda não criado',
        data: { clienteId: resolved.clienteId, vazio: dossieAgroVazio(resolved.clienteId, hojeIso()) },
      }
    }
    return { success: true, data: dossie }
  })

  /* ---- GET resumo (usado por list/tool Alix) ---- */
  fastify.get('/api/clientes/:id/dossie/resumo', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const resolved = resolverClienteId(id)
    if (!resolved) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const dossie = repo.get(resolved.clienteId)
    if (!dossie) {
      reply.status(404)
      return { success: false, error: 'Dossiê ainda não criado' }
    }
    return { success: true, data: dossieAgroResumo(dossie) }
  })

  /* ---- PUT dossiê (save) ---- */
  fastify.put('/api/clientes/:id/dossie', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const resolved = resolverClienteId(id)
    if (!resolved) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }

    const v = validarDossiePayload(request.body)
    if (!v.ok) {
      reply.status(400)
      return { success: false, error: v.erro }
    }

    // força o clienteId correto (não confia no cliente)
    const dossie: DossieAgro = { ...v.dossie, clienteId: resolved.clienteId }
    const persistido = repo.save(dossie)
    return { success: true, data: persistido }
  })

  /* ---- DELETE dossiê ---- */
  fastify.delete('/api/clientes/:id/dossie', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const resolved = resolverClienteId(id)
    if (!resolved) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const removed = repo.delete(resolved.clienteId)
    if (!removed) {
      reply.status(404)
      return { success: false, error: 'Dossiê já inexistente' }
    }
    return { success: true, data: { clienteId: resolved.clienteId } }
  })

  /* ---- GET histórico de versões ---- */
  fastify.get('/api/clientes/:id/dossie/historico', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit } = request.query as { limit?: string }
    const resolved = resolverClienteId(id)
    if (!resolved) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const n = Math.max(1, Math.min(50, Number(limit) || 5))
    const itens = repo.historico(resolved.clienteId, n)
    return { success: true, data: itens }
  })

  /* ---- GET versão específica ---- */
  fastify.get('/api/clientes/:id/dossie/versao/:n', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, n } = request.params as { id: string; n: string }
    const resolved = resolverClienteId(id)
    if (!resolved) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const versao = Number(n)
    if (!Number.isFinite(versao) || versao < 1) {
      reply.status(400)
      return { success: false, error: 'Versão inválida' }
    }
    const dossie = repo.versao(resolved.clienteId, versao)
    if (!dossie) {
      reply.status(404)
      return { success: false, error: 'Versão não encontrada' }
    }
    return { success: true, data: dossie }
  })
}

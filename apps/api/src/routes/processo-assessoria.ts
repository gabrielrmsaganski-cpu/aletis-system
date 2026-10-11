// ============================================================
// /api/processo-assessoria — REST do Processo de Assessoria ALETIS
// ============================================================
//
// Endpoints:
//   GET    /api/processo-assessoria/templates                       lista catálogo
//   GET    /api/processo-assessoria/templates/:slug                 metadados
//   POST   /api/processo-assessoria/templates/:slug/preview         preview placeholders resolvidos
//   POST   /api/processo-assessoria/templates/:slug/render          render binário
//   GET    /api/processo-assessoria/categorias                      meta de categorias
//
//   GET    /api/processo-assessoria/clientes/:id/checklists         lista checklists do cliente
//   GET    /api/processo-assessoria/clientes/:id/checklists/:slug   estado + template
//   PATCH  /api/processo-assessoria/clientes/:id/checklists/:slug/itens/:itemId
//                                                                  upsert item
//   DELETE /api/processo-assessoria/clientes/:id/checklists/:slug   reset
//
//   GET    /api/processo-assessoria/clientes/:id/historico          renders auditados
// ============================================================
import type { FastifyInstance } from 'fastify'
import { eq, desc } from 'drizzle-orm'
import { getProcessoAssessoriaService } from '../services/processo-assessoria/ProcessoAssessoriaService.js'
import {
  PROCESSO_TEMPLATES,
  CATEGORIA_META,
  UI_TABS,
  getProcessoTemplateBySlug,
} from '../services/processo-assessoria/manifest.js'
import {
  getChecklistRepository,
  getChecklistWithState,
} from '../services/processo-assessoria/ChecklistRepository.js'
import { getDb, isPgEnabled } from '../db/client.js'
import { processoRender } from '../db/schema.js'
import { alixGetClientes } from '../services/AlixService.js'
import type { ProcessoClienteData } from '../services/processo-assessoria/ProcessoAssessoriaService.js'
import { getSpreadsheetMigrationSummary } from '../services/processo-assessoria/SpreadsheetIntelligenceService.js'

function envelope<T>(data: T) {
  return { success: true, data }
}
function err(message: string, code = 'ERR') {
  return { success: false, error: message, code }
}

function formatEndereco(endereco: any): string {
  if (!endereco) return ''
  if (typeof endereco === 'string') return endereco.trim()
  const parts: string[] = []
  if (endereco.logradouro) parts.push(String(endereco.logradouro).trim())
  if (endereco.numero) parts.push('Nº ' + String(endereco.numero).trim())
  if (endereco.complemento) parts.push(String(endereco.complemento).trim())
  if (endereco.bairro) parts.push(String(endereco.bairro).trim())
  const cidadeUf = [endereco.cidade, endereco.uf].filter(Boolean).join('/')
  if (cidadeUf) parts.push(cidadeUf)
  if (endereco.cep) parts.push('CEP ' + String(endereco.cep).trim())
  if (endereco.formatado && parts.length === 0) return String(endereco.formatado).trim()
  return parts.join(', ')
}

async function resolveCliente(clienteId: string): Promise<ProcessoClienteData | null> {
  const clientes = alixGetClientes()
  const c = clientes.find((c: any) => c.id === clienteId)
  if (!c) return null
  return {
    id: c.id,
    nome: c.nome,
    cpfCnpj: (c as any).cpfCnpj ?? null,
    cidade: (c as any).cidade ?? null,
    uf: (c as any).uf ?? null,
    endereco: formatEndereco((c as any).endereco),
    email: (c as any).email ?? null,
    telefone: (c as any).telefone ?? null,
    estagio: (c as any).estagio ?? null,
  }
}

export default async function processoAssessoriaRoutes(fastify: FastifyInstance) {
  const service = getProcessoAssessoriaService()
  const checklistRepo = getChecklistRepository()

  // ── Catálogo ──────────────────────────────────────────────
  fastify.get('/api/processo-assessoria/templates', async (req, reply) => {
    const tab = (req.query as any)?.tab as string | undefined
    const categoria = (req.query as any)?.categoria as string | undefined
    let list = PROCESSO_TEMPLATES.slice()
    if (tab) list = list.filter((t) => t.uiTab === tab)
    if (categoria) list = list.filter((t) => t.categoria === categoria)
    return envelope({
      total: list.length,
      tabs: UI_TABS,
      categorias: CATEGORIA_META,
      templates: list.map((t) => ({
        slug: t.slug,
        codigo: t.codigo,
        nome: t.nome,
        versao: t.versao,
        descricao: t.descricao,
        categoria: t.categoria,
        formato: t.formato,
        uiTab: t.uiTab,
        estrutura: t.estrutura,
        hasVba: t.hasVba ?? false,
        hasChecklist: !!t.checklist,
        placeholdersCount: t.placeholders?.length ?? 0,
      })),
    })
  })

  fastify.get('/api/processo-assessoria/categorias', async () => {
    return envelope({ categorias: CATEGORIA_META, tabs: UI_TABS })
  })

  // ── Inteligência de substituição das planilhas ───────────────
  // Consolida os XLSX/XLSM enviados em /documentos e informa qual
  // módulo nativo substitui cada arquivo. Esta rota é deliberadamente
  // separada do catálogo de templates: templates preservam o legado;
  // este endpoint guia a migração para operação 100% no sistema.
  fastify.get('/api/processo-assessoria/planilhas/sistema', async (req) => {
    const refresh = (req.query as any)?.refresh === '1'
    const summary = await getSpreadsheetMigrationSummary(refresh)
    return envelope(summary)
  })

  fastify.get('/api/processo-assessoria/templates/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const tpl = getProcessoTemplateBySlug(slug)
    if (!tpl) {
      reply.code(404)
      return err(`Template "${slug}" não existe`, 'NOT_FOUND')
    }
    return envelope({ template: tpl })
  })

  fastify.get('/api/processo-assessoria/templates/:slug/structure', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    try {
      const structure = await service.getStructure(slug)
      if (!structure) {
        reply.code(404)
        return err(`Template "${slug}" não existe`, 'NOT_FOUND')
      }
      return envelope(structure)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro ao ler estrutura', 'STRUCTURE_ERROR')
    }
  })

  // ── Preview / Render ──────────────────────────────────────
  fastify.post('/api/processo-assessoria/templates/:slug/preview', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const body = (req.body ?? {}) as { clienteId?: string; inputs?: Record<string, string> }
    if (!body.clienteId) {
      reply.code(400)
      return err('clienteId obrigatório', 'BAD_REQUEST')
    }
    const cli = await resolveCliente(body.clienteId)
    if (!cli) {
      reply.code(404)
      return err(`Cliente "${body.clienteId}" não encontrado`, 'CLIENTE_NOT_FOUND')
    }
    try {
      const out = service.preview({
        templateSlug: slug,
        cliente: cli,
        inputs: body.inputs ?? {},
      })
      return envelope({
        template: {
          slug: out.template.slug,
          codigo: out.template.codigo,
          nome: out.template.nome,
          formato: out.template.formato,
        },
        resolved: out.resolved,
        missing: out.missing,
        cliente: { id: cli.id, nome: cli.nome },
      })
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro no preview', 'PREVIEW_ERROR')
    }
  })

  fastify.post('/api/processo-assessoria/templates/:slug/render', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const body = (req.body ?? {}) as { clienteId?: string; inputs?: Record<string, string> }
    if (!body.clienteId) {
      reply.code(400)
      return err('clienteId obrigatório', 'BAD_REQUEST')
    }
    const cli = await resolveCliente(body.clienteId)
    if (!cli) {
      reply.code(404)
      return err(`Cliente "${body.clienteId}" não encontrado`, 'CLIENTE_NOT_FOUND')
    }
    try {
      const out = await service.render({
        templateSlug: slug,
        cliente: cli,
        inputs: body.inputs ?? {},
      })

      // Auditoria PG (best-effort)
      if (isPgEnabled()) {
        try {
          await getDb().insert(processoRender).values({
            clienteId: cli.id,
            templateSlug: out.template.slug,
            templateCodigo: out.template.codigo,
            formato: out.template.formato,
            filename: out.filename,
            bytes: out.buffer.length,
            inputs: body.inputs ?? {},
            resolved: out.resolvedData,
            ator: 'consultor',
            traceId: (req as any).id ?? null,
          })
        } catch (e) {
          req.log.warn({ err: e }, 'processo_render audit insert failed')
        }
      }

      reply
        .header('Content-Type', out.contentType)
        .header('Content-Disposition', `attachment; filename="${out.filename}"`)
        .header('X-Processo-Slug', out.template.slug)
        .header('X-Processo-Codigo', out.template.codigo)
      return reply.send(out.buffer)
    } catch (e: any) {
      reply.code(400)
      return err(e?.message ?? 'erro no render', 'RENDER_ERROR')
    }
  })

  // ── Checklists do cliente ─────────────────────────────────
  fastify.get('/api/processo-assessoria/clientes/:id/checklists', async (req) => {
    const { id } = req.params as { id: string }
    const list = await checklistRepo.listByCliente(id)
    return envelope({
      clienteId: id,
      checklists: list.map((s) => ({
        templateSlug: s.templateSlug,
        status: s.status,
        totalItens: s.totalItens,
        itensConcluidos: s.itensConcluidos,
        progresso: s.totalItens > 0 ? s.itensConcluidos / s.totalItens : 0,
        responsavel: s.responsavel,
        atualizadoEm: s.atualizadoEm,
      })),
    })
  })

  fastify.get('/api/processo-assessoria/clientes/:id/checklists/:slug', async (req, reply) => {
    const { id, slug } = req.params as { id: string; slug: string }
    const tpl = getProcessoTemplateBySlug(slug)
    if (!tpl) {
      reply.code(404)
      return err('Template não existe', 'NOT_FOUND')
    }
    if (!tpl.checklist) {
      reply.code(400)
      return err(`Template "${slug}" não é um checklist interativo`, 'NOT_CHECKLIST')
    }
    const state = await checklistRepo.get(id, slug)
    return envelope({
      template: {
        slug: tpl.slug,
        codigo: tpl.codigo,
        nome: tpl.nome,
        versao: tpl.versao,
        descricao: tpl.descricao,
        items: tpl.checklist,
      },
      state,
    })
  })

  fastify.patch(
    '/api/processo-assessoria/clientes/:id/checklists/:slug/itens/:itemId',
    async (req, reply) => {
      const { id, slug, itemId } = req.params as { id: string; slug: string; itemId: string }
      const body = (req.body ?? {}) as {
        marcado?: boolean
        observacao?: string
        anexoId?: string
        responsavel?: string
      }
      try {
        const state = await checklistRepo.upsertItem(
          id,
          slug,
          itemId,
          {
            marcado: body.marcado,
            observacao: body.observacao,
            anexoId: body.anexoId,
          },
          { responsavel: body.responsavel },
        )
        return envelope({ state })
      } catch (e: any) {
        reply.code(400)
        return err(e?.message ?? 'erro upsertItem', 'UPSERT_ERROR')
      }
    },
  )

  fastify.delete(
    '/api/processo-assessoria/clientes/:id/checklists/:slug',
    async (req, reply) => {
      const { id, slug } = req.params as { id: string; slug: string }
      const confirm = (req.query as any)?.confirm
      if (confirm !== 'YES') {
        reply.code(400)
        return err('Adicione ?confirm=YES para confirmar reset', 'CONFIRM_REQUIRED')
      }
      await checklistRepo.reset(id, slug)
      return envelope({ ok: true })
    },
  )

  // ── Histórico de renderizações ────────────────────────────
  fastify.get('/api/processo-assessoria/clientes/:id/historico', async (req) => {
    const { id } = req.params as { id: string }
    if (!isPgEnabled()) return envelope({ historico: [] })
    const rows = await getDb()
      .select()
      .from(processoRender)
      .where(eq(processoRender.clienteId, id))
      .orderBy(desc(processoRender.criadoEm))
      .limit(100)
    return envelope({
      total: rows.length,
      historico: rows.map((r) => ({
        id: r.id,
        templateSlug: r.templateSlug,
        templateCodigo: r.templateCodigo,
        formato: r.formato,
        filename: r.filename,
        bytes: r.bytes,
        ator: r.ator,
        criadoEm: r.criadoEm,
      })),
    })
  })
}

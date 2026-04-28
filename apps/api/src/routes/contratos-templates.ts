// ============================================================
// /api/contratos/templates — REST para os 10 templates ALETIS
// ============================================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getContractTemplateService, type RenderClienteData, type OutorganteEntry } from '../services/contratos/ContractTemplateService.js'
import { resolveTemplateSlug } from '../services/contratos/templateResolver.js'
import { alixGetClientes } from '../services/AlixService.js'
import { randomBytes } from 'crypto'

// Cache de renders temporários (TTL 1h) — usado pela tool ALIX
// para retornar uma URL de download em chat sem expor base64.
interface CachedRender {
  buffer: Buffer
  filename: string
  contentType: string
  expiresAt: number
}
const RENDER_CACHE = new Map<string, CachedRender>()
const RENDER_TTL_MS = 60 * 60_000

function pruneRenderCache(): void {
  const now = Date.now()
  for (const [k, v] of RENDER_CACHE.entries()) {
    if (v.expiresAt < now) RENDER_CACHE.delete(k)
  }
}
const cacheSweep = setInterval(pruneRenderCache, 5 * 60_000)
if (cacheSweep.unref) cacheSweep.unref()

export function cacheRender(buffer: Buffer, filename: string): string {
  const token = randomBytes(16).toString('hex')
  RENDER_CACHE.set(token, {
    buffer,
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    expiresAt: Date.now() + RENDER_TTL_MS,
  })
  return token
}

// Carrega cliente do CRM (in-memory map) e mapeia para RenderClienteData.
function loadCliente(clienteId: string): RenderClienteData | null {
  const list = alixGetClientes()
  const c = list.find((x: any) => String(x?.id) === clienteId)
  if (!c) return null
  // cpfCnpj pode ter prefixo XXX e estar mascarado/limpo
  const cpfDigits = String(c.cpfCnpj ?? '').replace(/\D/g, '')
  const isCnpj = cpfDigits.length === 14
  return {
    id: String(c.id),
    nome: String(c.nome ?? ''),
    cpf: !isCnpj ? c.cpfCnpj : null,
    cnpj: isCnpj ? c.cpfCnpj : null,
    rg: c.rg ?? null,
    orgaoRg: c.orgaoRg ?? null,
    qualificacao: c.qualificacao ?? c.atividade ?? null,
    endereco: c.endereco ?? c.logradouro ?? null,
    numero: c.numero ?? null,
    bairro: c.bairro ?? null,
    municipio: c.cidade ?? c.municipio ?? null,
    uf: c.uf ?? null,
    cep: c.cep ?? null,
    email: c.email ?? null,
    telefone: c.telefone ?? null,
    genero: c.genero === 'F' ? 'F' : 'M',
  }
}

interface RenderBody {
  clienteId?: string
  cliente?: RenderClienteData
  inputs?: Record<string, string>
  outorgantes?: OutorganteEntry[]
}

export default async function contratosTemplatesRoutes(fastify: FastifyInstance): Promise<void> {
  // Lista os 10 templates (catálogo)
  fastify.get('/api/contratos/templates', async (_req, reply) => {
    const svc = getContractTemplateService()
    const templates = svc.listTemplates().map((t) => ({
      slug: t.slug,
      title: t.title,
      subtitle: t.subtitle,
      category: t.category,
      originalFile: t.originalFile, // nome do .docx oficial original
      placeholders: t.placeholders.map((p) => ({
        name: p.name,
        label: p.label,
        hint: p.hint,
        sourceKind: p.source.kind,
        required: p.required,
      })),
    }))
    return reply.send({ success: true, data: templates, total: templates.length })
  })

  // Helper: resolve slug literal OU nome natural ("NDA", "consultoria", etc.).
  // Retorna { tpl, slug } ou null com mensagem.
  const findTpl = (raw: string) => {
    const svc = getContractTemplateService()
    // tenta literal primeiro
    const direct = svc.getTemplate(raw)
    if (direct) return { tpl: direct, slug: direct.slug, fuzzy: false }
    // fallback fuzzy
    const r = resolveTemplateSlug(raw)
    if (!r.ok) return null
    const tpl = svc.getTemplate(r.slug)
    if (!tpl) return null
    return { tpl, slug: r.slug, fuzzy: true, matched: r.matched }
  }

  // Schema de um template específico (placeholders + meta) — aceita fuzzy
  fastify.get<{ Params: { slug: string } }>('/api/contratos/templates/:slug', async (req, reply) => {
    const found = findTpl(req.params.slug)
    if (!found) return reply.status(404).send({ success: false, error: 'Template não existe' })
    return reply.send({ success: true, data: found.tpl, resolvedSlug: found.slug, fuzzyMatched: found.fuzzy ? found.matched : undefined })
  })

  // Preview: resolve os placeholders sem renderizar (para a UI mostrar
  // "como vai ficar" antes de baixar). Body: { clienteId | cliente, inputs?, outorgantes? }
  fastify.post<{ Params: { slug: string }; Body: RenderBody }>(
    '/api/contratos/templates/:slug/preview',
    async (req, reply) => {
      const svc = getContractTemplateService()
      const found = findTpl(req.params.slug)
      if (!found) return reply.status(404).send({ success: false, error: 'Template não existe' })
      const cliente = req.body?.cliente ?? (req.body?.clienteId ? loadCliente(req.body.clienteId) : null)
      if (!cliente) return reply.status(400).send({ success: false, error: 'Cliente não encontrado (forneça clienteId ou cliente)' })
      try {
        const preview = svc.preview({
          templateSlug: found.slug,
          cliente,
          inputs: req.body?.inputs,
          outorgantes: req.body?.outorgantes,
        })
        return reply.send({
          success: true,
          data: {
            slug: preview.template.slug,
            title: preview.template.title,
            originalFile: preview.template.originalFile,
            resolved: preview.resolved,
            missing: preview.missing,
            ...(found.fuzzy ? { fuzzyMatched: found.matched } : {}),
          },
        })
      } catch (err) {
        return reply.status(400).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Render: produz o .docx e devolve para download.
  // Body: { clienteId | cliente, inputs?, outorgantes? }
  fastify.post<{ Params: { slug: string }; Body: RenderBody }>(
    '/api/contratos/templates/:slug/render',
    async (req, reply) => {
      const svc = getContractTemplateService()
      const found = findTpl(req.params.slug)
      if (!found) return reply.status(404).send({ success: false, error: 'Template não existe' })
      const cliente = req.body?.cliente ?? (req.body?.clienteId ? loadCliente(req.body.clienteId) : null)
      if (!cliente) return reply.status(400).send({ success: false, error: 'Cliente não encontrado (forneça clienteId ou cliente)' })
      try {
        const result = svc.render({
          templateSlug: found.slug,
          cliente,
          inputs: req.body?.inputs,
          outorgantes: req.body?.outorgantes,
        })
        reply.header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        reply.header('Content-Disposition', `attachment; filename="${result.filename}"`)
        reply.header('X-Template-Slug', found.tpl.slug)
        return reply.send(result.buffer)
      } catch (err) {
        return reply.status(400).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Download de render cacheado (token bound, TTL 1h) — usado pela tool ALIX
  fastify.get<{ Params: { token: string } }>(
    '/api/contratos/templates/cache/:token',
    async (req, reply) => {
      pruneRenderCache()
      const entry = RENDER_CACHE.get(req.params.token)
      if (!entry) return reply.status(404).send({ success: false, error: 'render expirado ou inexistente' })
      reply.header('Content-Type', entry.contentType)
      reply.header('Content-Disposition', `attachment; filename="${entry.filename}"`)
      return reply.send(entry.buffer)
    },
  )

  console.log('[Contratos] Rotas registradas: GET /api/contratos/templates, GET /:slug, POST /:slug/preview, POST /:slug/render, GET /cache/:token')
}

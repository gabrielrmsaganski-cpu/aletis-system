// ============================================================
// /api/clientes/:id/documentos — listagem + upload de docs do cliente
// ============================================================
// Reusa a tabela portal_upload (cofre digital). Diferença vs portal:
//  - "enviado_por": 'consultor' (vs 'cliente' do portal)
//  - "categoria": fiscal | contrato | identidade | patrimonio | agro | outros
//  - Sem vínculo a pendência específica (pendenciaId = null)
// ============================================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { existsSync, mkdirSync } from 'fs'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID, createHash } from 'crypto'
import { eq, desc, and } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { portalUpload } from '../db/schema.js'

const ALLOWED_CATEGORIAS = ['fiscal', 'contrato', 'identidade', 'patrimonio', 'agro', 'outros']
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

function uploadDir(): string {
  const dir = process.env.ALETIS_PORTAL_UPLOAD_DIR || './storage/portal-uploads'
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }) } catch {/* ok */}
  }
  return dir
}

export default async function clienteDocumentosRoutes(fastify: FastifyInstance): Promise<void> {
  // Listar documentos do cliente
  fastify.get<{ Params: { id: string }; Querystring: { categoria?: string } }>(
    '/api/clientes/:id/documentos',
    async (req, reply) => {
      try {
        const db = getDb()
        const where = req.query.categoria
          ? and(eq(portalUpload.clienteId, req.params.id), eq(portalUpload.categoria, req.query.categoria))
          : eq(portalUpload.clienteId, req.params.id)
        const rows = await db
          .select()
          .from(portalUpload)
          .where(where)
          .orderBy(desc(portalUpload.enviadoEm))
          .limit(200)
        return reply.send({
          success: true,
          data: rows.map((r) => ({
            id: r.id,
            nome: r.nomeOriginal,
            mime: r.mime,
            tamanho: r.tamanho,
            categoria: r.categoria,
            enviadoPor: r.enviadoPor,
            enviadoEm: r.enviadoEm,
            sha256: r.sha256,
            downloadUrl: `/api/clientes/${r.clienteId}/documentos/${r.id}/download`,
          })),
          total: rows.length,
        })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Download de um documento
  fastify.get<{ Params: { id: string; docId: string } }>(
    '/api/clientes/:id/documentos/:docId/download',
    async (req, reply) => {
      try {
        const db = getDb()
        const rows = await db
          .select()
          .from(portalUpload)
          .where(and(eq(portalUpload.id, req.params.docId), eq(portalUpload.clienteId, req.params.id)))
          .limit(1)
        const row = rows[0]
        if (!row) return reply.status(404).send({ success: false, error: 'Documento não encontrado' })
        const filePath = join(uploadDir(), row.nomeStorage)
        if (!existsSync(filePath)) {
          return reply.status(410).send({ success: false, error: 'Arquivo expirado/removido do storage' })
        }
        const { readFile } = await import('fs/promises')
        const buf = await readFile(filePath)
        reply.header('Content-Type', row.mime)
        reply.header('Content-Disposition', `attachment; filename="${row.nomeOriginal}"`)
        return reply.send(buf)
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Upload — multipart/form-data (1 arquivo + categoria opcional via header/query)
  fastify.post<{ Params: { id: string }; Querystring: { categoria?: string } }>(
    '/api/clientes/:id/documentos',
    async (req: FastifyRequest<{ Params: { id: string }; Querystring: { categoria?: string } }>, reply: FastifyReply) => {
      let file: MultipartFile | undefined
      try {
        file = await req.file()
      } catch {/* read fail */}
      if (!file) {
        return reply.status(400).send({ success: false, error: 'Nenhum arquivo enviado (campo multipart)' })
      }
      try {
        let buffer: Buffer
        try {
          buffer = await file.toBuffer()
        } catch (err: any) {
          if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
            return reply.status(413).send({ success: false, error: `Arquivo excede ${MAX_BYTES / 1024 / 1024}MB` })
          }
          throw err
        }
        if (buffer.length > MAX_BYTES) {
          return reply.status(413).send({ success: false, error: `Arquivo excede ${MAX_BYTES / 1024 / 1024}MB` })
        }
        const sha256 = createHash('sha256').update(buffer).digest('hex')
        const id = `up_${randomUUID()}`
        const ext = file.filename.includes('.') ? file.filename.split('.').pop() : 'bin'
        const nomeStorage = `${id}.${ext}`
        await writeFile(join(uploadDir(), nomeStorage), buffer)

        const fields = file.fields as any
        const catRaw = String(req.query.categoria ?? fields?.categoria?.value ?? 'outros').toLowerCase()
        const categoria = ALLOWED_CATEGORIAS.includes(catRaw) ? catRaw : 'outros'

        const db = getDb()
        await db.insert(portalUpload).values({
          id,
          clienteId: req.params.id,
          pendenciaId: null,
          nomeOriginal: file.filename,
          nomeStorage,
          mime: file.mimetype,
          tamanho: buffer.length,
          sha256,
          categoria,
          enviadoPor: 'consultor',
          metadata: { uploadedFromConsultor: true },
        })

        return reply.status(201).send({
          success: true,
          data: {
            id,
            nome: file.filename,
            mime: file.mimetype,
            tamanho: buffer.length,
            categoria,
            sha256,
            downloadUrl: `/api/clientes/${req.params.id}/documentos/${id}/download`,
          },
        })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Deletar documento
  fastify.delete<{ Params: { id: string; docId: string } }>(
    '/api/clientes/:id/documentos/:docId',
    async (req, reply) => {
      try {
        const db = getDb()
        const rows = await db
          .select()
          .from(portalUpload)
          .where(and(eq(portalUpload.id, req.params.docId), eq(portalUpload.clienteId, req.params.id)))
          .limit(1)
        const row = rows[0]
        if (!row) return reply.status(404).send({ success: false, error: 'Documento não encontrado' })
        try { await unlink(join(uploadDir(), row.nomeStorage)) } catch {/* já removido */}
        await db.delete(portalUpload).where(eq(portalUpload.id, row.id))
        return reply.send({ success: true })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  console.log('[ClienteDocumentos] Rotas registradas: GET/POST/DELETE /api/clientes/:id/documentos[/:docId][/download]')
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { assertPortalStaff } from '../portal/PortalDocumentRoutes.js'
import { getAccessControlService } from '../core/AccessControlService.js'
import { fiscalConnectionService, FiscalConnectionError } from './FiscalConnectionService.js'
import { fiscalArchiveService } from './FiscalArchiveService.js'

const owner = (r: FastifyRequest) => (r as FastifyRequest & { clienteId: string }).clienteId
const uploads = new Set<string>()
export async function registerFiscalConnectionRoutes(app: FastifyInstance, authenticate: (r: FastifyRequest, reply: FastifyReply) => Promise<unknown>) {
  const client = '/api/portal/fiscal/conexao'
  const staff = '/api/clientes/:id/portal/fiscal/conexao'
  const auth = { preHandler: authenticate }
  async function context(r: FastifyRequest, internal: boolean, write = false) {
    if (!internal) return { clienteId: owner(r), actor: 'portal:' + owner(r) }
    const { client, user } = await assertPortalStaff(app,r,(r.params as { id: string }).id,write)
    if (write) await getAccessControlService().assertClienteAccess({ actor: { id:user.id,nome:user.nome,role:'consultor',consultorId:user.consultorId },clienteId:client.id,action:'write' })
    return { clienteId:client.id,actor:user.id }
  }
  for (const [base,internal] of [[client,false],[staff,true]] as const) {
    const options = internal ? {} : auth
    app.get(base,options,async(r,reply) => { const ctx=await context(r,internal); reply.header('Cache-Control','no-store'); return {success:true,data:await fiscalConnectionService.list(ctx.clienteId)} })
    app.get(base+'/acervo',options,async(r,reply)=>{const ctx=await context(r,internal);reply.header('Cache-Control','no-store');return {success:true,data:await fiscalArchiveService.search(ctx.clienteId,r.query)}})
    app.get(base+'/historico',options,async(r,reply)=>{const ctx=await context(r,internal);reply.header('Cache-Control','no-store');return {success:true,data:await fiscalArchiveService.history(ctx.clienteId,r.query)}})
    app.get(base+'/documentos/:documentId',options,async(r,reply)=>{const ctx=await context(r,internal);reply.header('Cache-Control','no-store');return {success:true,data:await fiscalArchiveService.detail(ctx.clienteId,(r.params as {documentId:string}).documentId)}})
    app.get(base+'/exportar/:format',{...options,config:{rateLimit:{max:6,timeWindow:'1 minute'}}},async(r,reply)=>{
      const ctx=await context(r,internal),format=(r.params as {format:string}).format
      if(format!=='csv'&&format!=='zip'&&format!=='xlsx')throw new FiscalConnectionError('Formato inválido.')
      const file=await fiscalArchiveService.export(ctx.clienteId,r.query,format,ctx.actor)
      return reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename="${file.filename}"`).type(file.contentType).send(file.body)
    })
    if(internal)app.post(base+'/documentos/:documentId/reencaminhar',options,async(r,reply)=>{const ctx=await context(r,true,true);reply.header('Cache-Control','no-store');return {success:true,data:await fiscalArchiveService.retryBridge(ctx.clienteId,(r.params as {documentId:string}).documentId,ctx.actor)}})
    app.post(base+'/consultar',options,async(r,reply) => { const ctx=await context(r,internal,true); reply.header('Cache-Control','no-store'); return {success:true,data:await fiscalConnectionService.consult(ctx.clienteId,r.body,r.headers['idempotency-key'],ctx.actor)} })
    app.post(base+'/credenciais/:credentialId/suspender',options,async(r,reply) => { const ctx=await context(r,internal,true); reply.header('Cache-Control','no-store'); return {success:true,data:await fiscalConnectionService.change(ctx.clienteId,(r.params as {credentialId:string}).credentialId,r.body,ctx.actor,true)} })
    app.patch(base+'/credenciais/:credentialId/automacao',options,async(r,reply) => { const ctx=await context(r,internal,true); reply.header('Cache-Control','no-store'); return {success:true,data:await fiscalConnectionService.change(ctx.clienteId,(r.params as {credentialId:string}).credentialId,r.body,ctx.actor,false)} })
    app.get(base+'/documentos/:documentId/download',options,async(r,reply) => {
      const ctx=await context(r,internal); const file=await fiscalConnectionService.download(ctx.clienteId,(r.params as {documentId:string}).documentId,ctx.actor)
      return reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; sandbox").header('Content-Disposition',`attachment; filename="${file.filename}"`).type('application/xml; charset=utf-8').send(file.xml)
    })
  }
  // O titular envia pelo portal autenticado; a equipe não pode importar chaves pelo cadastro de terceiros.
  app.post(client+'/certificado',{...auth,bodyLimit:280*1024,config:{rateLimit:{max:8,timeWindow:'1 hour'}}},async(r,reply) => {
    const clienteId=owner(r)
    if (uploads.has(clienteId) || uploads.size>=4) throw new FiscalConnectionError('Aguarde os envios em andamento.',429)
    uploads.add(clienteId)
    let file:Buffer|undefined
    const fields:Record<string,unknown>={}
    try {
      if (!r.isMultipart()) throw new FiscalConnectionError('Use o formulário de envio de certificado.',415)
      let filename=''
      for await (const part of r.parts({limits:{fileSize:256*1024,files:1,fields:4,fieldSize:2048,parts:5}})) {
        if (part.type==='file') { if(part.fieldname!=='file') throw new FiscalConnectionError('Campo de arquivo inválido.'); filename=part.filename;file=await part.toBuffer();if(part.file.truncated)throw new FiscalConnectionError('O certificado excede 256 KB.',413) }
        else { if(Object.hasOwn(fields,part.fieldname))throw new FiscalConnectionError('Campo repetido.');fields[part.fieldname]=part.value }
      }
      if (!file) throw new FiscalConnectionError('Selecione o arquivo do certificado A1.')
      const result=await fiscalConnectionService.receive(clienteId,{file,filename,fields},r.headers['idempotency-key'])
      return reply.header('Cache-Control','no-store').code(result.replayed?200:201).send({success:true,data:result.credencial,replayed:result.replayed})
    } finally { file?.fill(0);fields.senha=undefined;uploads.delete(clienteId) }
  })
}

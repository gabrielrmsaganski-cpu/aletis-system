import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { assertPortalStaff } from './PortalDocumentRoutes.js'
import { getAccessControlService } from '../core/AccessControlService.js'
import { portalFiscalService } from './PortalFiscalService.js'

const owner=(request:FastifyRequest)=>(request as FastifyRequest&{clienteId:string}).clienteId
export async function registerPortalFiscalRoutes(fastify:FastifyInstance,authenticate:(request:FastifyRequest,reply:FastifyReply)=>Promise<unknown>){
  const auth={preHandler:authenticate}
  fastify.get('/api/portal/fiscal',auth,async(request,reply)=>{reply.header('Cache-Control','no-store');return{success:true,data:await portalFiscalService.list(owner(request))}})
  fastify.post('/api/portal/fiscal/autorizacoes',auth,async(request,reply)=>{const result=await portalFiscalService.create(owner(request),request.body,request.headers['idempotency-key']);return reply.code(result.replayed?200:201).send({success:true,data:result.autorizacao,replayed:result.replayed})})
  fastify.patch('/api/portal/fiscal/autorizacoes/:id/suspender',auth,async request=>({success:true,data:await portalFiscalService.revoke(owner(request),(request.params as {id:string}).id,request.body)}))
  fastify.get('/api/clientes/:id/portal/fiscal',async(request,reply)=>{const{client}=await assertPortalStaff(fastify,request,(request.params as {id:string}).id);reply.header('Cache-Control','no-store');return{success:true,data:await portalFiscalService.list(client.id)}})
  fastify.patch('/api/clientes/:id/portal/fiscal/autorizacoes/:authorizationId',async request=>{
    const{id,authorizationId}=request.params as{id:string;authorizationId:string};const{client,user}=await assertPortalStaff(fastify,request,id,true)
    await getAccessControlService().assertClienteAccess({actor:{id:user.id,nome:user.nome,role:'consultor',consultorId:user.consultorId},clienteId:client.id,action:'write'})
    return{success:true,data:await portalFiscalService.review(client.id,authorizationId,request.body,user.id)}
  })
}

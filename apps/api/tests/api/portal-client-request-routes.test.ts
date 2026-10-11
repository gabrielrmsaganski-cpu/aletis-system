import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const calls = vi.hoisted(() => ({ list:vi.fn(),create:vi.fn(),review:vi.fn(),cancel:vi.fn(),staff:vi.fn(),access:vi.fn() }))
vi.mock('../../src/services/portal/PortalClientRequestService.js', () => ({
  portalClientRequestService: calls,
  PortalClientRequestError: class extends Error { constructor(message:string,public statusCode=400) {super(message)} },
}))
vi.mock('../../src/services/portal/PortalDocumentRoutes.js', () => ({ assertPortalStaff:calls.staff }))
vi.mock('../../src/services/core/AccessControlService.js', () => ({ getAccessControlService:()=>({assertClienteAccess:calls.access}) }))
import { registerPortalClientRequestRoutes } from '../../src/services/portal/PortalClientRequestRoutes.js'

describe('rotas de atendimento preservam autorização e escopo do cliente',()=>{
  let app:FastifyInstance
  beforeEach(async()=>{
    vi.resetAllMocks()
    calls.list.mockResolvedValue([])
    calls.staff.mockResolvedValue({client:{id:'canonical-client'},user:{id:'staff-a',nome:'Equipe',consultorId:'staff-a'}})
    calls.create.mockResolvedValue({request:{id:'new-request'},replayed:false})
    calls.review.mockResolvedValue({id:'request-a'})
    calls.cancel.mockResolvedValue({id:'request-a'})
    app=Fastify()
    await registerPortalClientRequestRoutes(app,async(request,reply)=>{
      if(request.headers['x-fixture-client']!=='client-a')return reply.code(401).send({success:false})
      ;(request as any).clienteId='client-a'
    })
    await app.ready()
  })
  afterEach(async()=>{await app.close()})
  it('leitura pública exige autenticação e usa somente o cliente autenticado',async()=>{
    expect((await app.inject({url:'/api/portal/solicitacoes'})).statusCode).toBe(401)
    expect(calls.list).not.toHaveBeenCalled()
    expect((await app.inject({url:'/api/portal/solicitacoes?clienteId=client-b',headers:{'x-fixture-client':'client-a'}})).statusCode).toBe(200)
    expect(calls.list).toHaveBeenCalledWith('client-a')
  })
  it('pedido exige comprovante idempotente e responde com o recibo confirmado',async()=>{
    const input={method:'POST' as const,url:'/api/portal/solicitacoes',headers:{'x-fixture-client':'client-a'},payload:{tipo:'duvida',assunto:'Uma dúvida',mensagem:'Como envio meu documento?'}}
    expect((await app.inject(input)).statusCode).toBe(400);expect(calls.create).not.toHaveBeenCalled()
    expect((await app.inject({...input,headers:{...input.headers,'idempotency-key':'same-request-123'}})).statusCode).toBe(201)
    expect(calls.create).toHaveBeenCalledWith('client-a',input.payload,'same-request-123')
    calls.create.mockResolvedValue({request:{id:'new-request'},replayed:true})
    expect((await app.inject({...input,headers:{...input.headers,'idempotency-key':'same-request-123'}})).statusCode).toBe(200)
  })
  it('bloqueio da carteira impede a equipe de ler ou responder o atendimento',async()=>{
    calls.staff.mockRejectedValue(Object.assign(new Error('Acesso negado'),{statusCode:403}))
    expect((await app.inject({url:'/api/clientes/client-b/portal/solicitacoes'})).statusCode).toBe(403)
    expect((await app.inject({method:'PATCH',url:'/api/clientes/client-b/portal/solicitacoes/request-a',payload:{}})).statusCode).toBe(403)
    expect(calls.list).not.toHaveBeenCalled();expect(calls.review).not.toHaveBeenCalled()
  })
  it('aplicar correção exige autorização de escrita no CRM além da autorização documental',async()=>{
    const input={method:'PATCH' as const,url:'/api/clientes/alias/portal/solicitacoes/request-a',payload:{aplicarAlteracoes:true}}
    calls.access.mockRejectedValueOnce(Object.assign(new Error('Sem permissão de edição'),{statusCode:403}))
    expect((await app.inject(input)).statusCode).toBe(403);expect(calls.review).not.toHaveBeenCalled()
    expect(calls.access).toHaveBeenCalledWith(expect.objectContaining({clienteId:'canonical-client',action:'write',actor:expect.objectContaining({id:'staff-a'})}))
    expect((await app.inject(input)).statusCode).toBe(200)
    expect(calls.review).toHaveBeenCalledWith('canonical-client','request-a',input.payload,'staff-a')
  })
  it('cancelamento exige versão válida e nunca aceita cliente fornecido no corpo',async()=>{
    const input={method:'PATCH' as const,url:'/api/portal/solicitacoes/request-a/cancelar',headers:{'x-fixture-client':'client-a'}}
    expect((await app.inject({...input,payload:{}})).statusCode).toBe(428)
    const expectedUpdatedAt='2026-09-11T10:00:00.000Z'
    expect((await app.inject({...input,payload:{expectedUpdatedAt,clienteId:'client-b'}})).statusCode).toBe(428)
    expect(calls.cancel).not.toHaveBeenCalled()
    expect((await app.inject({...input,payload:{expectedUpdatedAt}})).statusCode).toBe(200)
    expect(calls.cancel).toHaveBeenCalledWith('client-a','request-a',expectedUpdatedAt)
  })
})

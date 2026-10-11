import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({verifyState:vi.fn(),exchangeCode:vi.fn(),saveCorporate:vi.fn(),saveOrdinary:vi.fn(),invalidate:vi.fn(),audit:vi.fn()}))
vi.mock('../../src/routes/clientes.js',()=>({clientes:new Map()}))
vi.mock('../../src/services/google-workspace/client.js',()=>({getGoogleWorkspaceClient:()=>({verifyState:mocks.verifyState,exchangeCode:mocks.exchangeCode})}))
vi.mock('../../src/services/google-workspace/tokenStore.js',()=>({getGoogleTokenStore:()=>({saveCorporateConnected:mocks.saveCorporate,saveConnected:mocks.saveOrdinary})}))
vi.mock('../../src/services/google-workspace/CorporateDriveCredentials.js',()=>({getCorporateDriveCredentials:()=>({invalidate:mocks.invalidate})}))
vi.mock('../../src/services/google-workspace/audit.js',()=>({getGoogleWorkspaceAuditService:()=>({record:mocks.audit})}))
vi.mock('../../src/services/google-workspace/services.js',()=>({getGoogleWorkspaceService:()=>({})}))
vi.mock('../../src/services/google-workspace/drive.js',()=>({getGoogleDriveService:()=>({})}))
vi.mock('../../src/services/google-workspace/docs.js',()=>({getGoogleDocsService:()=>({})}))
vi.mock('../../src/services/google-workspace/calendar.js',()=>({getGoogleWorkspaceCalendarService:()=>({})}))
vi.mock('../../src/services/google-workspace/gmail.js',()=>({getGoogleGmailService:()=>({})}))
vi.mock('../../src/services/google-workspace/DriveImportBatchService.js',()=>({DriveImportBatchError:class extends Error{},getDriveImportBatchService:()=>({})}))
import routes from '../../src/routes/google-workspace.js'

describe('callback da autorização corporativa explícita',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    vi.stubEnv('GOOGLE_OAUTH_FRONTEND_URL','https://aletis.example.invalid')
    mocks.verifyState.mockReturnValue({userId:'owner-fixture',tenantId:'tenant-fixture',purpose:'corporate_drive',returnPath:'/configuracoes?tab=google'})
    mocks.exchangeCode.mockResolvedValue({tokens:{accessToken:'access-fixture',refreshToken:'refresh-fixture',tokenExpiry:new Date(),scopes:['https://www.googleapis.com/auth/drive']},googleEmail:'owner@example.invalid',googleAccountId:'google-fixture'})
    mocks.saveCorporate.mockResolvedValue({id:'fixture'});mocks.saveOrdinary.mockResolvedValue({id:'fixture'});mocks.audit.mockResolvedValue(undefined)
  })
  afterEach(()=>vi.unstubAllEnvs())
  it('consome propósito do estado assinado, persiste antes de ativar e registra o consentimento',async()=>{
    const app=Fastify();await app.register(routes)
    try{
      const response=await app.inject({url:'/api/integrations/google/callback?code=fixture-code&state=signed-fixture'})
      expect(response.statusCode).toBe(302);expect(response.headers.location).toContain('google=connected')
      expect(mocks.exchangeCode).toHaveBeenCalledWith('fixture-code','http://localhost:80','corporate_drive')
      expect(mocks.saveCorporate).toHaveBeenCalledWith(expect.objectContaining({actor:expect.objectContaining({userId:'owner-fixture',tenantId:'tenant-fixture'})}))
      expect(mocks.saveOrdinary).not.toHaveBeenCalled();expect(mocks.invalidate).toHaveBeenCalledOnce()
      expect(mocks.saveCorporate.mock.invocationCallOrder[0]).toBeLessThan(mocks.invalidate.mock.invocationCallOrder[0])
    }finally{await app.close()}
  })
  it('erro de persistência não mostra conexão concluída nem troca a credencial',async()=>{
    mocks.saveCorporate.mockRejectedValue(new Error('storage failure with secret fixture'))
    const app=Fastify();await app.register(routes)
    try{
      const response=await app.inject({url:'/api/integrations/google/callback?code=fixture-code&state=signed-fixture'})
      expect(response.headers.location).toContain('google=error');expect(response.body).not.toContain('secret fixture')
      expect(mocks.invalidate).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled()
    }finally{await app.close()}
  })
  it('query externa não transforma autorização comum em seleção corporativa',async()=>{
    mocks.verifyState.mockReturnValue({userId:'owner-fixture',tenantId:'tenant-fixture'})
    const app=Fastify();await app.register(routes)
    try{
      const response=await app.inject({url:'/api/integrations/google/callback?code=fixture-code&state=signed-fixture&purpose=corporate_drive'})
      expect(response.headers.location).toContain('google=connected');expect(mocks.saveCorporate).not.toHaveBeenCalled()
      expect(mocks.saveOrdinary).toHaveBeenCalledOnce();expect(mocks.invalidate).not.toHaveBeenCalled()
    }finally{await app.close()}
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const calls = vi.hoisted(() => ({ overview:vi.fn(),list:vi.fn(),search:vi.fn(),read:vi.fn(),analyses:vi.fn() }))
vi.mock('../../src/services/google-workspace/DriveCorpusService.js', async original => ({ ...await original<object>(),getDriveCorpusService:()=>calls }))
vi.mock('../../src/services/alix/intake/DriveCorpusAnalysisService.js', () => ({ listDriveCorpusAnalyses: calls.analyses }))
import { DriveCorpusError } from '../../src/services/google-workspace/DriveCorpusService.js'
import { buildDriveCorpusTools } from '../../src/services/alix/tools/drive-corpus.js'
import { readCorpusPage } from '../../src/services/google-workspace/DriveCorpusTypes.js'
import { selectToolsForMessage } from '../../src/services/alix/tools/ToolSelector.js'
import { preparationRegistry } from '../../src/services/alix/tools/PreparationPolicy.js'
import { toolOutcome } from '../../src/services/alix/tools/ToolOutcome.js'
const actor = {userId:'owner',userName:'Responsável',role:'consultor',tenantId:'tenant'}
beforeEach(()=> {vi.resetAllMocks();calls.overview.mockResolvedValue({});calls.list.mockResolvedValue({files:[]});calls.search.mockResolvedValue({results:[]});calls.read.mockResolvedValue({available:true});calls.analyses.mockResolvedValue({analyses:[],nextOffset:null});vi.stubGlobal('fetch', () => { throw new Error('Rede proibida nesta suíte') })})
afterEach(() => vi.unstubAllGlobals())
describe('acervo Drive nas ferramentas ALIX',()=> {
  it('mantém as quatro capacidades acessíveis para pedidos de Drive mesmo com limite reduzido',()=> {
    const corpus = buildDriveCorpusTools({sessionId:'session',actor})
    const selected = selectToolsForMessage(corpus.tools,corpus.registry,'Leia o Drive para preparar meu relatório',1)
    expect(selected.selectedNames).toHaveLength(4)
    expect(Object.keys(preparationRegistry(corpus.registry,'a'))).toHaveLength(4)
    expect(toolOutcome('ler_arquivo_drive',{success:true})).toBe('read')
  })
  it('recusa mudança do cliente ativo antes de consultar qualquer fonte',async()=> {
    const corpus = buildDriveCorpusTools({sessionId:'session',actor,clienteId:'a'})
    for(const name of ['consultar_acervo_drive','consultar_analises_drive','pesquisar_conteudo_drive','ler_arquivo_drive']) {
      expect(await corpus.registry[name].handler({clienteId:'b',busca:'contrato',fileId:'file'})).toMatchObject({success:false})
    }
    expect(calls.search).not.toHaveBeenCalled();expect(calls.read).not.toHaveBeenCalled();expect(calls.list).not.toHaveBeenCalled();expect(calls.analyses).not.toHaveBeenCalled()
  })
  it('não inventa identidade autenticada a partir de consultorId isolado',async()=> {
    const corpus=buildDriveCorpusTools({sessionId:'s',consultorId:'owner'})
    expect(await corpus.registry.consultar_acervo_drive.handler({})).toMatchObject({success:false})
    expect(calls.overview).not.toHaveBeenCalled()
  })
  it('propaga usuário, tenant e escopo fixo à busca e preserva resultado vazio',async()=> {
    const corpus=buildDriveCorpusTools({sessionId:'s',actor,clienteId:'a'})
    expect(await corpus.registry.pesquisar_conteudo_drive.handler({busca:'hipoteca'})).toMatchObject({success:true,data:{results:[]}})
    expect(calls.search).toHaveBeenCalledWith(actor,expect.objectContaining({clienteId:'a',query:'hipoteca',limit:5}))
  })
  it('não expõe detalhes internos de falhas e interrompe ferramenta cancelada',async()=> {
    calls.read.mockRejectedValue(new Error('postgresql://sensitive'))
    const result=await buildDriveCorpusTools({sessionId:'s',actor}).registry.ler_arquivo_drive.handler({fileId:'f'})
    expect(JSON.stringify(result)).not.toContain('sensitive')
    const signal=AbortSignal.abort()
    await expect(buildDriveCorpusTools({sessionId:'s',actor,signal}).registry.consultar_acervo_drive.handler({})).rejects.toThrow()
  })
  it('consulta novidades com data válida e preserva o cliente da conversa',async()=> {
    const corpus=buildDriveCorpusTools({sessionId:'s',actor,clienteId:'a'})
    expect(await corpus.registry.consultar_acervo_drive.handler({alteradosDesde:'2026-09-08T00:00:00-03:00',estado:'changed'})).toMatchObject({success:true})
    expect(calls.list).toHaveBeenCalledWith(actor,expect.objectContaining({clienteId:'a',changedSince:'2026-09-08T00:00:00-03:00',status:'changed'}))
    calls.list.mockClear()
    expect(await corpus.registry.consultar_acervo_drive.handler({alteradosDesde:'ontem'})).toMatchObject({success:false})
    expect(calls.list).not.toHaveBeenCalled()
  })
})
describe('leitura integral paginada do corpus',()=> {
  it('percorre todo texto sem perder caracteres ou repetir trechos',()=> {
    const text='Texto português com números 123 e 🌿\n'.repeat(900);let cursor: string|undefined;let assembled='';let pieces=0
    do {const page=readCorpusPage({fileId:'f',revision:'r',text,cursor,maxChars:1000});assembled+=page.text;cursor=page.nextCursor||undefined;pieces++}while(cursor)
    expect(assembled).toBe(text);expect(pieces).toBeGreaterThan(10)
  })
  it('recusa cursor de outro arquivo ou conteúdo, mesmo com revisão reutilizada',()=> {
    const page=readCorpusPage({fileId:'a',revision:'r',text:'abc'.repeat(2000),maxChars:1000})
    expect(()=>readCorpusPage({fileId:'b',revision:'r',text:'abc'.repeat(2000),cursor:page.nextCursor!})).toThrow()
    expect(()=>readCorpusPage({fileId:'a',revision:'r',text:'xyz'.repeat(2000),cursor:page.nextCursor!})).toThrow()
    expect(()=>readCorpusPage({fileId:'a',revision:'r',text:'abc',cursor:'malformed'})).toThrow()
  })
})

describe('análises documentais do Drive na conversa e preparação', () => {
  it.each(['Organize o CRM', 'Prepare o trabalho da equipe', 'Veja as pendências', 'Revise os documentos', 'Prepare o dossiê'])('mantém a consulta de análises para %s com orçamento mínimo de ferramentas', message => {
    const corpus = buildDriveCorpusTools({ sessionId: 's', actor })
    expect(selectToolsForMessage(corpus.tools, corpus.registry, message, 1).selectedNames).toContain('consultar_analises_drive')
    expect(toolOutcome('consultar_analises_drive', { success: true })).toBe('read')
  })
  it('exige ator autenticado e não aceita tenant ou papel vindos dos argumentos da ferramenta', async () => {
    const anonymous = buildDriveCorpusTools({ sessionId: 's', consultorId: 'owner' })
    expect(await anonymous.registry.consultar_analises_drive.handler({})).toMatchObject({ success: false })
    expect(calls.analyses).not.toHaveBeenCalled()
    const corpus = buildDriveCorpusTools({ sessionId: 's', actor, clienteId: 'a' })
    expect(await corpus.registry.consultar_analises_drive.handler({ tenantId: 'other', role: 'admin' })).toMatchObject({ success: false })
    expect(calls.analyses).not.toHaveBeenCalled()
  })
  it('propaga identidade/tenant e cliente fixo com limites conservadores, preservando resultado vazio', async () => {
    const corpus = buildDriveCorpusTools({ sessionId: 's', actor, clienteId: 'a' })
    expect(await corpus.registry.consultar_analises_drive.handler({})).toEqual({ success: true, data: { analyses: [], nextOffset: null } })
    expect(calls.analyses).toHaveBeenCalledWith(actor, { clienteId: 'a', analysisId: undefined, offset: 0, limit: 3, candidateOffset: 0, candidateLimit: 8 })
  })
  it('confere mudança de cliente antes do serviço e mantém escopo na preparação operacional', async () => {
    const corpus = buildDriveCorpusTools({ sessionId: 's', actor, clienteId: 'a' })
    expect(await corpus.registry.consultar_analises_drive.handler({ clienteId: 'b' })).toMatchObject({ success: false, error: expect.stringContaining('cliente da conversa') })
    const prepared = preparationRegistry(corpus.registry, 'a')
    expect(await prepared.consultar_analises_drive.handler({ clienteId: 'b' })).toMatchObject({ ok: false, code: 'PREPARATION_CLIENT_MISMATCH' })
    expect(calls.analyses).not.toHaveBeenCalled()
  })
  it('pagina documentos e candidatos sem trocar fonte ou perder o estado de revisão', async () => {
    const analysisId = 'a'.repeat(64)
    calls.analyses.mockResolvedValueOnce({ analyses: [{ id: analysisId, candidates: [{ id: 'c1', status: 'pending_review' }], nextCandidateOffset: 4 }], nextOffset: 3 })
      .mockResolvedValueOnce({ analyses: [{ id: analysisId, candidates: [{ id: 'c5', status: 'pending_review' }], nextCandidateOffset: null }], nextOffset: null })
    const corpus = buildDriveCorpusTools({ sessionId: 's', actor, clienteId: 'a' })
    expect(await corpus.registry.consultar_analises_drive.handler({ offset: 0, limite: 3 })).toMatchObject({ success: true, data: { nextOffset: 3, analyses: [{ nextCandidateOffset: 4 }] } })
    expect(await corpus.registry.consultar_analises_drive.handler({ analysisId, candidateOffset: 4, limite: 1 })).toMatchObject({ success: true, data: { analyses: [{ candidates: [{ status: 'pending_review' }], nextCandidateOffset: null }] } })
    expect(calls.analyses).toHaveBeenLastCalledWith(actor, expect.objectContaining({ clienteId: 'a', analysisId, candidateOffset: 4, candidateLimit: 64, limit: 1 }))
    expect(calls.read).not.toHaveBeenCalled()
  })
  it('recupera um documento específico em uma chamada ampla e permite reduzir o lote de candidatos', async () => {
    const analysisId = 'a'.repeat(64)
    const corpus = buildDriveCorpusTools({ sessionId: 's', actor, clienteId: 'a' })
    await corpus.registry.consultar_analises_drive.handler({ analysisId, offset: 9, limite: 10 })
    expect(calls.analyses).toHaveBeenLastCalledWith(actor, expect.objectContaining({ analysisId, offset: 0, limit: 1, candidateLimit: 64 }))
    await corpus.registry.consultar_analises_drive.handler({ analysisId, candidateOffset: 64, limiteCandidatos: 12 })
    expect(calls.analyses).toHaveBeenLastCalledWith(actor, expect.objectContaining({ analysisId, candidateOffset: 64, candidateLimit: 12 }))
  })
  it.each([{ limite: 0 }, { limite: 11 }, { offset: -1 }, { offset: 2_000_001 }, { offset: 0.5 }, { candidateOffset: 257 }, { candidateOffset: -1 }, { analysisId: 'not-a-hash' }, { analysisId: 'A'.repeat(64) }, { clienteId: '' }, { cliente_id: 'b' }, { candidateLimit: 100 }, { limiteCandidatos: 0 }, { limiteCandidatos: 65 }, { limiteCandidatos: 1.5 }])('rejeita parâmetro inválido antes da consulta: %j', async invalid => {
    const result = await buildDriveCorpusTools({ sessionId: 's', actor }).registry.consultar_analises_drive.handler(invalid)
    expect(result).toMatchObject({ success: false, completed: false, error: 'Parâmetros de consulta inválidos.' })
    expect(calls.analyses).not.toHaveBeenCalled()
  })
  it('não expõe SQL, stack, token ou caminho privado em erro inesperado', async () => {
    calls.analyses.mockRejectedValue(new Error('SELECT payload postgresql://secret token=secret /root/private/extracted.json'))
    const result = await buildDriveCorpusTools({ sessionId: 's', actor }).registry.consultar_analises_drive.handler({})
    expect(result).toMatchObject({ success: false, completed: false })
    expect(JSON.stringify(result)).not.toMatch(/SELECT|postgresql|secret|\/root\/private|stack/)
  })
  it('preserva recusa segura de RBAC, sem devolver análise vazia como se houvesse autorização', async () => {
    calls.analyses.mockRejectedValue(new DriveCorpusError('Cliente não autorizado.', 403, 'DRIVE_CLIENT_FORBIDDEN'))
    expect(await buildDriveCorpusTools({ sessionId: 's', actor }).registry.consultar_analises_drive.handler({ clienteId: 'a' }))
      .toMatchObject({ success: false, completed: false, error: 'Cliente não autorizado.' })
  })
  it('aborto anterior impede qualquer consulta', async () => {
    const corpus = buildDriveCorpusTools({ sessionId: 's', actor, signal: AbortSignal.abort() })
    await expect(corpus.registry.consultar_analises_drive.handler({})).rejects.toThrow()
    expect(calls.analyses).not.toHaveBeenCalled()
  })
  it.each([false, true])('aborto durante a consulta descarta resposta tardia inclusive após erro=%s', async failure => {
    const controller = new AbortController()
    calls.analyses.mockImplementation(async () => { controller.abort(); if (failure) throw new Error('secret'); return { analyses: [{ private: 'late-result' }] } })
    await expect(buildDriveCorpusTools({ sessionId: 's', actor, signal: controller.signal }).registry.consultar_analises_drive.handler({})).rejects.toThrow()
    expect(calls.analyses).toHaveBeenCalledTimes(1)
  })
})

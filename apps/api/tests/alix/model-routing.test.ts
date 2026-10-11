import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AlixModelSelectionError, selectAlixModel, type RoutingCatalog } from '../../src/services/alix/model-routing/AlixModelRouter.js'

const originalChatModel = process.env.ALIX_CHAT_MODEL

beforeEach(() => {
  delete process.env.ALIX_CHAT_MODEL
})

afterEach(() => {
  if (originalChatModel === undefined) delete process.env.ALIX_CHAT_MODEL
  else process.env.ALIX_CHAT_MODEL = originalChatModel
})

const catalog = (): RoutingCatalog => ({
  provider: 'foundry', configured: true, checkedAt: '2026-09-06T16:00:00.000Z',
  models: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra'].map(id => ({
    id, deployment: id, provider: 'foundry', availability: 'available', label: id,
    capabilities: ['chat', 'tool_calling', 'vision', 'reasoning'], protocols: ['responses'],
  })),
})

describe('seleção de modelo a partir dos deployments disponíveis', () => {
  it('não trata proibições de cadastro/pesquisa como operações solicitadas', () => {
    expect(selectAlixModel(catalog(), { message: 'Extraia os campos da ficha. Não cadastre nada e não pesquise externamente.', attachmentCount: 1 })).toMatchObject({ model: 'gpt-5.6-luna', taskType: 'extraction' })
    expect(selectAlixModel(catalog(), { message: 'Busque o cliente no CRM; não pesquise fontes externas.' })).toMatchObject({ model: 'gpt-5.6-terra', taskType: 'lookup' })
    expect(selectAlixModel(catalog(), { message: 'Não pesquise, mas cadastre os dados fornecidos no CRM.' })).toMatchObject({ model: 'gpt-5.6-terra', taskType: 'operation' })
  })
  it('usa Luna para conversa breve, mesmo quando o modo da página é profundo', () => {
    expect(selectAlixModel(catalog(), { message: 'Bom dia!', analysisMode: 'deep' })).toMatchObject({ model: 'gpt-5.6-luna', taskType: 'quick', fallback: false })
  })
  it('usa Luna para extração delimitada com anexo e mantém Terra nas escritas', () => {
    expect(selectAlixModel(catalog(), { message: 'Extraia os campos desta ficha em uma tabela.', attachmentCount: 1 }).model).toBe('gpt-5.6-luna')
    expect(selectAlixModel(catalog(), { message: 'Cadastre os dados da ficha no CRM.', attachmentCount: 1 })).toMatchObject({ model: 'gpt-5.6-terra', taskType: 'operation' })
  })
  it('usa Sol para análise financeira e Astra para trabalho profundo com várias etapas', () => {
    expect(selectAlixModel(catalog(), { message: 'Compare as opções de renegociação da dívida.' }).model).toBe('gpt-5.6-sol')
    expect(selectAlixModel(catalog(), { message: 'Pesquise as fontes, extraia os contratos e faça uma análise profunda da reestruturação.', attachmentCount: 3, analysisMode: 'deep' })).toMatchObject({ model: 'gpt-6-astra', taskType: 'complex_work', reasoningEffort: 'high' })
  })
  it('prioriza o modelo principal configurado para o chat da ALIX', () => {
    const previous = process.env.ALIX_CHAT_MODEL
    process.env.ALIX_CHAT_MODEL = 'gpt-5.6-sol'
    try {
      expect(selectAlixModel(catalog(), { message: 'Liste meus clientes.' })).toMatchObject({
        model: 'gpt-5.6-sol',
        mode: 'auto',
        preferredModel: 'gpt-5.6-sol',
        fallback: false,
      })
    } finally {
      if (previous === undefined) delete process.env.ALIX_CHAT_MODEL
      else process.env.ALIX_CHAT_MODEL = previous
    }
  })
  it('consultas rotineiras não escalam só porque o modo profundo foi selecionado', () => {
    expect(selectAlixModel(catalog(), { message: 'Quais demandas estão atrasadas hoje?', analysisMode: 'deep' })).toMatchObject({ model: 'gpt-5.6-terra', taskType: 'lookup' })
  })
  it('respeita escolha manual e o nome do deployment efetivo', () => {
    const c = catalog(); c.models[3].deployment = 'astra-producao'
    expect(selectAlixModel(c, { message: 'Liste meus clientes.', modelPreference: 'gpt-6-astra' })).toMatchObject({ model: 'gpt-6-astra', deployment: 'astra-producao', mode: 'manual', requestedModel: 'gpt-6-astra', fallback: false })
  })
  it('ignora catálogo desconhecido e informa a alternativa usada', () => {
    const c = catalog(); c.models[2].availability = 'unknown'
    expect(selectAlixModel(c, { message: 'Analise a viabilidade da operação.' })).toMatchObject({ model: 'gpt-6-astra', preferredModel: 'gpt-5.6-sol', fallback: true })
  })
  it('não muda silenciosamente uma escolha manual indisponível', () => {
    const c = catalog(); c.models[3].availability = 'unavailable'
    expect(() => selectAlixModel(c, { message: 'Analise tudo.', modelPreference: 'gpt-6-astra' })).toThrow(AlixModelSelectionError)
  })
  it('exige suporte aos anexos e exclui modelos que só oferecem embeddings', () => {
    const c = catalog(); c.models[0].capabilities = ['chat', 'tool_calling']
    c.models = [...c.models, { id: 'embedding', deployment: 'embedding', provider: 'foundry', availability: 'available', label: 'Embeddings', capabilities: ['embeddings'] }]
    expect(selectAlixModel(c, { message: 'Extraia os campos.', attachmentCount: 1 })).toMatchObject({ model: 'gpt-5.6-terra', fallback: true })
    expect(() => selectAlixModel(c, { message: 'Extraia os campos.', attachmentCount: 1, modelPreference: 'gpt-5.6-luna' })).toThrow(/recursos necessários/)
  })
  it('não inventa disponibilidade quando o provider não está configurado', () => {
    const c = catalog(); c.configured = false
    expect(() => selectAlixModel(c, { message: 'Olá' })).toThrow(/não está configurada/)
  })
  it('rejeita modelo apenas chat-completions até existir caminho compatível', () => {
    const c = catalog(); c.models.forEach(model => { model.protocols = ['chat_completions'] })
    expect(() => selectAlixModel(c, { message: 'Liste os clientes.' })).toThrow(/Nenhum modelo disponível/)
  })
})


it('modo de pesquisa ou produção orienta pedidos curtos sem escalar uma saudação', () => {
  expect(selectAlixModel(catalog(), { message: 'Verifique as fontes atuais', workMode: 'research' }).taskType).toBe('research')
  expect(selectAlixModel(catalog(), { message: 'Finalize o material', workMode: 'document_generation' })).toMatchObject({ model: 'gpt-5.6-sol', taskType: 'analysis' })
  expect(selectAlixModel(catalog(), { message: 'Bom dia!', workMode: 'document_generation' }).taskType).toBe('quick')
})

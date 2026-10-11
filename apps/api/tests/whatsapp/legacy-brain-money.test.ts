import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WhatsAppBrain } from '../../src/services/whatsapp/WhatsAppBrain.js'

describe('moeda no atendimento legado', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wa-legacy-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })
  function brain(debt?: number) {
    writeFileSync(join(dir, '5599000000000.json'), JSON.stringify({
      waId: '5599000000000', etapa: 'coletando_valor', lead: { credor: 'Banco informado', valorDivida: debt },
      criadoEm: Date.now(), atualizadoEm: Date.now(), mensagens: [], escalouHumano: false, tagsDeEscalada: [],
    }))
    return new WhatsAppBrain({ chat: async () => { throw new Error('Teste não deve consultar modelo') } } as any, dir)
  }
  it.each([['500 mil', '500000.00'], ['1,5 milhão', '1500000.00']])('registra %s como decimal canônico', async (text, expected) => {
    const result = await brain().responder({ waId: '5599000000000', texto: text })
    expect(result.session.lead.valorDivida).toBe(expected)
    expect(result.escalated).toBe(true)
  })
  it('mantém a pergunta quando há faixa em vez de inventar um ponto', async () => {
    const result = await brain().responder({ waId: '5599000000000', texto: 'entre 500 e 700 mil' })
    expect(result.session.etapa).toBe('coletando_valor')
    expect(result.session.lead.valorDivida).toBeUndefined()
  })
  it('carrega valor numérico legado como string sem alterar arquivo histórico', async () => {
    expect((await brain(250000.25).getSession('5599000000000'))?.lead.valorDivida).toBe('250000.25')
  })
})

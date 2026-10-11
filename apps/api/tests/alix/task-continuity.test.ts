import { describe, expect, it } from 'vitest'
import { isAlixContinuation, resolveAlixTaskContinuity } from '../../src/services/alix/AlixTaskContinuity.js'

describe('continuidade do objetivo humano no mesmo caso', () => {
  const objective = { id: 'pedido-1', role: 'user', content: 'Analise profundamente os contratos, compare as garantias e prepare um parecer em PDF. Não altere o cadastro.', metadata: { clienteId: 'cliente-a' } }
  it.each(['continue', 'Por favor, prossiga!', 'Aprofunde os riscos das garantias', 'Detalhe as divergências'])('recupera o pedido para %s', message => {
    const result = resolveAlixTaskContinuity(message, [objective, { role: 'assistant', content: 'Valor alegado: R$ 999.999,00' }], 'cliente-a')
    expect(result?.routingMessage).toContain('parecer em PDF')
    expect(result?.routingMessage).toContain('Não altere o cadastro')
    expect(result?.sourceMessageId).toBe('pedido-1')
    expect(result?.prompt).not.toContain('999.999')
    expect(result?.prompt).toContain('não comprova fatos')
    expect(result?.prompt).toContain('Não interprete a continuação como nova aprovação')
  })
  it('atravessa continuações sucessivas sem trocar o objetivo', () => {
    expect(resolveAlixTaskContinuity('conclua', [objective, { ...objective, content: 'continue', id: 'pedido-2' }], 'cliente-a')?.sourceMessageId).toBe('pedido-1')
  })
  it('não atravessa a fronteira de outro cliente nem histórico sem escopo', () => {
    expect(resolveAlixTaskContinuity('continue', [objective], 'cliente-b')).toBeNull()
    expect(resolveAlixTaskContinuity('continue', [objective], undefined)).toBeNull()
    expect(resolveAlixTaskContinuity('continue', [objective, { ...objective, metadata: { clienteId: 'cliente-b' } }], 'cliente-a')).toBeNull()
    expect(resolveAlixTaskContinuity('continue', [{ ...objective, metadata: {} }], 'cliente-a')).toBeNull()
  })
  it('um novo pedido substitui a tarefa antiga e uma saudação não vira objetivo', () => {
    expect(resolveAlixTaskContinuity('Pesquise o mercado hoje', [objective], 'cliente-a')).toBeNull()
    expect(isAlixContinuation('Continue em outro assunto')).toBe(false)
    expect(resolveAlixTaskContinuity('continue', [{ role: 'user', content: 'Obrigado!' }])).toBeNull()
  })
  it('limita contexto longo explicitamente e serializa conteúdo do usuário', () => {
    const result = resolveAlixTaskContinuity('continue', [{ role: 'user', content: 'Documento '.repeat(2000) }])
    expect(result?.objective.length).toBe(8000)
    expect(result?.truncated).toBe(true)
    expect(result?.prompt).toContain('abreviado por tamanho')
  })
})

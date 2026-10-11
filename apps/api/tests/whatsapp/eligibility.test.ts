import { describe, expect, it } from 'vitest'
import { EligibilityService, type EligibilityAnswer } from '../../src/services/whatsapp/EligibilityService.js'

describe('EligibilityService', () => {
  it('coleta uma pergunta por vez e aprova quando regras minimas batem', () => {
    const svc = new EligibilityService()
    const answers: EligibilityAnswer[] = []

    for (const answer of [
      'Produtor rural',
      'Tenho divida bancaria rural e preciso renegociar contrato do Sicoob',
      'Sim, existe cobranca e contrato bancario vencendo',
      'R$ 2.500.000,00',
      'Sim, consigo enviar contrato e extratos',
      'Sim, quero falar com o Christian',
    ]) {
      const next = svc.getNextQuestion(answers.map((a) => a.questionKey))
      expect(next).toBeTruthy()
      answers.push(svc.parseAnswer(next!, answer))
    }

    const result = svc.calculate(answers)
    expect(result.status).toBe('elegivel')
    expect(result.nextQuestion).toBeUndefined()
    expect(result.score).toBeGreaterThanOrEqual(70)
  })

  it('nao deixa a IA decidir quando faltam respostas obrigatorias', () => {
    const svc = new EligibilityService()
    const result = svc.calculate([])

    expect(result.status).toBe('em_coleta')
    expect(result.nextQuestion?.key).toBe('perfil_agro')
  })
})

describe('triagem contextual em português', () => {
  const svc = new EligibilityService()
  const question = (key: string) => svc.getQuestions().find((item) => item.key === key)!

  it.each([
    ['Não tenho documentação', false], ['Não, não tenho nenhum documento', false],
    ['Tenho dívida, mas não tenho documentação', false], ['Não tenho dívidas, mas tenho documentação', true],
    ['Sim, consigo enviar contrato e extratos', true], ['Não só tenho documentos como posso enviar', true],
    ['Não sei se tenho documentos', null], ['Talvez eu tenha documentos', null],
    ['Não é que eu não tenha documentos', null], ['Tenho documento; não tenho documento', null],
    ['Tenho dívida no banco', null], ['Não tenho dívida no banco', null],
  ])('interpreta o contexto documental: %s', (text, expected) => {
    const parsed = svc.parseAnswer(question('documentacao_minima'), text)
    expect(parsed.value.yes).toBe(expected)
    expect(parsed.value.valid).toBe(expected !== null)
  })

  it('não considera um valor ou booleano ambíguo como resposta concluída', () => {
    expect(svc.parseAnswer(question('perfil_agro'), 'Não tenho documentação').value.valid).toBe(false)
    const good = svc.parseAnswer(question('perfil_agro'), 'Sou produtor rural')
    const problem = svc.parseAnswer(question('problema_principal'), 'Renegociar dívida')
    const unknown = svc.parseAnswer(question('situacao_financeira'), 'Não sei se existe dívida')
    expect(svc.calculate([good, problem, unknown]).nextQuestion?.key).toBe('situacao_financeira')
    const financial = svc.parseAnswer(question('situacao_financeira'), 'Tenho dívida bancária')
    const money = svc.parseAnswer(question('valor_envolvido'), 'entre 500 e 700 mil')
    expect(svc.calculate([good, problem, financial, money]).nextQuestion?.key).toBe('valor_envolvido')
  })

  it('aproveita perfil, problema, dívida, documentos e interesse na mesma mensagem', () => {
    const answers = svc.parseMessage('Sou produtor rural; preciso renegociar uma dívida de 500 mil; tenho contrato e extratos; quero falar com um consultor.', [])
    expect(answers).toHaveLength(6)
    expect(answers.find((answer) => answer.questionKey === 'valor_envolvido')?.value.amount).toBe('500000.00')
    expect(svc.calculate(answers).status).toBe('elegivel')
  })

  it('não repete campos respondidos e mantém desconhecidos pendentes', () => {
    const known = svc.parseMessage('Sou produtor rural e tenho dívida de 1,5 milhão, mas não tenho documentação.', [])
    expect(known.find((answer) => answer.questionKey === 'documentacao_minima')?.value.yes).toBe(false)
    const next = svc.parseMessage('Quero falar com o consultor', known)
    expect(next.map((answer) => answer.questionKey)).toEqual(['deseja_consultor'])
  })

  it('reinterpreta valores de respostas legadas e não duplica sua pontuação', () => {
    const answers = svc.parseMessage('Sou produtor rural; preciso renegociar uma dívida de 500 mil; tenho documentos; quero falar com consultor.', [])
    const money = answers.find((answer) => answer.questionKey === 'valor_envolvido')!
    money.value.amount = 500
    money.score = 0
    expect(svc.calculate([...answers, money]).status).toBe('elegivel')
  })
})

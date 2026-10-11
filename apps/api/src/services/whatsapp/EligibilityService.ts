import { existsSync, readFileSync } from 'node:fs'
import { moneyToCents, parseMoneyPtBr } from '../../lib/parseMoneyPtBr.js'

export interface EligibilityQuestion {
  id?: string
  order?: number
  key: string
  text: string
  kind: 'text' | 'money' | 'boolean' | 'choice'
  required: boolean
  weight?: number
  eligibilityCondition?: Record<string, unknown>
  choices?: string[]
}

export interface EligibilityAnswer {
  questionKey: string
  answerText: string
  value: Record<string, unknown>
  score: number
}

export interface EligibilityResult {
  status: 'em_coleta' | 'elegivel' | 'atencao' | 'nao_elegivel'
  score: number
  maxScore: number
  reasons: string[]
  nextQuestion?: EligibilityQuestion
}

const QUESTIONS: EligibilityQuestion[] = [
  {
    id: 'whatsapp-q1-perfil-agro',
    order: 1,
    key: 'perfil_agro',
    text: 'Voce e produtor rural, empresa do agro ou possui relacao direta com atividade rural?',
    kind: 'choice',
    choices: ['produtor rural', 'empresa agro', 'cooperativa', 'outro'],
    required: true,
    weight: 20,
  },
  {
    id: 'whatsapp-q2-problema',
    order: 2,
    key: 'problema_principal',
    text: 'Qual e o principal problema que deseja resolver?',
    kind: 'text',
    required: true,
    weight: 10,
  },
  {
    id: 'whatsapp-q3-situacao-financeira',
    order: 3,
    key: 'situacao_financeira',
    text: 'Existe divida, contrato bancario, execucao, cobranca ou situacao financeira relevante?',
    kind: 'boolean',
    required: true,
    weight: 20,
  },
  {
    id: 'whatsapp-q4-valor',
    order: 4,
    key: 'valor_envolvido',
    text: 'Qual e o valor aproximado envolvido?',
    kind: 'money',
    required: true,
    weight: 20,
  },
  {
    id: 'whatsapp-q5-docs',
    order: 5,
    key: 'documentacao_minima',
    text: 'Existe documentacao minima para analise, como contrato, proposta, extrato ou notificacao?',
    kind: 'boolean',
    required: true,
    weight: 15,
  },
  {
    id: 'whatsapp-q6-consultor',
    order: 6,
    key: 'deseja_consultor',
    text: 'Voce deseja falar com um consultor da ALETIS?',
    kind: 'boolean',
    required: true,
    weight: 10,
  },
]

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

const SUBJECTS: Record<string, RegExp> = {
  perfil_agro: /\b(produtor|agro|fazenda|rural|cooperativa|agricultor|pecuarista)\b/,
  problema_principal: /\b(divida|dividas|renegociar|renegociacao|execucao|cobranca|credito|financiamento)\b/,
  situacao_financeira: /\b(divida|dividas|execucao|cobranca|financiamento|situacao financeira|contrato bancario)\b/,
  documentacao_minima: /\b(documento|documentos|documentacao|contrato|contratos|extrato|extratos|notificacao|proposta)\b/,
  deseja_consultor: /\b(consultor|christian|equipe|atendimento|conversar|falar)\b/,
}

function relevantClauses(text: string, key: string): string[] {
  const subject = SUBJECTS[key] || SUBJECTS[key === 'documentos_basicos' ? 'documentacao_minima' : key]
  if (!subject) return []
  // Vírgulas decimais e pontos de milhares permanecem no mesmo trecho.
  return text.split(/(?<!\d)[,.;!?]|[,.;!?](?!\d)|\s+(?:mas|porem|contudo)\s+|\s+e\s+(?=(?:nao|tenho|possuo|quero|desejo|sou|preciso)\b)/i)
    .map((part) => part.trim()).filter((part) => subject.test(normalize(part)))
}

function parseBoolean(text: string, key: string): boolean | null {
  const clauses = relevantClauses(text, key)
  // Uma negativa sobre a dívida não responde automaticamente à pergunta sobre documentos.
  if (!clauses.length && Object.values(SUBJECTS).some((subject) => subject.test(normalize(text)))) return null
  const candidates = clauses.length ? clauses : [text]
  const results = candidates.map((part): boolean | null => {
    const q = normalize(part)
    if (/\b(nao sei|nao tenho certeza|nao entendi|talvez|acho que|pode ser|nao e que|nao deixo de|nao tenho falta)\b/.test(q)) return null
    if (/\bnao (?:so|apenas)\b/.test(q)) return /\b(tenho|possuo|consigo|quero|desejo|sim)\b/.test(q) ? true : null
    if (/\b(nao|nenhum|nenhuma|nada|sem|negativo)\b/.test(q)) return false
    if (/\b(sim|existe|existem|tenho|possuo|tem|ha|positivo|consigo|posso|quero|desejo|preciso|estou com)\b/.test(q)) return true
    return null
  })
  if (results.some((value) => value === null)) return null
  return new Set(results).size === 1 ? results[0] : null
}

export class EligibilityService {
  getQuestions(): EligibilityQuestion[] {
    const path = process.env.WHATSAPP_ELIGIBILITY_CONFIG_PATH
    if (path && existsSync(path)) {
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'))
        if (Array.isArray(parsed?.questions)) {
          return parsed.questions
            .filter((q: any) => q?.key && q?.text)
            .sort((a: EligibilityQuestion, b: EligibilityQuestion) => (a.order || 0) - (b.order || 0))
        }
      } catch (err) {
        console.warn('[EligibilityService] config invalido, usando default:', (err as Error).message)
      }
    }
    return QUESTIONS
  }

  getNextQuestion(answeredKeys: string[]): EligibilityQuestion | undefined {
    const answered = new Set(answeredKeys)
    return this.getQuestions().find((q) => q.required && !answered.has(q.key))
  }

  parseAnswer(question: EligibilityQuestion, answerText: string): EligibilityAnswer {
    const text = answerText.trim()
    let score = 0
    let value: Record<string, unknown> = { text, valid: text.length >= 3 && !isUncertain(text) }

    if (question.kind === 'money') {
      const parsed = parseMoneyPtBr(text)
      const amount = parsed.amount === null ? null : moneyToCents(parsed.amount)
      value = { amount: parsed.amount, valid: amount !== null, issue: parsed.issue }
      if (amount !== null && amount >= 20000000n) score += 20
      else if (amount !== null && amount >= 5000000n) score += 10
    } else if (question.kind === 'boolean') {
      const yes = parseBoolean(text, question.key)
      value = { yes, valid: yes !== null, ...(yes === null ? { issue: 'ambiguous' } : {}) }
      if (yes) score += question.weight || 10
    } else if (question.kind === 'choice') {
      const q = normalize(text)
      const denied = /\b(nao|sem|nenhum)\b/.test(q)
      const agro = SUBJECTS.perfil_agro.test(q) && !denied
      const matches = (question.choices || []).filter((choice) => q.includes(normalize(choice)))
      const deniedAgro = denied && (SUBJECTS.perfil_agro.test(q) || /^nao[.!? ]*$/.test(q))
      const choice = isUncertain(text) ? null : question.key === 'perfil_agro'
        ? agro ? matches[0] || text : deniedAgro || /\b(outro|outra|urbano|aposentado|comerciante)\b/.test(q) ? 'outro' : null
        : matches.length === 1 ? matches[0] : null
      value = { choice, valid: choice !== null }
      if (agro && choice) score += question.weight || 20
    } else {
      score += value.valid ? 5 : 0
    }

    if (question.key === 'credor' || question.key === 'problema_principal') {
      const q = normalize(text)
      if (/(banco|sicredi|sicoob|bradesco|bb|banco do brasil|santander|itau|cooperativa|credor|divida|execucao|cobranca|contrato|renegoci)/.test(q)) score += question.weight || 10
    }

    if (!value.valid) score = 0
    return {
      questionKey: question.key,
      answerText: text,
      value,
      score,
    }
  }

  /** Aproveita fatos explícitos em uma mensagem sem transformar lacunas em respostas. */
  parseMessage(text: string, answers: EligibilityAnswer[]): EligibilityAnswer[] {
    const currentQuestion = this.calculate(answers).nextQuestion
    const answered = new Set(answers.filter((answer) => this.isValidAnswer(answer)).map((answer) => answer.questionKey))
    const parsed: EligibilityAnswer[] = []
    for (const question of this.getQuestions()) {
      if (answered.has(question.key)) continue
      let input = relevantClauses(text, question.key).join('; ')
      if (question.kind === 'money') {
        input = relevantClauses(text, 'situacao_financeira').filter((part) => /\d/.test(part)).join('; ')
        if (!input && /(?:r\$|\b(?:mil|milhao|milhoes|reais)\b)/i.test(normalize(text))) input = text
      }
      if (!input && question.key === currentQuestion?.key) input = text
      if (!input) continue
      const answer = this.parseAnswer(question, input)
      if (answer.value.valid === true) parsed.push(answer)
    }
    return parsed
  }

  isValidAnswer(answer: EligibilityAnswer): boolean {
    const question = this.getQuestions().find((item) => item.key === answer.questionKey)
    if (!question) return false
    // Reinterpreta respostas antigas: null e valores mal convertidos não encerram a coleta.
    return this.parseAnswer(question, answer.answerText || '').value.valid === true
  }

  calculate(answers: EligibilityAnswer[]): EligibilityResult {
    const questions = this.getQuestions()
    const latest = new Map<string, EligibilityAnswer>()
    for (const answer of answers) {
      const question = questions.find((item) => item.key === answer.questionKey)
      if (question) latest.set(answer.questionKey, this.parseAnswer(question, answer.answerText || ''))
    }
    answers = [...latest.values()].filter((answer) => answer.value.valid === true)
    const answeredKeys = answers.map((a) => a.questionKey)
    const nextQuestion = this.getNextQuestion(answeredKeys)
    const maxScore = this.getQuestions().reduce((sum, q) => sum + (q.weight || 0), 0)
    const score = Math.min(maxScore, answers.reduce((sum, a) => sum + a.score, 0))
    const reasons: string[] = []

    const hasAgro = answers.some((a) => a.questionKey === 'perfil_agro' && a.score >= 20)
    const rawAmount = answers.find((a) => a.questionKey === 'valor_divida' || a.questionKey === 'valor_envolvido')?.value?.amount
    const amount = typeof rawAmount === 'string' ? moneyToCents(rawAmount) : null
    const hasDocs = answers.some((a) => ['documentos_basicos', 'documentacao_minima'].includes(a.questionKey) && a.value?.yes === true)
    const hasFinancialProblem = answers.some((a) => a.questionKey === 'situacao_financeira' && a.value?.yes === true)
    const wantsConsultor = answers.some((a) => a.questionKey === 'deseja_consultor' && a.value?.yes === true)

    if (hasAgro) reasons.push('Perfil conectado ao agro.')
    if (hasFinancialProblem) reasons.push('Ha situacao financeira relevante para triagem.')
    if (amount !== null && amount >= 20000000n) reasons.push('Valor informado justifica analise estruturada.')
    if (hasDocs) reasons.push('Cliente sinalizou que consegue enviar documentos base.')
    if (wantsConsultor) reasons.push('Cliente confirmou interesse em falar com consultor.')

    if (nextQuestion) {
      return { status: 'em_coleta', score, maxScore, reasons, nextQuestion }
    }

    if (!hasAgro) reasons.push('Perfil ainda nao parece aderente ao foco agro da ALETIS.')
    if (amount === null || amount < 5000000n) reasons.push('Valor informado abaixo do corte operacional inicial.')
    if (!hasDocs) reasons.push('Sem documentos base, o atendimento precisa de triagem manual.')

    if (hasAgro && hasFinancialProblem && amount !== null && amount >= 20000000n && hasDocs && wantsConsultor) {
      return { status: 'elegivel', score, maxScore, reasons }
    }
    if (hasAgro && hasFinancialProblem && amount !== null && amount >= 5000000n) {
      return { status: 'atencao', score, maxScore, reasons }
    }
    return { status: 'nao_elegivel', score, maxScore, reasons }
  }
}

function isUncertain(text: string): boolean {
  return /^(?:nao sei|talvez|nao entendi)\b/.test(normalize(text))
    || /^(?:oi|ola|bom dia|boa tarde|boa noite)[.!? ]*$/.test(normalize(text))
}

let cached: EligibilityService | null = null
export function getEligibilityService(): EligibilityService {
  if (!cached) cached = new EligibilityService()
  return cached
}

// ============================================================
// ALETIS — Score de Risco Agrícola Integrado (SRAI)
// Rule-based v1 (sem ML) — calcula risco de inadimplência
// combinando sinais climáticos, financeiros e operacionais.
// ============================================================

export interface SraiInput {
  // Financeiro
  valorTotalDivida: number
  valorTotalPago: number
  numeroContratosAtivos?: number
  temAjuizamento?: boolean
  diasAtrasoMaximo?: number
  // Operacional
  areaTotalHa?: number
  culturas?: string[]
  temCar?: boolean
  carCondicao?: string
  // Climático
  anomaliaChuvaPct?: number
  tempMediaAnualC?: number
  // Exposição
  exposicaoDiversificada?: boolean
  // Relacionamento
  diasUltimoContato?: number
  temProximaAcao?: boolean
}

export interface SraiOutput {
  scoreTotal: number
  classificacao: 'baixo' | 'moderado' | 'alto' | 'critico'
  componentes: {
    financeiro: number
    operacional: number
    climatico: number
    relacionamento: number
  }
  alertas: string[]
  recomendacoes: string[]
  versao: string
}

const VERSAO = 'SRAI-v1.0'

function calcularFinanceiro(input: SraiInput): { pontos: number; alertas: string[] } {
  let pontos = 100
  const alertas: string[] = []

  const quitadoPct = input.valorTotalDivida > 0
    ? (input.valorTotalPago / input.valorTotalDivida) * 100
    : 0
  if (quitadoPct < 10) {
    pontos -= 30
    alertas.push('Menos de 10% da dívida foi quitada')
  } else if (quitadoPct < 30) {
    pontos -= 15
  } else if (quitadoPct >= 70) {
    pontos += 5
  }

  if (input.temAjuizamento) {
    pontos -= 25
    alertas.push('Existe ajuizamento — risco processual elevado')
  }

  const contratos = input.numeroContratosAtivos ?? 0
  if (contratos >= 5) {
    pontos -= 15
    alertas.push('5+ contratos ativos — endividamento fragmentado')
  } else if (contratos >= 3) {
    pontos -= 5
  }

  const atraso = input.diasAtrasoMaximo ?? 0
  if (atraso > 180) {
    pontos -= 30
    alertas.push(`Atraso máximo ${atraso}d (>180d) — inadimplência grave`)
  } else if (atraso > 90) {
    pontos -= 20
    alertas.push(`Atraso máximo ${atraso}d (>90d)`)
  } else if (atraso > 30) {
    pontos -= 10
  }

  return { pontos: Math.max(0, Math.min(100, pontos)), alertas }
}

function calcularOperacional(input: SraiInput): { pontos: number; alertas: string[] } {
  let pontos = 100
  const alertas: string[] = []

  const area = input.areaTotalHa ?? 0
  if (area === 0) {
    pontos -= 20
    alertas.push('Área total não informada')
  } else if (area < 20) {
    pontos -= 10
  } else if (area >= 500) {
    pontos += 5
  }

  const nCulturas = input.culturas?.length ?? 0
  if (nCulturas === 0) {
    pontos -= 10
    alertas.push('Nenhuma cultura cadastrada')
  } else if (nCulturas === 1) {
    pontos -= 10
    alertas.push('Monocultura — risco concentrado')
  } else if (nCulturas >= 3) {
    pontos += 5
  }

  if (!input.temCar) {
    pontos -= 15
    alertas.push('CAR não localizado — risco regulatório')
  } else if (input.carCondicao && /cancelad|pendent|suspens/i.test(input.carCondicao)) {
    pontos -= 20
    alertas.push(`CAR em condição crítica: ${input.carCondicao}`)
  }

  if (input.exposicaoDiversificada) {
    pontos += 5
  }

  return { pontos: Math.max(0, Math.min(100, pontos)), alertas }
}

function calcularClimatico(input: SraiInput): { pontos: number; alertas: string[] } {
  let pontos = 100
  const alertas: string[] = []

  const anomalia = input.anomaliaChuvaPct
  if (anomalia != null) {
    if (anomalia <= -30) {
      pontos -= 35
      alertas.push(`Déficit hídrico severo: ${anomalia.toFixed(0)}% abaixo da normal`)
    } else if (anomalia <= -15) {
      pontos -= 20
      alertas.push(`Déficit hídrico moderado: ${anomalia.toFixed(0)}%`)
    } else if (anomalia >= 40) {
      pontos -= 15
      alertas.push(`Excesso de chuva: ${anomalia.toFixed(0)}% acima da normal`)
    }
  }

  const temp = input.tempMediaAnualC
  if (temp != null && temp > 28) {
    pontos -= 10
    alertas.push(`Temperatura média elevada: ${temp.toFixed(1)}°C`)
  }

  return { pontos: Math.max(0, Math.min(100, pontos)), alertas }
}

function calcularRelacionamento(input: SraiInput): { pontos: number; alertas: string[] } {
  let pontos = 100
  const alertas: string[] = []

  const dias = input.diasUltimoContato ?? 0
  if (dias > 90) {
    pontos -= 30
    alertas.push(`Sem contato há ${dias} dias — relacionamento deteriorado`)
  } else if (dias > 30) {
    pontos -= 15
  }

  if (!input.temProximaAcao) {
    pontos -= 15
    alertas.push('Sem próxima ação agendada')
  }

  return { pontos: Math.max(0, Math.min(100, pontos)), alertas }
}

export function calcularSRAI(input: SraiInput): SraiOutput {
  const fin = calcularFinanceiro(input)
  const op = calcularOperacional(input)
  const cli = calcularClimatico(input)
  const rel = calcularRelacionamento(input)

  // Pesos: financeiro domina, depois operacional, climático, relacionamento.
  const scoreTotal = Math.round(
    fin.pontos * 0.40 + op.pontos * 0.25 + cli.pontos * 0.20 + rel.pontos * 0.15,
  )

  let classificacao: SraiOutput['classificacao']
  if (scoreTotal >= 80) classificacao = 'baixo'
  else if (scoreTotal >= 60) classificacao = 'moderado'
  else if (scoreTotal >= 40) classificacao = 'alto'
  else classificacao = 'critico'

  const alertas = [...fin.alertas, ...op.alertas, ...cli.alertas, ...rel.alertas]

  const recomendacoes: string[] = []
  if (classificacao === 'critico') {
    recomendacoes.push('Acionar protocolo de recuperação imediata — revisão de garantias e liquidação antecipada')
  }
  if (fin.pontos < 50) {
    recomendacoes.push('Estruturar renegociação com alongamento e dação em pagamento')
  }
  if (op.pontos < 60) {
    recomendacoes.push('Verificar regularização CAR e diversificação de culturas')
  }
  if (cli.pontos < 60) {
    recomendacoes.push('Monitorar Proagro/seguro rural e produtividade esperada')
  }
  if (rel.pontos < 60) {
    recomendacoes.push('Reativar contato e agendar visita técnica')
  }
  if (recomendacoes.length === 0) {
    recomendacoes.push('Manter rotina de acompanhamento trimestral')
  }

  return {
    scoreTotal: Math.max(0, Math.min(100, scoreTotal)),
    classificacao,
    componentes: {
      financeiro: fin.pontos,
      operacional: op.pontos,
      climatico: cli.pontos,
      relacionamento: rel.pontos,
    },
    alertas,
    recomendacoes,
    versao: VERSAO,
  }
}

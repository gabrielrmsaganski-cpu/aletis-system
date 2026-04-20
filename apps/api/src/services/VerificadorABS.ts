// ============================================================
// ALETIS — Verificador AB+S (Agro Brasil Sustentável)
// Diagnóstico rule-based de elegibilidade ao programa AB+S
// (Portarias MAPA 745/2024, 721/2025, 722/2025).
// ============================================================

export interface AbsInput {
  // Regularidade ambiental
  temCar: boolean
  carCondicao?: string
  carStatus?: string
  areaImovel?: number
  areaReservaLegal?: number
  areaVegetacaoNativa?: number
  modulosFiscais?: number

  // Regularidade fiscal/trabalhista
  temAjuizamento?: boolean
  situacaoCadastralCnpj?: string
  optantePeloSimples?: boolean | null

  // Produtividade e práticas
  culturas?: string[]
  atividade?: string
  temPlantioDireto?: boolean
  temIntegracaoLPF?: boolean // Lavoura-Pecuária-Floresta
  temPlanoRecuperacao?: boolean

  // Clima (proxy de severidade)
  anomaliaChuvaPct?: number
}

export interface AbsCheckpoint {
  item: string
  descricao: string
  status: 'ok' | 'pendente' | 'falha' | 'nao_aplicavel'
  detalhes?: string
  fundamentacao: string
}

export interface AbsOutput {
  elegivel: boolean
  nivelElegibilidade: 'integral' | 'parcial' | 'condicional' | 'inelegivel'
  scorePercentual: number
  checkpoints: AbsCheckpoint[]
  taxasEstimadasPct: {
    min: number
    max: number
  }
  acoesRecomendadas: string[]
  fundamentacaoGeral: string
  versao: string
}

const VERSAO = 'AB+S-v1.0 (Port. MAPA 745/2024, 721/2025, 722/2025)'

export function verificarABS(input: AbsInput): AbsOutput {
  const checkpoints: AbsCheckpoint[] = []

  // 1. CAR obrigatório
  if (!input.temCar) {
    checkpoints.push({
      item: 'car_cadastro',
      descricao: 'Cadastro Ambiental Rural (CAR) ativo',
      status: 'falha',
      detalhes: 'Imóvel não possui CAR localizado — pré-requisito do AB+S',
      fundamentacao: 'Lei 12.651/2012, Art. 29 + Port. MAPA 745/2024',
    })
  } else {
    const condicao = input.carCondicao?.toLowerCase() || ''
    if (/cancelad|pendent|suspens/.test(condicao)) {
      checkpoints.push({
        item: 'car_condicao',
        descricao: 'Condição do CAR regular',
        status: 'falha',
        detalhes: `CAR em condição crítica: ${input.carCondicao}`,
        fundamentacao: 'Port. MAPA 745/2024, Art. 6º inciso II',
      })
    } else if (/analis/.test(condicao)) {
      checkpoints.push({
        item: 'car_condicao',
        descricao: 'Condição do CAR regular',
        status: 'pendente',
        detalhes: 'CAR em análise — aceito como pendente com plano de regularização',
        fundamentacao: 'Port. MAPA 745/2024, Art. 7º',
      })
    } else {
      checkpoints.push({
        item: 'car_condicao',
        descricao: 'Condição do CAR regular',
        status: 'ok',
        detalhes: input.carCondicao || 'Ativo',
        fundamentacao: 'Lei 12.651/2012 + Port. MAPA 745/2024',
      })
    }
  }

  // 2. Reserva Legal mínima
  const rlPct =
    input.areaImovel && input.areaReservaLegal && input.areaImovel > 0
      ? (input.areaReservaLegal / input.areaImovel) * 100
      : null
  const rlMinima = 20 // 20% fora da Amazônia Legal; ver Art. 12 Lei 12.651/2012
  if (rlPct == null) {
    checkpoints.push({
      item: 'reserva_legal',
      descricao: 'Reserva Legal mínima ≥ 20%',
      status: 'nao_aplicavel',
      detalhes: 'Área RL não informada no CAR',
      fundamentacao: 'Lei 12.651/2012, Art. 12',
    })
  } else if (rlPct < rlMinima) {
    checkpoints.push({
      item: 'reserva_legal',
      descricao: 'Reserva Legal mínima ≥ 20%',
      status: 'pendente',
      detalhes: `RL atual ${rlPct.toFixed(1)}% — plano de regularização obrigatório (PRADA)`,
      fundamentacao: 'Lei 12.651/2012, Art. 66 + Port. MAPA 745/2024',
    })
  } else {
    checkpoints.push({
      item: 'reserva_legal',
      descricao: 'Reserva Legal mínima ≥ 20%',
      status: 'ok',
      detalhes: `RL atual ${rlPct.toFixed(1)}%`,
      fundamentacao: 'Lei 12.651/2012, Art. 12',
    })
  }

  // 3. Regularidade fiscal
  const situacao = input.situacaoCadastralCnpj?.toLowerCase() || ''
  if (situacao && /baixada|suspensa|inapta|inabilitada|nula/.test(situacao)) {
    checkpoints.push({
      item: 'regularidade_fiscal',
      descricao: 'Situação cadastral CNPJ regular',
      status: 'falha',
      detalhes: `Situação: ${input.situacaoCadastralCnpj}`,
      fundamentacao: 'Port. MAPA 721/2025, Art. 4º',
    })
  } else if (situacao === 'ativa' || !situacao) {
    checkpoints.push({
      item: 'regularidade_fiscal',
      descricao: 'Situação cadastral CNPJ regular',
      status: situacao ? 'ok' : 'nao_aplicavel',
      detalhes: situacao ? 'Ativa' : 'PF — não aplicável',
      fundamentacao: 'Port. MAPA 721/2025, Art. 4º',
    })
  }

  // 4. Práticas sustentáveis (bônus AB+S)
  const praticasOk = [input.temPlantioDireto, input.temIntegracaoLPF, input.temPlanoRecuperacao].filter(Boolean).length
  if (praticasOk >= 2) {
    checkpoints.push({
      item: 'praticas_sustentaveis',
      descricao: 'Práticas sustentáveis adotadas',
      status: 'ok',
      detalhes: `${praticasOk} práticas declaradas (plantio direto, iLPF, PRADA)`,
      fundamentacao: 'Port. MAPA 722/2025, Anexo I',
    })
  } else if (praticasOk === 1) {
    checkpoints.push({
      item: 'praticas_sustentaveis',
      descricao: 'Práticas sustentáveis adotadas',
      status: 'pendente',
      detalhes: 'Apenas 1 prática declarada — recomendar adesão adicional',
      fundamentacao: 'Port. MAPA 722/2025, Anexo I',
    })
  } else {
    checkpoints.push({
      item: 'praticas_sustentaveis',
      descricao: 'Práticas sustentáveis adotadas',
      status: 'pendente',
      detalhes: 'Nenhuma prática sustentável declarada',
      fundamentacao: 'Port. MAPA 722/2025, Anexo I',
    })
  }

  // 5. Diversificação de culturas (resiliência)
  const nCulturas = input.culturas?.length ?? 0
  if (nCulturas >= 2) {
    checkpoints.push({
      item: 'diversificacao',
      descricao: 'Diversificação produtiva',
      status: 'ok',
      detalhes: `${nCulturas} culturas declaradas`,
      fundamentacao: 'Port. MAPA 722/2025, critério de mitigação',
    })
  } else {
    checkpoints.push({
      item: 'diversificacao',
      descricao: 'Diversificação produtiva',
      status: 'pendente',
      detalhes: 'Monocultura — risco concentrado',
      fundamentacao: 'Port. MAPA 722/2025, critério de mitigação',
    })
  }

  // Compute score
  const ok = checkpoints.filter((c) => c.status === 'ok').length
  const pendente = checkpoints.filter((c) => c.status === 'pendente').length
  const falha = checkpoints.filter((c) => c.status === 'falha').length
  const aplicaveis = checkpoints.filter((c) => c.status !== 'nao_aplicavel').length
  const scorePercentual = aplicaveis > 0
    ? Math.round(((ok * 1 + pendente * 0.5) / aplicaveis) * 100)
    : 0

  let nivel: AbsOutput['nivelElegibilidade']
  if (falha >= 1) nivel = 'inelegivel'
  else if (scorePercentual >= 85) nivel = 'integral'
  else if (scorePercentual >= 65) nivel = 'parcial'
  else nivel = 'condicional'

  // Taxas estimadas conforme nível (Plano Safra 2025/26 + AB+S)
  let taxasMin = 10, taxasMax = 14
  if (nivel === 'integral') { taxasMin = 7; taxasMax = 9 }
  else if (nivel === 'parcial') { taxasMin = 8; taxasMax = 11 }
  else if (nivel === 'condicional') { taxasMin = 10; taxasMax = 13 }
  else { taxasMin = 0; taxasMax = 0 }

  const acoesRecomendadas: string[] = []
  checkpoints
    .filter((c) => c.status === 'falha')
    .forEach((c) => acoesRecomendadas.push(`[BLOQUEIO] Resolver ${c.item}: ${c.detalhes}`))
  checkpoints
    .filter((c) => c.status === 'pendente')
    .forEach((c) => acoesRecomendadas.push(`[PENDENTE] ${c.item}: ${c.detalhes}`))
  if (acoesRecomendadas.length === 0) {
    acoesRecomendadas.push('Elegibilidade integral — proceder com estruturação de crédito AB+S')
  }

  return {
    elegivel: nivel !== 'inelegivel',
    nivelElegibilidade: nivel,
    scorePercentual,
    checkpoints,
    taxasEstimadasPct: { min: taxasMin, max: taxasMax },
    acoesRecomendadas,
    fundamentacaoGeral:
      'Programa Agro Brasil Sustentável (AB+S) — regido pelas Portarias MAPA 745/2024, 721/2025 e 722/2025. ' +
      'Requer CAR ativo, regularidade fiscal e adoção progressiva de práticas sustentáveis. ' +
      'Taxas preferenciais vinculadas ao Plano Safra 2025/26.',
    versao: VERSAO,
  }
}

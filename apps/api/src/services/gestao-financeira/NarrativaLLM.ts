// ============================================================
// NarrativaLLM — gera narrativa tecnica do diagnostico via OpenAI
// com base no dashboard 360. Texto explicativo +
// análise crítica + recomendações em prosa pronto pra colar
// no relatório/proposta.
// ============================================================
import { runOpenAI } from '../llm/OpenAIClient.js'
import { getModelForRole } from '../llm/LLMConfig.js'
import { getGestaoFinanceiraServiceV2 } from './GestaoFinanceiraServiceV2.js'

export interface NarrativaInput {
  grupoId: string
  estilo?: 'tecnico' | 'comercial' | 'banco' | 'cliente'
  /** secoes desejadas: overview | endividamento | safras | cenarios | recomendacoes (default: todas) */
  secoes?: string[]
}

export interface NarrativaOutput {
  texto: string
  secoes: Record<string, string>
  modelo: string
  tokensIn: number
  tokensOut: number
  geradoEm: string
}

const ESTILO_INSTRUCAO: Record<NonNullable<NarrativaInput['estilo']>, string> = {
  tecnico: 'Use linguagem técnica de finanças/agro. Aborde indicadores, fórmulas, métricas. Foco em precisão.',
  comercial: 'Use linguagem comercial e persuasiva. Foco em oportunidade e diferencial competitivo do grupo.',
  banco: 'Use linguagem de mesa de crédito bancário (5 Cs do Crédito, capacity, exposure). Direto, factual, sem opinião.',
  cliente: 'Use linguagem clara e didática. Explique cada número e seu significado. Tom amigável mas profissional.',
}

const SECOES_DEFAULT = ['overview', 'safras', 'endividamento', 'cenarios', 'recomendacoes']

/** Resume payload do dashboard para enviar ao LLM (reduz tokens). */
function resumirParaLLM(dash: any): any {
  const i = dash.raioX.indicadores
  return {
    grupo: { nome: dash.grupo.nomeGrupo, dataBase: dash.grupo.dataBase },
    contadores: dash.contadores,
    kpis: {
      receitaProjetada: i.receitaTotal,
      ebitdaTotal: i.ebitdaTotal,
      margemEbitda: i.margemEbitda,
      dividaTotal: dash.endividamento.saldoTotalAtual,
      diviPorEbitda: i.diviPorEbitda,
      ltvMedio: dash.ltv.ltvMercadoMedio,
      saldoFinalAcumulado: i.saldoFinalAcumulado,
      fclMedio: i.fclMedio,
      anosProjecao: dash.raioX.anos.length,
    },
    safras: dash.safras.map((s: any) => ({
      safra: s.safra,
      cenario: s.cenario,
      areaHa: s.totalAreaHa,
      receita: s.receitaTotal,
      margem: s.margemBruta,
    })),
    endividamento: {
      total: dash.endividamento.saldoTotalAtual,
      contratos: dash.endividamento.totalContratos,
      porCredor: dash.endividamento.porCredor.slice(0, 5).map((c: any) => ({
        credor: c.credor,
        saldo: c.saldo,
        pctTotal: c.pctTotal,
      })),
    },
    cenariosFCL: dash.dre.cenarios.map((c: any) => ({
      cenario: c.cenario,
      receitaTotal: c.totais.receitaTotal,
      ebitdaTotal: c.totais.ebitdaTotal,
      fclTotal: c.totais.fclTotal,
    })),
    insights: dash.insights.slice(0, 8).map((i: any) => ({
      severidade: i.severidade,
      categoria: i.categoria,
      titulo: i.titulo,
      mensagem: i.mensagem,
      recomendacao: i.recomendacao,
    })),
    garantias: {
      ltvMedio: dash.ltv.ltvMercadoMedio,
      valorMercado: dash.ltv.totalValorMercado,
      saldoDisponivel: dash.ltv.saldoDisponivelTotalMercado,
    },
  }
}

const PROMPT_TEMPLATE = (estilo: string, secoes: string[], dados: any): string => `
Você é um analista financeiro sênior da ALETIS Consultoria, especializado em produtores rurais brasileiros e renegociação de dívida agro.

Estilo de escrita: ${estilo}

Tarefa: gere narrativa em PORTUGUÊS BRASILEIRO sobre o diagnóstico financeiro do grupo abaixo. NÃO invente dados — use APENAS os números fornecidos. Quando faltar dado, declare "não disponível" sem inventar.

Dados consolidados (JSON):
\`\`\`json
${JSON.stringify(dados, null, 2)}
\`\`\`

Estruture sua resposta nas seções abaixo, usando exatamente esses títulos em maiúsculas (cada seção em parágrafo único, 3-6 linhas):

${secoes.map((s) => `## ${s.toUpperCase()}`).join('\n')}

REGRAS:
- Use valores em R$ formatados (ex: R$ 1.234.567).
- Use porcentagens com uma casa (ex: 32.5%).
- Cite indicadores específicos (Dívida/EBITDA, Margem EBITDA, LTV) sempre que aplicável.
- Em RECOMENDAÇÕES, dê 3-5 ações concretas baseadas nos insights e KPIs.
- NÃO use emojis, markdown bold/italic, ou listas com asteriscos. Texto corrido.
- NÃO adicione disclaimer ou seção extra. Apenas as solicitadas.
`

export async function gerarNarrativa(input: NarrativaInput): Promise<NarrativaOutput> {
  const svcV2 = getGestaoFinanceiraServiceV2()
  const dash = await svcV2.calcularDashboard360(input.grupoId)
  const resumo = resumirParaLLM(dash)

  const estilo = input.estilo ?? 'tecnico'
  const secoes = input.secoes ?? SECOES_DEFAULT
  const prompt = PROMPT_TEMPLATE(ESTILO_INSTRUCAO[estilo], secoes, resumo)

  const r = await runOpenAI(
    [{ role: 'user', content: prompt }],
    {
      model: getModelForRole('doc_analyzer'),
      maxTokens: 2500,
      temperature: 0.3,
    },
  )

  const texto = r.text ?? ''

  // Particiona por seção via regex de título
  const secoesParsed: Record<string, string> = {}
  for (const sec of secoes) {
    const re = new RegExp(`##\\s*${sec.toUpperCase()}\\s*\\n+([\\s\\S]*?)(?=##\\s*[A-ZÇÃÉÍÓÚ]+|$)`, 'i')
    const m = texto.match(re)
    if (m) secoesParsed[sec] = m[1].trim()
  }

  return {
    texto,
    secoes: secoesParsed,
    modelo: getModelForRole('doc_analyzer'),
    tokensIn: r.usage?.input_tokens ?? 0,
    tokensOut: r.usage?.output_tokens ?? 0,
    geradoEm: new Date().toISOString(),
  }
}

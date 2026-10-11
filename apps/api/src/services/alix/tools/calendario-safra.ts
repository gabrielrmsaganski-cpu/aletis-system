// ============================================================
// calendario-safra — tool de janelas críticas por UF × cultura
// ============================================================
// Dados curados a partir de MAPA/CONAB/Agroconsult para as culturas
// relevantes no portfólio ALETIS. Cobre plantio, financiamento,
// colheita e venda (período típico — pode variar por microrregião).
//
// Quando pedido "cultura/uf" sem match exato, retorna a regra do
// MCR/Plano Safra geral + observação.
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'

type Janela = {
  inicio: string // "MM-DD"
  fim: string    // "MM-DD"
  observacao?: string
}

type CulturaCalendar = {
  cultura: string
  ufs: string[]
  plantio: Janela
  financiamento: Janela
  colheita: Janela
  venda: Janela
  fontes: string[]
  comentario?: string
}

// Dataset curado. Datas MM-DD no hemisfério sul (Brasil).
const CALENDARIOS: CulturaCalendar[] = [
  {
    cultura: 'soja',
    ufs: ['MT', 'GO', 'MS', 'MG', 'BA', 'TO', 'MA', 'PI', 'PR', 'SP', 'SC', 'RS'],
    plantio: { inicio: '09-15', fim: '12-31', observacao: 'Centro-Oeste concentra set-nov; Sul estende dez-jan' },
    financiamento: { inicio: '07-01', fim: '12-31', observacao: 'Pré-custeio a partir de julho com Plano Safra vigente' },
    colheita: { inicio: '01-15', fim: '04-30', observacao: 'MT abre jan-fev, Sul vai até abril' },
    venda: { inicio: '02-01', fim: '06-30', observacao: 'Grande parte via Cédula de Produto Rural (CPR) antecipada' },
    fontes: ['MAPA Plano Safra', 'CONAB monitoramento', 'Embrapa zoneamento'],
  },
  {
    cultura: 'milho',
    ufs: ['MT', 'GO', 'MS', 'PR', 'SP', 'MG', 'RS', 'SC', 'BA', 'MA'],
    plantio: {
      inicio: '01-15',
      fim: '03-31',
      observacao: 'Safrinha (2ª safra) em Centro-Oeste é dominante; 1ª safra plantada set-out',
    },
    financiamento: { inicio: '09-01', fim: '02-28' },
    colheita: { inicio: '06-01', fim: '09-30', observacao: 'Safrinha: jun-ago; Sul 1ª safra: fev-abr' },
    venda: { inicio: '07-01', fim: '12-31' },
    fontes: ['MAPA', 'CONAB'],
  },
  {
    cultura: 'cafe',
    ufs: ['MG', 'ES', 'SP', 'BA', 'RO'],
    plantio: { inicio: '10-15', fim: '03-31', observacao: 'Planta perene — "plantio" = mudas em anos de renovação' },
    financiamento: { inicio: '07-01', fim: '06-30', observacao: 'MCR permite crédito ao longo do ano safra' },
    colheita: { inicio: '05-01', fim: '09-30' },
    venda: { inicio: '06-01', fim: '12-31' },
    fontes: ['MAPA', 'Cooxupé', 'CONAB'],
  },
  {
    cultura: 'algodao',
    ufs: ['MT', 'BA', 'GO', 'MS', 'MA', 'PI'],
    plantio: { inicio: '12-01', fim: '02-15', observacao: 'Safra principal dezembro-fevereiro' },
    financiamento: { inicio: '09-01', fim: '01-31' },
    colheita: { inicio: '06-01', fim: '09-30' },
    venda: { inicio: '08-01', fim: '02-28' },
    fontes: ['ABRAPA', 'MAPA'],
  },
  {
    cultura: 'boi',
    ufs: ['MT', 'GO', 'MS', 'PA', 'MA', 'TO', 'MG', 'RS', 'RO'],
    plantio: { inicio: '10-01', fim: '03-31', observacao: 'Estação chuvosa = formação/reforma de pasto' },
    financiamento: {
      inicio: '07-01',
      fim: '06-30',
      observacao: 'Custeio pecuário via MCR; reposição de bezerro concentrada set-nov',
    },
    colheita: { inicio: '01-01', fim: '12-31', observacao: 'Abate contínuo — pico seco (mai-set) por melhor acabamento' },
    venda: { inicio: '05-01', fim: '09-30', observacao: 'Arroba mais alta na entressafra (abr-out)' },
    fontes: ['ABIEC', 'CEPEA', 'MAPA'],
  },
]

function withinWindow(now: Date, janela: Janela): 'dentro' | 'antes' | 'depois' | 'proxima' {
  const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const cmp = (a: string, b: string) => a.localeCompare(b)
  const start = janela.inicio
  const end = janela.fim
  // Se janela cruza o ano (ex.: 10-15 → 03-31)
  if (cmp(start, end) > 0) {
    if (cmp(monthDay, start) >= 0 || cmp(monthDay, end) <= 0) return 'dentro'
    return 'proxima'
  }
  if (cmp(monthDay, start) < 0) return 'antes'
  if (cmp(monthDay, end) > 0) return 'depois'
  return 'dentro'
}

export function buildCalendarioSafraTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'calendario_safra',
    description:
      'Retorna janelas de plantio, financiamento (custeio MCR), colheita e venda para UF × cultura (soja, milho, café, algodão, boi). Inclui flag "estamos dentro/antes/depois" para dizer o timing correto da abordagem comercial.',
    input_schema: {
      type: 'object',
      properties: {
        cultura: {
          type: 'string',
          enum: ['soja', 'milho', 'cafe', 'algodao', 'boi'],
          description: 'cultura principal',
        },
        uf: {
          type: 'string',
          description: 'sigla da UF (ex.: MT, GO, PR). Opcional — se ausente, retorna regra geral da cultura.',
        },
      },
      required: ['cultura'],
    },
  })
  registry['calendario_safra'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const cultura = String(input.cultura || '').toLowerCase()
      const uf = input.uf ? String(input.uf).toUpperCase() : null
      const cal = CALENDARIOS.find((c) => c.cultura === cultura)
      if (!cal) {
        return {
          error: `cultura "${cultura}" não catalogada`,
          culturasDisponiveis: CALENDARIOS.map((c) => c.cultura),
        }
      }
      const ufSuportada = !uf || cal.ufs.includes(uf)
      const now = new Date()
      const status = {
        plantio: withinWindow(now, cal.plantio),
        financiamento: withinWindow(now, cal.financiamento),
        colheita: withinWindow(now, cal.colheita),
        venda: withinWindow(now, cal.venda),
      }
      const hint = Object.entries(status)
        .filter(([, v]) => v === 'dentro')
        .map(([k]) => k)
      return {
        cultura: cal.cultura,
        uf: uf || 'regra-geral',
        ufSuportada,
        janelas: {
          plantio: cal.plantio,
          financiamento: cal.financiamento,
          colheita: cal.colheita,
          venda: cal.venda,
        },
        statusAtual: status,
        emExecucaoAgora: hint.length > 0 ? hint : ['nenhuma janela ativa'],
        fontes: cal.fontes,
        comentario: cal.comentario,
        hoje: now.toISOString().slice(0, 10),
      }
    },
  }

  return { tools, registry }
}

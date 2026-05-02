// ============================================================
// AnomalyDetector — detecta anomalias preditivas usando z-score
// histórico por cultura/safra.
// ============================================================
// Para cada cultura, calcula média + desvio padrão das safras
// históricas (cenário=realizado) e compara com cenário atual
// (planejado/realizado mais recente). Z-score |z|>2 = anomalia.
// ============================================================
import type { GfCulturaSafra } from '../../../db/schema.js'

export interface Anomalia {
  cultura: string
  safra: string
  cenario: string
  metrica: 'rendimento' | 'preco' | 'custo' | 'area'
  valor: number
  mediaHistorica: number
  desvioPadrao: number
  zScore: number
  severidade: 'critico' | 'importante' | 'info'
  mensagem: string
  recomendacao?: string
}

function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const x = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(x) ? x : 0
}

function mediaDP(nums: number[]): { media: number; dp: number } {
  if (nums.length < 2) return { media: nums[0] ?? 0, dp: 0 }
  const media = nums.reduce((a, b) => a + b, 0) / nums.length
  const variance = nums.reduce((a, b) => a + Math.pow(b - media, 2), 0) / nums.length
  return { media, dp: Math.sqrt(variance) }
}

function severidade(z: number): Anomalia['severidade'] {
  const abs = Math.abs(z)
  if (abs > 3) return 'critico'
  if (abs > 2) return 'importante'
  return 'info'
}

function gerarMensagem(metrica: string, cultura: string, valor: number, media: number, z: number): { mensagem: string; recomendacao?: string } {
  const direcao = valor > media ? 'acima' : 'abaixo'
  const pct = media > 0 ? Math.abs((valor - media) / media * 100) : 0
  const labels: Record<string, string> = {
    rendimento: 'Rendimento (sc/ha)',
    preco: 'Preço (R$/sc)',
    custo: 'Custo unitário (R$/sc)',
    area: 'Área plantada (ha)',
  }
  const label = labels[metrica] ?? metrica
  let mensagem = `${label} de ${cultura} está ${direcao} da média histórica (z-score ${z.toFixed(2)}, ${pct.toFixed(0)}% de desvio).`
  let recomendacao: string | undefined

  if (metrica === 'rendimento' && z < -2) {
    mensagem = `⚠ Rendimento de ${cultura} ${pct.toFixed(0)}% abaixo do histórico (z=${z.toFixed(2)}). Pode indicar quebra de safra, estresse hídrico ou pragas.`
    recomendacao = 'Investigar causa: clima (revisar fontes climáticas), pragas, manejo. Considerar ajuste de proposta para baixar expectativa.'
  } else if (metrica === 'preco' && z < -2) {
    recomendacao = 'Preço atípico — verificar se hedge/contratos existentes mitigam. Considerar aguardar janela melhor.'
  } else if (metrica === 'custo' && z > 2) {
    mensagem = `⚠ Custo unitário de ${cultura} ${pct.toFixed(0)}% acima do histórico (z=${z.toFixed(2)}). Pressão de insumos.`
    recomendacao = 'Renegociar fornecedores principais. Avaliar barter ou compra antecipada para próxima safra.'
  } else if (metrica === 'area' && Math.abs(z) > 2) {
    recomendacao = 'Mudança expressiva de área — confirmar se foi planejado (expansão/redução) ou erro de cadastro.'
  }

  return { mensagem, recomendacao }
}

export function detectarAnomalias(culturas: GfCulturaSafra[]): Anomalia[] {
  const anomalias: Anomalia[] = []

  // Agrupa por cultura
  const porCultura = new Map<string, GfCulturaSafra[]>()
  for (const c of culturas) {
    const list = porCultura.get(c.cultura) ?? []
    list.push(c)
    porCultura.set(c.cultura, list)
  }

  for (const [cultura, list] of porCultura) {
    if (list.length < 2) continue // precisa de pelo menos 2 safras para ter base

    // Histórico = realizadas; alvos = planejadas + futuras + propostas
    const historicas = list.filter((l) => l.cenario === 'realizado')
    const alvos = list.filter((l) => l.cenario !== 'realizado')

    if (historicas.length < 2) continue // precisa pelo menos 2 históricas

    // Para cada métrica
    const metricas: Array<{ key: keyof Anomalia['metrica'] | string; field: keyof GfCulturaSafra }> = [
      { key: 'rendimento', field: 'rendimentoScHa' },
      { key: 'preco', field: 'precoMedioRs' },
      { key: 'custo', field: 'custoUnitarioInsumosRs' },
    ]

    for (const m of metricas) {
      const histValues = historicas.map((h) => n(h[m.field as keyof GfCulturaSafra])).filter((v) => v > 0)
      if (histValues.length < 2) continue
      const { media, dp } = mediaDP(histValues)
      if (dp === 0) continue // sem variação

      for (const alvo of alvos) {
        const valor = n(alvo[m.field as keyof GfCulturaSafra])
        if (valor === 0) continue
        const z = (valor - media) / dp
        if (Math.abs(z) <= 1.5) continue // não é anomalia

        const { mensagem, recomendacao } = gerarMensagem(m.key as string, cultura, valor, media, z)
        anomalias.push({
          cultura,
          safra: alvo.safra,
          cenario: alvo.cenario,
          metrica: m.key as Anomalia['metrica'],
          valor,
          mediaHistorica: media,
          desvioPadrao: dp,
          zScore: z,
          severidade: severidade(z),
          mensagem,
          recomendacao,
        })
      }
    }

    // Área plantada = soma propria + arrendada
    const histArea = historicas.map((h) => n(h.areaPropriaHa) + n(h.areaArrendadaHa)).filter((v) => v > 0)
    if (histArea.length >= 2) {
      const { media, dp } = mediaDP(histArea)
      if (dp > 0) {
        for (const alvo of alvos) {
          const valor = n(alvo.areaPropriaHa) + n(alvo.areaArrendadaHa)
          if (valor === 0) continue
          const z = (valor - media) / dp
          if (Math.abs(z) <= 1.5) continue
          const { mensagem, recomendacao } = gerarMensagem('area', cultura, valor, media, z)
          anomalias.push({
            cultura,
            safra: alvo.safra,
            cenario: alvo.cenario,
            metrica: 'area',
            valor,
            mediaHistorica: media,
            desvioPadrao: dp,
            zScore: z,
            severidade: severidade(z),
            mensagem,
            recomendacao,
          })
        }
      }
    }
  }

  // Ordena por severidade e |z|
  anomalias.sort((a, b) => {
    const sevOrder = { critico: 0, importante: 1, info: 2 }
    const so = sevOrder[a.severidade] - sevOrder[b.severidade]
    if (so !== 0) return so
    return Math.abs(b.zScore) - Math.abs(a.zScore)
  })

  return anomalias
}

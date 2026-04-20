/**
 * SazonalidadeService — padrões sazonais históricos das principais
 * commodities agrícolas brasileiras.
 *
 * Os índices mensais (base 100 = média anual) foram calibrados com
 * base em séries CEPEA/ESALQ + CONAB 2015-2024. Não são previsões —
 * são padrões observados pra ajudar decisão de comercialização/
 * estocagem.
 *
 * Regra prática: índice >100 = mês historicamente "bom" pra venda.
 * Índice <100 = mês historicamente "ruim" pra venda (ofertar força
 * preço pra baixo).
 */

export interface PerfilSazonal {
  commodity: string
  nomeExibicao: string
  unidade: string
  indicesMensais: number[] // 12 valores, jan=0..dez=11
  melhorMesVenda: { mes: string; indice: number }
  piorMesVenda: { mes: string; indice: number }
  safraPico: string
  observacao: string
  fundamentoAgronomico: string
  fonteSerie: string
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const PERFIS: Record<string, Omit<PerfilSazonal, 'melhorMesVenda' | 'piorMesVenda'>> = {
  soja: {
    commodity: 'soja',
    nomeExibicao: 'Soja',
    unidade: 'R$/saca 60kg',
    indicesMensais: [103, 101, 96, 94, 93, 95, 98, 101, 104, 106, 105, 104],
    safraPico: 'Fevereiro a Abril (colheita)',
    observacao: 'Preço cai na safra (mar/abr) e recupera até o plantio (set/out). Boi-sinal: vender 40% na colheita, 30% entressafra, 30% no ápice.',
    fundamentoAgronomico: 'Colheita concentrada em mar-abr no Centro-Sul. Entressafra (jul-out) escasseia oferta e força prêmio.',
    fonteSerie: 'CEPEA/ESALQ Indicador Paranaguá 60kg, 2015-2024',
  },
  milho: {
    commodity: 'milho',
    nomeExibicao: 'Milho',
    unidade: 'R$/saca 60kg',
    indicesMensais: [108, 107, 104, 100, 95, 92, 91, 93, 98, 102, 105, 107],
    safraPico: '2ª safra (safrinha): jun-ago',
    observacao: 'Colheita da safrinha (jun-ago) derruba preço. Ápice em jan-fev quando estoque aperta antes da nova safra.',
    fundamentoAgronomico: 'Safrinha responde por 75% da produção nacional. Colheita jul-ago satura mercado. Demanda por ração cresce no verão.',
    fonteSerie: 'CEPEA/ESALQ Indicador Campinas 60kg, 2015-2024',
  },
  boi: {
    commodity: 'boi',
    nomeExibicao: 'Boi Gordo',
    unidade: 'R$/@',
    indicesMensais: [96, 97, 99, 101, 103, 105, 106, 104, 102, 100, 99, 98],
    safraPico: 'Jun-Ago (escassez de pasto)',
    observacao: 'Boi de capim encarece no inverno (jun-ago) quando pasto seca. Ápice coincide com boi preso em confinamento chegando.',
    fundamentoAgronomico: 'Oferta de pasto reduz no inverno seco. Confinamento retém boi gordo no 2º semestre. Demanda externa (China) afeta prêmio.',
    fonteSerie: 'CEPEA/ESALQ Indicador São Paulo @, 2015-2024',
  },
  cafe: {
    commodity: 'cafe',
    nomeExibicao: 'Café Arábica',
    unidade: 'R$/saca 60kg',
    indicesMensais: [105, 107, 106, 103, 100, 97, 95, 94, 96, 99, 102, 104],
    safraPico: 'Maio a Agosto (colheita arábica)',
    observacao: 'Colheita mai-ago derruba preço. Recuperação começa set-out conforme estoque é absorvido. Bienalidade afeta ciclo.',
    fundamentoAgronomico: 'Arábica bienal — safra alta seguida de baixa. Colheita concentrada em MG/ES mai-ago. Geadas em jul afetam ano seguinte.',
    fonteSerie: 'CEPEA/ESALQ Indicador Café Arábica 60kg, 2015-2024',
  },
  algodao: {
    commodity: 'algodao',
    nomeExibicao: 'Algodão',
    unidade: 'R$/@',
    indicesMensais: [102, 103, 104, 102, 98, 94, 93, 95, 99, 102, 104, 105],
    safraPico: 'Jun-Set (colheita CM/BA)',
    observacao: 'Colheita jun-set (MT/BA) derruba cotação. Preço acompanha ICE NY (Nova Iorque) + prêmio de exportação.',
    fundamentoAgronomico: 'Concentração em MT (70%) + BA (17%). Exportação intensa via Santos/Paranaguá. Correlação alta com dólar + ICE.',
    fonteSerie: 'CEPEA/ESALQ Indicador Algodão @, 2015-2024',
  },
  trigo: {
    commodity: 'trigo',
    nomeExibicao: 'Trigo',
    unidade: 'R$/saca 60kg',
    indicesMensais: [104, 105, 104, 102, 99, 96, 94, 95, 98, 101, 103, 105],
    safraPico: 'Set-Nov (colheita Sul)',
    observacao: 'Colheita RS/PR set-nov derruba cotação. Brasil importa ~55% do consumo — preço internacional (CBOT) domina formação.',
    fundamentoAgronomico: 'Produção concentrada no Sul. Demanda de moagem estável. Correlação com trigo Argentino (Rosário) e Chicago.',
    fonteSerie: 'CEPEA/ESALQ Indicador Trigo PR 60kg, 2015-2024',
  },
}

export class SazonalidadeService {
  getPerfil(commodity: string): PerfilSazonal | null {
    const key = commodity.toLowerCase().trim()
    const base = PERFIS[key]
    if (!base) return null

    const indices = base.indicesMensais
    const maxIdx = indices.indexOf(Math.max(...indices))
    const minIdx = indices.indexOf(Math.min(...indices))

    return {
      ...base,
      melhorMesVenda: { mes: MESES[maxIdx], indice: indices[maxIdx] },
      piorMesVenda: { mes: MESES[minIdx], indice: indices[minIdx] },
    }
  }

  getTodos(): PerfilSazonal[] {
    return Object.keys(PERFIS)
      .map((k) => this.getPerfil(k))
      .filter((x): x is PerfilSazonal => x != null)
  }

  /**
   * Recomendação contextual: dado o mês atual, o perfil indica alta ou baixa?
   * Retorna: "vender", "segurar", "neutro" + texto curto.
   */
  recomendacaoMesAtual(commodity: string): {
    acao: 'vender' | 'segurar' | 'neutro'
    indice: number
    mes: string
    justificativa: string
  } | null {
    const perfil = this.getPerfil(commodity)
    if (!perfil) return null

    const mesAtual = new Date().getMonth() // 0-11
    const indiceAtual = perfil.indicesMensais[mesAtual]
    const media = perfil.indicesMensais.reduce((a, b) => a + b, 0) / 12

    let acao: 'vender' | 'segurar' | 'neutro' = 'neutro'
    if (indiceAtual >= 103) acao = 'vender'
    else if (indiceAtual <= 97) acao = 'segurar'

    const mesTxt = MESES[mesAtual]
    const justificativa = acao === 'vender'
      ? `Histórico favorece venda em ${mesTxt} (índice ${indiceAtual}, ${((indiceAtual / media - 1) * 100).toFixed(1)}% acima da média anual). Momento típico de pico de preço.`
      : acao === 'segurar'
      ? `Histórico desfavorece venda em ${mesTxt} (índice ${indiceAtual}, ${((1 - indiceAtual / media) * 100).toFixed(1)}% abaixo da média). Melhor aguardar entressafra.`
      : `Mês ${mesTxt} é neutro para ${perfil.nomeExibicao} (índice ${indiceAtual}, próximo da média). Decisão deve considerar fluxo de caixa e preço spot.`

    return { acao, indice: indiceAtual, mes: mesTxt, justificativa }
  }
}

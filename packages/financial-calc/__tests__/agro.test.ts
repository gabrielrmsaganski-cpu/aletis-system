/**
 * Testes das calculadoras agro nativas.
 * Roda com `node --test --import tsx/esm`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularDupontFleuriet,
  calcularPrecoVenda,
  calcularFarms,
  rankearCenarios,
  calcularFechamentoGeralEmbarque,
  FECHAMENTO_ARI_PRADO_2024_INPUT,
  type DREInput,
  type BPInput,
} from '../src/agro/index.js'

// ────────────────────────────────────────────────────────────
// Dupont / Fleuriet
// ────────────────────────────────────────────────────────────

const dre: DREInput = {
  receitaLiquida: 10_000_000,
  cogs: 6_000_000,
  despesasOperacionais: 2_000_000,
  receitasFinanceiras: 50_000,
  despesasFinanceiras: 600_000,
  outrasReceitas: 0,
  outrasDespesas: 0,
  impostoDeRenda: 400_000,
}

const bp: BPInput = {
  caixaEDisponibilidades: 800_000,
  ativoFinanceiroCirculante: 200_000,
  contasAReceber: 1_500_000,
  estoques: 1_000_000,
  outroAtivoCirculante: 100_000,
  ativoNaoCirculante: 6_400_000, // total ativo = 10MM
  fornecedores: 1_200_000,
  obrigacoesTrabalhistas: 200_000,
  obrigacoesTributarias: 100_000,
  outroPassivoCirculanteOperacional: 0,
  emprestimosCurtoPrazo: 700_000,
  emprestimosLongoPrazo: 1_300_000,
  outroPassivoNaoCirculante: 500_000,
  patrimonioLiquido: 6_000_000, // PL = 10MM ativo - 4MM passivo
}

test('Dupont 3 fatores: ROE = margem × giro × alavancagem', () => {
  const r = calcularDupontFleuriet(dre, bp)
  // Receita 10MM, LL = 10MM-6MM-2MM+0,05MM-0,6MM-0,4MM = 1.05MM
  assert.equal(r.dupont.lucroLiquido, 1_050_000)
  // Margem ~10.5%, Giro = 10/10 = 1, Alavanc = 10/6 ≈ 1.667 → ROE ~17.5%
  assert.equal(r.dupont.roe.toFixed(4), (0.105 * 1 * (10_000_000 / 6_000_000)).toFixed(4))
  assert.ok(r.dupont.dupont3.giro === 1)
})

test('Dupont 5 fatores reproduz o ROE quando os componentes batem', () => {
  const r = calcularDupontFleuriet(dre, bp)
  assert.ok(Math.abs(r.dupont.dupont5.roe - r.dupont.roe) < 1e-9)
})

test('Fleuriet: tipologia I-VI conforme sinais de CDG/NCG/T', () => {
  // Caso construído I-excelente: NCG < 0 (forn > clientes+est), CDG > 0, T > 0
  const r = calcularFleuriet({
    ...bp,
    contasAReceber: 100_000,
    estoques: 50_000,
    fornecedores: 2_000_000,
    obrigacoesTrabalhistas: 0,
    obrigacoesTributarias: 0,
    outroPassivoCirculanteOperacional: 0,
    caixaEDisponibilidades: 5_000_000,
    ativoFinanceiroCirculante: 0,
    emprestimosCurtoPrazo: 0,
  })
  assert.equal(r.tipo, 'I-excelente')
  assert.ok(r.tesouraria > 0)
  assert.ok(r.necessidadeCapitalGiro < 0)
})

test('Liquidez corrente segue AC/PC clássico', () => {
  const r = calcularDupontFleuriet(dre, bp)
  // AC = 800k+200k+1.5MM+1MM+100k = 3.6MM; PC = 1.2MM+0.2MM+0.1MM+0+0.7MM = 2.2MM
  assert.equal(r.liquidez.corrente.toFixed(4), (3_600_000 / 2_200_000).toFixed(4))
})

// re-exportada para acesso direto
import { calcularFleuriet } from '../src/agro/dupont-fleuriet.js'

// ────────────────────────────────────────────────────────────
// Formação de Preço de Venda
// ────────────────────────────────────────────────────────────

test('Markup divisor: PV = (custo+fixo)/(1 - %var - margem)', () => {
  const r = calcularPrecoVenda({
    custoUnitario: 100,
    impostosSobreVenda: 0.18,
    comissoes: 0.05,
    fretesEDespesasVendaVar: 0.02,
    despesasFixasUnit: 10,
    margemAlvo: 0.15,
    modelo: 'markup-divisor',
  })
  // denom = 1 - 0.25 - 0.15 = 0.6 → PV = 110/0.6 = 183.333...
  assert.equal(r.precoVenda.toFixed(4), (110 / 0.6).toFixed(4))
})

test('Markup divisor falha quando soma >= 100%', () => {
  assert.throws(() =>
    calcularPrecoVenda({
      custoUnitario: 100,
      impostosSobreVenda: 0.5,
      comissoes: 0.4,
      fretesEDespesasVendaVar: 0.05,
      despesasFixasUnit: 0,
      margemAlvo: 0.1,
      modelo: 'markup-divisor',
    }),
  )
})

test('Markup multiplicador: PV = (custo+fixo) × (1+markup)', () => {
  const r = calcularPrecoVenda({
    custoUnitario: 100,
    impostosSobreVenda: 0.1,
    comissoes: 0.05,
    fretesEDespesasVendaVar: 0,
    despesasFixasUnit: 20,
    margemAlvo: 0.5,
    modelo: 'markup-multiplicador',
  })
  assert.equal(r.precoVenda, 120 * 1.5)
})

test('Margem de contribuição alvo coerente', () => {
  const r = calcularPrecoVenda({
    custoUnitario: 100,
    impostosSobreVenda: 0.1,
    comissoes: 0,
    fretesEDespesasVendaVar: 0,
    despesasFixasUnit: 0,
    margemAlvo: 0.3,
    modelo: 'margem-contribuicao',
  })
  assert.ok(r.margemContribuicaoUnit / r.precoVenda > 0.29)
})

// ────────────────────────────────────────────────────────────
// FARMS — Viabilidade Agrícola
// ────────────────────────────────────────────────────────────

test('Soja 100ha 60sc/ha R$120: receita = 720k', () => {
  const r = calcularFarms({
    cultura: 'soja',
    areaHa: 100,
    rendimentoScHa: 60,
    precoRSporSc: 120,
    custosPorHa: {
      sementes: 600,
      defensivos: 1_200,
      fertilizantes: 1_400,
      mecanizacao: 800,
      maoDeObra: 300,
    },
  })
  assert.equal(r.receitaBruta, 720_000)
  // custos totais = (600+1200+1400+800+300)*100 = 430k
  assert.equal(r.custoTotal, 430_000)
  assert.equal(r.margemBruta, 290_000)
  assert.equal(r.veredicto, 'viavel')
})

test('Custo financeiro sobe quando juros aumentam', () => {
  const base = calcularFarms({
    cultura: 'milho',
    areaHa: 50,
    rendimentoScHa: 130,
    precoRSporSc: 60,
    custosPorHa: { sementes: 500, defensivos: 700, fertilizantes: 900, mecanizacao: 600, maoDeObra: 200 },
    taxaJurosSafraAA: 0.08,
  })
  const alta = calcularFarms({
    cultura: 'milho',
    areaHa: 50,
    rendimentoScHa: 130,
    precoRSporSc: 60,
    custosPorHa: { sementes: 500, defensivos: 700, fertilizantes: 900, mecanizacao: 600, maoDeObra: 200 },
    taxaJurosSafraAA: 0.18,
  })
  assert.ok(alta.custoFinanceiro > base.custoFinanceiro)
  assert.ok(alta.margemBruta < base.margemBruta)
})

test('Sensibilidade preço −10% reduz margem; +10% aumenta', () => {
  const r = calcularFarms({
    cultura: 'arroz',
    areaHa: 80,
    rendimentoScHa: 100,
    precoRSporSc: 80,
    custosPorHa: { sementes: 700, defensivos: 1_000, fertilizantes: 1_300, mecanizacao: 900, maoDeObra: 250 },
  })
  assert.ok(r.sensibilidade.precoMenos10 < r.margemBruta)
  assert.ok(r.sensibilidade.precoMais10 > r.margemBruta)
})

test('Ranking de cenários ordena por margem desc', () => {
  const cenarios = [
    {
      nome: 'A',
      result: calcularFarms({
        cultura: 'soja',
        areaHa: 100,
        rendimentoScHa: 60,
        precoRSporSc: 100,
        custosPorHa: { sementes: 600, defensivos: 1_200, fertilizantes: 1_400, mecanizacao: 800, maoDeObra: 300 },
      }),
    },
    {
      nome: 'B',
      result: calcularFarms({
        cultura: 'soja',
        areaHa: 100,
        rendimentoScHa: 70,
        precoRSporSc: 130,
        custosPorHa: { sementes: 600, defensivos: 1_200, fertilizantes: 1_400, mecanizacao: 800, maoDeObra: 300 },
      }),
    },
  ]
  const ranked = rankearCenarios(cenarios)
  assert.equal(ranked[0].nome, 'B')
  assert.ok(ranked[0].result.margemBruta > ranked[1].result.margemBruta)
})

// ────────────────────────────────────────────────────────────
// Fechamento por Embarque — Ari do Prado 2024
// ────────────────────────────────────────────────────────────

test('Fechamento por Embarque reproduz totais principais da planilha Ari do Prado', () => {
  const r = calcularFechamentoGeralEmbarque(FECHAMENTO_ARI_PRADO_2024_INPUT)

  assert.equal(r.geral.totalAnimais, 3148)
  assert.ok(Math.abs(r.geral.pesoEntradaKg - 404.1129669631512) < 0.00001)
  assert.ok(Math.abs(r.geral.precoEntradaRsCab - 2918.86687081745) < 0.00001)
  assert.ok(Math.abs(r.geral.precoVendaRsCab - 4962.485289983459) < 0.00001)
  assert.ok(Math.abs(r.geral.margemBrutaRsCab - 2043.6184191660086) < 0.00001)
  assert.ok(Math.abs(r.geral.custoOperacionalTotalRsCab - 1211.3161264294786) < 0.00001)
  assert.ok(Math.abs(r.geral.lucroLiquidoRsCab - 832.3022927365292) < 0.00001)
  assert.ok(Math.abs(r.geral.rentabilidadeMensalPct - 0.06290162641783383) < 0.00001)
  assert.ok(Math.abs(r.geral.lucroLiquidoTotalRs - 2_620_087.617534594) < 0.02)
})

test('Fechamento por Embarque destaca melhores e piores baias por lucro', () => {
  const r = calcularFechamentoGeralEmbarque(FECHAMENTO_ARI_PRADO_2024_INPUT)

  assert.equal(r.rankingLucro[0].id, 'embarque-23')
  assert.equal(r.rankingLucro.at(-1)?.id, 'embarque-11')
  assert.ok(r.alertas.some((a) => a.includes('lucro liquido negativo')))
})

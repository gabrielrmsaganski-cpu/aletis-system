// ============================================================
// PassivosCalculator — replica "11 - Passivos" da v2.0
// ============================================================
// Consolida TODOS os passivos do grupo:
//   - Dívida bancária (gf_contrato_divida) — saldo + parcelas/ano
//   - Fornecedores e outros (gf_passivo_outro) — agrupados por tipo
//   - Arrendamentos a pagar (custos tipo='arrendamento')
//   - Investimentos a realizar (custos tipo='investimento' — TODO)
// Output: visão única de "quanto deve" por categoria + por ano.
// ============================================================
import type { GfContratoDivida, GfPassivoOutro, GfCustoSafra } from '../../../db/schema.js'
import type { EndividamentoConsolidado } from './endividamento-calculator.js'

export interface PassivoCategoriaResumo {
  categoria: string             // 'banca'|'fornecedor'|'fiscal'|'trabalhista'|'arrendamento'|'investimento'|'outro'
  rotulo: string
  totalAtual: number
  totalAVencer: number
  totalVencido: number
  count: number
  cor: string                   // hint UI
}

export interface PassivosConsolidado {
  total: number
  totalAtual: number
  totalAVencer: number
  totalVencido: number
  porCategoria: PassivoCategoriaResumo[]
  porAno: Array<{ ano: number; bancario: number; fornecedor: number; arrendamento: number; outros: number; total: number }>
  detalhes: {
    bancario: Array<{ id: string; credor: string; saldo: number; metodo: string }>
    outros: GfPassivoOutro[]
    arrendamentos: GfCustoSafra[]
  }
}

function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const x = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(x) ? x : 0
}

const CATEGORIA_META: Record<string, { rotulo: string; cor: string }> = {
  banca: { rotulo: 'Dívida Bancária', cor: '#17251b' },
  fornecedor: { rotulo: 'Fornecedores', cor: '#e3bd80' },
  fiscal: { rotulo: 'Fiscal (PGFN/RFB)', cor: '#a83232' },
  trabalhista: { rotulo: 'Trabalhista', cor: '#7B5B30' },
  arrendamento: { rotulo: 'Arrendamento', cor: '#5A8A6E' },
  investimento: { rotulo: 'Investimentos a Realizar', cor: '#6B7280' },
  outro: { rotulo: 'Outros', cor: '#94A3B8' },
}

export function computePassivos(input: {
  endividamento: EndividamentoConsolidado
  passivosOutros: GfPassivoOutro[]
  custos: GfCustoSafra[]
}): PassivosConsolidado {
  const { endividamento, passivosOutros, custos } = input

  // Por categoria
  const map = new Map<string, PassivoCategoriaResumo>()
  function ensure(cat: string): PassivoCategoriaResumo {
    if (!map.has(cat)) {
      const meta = CATEGORIA_META[cat] ?? { rotulo: cat, cor: '#94A3B8' }
      map.set(cat, {
        categoria: cat,
        rotulo: meta.rotulo,
        totalAtual: 0,
        totalAVencer: 0,
        totalVencido: 0,
        count: 0,
        cor: meta.cor,
      })
    }
    return map.get(cat)!
  }

  // Bancário (do endividamento consolidado)
  const banca = ensure('banca')
  banca.totalAtual = endividamento.saldoTotalAtual
  banca.totalAVencer = endividamento.saldoTotalAtual
  banca.count = endividamento.totalContratos

  // Outros passivos
  for (const p of passivosOutros) {
    const cat = ensure(p.tipo)
    cat.count += 1
    const valor = n(p.valor)
    cat.totalAtual += valor
    if (p.status === 'vencida') cat.totalVencido += valor
    else cat.totalAVencer += valor
  }

  // Arrendamentos do gf_custo_safra
  const arrendamentos = custos.filter((c) => c.tipo === 'arrendamento')
  if (arrendamentos.length > 0) {
    const cat = ensure('arrendamento')
    cat.count = arrendamentos.length
    const total = arrendamentos.reduce((acc, c) => acc + n(c.valorAnual), 0)
    cat.totalAtual += total
    cat.totalAVencer += total
  }

  // Por ano
  const anoMap = new Map<number, { bancario: number; fornecedor: number; arrendamento: number; outros: number }>()
  for (const y of endividamento.evolucaoAnual) {
    const cur = anoMap.get(y.ano) ?? { bancario: 0, fornecedor: 0, arrendamento: 0, outros: 0 }
    cur.bancario += y.parcelaAno
    anoMap.set(y.ano, cur)
  }
  for (const p of passivosOutros) {
    if (!p.vencimento) continue
    const ano = parseInt(p.vencimento.slice(0, 4), 10)
    if (!isFinite(ano)) continue
    const cur = anoMap.get(ano) ?? { bancario: 0, fornecedor: 0, arrendamento: 0, outros: 0 }
    if (p.tipo === 'fornecedor') cur.fornecedor += n(p.valor)
    else cur.outros += n(p.valor)
    anoMap.set(ano, cur)
  }
  const porAno = Array.from(anoMap.entries())
    .map(([ano, v]) => ({ ano, ...v, total: v.bancario + v.fornecedor + v.arrendamento + v.outros }))
    .sort((a, b) => a.ano - b.ano)

  // Totais gerais
  const porCategoria = Array.from(map.values()).sort((a, b) => b.totalAtual - a.totalAtual)
  const total = porCategoria.reduce((a, c) => a + c.totalAtual, 0)
  const totalAVencer = porCategoria.reduce((a, c) => a + c.totalAVencer, 0)
  const totalVencido = porCategoria.reduce((a, c) => a + c.totalVencido, 0)

  return {
    total,
    totalAtual: total,
    totalAVencer,
    totalVencido,
    porCategoria,
    porAno,
    detalhes: {
      bancario: endividamento.contratos.map((c) => ({
        id: c.contratoId,
        credor: c.credor,
        saldo: c.saldoAtual,
        metodo: c.metodoCalculo,
      })),
      outros: passivosOutros,
      arrendamentos,
    },
  }
}

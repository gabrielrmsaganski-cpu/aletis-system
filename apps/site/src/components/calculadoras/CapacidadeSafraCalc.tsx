'use client'

import { useMemo, useState } from 'react'
import { Sprout, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { fmtBRL, fmtNumero } from '@/lib/formatters'
import { CampoMoeda } from './CampoMoeda'
import { ResultadoCard } from './ResultadoCard'

/**
 * Capacidade de pagamento da safra.
 * Modelo DSCR (Debt Service Coverage Ratio):
 *   DSCR = EBITDA_projetado / Serviço da Dívida anual
 * Faixa de segurança ALETIS: DSCR ≥ 1.25
 * Stress test: aplica choque de −15% no preço da commodity.
 */

type Cultura = 'soja' | 'milho' | 'trigo' | 'cafe' | 'outros'

const CULTURA_LABEL: Record<Cultura, string> = {
  soja: 'Soja',
  milho: 'Milho',
  trigo: 'Trigo',
  cafe: 'Café',
  outros: 'Outros',
}

export function CapacidadeSafraCalc() {
  const [receitaBruta, setReceitaBruta] = useState<number | ''>(3_800_000)
  const [custoProducao, setCustoProducao] = useState<number | ''>(2_200_000)
  const [despesasFixas, setDespesasFixas] = useState<number | ''>(180_000)
  const [cprVendida, setCprVendida] = useState<number | ''>(0)
  const [parcelaDividaAnual, setParcelaDividaAnual] = useState<number | ''>(720_000)
  const [cultura, setCultura] = useState<Cultura>('soja')

  const r = useMemo(() => {
    const rb = typeof receitaBruta === 'number' ? receitaBruta : 0
    const cp = typeof custoProducao === 'number' ? custoProducao : 0
    const df = typeof despesasFixas === 'number' ? despesasFixas : 0
    const cpr = typeof cprVendida === 'number' ? cprVendida : 0
    const pd = typeof parcelaDividaAnual === 'number' ? parcelaDividaAnual : 0
    if (rb <= 0) return null

    const receitaLiquida = rb - cpr
    const margemOperacional = receitaLiquida - cp - df
    const dscr = pd > 0 ? margemOperacional / pd : Infinity

    // Stress: -15% no preço => receita bruta cai 15% (custo mantém)
    const receitaStress = rb * 0.85 - cpr
    const margemStress = receitaStress - cp - df
    const dscrStress = pd > 0 ? margemStress / pd : Infinity

    // Capacidade máxima de dívida anual (DSCR = 1.25)
    const capacidadeMaxima = margemOperacional / 1.25

    let status: 'confortavel' | 'atencao' | 'critico'
    if (dscrStress >= 1.25) status = 'confortavel'
    else if (dscrStress >= 1.0) status = 'atencao'
    else status = 'critico'

    return {
      receitaLiquida,
      margemOperacional,
      dscr,
      dscrStress,
      capacidadeMaxima,
      status,
      margemPct: rb > 0 ? (margemOperacional / rb) * 100 : 0,
    }
  }, [receitaBruta, custoProducao, despesasFixas, cprVendida, parcelaDividaAnual])

  const statusMap = {
    confortavel: {
      label: 'Confortável',
      cor: 'text-emerald-400',
      icone: CheckCircle2,
      descricao: 'Capacidade de serviço da dívida acima do piso ALETIS de 1.25 mesmo em cenário de stress.',
    },
    atencao: {
      label: 'Atenção',
      cor: 'text-aletis-dourado',
      icone: AlertTriangle,
      descricao: 'Capacidade aceitável no cenário base, mas comprometida em stress de -15%. Oportunidade de reestruturação.',
    },
    critico: {
      label: 'Crítico',
      cor: 'text-red-400',
      icone: ShieldAlert,
      descricao: 'Capacidade insuficiente. Reestruturação recomendada antes de nova safra — possível risco de default.',
    },
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="rounded-2xl border border-aletis-borda/70 bg-white p-7 shadow-premium-sm">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10">
            <Sprout className="h-5 w-5 text-aletis-verde-escuro" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-aletis-grafite-escuro">
              Dados da safra
            </h2>
            <p className="text-[12px] text-aletis-grafite-medio">
              Projete a próxima safra e veja quanto de dívida ela suporta.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-medio">
              Cultura predominante
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CULTURA_LABEL) as Cultura[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCultura(c)}
                  className={`rounded-full border px-4 py-1.5 text-xs transition ${
                    cultura === c
                      ? 'border-aletis-dourado bg-aletis-dourado/10 text-aletis-verde-escuro font-semibold'
                      : 'border-aletis-borda bg-white text-aletis-grafite-medio hover:border-aletis-dourado/50'
                  }`}
                >
                  {CULTURA_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          <CampoMoeda
            label="Receita bruta projetada"
            value={receitaBruta}
            onChange={setReceitaBruta}
            hint="Sacas × preço esperado"
            required
          />
          <CampoMoeda
            label="Custo total de produção"
            value={custoProducao}
            onChange={setCustoProducao}
            hint="Insumos + operação + colheita"
          />
          <CampoMoeda
            label="Despesas fixas anuais"
            value={despesasFixas}
            onChange={setDespesasFixas}
            hint="Folha, arrendamento, gestão"
          />
          <CampoMoeda
            label="CPR já vendida"
            value={cprVendida}
            onChange={setCprVendida}
            hint="Saída antecipada de produção"
          />
          <CampoMoeda
            label="Serviço da dívida anual (hoje)"
            value={parcelaDividaAnual}
            onChange={setParcelaDividaAnual}
            hint="Soma das parcelas dos próximos 12 meses"
          />
        </div>
      </div>

      {r ? (
        <ResultadoCard
          titulo={statusMap[r.status].label}
          subtitulo={`Cultura predominante: ${CULTURA_LABEL[cultura]}`}
          itens={[
            {
              label: 'Margem operacional projetada',
              valor: fmtBRL(r.margemOperacional),
              sub: `${fmtNumero(r.margemPct, 1)}% da receita bruta`,
            },
            {
              label: 'DSCR (cenário base)',
              valor: Number.isFinite(r.dscr) ? r.dscr.toFixed(2) : '∞',
              sub: r.dscr >= 1.25 ? '✓ Acima do piso' : 'Abaixo do piso (1.25)',
              destaque: true,
            },
            {
              label: 'DSCR sob stress −15%',
              valor: Number.isFinite(r.dscrStress) ? r.dscrStress.toFixed(2) : '∞',
              sub:
                r.status === 'confortavel'
                  ? '✓ Robusto a queda de preço'
                  : r.status === 'atencao'
                    ? 'Comprometido em queda de preço'
                    : '⚠ Colapso em stress',
            },
            {
              label: 'Capacidade máxima de dívida anual',
              valor: fmtBRL(r.capacidadeMaxima),
              sub: 'DSCR alvo 1.25',
            },
          ]}
        >
          <div
            className={`rounded-xl border p-4 ${
              r.status === 'confortavel'
                ? 'border-emerald-400/30 bg-emerald-500/10'
                : r.status === 'atencao'
                  ? 'border-aletis-dourado/30 bg-aletis-dourado/10'
                  : 'border-red-400/30 bg-red-500/10'
            }`}
          >
            <p
              className={`flex items-center gap-2 text-[11px] font-display font-semibold uppercase tracking-wider ${statusMap[r.status].cor}`}
            >
              {(() => {
                const I = statusMap[r.status].icone
                return <I className="h-3 w-3" />
              })()}
              Diagnóstico ALETIS
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-white/80">
              {statusMap[r.status].descricao}
            </p>
          </div>
        </ResultadoCard>
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-aletis-borda bg-white p-12 text-center">
          <p className="text-sm text-aletis-grafite-medio">
            Informe a receita bruta projetada para calcular a capacidade.
          </p>
        </div>
      )}
    </div>
  )
}

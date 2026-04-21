'use client'

import { useMemo, useState } from 'react'
import { Scale, ShieldAlert, CheckCircle2, AlertTriangle, FileSearch } from 'lucide-react'
import { fmtPct, fmtNumero, fmtBRL } from '@/lib/formatters'
import { CampoMoeda } from './CampoMoeda'
import { ResultadoCard } from './ResultadoCard'

/**
 * Detector de abusividade em contrato rural.
 *
 * Referências ALETIS:
 *   - Res. BCB 4.966/21 (crédito rural)
 *   - Súmulas STJ 93, 296, 541 (anatocismo e capitalização)
 *   - Taxas médias históricas PRONAF/PRONAMP por ano (mock indicativo)
 *
 * A calculadora compara a taxa contratada com a taxa subsidiada da época
 * e o padrão de capitalização. Sinaliza revisional quando há desvio material.
 */

type TipoContrato = 'ccb_rural' | 'cpr_financeira' | 'cedula_rural' | 'custeio' | 'outro'

const TIPO_LABEL: Record<TipoContrato, string> = {
  ccb_rural: 'CCB Rural',
  cpr_financeira: 'CPR Financeira',
  cedula_rural: 'Cédula Rural',
  custeio: 'Custeio agrícola',
  outro: 'Outro',
}

// Taxa média PRONAF/PRONAMP histórica (% a.a.) — valores indicativos para calibragem.
const TAXA_SUBSIDIADA_PRONAMP: Record<number, number> = {
  2018: 7.5,
  2019: 8.0,
  2020: 5.0,
  2021: 5.5,
  2022: 8.5,
  2023: 11.5,
  2024: 12.0,
  2025: 13.0,
  2026: 12.5,
}

export function AbusividadeCalc() {
  const [tipo, setTipo] = useState<TipoContrato>('ccb_rural')
  const [anoContrato, setAnoContrato] = useState<number>(2024)
  const [taxaContratada, setTaxaContratada] = useState<number | ''>(22)
  const [capitalizacao, setCapitalizacao] = useState<'mensal' | 'anual' | 'diaria'>('mensal')
  const [valorOriginal, setValorOriginal] = useState<number | ''>(1_500_000)
  const [isRural, setIsRural] = useState(true)

  const r = useMemo(() => {
    const tc = typeof taxaContratada === 'number' ? taxaContratada : 0
    const vo = typeof valorOriginal === 'number' ? valorOriginal : 0
    if (tc <= 0) return null

    const taxaEsperada = isRural
      ? TAXA_SUBSIDIADA_PRONAMP[anoContrato] ?? 12.0
      : 18.0 // taxa comercial típica
    const desvio = tc - taxaEsperada
    const desvioPct = (desvio / taxaEsperada) * 100

    // Capitalização mensal em crédito rural subsidiado geralmente é vedada
    // (Súmula STJ 93 + Res. BCB). Flag automático se rural + mensal.
    const anatocismoFlag = isRural && capitalizacao !== 'anual'

    // Score de revisional (0–100)
    let score = 0
    if (desvio > 3) score += 30
    if (desvio > 6) score += 20
    if (anatocismoFlag) score += 30
    if (desvioPct > 50) score += 20
    score = Math.min(100, score)

    let nivel: 'baixo' | 'moderado' | 'alto' | 'critico'
    if (score >= 70) nivel = 'critico'
    else if (score >= 45) nivel = 'alto'
    else if (score >= 20) nivel = 'moderado'
    else nivel = 'baixo'

    // Estimativa de redução de saldo por revisional
    const reducaoEstimada = Math.min(0.32, (score / 100) * 0.35)
    const valorRecuperavel = vo * reducaoEstimada

    return {
      taxaEsperada,
      desvio,
      desvioPct,
      anatocismoFlag,
      score,
      nivel,
      reducaoEstimada,
      valorRecuperavel,
    }
  }, [tipo, anoContrato, taxaContratada, capitalizacao, valorOriginal, isRural])

  const nivelMap = {
    baixo: {
      label: 'Risco baixo',
      cor: 'text-emerald-400',
      icone: CheckCircle2,
      descricao:
        'Parâmetros dentro da razoabilidade para a época. Revisional não é prioridade — foco em reestruturação.',
    },
    moderado: {
      label: 'Risco moderado',
      cor: 'text-yellow-400',
      icone: AlertTriangle,
      descricao:
        'Há espaço revisional, mas o ganho pode ser modesto. Vale incorporar como ponto de negociação.',
    },
    alto: {
      label: 'Risco alto',
      cor: 'text-aletis-dourado',
      icone: ShieldAlert,
      descricao:
        'Desvio material em relação à taxa da época. Revisional é altamente recomendada — pode alterar o saldo em patamar significativo.',
    },
    critico: {
      label: 'Risco crítico',
      cor: 'text-red-400',
      icone: ShieldAlert,
      descricao:
        'Indícios fortes de descaracterização de crédito rural e anatocismo indevido. Revisional prioritária. Suspensão cautelar pode ser cabível.',
    },
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="rounded-2xl border border-aletis-borda/70 bg-white p-7 shadow-premium-sm">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10">
            <Scale className="h-5 w-5 text-aletis-verde-escuro" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-aletis-grafite-escuro">
              Dados do contrato
            </h2>
            <p className="text-[12px] text-aletis-grafite-medio">
              Informamos o contrato; o sistema aponta risco revisional.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-medio">
              Tipo de contrato
            </label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(Object.keys(TIPO_LABEL) as TipoContrato[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`rounded-xl border px-3 py-2 text-[12px] transition ${
                    tipo === t
                      ? 'border-aletis-dourado bg-aletis-dourado/10 text-aletis-verde-escuro font-semibold'
                      : 'border-aletis-borda bg-white text-aletis-grafite-medio hover:border-aletis-dourado/50'
                  }`}
                >
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center justify-between text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-medio">
              <span>Ano da contratação</span>
              <span className="font-body text-[10px] normal-case tracking-normal text-aletis-grafite-claro">
                Taxa subsidiada da época: {fmtNumero(TAXA_SUBSIDIADA_PRONAMP[anoContrato] ?? 0, 1)}% a.a.
              </span>
            </label>
            <select
              value={anoContrato}
              onChange={(e) => setAnoContrato(Number(e.target.value))}
              className="w-full rounded-xl border border-aletis-borda bg-white px-4 py-3 font-display text-sm font-semibold text-aletis-verde-escuro focus:border-aletis-dourado focus:outline-none"
            >
              {Object.keys(TAXA_SUBSIDIADA_PRONAMP)
                .map(Number)
                .sort((a, b) => b - a)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
          </div>

          <CampoMoeda
            label="Taxa contratada (% a.a.)"
            value={taxaContratada}
            onChange={setTaxaContratada}
            prefix=""
            suffix="%"
            hint="Taxa nominal do contrato"
            required
          />

          <div>
            <label className="mb-1.5 block text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-medio">
              Capitalização dos juros
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['anual', 'mensal', 'diaria'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCapitalizacao(c)}
                  className={`rounded-xl border px-3 py-2.5 text-[12px] capitalize transition ${
                    capitalizacao === c
                      ? 'border-aletis-dourado bg-aletis-dourado/10 text-aletis-verde-escuro font-semibold'
                      : 'border-aletis-borda bg-white text-aletis-grafite-medio hover:border-aletis-dourado/50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <CampoMoeda
            label="Valor original contratado"
            value={valorOriginal}
            onChange={setValorOriginal}
            hint="Para estimar valor recuperável"
          />

          <label className="flex items-start gap-3 rounded-xl border border-aletis-borda bg-aletis-bege/50 px-4 py-3 cursor-pointer hover:border-aletis-dourado/40">
            <input
              type="checkbox"
              checked={isRural}
              onChange={(e) => setIsRural(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-aletis-borda text-aletis-dourado focus:ring-aletis-dourado"
            />
            <span className="text-[13px] text-aletis-grafite-medio">
              Operação classificada como <strong>crédito rural</strong> (aplicação de Resoluções do BCB e taxas subsidiadas)
            </span>
          </label>
        </div>
      </div>

      {r ? (
        <ResultadoCard
          titulo={nivelMap[r.nivel].label}
          subtitulo={`Score revisional: ${r.score}/100 · ${TIPO_LABEL[tipo]} (${anoContrato})`}
          itens={[
            {
              label: 'Desvio vs. taxa da época',
              valor: `+ ${fmtNumero(r.desvio, 1)} p.p.`,
              sub: `${fmtPct(Math.abs(r.desvioPct), 0)} acima do esperado`,
              destaque: r.nivel === 'alto' || r.nivel === 'critico',
            },
            {
              label: 'Capitalização',
              valor: capitalizacao === 'anual' ? 'Anual ✓' : capitalizacao === 'mensal' ? 'Mensal ⚠' : 'Diária ⚠',
              sub: r.anatocismoFlag ? 'Anatocismo provável (Súm. 93 STJ)' : 'Dentro do permitido',
            },
            {
              label: 'Redução estimada do saldo',
              valor: fmtPct(r.reducaoEstimada * 100, 0),
              sub: 'pela via revisional',
            },
            {
              label: 'Valor potencialmente recuperável',
              valor: fmtBRL(r.valorRecuperavel),
              sub: 'base: valor original',
              destaque: true,
            },
          ]}
        >
          <div
            className={`rounded-xl border p-4 ${
              r.nivel === 'baixo'
                ? 'border-emerald-400/30 bg-emerald-500/10'
                : r.nivel === 'moderado'
                  ? 'border-yellow-400/30 bg-yellow-500/10'
                  : r.nivel === 'alto'
                    ? 'border-aletis-dourado/40 bg-aletis-dourado/15'
                    : 'border-red-400/30 bg-red-500/10'
            }`}
          >
            <p
              className={`flex items-center gap-2 text-[11px] font-display font-semibold uppercase tracking-wider ${nivelMap[r.nivel].cor}`}
            >
              <FileSearch className="h-3 w-3" />
              Diagnóstico preliminar
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-white/80">
              {nivelMap[r.nivel].descricao}
            </p>
          </div>
          <p className="mt-4 text-[10px] text-white/40">
            Nota: taxas subsidiadas indicativas para calibragem. Análise definitiva requer leitura
            integral do contrato e memória de cálculo.
          </p>
        </ResultadoCard>
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-aletis-borda bg-white p-12 text-center">
          <p className="text-sm text-aletis-grafite-medio">
            Informe a taxa contratada para analisar o risco revisional.
          </p>
        </div>
      )}
    </div>
  )
}

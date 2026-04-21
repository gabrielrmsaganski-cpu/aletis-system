'use client'

import { useMemo, useState } from 'react'
import { Calculator, TrendingDown, Sparkles } from 'lucide-react'
import { fmtBRL, fmtPct } from '@/lib/formatters'
import { CampoMoeda } from './CampoMoeda'
import { ResultadoCard } from './ResultadoCard'

/**
 * Simulador de economia em reestruturação de dívida ALETIS.
 * Heurística comercial baseada na média histórica de cases:
 *   - Deságio esperado por perfil de credor (banco, cooperativa, PJ rural)
 *   - Anatocismo médio estimado (10–18% do saldo em casos típicos)
 *   - Descaracterização de crédito rural (quando aplicável)
 */

type Perfil = 'banco' | 'coop' | 'revenda' | 'misto'

const PERFIL_DESAGIO: Record<Perfil, { label: string; desagio: number; anatocismo: number }> = {
  banco: { label: 'Predominantemente bancário', desagio: 0.22, anatocismo: 0.12 },
  coop: { label: 'Cooperativa de crédito', desagio: 0.18, anatocismo: 0.08 },
  revenda: { label: 'Revenda / PJ rural', desagio: 0.28, anatocismo: 0.05 },
  misto: { label: 'Misto (multi-credor)', desagio: 0.24, anatocismo: 0.11 },
}

export function ReestruturacaoCalc() {
  const [saldo, setSaldo] = useState<number | ''>(2_500_000)
  const [parcelaAtual, setParcelaAtual] = useState<number | ''>(48_000)
  const [prazoMeses, setPrazoMeses] = useState<number | ''>(72)
  const [perfil, setPerfil] = useState<Perfil>('misto')
  const [rural, setRural] = useState(true)

  const resultado = useMemo(() => {
    const s = typeof saldo === 'number' ? saldo : 0
    const parc = typeof parcelaAtual === 'number' ? parcelaAtual : 0
    const prazo = typeof prazoMeses === 'number' ? prazoMeses : 72
    if (s <= 0 || prazo <= 0) return null

    const cfg = PERFIL_DESAGIO[perfil]
    const descaracterizacao = rural ? 0.04 : 0
    const reducaoTotal = cfg.desagio + cfg.anatocismo + descaracterizacao
    const novoSaldo = s * (1 - reducaoTotal)
    const economia = s - novoSaldo
    // taxa indicativa projeto pós-reestruturação (nominal aa): 10.5-12.5% a.a.
    const taxaMensal = 0.01 // ~12.68% a.a. — referencial
    const novaParcela =
      (novoSaldo * taxaMensal) / (1 - Math.pow(1 + taxaMensal, -prazo))
    const reducaoMensal = parc > 0 ? 1 - novaParcela / parc : 0

    return {
      novoSaldo,
      economia,
      reducaoTotal,
      novaParcela,
      reducaoMensal,
      desagio: cfg.desagio,
      anatocismo: cfg.anatocismo,
      descaracterizacao,
    }
  }, [saldo, parcelaAtual, prazoMeses, perfil, rural])

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      {/* Form */}
      <div className="rounded-2xl border border-aletis-borda/70 bg-white p-7 shadow-premium-sm">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10">
            <Calculator className="h-5 w-5 text-aletis-verde-escuro" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-aletis-grafite-escuro">
              Parâmetros
            </h2>
            <p className="text-[12px] text-aletis-grafite-medio">
              Preencha os dados da operação. Resultado atualiza em tempo real.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <CampoMoeda
            label="Saldo devedor atualizado"
            value={saldo}
            onChange={setSaldo}
            hint="Soma de todos os credores"
            required
          />
          <CampoMoeda
            label="Parcela mensal atual (total)"
            value={parcelaAtual}
            onChange={setParcelaAtual}
            hint="Somatório das prestações hoje"
          />

          <div>
            <label className="mb-1.5 flex items-center justify-between text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-medio">
              <span>Prazo desejado</span>
              <span className="text-[10px] font-body normal-case tracking-normal text-aletis-grafite-claro">
                meses
              </span>
            </label>
            <div className="rounded-xl border border-aletis-borda bg-white px-4 py-2.5">
              <div className="flex items-center justify-between">
                <span className="font-display text-2xl font-semibold text-aletis-verde-escuro">
                  {prazoMeses || 0}
                </span>
                <span className="text-[11px] text-aletis-grafite-medio">
                  {typeof prazoMeses === 'number' ? `${Math.round(prazoMeses / 12)} anos` : ''}
                </span>
              </div>
              <input
                type="range"
                min={12}
                max={180}
                step={6}
                value={typeof prazoMeses === 'number' ? prazoMeses : 72}
                onChange={(e) => setPrazoMeses(Number(e.target.value))}
                className="mt-2 w-full accent-aletis-dourado"
                aria-label="Prazo em meses"
              />
              <div className="mt-1 flex justify-between text-[10px] text-aletis-grafite-claro">
                <span>12m</span>
                <span>60m</span>
                <span>120m</span>
                <span>180m</span>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-medio">
              Perfil do passivo
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PERFIL_DESAGIO) as Perfil[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPerfil(k)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-[13px] transition ${
                    perfil === k
                      ? 'border-aletis-dourado bg-aletis-dourado/10 text-aletis-verde-escuro font-semibold'
                      : 'border-aletis-borda bg-white text-aletis-grafite-medio hover:border-aletis-dourado/50'
                  }`}
                >
                  {PERFIL_DESAGIO[k].label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-aletis-borda bg-aletis-bege/50 px-4 py-3 cursor-pointer hover:border-aletis-dourado/40">
            <input
              type="checkbox"
              checked={rural}
              onChange={(e) => setRural(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-aletis-borda text-aletis-dourado focus:ring-aletis-dourado"
            />
            <span className="text-[13px] text-aletis-grafite-medio">
              Operação originalmente de <strong>crédito rural</strong> (possibilita descaracterização — Res. BCB 4.966/21)
            </span>
          </label>
        </div>
      </div>

      {/* Resultado */}
      {resultado ? (
        <ResultadoCard
          titulo={fmtBRL(resultado.economia)}
          subtitulo={`Economia estimada · ${fmtPct(resultado.reducaoTotal * 100, 1)} do saldo atual`}
          itens={[
            {
              label: 'Saldo projetado (pós-acordo)',
              valor: fmtBRL(resultado.novoSaldo),
            },
            {
              label: 'Nova parcela mensal',
              valor: fmtBRL(resultado.novaParcela),
              sub:
                resultado.reducaoMensal > 0
                  ? `− ${fmtPct(resultado.reducaoMensal * 100, 0)} vs. atual`
                  : undefined,
              destaque: true,
            },
            {
              label: 'Deságio esperado',
              valor: fmtPct(resultado.desagio * 100, 0),
              sub: 'via negociação multi-credor',
            },
            {
              label: 'Recálculo de abusividade',
              valor: fmtPct(resultado.anatocismo * 100, 0),
              sub: 'anatocismo + encargos indevidos',
            },
          ]}
        >
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="flex items-center gap-2 text-[11px] font-display font-semibold uppercase tracking-wider text-aletis-dourado">
              <Sparkles className="h-3 w-3" />
              Como chegamos aqui
            </p>
            <ul className="mt-2 space-y-1.5 text-[12px] text-white/65 leading-relaxed">
              <li className="flex items-start gap-2">
                <TrendingDown className="mt-0.5 h-3 w-3 flex-shrink-0 text-aletis-dourado" />
                Deságio de {fmtPct(resultado.desagio * 100, 0)} — base histórica ALETIS para perfil selecionado
              </li>
              <li className="flex items-start gap-2">
                <TrendingDown className="mt-0.5 h-3 w-3 flex-shrink-0 text-aletis-dourado" />
                Recálculo técnico de {fmtPct(resultado.anatocismo * 100, 0)} sobre o saldo (anatocismo, CET, IOF)
              </li>
              {resultado.descaracterizacao > 0 && (
                <li className="flex items-start gap-2">
                  <TrendingDown className="mt-0.5 h-3 w-3 flex-shrink-0 text-aletis-dourado" />
                  Descaracterização de crédito rural: {fmtPct(resultado.descaracterizacao * 100, 0)} adicional
                </li>
              )}
            </ul>
          </div>
        </ResultadoCard>
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-aletis-borda bg-white p-12 text-center">
          <p className="text-sm text-aletis-grafite-medio">
            Preencha o saldo devedor para ver a estimativa.
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Portal — Card de honorários ALETIS.
// ============================================================
// Mostra o modelo contratado, total previsto/pago/aberto, próxima
// cobrança em destaque, lista de parcelas com badges de status, e
// explicação do success fee em tooltip.
// ============================================================
import { useState } from 'react'
import {
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Info,
  TrendingUp,
} from 'lucide-react'
import type {
  HonorariosProjecaoDTO,
  HonorarioParcelaDTO,
  StatusParcelaHonorario,
} from './types'
import { formatBRL, formatDate } from './utils'

interface Props {
  honorarios: HonorariosProjecaoDTO | null
}

export function HonorariosCard({ honorarios }: Props) {
  const [showExplain, setShowExplain] = useState(false)

  if (!honorarios) {
    return (
      <div className="card-premium p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-aletis-cream-escuro/40 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-aletis-verde-medio" />
          </div>
          <div>
            <p className="font-display text-[14px] font-bold text-aletis-verde">
              Honorários ALETIS
            </p>
            <p className="font-body text-[12.5px] text-aletis-verde-medio">
              Quando o modelo de honorários for assinado, ele aparece aqui com cronograma e progresso.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { proximaCobranca, successFee, parcelas, alertas } = honorarios

  return (
    <div className="card-premium p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-aletis-gold/15 border border-aletis-gold/40 flex items-center justify-center flex-shrink-0">
          <Receipt className="w-5 h-5 text-aletis-gold-escuro" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[10px] font-semibold uppercase tracking-widest2 text-aletis-gold-escuro">
            Honorários ALETIS
          </p>
          <p className="mt-0.5 font-display text-[15px] font-bold text-aletis-verde leading-tight">
            {honorarios.descricaoHumana}
          </p>
          <p className="mt-1 font-body text-[11.5px] text-aletis-verde-medio">
            Vigência iniciada em {formatDate(honorarios.vigencia.inicio)}
            {honorarios.vigencia.fim ? ` · término previsto ${formatDate(honorarios.vigencia.fim)}` : ''}
          </p>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 space-y-1">
          {alertas.map((a, i) => (
            <p key={i} className="flex items-start gap-2 font-body text-[12.5px] text-amber-800">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              {a}
            </p>
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="Total previsto"
          value={formatBRL(honorarios.valorTotal)}
          accent="default"
        />
        <Stat
          label="Já pago"
          value={formatBRL(honorarios.valorPago)}
          accent="success"
          extra={`${honorarios.pctPago.toFixed(0)}%`}
        />
        <Stat
          label="Em aberto"
          value={formatBRL(honorarios.valorAberto)}
          accent={honorarios.valorAberto > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Próxima cobrança */}
      {proximaCobranca && (
        <div
          className={`rounded-xl border p-4 ${
            proximaCobranca.atrasada
              ? 'border-red-300 bg-red-50'
              : proximaCobranca.diasParaVencer <= 7
              ? 'border-aletis-gold/40 bg-aletis-gold/10'
              : 'border-aletis-cream-escuro bg-aletis-cream-papel'
          }`}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-display text-[10px] uppercase tracking-widest2 text-aletis-verde-medio">
                Próxima cobrança
              </p>
              <p className="mt-0.5 font-display text-[18px] font-bold text-aletis-verde tabular-nums">
                {formatBRL(proximaCobranca.valor)}
              </p>
              <p className="font-body text-[12px] text-aletis-verde-medio">
                {tipoLabel(proximaCobranca.tipo)} · vence em {formatDate(proximaCobranca.vencimento)}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-[11px] font-semibold ${
                proximaCobranca.atrasada
                  ? 'bg-red-600 text-white'
                  : proximaCobranca.diasParaVencer <= 7
                  ? 'bg-aletis-gold text-aletis-verde'
                  : 'bg-aletis-cream-escuro text-aletis-verde'
              }`}
            >
              <Clock size={12} />
              {proximaCobranca.atrasada
                ? `Em atraso há ${Math.abs(proximaCobranca.diasParaVencer)} d`
                : proximaCobranca.diasParaVencer === 0
                ? 'Vence hoje'
                : `Vence em ${proximaCobranca.diasParaVencer} d`}
            </span>
          </div>
        </div>
      )}

      {/* Success fee */}
      {successFee && (
        <div className="rounded-xl border border-aletis-sage/40 bg-aletis-sage/15 p-4">
          <div className="flex items-start gap-3">
            <Sparkles size={16} className="text-aletis-gold-escuro flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-display text-[12px] font-semibold text-aletis-verde">
                  Êxito estimado · {successFee.pct}% sobre economia
                </p>
                <button
                  type="button"
                  onClick={() => setShowExplain((v) => !v)}
                  className="inline-flex items-center gap-1 text-aletis-verde-medio hover:text-aletis-gold-escuro text-[11px] font-body"
                >
                  <Info size={12} />
                  {showExplain ? 'fechar' : 'como funciona?'}
                </button>
              </div>
              <p className="mt-1 font-display text-[22px] font-bold text-aletis-verde tabular-nums">
                {formatBRL(successFee.estimado)}
                {successFee.ajustado && (
                  <span className="ml-2 font-body text-[11px] text-aletis-gold-escuro">
                    (limitado por {successFee.estimado === successFee.piso ? 'piso' : 'teto'})
                  </span>
                )}
              </p>
              <p className="font-body text-[11.5px] text-aletis-verde-medio">
                Base de cálculo: {formatBRL(successFee.baseValor)} ({baseLabel(successFee.baseCalculo)})
              </p>
              {showExplain && (
                <p className="mt-3 font-body text-[12px] leading-relaxed text-aletis-verde-medio bg-white/60 rounded-lg p-3 border border-aletis-cream-escuro/60">
                  O êxito é uma porcentagem cobrada apenas sobre a <strong>economia comprovada</strong> — ou seja,
                  quanto a ALETIS conseguiu reduzir das suas dívidas. Se nada for renegociado, não há cobrança.
                  {successFee.piso != null && ` O valor mínimo é ${formatBRL(successFee.piso)}.`}
                  {successFee.teto != null && ` O valor máximo é ${formatBRL(successFee.teto)}.`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Parcelas */}
      {parcelas.length > 0 && (
        <div>
          <p className="font-display text-[10px] uppercase tracking-widest2 text-aletis-verde-medio mb-2">
            Cronograma de parcelas
          </p>
          <ul className="divide-y divide-aletis-cream-escuro/50 max-h-64 overflow-auto rounded-xl border border-aletis-cream-escuro/50 bg-white">
            {parcelas.map((p) => (
              <ParcelaRow key={p.id} p={p} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ParcelaRow({ p }: { p: HonorarioParcelaDTO }) {
  return (
    <li className="px-3 py-2 flex items-center gap-3">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 ${badgeBg(p.status)}`}
      >
        {iconForStatus(p.status)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-body text-[13px] font-medium text-aletis-verde">
          {tipoLabel(p.tipo)}
          {p.descricao ? ` · ${p.descricao}` : ''}
        </p>
        <p className="font-body text-[11px] text-aletis-verde-medio">
          Vencimento {formatDate(p.vencimento)}
          {p.pagoEm ? ` · Pago em ${formatDate(p.pagoEm)}` : ''}
        </p>
      </div>
      <p className="font-display text-[13px] font-semibold text-aletis-verde tabular-nums flex-shrink-0">
        {formatBRL(p.valor)}
      </p>
    </li>
  )
}

function Stat({
  label,
  value,
  accent,
  extra,
}: {
  label: string
  value: string
  accent: 'default' | 'success' | 'warning'
  extra?: string
}) {
  const tone =
    accent === 'success'
      ? 'border-aletis-sage/40 bg-aletis-sage/15'
      : accent === 'warning'
      ? 'border-amber-300/60 bg-amber-50/60'
      : 'border-aletis-cream-escuro bg-aletis-cream-papel'
  const valueColor = accent === 'warning' ? 'text-amber-800' : 'text-aletis-verde'
  return (
    <div className={`rounded-xl border ${tone} p-3`}>
      <p className="font-display text-[9.5px] uppercase tracking-widest text-aletis-verde-medio">
        {label}
      </p>
      <p className={`mt-1 font-display text-[15px] font-bold tabular-nums ${valueColor}`}>{value}</p>
      {extra && (
        <p className="font-body text-[10px] text-aletis-verde-medio mt-0.5">{extra} pago</p>
      )}
    </div>
  )
}

function tipoLabel(t: HonorarioParcelaDTO['tipo']): string {
  if (t === 'fixo') return 'Honorário fixo'
  if (t === 'mensalidade') return 'Mensalidade'
  return 'Êxito (success fee)'
}

function baseLabel(b: 'economia_total' | 'reducao_saldo' | 'valor_renegociado'): string {
  if (b === 'valor_renegociado') return 'valor renegociado'
  return 'economia obtida'
}

function badgeBg(s: StatusParcelaHonorario): string {
  if (s === 'pago') return 'bg-aletis-sage/40 text-aletis-verde'
  if (s === 'atrasado') return 'bg-red-100 text-red-700'
  if (s === 'cancelado') return 'bg-aletis-cream-escuro text-aletis-verde-medio'
  return 'bg-aletis-cream-escuro text-aletis-verde-medio'
}

function iconForStatus(s: StatusParcelaHonorario) {
  if (s === 'pago') return <CheckCircle2 size={14} />
  if (s === 'atrasado') return <AlertTriangle size={14} />
  if (s === 'cancelado') return <Clock size={14} />
  return <TrendingUp size={14} />
}

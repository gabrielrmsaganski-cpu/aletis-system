/**
 * TabAgro — aba "Perfil agro" do drawer de lead em Prospecção.
 *
 * Extraída de pages/Prospeccao.tsx (Onda B).
 */
import { Tractor, Users, Wheat } from 'lucide-react'
import type { LeadFull } from '../../pages/Prospeccao'
import { fmtNum, CONFIDENCE_COLOR } from '../../pages/Prospeccao'

export function TabAgro({ lead }: { lead: LeadFull }) {
  return (
    <>
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4 bg-gradient-to-br from-aletis-verde/5 to-transparent">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Tractor size={16} className="text-aletis-verde" />
          <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">Perfil agro</p>
          <span className="ml-auto text-xs font-semibold text-aletis-verde">
            {lead.agroProfile.provavel ? `agro ${lead.agroProfile.nivel}` : 'baixo sinal agro'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="font-display text-4xl font-bold text-aletis-verde">
                {lead.area.hectaresEstimados > 0 ? fmtNum(lead.area.hectaresEstimados) : '—'}
              </span>
              <span className="text-aletis-grafite-medio dark:text-white/50 text-sm">hectares (est.)</span>
            </div>
            <p className="text-[11px] text-aletis-grafite-medio dark:text-white/50 mb-2">
              Método: <b className="text-aletis-grafite-escuro dark:text-white">{lead.area.metodo}</b>
            </p>
            <p className={`text-[11px] font-semibold ${CONFIDENCE_COLOR[lead.area.confidence]}`}>
              Confiança: {lead.area.confidence}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-2">
              Evidências agro
            </p>
            <div className="flex flex-wrap gap-2">
              {lead.agroProfile.evidencias.length > 0 ? lead.agroProfile.evidencias.map((item) => (
                <span key={item} className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {item}
                </span>
              )) : (
                <span className="text-xs text-aletis-grafite-medio dark:text-white/50">sem evidência forte</span>
              )}
            </div>
          </div>
        </div>
        {lead.area.explicacao && (
          <pre className="mt-3 whitespace-pre-wrap text-[11px] text-aletis-grafite-medio dark:text-white/60 bg-aletis-bege/50 dark:bg-black/20 p-3 rounded-lg font-mono leading-relaxed">
            {lead.area.explicacao}
          </pre>
        )}
      </div>

      {lead.tipoPessoa === 'PF' && (
        <div className="rounded-xl border border-sky-200 dark:border-sky-900/50 p-4 bg-sky-50/50 dark:bg-sky-950/10">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-sky-600 dark:text-sky-400" />
            <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">Perfil PF rural</p>
          </div>
          <p className="text-sm font-semibold text-sky-700 dark:text-sky-300 mb-2">
            {lead.pfProfile.relevante ? `PF rural ${lead.pfProfile.nivel}` : 'PF sem âncora rural forte'}
          </p>
          <div className="flex flex-wrap gap-2">
            {lead.pfProfile.evidencias.length > 0 ? lead.pfProfile.evidencias.map((item) => (
              <span key={item} className="px-2.5 py-1 rounded-full bg-sky-100 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-800 text-xs font-medium text-sky-700 dark:text-sky-300">
                {item}
              </span>
            )) : (
              <span className="text-xs text-aletis-grafite-medio dark:text-white/50">sem vínculo PF rural derivado</span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4">
        <p className="font-semibold text-sm mb-2 flex items-center gap-2">
          <Wheat size={14} className="text-aletis-dourado" /> Sinais agro cruzados
        </p>
        <div className="flex flex-wrap gap-2">
          {lead.agroSignals.length > 0 ? (
            Array.from(new Set(lead.agroSignals)).map((s) => (
              <span key={s} className="px-2.5 py-1 rounded-full bg-aletis-dourado/15 border border-aletis-dourado/30 text-xs font-medium text-aletis-dourado">
                {s}
              </span>
            ))
          ) : (
            <span className="text-xs text-aletis-grafite-medio dark:text-white/50">nenhum</span>
          )}
        </div>
      </div>
    </>
  )
}

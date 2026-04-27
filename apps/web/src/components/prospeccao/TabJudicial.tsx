/**
 * TabJudicial — aba "Judicial" do drawer de lead em Prospecção.
 *
 * Extraída de pages/Prospeccao.tsx (Onda B). Consolida sinais
 * judiciais cruzados de PGFN + BrasilAPI + DOU + SICAR, eventos
 * estruturados do DOU, leitura comercial e auditoria de sinais
 * brutos.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, Archive, Gavel, Info, Eye, Hash } from 'lucide-react'
import type { LeadFull } from '../../pages/Prospeccao'
import {
  fmtBRL,
  fmtNum,
  fmtDate,
  situacaoBucket,
  JUDICIAL_LABEL,
  JUDICIAL_STYLE,
} from '../../pages/Prospeccao'

function KpiLine({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'green' | 'red'
}) {
  const tone =
    accent === 'green'
      ? 'text-emerald-700 dark:text-emerald-300'
      : accent === 'red'
      ? 'text-red-700 dark:text-red-300'
      : 'text-aletis-grafite-escuro dark:text-white'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50">{label}</p>
      <p className={`font-display text-sm font-bold ${tone}`}>{value}</p>
    </div>
  )
}

export function TabJudicial({ lead }: { lead: LeadFull }) {
  const events = lead.judicialEvents ?? []
  const severityStyle = JUDICIAL_STYLE[lead.judicialProfile.severidade]
  const [showRaw, setShowRaw] = useState(false)

  const ajuizadasDebts = useMemo(() => lead.debts.filter((d) => d.ajuizado), [lead.debts])
  const ajuizadasValor = ajuizadasDebts.reduce((acc, d) => acc + d.valor, 0)
  const rescindidasCount = lead.debts.filter((d) => situacaoBucket(d.situacao) === 'rescindido').length
  const suspensasCount = lead.debts.filter((d) => situacaoBucket(d.situacao) === 'suspenso').length
  const suspensasValor = lead.debts
    .filter((d) => situacaoBucket(d.situacao) === 'suspenso')
    .reduce((acc, d) => acc + d.valor, 0)

  const sitEspecial = lead.cnpj?.situacaoEspecial
  const motivoCad = lead.cnpj?.motivoSituacaoCadastral
  const rawJudicialSignals = (lead.agroSignals || []).filter((s) => s.startsWith('DOU:') && !s.startsWith('DOU:agro:'))

  return (
    <div className="space-y-4">
      {/* Hero: perfil judicial consolidado */}
      <div className={`rounded-xl border p-4 ${severityStyle.badge} ${severityStyle.border}`}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <AlertTriangle size={16} className={severityStyle.text} />
          <p className={`font-semibold text-sm ${severityStyle.text}`}>Perfil judicial consolidado</p>
          <span className={`ml-auto text-xs font-semibold ${severityStyle.text}`}>
            {lead.judicialProfile.ativo ? `severidade ${lead.judicialProfile.severidade}` : 'sem crise judicial materializada'}
          </span>
        </div>
        <p className="text-sm text-aletis-grafite-escuro dark:text-white mb-3">
          {lead.judicialProfile.explicacao}
        </p>
        <div className="flex flex-wrap gap-2">
          {lead.judicialProfile.tipos.length > 0 ? lead.judicialProfile.tipos.map((tipo) => (
            <span key={tipo} className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${severityStyle.badge} ${severityStyle.text} ${severityStyle.border}`}>
              {JUDICIAL_LABEL[tipo]}
            </span>
          )) : (
            <span className="text-xs text-aletis-grafite-medio dark:text-white/50">nenhum tipo judicial estruturado</span>
          )}
        </div>
        {lead.judicialProfile.evidencias.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {lead.judicialProfile.evidencias.map((item) => (
              <span key={item} className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-black/20 border border-aletis-borda dark:border-white/10 text-xs text-aletis-grafite-escuro dark:text-white/80">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sinais cruzados: PGFN x DOU x BrasilAPI x SICAR */}
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4">
        <p className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Archive size={14} className="text-aletis-verde" /> Sinais cruzados · mapa das fontes
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* PGFN */}
          <div className={`p-3 rounded-lg border ${ajuizadasDebts.length > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : 'bg-aletis-bege/40 dark:bg-white/5 border-aletis-borda dark:border-white/10'}`}>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-1">PGFN · execução fiscal</p>
            {ajuizadasDebts.length > 0 ? (
              <>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  {ajuizadasDebts.length} inscrições ajuizadas · {fmtBRL(ajuizadasValor)}
                </p>
                {rescindidasCount > 0 && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                    {rescindidasCount} parcelamento(s) rescindido(s) — risco de novo ajuizamento
                  </p>
                )}
                {suspensasCount > 0 && (
                  <p className="text-[11px] text-sky-700 dark:text-sky-300 mt-1">
                    {suspensasCount} suspensa(s) por decisão judicial · {fmtBRL(suspensasValor)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-aletis-grafite-medio dark:text-white/50">Nenhuma inscrição PGFN ajuizada</p>
            )}
          </div>

          {/* BrasilAPI · CNPJ */}
          <div className={`p-3 rounded-lg border ${sitEspecial || motivoCad ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900' : 'bg-aletis-bege/40 dark:bg-white/5 border-aletis-borda dark:border-white/10'}`}>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-1">BrasilAPI · situação cadastral</p>
            {lead.cnpj ? (
              <>
                <p className="text-sm text-aletis-grafite-escuro dark:text-white">
                  {lead.cnpj.situacaoCadastral || '—'}
                </p>
                {sitEspecial && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                    Situação especial: <b>{sitEspecial}</b>
                  </p>
                )}
                {motivoCad && (
                  <p className="text-[11px] text-aletis-grafite-medio dark:text-white/60 mt-1">
                    Motivo: {motivoCad}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
                CNPJ ainda não enriquecido · clique em "Enriquecer agora" para materializar
              </p>
            )}
          </div>

          {/* DOU */}
          <div className={`p-3 rounded-lg border ${rawJudicialSignals.length > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : 'bg-aletis-bege/40 dark:bg-white/5 border-aletis-borda dark:border-white/10'}`}>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-1">DOU · publicações oficiais</p>
            {events.length > 0 ? (
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                {events.length} evento(s) estruturado(s) · ver abaixo
              </p>
            ) : rawJudicialSignals.length > 0 ? (
              <p className="text-sm text-red-700 dark:text-red-300">
                Sinais brutos DOU presentes mas sem evento estruturado
              </p>
            ) : (
              <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
                Sem publicação DOU recente associada
              </p>
            )}
          </div>

          {/* SICAR/CAR */}
          <div className={`p-3 rounded-lg border ${lead.car ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900' : 'bg-aletis-bege/40 dark:bg-white/5 border-aletis-borda dark:border-white/10'}`}>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-1">SICAR · patrimônio rural</p>
            {lead.car ? (
              <>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  CAR {lead.car.codImovel} · {fmtNum(lead.car.areaImovel)} ha
                </p>
                {lead.car.municipio && (
                  <p className="text-[11px] text-aletis-grafite-medio dark:text-white/60 mt-1">
                    {lead.car.municipio}/{lead.car.uf} · {lead.car.condicaoCadastro || lead.car.statusAnalise || '—'}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
                CAR não materializado · pode ancorar penhora/alienação judicial
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Eventos estruturados do DOU */}
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4">
        <p className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Gavel size={14} className="text-red-600 dark:text-red-400" /> Eventos estruturados do DOU
        </p>
        {events.length === 0 ? (
          <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
            Nenhum evento judicial estruturado ainda. Quando DOU/BrasilAPI materializam sinais (recuperação judicial, falência, leilão, penhora), eles aparecem aqui com tipo, severidade, data e resumo auditável.
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((event, index) => {
              const style = JUDICIAL_STYLE[event.severidade]
              return (
                <div key={`${event.tipo}-${event.data}-${index}`} className={`rounded-lg border p-3 ${style.badge} ${style.border}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.badge} ${style.text} ${style.border}`}>
                        {JUDICIAL_LABEL[event.tipo]}
                      </span>
                      <span className="text-[11px] text-aletis-grafite-medio dark:text-white/50">
                        {event.fonte} · {fmtDate(event.data)}
                      </span>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>
                      {event.severidade}
                    </span>
                  </div>
                  <p className="text-sm text-aletis-grafite-escuro dark:text-white/90">{event.resumo}</p>
                  {event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-xs text-aletis-verde hover:underline"
                    >
                      <Eye size={12} /> abrir publicação no DOU
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Leitura comercial */}
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4 bg-aletis-bege/40 dark:bg-white/5">
        <p className="font-semibold text-sm mb-2 flex items-center gap-2">
          <Info size={14} className="text-aletis-verde" /> Leitura comercial
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <KpiLine label="Dívida total" value={fmtBRL(lead.totalDivida)} />
          <KpiLine label="Inscrições" value={`${lead.qtdInscricoes}${ajuizadasDebts.length ? ` · ${ajuizadasDebts.length} ajuizadas` : ''}`} accent={ajuizadasDebts.length ? 'red' : undefined} />
          <KpiLine label="Multi-source" value={lead.sources?.length ? `${lead.sources.length} fontes · ${lead.sources.map((s) => s.fonte).join(', ')}` : 'fonte única'} />
          <KpiLine label="Agro provável" value={lead.agroProfile.provavel ? `sim · ${lead.agroProfile.nivel}` : 'não'} accent={lead.agroProfile.provavel ? 'green' : undefined} />
          <KpiLine label="PF rural" value={lead.pfProfile.relevante ? `sim · ${lead.pfProfile.nivel}` : 'não'} accent={lead.pfProfile.relevante ? 'green' : undefined} />
          <KpiLine label="Score total" value={`${lead.score.total} · ${lead.score.classificacao}`} />
        </div>
      </div>

      {/* Sinais brutos — auditoria expandível */}
      {rawJudicialSignals.length > 0 && (
        <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="w-full flex items-center justify-between text-sm font-semibold text-aletis-grafite-escuro dark:text-white"
          >
            <span className="flex items-center gap-2">
              <Hash size={14} className="text-aletis-grafite-medio" /> Sinais brutos para auditoria ({rawJudicialSignals.length})
            </span>
            <span className="text-[11px] text-aletis-grafite-medio">{showRaw ? 'ocultar' : 'ver'}</span>
          </button>
          {showRaw && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rawJudicialSignals.map((s) => (
                <code key={s} className="px-2 py-0.5 rounded bg-aletis-bege/50 dark:bg-white/5 border border-aletis-borda dark:border-white/10 text-[10px] font-mono text-aletis-grafite-escuro dark:text-white/70">
                  {s}
                </code>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

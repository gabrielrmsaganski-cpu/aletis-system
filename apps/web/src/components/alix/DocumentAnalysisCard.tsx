import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  FileSearch,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import type { DocumentAnalysisResult } from '../../hooks/useDocumentAnalysis'

interface Props {
  analysis: DocumentAnalysisResult | null
  loading?: boolean
  error?: string | null
  onDismiss?: () => void
  compact?: boolean
}

function SignalList({ values, tone, icon: Icon }: { values: string[]; tone: 'risk' | 'gap' | 'good'; icon: typeof AlertTriangle }) {
  if (!values.length) return null
  const classes = tone === 'risk'
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : tone === 'gap'
      ? 'border-slate-200 bg-slate-50 text-slate-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return (
    <ul className={`rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${classes}`}>
      {values.slice(0, 2).map((value, index) => (
        <li key={`${value}-${index}`} className="flex gap-1.5"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{value}</span></li>
      ))}
    </ul>
  )
}

export default function DocumentAnalysisCard({ analysis, loading, error, onDismiss, compact = false }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-aletis-verde/20 bg-aletis-verde/5 px-3 py-2.5 text-xs text-[var(--text-soft)]">
        <Loader2 className="h-4 w-4 animate-spin text-foreground" />
        A ALIX está lendo o arquivo, conferindo evidências e identificando riscos…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
        <span><strong>Não foi possível concluir a leitura profunda.</strong> {error}</span>
        {onDismiss && <button type="button" onClick={onDismiss} className="shrink-0" aria-label="Fechar análise"><X className="h-4 w-4" /></button>}
      </div>
    )
  }
  if (!analysis) return null

  const result = analysis.analysis
  return (
    <section className={`rounded-2xl border border-aletis-verde/20 bg-card shadow-elevation-1 ${compact ? 'p-3' : 'p-4'}`} aria-label="Leitura inteligente do documento">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-aletis-verde text-white"><FileSearch className="h-4 w-4" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-xs font-bold text-foreground">{result.tipoDocumento || 'Documento analisado'}</h3>
              <span className="rounded-full bg-aletis-bege px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-aletis-verde-escuro">{result.status === 'llm' ? 'Leitura IA profunda' : 'Leitura estruturada'}</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{result.filename}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span title="Evidências localizadas" className="inline-flex items-center gap-1 rounded-full border border-aletis-borda bg-aletis-bege/35 px-2 py-1 text-[10px] font-semibold text-[var(--text-soft)]"><ShieldCheck className="h-3 w-3 text-foreground" />{analysis.sourceReadiness.evidenceCount}</span>
          {onDismiss && <button type="button" onClick={onDismiss} className="rounded-lg p-1 text-muted-foreground hover:bg-aletis-bege hover:text-aletis-grafite-escuro" aria-label="Fechar análise"><X className="h-4 w-4" /></button>}
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-[var(--text-soft)]">{result.resumoExecutivo}</p>

      <div className={`mt-3 grid gap-2 ${compact ? 'lg:grid-cols-3' : 'md:grid-cols-3'}`}>
        <SignalList values={result.achadosChave} tone="good" icon={CheckCircle2} />
        <SignalList values={result.riscos} tone="risk" icon={AlertTriangle} />
        <SignalList values={result.lacunas} tone="gap" icon={CircleHelp} />
      </div>

      {!compact && result.indicadores.length > 0 && (
        <div className="mt-3 rounded-xl border border-aletis-borda bg-aletis-bege/25 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-soft)]"><Sparkles className="h-3.5 w-3.5 text-aletis-dourado" />Indicadores extraídos</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {result.indicadores.slice(0, 6).map((indicator) => <div key={`${indicator.nome}-${indicator.valor}`} className="rounded-lg bg-card px-2.5 py-2 text-[11px]"><span className="block text-muted-foreground">{indicator.nome}</span><strong className="text-foreground">{indicator.valor}{indicator.unidade ? ` ${indicator.unidade}` : ''}</strong></div>)}
          </div>
        </div>
      )}
      {result.aviso && <p className="mt-2 text-[10px] text-amber-700">{result.aviso}</p>}
    </section>
  )
}

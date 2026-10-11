import PageHeader from '../components/ui/PageHeader'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  FileText,
  FolderOpen,
  Landmark,
  Loader2,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

const ClienteIntelligentIntake = lazy(() => import('../components/cliente/workspace/ClienteIntelligentIntake'))

type Priority = 'critica' | 'alta' | 'media' | 'baixa'

type OperationalDossier = {
  clienteId: string
  atualizadoEm: string
  cliente: {
    id: string
    nome: string
    estagio?: string
    consultor?: string
    credor?: string
    cidade?: string
    uf?: string
    valorTotalDivida: number
    grupoFamiliarTotal: number
  }
  qualidade: { score: number; nivel: 'excelente' | 'boa' | 'atencao' | 'critica'; resumo: string }
  documentos: {
    total: number
    porGrupo: Record<string, number>
    faltantes: string[]
    revisao: Array<{ id: string; nome: string; motivo: string }>
    principais: Array<{ id: string; nome: string; grupoDocumento: string; categoriaInteligente: string; prioridade: string; resumoIa?: string; enviadoEm?: string }>
  }
  propostas: { total: number; abertas: number; valorTotal: number; itens: Array<{ id: string; titulo: string; status?: string; credor?: string; valor?: number }> }
  demandas: { total: number; ativas: number; urgentes: number; atrasadas: number; semResponsavel: number; checklistPendentes: number; itens: Array<{ id: string; codigo: string; titulo: string; status: string; prioridade: string; responsavel?: string; credor?: string; prazoAlvo?: string; proximaAcao?: string; proximaAcaoEm?: string; checklistPendentes: number }> }
  core: { tarefasPendentes: number; tarefasAtrasadas: number; reunioesFuturas: number; contratosAtivos: number; eventosTimeline: number }
  modulos: { farms: number; gestaoFinanceira: number }
  pendencias: Array<{ id: string; area: 'cadastro' | 'documentos' | 'financeiro' | 'negociacao' | 'agenda' | 'processo' | 'ia'; prioridade: Priority; titulo: string; detalhe: string; acaoSugerida: string }>
  proximasAcoes: Array<{ titulo: string; detalhe: string; area: string; prioridade: Priority }>
}

const GROUPS = [
  { key: 'cadastro', label: 'Cadastro', hint: 'Identificação e grupo' },
  { key: 'financeiro', label: 'Financeiro', hint: 'Dívidas, extratos e balanços' },
  { key: 'patrimonio', label: 'Patrimônio rural', hint: 'Matrículas, CAR e ITR' },
  { key: 'juridico', label: 'Jurídico', hint: 'Contratos e processos' },
  { key: 'operacional', label: 'Operacional', hint: 'Produção e evidências' },
] as const

function resolveApiId(id: string): string {
  if (id === 'ailton-caeiro') return 'cli-001'
  if (id === 'paulo-luciano') return 'cli-002'
  return id
}

function money(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value || 0)
}

function relativeDate(value?: string): string {
  if (!value) return 'sem data'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function priorityClass(priority: Priority | string): string {
  if (priority === 'critica') return 'border-red-200 bg-red-50 text-red-800'
  if (priority === 'alta') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (priority === 'media') return 'border-sky-200 bg-sky-50 text-sky-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function destinationFor(area: OperationalDossier['pendencias'][number]['area']): string {
  if (area === 'documentos') return 'workflow'
  if (area === 'negociacao') return 'negociacao'
  if (area === 'financeiro') return 'gestao'
  return 'identidade'
}

function MetricCard({ icon: Icon, label, value, hint, tone = 'neutral' }: { icon: typeof FileText; label: string; value: string; hint: string; tone?: 'good' | 'warn' | 'critical' | 'neutral' }) {
  const colors = {
    good: 'border-emerald-200 bg-emerald-50/60 text-emerald-800',
    warn: 'border-amber-200 bg-amber-50/60 text-amber-800',
    critical: 'border-red-200 bg-red-50/60 text-red-800',
    neutral: 'border-aletis-borda bg-card text-foreground',
  }
  return (
    <article className={`rounded-lg border p-4 ${colors[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</p>
          <p className="mt-1 text-2xl font-display font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-[11px] leading-snug opacity-80">{hint}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70"><Icon className="h-4 w-4" /></span>
      </div>
    </article>
  )
}

export default function ClienteDossieVivo() {
  const { id = '' } = useParams<{ id: string }>()
  const apiId = resolveApiId(id)
  const [dossier, setDossier] = useState<OperationalDossier | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDossier(await apiFetch<OperationalDossier>(`/clientes/${encodeURIComponent(apiId)}/dossie-operacional`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o Dossiê Vivo.')
    } finally {
      setLoading(false)
    }
  }, [apiId])

  useEffect(() => { void load() }, [load])

  const healthTone = useMemo(() => {
    if (!dossier) return 'neutral' as const
    if (dossier.qualidade.score >= 70) return 'good' as const
    if (dossier.qualidade.score >= 45) return 'warn' as const
    return 'critical' as const
  }, [dossier])

  if (loading && !dossier) {
    return <div className="flex min-h-[55dvh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-foreground" /></div>
  }

  if (!dossier) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link to={`/clientes/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"><ArrowLeft className="h-4 w-4" />Voltar ao cliente</Link>
        <section className="mt-5 rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <CircleAlert className="h-5 w-5" /><h1 className="mt-3 text-lg font-display font-semibold">Dossiê Vivo indisponível</h1>
          <p className="mt-1 text-sm">{error || 'Ainda não foi possível obter a visão operacional deste cliente.'}</p>
          <button type="button" onClick={() => void load()} className="mt-4 rounded-xl bg-red-700 px-3 py-2 text-xs font-semibold text-white">Tentar novamente</button>
        </section>
      </main>
    )
  }

  const topAction = dossier.proximasAcoes[0]
  return (
    <main className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 lg:px-6 lg:py-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={`/clientes/${id}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-aletis-borda bg-card text-[var(--text-soft)] hover:bg-aletis-bege" aria-label="Voltar ao cliente"><ArrowLeft className="h-4 w-4" /></Link>
          <PageHeader className="!mb-0" title={<>Dossiê Vivo</>} eyebrow={<> <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">CRM · Inteligência operacional</p> </>} />
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground sm:block">Atualizado {relativeDate(dossier.atualizadoEm)}</span>
          <button type="button" onClick={() => setIntakeOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-aletis-verde px-3 text-xs font-semibold text-white hover:bg-aletis-verde-escuro"><FileText className="h-3.5 w-3.5" />Entrada IA</button>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 text-xs font-semibold text-foreground hover:bg-aletis-bege disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Atualizar</button>
          <Link to={`/clientes/${id}/dossie`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 text-xs font-semibold text-foreground hover:bg-aletis-bege"><ClipboardList className="h-3.5 w-3.5" />Dossiê canônico</Link>
        </div>
      </header>

      <section className="ui-panel p-5 lg:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(250px,0.7fr)] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Visão executiva do cliente</p>
            <h2 className="mt-2 text-2xl font-display font-semibold tracking-tight sm:text-2xl">{dossier.cliente.nome}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{dossier.qualidade.resumo}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {dossier.cliente.estagio && <span className="rounded-full border border-border bg-muted px-3 py-1.5">Etapa: {dossier.cliente.estagio}</span>}
              {dossier.cliente.credor && <span className="rounded-full border border-border bg-muted px-3 py-1.5">Credor: {dossier.cliente.credor}</span>}
              {(dossier.cliente.cidade || dossier.cliente.uf) && <span className="rounded-full border border-border bg-muted px-3 py-1.5">{[dossier.cliente.cidade, dossier.cliente.uf].filter(Boolean).join(' · ')}</span>}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted p-4 ">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Qualidade da base</p>
            <div className="mt-2 flex items-end gap-2"><strong className="text-4xl font-display leading-none">{dossier.qualidade.score}</strong><span className="pb-1 text-sm text-muted-foreground">/100 · {dossier.qualidade.nivel}</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-aletis-dourado" style={{ width: `${dossier.qualidade.score}%` }} /></div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Dados consolidados do CRM, cofre documental, propostas, demandas e agenda.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Sparkles} label="Qualidade" value={`${dossier.qualidade.score}%`} hint={dossier.qualidade.nivel} tone={healthTone} />
        <MetricCard icon={FileText} label="Documentos" value={`${dossier.documentos.total}`} hint={dossier.documentos.faltantes.length ? `${dossier.documentos.faltantes.length} bloco(s) pendente(s)` : 'cobertura mínima atendida'} tone={dossier.documentos.faltantes.length ? 'warn' : 'good'} />
        <MetricCard icon={Landmark} label="Propostas" value={money(dossier.propostas.valorTotal)} hint={`${dossier.propostas.total} cadastrada(s) · ${dossier.propostas.abertas} aberta(s)`} />
        <MetricCard icon={BriefcaseBusiness} label="Demandas" value={`${dossier.demandas.ativas}`} hint={`${dossier.demandas.urgentes} urgente(s) · ${dossier.demandas.checklistPendentes} item(ns) no checklist`} tone={dossier.demandas.urgentes ? 'critical' : 'neutral'} />
        <MetricCard icon={CalendarClock} label="Controle" value={`${dossier.core.tarefasPendentes}`} hint={`${dossier.core.tarefasAtrasadas} tarefa(s) atrasada(s) · ${dossier.core.reunioesFuturas} reunião(ões)`} tone={dossier.core.tarefasAtrasadas ? 'critical' : 'good'} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="space-y-5">
          <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wider text-foreground">Cobertura documental</p><h2 className="mt-1 text-lg font-display font-semibold text-foreground">O que já sustenta a análise</h2></div><Link to={`/clientes/${id}?area=workflow`} className="inline-flex items-center gap-1.5 rounded-xl border border-aletis-borda px-3 py-2 text-xs font-semibold text-foreground hover:bg-aletis-bege">Abrir cofre <ArrowRight className="h-3.5 w-3.5" /></Link></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {GROUPS.map((group) => {
                const count = dossier.documentos.porGrupo[group.key] || 0
                const missing = dossier.documentos.faltantes.some((value) => value.toLocaleLowerCase('pt-BR').includes(group.label.toLocaleLowerCase('pt-BR').replace(' rural', '')))
                return <div key={group.key} className={`rounded-xl border p-3 ${missing ? 'border-amber-200 bg-amber-50' : count ? 'border-emerald-200 bg-emerald-50/50' : 'border-aletis-borda bg-aletis-bege/40'}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-foreground">{group.label}</p>{missing ? <AlertTriangle className="h-3.5 w-3.5 text-amber-700" /> : count ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" /> : <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />}</div><p className="mt-2 text-xl font-display font-semibold text-foreground">{count}</p><p className="mt-1 text-[11px] leading-snug text-muted-foreground">{missing ? 'Bloco pendente' : group.hint}</p></div>
              })}
            </div>
            {dossier.documentos.principais.length > 0 && <div className="mt-5 overflow-hidden rounded-xl border border-aletis-borda"><div className="border-b border-aletis-borda bg-aletis-bege/40 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-soft)]">Evidências prioritárias</div>{dossier.documentos.principais.slice(0, 5).map((doc) => <div key={doc.id} className="flex items-center gap-3 border-b border-aletis-borda/70 px-3 py-2.5 last:border-b-0"><FileText className="h-4 w-4 shrink-0 text-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-foreground">{doc.nome}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{doc.grupoDocumento} · {doc.categoriaInteligente} · {relativeDate(doc.enviadoEm)}</p></div><span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${priorityClass(doc.prioridade)}`}>{doc.prioridade}</span></div>)}</div>}
          </section>

          <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wider text-foreground">Negociação e execução</p><h2 className="mt-1 text-lg font-display font-semibold text-foreground">Demandas que precisam de condução</h2></div><Link to={`/clientes/${id}?area=negociacao`} className="inline-flex items-center gap-1.5 rounded-xl border border-aletis-borda px-3 py-2 text-xs font-semibold text-foreground hover:bg-aletis-bege">Abrir negociação <ArrowRight className="h-3.5 w-3.5" /></Link></div>
            <div className="mt-4 space-y-2">{dossier.demandas.itens.slice(0, 6).map((item) => <article key={item.id} className="grid gap-2 rounded-xl border border-aletis-borda p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] font-bold text-foreground">{item.codigo}</span><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${priorityClass(item.prioridade)}`}>{item.prioridade}</span></div><p className="mt-1 truncate text-xs font-semibold text-foreground">{item.titulo}</p><p className="mt-1 text-[11px] text-[var(--text-soft)]">{item.responsavel || 'Sem responsável'} · {item.proximaAcao || 'Próxima ação não definida'}{item.proximaAcaoEm ? ` · ${relativeDate(item.proximaAcaoEm)}` : ''}</p></div><span className="text-[11px] font-semibold text-[var(--text-soft)]">{item.checklistPendentes} pendência(s)</span></article>)}{!dossier.demandas.itens.length && <p className="rounded-xl bg-aletis-bege/50 p-4 text-sm text-[var(--text-soft)]">Não há demandas vinculadas para este cliente.</p>}</div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-aletis-dourado/30 bg-aletis-bege/40 p-4 shadow-none sm:p-5"><div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aletis-dourado/15 text-aletis-dourado"><Sparkles className="h-5 w-5" /></span><div><p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-soft)]">Próxima melhor ação</p><h2 className="mt-1 text-base font-display font-semibold leading-snug text-foreground">{topAction?.titulo || 'Revisar a base operacional do cliente'}</h2></div></div><p className="mt-3 text-xs leading-relaxed text-[var(--text-soft)]">{topAction?.detalhe || 'Use os dados consolidados para definir uma próxima ação rastreável.'}</p><Link to={`/clientes/${id}?area=${destinationFor((topAction?.area || 'agenda') as OperationalDossier['pendencias'][number]['area'])}`} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-aletis-verde px-3.5 py-2 text-xs font-semibold text-white hover:bg-aletis-verde-escuro">Executar no CRM <ArrowRight className="h-3.5 w-3.5" /></Link></section>

          <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none sm:p-5"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-700" /><h2 className="text-base font-display font-semibold text-foreground">Pendências 360</h2></div><div className="mt-3 space-y-2">{dossier.pendencias.slice(0, 6).map((item) => <Link key={item.id} to={`/clientes/${id}?area=${destinationFor(item.area)}`} className="block rounded-xl border border-aletis-borda p-3 transition hover:border-aletis-verde/40 hover:bg-aletis-bege/35"><div className="flex items-start gap-2"><span className={`mt-0.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${priorityClass(item.prioridade)}`}>{item.prioridade}</span><p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-foreground">{item.titulo}</p></div><p className="mt-2 text-[11px] leading-relaxed text-[var(--text-soft)]">{item.acaoSugerida}</p></Link>)}{!dossier.pendencias.length && <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">Nenhuma pendência automática relevante no momento.</p>}</div></section>

          <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none sm:p-5"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-foreground" /><h2 className="text-base font-display font-semibold text-foreground">Contexto do atendimento</h2></div><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Consultor</dt><dd className="mt-1 font-semibold text-foreground">{dossier.cliente.consultor || 'Não definido'}</dd></div><div><dt className="text-muted-foreground">Grupo relacionado</dt><dd className="mt-1 font-semibold text-foreground">{dossier.cliente.grupoFamiliarTotal} pessoa(s)</dd></div><div><dt className="text-muted-foreground">Fazendas</dt><dd className="mt-1 font-semibold text-foreground">{dossier.modulos.farms}</dd></div><div><dt className="text-muted-foreground">Gestão financeira</dt><dd className="mt-1 font-semibold text-foreground">{dossier.modulos.gestaoFinanceira ? 'Estruturada' : 'Pendente'}</dd></div></dl><p className="mt-4 border-t border-aletis-borda pt-3 text-[11px] leading-relaxed text-muted-foreground">Fonte: CRM ALETIS, cofre documental, propostas, demandas e agenda. Atualize a página após cadastrar ou revisar informações.</p></section>
        </aside>
      </section>
      {intakeOpen && (
        <Suspense fallback={null}>
          <ClienteIntelligentIntake
            clienteId={apiId}
            clienteNome={dossier.cliente.nome}
            urlId={id}
            onClose={() => setIntakeOpen(false)}
            onReload={load}
          />
        </Suspense>
      )}
    </main>
  )
}

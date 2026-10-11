// ============================================================
// PulseSection — home de comando do cliente.
// Tudo importante em UMA tela: alertas críticos, próxima ação,
// top recomendações, últimas mudanças, próximos vencimentos,
// KPIs detalhados.
// ============================================================
import { useEffect, useState, useMemo } from 'react'
import { apiFetch } from '../../../hooks/useApi'
import {
  AlertTriangle,
  CalendarClock,
  Flag,
  Lightbulb,
  History,
  MessageSquare,
  TrendingUp,
  Save,
  X,
  Loader2,
  Sparkles,
  ArrowRight,
  Compass,
} from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'
import type { WorkspaceArea } from './WorkspaceShell'
import StageBadge from './StageBadge'
import { fmtBRL, fmtBRLCompact, fmtData, fmtDataHora, diasAteVencimento } from './utils'

interface Props {
  data: UseClienteDataReturn
  onNavigate: (area: WorkspaceArea) => void
}

interface ChangelogItem {
  id: number
  entidade: string
  acao: string
  ator?: string | null
  atorNome?: string | null
  criadoEm: string
}

interface ComentarioRaw {
  id: string
  entidade: string
  conteudo: string
  autorNome?: string | null
  resolvido: boolean
  criadoEm: string
}

function diasDesde(iso?: string): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

export default function PulseSection({ data, onNavigate }: Props) {
  const { cliente, analises, srai, abs, recalcularAnalises, recalculando, apiId } = data
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [changelog, setChangelog] = useState<ChangelogItem[]>([])
  const [comentarios, setComentarios] = useState<ComentarioRaw[]>([])

  useEffect(() => {
    if (!apiId) return
    apiFetch<{ grupos: Array<{ id: string }> }>(`/gestao-financeira/grupos?clienteId=${apiId}`)
      .then((r) => {
        if (r.grupos?.[0]) setGrupoId(r.grupos[0].id)
      })
      .catch(() => {})
  }, [apiId])

  useEffect(() => {
    if (!grupoId) return
    apiFetch<{ mudancas: ChangelogItem[] }>(`/gestao-financeira/grupos/${grupoId}/changelog`)
      .then((r) => setChangelog(r.mudancas.slice(0, 5)))
      .catch(() => {})
    apiFetch<{ threads: Array<ComentarioRaw> }>(`/gestao-financeira/grupos/${grupoId}/comentarios`)
      .then((r) => setComentarios((r.threads ?? []).filter((t) => !t.resolvido).slice(0, 5)))
      .catch(() => {})
  }, [grupoId])

  if (!cliente) return null

  // Próximos vencimentos: usa as dívidas com vencimento conhecido + ordena por proximidade
  const proximosVencimentos = useMemo(() => {
    return cliente.dividas
      .filter((d) => d.vencimento)
      .map((d) => ({ ...d, dias: diasAteVencimento(d.vencimento) }))
      .filter((d) => d.dias != null)
      .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
      .slice(0, 4)
  }, [cliente.dividas])

  const alertas = analises?.alertasTop?.filter((a) => a.nivel === 'critico' || a.nivel === 'alto') ?? []
  const recs = (analises?.recomendacoes ?? []).slice(0, 4)
  const dividasAtrasadas = cliente.dividas.filter((d) => d.status === 'atrasada').length
  const proxAcao = cliente.proximaAcao
  const diasSemAtualizacao = diasDesde(cliente.ultimaAtualizacao)
  const principalRisco =
    alertas[0]?.mensagem ||
    (dividasAtrasadas > 0 ? `${dividasAtrasadas} contrato(s) em atraso` : null) ||
    (diasSemAtualizacao != null && diasSemAtualizacao >= 30 ? `Sem atualização há ${diasSemAtualizacao} dias` : 'Sem risco crítico destacado')
  const oportunidade =
    abs?.nivelElegibilidade === 'integral'
      ? 'Elegibilidade AB+S integral para reestruturação'
      : recs[0]?.titulo || 'Definir próxima ação comercial'
  const proximosPassos = [
    proxAcao ? `${fmtData(proxAcao.data)} · ${proxAcao.descricao}` : 'Definir próxima ação com data e responsável',
    recs[0]?.acao || 'Revisar diagnóstico financeiro antes do próximo contato',
    cliente.dividas.length > 0 ? 'Validar credores, saldos e garantias do dossiê' : 'Cadastrar dívidas e documentos base',
  ]

  return (
    <div className="space-y-5 animate-fade-in">
<div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ProximaAcaoCard
          acao={proxAcao}
          onSave={async (a) => data.setProximaAcao(a)}
        />

        <div className="ui-panel p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-aletis-dourado" />
            <h3 className="text-sm font-display font-semibold text-foreground">Recomendações priorizadas</h3>
            <span className="text-[11px] text-muted-foreground ml-auto">{recs.length} disponíveis</span>
          </div>
          {recs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Nenhuma recomendação ainda. {analises ? '' : 'Recalcule as análises para gerar.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {recs.map((r) => (
                <li key={r.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-aletis-bege/30">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider flex-shrink-0 ${
                    r.prioridade === 'p1' ? 'bg-red-100 text-red-700' :
                    r.prioridade === 'p2' ? 'bg-amber-100 text-amber-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {r.prioridade}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-body font-semibold text-foreground">{r.titulo}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{r.acao}</p>
                    {r.impactoEstimado && (
                      <p className="text-[11px] text-foreground mt-0.5 font-mono">→ {r.impactoEstimado}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-aletis-grafite-claro/60 uppercase font-mono flex-shrink-0">{r.categoria}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {/* Resumo 360 — leitura executiva antes das abas */}


      {/* TOP STRIP — alertas críticos sempre visíveis */}
      {alertas.length > 0 && (
        <div className="rounded-xl border-l-4 border-red-500 bg-red-50/60 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-display font-semibold text-red-900">{alertas.length} alerta(s) crítico(s)</h3>
            <button
              onClick={recalcularAnalises}
              disabled={recalculando}
              className="ml-auto text-[11px] text-red-800 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
            >
              {recalculando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {recalculando ? 'Recalculando…' : 'Recalcular'}
            </button>
          </div>
          <ul className="space-y-1 text-xs text-red-900">
            {alertas.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono uppercase text-[11px] tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex-shrink-0">
                  {a.origem}
                </span>
                <span>{a.mensagem}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grid principal: 2 colunas, próxima ação + recomendações */}


      {/* KPIs profundos */}
      <details className="ui-panel p-4"><summary className="cursor-pointer text-sm font-semibold text-foreground">Panorama financeiro e recomendações de estratégia</summary><div className="mt-4 space-y-4">
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-aletis-verde/10">
                <Sparkles className="w-4 h-4 text-foreground" />
              </span>
              <h2 className="text-sm font-display font-semibold text-foreground">Resumo 360</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              Situação executiva do cliente para decidir o próximo movimento.
            </p>
          </div>
          <div className="grid flex-1 gap-3 md:grid-cols-2">
            <SummaryBox label="Exposição" value={fmtBRLCompact(cliente.resumoFinanceiro.totalDivida)} sub={`${cliente.credor} · ${cliente.estagio}`} tone="bad" />
            <SummaryBox label="Risco principal" value={principalRisco} sub={srai?.classificacao ? `SRAI ${srai.scoreTotal} · ${srai.classificacao}` : 'sem SRAI'} tone={principalRisco === 'Sem risco crítico destacado' ? 'good' : 'warn'} />
            <SummaryBox label="Oportunidade" value={oportunidade} sub={analises?.margemCliente ? `margem ${analises.margemCliente.margemPct.toFixed(1)}%` : 'sem margem'} tone="good" />
            <SummaryBox label="Cadência" value={proxAcao ? fmtData(proxAcao.data) : 'Sem próxima ação'} sub={diasSemAtualizacao != null ? `${diasSemAtualizacao}d sem atualização` : 'sem histórico'} tone={proxAcao ? 'good' : 'bad'} />
          </div>
        </div>
        <div className="mt-4 grid md:grid-cols-3 gap-2">
          {proximosPassos.map((p, i) => (
            <div key={i} className="rounded-xl border border-aletis-borda bg-aletis-bege/20 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Próximo passo {i + 1}</p>
              <p className="text-xs text-foreground leading-snug">{p}</p>
            </div>
          ))}
        </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-3 gap-2">
        <KpiTile label="Dívida total" value={fmtBRLCompact(cliente.resumoFinanceiro.totalDivida)} accent="bad" />
        <KpiTile label="Pago" value={fmtBRLCompact(cliente.resumoFinanceiro.totalPago)} accent="good" />
        <KpiTile label="Pendente" value={fmtBRLCompact(cliente.resumoFinanceiro.pendente)} accent="warn" />
        <KpiTile label="Atrasadas" value={String(dividasAtrasadas)} sub={`de ${cliente.dividas.length} contratos`} accent={dividasAtrasadas > 0 ? 'bad' : 'good'} />
        <KpiTile
          label="SRAI"
          value={srai ? `${srai.scoreTotal}` : '—'}
          sub={srai?.classificacao ?? 'sem score'}
          accent={srai?.classificacao === 'critico' ? 'bad' : srai?.classificacao === 'alto' ? 'warn' : 'good'}
        />
        <KpiTile
          label="AB+S"
          value={abs ? `${abs.scorePercentual}%` : '—'}
          sub={abs?.nivelElegibilidade ?? 'não-avaliado'}
          accent={abs?.nivelElegibilidade === 'inelegivel' ? 'bad' : abs?.nivelElegibilidade === 'integral' ? 'good' : 'warn'}
        />
      </div></div></details>

      {/* Grid inferior: vencimentos + atividade recente */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Próximos vencimentos */}
        <div className="ui-panel p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-display font-semibold text-foreground">Próximos vencimentos</h3>
          </div>
          {proximosVencimentos.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Sem vencimentos cadastrados.</p>
          ) : (
            <ul className="space-y-2">
              {proximosVencimentos.map((d) => (
                <li key={d.id} className="flex items-baseline gap-2 text-xs">
                  <span className={`font-mono text-[11px] font-bold flex-shrink-0 ${
                    (d.dias ?? 0) < 0 ? 'text-red-700' : (d.dias ?? 0) < 30 ? 'text-amber-700' : 'text-[var(--text-soft)]'
                  }`}>
                    {d.dias != null && d.dias < 0 ? `${Math.abs(d.dias)}d atraso` : d.dias != null ? `${d.dias}d` : '—'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{d.credor}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{d.contrato}</p>
                  </div>
                  <span className="text-[11px] tabular-nums text-[var(--text-soft)] flex-shrink-0">{fmtBRLCompact(d.valorAtual)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Últimas mudanças (changelog) */}
        <div className="ui-panel p-5">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-display font-semibold text-foreground">Últimas mudanças</h3>
            {grupoId && (
              <button
                onClick={() => onNavigate('workflow')}
                className="ml-auto text-[11px] text-foreground hover:underline"
              >
                ver tudo →
              </button>
            )}
          </div>
          {!grupoId ? (
            <EmptyHint text="Crie o grupo de gestão financeira para auditar mudanças." />
          ) : changelog.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Sem mudanças registradas.</p>
          ) : (
            <ul className="space-y-1.5">
              {changelog.map((c) => (
                <li key={c.id} className="flex items-baseline gap-2 text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase flex-shrink-0 ${
                    c.acao === 'create' ? 'bg-emerald-100 text-emerald-700' :
                    c.acao === 'delete' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {c.acao}
                  </span>
                  <span className="font-mono text-[var(--text-soft)]">{c.entidade}</span>
                  <span className="text-muted-foreground flex-1 truncate">por {c.atorNome ?? c.ator ?? 'sistema'}</span>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0">{fmtData(c.criadoEm)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Conversas pendentes */}
        <div className="ui-panel p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-foreground" />
            <h3 className="text-sm font-display font-semibold text-foreground">Pendências de equipe</h3>
            {grupoId && (
              <button
                onClick={() => onNavigate('workflow')}
                className="ml-auto text-[11px] text-foreground hover:underline"
              >
                ver tudo →
              </button>
            )}
          </div>
          {!grupoId ? (
            <EmptyHint text="Comentários colaborativos aparecem aqui assim que houver grupo GF." />
          ) : comentarios.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">✓ tudo resolvido</p>
          ) : (
            <ul className="space-y-2">
              {comentarios.map((c) => (
                <li key={c.id} className="rounded-lg bg-aletis-bege/40 px-2 py-1.5">
                  <div className="flex items-baseline gap-2 text-[11px]">
                    <span className="font-mono text-muted-foreground">📌 {c.entidade}</span>
                    <span className="font-semibold">{c.autorNome ?? 'Anônimo'}</span>
                    <span className="text-muted-foreground ml-auto">{fmtData(c.criadoEm)}</span>
                  </div>
                  <p className="text-xs mt-0.5 line-clamp-2">{c.conteudo}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Próximos Passos Inteligentes — guia contextual por estágio */}
      <ProximosPassosInteligentes cliente={cliente} onNavigate={onNavigate} />
    </div>
  )
}

function KpiTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'good' | 'warn' | 'bad' }) {
  const ring =
    accent === 'good' ? 'ring-emerald-200 bg-emerald-50/30' :
    accent === 'warn' ? 'ring-amber-200 bg-amber-50/30' :
    accent === 'bad' ? 'ring-red-200 bg-red-50/30' :
    'ring-aletis-borda bg-card'
  return (
    <div className={`rounded-lg ring-1 px-3 py-2 ${ring}`}>
      <p className="text-[11px] font-body uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-display font-semibold text-foreground tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
    </div>
  )
}

function SummaryBox({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'good' | 'warn' | 'bad' }) {
  const color =
    tone === 'good' ? 'border-emerald-200 bg-emerald-50/30' :
    tone === 'warn' ? 'border-amber-200 bg-amber-50/30' :
    'border-red-200 bg-red-50/30'
  return (
    <div className={`rounded-lg border px-3 py-2 min-w-0 ${color}`}>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className="text-sm font-body font-bold text-foreground mt-1 leading-snug line-clamp-2" title={value}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={sub}>{sub}</p>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function ProximosPassosInteligentes({
  cliente,
  onNavigate,
}: {
  cliente: UseClienteDataReturn['cliente']
  onNavigate: (area: WorkspaceArea) => void
}) {
  const estagio = cliente?.estagio ?? 'lead'

  const recomendacoes: Record<
    string,
    { area: WorkspaceArea; titulo: string; descricao: string; cor: string }
  > = {
    lead: {
      area: 'identidade',
      titulo: 'Qualificar o cliente',
      descricao: 'Complete os dados pessoais, a propriedade e o patrimônio na área Cadastro.',
      cor: 'border-blue-400 bg-blue-50/40',
    },
    prospeccao: {
      area: 'identidade',
      titulo: 'Estruturar a ficha do cliente',
      descricao: 'Cadastre terra, culturas, CAR e dados do grupo familiar em Cadastro.',
      cor: 'border-blue-400 bg-blue-50/40',
    },
    qualificacao: {
      area: 'identidade',
      titulo: 'Qualificação em andamento',
      descricao: 'Valide documentos, CPF/CNPJ e relações comerciais antes de avançar.',
      cor: 'border-blue-400 bg-blue-50/40',
    },
    analise: {
      area: 'diagnostico',
      titulo: 'Iniciar diagnóstico financeiro',
      descricao: 'Use o Guia do Consultor em Diagnóstico para estruturar os dados financeiros.',
      cor: 'border-purple-400 bg-purple-50/40',
    },
    proposta: {
      area: 'diagnostico',
      titulo: 'Refinar a proposta com dados',
      descricao: 'Certifique-se de que custos, endividamento e margens estão atualizados no Diagnóstico.',
      cor: 'border-purple-400 bg-purple-50/40',
    },
    negociacao: {
      area: 'negociacao',
      titulo: 'Acompanhar negociações',
      descricao: 'Monitore propostas, contrapropostas e status da Deal Room em Negociação.',
      cor: 'border-emerald-400 bg-emerald-50/40',
    },
    acordo: {
      area: 'negociacao',
      titulo: 'Formalizar o acordo',
      descricao: 'Finalizar contratos e documentos oficiais na área de Negociação.',
      cor: 'border-emerald-400 bg-emerald-50/40',
    },
    acompanhamento: {
      area: 'workflow',
      titulo: 'Acompanhar execução',
      descricao: 'Verifique documentos pendentes, histórico e comunicação em Documentos e processos.',
      cor: 'border-aletis-grafite-claro bg-aletis-bege/30',
    },
    concluido: {
      area: 'workflow',
      titulo: 'Cliente concluído',
      descricao: 'Verifique documentação final e arquive o processo em Documentos e processos.',
      cor: 'border-aletis-grafite-claro bg-aletis-bege/30',
    },
    encerrado: {
      area: 'workflow',
      titulo: 'Cliente encerrado',
      descricao: 'Processo encerrado. Reveja histórico e lições aprendidas em Documentos e processos.',
      cor: 'border-aletis-grafite-claro bg-aletis-bege/30',
    },
  }

  const rec = recomendacoes[estagio] ?? recomendacoes['lead']

  return (
    <div className={`rounded-lg border-l-4 ${rec.cor} p-4 bg-card`}>
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2 md:w-64">
          <Compass className="w-4 h-4 text-aletis-dourado flex-shrink-0" />
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              Próximo passo sugerido
            </p>
            <p className="text-xs text-[var(--text-soft)]">
              Etapa: <StageBadge estagio={cliente?.estagio ?? 'lead'} />
            </p>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-body font-semibold text-foreground">{rec.titulo}</p>
          <p className="text-xs text-[var(--text-soft)] leading-snug">{rec.descricao}</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate(rec.area)}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-aletis-verde-escuro transition-colors"
        >
          Abrir {({ identidade: 'Cadastro', diagnostico: 'Diagnóstico', negociacao: 'Negociação', workflow: 'Documentos e processos' } as Partial<Record<WorkspaceArea, string>>)[rec.area] ?? 'área sugerida'}
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground text-center py-4 italic">{text}</p>
}

// ────────────────────────────────────────────────────────────
function ProximaAcaoCard({ acao, onSave }: { acao: { data: string; descricao: string } | null; onSave: (a: { data: string; descricao: string } | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ data: acao?.data ?? '', descricao: acao?.descricao ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function salvar() {
    if (!form.data || !form.descricao.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ data: form.data, descricao: form.descricao.trim() })
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a próxima ação.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ui-panel p-5 border-t-2 border-t-aletis-dourado">
      <div className="flex items-center gap-2 mb-2">
        <Flag className="w-4 h-4 text-aletis-dourado" />
        <h3 className="text-sm font-display font-semibold text-foreground">Próxima ação</h3>
        {!editing && (
          <button
            onClick={() => { setForm({ data: acao?.data ?? '', descricao: acao?.descricao ?? '' }); setEditing(true) }}
            className="ui-button ui-button--secondary ml-auto !px-3 !py-1.5 !text-xs"
          >
            {acao ? 'Editar ação' : 'Definir ação'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <input
            type="date"
            aria-label="Data da próxima ação"
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
            className="w-full px-2 py-1.5 rounded border border-aletis-borda text-xs"
          />
          <textarea
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            aria-label="Descrição da próxima ação"
            placeholder="Ex: ligar pro Sicoob para aprovar nova proposta"
            rows={2}
            className="w-full px-2 py-1.5 rounded border border-aletis-borda text-xs resize-none"
            autoFocus
          />
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={salvar}
              disabled={saving || !form.data || !form.descricao.trim()}
              className="flex-1 px-2 py-1 rounded bg-aletis-verde text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Salvar
            </button>
            <button
              aria-label="Cancelar edição da próxima ação"
              onClick={() => setEditing(false)}
              className="px-2 py-1 rounded text-[11px] text-muted-foreground hover:bg-aletis-grafite-escuro/5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : acao ? (
        <div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-aletis-dourado-escuro">
            {fmtData(acao.data)}
          </p>
          <p className="text-sm font-body text-foreground mt-2 leading-relaxed">{acao.descricao}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic py-2">Nenhuma ação programada.</p>
      )}
    </div>
  )
}

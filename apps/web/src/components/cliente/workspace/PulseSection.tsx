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
} from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'
import type { WorkspaceArea } from './WorkspaceShell'
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

  return (
    <div className="space-y-4 animate-fade-in">
      {/* TOP STRIP — alertas críticos sempre visíveis */}
      {alertas.length > 0 && (
        <div className="rounded-xl border-l-4 border-red-500 bg-red-50/60 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-display font-bold text-red-900">{alertas.length} alerta(s) crítico(s)</h3>
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
            {alertas.slice(0, 3).map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono uppercase text-[9px] tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex-shrink-0">
                  {a.origem}
                </span>
                <span>{a.mensagem}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grid principal: 2 colunas, próxima ação + recomendações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ProximaAcaoCard
          acao={proxAcao}
          onSave={async (a) => data.setProximaAcao(a)}
        />

        <div className="lg:col-span-2 card-premium p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-aletis-dourado" />
            <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Recomendações priorizadas</h3>
            <span className="text-[10px] text-aletis-grafite-claro ml-auto">{recs.length} disponíveis</span>
          </div>
          {recs.length === 0 ? (
            <p className="text-xs text-aletis-grafite-claro text-center py-6">
              Nenhuma recomendação ainda. {analises ? '' : 'Recalcule as análises para gerar.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {recs.map((r) => (
                <li key={r.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-aletis-bege/30">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0 ${
                    r.prioridade === 'p1' ? 'bg-red-100 text-red-700' :
                    r.prioridade === 'p2' ? 'bg-amber-100 text-amber-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {r.prioridade}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-body font-semibold text-aletis-grafite-escuro">{r.titulo}</p>
                    <p className="text-[11px] text-aletis-grafite-claro mt-0.5 leading-snug">{r.acao}</p>
                    {r.impactoEstimado && (
                      <p className="text-[10px] text-aletis-verde mt-0.5 font-mono">→ {r.impactoEstimado}</p>
                    )}
                  </div>
                  <span className="text-[9px] text-aletis-grafite-claro/60 uppercase font-mono flex-shrink-0">{r.categoria}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* KPIs profundos */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
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
      </div>

      {/* Grid inferior: vencimentos + atividade recente */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Próximos vencimentos */}
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Próximos vencimentos</h3>
          </div>
          {proximosVencimentos.length === 0 ? (
            <p className="text-xs text-aletis-grafite-claro text-center py-4">Sem vencimentos cadastrados.</p>
          ) : (
            <ul className="space-y-2">
              {proximosVencimentos.map((d) => (
                <li key={d.id} className="flex items-baseline gap-2 text-xs">
                  <span className={`font-mono text-[10px] font-bold flex-shrink-0 ${
                    (d.dias ?? 0) < 0 ? 'text-red-700' : (d.dias ?? 0) < 30 ? 'text-amber-700' : 'text-aletis-grafite-medio'
                  }`}>
                    {d.dias != null && d.dias < 0 ? `${Math.abs(d.dias)}d atraso` : d.dias != null ? `${d.dias}d` : '—'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{d.credor}</p>
                    <p className="text-[10px] text-aletis-grafite-claro truncate">{d.contrato}</p>
                  </div>
                  <span className="text-[10px] tabular-nums text-aletis-grafite-medio flex-shrink-0">{fmtBRLCompact(d.valorAtual)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Últimas mudanças (changelog) */}
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Últimas mudanças</h3>
            {grupoId && (
              <button
                onClick={() => onNavigate('workflow')}
                className="ml-auto text-[10px] text-aletis-verde hover:underline"
              >
                ver tudo →
              </button>
            )}
          </div>
          {!grupoId ? (
            <EmptyHint text="Crie o grupo de gestão financeira para auditar mudanças." />
          ) : changelog.length === 0 ? (
            <p className="text-xs text-aletis-grafite-claro text-center py-4">Sem mudanças registradas.</p>
          ) : (
            <ul className="space-y-1.5">
              {changelog.map((c) => (
                <li key={c.id} className="flex items-baseline gap-2 text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase flex-shrink-0 ${
                    c.acao === 'create' ? 'bg-emerald-100 text-emerald-700' :
                    c.acao === 'delete' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {c.acao}
                  </span>
                  <span className="font-mono text-aletis-grafite-medio">{c.entidade}</span>
                  <span className="text-aletis-grafite-claro flex-1 truncate">por {c.atorNome ?? c.ator ?? 'sistema'}</span>
                  <span className="text-[9px] text-aletis-grafite-claro flex-shrink-0">{fmtData(c.criadoEm)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Conversas pendentes */}
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-aletis-verde" />
            <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Pendências de equipe</h3>
            {grupoId && (
              <button
                onClick={() => onNavigate('workflow')}
                className="ml-auto text-[10px] text-aletis-verde hover:underline"
              >
                ver tudo →
              </button>
            )}
          </div>
          {!grupoId ? (
            <EmptyHint text="Comentários colaborativos aparecem aqui assim que houver grupo GF." />
          ) : comentarios.length === 0 ? (
            <p className="text-xs text-aletis-grafite-claro text-center py-4">✓ tudo resolvido</p>
          ) : (
            <ul className="space-y-2">
              {comentarios.map((c) => (
                <li key={c.id} className="rounded-lg bg-aletis-bege/40 px-2 py-1.5">
                  <div className="flex items-baseline gap-2 text-[10px]">
                    <span className="font-mono text-aletis-grafite-claro">📌 {c.entidade}</span>
                    <span className="font-semibold">{c.autorNome ?? 'Anônimo'}</span>
                    <span className="text-aletis-grafite-claro ml-auto">{fmtData(c.criadoEm)}</span>
                  </div>
                  <p className="text-xs mt-0.5 line-clamp-2">{c.conteudo}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Atalhos para navegar — convida a explorar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <NavTile area="diagnostico" label="Radiografia financeira" onNavigate={onNavigate} />
        <NavTile area="operacao" label="Editar dados estruturados" onNavigate={onNavigate} />
        <NavTile area="negociacao" label="Simular & gerar proposta" onNavigate={onNavigate} />
        <NavTile area="workflow" label="Processo & docs" onNavigate={onNavigate} />
        <NavTile area="identidade" label="Pessoa, terra & patrimônio" onNavigate={onNavigate} />
      </div>
    </div>
  )
}

function KpiTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'good' | 'warn' | 'bad' }) {
  const ring =
    accent === 'good' ? 'ring-emerald-200 bg-emerald-50/30' :
    accent === 'warn' ? 'ring-amber-200 bg-amber-50/30' :
    accent === 'bad' ? 'ring-red-200 bg-red-50/30' :
    'ring-aletis-borda bg-white'
  return (
    <div className={`rounded-lg ring-1 px-3 py-2 ${ring}`}>
      <p className="text-[9px] font-body uppercase tracking-wider text-aletis-grafite-claro">{label}</p>
      <p className="text-base font-display font-bold text-aletis-grafite-escuro tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-aletis-grafite-claro truncate">{sub}</p>}
    </div>
  )
}

function NavTile({ area, label, onNavigate }: { area: WorkspaceArea; label: string; onNavigate: (a: WorkspaceArea) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(area)}
      className="card-premium px-3 py-2 text-left hover:shadow-md transition-all hover:-translate-y-0.5"
    >
      <p className="text-[9px] font-mono uppercase tracking-wider text-aletis-grafite-claro">→ {area}</p>
      <p className="text-xs font-body font-semibold text-aletis-grafite-escuro">{label}</p>
    </button>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-aletis-grafite-claro text-center py-4 italic">{text}</p>
}

// ────────────────────────────────────────────────────────────
function ProximaAcaoCard({ acao, onSave }: { acao: { data: string; descricao: string } | null; onSave: (a: { data: string; descricao: string } | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ data: acao?.data ?? '', descricao: acao?.descricao ?? '' })
  const [saving, setSaving] = useState(false)

  async function salvar() {
    if (!form.data || !form.descricao.trim()) return
    setSaving(true)
    try {
      await onSave({ data: form.data, descricao: form.descricao.trim() })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card-premium p-4 border-l-4 border-l-aletis-dourado">
      <div className="flex items-center gap-2 mb-2">
        <Flag className="w-4 h-4 text-aletis-dourado" />
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Próxima ação</h3>
        {!editing && (
          <button
            onClick={() => { setForm({ data: acao?.data ?? '', descricao: acao?.descricao ?? '' }); setEditing(true) }}
            className="ml-auto text-[10px] text-aletis-verde hover:underline"
          >
            {acao ? 'editar' : '+ adicionar'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <input
            type="date"
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
            className="w-full px-2 py-1.5 rounded border border-aletis-borda text-xs"
          />
          <textarea
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder="Ex: ligar pro Sicoob para aprovar nova proposta"
            rows={2}
            className="w-full px-2 py-1.5 rounded border border-aletis-borda text-xs resize-none"
            autoFocus
          />
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
              onClick={() => setEditing(false)}
              className="px-2 py-1 rounded text-[11px] text-aletis-grafite-claro hover:bg-aletis-grafite-escuro/5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : acao ? (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-aletis-dourado-escuro">
            {fmtData(acao.data)}
          </p>
          <p className="text-xs font-body text-aletis-grafite-escuro mt-1 leading-snug">{acao.descricao}</p>
        </div>
      ) : (
        <p className="text-xs text-aletis-grafite-claro italic py-2">Nenhuma ação programada.</p>
      )}
    </div>
  )
}

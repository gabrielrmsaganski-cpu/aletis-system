import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiFetch } from '../../hooks/useApi'
import {
  Plus,
  Trash2,
  Save,
  TrendingUp,
  TrendingDown,
  Calculator,
  Calendar,
} from 'lucide-react'

interface Registro {
  id: number
  grupoId: string
  competencia: string
  tipo: 'receita' | 'despesa'
  descricao: string
  categoria: string
  valor: string | number
  dataLancamento?: string | null
  origem?: string
  observacoes?: string | null
}

interface CompetenciaConsol {
  competencia: string
  receitas: number
  despesas: number
  saldo: number
  itens: number
}

interface Props {
  grupoId: string
}

export default function RegistroMensalSection({ grupoId }: Props) {
  const [registros, setRegistros] = useState<Registro[]>([])
  const [competencias, setCompetencias] = useState<CompetenciaConsol[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [activeComp, setActiveComp] = useState<string>('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch<{ competencias: CompetenciaConsol[]; detalhe: Registro[] }>(
        `/gf-registro-mensal/grupo/${grupoId}/consolidado`,
      )
      setCompetencias(r.competencias || [])
      setRegistros(r.detalhe || [])
      if (r.competencias?.length && !activeComp) {
        setActiveComp(r.competencias[r.competencias.length - 1].competencia)
      }
    } catch (e) {
      console.warn('Erro ao carregar registro mensal:', e)
    } finally {
      setLoading(false)
    }
  }, [grupoId, activeComp])

  useEffect(() => { reload() }, [reload])

  const filtered = useMemo(
    () => registros.filter((r) => r.competencia === activeComp),
    [registros, activeComp],
  )

  const receitas = filtered.filter((r) => r.tipo === 'receita')
  const despesas = filtered.filter((r) => r.tipo === 'despesa')
  const totalRec = receitas.reduce((a, r) => a + (Number(r.valor) || 0), 0)
  const totalDesp = despesas.reduce((a, r) => a + (Number(r.valor) || 0), 0)
  const saldo = totalRec - totalDesp

  async function adicionar(tipo: 'receita' | 'despesa') {
    const comp = activeComp || new Date().toISOString().slice(0, 7)
    if (!activeComp) setActiveComp(comp)
    try {
      await apiFetch(`/gf-registro-mensal/grupo/${grupoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia: comp,
          tipo,
          descricao: tipo === 'receita' ? 'Nova receita' : 'Nova despesa',
          categoria: 'geral',
          valor: 0,
        }),
      })
      reload()
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (e) {}
  }

  async function patch(id: number, patch: Partial<Registro>) {
    try {
      await apiFetch(`/gf-registro-mensal/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      setRegistros((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      )
    } catch (e) {}
  }

  async function remover(id: number) {
    if (!confirm('Remover este lançamento?')) return
    try {
      await apiFetch(`/gf-registro-mensal/${id}`, { method: 'DELETE' })
      reload()
    } catch (e) {}
  }

  function ensureCompetencia() {
    const comp = activeComp || new Date().toISOString().slice(0, 7)
    if (!activeComp) setActiveComp(comp)
    return comp
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header do módulo */}
      <header className="relative overflow-hidden rounded-lg border border-[#cb9d52]/18 bg-[#080d09] p-5 shadow-[0_24px_80px_rgba(0,0,0,.30)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#cb9d52]/70 to-transparent" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono text-[#cb9d52] uppercase font-semibold tracking-[0.22em]">
              R.OP.007 / R.OP.008 — Registro & Foto Mensal
            </p>
            <h2 className="mt-1 text-lg font-display font-semibold text-[#ede9d9]">
              Registro Financeiro Mensal
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#AAB4AD]">Competência:</label>
            <input
              type="month"
              value={activeComp}
              onChange={(e) => setActiveComp(e.target.value)}
              className="px-2 py-1 rounded border border-[#cb9d52]/25 bg-[#0d1611] text-xs text-[#ede9d9]"
            />
            {saved && (
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <Save className="w-3 h-3" /> Salvo
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ResumoCard
          label="Receitas"
          value={totalRec}
          icon={TrendingUp}
          tone="good"
        />
        <ResumoCard
          label="Despesas"
          value={totalDesp}
          icon={TrendingDown}
          tone="bad"
        />
        <ResumoCard
          label="Saldo"
          value={saldo}
          icon={Calculator}
          tone={saldo >= 0 ? 'good' : 'bad'}
        />
      </div>

      {/* Competências históricas */}
      {competencias.length > 0 && (
        <div className="rounded-xl border border-[#17251b]/40 bg-[#07100B] p-3">
          <p className="text-[11px] font-mono text-[#cb9d52] uppercase tracking-wider mb-2">
            Histórico de competências
          </p>
          <div className="flex flex-wrap gap-2">
            {competencias.map((c) => (
              <button
                key={c.competencia}
                onClick={() => setActiveComp(c.competencia)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition ${
                  activeComp === c.competencia
                    ? 'bg-[#cb9d52] text-[#080d09] border-[#cb9d52]'
                    : 'bg-[#0d1611] text-[#C8D0C9] border-white/10 hover:border-[#cb9d52]/30'
                }`}
              >
                {c.competencia}
                <span className="ml-1.5 opacity-70">
                  {fmtBRL(c.saldo)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabelas lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Receitas */}
        <div className="rounded-xl border border-[#17251b]/40 bg-[#07100B] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-display font-semibold text-[#ede9d9] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Receitas
            </h3>
            <button
              onClick={() => adicionar('receita')}
              className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/20 inline-flex items-center gap-1 transition"
            >
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </div>
          {receitas.length === 0 ? (
            <p className="text-xs text-[#8A938B] text-center py-6">
              Nenhuma receita nesta competência.
            </p>
          ) : (
            <div className="space-y-2">
              {receitas.map((r) => (
                <RegistroRow
                  key={r.id}
                  registro={r}
                  onPatch={(p) => patch(r.id, p)}
                  onDelete={() => remover(r.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Despesas */}
        <div className="rounded-xl border border-[#17251b]/40 bg-[#07100B] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-display font-semibold text-[#ede9d9] flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-400" />
              Despesas
            </h3>
            <button
              onClick={() => adicionar('despesa')}
              className="px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-semibold hover:bg-red-500/20 inline-flex items-center gap-1 transition"
            >
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </div>
          {despesas.length === 0 ? (
            <p className="text-xs text-[#8A938B] text-center py-6">
              Nenhuma despesa nesta competência.
            </p>
          ) : (
            <div className="space-y-2">
              {despesas.map((r) => (
                <RegistroRow
                  key={r.id}
                  registro={r}
                  onPatch={(p) => patch(r.id, p)}
                  onDelete={() => remover(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RegistroRow({
  registro,
  onPatch,
  onDelete,
}: {
  registro: Registro
  onPatch: (p: Partial<Registro>) => void
  onDelete: () => void
}) {
  const [s, setS] = useState(registro)
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center px-3 py-2 rounded-lg bg-[#0d1611] border border-white/5">
      <input
        value={s.descricao}
        onChange={(e) => setS({ ...s, descricao: e.target.value })}
        onBlur={() => onPatch({ descricao: s.descricao })}
        placeholder="Descrição"
        className="md:col-span-4 px-2 py-1 rounded bg-transparent border border-white/10 text-[11px] text-[#ede9d9] focus:border-[#cb9d52]/50 outline-none"
      />
      <input
        value={s.categoria}
        onChange={(e) => setS({ ...s, categoria: e.target.value })}
        onBlur={() => onPatch({ categoria: s.categoria })}
        placeholder="Categoria"
        className="md:col-span-3 px-2 py-1 rounded bg-transparent border border-white/10 text-[11px] text-[#ede9d9] focus:border-[#cb9d52]/50 outline-none"
      />
      <input
        type="number"
        value={s.valor}
        onChange={(e) => setS({ ...s, valor: Number(e.target.value) })}
        onBlur={() => onPatch({ valor: Number(s.valor) })}
        placeholder="0,00"
        className="md:col-span-3 px-2 py-1 rounded bg-transparent border border-white/10 text-[11px] text-right text-[#ede9d9] focus:border-[#cb9d52]/50 outline-none tabular-nums"
      />
      <input
        type="date"
        value={s.dataLancamento || ''}
        onChange={(e) => setS({ ...s, dataLancamento: e.target.value })}
        onBlur={() => onPatch({ dataLancamento: s.dataLancamento })}
        className="md:col-span-1 px-1 py-1 rounded bg-transparent border border-white/10 text-[11px] text-[#ede9d9] focus:border-[#cb9d52]/50 outline-none"
      />
      <button
        onClick={onDelete}
        className="md:col-span-1 text-[#8A938B] hover:text-red-400 transition"
        title="Remover"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function ResumoCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: typeof TrendingUp
  tone: 'good' | 'bad' | 'neutral'
}) {
  const cls =
    tone === 'good'
      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
      : tone === 'bad'
      ? 'border-red-500/20 bg-red-500/5 text-red-400'
      : 'border-[#cb9d52]/20 bg-[#cb9d52]/5 text-[#cb9d52]'
  return (
    <div className={`rounded-xl border ${cls} p-4`}>
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider opacity-80">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="mt-2 text-xl font-display font-semibold tabular-nums">
        {fmtBRL(value)}
      </p>
    </div>
  )
}

function fmtBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(n || 0)
}

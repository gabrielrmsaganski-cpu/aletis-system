// ============================================================
// PatrimonioTab — inventário completo do cliente + calculadora
// ============================================================
// Rende em 2 colunas:
//   · coluna esquerda: resumo financeiro + lista de ativos por tipo
//   · coluna direita : calculadora de custo operacional por cultura
//
// API:
//   GET  /api/inventario/:clienteId
//   POST /api/inventario/:clienteId
//   PATCH /api/inventario/:clienteId/:id
//   DELETE /api/inventario/:clienteId/:id
//   GET  /api/inventario/custo-operacional/culturas
//   POST /api/inventario/custo-operacional
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Tractor, Truck, Map, Warehouse, Wrench, Cog, Beef, Package,
  Plus, Trash2, Edit3, Shield, Fuel, Sprout, Loader2, X, Check,
} from 'lucide-react'
import { CardSection, Chip, fmtBRL, fmtHa, fmtNum } from '../ui/primitives'
import { apiFetch } from '../../hooks/useApi'

// ────────── Types (mirror backend) ──────────
type TipoPatrimonio =
  | 'maquinario' | 'veiculo' | 'imovel_rural' | 'benfeitoria'
  | 'implemento' | 'animal' | 'estoque'

interface PatrimonioBase {
  id: string
  clienteId: string
  tipo: TipoPatrimonio
  nome: string
  descricao?: string
  aquisicaoEm?: string
  valorAquisicao?: number
  valorAtual?: number
  status: 'ativo' | 'vendido' | 'baixado' | 'manutencao'
  observacoes?: string
  criadoEm: string
  atualizadoEm: string
  garantiaDisponivel?: boolean
  valorGarantia?: number
  // campos opcionais específicos
  marca?: string; modelo?: string; ano?: number; numeroSerie?: string; chassi?: string
  placa?: string; horimetro?: number; potenciaCv?: number
  denominacao?: string; matricula?: string; municipio?: string; uf?: string
  areaTotalHa?: number; codigoCar?: string
  quantidade?: number; unidade?: string; produto?: string
  especie?: string; categoria?: string
}
type Patrimonio = PatrimonioBase

interface InventarioCliente {
  clienteId: string
  atualizadoEm: string
  ativos: Patrimonio[]
  resumo: {
    totalAtivos: number
    valorTotalAtual: number
    valorGarantiaTotal: number
    porTipo: Record<TipoPatrimonio, { count: number; valor: number }>
  }
}

// ────────── Metadata por tipo ──────────
const TIPO_META: Record<TipoPatrimonio, { label: string; icon: React.ElementType; tone: string }> = {
  maquinario:   { label: 'Maquinário',     icon: Tractor,   tone: 'bg-aletis-verde/10 text-aletis-verde border-aletis-verde/30' },
  veiculo:      { label: 'Veículos',       icon: Truck,     tone: 'bg-sky-500/10 text-sky-600 border-sky-500/30' },
  imovel_rural: { label: 'Imóveis Rurais', icon: Map,       tone: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  benfeitoria:  { label: 'Benfeitorias',   icon: Warehouse, tone: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  implemento:   { label: 'Implementos',    icon: Wrench,    tone: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30' },
  animal:       { label: 'Animais',        icon: Beef,      tone: 'bg-rose-500/10 text-rose-600 border-rose-500/30' },
  estoque:      { label: 'Estoque',        icon: Package,   tone: 'bg-violet-500/10 text-violet-600 border-violet-500/30' },
}
const TIPOS_ORDEM: TipoPatrimonio[] = ['maquinario','implemento','imovel_rural','benfeitoria','veiculo','animal','estoque']

// ────────── Componente principal ──────────
export default function PatrimonioTab({ clienteId }: { clienteId: string }) {
  const [inv, setInv] = useState<InventarioCliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tipoFiltro, setTipoFiltro] = useState<TipoPatrimonio | 'todos'>('todos')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<Partial<Patrimonio>>({ tipo: 'maquinario' })
  const [saving, setSaving] = useState(false)

  const carregar = useCallback(async () => {
    if (!clienteId) return
    setLoading(true); setErro(null)
    try {
      const data = await apiFetch<InventarioCliente>(`/inventario/${clienteId}`)
      setInv(data)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao carregar inventário')
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => { void carregar() }, [carregar])

  const ativosFiltrados = useMemo(() => {
    if (!inv) return []
    if (tipoFiltro === 'todos') return inv.ativos
    return inv.ativos.filter((a) => a.tipo === tipoFiltro)
  }, [inv, tipoFiltro])

  const adicionar = useCallback(async () => {
    if (!addForm.tipo || !addForm.nome) {
      setErro('Tipo e nome são obrigatórios')
      return
    }
    setSaving(true); setErro(null)
    try {
      await apiFetch(`/inventario/${clienteId}`, {
        method: 'POST',
        body: JSON.stringify({ ...addForm, status: 'ativo' }),
      })
      setShowAdd(false)
      setAddForm({ tipo: 'maquinario' })
      await carregar()
    } catch (e: any) {
      setErro(e?.message || 'Falha ao adicionar')
    } finally {
      setSaving(false)
    }
  }, [addForm, clienteId, carregar])

  const remover = useCallback(async (id: string) => {
    if (!confirm('Remover este patrimônio do inventário?')) return
    try {
      await apiFetch(`/inventario/${clienteId}/${id}`, { method: 'DELETE' })
      await carregar()
    } catch (e: any) {
      setErro(e?.message || 'Falha ao remover')
    }
  }, [clienteId, carregar])

  const toggleGarantia = useCallback(async (a: Patrimonio) => {
    try {
      await apiFetch(`/inventario/${clienteId}/${a.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ garantiaDisponivel: !a.garantiaDisponivel }),
      })
      await carregar()
    } catch (e: any) {
      setErro(e?.message || 'Falha ao atualizar garantia')
    }
  }, [clienteId, carregar])

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
      {/* Coluna esquerda: inventário */}
      <div className="flex flex-col gap-4 min-w-0">
        <CardSection
          title="Patrimônio do cliente"
          subtitle="Maquinário, imóveis, benfeitorias, animais e estoque — base de garantia e custo operacional."
          icon={Shield}
          actions={
            <button
              onClick={() => setShowAdd(true)}
              className="px-3 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde/90 flex items-center gap-1.5"
            >
              <Plus size={14} /> Adicionar
            </button>
          }
        >
          {erro && (
            <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600">
              {erro}
            </div>
          )}

          {/* Resumo financeiro */}
          {inv && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <ResumoKpi label="Total de itens" value={String(inv.resumo.totalAtivos)} />
              <ResumoKpi label="Valor total atual" value={fmtBRL(inv.resumo.valorTotalAtual)} tone="emerald" />
              <ResumoKpi label="Garantia disponível" value={fmtBRL(inv.resumo.valorGarantiaTotal)} tone="gold" />
              <ResumoKpi label="Tipos cadastrados" value={String(TIPOS_ORDEM.filter((t) => (inv.resumo.porTipo[t]?.count ?? 0) > 0).length)} />
            </div>
          )}

          {/* Chips de filtro por tipo */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            <FiltroChip ativo={tipoFiltro === 'todos'} onClick={() => setTipoFiltro('todos')} label={`Todos (${inv?.ativos.length ?? 0})`} />
            {TIPOS_ORDEM.map((t) => {
              const count = inv?.resumo.porTipo[t]?.count ?? 0
              if (count === 0 && tipoFiltro !== t) return null
              const meta = TIPO_META[t]
              const Icon = meta.icon
              return (
                <FiltroChip
                  key={t}
                  ativo={tipoFiltro === t}
                  onClick={() => setTipoFiltro(t)}
                  label={`${meta.label} (${count})`}
                  icon={<Icon size={11} />}
                />
              )
            })}
          </div>

          {/* Lista de ativos */}
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-aletis-grafite-medio py-6 justify-center">
              <Loader2 size={14} className="animate-spin" /> Carregando inventário...
            </div>
          ) : ativosFiltrados.length === 0 ? (
            <div className="text-center py-10 text-sm text-aletis-grafite-medio dark:text-white/45">
              <Package size={32} className="mx-auto mb-2 opacity-40" />
              {inv?.ativos.length === 0
                ? 'Nenhum patrimônio cadastrado ainda. Clique em "Adicionar" para começar.'
                : 'Nenhum item deste tipo.'}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {ativosFiltrados.map((a) => (
                <PatrimonioRow
                  key={a.id}
                  ativo={a}
                  onRemove={() => remover(a.id)}
                  onToggleGarantia={() => toggleGarantia(a)}
                />
              ))}
            </div>
          )}
        </CardSection>
      </div>

      {/* Coluna direita: calculadora */}
      <div className="flex flex-col gap-4 min-w-0">
        <CalculadoraCustoOperacional />
      </div>

      {/* Modal adicionar */}
      {showAdd && (
        <AddPatrimonioModal
          form={addForm}
          setForm={setAddForm}
          onClose={() => { setShowAdd(false); setErro(null) }}
          onSave={adicionar}
          saving={saving}
        />
      )}
    </div>
  )
}

// ────────── Auxiliares visuais ──────────
function ResumoKpi({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'gold' }) {
  const accent =
    tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'gold' ? 'text-aletis-dourado'
    : 'text-aletis-grafite-escuro dark:text-white'
  return (
    <div className="rounded-xl border border-aletis-borda dark:border-white/5 bg-white dark:bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-aletis-grafite-medio dark:text-white/45 font-medium">{label}</p>
      <p className={`font-display text-[19px] font-bold tabular-nums truncate ${accent}`}>{value}</p>
    </div>
  )
}

function FiltroChip({
  ativo, onClick, label, icon,
}: { ativo: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2.5 rounded-full border text-[11px] font-medium inline-flex items-center gap-1 transition ${
        ativo
          ? 'bg-aletis-verde text-white border-aletis-verde'
          : 'bg-white dark:bg-white/[0.02] border-aletis-borda dark:border-white/10 text-aletis-grafite-escuro dark:text-white/70 hover:border-aletis-verde/40'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function PatrimonioRow({
  ativo, onRemove, onToggleGarantia,
}: { ativo: Patrimonio; onRemove: () => void; onToggleGarantia: () => void }) {
  const meta = TIPO_META[ativo.tipo]
  const Icon = meta.icon
  const valor = ativo.valorAtual ?? ativo.valorAquisicao ?? 0
  const garantia = ativo.valorGarantia ?? (ativo.garantiaDisponivel ? valor * 0.7 : 0)
  return (
    <div className="rounded-xl border border-aletis-borda dark:border-white/5 bg-white dark:bg-white/[0.02] px-3 py-3 flex items-center gap-3 group hover:border-aletis-verde/30 transition">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${meta.tone}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white truncate">{ativo.nome}</p>
          <Chip size="xs" tone="slate" label={meta.label} />
          {ativo.status !== 'ativo' && <Chip size="xs" tone="amber" label={ativo.status} />}
          {ativo.garantiaDisponivel && <Chip size="xs" tone="gold" label="Garantia" />}
        </div>
        <p className="text-[11px] text-aletis-grafite-medio dark:text-white/45 mt-0.5 truncate">
          {subtitleFor(ativo)}
        </p>
      </div>
      <div className="text-right shrink-0 hidden sm:block">
        <p className="font-display text-[14px] font-bold tabular-nums text-aletis-grafite-escuro dark:text-white">{fmtBRL(valor)}</p>
        {garantia > 0 && (
          <p className="text-[10px] text-aletis-dourado tabular-nums">garantia {fmtBRL(garantia)}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-50 group-hover:opacity-100 transition">
        <button
          onClick={onToggleGarantia}
          title={ativo.garantiaDisponivel ? 'Remover flag de garantia' : 'Marcar como disponível para garantia'}
          className="p-1.5 rounded-lg hover:bg-aletis-dourado/10 text-aletis-dourado"
        >
          <Shield size={14} />
        </button>
        <button
          onClick={onRemove}
          title="Remover"
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function subtitleFor(a: Patrimonio): string {
  switch (a.tipo) {
    case 'maquinario':
      return [a.marca, a.modelo, a.ano, a.chassi && `chassi ${a.chassi}`, a.horimetro && `${fmtNum(a.horimetro)}h`]
        .filter(Boolean).join(' · ') || 'sem detalhes'
    case 'veiculo':
      return [a.marca, a.modelo, a.ano, a.placa && `placa ${a.placa}`].filter(Boolean).join(' · ') || 'sem detalhes'
    case 'imovel_rural':
      return [a.denominacao, a.municipio && a.uf && `${a.municipio}/${a.uf}`, a.areaTotalHa && fmtHa(a.areaTotalHa), a.matricula && `mat. ${a.matricula}`]
        .filter(Boolean).join(' · ') || 'sem detalhes'
    case 'benfeitoria':
      return [a.categoria, a.descricao].filter(Boolean).join(' · ') || 'sem detalhes'
    case 'implemento':
      return [a.marca, a.modelo, a.ano].filter(Boolean).join(' · ') || 'sem detalhes'
    case 'animal':
      return [a.especie, a.categoria, a.quantidade && `${fmtNum(a.quantidade)} cabeças`]
        .filter(Boolean).join(' · ') || 'sem detalhes'
    case 'estoque':
      return [a.produto, a.quantidade && a.unidade && `${fmtNum(a.quantidade)} ${a.unidade}`]
        .filter(Boolean).join(' · ') || 'sem detalhes'
    default:
      return a.descricao || 'sem detalhes'
  }
}

// ────────── Modal adicionar ──────────
function AddPatrimonioModal({
  form, setForm, onClose, onSave, saving,
}: {
  form: Partial<Patrimonio>
  setForm: (f: Partial<Patrimonio>) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
}) {
  const tipo = (form.tipo || 'maquinario') as TipoPatrimonio
  const up = (patch: Partial<Patrimonio>) => setForm({ ...form, ...patch })
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-aletis-grafite-escuro rounded-2xl border border-aletis-borda dark:border-white/10 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <header className="px-5 py-4 border-b border-aletis-borda dark:border-white/5 flex items-center justify-between sticky top-0 bg-white dark:bg-aletis-grafite-escuro">
          <div>
            <h3 className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">Adicionar ao inventário</h3>
            <p className="text-[11px] text-aletis-grafite-medio dark:text-white/45">Campos variam conforme o tipo escolhido.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-aletis-borda/50 dark:hover:bg-white/10">
            <X size={16} />
          </button>
        </header>
        <div className="p-5 flex flex-col gap-4">
          {/* Tipo */}
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-aletis-grafite-medio dark:text-white/55">Tipo *</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {TIPOS_ORDEM.map((t) => {
                const meta = TIPO_META[t]
                const Icon = meta.icon
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => up({ tipo: t })}
                    className={`h-8 px-3 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1.5 ${
                      tipo === t
                        ? 'bg-aletis-verde text-white border-aletis-verde'
                        : 'border-aletis-borda dark:border-white/10 text-aletis-grafite-escuro dark:text-white/70 hover:border-aletis-verde/40'
                    }`}
                  >
                    <Icon size={12} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <Field label="Nome identificador *" value={form.nome || ''} onChange={(v) => up({ nome: v })} placeholder='ex.: "Trator John Deere 6110J 2018"' />
          <Field label="Descrição" value={form.descricao || ''} onChange={(v) => up({ descricao: v })} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor atual (R$)" type="number" value={form.valorAtual ?? ''} onChange={(v) => up({ valorAtual: v === '' ? undefined : Number(v) })} />
            <Field label="Valor aquisição (R$)" type="number" value={form.valorAquisicao ?? ''} onChange={(v) => up({ valorAquisicao: v === '' ? undefined : Number(v) })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data aquisição" type="date" value={form.aquisicaoEm || ''} onChange={(v) => up({ aquisicaoEm: v })} />
            <div className="flex items-center gap-2 mt-5">
              <input
                id="garantia"
                type="checkbox"
                checked={form.garantiaDisponivel || false}
                onChange={(e) => up({ garantiaDisponivel: e.target.checked })}
                className="w-4 h-4 accent-aletis-dourado"
              />
              <label htmlFor="garantia" className="text-xs text-aletis-grafite-escuro dark:text-white/80">
                Disponível como garantia bancária
              </label>
            </div>
          </div>

          {/* Campos específicos por tipo */}
          {(tipo === 'maquinario' || tipo === 'implemento') && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Marca" value={form.marca || ''} onChange={(v) => up({ marca: v })} />
              <Field label="Modelo" value={form.modelo || ''} onChange={(v) => up({ modelo: v })} />
              <Field label="Ano" type="number" value={form.ano ?? ''} onChange={(v) => up({ ano: v === '' ? undefined : Number(v) })} />
              <Field label="Nº série" value={form.numeroSerie || ''} onChange={(v) => up({ numeroSerie: v })} />
              {tipo === 'maquinario' && <Field label="Chassi" value={form.chassi || ''} onChange={(v) => up({ chassi: v })} />}
              {tipo === 'maquinario' && <Field label="Horímetro" type="number" value={form.horimetro ?? ''} onChange={(v) => up({ horimetro: v === '' ? undefined : Number(v) })} />}
              {tipo === 'maquinario' && <Field label="Potência (CV)" type="number" value={form.potenciaCv ?? ''} onChange={(v) => up({ potenciaCv: v === '' ? undefined : Number(v) })} />}
            </div>
          )}
          {tipo === 'veiculo' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Marca" value={form.marca || ''} onChange={(v) => up({ marca: v })} />
              <Field label="Modelo" value={form.modelo || ''} onChange={(v) => up({ modelo: v })} />
              <Field label="Ano" type="number" value={form.ano ?? ''} onChange={(v) => up({ ano: v === '' ? undefined : Number(v) })} />
              <Field label="Placa" value={form.placa || ''} onChange={(v) => up({ placa: v })} />
              <Field label="Chassi" value={form.chassi || ''} onChange={(v) => up({ chassi: v })} />
            </div>
          )}
          {tipo === 'imovel_rural' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Denominação" value={form.denominacao || ''} onChange={(v) => up({ denominacao: v })} />
              <Field label="Matrícula" value={form.matricula || ''} onChange={(v) => up({ matricula: v })} />
              <Field label="Município" value={form.municipio || ''} onChange={(v) => up({ municipio: v })} />
              <Field label="UF" value={form.uf || ''} onChange={(v) => up({ uf: v.toUpperCase().slice(0,2) })} />
              <Field label="Área total (ha)" type="number" value={form.areaTotalHa ?? ''} onChange={(v) => up({ areaTotalHa: v === '' ? undefined : Number(v) })} />
              <Field label="Código CAR/SICAR" value={form.codigoCar || ''} onChange={(v) => up({ codigoCar: v })} />
            </div>
          )}
          {tipo === 'benfeitoria' && (
            <Field label="Categoria (armazém, silo, galpão, curral...)" value={form.categoria || ''} onChange={(v) => up({ categoria: v })} />
          )}
          {tipo === 'animal' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Espécie (bovino, ovino...)" value={form.especie || ''} onChange={(v) => up({ especie: v })} />
              <Field label="Categoria (matriz, garrote...)" value={form.categoria || ''} onChange={(v) => up({ categoria: v })} />
              <Field label="Quantidade (cabeças)" type="number" value={form.quantidade ?? ''} onChange={(v) => up({ quantidade: v === '' ? undefined : Number(v) })} />
            </div>
          )}
          {tipo === 'estoque' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label='Produto (ex.: "soja em grão")' value={form.produto || ''} onChange={(v) => up({ produto: v })} />
              <Field label="Quantidade" type="number" value={form.quantidade ?? ''} onChange={(v) => up({ quantidade: v === '' ? undefined : Number(v) })} />
              <Field label="Unidade (sacas, ton, kg)" value={form.unidade || ''} onChange={(v) => up({ unidade: v })} />
            </div>
          )}
        </div>
        <footer className="px-5 py-4 border-t border-aletis-borda dark:border-white/5 bg-aletis-bege/30 dark:bg-white/[0.02] flex items-center justify-end gap-2 sticky bottom-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-aletis-borda dark:border-white/10 text-xs font-medium text-aletis-grafite-escuro dark:text-white/80 hover:bg-aletis-borda/50 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            disabled={saving || !form.nome}
            onClick={onSave}
            className="px-4 py-2 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
          </button>
        </footer>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider font-semibold text-aletis-grafite-medio dark:text-white/55">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 px-3 rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-white/[0.02] text-sm text-aletis-grafite-escuro dark:text-white focus:outline-none focus:border-aletis-verde"
      />
    </div>
  )
}

// ────────── Calculadora custo operacional ──────────
type CulturaAgro =
  | 'soja' | 'milho' | 'cafe' | 'algodao' | 'cana_acucar'
  | 'arroz' | 'feijao' | 'trigo' | 'boi_pastagem'

const CULTURA_LABEL: Record<CulturaAgro, string> = {
  soja: 'Soja', milho: 'Milho', cafe: 'Café', algodao: 'Algodão',
  cana_acucar: 'Cana-de-açúcar', arroz: 'Arroz', feijao: 'Feijão',
  trigo: 'Trigo', boi_pastagem: 'Pecuária (pastagem)',
}

interface CustoResult {
  cultura: string
  uf: string
  hectares: number
  precoDieselRef: { valor: number; unidade: string; fonte: string; dataReferencia: string }
  decomposicao: Array<{
    operacao: string; descricao: string; litrosPorHa: number;
    litrosTotais: number; custoPorHa: number; custoTotal: number;
    aplicavel: boolean; frequencia: number;
  }>
  totais: { litrosPorHa: number; litrosTotais: number; custoDieselPorHa: number; custoDieselTotal: number }
  produtividadeMediaRef: { valor: number; unidade: string }
  observacoes: string[]
}

function CalculadoraCustoOperacional() {
  const [cultura, setCultura] = useState<CulturaAgro>('soja')
  const [uf, setUf] = useState('MT')
  const [hectares, setHectares] = useState<number>(1000)
  const [precoOverride, setPrecoOverride] = useState<string>('')
  const [result, setResult] = useState<CustoResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const calcular = useCallback(async () => {
    if (!cultura || !uf || !hectares || hectares <= 0) {
      setErro('Preencha cultura, UF e hectares válidos')
      return
    }
    setLoading(true); setErro(null)
    try {
      const body: any = { cultura, uf: uf.toUpperCase(), hectares }
      const override = Number(precoOverride)
      if (Number.isFinite(override) && override > 0) body.precoDieselLitroOverride = override
      const data = await apiFetch<CustoResult>(`/inventario/custo-operacional`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setResult(data)
    } catch (e: any) {
      setErro(e?.message || 'Falha no cálculo')
    } finally {
      setLoading(false)
    }
  }, [cultura, uf, hectares, precoOverride])

  return (
    <CardSection
      title="Calculadora de custo operacional"
      subtitle="Diesel por hectare · coeficientes Embrapa/CONAB + preço ANP por UF."
      icon={Fuel}
      tone="verde"
    >
      <div className="flex flex-col gap-3">
        {/* Cultura chips */}
        <div>
          <label className="text-[11px] uppercase tracking-wider font-semibold text-aletis-grafite-medio dark:text-white/55 flex items-center gap-1">
            <Sprout size={11} /> Cultura
          </label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {(Object.keys(CULTURA_LABEL) as CulturaAgro[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCultura(c)}
                className={`h-7 px-2.5 rounded-full border text-[11px] font-medium ${
                  cultura === c
                    ? 'bg-aletis-verde text-white border-aletis-verde'
                    : 'border-aletis-borda dark:border-white/10 text-aletis-grafite-escuro dark:text-white/70 hover:border-aletis-verde/40'
                }`}
              >
                {CULTURA_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="UF" value={uf} onChange={(v) => setUf(v.toUpperCase().slice(0,2))} />
          <Field label="Área (hectares)" type="number" value={hectares} onChange={(v) => setHectares(Number(v) || 0)} />
        </div>
        <Field
          label="Preço diesel R$/L (override opcional)"
          type="number"
          value={precoOverride}
          onChange={(v) => setPrecoOverride(v)}
          placeholder="deixe vazio para usar ANP/UF"
        />

        <button
          onClick={calcular}
          disabled={loading}
          className="h-10 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Fuel size={14} />}
          Calcular custo de diesel
        </button>

        {erro && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600">
            {erro}
          </div>
        )}

        {result && <CustoResultado r={result} />}
      </div>
    </CardSection>
  )
}

function CustoResultado({ r }: { r: CustoResult }) {
  const aplicaveis = r.decomposicao.filter((d) => d.aplicavel)
  return (
    <div className="mt-2 flex flex-col gap-3">
      {/* Totais */}
      <div className="rounded-xl border border-aletis-verde/30 bg-aletis-verde/5 p-3.5">
        <p className="text-[10px] uppercase tracking-[0.12em] text-aletis-verde/80 font-semibold">Custo total de diesel</p>
        <p className="font-display text-[26px] font-bold tabular-nums text-aletis-verde">{fmtBRL(r.totais.custoDieselTotal)}</p>
        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-aletis-verde/20">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/55">por hectare</p>
            <p className="font-display text-[14px] font-bold tabular-nums text-aletis-grafite-escuro dark:text-white">{fmtBRL(r.totais.custoDieselPorHa)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/55">litros totais</p>
            <p className="font-display text-[14px] font-bold tabular-nums text-aletis-grafite-escuro dark:text-white">
              {fmtNum(Math.round(r.totais.litrosTotais))} L
            </p>
          </div>
        </div>
      </div>

      {/* Ref diesel */}
      <div className="flex items-center justify-between text-[11px] text-aletis-grafite-medio dark:text-white/55 px-1">
        <span>Diesel ref.: <strong className="text-aletis-grafite-escuro dark:text-white">R$ {r.precoDieselRef.valor.toFixed(2)}/L</strong></span>
        <span className="truncate ml-2">{r.precoDieselRef.fonte}</span>
      </div>

      {/* Decomposição */}
      <div className="rounded-xl border border-aletis-borda dark:border-white/5 overflow-hidden">
        <header className="px-3 py-2 bg-aletis-bege/30 dark:bg-white/[0.02] border-b border-aletis-borda dark:border-white/5">
          <p className="text-[11px] font-semibold text-aletis-grafite-escuro dark:text-white">Decomposição por operação</p>
        </header>
        <div className="flex flex-col">
          {aplicaveis.map((d) => (
            <div key={d.operacao} className="px-3 py-2 flex items-center gap-2 border-b border-aletis-borda/50 dark:border-white/5 last:border-b-0">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-aletis-grafite-escuro dark:text-white capitalize">{d.operacao.replace(/_/g, ' ')}</p>
                <p className="text-[10px] text-aletis-grafite-medio dark:text-white/45 truncate">{d.descricao}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] font-semibold tabular-nums text-aletis-grafite-escuro dark:text-white">{fmtBRL(d.custoTotal)}</p>
                <p className="text-[10px] tabular-nums text-aletis-grafite-medio dark:text-white/55">
                  {d.litrosPorHa.toFixed(1)} L/ha{d.frequencia < 1 ? ` · freq ${(d.frequencia * 100).toFixed(0)}%` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Observações */}
      <div className="text-[10.5px] text-aletis-grafite-medio dark:text-white/45 leading-relaxed">
        {r.observacoes.map((obs, i) => (
          <p key={i}>· {obs}</p>
        ))}
        <p className="mt-1">
          Produtividade média de referência: <strong className="text-aletis-grafite-escuro dark:text-white">{r.produtividadeMediaRef.valor} {r.produtividadeMediaRef.unidade}</strong>
        </p>
      </div>
    </div>
  )
}

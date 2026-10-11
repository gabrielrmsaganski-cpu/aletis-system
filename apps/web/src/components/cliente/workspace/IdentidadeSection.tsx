// ============================================================
// IdentidadeSection — quem é o cliente: pessoa, terra, patrimônio.
// Concentra dados pessoais, propriedade, mapa, clima, produção
// municipal, tags, notas internas, visitas técnicas, patrimônio.
// ============================================================
import { useState, useEffect, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../hooks/useApi'
import { MapThumbnail } from '../../MapThumbnail'
import {
  User,
  Tractor,
  Tag,
  StickyNote,
  Plus,
  Trash2,
  Save,
  Loader2,
  Cloud,
  Wheat,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  X,
  FileSearch,
  ExternalLink,
  MapPin,
  Pencil,
} from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'
import { fmtData, fmtBRL } from './utils'

const PatrimonioTab = lazy(() => import('../../patrimonio/PatrimonioTab'))

interface Props {
  data: UseClienteDataReturn
  onEdit: (area: 'dados' | 'atendimento' | 'propriedade' | 'financeiro') => void
}

export default function IdentidadeSection({ data, onEdit }: Props) {
  const { cliente, apiId } = data
  if (!cliente) return null

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-col gap-3 rounded-lg border border-aletis-borda bg-card p-4 shadow-none sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-display font-semibold text-foreground">Cadastro do cliente</h2><p className="mt-1 text-sm text-muted-foreground">Dados pessoais, localização, operação rural e vínculos em um só lugar.</p></div>
        <button type="button" onClick={() => onEdit('dados')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-aletis-verde px-4 text-sm font-semibold text-white"><Pencil className="h-4 w-4" /> Editar dados</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <DadosPessoaisCard cliente={cliente} onEdit={() => onEdit('dados')} />
        <LocalizacaoCard cliente={cliente} onEdit={() => onEdit('propriedade')} />
        <PropriedadeCard cliente={cliente} onEdit={() => onEdit('propriedade')} />
      </div>

      <Section title={`Pessoas vinculadas (${cliente.grupoFamiliar.length})`}>
        <GrupoFamiliarCard data={data} />
      </Section>

      <Section title={`Etiquetas e histórico (${cliente.notas.length})`}>
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
          <TagsCard tags={cliente.tags} onSave={data.setTags} />
          <NotasCard notas={cliente.notas} onAdd={data.addNota} onDelete={data.removerNota} />
        </div>
      </Section>

      <Section title="Resumo do dossiê">
        <DossieSummaryBanner clienteId={cliente.id} apiId={apiId} />
      </Section>

      {/* Patrimônio (componente existente) */}
      <Section title="Patrimônio agro">
        {apiId ? (
          <Suspense fallback={<div className="h-32 bg-gray-100 rounded animate-pulse" />}>
            <PatrimonioTab clienteId={apiId} />
          </Suspense>
        ) : (
          <p className="text-xs text-muted-foreground p-4">Cliente não identificado.</p>
        )}
      </Section>

      {/* Clima + Produção municipal (informações externas) */}
      <Section title="Inteligência territorial">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ClimaCard clima={cliente.clima} />
          <ProducaoMunicipalCard producao={cliente.producaoMunicipal} />
        </div>
      </Section>

      {/* Visitas técnicas */}
      <Section title="Visitas técnicas">
        <VisitasList visitas={cliente.visitasTecnicas} apiId={apiId} onChanged={data.reload} />
      </Section>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
type GrupoFamiliarPessoa = NonNullable<UseClienteDataReturn['cliente']>['grupoFamiliar'][number]

const EMPTY_GRUPO_FAMILIAR: GrupoFamiliarPessoa = {
  id: 'novo',
  nome: '',
  parentesco: '',
  papel: '',
  cpfCnpj: '',
  telefone: '',
  email: '',
  atuaAtividade: false,
  observacoes: '',
}

function GrupoFamiliarCard({ data }: { data: UseClienteDataReturn }) {
  const { cliente, apiId } = data
  const [items, setItems] = useState<GrupoFamiliarPessoa[]>(cliente?.grupoFamiliar ?? [])
  const [draft, setDraft] = useState<GrupoFamiliarPessoa>(EMPTY_GRUPO_FAMILIAR)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setItems(cliente?.grupoFamiliar ?? [])
  }, [cliente?.grupoFamiliar])

  function updateItem(id: string, patch: Partial<GrupoFamiliarPessoa>) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  async function criarPessoa() {
    if (!apiId || !draft.nome.trim()) return
    setSavingId('novo')
    setError(null)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(apiId)}/grupo-familiar`, {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          nome: draft.nome.trim(),
          cpfCnpj: draft.cpfCnpj?.trim() || undefined,
        }),
      })
      setDraft(EMPTY_GRUPO_FAMILIAR)
      await data.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingId(null)
    }
  }

  async function salvarPessoa(item: GrupoFamiliarPessoa) {
    if (!apiId || !item.id || !item.nome.trim()) return
    setSavingId(item.id)
    setError(null)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(apiId)}/grupo-familiar/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...item,
          nome: item.nome.trim(),
          cpfCnpj: item.cpfCnpj?.trim() || undefined,
        }),
      })
      await data.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingId(null)
    }
  }

  async function removerPessoa(item: GrupoFamiliarPessoa) {
    if (!apiId || !item.id) return
    setSavingId(item.id)
    setError(null)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(apiId)}/grupo-familiar/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      await data.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-foreground" />
            <h3 className="text-sm font-display font-semibold text-foreground">Grupo familiar e vínculos</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pessoas ligadas à operação: cônjuge, filhos, sócios, avalistas, arrendadores, gestores e outros vínculos. CPF/CNPJ é opcional.
          </p>
        </div>
        <span className="rounded-full border border-aletis-borda px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)]">
          {items.length} vínculo(s)
        </span>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-aletis-borda bg-aletis-bege/30 px-3 py-4 text-sm text-muted-foreground">
            Nenhuma pessoa vinculada ao cliente ainda.
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-aletis-borda bg-aletis-bege/15 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-display font-semibold text-foreground">{item.nome || 'Pessoa sem nome'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {[item.parentesco, item.papel].filter(Boolean).join(' · ') || 'Vínculo não classificado'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className={`hidden rounded-full border px-2 py-1 text-[11px] font-semibold sm:inline-flex ${item.atuaAtividade ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-aletis-borda bg-card text-muted-foreground'}`}>
                      {item.atuaAtividade ? 'Atua na operação' : 'Sem atuação'}
                    </span>
                    <button type="button" onClick={() => salvarPessoa(item)} disabled={savingId === item.id} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-aletis-verde text-white disabled:opacity-60" title="Salvar pessoa" aria-label={`Salvar ${item.nome}`}>
                      {savingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" onClick={() => removerPessoa(item)} disabled={savingId === item.id} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-60" title="Remover pessoa" aria-label={`Remover ${item.nome}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <SmallField label="Nome">
                    <SmallInput value={item.nome} onChange={(v) => updateItem(item.id, { nome: v })} placeholder="Nome completo" />
                  </SmallField>
                  <SmallField label="Parentesco">
                    <SmallInput value={item.parentesco ?? ''} onChange={(v) => updateItem(item.id, { parentesco: v })} placeholder="Cônjuge, filho..." />
                  </SmallField>
                  <SmallField label="Papel">
                    <SmallInput value={item.papel ?? ''} onChange={(v) => updateItem(item.id, { papel: v })} placeholder="Avalista, gestor..." />
                  </SmallField>
                  <SmallField label="CPF/CNPJ">
                    <SmallInput value={item.cpfCnpj ?? ''} onChange={(v) => updateItem(item.id, { cpfCnpj: v })} placeholder="Opcional" />
                  </SmallField>
                  <SmallField label="Telefone">
                    <SmallInput value={item.telefone ?? ''} onChange={(v) => updateItem(item.id, { telefone: v })} placeholder="Telefone" />
                  </SmallField>
                  <SmallField label="E-mail">
                    <SmallInput value={item.email ?? ''} onChange={(v) => updateItem(item.id, { email: v })} placeholder="E-mail" />
                  </SmallField>
                  <SmallField label="Observação" className="sm:col-span-2">
                    <SmallInput value={item.observacoes ?? ''} onChange={(v) => updateItem(item.id, { observacoes: v })} placeholder="Observação" />
                  </SmallField>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-aletis-borda bg-card px-3 py-2 text-xs font-semibold text-[var(--text-soft)] sm:col-span-2">
                    <input type="checkbox" checked={item.atuaAtividade === true} onChange={(e) => updateItem(item.id, { atuaAtividade: e.target.checked })} />
                    Atua diretamente na atividade rural
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-aletis-verde/25 bg-aletis-verde/5 p-3">
          <div className="mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-foreground" />
            <p className="text-xs font-display font-semibold text-foreground">Adicionar novo vínculo</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SmallField label="Nome" className="lg:col-span-2">
              <SmallInput value={draft.nome} onChange={(v) => setDraft((p) => ({ ...p, nome: v }))} placeholder="Adicionar nome" />
            </SmallField>
            <SmallField label="Parentesco">
              <SmallInput value={draft.parentesco ?? ''} onChange={(v) => setDraft((p) => ({ ...p, parentesco: v }))} placeholder="Parentesco" />
            </SmallField>
            <SmallField label="Papel">
              <SmallInput value={draft.papel ?? ''} onChange={(v) => setDraft((p) => ({ ...p, papel: v }))} placeholder="Papel" />
            </SmallField>
            <SmallField label="CPF/CNPJ">
              <SmallInput value={draft.cpfCnpj ?? ''} onChange={(v) => setDraft((p) => ({ ...p, cpfCnpj: v }))} placeholder="CPF/CNPJ opcional" />
            </SmallField>
            <SmallField label="Telefone">
              <SmallInput value={draft.telefone ?? ''} onChange={(v) => setDraft((p) => ({ ...p, telefone: v }))} placeholder="Telefone" />
            </SmallField>
            <SmallField label="E-mail">
              <SmallInput value={draft.email ?? ''} onChange={(v) => setDraft((p) => ({ ...p, email: v }))} placeholder="E-mail" />
            </SmallField>
            <SmallField label="Observação">
              <SmallInput value={draft.observacoes ?? ''} onChange={(v) => setDraft((p) => ({ ...p, observacoes: v }))} placeholder="Observação" />
            </SmallField>
            <label className="inline-flex items-center gap-2 rounded-lg border border-aletis-borda bg-card px-3 py-2 text-xs font-semibold text-[var(--text-soft)]">
              <input type="checkbox" checked={draft.atuaAtividade === true} onChange={(e) => setDraft((p) => ({ ...p, atuaAtividade: e.target.checked }))} />
              Atua na operação
            </label>
            <button type="button" onClick={criarPessoa} disabled={!draft.nome.trim() || savingId === 'novo'} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-aletis-verde px-3 text-xs font-semibold text-white disabled:opacity-50">
              {savingId === 'novo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Incluir vínculo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SmallField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`space-y-1 ${className}`}>
      <span className="text-[11px] font-body font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function SmallInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-w-0 w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-xs text-foreground placeholder:text-aletis-grafite-claro focus:outline-none focus:ring-2 focus:ring-aletis-verde/20"
    />
  )
}

// ────────────────────────────────────────────────────────────
function Section({ title, icon, children, defaultOpen }: { title: string; icon?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <section className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 transition-colors hover:bg-aletis-bege/30"
      >
        {icon && <span className="text-base">{icon}</span>}
        <h3 className="text-sm font-display font-semibold text-foreground">{title}</h3>
        {open ? <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" /> : <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  )
}

// ────────────────────────────────────────────────────────────
function CardEditButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-foreground hover:bg-aletis-bege"><Pencil className="h-3 w-3" /> Editar</button>
}

function DadosPessoaisCard({ cliente, onEdit }: { cliente: UseClienteDataReturn['cliente']; onEdit: () => void }) {
  if (!cliente) return null
  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-center gap-2 mb-3">
        <User className="w-4 h-4 text-foreground" />
        <h3 className="text-sm font-display font-semibold text-foreground">Dados pessoais</h3>
        <CardEditButton onClick={onEdit} />
      </div>
      <dl className="space-y-2 text-xs">
        <Field label="Nome">{cliente.nome}</Field>
        <Field label="CPF/CNPJ">{cliente.cpfCnpj || 'Não informado'}</Field>
        <Field label="Telefone">{cliente.telefone || '—'}</Field>
        <Field label="E-mail">{cliente.email || '—'}</Field>
        <Field label="Consultor">{cliente.consultor}</Field>
      </dl>
    </div>
  )
}

function LocalizacaoCard({ cliente, onEdit }: { cliente: UseClienteDataReturn['cliente']; onEdit: () => void }) {
  if (!cliente) return null
  const lat = cliente.endereco?.coordenadas?.lat
  const lng = cliente.endereco?.coordenadas?.lng
  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="w-4 h-4 text-foreground" />
        <h3 className="text-sm font-display font-semibold text-foreground">Localização</h3>
        <CardEditButton onClick={onEdit} />
      </div>
      {cliente.endereco?.formatado && (
        <p className="text-[11px] text-[var(--text-soft)] mb-2 leading-snug">{cliente.endereco.formatado}</p>
      )}
      <p className="text-xs text-[var(--text-soft)] mb-2">{cliente.cidade} / {cliente.uf}</p>
      {lat != null && lng != null ? (
        <MapThumbnail lat={lat} lng={lng} height={140} zoom={13} />
      ) : (
        <p className="text-xs text-muted-foreground italic">Coordenadas não disponíveis.</p>
      )}
      {cliente.endereco?.fonte && (
        <p className="text-[11px] text-muted-foreground mt-1 font-mono">fonte: {cliente.endereco.fonte}</p>
      )}
    </div>
  )
}

function PropriedadeCard({ cliente, onEdit }: { cliente: UseClienteDataReturn['cliente']; onEdit: () => void }) {
  if (!cliente) return null
  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-center gap-2 mb-3">
        <Tractor className="w-4 h-4 text-amber-700" />
        <h3 className="text-sm font-display font-semibold text-foreground">Propriedade rural</h3>
        <CardEditButton onClick={onEdit} />
      </div>
      <dl className="space-y-2 text-xs">
        <Field label="Identificação">{cliente.propriedade?.nome ?? '—'}</Field>
        <Field label="Área">{cliente.propriedade?.area ?? '—'}</Field>
        {cliente.car?.codImovel && <Field label="CAR">{cliente.car.codImovel}</Field>}
        {cliente.propriedade?.culturas && cliente.propriedade.culturas.length > 0 && (
          <div>
            <dt className="text-[11px] font-body uppercase tracking-wider text-muted-foreground">Culturas</dt>
            <dd className="flex flex-wrap gap-1 mt-1">
              {cliente.propriedade.culturas.map((c, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-aletis-verde/10 text-foreground text-[11px] font-body font-semibold">
                  {c}
                </span>
              ))}
            </dd>
          </div>
        )}
        {cliente.propriedade?.condicao && <Field label="Condição">{cliente.propriedade.condicao}</Field>}
      </dl>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-body uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-xs font-body font-medium text-foreground">{children}</dd>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function TagsCard({ tags, onSave }: { tags: string[]; onSave: (t: string[]) => Promise<void> }) {
  const [novaTag, setNovaTag] = useState('')

  async function adicionar() {
    if (!novaTag.trim()) return
    if (tags.includes(novaTag.trim())) { setNovaTag(''); return }
    await onSave([...tags, novaTag.trim()])
    setNovaTag('')
  }

  async function remover(tag: string) {
    await onSave(tags.filter((t) => t !== tag))
  }

  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-4 h-4 text-[var(--text-soft)]" />
        <h3 className="text-sm font-display font-semibold text-foreground">Tags</h3>
        <span className="text-[11px] text-muted-foreground ml-auto">{tags.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">Sem tags ainda.</span>
        ) : (
          tags.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-aletis-verde/10 text-foreground text-[11px] font-body font-semibold">
              {t}
              <button onClick={() => remover(t)} className="hover:text-red-600">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-1">
        <input
          value={novaTag}
          onChange={(e) => setNovaTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
          placeholder="nova tag…"
          className="min-w-0 flex-1 rounded-lg border border-aletis-borda px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-aletis-verde/20"
        />
        <button
          onClick={adicionar}
          disabled={!novaTag.trim()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-aletis-verde text-white disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function NotasCard({ notas, onAdd, onDelete }: {
  notas: Array<{ id: string; autor: string; criadoEm: string; texto: string }>
  onAdd: (texto: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [nova, setNova] = useState('')
  const [saving, setSaving] = useState(false)

  async function adicionar() {
    if (!nova.trim()) return
    setSaving(true)
    try {
      await onAdd(nova)
      setNova('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-center gap-2 mb-3">
        <StickyNote className="w-4 h-4 text-aletis-dourado" />
        <h3 className="text-sm font-display font-semibold text-foreground">Notas internas</h3>
        <span className="text-[11px] text-muted-foreground ml-auto">{notas.length}</span>
      </div>
      <div className="space-y-1.5 max-h-40 overflow-y-auto mb-2">
        {notas.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sem notas ainda.</p>
        ) : (
          notas.map((n) => (
            <div key={n.id} className="rounded-lg bg-aletis-bege/40 px-2 py-1.5 text-xs flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 text-[11px]">
                  <span className="font-semibold">{n.autor}</span>
                  <span className="text-muted-foreground">{fmtData(n.criadoEm)}</span>
                </div>
                <p className="mt-0.5 leading-snug">{n.texto}</p>
              </div>
              <button onClick={() => onDelete(n.id)} className="text-muted-foreground hover:text-red-600 flex-shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-1">
        <textarea
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          rows={2}
          placeholder="Nova nota interna…"
          className="min-w-0 flex-1 resize-none rounded-lg border border-aletis-borda px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-aletis-verde/20"
        />
        <button
          onClick={adicionar}
          disabled={!nova.trim() || saving}
          className="inline-flex h-9 w-9 items-center justify-center self-end rounded-lg bg-aletis-dourado text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function ClimaCard({ clima }: { clima: any }) {
  if (!clima) {
    return (
      <div className="rounded-lg bg-aletis-bege/40 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Cloud className="w-4 h-4 text-blue-600" />
          <h4 className="text-xs font-display font-semibold">Clima agroclimático</h4>
        </div>
        <p className="text-[11px] text-muted-foreground italic">Dados climáticos não disponíveis.</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-blue-50/50 border border-blue-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Cloud className="w-4 h-4 text-blue-600" />
        <h4 className="text-xs font-display font-semibold">Clima agroclimático</h4>
        <span className="text-[11px] font-mono text-muted-foreground ml-auto">{clima.fonte}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {clima.tempMediaAnualC != null && (
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Temp média</p>
            <p className="font-semibold">{Number(clima.tempMediaAnualC).toFixed(1)}°C</p>
          </div>
        )}
        {clima.chuvaAcumuladaAnualMm != null && (
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Chuva anual</p>
            <p className="font-semibold">{Number(clima.chuvaAcumuladaAnualMm).toFixed(0)} mm</p>
          </div>
        )}
        {clima.radiacaoMediaDiariaMjM2 != null && (
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Radiação</p>
            <p className="font-semibold">{Number(clima.radiacaoMediaDiariaMjM2).toFixed(1)} MJ/m²</p>
          </div>
        )}
        {clima.umidadeRelativaMediaPct != null && (
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">UR média</p>
            <p className="font-semibold">{Number(clima.umidadeRelativaMediaPct).toFixed(0)}%</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ProducaoMunicipalCard({ producao }: { producao: any }) {
  if (!producao) {
    return (
      <div className="rounded-lg bg-aletis-bege/40 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Wheat className="w-4 h-4 text-amber-600" />
          <h4 className="text-xs font-display font-semibold">Produção do município</h4>
        </div>
        <p className="text-[11px] text-muted-foreground italic">Dados IBGE não disponíveis.</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-amber-50/50 border border-amber-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Wheat className="w-4 h-4 text-amber-700" />
        <h4 className="text-xs font-display font-semibold">Produção do município</h4>
        <span className="text-[11px] font-mono text-muted-foreground ml-auto">IBGE {producao.anoReferencia}</span>
      </div>
      <p className="text-[11px] text-[var(--text-soft)] mb-1">
        Total lavoura: <strong>{fmtBRL((producao.valorTotalLavouraMilReais ?? 0) * 1000)}</strong>
      </p>
      {Array.isArray(producao.culturas) && producao.culturas.length > 0 && (
        <ul className="space-y-0.5 text-[11px]">
          {producao.culturas.slice(0, 5).map((c: any, i: number) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="text-[var(--text-soft)] capitalize">{c.cultura}</span>
              <span className="text-muted-foreground ml-auto tabular-nums">
                {fmtBRL((c.valorMilReais ?? 0) * 1000)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function VisitasList({ visitas, apiId, onChanged }: { visitas: any[]; apiId?: string; onChanged: () => Promise<void> }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ data: new Date().toISOString().slice(0, 10), consultor: '', observacoesGerais: '' })
  const [saving, setSaving] = useState(false)

  async function criar() {
    if (!apiId) return
    setSaving(true)
    try {
      await apiFetch(`/clientes/${apiId}/visitas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: form.data,
          consultor: form.consultor.trim(),
          observacoesGerais: form.observacoesGerais.trim() || undefined,
          checklist: {},
          riscos: [],
          oportunidades: [],
        }),
      })
      setForm({ data: new Date().toISOString().slice(0, 10), consultor: '', observacoesGerais: '' })
      setShowForm(false)
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function remover(id: string) {
    if (!apiId) return
    if (!confirm('Excluir visita?')) return
    await apiFetch(`/clientes/${apiId}/visitas/${id}`, { method: 'DELETE' })
    await onChanged()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-foreground" />
        <span className="text-xs text-[var(--text-soft)]">{visitas.length} visita(s) registrada(s)</span>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto text-[11px] text-foreground hover:underline"
        >
          {showForm ? 'cancelar' : '+ nova visita'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg bg-aletis-bege/40 p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className="px-2 py-1 rounded border border-aletis-borda text-xs" />
          <input placeholder="Consultor" value={form.consultor} onChange={(e) => setForm({ ...form, consultor: e.target.value })} className="px-2 py-1 rounded border border-aletis-borda text-xs" />
          <input placeholder="Observações" value={form.observacoesGerais} onChange={(e) => setForm({ ...form, observacoesGerais: e.target.value })} className="px-2 py-1 rounded border border-aletis-borda text-xs" />
          <button
            onClick={criar}
            disabled={!form.consultor.trim() || !form.data || saving}
            className="md:col-span-3 px-2 py-1.5 rounded bg-aletis-verde text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Registrar visita
          </button>
        </div>
      )}

      {visitas.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2 text-center">Nenhuma visita registrada.</p>
      ) : (
        <ul className="space-y-1">
          {visitas.map((v) => (
            <li key={v.id} className="flex items-baseline gap-2 px-2 py-1.5 rounded hover:bg-aletis-bege/30 text-xs">
              <span className="font-mono text-[11px] text-[var(--text-soft)]">{fmtData(v.data)}</span>
              <span className="font-semibold">{v.consultor}</span>
              {v.observacoesGerais && <span className="text-muted-foreground flex-1 truncate">— {v.observacoesGerais}</span>}
              <button onClick={() => remover(v.id)} className="text-muted-foreground hover:text-red-600 flex-shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Dossiê Summary Banner — mostra contagens chave (PFs/PJs/imóveis/
// máquinas/dívidas) em formato compacto, com link 'Editar →' que
// leva ao Dossiê completo. Substitui um simples CTA de link.
// ────────────────────────────────────────────────────────────
function DossieSummaryBanner({ clienteId, apiId }: { clienteId: string; apiId?: string }) {
  const [resumo, setResumo] = useState<any>(null)

  useEffect(() => {
    if (!apiId) return
    apiFetch<any>(`/clientes/${apiId}/dossie/resumo`)
      .then((r) => setResumo(r))
      .catch(() => setResumo(null))
  }, [apiId])

  return (
    <Link
      to={`/clientes/${clienteId}/dossie`}
      className="group block rounded-lg border border-aletis-borda bg-card px-4 py-3 shadow-none transition-colors hover:bg-aletis-bege/30"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-aletis-verde flex items-center justify-center flex-shrink-0">
          <FileSearch className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono text-foreground uppercase font-semibold tracking-wider">
            Dossiê do cliente
          </p>
          <h3 className="text-sm font-display font-semibold text-foreground">
            {resumo ? 'Dossiê preenchido' : 'Ver dossiê detalhado'}
          </h3>
          {resumo ? (
            <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
              <DSStat label="Pessoas Físicas" value={resumo.pessoasFisicas ?? 0} />
              <DSStat label="Pessoas Jurídicas" value={resumo.pessoasJuridicas ?? 0} />
              <DSStat label="Imóveis" value={resumo.imoveis ?? 0} />
              <DSStat label="Máquinas" value={resumo.maquinas ?? 0} />
              <DSStat label="Dívidas bancárias" value={resumo.dividasBancarias ?? 0} />
              <DSStat label="Fornecedores" value={resumo.fornecedores ?? 0} />
            </div>
          ) : (
            <p className="text-[11px] text-[var(--text-soft)]">
              Grupo econômico, fornecedores, propriedades rurais, frota agrícola, dívidas bancárias detalhadas, contas e relações comerciais — 13 seções colapsáveis.
            </p>
          )}
        </div>
        <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-aletis-verde flex-shrink-0" />
      </div>
    </Link>
  )
}

function DSStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-mono font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

// ============================================================
// IdentidadeSection — quem é o cliente: pessoa, terra, patrimônio.
// Concentra dados pessoais, propriedade, mapa, clima, produção
// municipal, tags, notas internas, visitas técnicas, patrimônio.
// ============================================================
import { useState, lazy, Suspense } from 'react'
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
} from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'
import { fmtData, fmtBRL } from './utils'

const PatrimonioTab = lazy(() => import('../../patrimonio/PatrimonioTab'))

interface Props {
  data: UseClienteDataReturn
}

export default function IdentidadeSection({ data }: Props) {
  const { cliente, apiId } = data
  if (!cliente) return null

  return (
    <div className="space-y-3 animate-fade-in">
      {/* CTA pro Dossiê Agro Canônico (Daycoval/CAR/IBGE expandido) */}
      <Link
        to={`/clientes/${cliente.id}/dossie`}
        className="card-premium block px-4 py-3 hover:bg-aletis-bege/40 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
            <FileSearch className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono text-blue-700 uppercase font-semibold tracking-wider">
              📋 Dossiê Agro canônico
            </p>
            <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
              Ver dossiê detalhado (padrão Daycoval 2025)
            </h3>
            <p className="text-[11px] text-aletis-grafite-medio">
              Grupo econômico, fornecedores, propriedades rurais, frota agrícola, dívidas bancárias detalhadas, contas e relações comerciais — 13 seções colapsáveis.
            </p>
          </div>
          <ExternalLink className="w-4 h-4 text-aletis-grafite-claro group-hover:text-aletis-verde flex-shrink-0" />
        </div>
      </Link>

      {/* Linha 1: Dados Pessoais + Localização + Propriedade */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <DadosPessoaisCard cliente={cliente} />
        <LocalizacaoCard cliente={cliente} />
        <PropriedadeCard cliente={cliente} />
      </div>

      {/* Tags + Notas Internas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TagsCard tags={cliente.tags} onSave={data.setTags} />
        <NotasCard
          notas={cliente.notas}
          onAdd={data.addNota}
          onDelete={data.removerNota}
        />
      </div>

      {/* Patrimônio (componente existente) */}
      <Section title="Patrimônio agro" icon="🏞️" defaultOpen>
        {apiId ? (
          <Suspense fallback={<div className="h-32 bg-gray-100 rounded animate-pulse" />}>
            <PatrimonioTab clienteId={apiId} />
          </Suspense>
        ) : (
          <p className="text-xs text-aletis-grafite-claro p-4">Cliente não identificado.</p>
        )}
      </Section>

      {/* Clima + Produção municipal (informações externas) */}
      <Section title="Inteligência territorial" icon="🛰️">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ClimaCard clima={cliente.clima} />
          <ProducaoMunicipalCard producao={cliente.producaoMunicipal} />
        </div>
      </Section>

      {/* Visitas técnicas */}
      <Section title="Visitas técnicas" icon="📋">
        <VisitasList visitas={cliente.visitasTecnicas} apiId={apiId} onChanged={data.reload} />
      </Section>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function Section({ title, icon, children, defaultOpen }: { title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <section className="card-premium overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-aletis-bege/30 transition-colors"
      >
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">{title}</h3>
        {open ? <ChevronDown className="w-4 h-4 ml-auto text-aletis-grafite-claro" /> : <ChevronRight className="w-4 h-4 ml-auto text-aletis-grafite-claro" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  )
}

// ────────────────────────────────────────────────────────────
function DadosPessoaisCard({ cliente }: { cliente: UseClienteDataReturn['cliente'] }) {
  if (!cliente) return null
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <User className="w-4 h-4 text-aletis-verde" />
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Dados pessoais</h3>
      </div>
      <dl className="space-y-2 text-xs">
        <Field label="Nome">{cliente.nome}</Field>
        <Field label="CPF/CNPJ">{cliente.cpfCnpj}</Field>
        <Field label="Telefone">{cliente.telefone || '—'}</Field>
        <Field label="E-mail">{cliente.email || '—'}</Field>
        <Field label="Consultor">{cliente.consultor}</Field>
      </dl>
    </div>
  )
}

function LocalizacaoCard({ cliente }: { cliente: UseClienteDataReturn['cliente'] }) {
  if (!cliente) return null
  const lat = cliente.endereco?.coordenadas?.lat
  const lng = cliente.endereco?.coordenadas?.lng
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">📍</span>
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Localização</h3>
      </div>
      {cliente.endereco?.formatado && (
        <p className="text-[11px] text-aletis-grafite-medio mb-2 leading-snug">{cliente.endereco.formatado}</p>
      )}
      <p className="text-xs text-aletis-grafite-medio mb-2">{cliente.cidade} / {cliente.uf}</p>
      {lat != null && lng != null ? (
        <MapThumbnail lat={lat} lng={lng} height={140} zoom={13} />
      ) : (
        <p className="text-xs text-aletis-grafite-claro italic">Coordenadas não disponíveis.</p>
      )}
      {cliente.endereco?.fonte && (
        <p className="text-[9px] text-aletis-grafite-claro mt-1 font-mono">fonte: {cliente.endereco.fonte}</p>
      )}
    </div>
  )
}

function PropriedadeCard({ cliente }: { cliente: UseClienteDataReturn['cliente'] }) {
  if (!cliente) return null
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <Tractor className="w-4 h-4 text-amber-700" />
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Propriedade rural</h3>
      </div>
      <dl className="space-y-2 text-xs">
        <Field label="Identificação">{cliente.propriedade?.nome ?? '—'}</Field>
        <Field label="Área">{cliente.propriedade?.area ?? '—'}</Field>
        {cliente.car?.codImovel && <Field label="CAR">{cliente.car.codImovel}</Field>}
        {cliente.propriedade?.culturas && cliente.propriedade.culturas.length > 0 && (
          <div>
            <dt className="text-[10px] font-body uppercase tracking-wider text-aletis-grafite-claro">Culturas</dt>
            <dd className="flex flex-wrap gap-1 mt-1">
              {cliente.propriedade.culturas.map((c, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-aletis-verde/10 text-aletis-verde text-[10px] font-body font-semibold">
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
      <dt className="text-[10px] font-body uppercase tracking-wider text-aletis-grafite-claro">{label}</dt>
      <dd className="text-xs font-body font-medium text-aletis-grafite-escuro">{children}</dd>
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
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-4 h-4 text-aletis-grafite-medio" />
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Tags</h3>
        <span className="text-[10px] text-aletis-grafite-claro ml-auto">{tags.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.length === 0 ? (
          <span className="text-xs text-aletis-grafite-claro italic">Sem tags ainda.</span>
        ) : (
          tags.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-aletis-verde/10 text-aletis-verde text-[11px] font-body font-semibold">
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
          className="flex-1 px-2 py-1 rounded border border-aletis-borda text-xs"
        />
        <button
          onClick={adicionar}
          disabled={!novaTag.trim()}
          className="px-2 py-1 rounded bg-aletis-verde text-white text-xs disabled:opacity-50"
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
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <StickyNote className="w-4 h-4 text-aletis-dourado" />
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Notas internas</h3>
        <span className="text-[10px] text-aletis-grafite-claro ml-auto">{notas.length}</span>
      </div>
      <div className="space-y-1.5 max-h-40 overflow-y-auto mb-2">
        {notas.length === 0 ? (
          <p className="text-xs text-aletis-grafite-claro italic">Sem notas ainda.</p>
        ) : (
          notas.map((n) => (
            <div key={n.id} className="rounded-lg bg-aletis-bege/40 px-2 py-1.5 text-xs flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 text-[10px]">
                  <span className="font-semibold">{n.autor}</span>
                  <span className="text-aletis-grafite-claro">{fmtData(n.criadoEm)}</span>
                </div>
                <p className="mt-0.5 leading-snug">{n.texto}</p>
              </div>
              <button onClick={() => onDelete(n.id)} className="text-aletis-grafite-claro hover:text-red-600 flex-shrink-0">
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
          className="flex-1 px-2 py-1 rounded border border-aletis-borda text-xs resize-none"
        />
        <button
          onClick={adicionar}
          disabled={!nova.trim() || saving}
          className="px-2 py-1 rounded bg-aletis-dourado text-white text-xs disabled:opacity-50 self-end"
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
        <p className="text-[11px] text-aletis-grafite-claro italic">Dados climáticos não disponíveis.</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-blue-50/50 border border-blue-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Cloud className="w-4 h-4 text-blue-600" />
        <h4 className="text-xs font-display font-semibold">Clima agroclimático</h4>
        <span className="text-[9px] font-mono text-aletis-grafite-claro ml-auto">{clima.fonte}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {clima.tempMediaAnualC != null && (
          <div>
            <p className="text-[9px] uppercase text-aletis-grafite-claro">Temp média</p>
            <p className="font-semibold">{Number(clima.tempMediaAnualC).toFixed(1)}°C</p>
          </div>
        )}
        {clima.chuvaAcumuladaAnualMm != null && (
          <div>
            <p className="text-[9px] uppercase text-aletis-grafite-claro">Chuva anual</p>
            <p className="font-semibold">{Number(clima.chuvaAcumuladaAnualMm).toFixed(0)} mm</p>
          </div>
        )}
        {clima.radiacaoMediaDiariaMjM2 != null && (
          <div>
            <p className="text-[9px] uppercase text-aletis-grafite-claro">Radiação</p>
            <p className="font-semibold">{Number(clima.radiacaoMediaDiariaMjM2).toFixed(1)} MJ/m²</p>
          </div>
        )}
        {clima.umidadeRelativaMediaPct != null && (
          <div>
            <p className="text-[9px] uppercase text-aletis-grafite-claro">UR média</p>
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
        <p className="text-[11px] text-aletis-grafite-claro italic">Dados IBGE não disponíveis.</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-amber-50/50 border border-amber-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Wheat className="w-4 h-4 text-amber-700" />
        <h4 className="text-xs font-display font-semibold">Produção do município</h4>
        <span className="text-[9px] font-mono text-aletis-grafite-claro ml-auto">IBGE {producao.anoReferencia}</span>
      </div>
      <p className="text-[11px] text-aletis-grafite-medio mb-1">
        Total lavoura: <strong>{fmtBRL((producao.valorTotalLavouraMilReais ?? 0) * 1000)}</strong>
      </p>
      {Array.isArray(producao.culturas) && producao.culturas.length > 0 && (
        <ul className="space-y-0.5 text-[11px]">
          {producao.culturas.slice(0, 5).map((c: any, i: number) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="text-aletis-grafite-medio capitalize">{c.cultura}</span>
              <span className="text-aletis-grafite-claro ml-auto tabular-nums">
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
        <ClipboardCheck className="w-4 h-4 text-aletis-verde" />
        <span className="text-xs text-aletis-grafite-medio">{visitas.length} visita(s) registrada(s)</span>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto text-[10px] text-aletis-verde hover:underline"
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
        <p className="text-xs text-aletis-grafite-claro italic py-2 text-center">Nenhuma visita registrada.</p>
      ) : (
        <ul className="space-y-1">
          {visitas.map((v) => (
            <li key={v.id} className="flex items-baseline gap-2 px-2 py-1.5 rounded hover:bg-aletis-bege/30 text-xs">
              <span className="font-mono text-[10px] text-aletis-grafite-medio">{fmtData(v.data)}</span>
              <span className="font-semibold">{v.consultor}</span>
              {v.observacoesGerais && <span className="text-aletis-grafite-claro flex-1 truncate">— {v.observacoesGerais}</span>}
              <button onClick={() => remover(v.id)} className="text-aletis-grafite-claro hover:text-red-600 flex-shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

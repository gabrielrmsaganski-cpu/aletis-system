import PageHeader from '../components/ui/PageHeader'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch, useApi } from '../hooks/useApi'

/* ─── Icons (Lucide) ─── */
import {
  ChevronLeft,
  ClipboardCheck,
  Save,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  UploadCloud,
  CheckIcon,
} from 'lucide-react'

/* ─── Types ─── */
type ItemTipo = 'boolean' | 'texto' | 'data' | 'arquivo' | 'numero'

interface ChecklistItem {
  id: string
  ordem: number
  titulo: string
  descricao?: string
  tipo: ItemTipo
  obrigatorio?: boolean
}

interface ChecklistSecao {
  id: string
  ordem: number
  titulo: string
  itens: ChecklistItem[]
}

interface ChecklistTemplate {
  codigo: string
  nome: string
  descricao: string
  secoes: ChecklistSecao[]
}

interface ChecklistResposta {
  id: number
  clienteId: string
  escritorio: string
  checklistCodigo: string
  checklistNome: string
  respostas: Record<string, { valor?: any; observacao?: string }>
  status: 'pendente' | 'em_andamento' | 'concluido'
  criadoEm: string
  atualizadoEm: string
}

/* ─── Status helpers ─── */
function statusLabel(s: string) {
  switch (s) {
    case 'concluido': return { label: 'Concluído', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
    case 'em_andamento': return { label: 'Em andamento', color: 'text-amber-600 bg-amber-50 border-amber-200' }
    default: return { label: 'Pendente', color: 'text-slate-500 bg-slate-50 border-slate-200' }
  }
}

function calcularProgresso(tpl: ChecklistTemplate, respostas: Record<string, { valor?: any }>) {
  let total = 0
  let respondidos = 0
  tpl.secoes.forEach((sec) => {
    sec.itens.forEach((item) => {
      total++
      const r = respostas[item.id]
      if (r && r.valor !== undefined && r.valor !== '' && r.valor !== null) respondidos++
    })
  })
  return total === 0 ? 0 : Math.round((respondidos / total) * 100)
}

/* ─── Componente ─── */
export default function ClienteChecklistPage() {
  const { id: clienteId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: cliente } = useApi<any>(clienteId ? `/clientes/${clienteId}` : null, null)
  const { data: templates = [], loading: loadingTpl } = useApi<ChecklistTemplate[]>('/checklist-assessoria/templates', [])
  const { data: respostasRaw = [], refetch: refetchRespostas } = useApi<ChecklistResposta[]>(
    clienteId ? `/checklist-assessoria/cliente/${clienteId}` : null,
    []
  )

  const [activeTab, setActiveTab] = useState<string>('R.OP.003')
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<Record<string, { valor?: any; observacao?: string }>>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  /* Mapear respostas carregadas */
  const respostasMap = useMemo(() => {
    const m: Record<string, Record<string, { valor?: any; observacao?: string }>> = {}
    respostasRaw.forEach((r) => {
      m[r.checklistCodigo] = r.respostas || {}
    })
    return m
  }, [respostasRaw])

  const statusMap = useMemo(() => {
    const m: Record<string, string> = {}
    respostasRaw.forEach((r) => {
      m[r.checklistCodigo] = r.status || 'pendente'
    })
    return m
  }, [respostasRaw])

  /* Sincronizar draft quando trocar de aba ou carregar */
  useEffect(() => {
    setDraft({ ...(respostasMap[activeTab] || {}) })
  }, [activeTab, respostasMap])

  /* Abrir todas as seções do checklist ativo por padrão */
  useEffect(() => {
    const tpl = templates.find((t) => t.codigo === activeTab)
    if (tpl) {
      setOpenSections(new Set(tpl.secoes.map((s) => s.id)))
    }
  }, [activeTab, templates])

  const activeTemplate = templates.find((t) => t.codigo === activeTab)
  const progresso = activeTemplate ? calcularProgresso(activeTemplate, draft) : 0

  function toggleSection(secId: string) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(secId)) next.delete(secId)
      else next.add(secId)
      return next
    })
  }

  function updateItem(itemId: string, valor: any) {
    setDraft((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), valor },
    }))
  }

  function updateObs(itemId: string, observacao: string) {
    setDraft((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), observacao },
    }))
  }

  async function handleSalvar() {
    if (!clienteId || !activeTemplate) return
    setSaving(true)
    setSaveMsg('')
    try {
      const status: 'pendente' | 'em_andamento' | 'concluido' = progresso >= 100 ? 'concluido' : 'em_andamento'
      await apiFetch(`/checklist-assessoria/cliente/${clienteId}`, {
        method: 'POST',
        body: JSON.stringify({
          checklistCodigo: activeTab,
          respostas: draft,
          status,
        }),
      })
      setSaveMsg('Salvo com sucesso!')
      refetchRespostas()
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e: any) {
      setSaveMsg('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const nomeCliente = cliente?.nome || cliente?.payload?.nome || 'Cliente'
  const escritorio = cliente?.escritorio || 'Aletis'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-card border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/clientes/${clienteId}`)}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            title="Voltar"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <PageHeader className="!mb-0" title={<><ClipboardCheck className="w-5 h-5 text-blue-600" />Checklist de Assessoria</>} description={<> <p className="text-sm text-slate-500">
              {nomeCliente} · Escritório {escritorio}
            </p> </>} />
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-sm px-3 py-1 rounded-full ${saveMsg.includes('Erro') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {saveMsg}
            </span>
          )}
          <button
            onClick={handleSalvar}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium text-sm transition"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {templates.map((tpl) => {
            const st = statusLabel(statusMap[tpl.codigo] || 'pendente')
            const isActive = activeTab === tpl.codigo
            return (
              <button
                key={tpl.codigo}
                onClick={() => setActiveTab(tpl.codigo)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap border transition ${
                  isActive
                    ? 'bg-card border-blue-300 text-blue-700 shadow-sm'
                    : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${st.color.split(' ')[0].replace('text-', 'bg-')}`} />
                {tpl.codigo}
                <span className={`text-xs px-1.5 py-0.5 rounded border ${st.color}`}>{st.label}</span>
              </button>
            )
          })}
        </div>

        {/* Progresso */}
        {activeTemplate && (
          <div className="bg-card rounded-xl border border-slate-200 p-5 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">
                  {activeTemplate.nome}
                </h2>
                <p className="text-sm text-slate-500">{activeTemplate.descricao}</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-slate-800">{progresso}%</span>
                <p className="text-xs text-slate-500">completo</p>
              </div>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progresso < 30 ? 'bg-red-400' : progresso < 70 ? 'bg-amber-400' : 'bg-emerald-500'
                }`}
                style={{ width: `${progresso}%` }}
              />
            </div>
          </div>
        )}

        {/* Checklist sections */}
        {loadingTpl ? (
          <div className="text-center py-12 text-slate-400">Carregando checklists...</div>
        ) : activeTemplate ? (
          <div className="space-y-4">
            {activeTemplate.secoes.map((sec) => {
              const isOpen = openSections.has(sec.id)
              const secTotal = sec.itens.length
              const secDone = sec.itens.filter((it) => {
                const r = draft[it.id]
                return r && r.valor !== undefined && r.valor !== '' && r.valor !== null
              }).length

              return (
                <div key={sec.id} className="bg-card rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <button
                    onClick={() => toggleSection(sec.id)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      )}
                      <span className="font-semibold text-slate-700">{sec.titulo}</span>
                      <span className="text-xs text-slate-400">
                        {secDone}/{secTotal}
                      </span>
                    </div>
                    {secDone === secTotal && secTotal > 0 && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-100">
                      {sec.itens.map((item) => {
                        const val = draft[item.id]?.valor
                        const obs = draft[item.id]?.observacao || ''
                        const hasValue = val !== undefined && val !== '' && val !== null

                        return (
                          <div
                            key={item.id}
                            className={`px-5 py-4 flex flex-col gap-3 transition ${
                              hasValue ? 'bg-emerald-50/30' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {hasValue ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                              ) : (
                                <Circle className="w-5 h-5 text-slate-300 mt-0.5 shrink-0" />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-700 text-sm">
                                    {item.titulo}
                                  </span>
                                  {item.obrigatorio && (
                                    <span className="text-[11px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded border border-red-100 font-medium">
                                      Obrigatório
                                    </span>
                                  )}
                                </div>
                                {item.descricao && (
                                  <p className="text-xs text-slate-400 mt-0.5">{item.descricao}</p>
                                )}

                                {/* Input field */}
                                <div className="mt-2">
                                  {renderInput(item, val, (v) => updateItem(item.id, v))}
                                </div>
                              </div>
                            </div>

                            {/* Observação */}
                            <div className="ml-8">
                              <input
                                type="text"
                                placeholder="Observação (opcional)"
                                value={obs}
                                onChange={(e) => updateObs(item.id, e.target.value)}
                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 text-slate-600 placeholder:text-slate-300"
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            Nenhum checklist encontrado
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Render input por tipo ─── */
function renderInput(
  item: ChecklistItem,
  value: any,
  onChange: (v: any) => void
) {
  switch (item.tipo) {
    case 'boolean':
      return (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600">{value === true ? 'Sim' : value === false ? 'Não' : '—'}</span>
          </label>
          {value !== undefined && (
            <button
              onClick={() => onChange(undefined)}
              className="text-xs text-slate-400 hover:text-red-500 underline"
            >
              limpar
            </button>
          )}
        </div>
      )

    case 'texto':
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Digite aqui..."
          className="w-full max-w-md text-sm px-3 py-2 rounded-lg border border-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 text-slate-700 placeholder:text-slate-300"
        />
      )

    case 'numero':
      return (
        <input
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => {
            const v = e.target.value === '' ? undefined : Number(e.target.value)
            onChange(v)
          }}
          placeholder="0,00"
          className="w-40 text-sm px-3 py-2 rounded-lg border border-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 text-slate-700 placeholder:text-slate-300"
        />
      )

    case 'data':
      return (
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-40 text-sm px-3 py-2 rounded-lg border border-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 text-slate-700"
        />
      )

    case 'arquivo':
      return (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer transition text-sm text-slate-600">
            <UploadCloud className="w-4 h-4" />
            {value ? 'Trocar arquivo' : 'Anexar arquivo'}
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  onChange({ nome: file.name, size: file.size, tipo: file.type })
                }
              }}
            />
          </label>
          {value?.nome && (
            <span className="text-sm text-slate-600 flex items-center gap-1">
              <FileText className="w-4 h-4 text-blue-500" />
              {value.nome}
            </span>
          )}
        </div>
      )

    default:
      return null
  }
}

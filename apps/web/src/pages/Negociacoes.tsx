import SearchField from '../components/ui/SearchField'
import FilterBar from '../components/ui/FilterBar'
import PageHeader from '../components/ui/PageHeader'
// ============================================================
// Negociacoes — visão global do Deal Room (todos os clientes).
// Útil pro Christian ver todas as negociações ativas em um só
// lugar, com filtros por status e busca por credor/cliente.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import type { ClienteSummary as Cliente } from '../types/cliente'
import { DSCard, DSStatCard, DSEmpty, DSTable, DSBadge, DSButton } from '../components/ds'
import {
  Building2,
  Calendar,
  Search,
  TrendingDown,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

interface Negociacao {
  id: string
  clienteId: string
  credor: string
  status: string
  responsavel?: string
  valorAtual?: string
  valorProposto?: string
  taxaAtual?: string
  taxaProposta?: string
  prazoMeses?: number
  proximaData?: string
  ultimaInteracao?: string
}

const STATUSES = ['todos', 'negociando', 'contraproposta', 'aguardando_doc', 'aprovado', 'recusado', 'encerrado', 'suspenso']
const STATUS_LABEL: Record<string, string> = { ativas: 'Ativas', todos: 'Todas', negociando: 'Negociando', contraproposta: 'Contraproposta', aguardando_doc: 'Aguardando documentos', aprovado: 'Aprovadas', recusado: 'Recusadas', encerrado: 'Encerradas', suspenso: 'Suspensas' }
const STATUS_TONE: Record<string, 'info' | 'warning' | 'positive' | 'negative' | 'neutral'> = {
  negociando: 'info',
  contraproposta: 'warning',
  aguardando_doc: 'warning',
  aprovado: 'positive',
  recusado: 'negative',
  encerrado: 'neutral',
  suspenso: 'neutral',
}

const fmtBRL = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : v
  if (!n || !Number.isFinite(n)) return '—'
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Negociacoes() {
  const navigate = useNavigate()
  const [list, setList] = useState<Negociacao[]>([])
  const [clientes, setClientes] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverResumo, setServerResumo] = useState<{ total: number; porStatus: Record<string, number>; valorEmNegociacao: string; economiaProjetada: string; proximoDeadline: { credor: string; data: string } | null } | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('ativas')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      apiFetch<Negociacao[]>('/deal-room/negociacoes'),
      apiFetch<Cliente[]>('/clientes'),
      apiFetch<typeof serverResumo>('/deal-room/resumo'),
    ]).then(([r1, r2, r3]) => {
      if (r1.status === 'fulfilled') setList(r1.value ?? [])
      else setError(r1.reason instanceof Error ? r1.reason.message : String(r1.reason))
      if (r2.status === 'fulfilled') {
        const m = new Map<string, string>()
        for (const c of r2.value ?? []) m.set(c.id, c.nome)
        setClientes(m)
      }
      if (r3?.status === 'fulfilled') setServerResumo(r3.value)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter((n) => {
      // status
      if (filterStatus === 'ativas') {
        if (!['negociando', 'contraproposta', 'aguardando_doc'].includes(n.status)) return false
      } else if (filterStatus !== 'todos') {
        if (n.status !== filterStatus) return false
      }
      // search
      if (q) {
        const cliNome = (clientes.get(n.clienteId) ?? '').toLowerCase()
        const hay = [n.credor, cliNome, n.responsavel ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [list, clientes, filterStatus, search])

  const resumoLocal = useMemo(() => {
    const ativos = list.filter((n) => ['negociando', 'contraproposta', 'aguardando_doc'].includes(n.status))
    const valorTotal = ativos.reduce((sum, n) => sum + (Number(n.valorAtual) || 0), 0)
    const economiaProjetada = ativos.reduce((sum, n) => {
      const a = Number(n.valorAtual) || 0
      const p = Number(n.valorProposto) || 0
      return sum + (a > p ? a - p : 0)
    }, 0)
    const aprovadas = list.filter((n) => n.status === 'aprovado').length
    const proximoDeadline = ativos
      .filter((n) => n.proximaData)
      .sort((a, b) => (a.proximaData! > b.proximaData! ? 1 : -1))[0]
    return {
      totalAtivas: ativos.length,
      totalGeral: list.length,
      valorTotal,
      economiaProjetada,
      aprovadas,
      proximoDeadline,
    }
  }, [list])
  const resumo = serverResumo
    ? { totalAtivas: ['negociando', 'contraproposta', 'aguardando_doc'].reduce((sum, status) => sum + (serverResumo.porStatus[status] ?? 0), 0), totalGeral: serverResumo.total, valorTotal: Number(serverResumo.valorEmNegociacao), economiaProjetada: Number(serverResumo.economiaProjetada), aprovadas: serverResumo.porStatus.aprovado ?? 0, proximoDeadline: serverResumo.proximoDeadline ? { proximaData: serverResumo.proximoDeadline.data, credor: serverResumo.proximoDeadline.credor } : null }
    : resumoLocal

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title={<>Negociações</>} description={<> <p className="text-sm font-body text-muted-foreground dark:text-white/60 mt-0.5">
              Visão consolidada de todas as negociações por credor em todos os clientes.
            </p> </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DSStatCard
          label="Negociações ativas"
          value={resumo.totalAtivas}
          hint={`${resumo.totalGeral} total`}
          tone="info"
          icon={<Building2 className="w-4 h-4" />}
        />
        <DSStatCard
          label="Valor em negociação"
          value={fmtBRL(resumo.valorTotal)}
          tone="warning"
          icon={<TrendingDown className="w-4 h-4" />}
        />
        <DSStatCard
          label="Economia projetada"
          value={fmtBRL(resumo.economiaProjetada)}
          hint="se contrapropostas aceitas"
          tone="positive"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <DSStatCard
          label="Próximo prazo"
          value={
            resumo.proximoDeadline?.proximaData
              ? new Date(resumo.proximoDeadline.proximaData).toLocaleDateString('pt-BR')
              : '—'
          }
          hint={resumo.proximoDeadline?.credor}
          tone={resumo.proximoDeadline ? 'warning' : 'neutral'}
          icon={<Calendar className="w-4 h-4" />}
        />
      </div>

      <FilterBar activeCount={Number(Boolean(search.trim())) + Number(filterStatus !== 'todos')} onClear={() => {setSearch('');setFilterStatus('todos')}}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SearchField label="Buscar negociações" value={search} onChange={setSearch} placeholder="Credor, cliente ou responsável" />
          <label className="text-xs font-medium text-muted-foreground">Situação<select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="input-field mt-1.5 block w-full sm:w-60">{['ativas',...STATUSES].map(status=><option value={status} key={status}>{STATUS_LABEL[status] ?? status}</option>)}</select></label>
        </div>
      </FilterBar>
      <p role="status" className="text-xs text-muted-foreground">{loading ? 'Carregando negociações…' : filtered.length+' negociações · '+(STATUS_LABEL[filterStatus] ?? filterStatus)}</p>

      {error && (
        <DSCard className="border-red-300 bg-red-50/30 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </DSCard>
      )}

      {loading ? (
        <DSCard>
          <div className="h-32 bg-aletis-borda/30 rounded animate-pulse" />
        </DSCard>
      ) : filtered.length === 0 ? (
        <DSCard>
          <DSEmpty
            icon={<AlertTriangle className="w-5 h-5" />}
            title={list.length === 0 ? 'Nenhuma negociação ainda' : 'Nenhuma negociação para este filtro'}
            description={
              list.length === 0
                ? 'Abra um cliente e acesse Negociação → Negociações por credor.'
                : 'Tente outro status ou limpe a busca.'
            }
          />
        </DSCard>
      ) : (
        <DSCard className="!p-0 overflow-hidden">
          <DSTable<Negociacao>
            dense
            columns={[
              {
                key: 'cliente',
                label: 'Cliente',
                render: (n) => (
                  <Link
                    to={`/clientes/${n.clienteId}/deal-room?neg=${n.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-foreground hover:underline font-semibold"
                  >
                    {clientes.get(n.clienteId) ?? n.clienteId}
                  </Link>
                ),
              },
              { key: 'credor', label: 'Credor', render: (n) => <span className="font-mono">{n.credor}</span> },
              {
                key: 'status',
                label: 'Status',
                render: (n) => <DSBadge tone={STATUS_TONE[n.status] ?? 'neutral'}>{STATUS_LABEL[n.status] ?? n.status}</DSBadge>,
              },
              {
                key: 'valor',
                label: 'Valor (atual → proposto)',
                align: 'right',
                render: (n) => (
                  <span className="font-mono">
                    {fmtBRL(n.valorAtual)}
                    {n.valorProposto && (
                      <>
                        {' → '}
                        <span className="text-positivo">{fmtBRL(n.valorProposto)}</span>
                      </>
                    )}
                  </span>
                ),
              },
              {
                key: 'taxa',
                label: 'Taxa',
                align: 'right',
                render: (n) =>
                  n.taxaAtual ? (
                    <span className="font-mono text-xs">
                      {Number(n.taxaAtual).toFixed(2)}%
                      {n.taxaProposta && (
                        <>
                          {' → '}
                          <span className="text-positivo">{Number(n.taxaProposta).toFixed(2)}%</span>
                        </>
                      )}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'prazo',
                label: 'Prazo',
                align: 'right',
                render: (n) => (n.prazoMeses ? `${n.prazoMeses}m` : '—'),
              },
              {
                key: 'deadline',
                label: 'Deadline',
                align: 'right',
                render: (n) =>
                  n.proximaData ? new Date(n.proximaData).toLocaleDateString('pt-BR') : '—',
              },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (n) => (
                  <DSButton
                    variant="ghost"
                    size="sm"
                    onClick={(e: any) => {
                      e?.stopPropagation?.()
                      navigate(`/clientes/${n.clienteId}/deal-room?neg=${n.id}`)
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </DSButton>
                ),
              },
            ]}
            rows={filtered}
            rowKey={(n) => n.id}
            onRowClick={(n) => navigate(`/clientes/${n.clienteId}/deal-room?neg=${n.id}`)}
          />
        </DSCard>
      )}
    </div>
  )
}

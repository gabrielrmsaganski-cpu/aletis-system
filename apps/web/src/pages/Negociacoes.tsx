// ============================================================
// Negociacoes — visão global do Deal Room (todos os clientes).
// Útil pro Christian ver todas as negociações ativas em um só
// lugar, com filtros por status e busca por credor/cliente.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
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

interface Cliente {
  id: string
  nome: string
}

const STATUSES = ['todos', 'negociando', 'contraproposta', 'aguardando_doc', 'aprovado', 'recusado', 'encerrado', 'suspenso']
const STATUS_TONE: Record<string, any> = {
  negociando: 'info',
  contraproposta: 'warning',
  aguardando_doc: 'warning',
  aprovado: 'positive',
  recusado: 'negative',
  encerrado: 'neutral',
  suspenso: 'neutral',
}

const fmtBRL = (v: any) => {
  const n = typeof v === 'string' ? Number(v) : v
  if (!n || !Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export default function Negociacoes() {
  const navigate = useNavigate()
  const [list, setList] = useState<Negociacao[]>([])
  const [clientes, setClientes] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('ativas')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      apiFetch<Negociacao[]>('/deal-room/negociacoes'),
      apiFetch<Cliente[]>('/clientes'),
    ]).then(([r1, r2]) => {
      if (r1.status === 'fulfilled') setList(r1.value ?? [])
      else setError(String((r1.reason as any)?.message ?? r1.reason))
      if (r2.status === 'fulfilled') {
        const m = new Map<string, string>()
        for (const c of r2.value ?? []) m.set(c.id, c.nome)
        setClientes(m)
      }
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

  const resumo = useMemo(() => {
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

  return (
    <div className="space-y-4 animate-fade-in">
      <DSCard>
        <div className="flex items-start gap-3">
          <Building2 className="w-5 h-5 text-aletis-verde mt-0.5" />
          <div>
            <h1 className="text-xl font-display font-bold text-aletis-grafite-escuro dark:text-white tracking-tight">
              Negociações — Deal Room global
            </h1>
            <p className="text-sm font-body text-aletis-grafite-claro dark:text-white/60 mt-0.5">
              Visão consolidada de todas as negociações por credor em todos os clientes.
            </p>
          </div>
        </div>
      </DSCard>

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
          label="Próximo deadline"
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

      <DSCard>
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-medio pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar credor, cliente ou responsável…"
              className="w-full pl-10 pr-3 py-2 text-sm font-body rounded-lg border border-aletis-borda focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/20 dark:bg-white/5 dark:border-white/10 dark:text-white"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[{ id: 'ativas', label: 'Ativas' }, ...STATUSES.map((s) => ({ id: s, label: s }))].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterStatus(f.id)}
                className={`px-2.5 py-1 text-[11px] font-body font-semibold uppercase rounded-full transition-colors ${
                  filterStatus === f.id
                    ? 'bg-aletis-verde text-white'
                    : 'bg-aletis-borda/60 text-aletis-grafite-escuro hover:bg-aletis-bege dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </DSCard>

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
                ? 'Abra a primeira negociação dentro de um cliente — Command Center → Deal Room.'
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
                    className="text-aletis-verde hover:underline font-semibold"
                  >
                    {clientes.get(n.clienteId) ?? n.clienteId}
                  </Link>
                ),
              },
              { key: 'credor', label: 'Credor', render: (n) => <span className="font-mono">{n.credor}</span> },
              {
                key: 'status',
                label: 'Status',
                render: (n) => <DSBadge tone={STATUS_TONE[n.status] ?? 'neutral'}>{n.status}</DSBadge>,
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

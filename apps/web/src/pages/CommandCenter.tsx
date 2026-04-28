// ============================================================
// CommandCenter — cockpit operacional por cliente
// ============================================================
// Uma única visão consolidando: dívida ativa, próximos passos,
// credores em negociação (Deal Room), documentos pendentes,
// risco/score e atividade ALIX recente.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import { DSCard, DSStatCard, DSEmpty, DSTable, DSBadge, DSButton } from '../components/ds'
import {
  ArrowLeft,
  TrendingDown,
  AlertCircle,
  Building2,
  FileWarning,
  Sparkles,
  Activity,
  Calendar,
  Plus,
  ExternalLink,
  Send,
  FileText,
  ChevronRight,
} from 'lucide-react'

interface Cliente {
  id: string
  nome: string
  cpfCnpj?: string
  cidade?: string
  uf?: string
  estagio?: string
  consultor?: string
  credor?: string
  valorTotalDivida?: number
  valorTotalPago?: number
  areaTotalHa?: number
  culturas?: string[]
  ultimaAtualizacao?: string
}

interface Negociacao {
  id: string
  credor: string
  status: string
  valorAtual?: string
  valorProposto?: string
  taxaAtual?: string
  taxaProposta?: string
  prazoMeses?: number
  proximaData?: string
  responsavel?: string
}

interface Insight {
  id: string
  tipo: string
  urgencia: 'info' | 'importante' | 'critico'
  titulo: string
  ts: string
}

interface ContextHint {
  pendentes: number
  criticos: number
  importantes: number
  insights: Insight[]
  sugestao: string | null
}

const fmtBRL = (v: number | undefined | null) => {
  if (v == null || !Number.isFinite(v)) return '—'
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)} bi`
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(2)} mi`
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`
  return `R$ ${v.toFixed(0)}`
}

const STATUS_TONE: Record<string, 'positive' | 'warning' | 'neutral' | 'negative' | 'info' | 'gold'> = {
  negociando: 'info',
  contraproposta: 'warning',
  aguardando_doc: 'warning',
  aprovado: 'positive',
  recusado: 'negative',
  encerrado: 'neutral',
  suspenso: 'neutral',
}

export default function CommandCenter() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([])
  const [contextHint, setContextHint] = useState<ContextHint | null>(null)
  const [resumoNeg, setResumoNeg] = useState<{
    total: number
    porStatus: Record<string, number>
    valorEmNegociacao: number
    proximoDeadline: { credor: string; data: string } | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.allSettled([
      apiFetch<Cliente>(`/api/clientes/${id}`),
      apiFetch<{ negociacoes: Negociacao[]; resumo: any }>(`/api/deal-room/cliente/${id}`),
      apiFetch<ContextHint>(`/api/alix/context-hint`, {
        method: 'POST',
        body: JSON.stringify({ clienteId: id, tela: 'command-center' }),
      }),
    ]).then((results) => {
      const [r1, r2, r3] = results
      if (r1.status === 'fulfilled') setCliente(r1.value)
      else setError(r1.reason?.message ?? String(r1.reason))
      if (r2.status === 'fulfilled') {
        setNegociacoes(r2.value.negociacoes ?? [])
        setResumoNeg(r2.value.resumo ?? null)
      }
      if (r3.status === 'fulfilled') setContextHint(r3.value)
      setLoading(false)
    })
  }, [id])

  const ativos = useMemo(
    () =>
      negociacoes.filter((n) =>
        ['negociando', 'contraproposta', 'aguardando_doc'].includes(n.status),
      ),
    [negociacoes],
  )

  const economiaProjetada = useMemo(() => {
    let saved = 0
    for (const n of ativos) {
      const a = Number(n.valorAtual ?? 0)
      const p = Number(n.valorProposto ?? 0)
      if (a && p && a > p) saved += a - p
    }
    return saved
  }, [ativos])

  if (!id) {
    return (
      <div className="p-8">
        <DSEmpty title="Cliente não especificado" description="Acesse o Command Center pela URL /clientes/:id/command-center" />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <div className="h-8 w-1/2 bg-aletis-borda/40 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-aletis-borda/30 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !cliente) {
    return (
      <DSEmpty
        icon={<AlertCircle className="w-6 h-6" />}
        title="Cliente não encontrado"
        description={error || 'O sistema não retornou dados para este cliente.'}
        cta={
          <DSButton variant="secondary" onClick={() => navigate('/crm')}>
            <ArrowLeft className="w-4 h-4" /> Voltar ao CRM
          </DSButton>
        }
      />
    )
  }

  const recuperacaoPct =
    cliente.valorTotalPago && cliente.valorTotalDivida
      ? (cliente.valorTotalPago / cliente.valorTotalDivida) * 100
      : 0

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── HEADER ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to={`/clientes/${id}`}
            className="text-sm font-body text-aletis-grafite-claro hover:text-aletis-verde inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao detalhe
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <DSButton variant="secondary" size="sm" onClick={() => navigate(`/contratos-oficiais`)}>
            <FileText className="w-4 h-4" /> Contratos oficiais
          </DSButton>
          <DSButton variant="primary" size="sm" onClick={() => alert('Em breve: enviar magic-link do portal direto daqui')}>
            <Send className="w-4 h-4" /> Magic-link portal
          </DSButton>
        </div>
      </div>

      <DSCard>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-aletis-verde to-aletis-dourado flex items-center justify-center text-white font-display font-bold text-xl">
            {cliente.nome.split(' ').map((w) => w[0]).slice(0, 2).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-display font-bold text-aletis-grafite-escuro dark:text-white tracking-tight">
                {cliente.nome}
              </h1>
              {cliente.estagio && <DSBadge tone="info">{cliente.estagio}</DSBadge>}
            </div>
            <p className="text-sm font-body text-aletis-grafite-claro dark:text-white/60 mt-1">
              {[cliente.cpfCnpj, cliente.cidade && `${cliente.cidade}/${cliente.uf ?? ''}`, cliente.consultor]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="text-[11px] font-body text-aletis-grafite-medio dark:text-white/40 mt-0.5">
              {cliente.areaTotalHa && `${cliente.areaTotalHa} ha`}
              {cliente.culturas?.length && ` · ${cliente.culturas.join(', ')}`}
              {cliente.credor && ` · Credor: ${cliente.credor}`}
            </p>
          </div>
        </div>
      </DSCard>

      {/* ── KPI CARDS ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DSStatCard
          label="Dívida total"
          value={fmtBRL(cliente.valorTotalDivida)}
          hint={`${recuperacaoPct.toFixed(1)}% recuperado`}
          icon={<TrendingDown className="w-4 h-4" />}
          tone={cliente.valorTotalDivida && cliente.valorTotalDivida > 1e6 ? 'warning' : 'neutral'}
        />
        <DSStatCard
          label="Em negociação"
          value={fmtBRL(resumoNeg?.valorEmNegociacao)}
          hint={`${ativos.length} credor${ativos.length !== 1 ? 'es' : ''}`}
          icon={<Building2 className="w-4 h-4" />}
          tone="info"
          onClick={() => navigate(`/clientes/${id}/deal-room`)}
        />
        <DSStatCard
          label="Insights pendentes"
          value={contextHint?.pendentes ?? 0}
          hint={
            contextHint && contextHint.criticos > 0
              ? `${contextHint.criticos} crítico${contextHint.criticos > 1 ? 's' : ''}`
              : 'sem urgências'
          }
          icon={<Sparkles className="w-4 h-4" />}
          tone={contextHint && contextHint.criticos > 0 ? 'negative' : 'positive'}
        />
        <DSStatCard
          label="Próximo deadline"
          value={
            resumoNeg?.proximoDeadline
              ? new Date(resumoNeg.proximoDeadline.data).toLocaleDateString('pt-BR')
              : '—'
          }
          hint={resumoNeg?.proximoDeadline?.credor}
          icon={<Calendar className="w-4 h-4" />}
          tone={resumoNeg?.proximoDeadline ? 'warning' : 'neutral'}
        />
      </div>

      {/* ── 2 COLUNAS: NEGOCIAÇÕES | INSIGHTS+AÇÕES ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coluna 1-2: Deal Room (negociações por credor) */}
        <div className="lg:col-span-2 space-y-4">
          <DSCard>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-aletis-verde" />
                <h2 className="text-sm font-display font-semibold text-aletis-grafite-escuro dark:text-white">
                  Deal Room — Negociações por Credor
                </h2>
              </div>
              <Link
                to={`/clientes/${id}/deal-room`}
                className="text-xs font-body text-aletis-verde hover:underline inline-flex items-center gap-0.5"
              >
                ver tudo <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {ativos.length === 0 ? (
              <DSEmpty
                icon={<Building2 className="w-5 h-5" />}
                title="Nenhuma negociação ativa"
                description="Abra um deal room por credor para acompanhar status, contrapropostas e prazos."
                cta={
                  <DSButton variant="primary" size="sm" onClick={() => navigate(`/clientes/${id}/deal-room?new=1`)}>
                    <Plus className="w-4 h-4" /> Abrir negociação
                  </DSButton>
                }
              />
            ) : (
              <DSTable
                dense
                columns={[
                  { key: 'credor', label: 'Credor' },
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
                        {fmtBRL(n.valorAtual ? Number(n.valorAtual) : null)}
                        {n.valorProposto ? <> → <span className="text-positivo">{fmtBRL(Number(n.valorProposto))}</span></> : null}
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
                          {n.taxaProposta ? <> → <span className="text-positivo">{Number(n.taxaProposta).toFixed(2)}%</span></> : null}
                        </span>
                      ) : (
                        '—'
                      ),
                  },
                  {
                    key: 'proxima',
                    label: 'Próx. deadline',
                    align: 'right',
                    render: (n) =>
                      n.proximaData ? new Date(n.proximaData).toLocaleDateString('pt-BR') : '—',
                  },
                ]}
                rows={ativos}
                rowKey={(n) => n.id}
                onRowClick={(n) => navigate(`/clientes/${id}/deal-room?neg=${n.id}`)}
              />
            )}
          </DSCard>

          {economiaProjetada > 0 && (
            <DSCard className="border-positivo/40 bg-positivo/5 dark:bg-positivo/10">
              <p className="text-xs font-body text-aletis-grafite-claro dark:text-white/60 uppercase tracking-wider">
                Economia projetada (se contrapropostas aceitas)
              </p>
              <p className="text-2xl font-display font-bold text-positivo mt-1">{fmtBRL(economiaProjetada)}</p>
            </DSCard>
          )}
        </div>

        {/* Coluna 3: Insights + ações ALIX */}
        <div className="space-y-4">
          <DSCard>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-aletis-dourado" />
              <h2 className="text-sm font-display font-semibold text-aletis-grafite-escuro dark:text-white">
                Próximos passos sugeridos
              </h2>
            </div>
            {contextHint && contextHint.sugestao ? (
              <p className="text-sm font-body italic text-aletis-grafite-escuro dark:text-white/90 mb-3">
                {contextHint.sugestao}
              </p>
            ) : null}
            {contextHint && contextHint.insights.length > 0 ? (
              <ul className="space-y-2">
                {contextHint.insights.slice(0, 5).map((i) => (
                  <li key={i.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={
                        i.urgencia === 'critico'
                          ? 'text-red-500 mt-0.5'
                          : i.urgencia === 'importante'
                          ? 'text-ambar mt-0.5'
                          : 'text-aletis-grafite-medio mt-0.5'
                      }
                    >
                      ●
                    </span>
                    <span className="text-aletis-grafite-escuro dark:text-white/90 leading-snug">
                      {i.titulo}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <DSEmpty title="Sem pendências" description="Todos os insights estão respondidos." />
            )}
          </DSCard>

          <DSCard>
            <div className="flex items-center gap-2 mb-3">
              <FileWarning className="w-4 h-4 text-ambar" />
              <h2 className="text-sm font-display font-semibold text-aletis-grafite-escuro dark:text-white">
                Documentos
              </h2>
            </div>
            <div className="space-y-2 text-xs">
              <Link
                to={`/clientes/${id}#contratos-oficiais`}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-aletis-bege/40 dark:hover:bg-white/5"
              >
                <span className="text-aletis-grafite-escuro dark:text-white/90">Contratos & anexos oficiais</span>
                <ExternalLink className="w-3 h-3 text-aletis-grafite-medio" />
              </Link>
              <Link
                to={`/clientes/${id}#documentos`}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-aletis-bege/40 dark:hover:bg-white/5"
              >
                <span className="text-aletis-grafite-escuro dark:text-white/90">Documentos do cliente</span>
                <ExternalLink className="w-3 h-3 text-aletis-grafite-medio" />
              </Link>
              <Link
                to={`/clientes/${id}#patrimonio`}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-aletis-bege/40 dark:hover:bg-white/5"
              >
                <span className="text-aletis-grafite-escuro dark:text-white/90">Patrimônio & garantias</span>
                <ExternalLink className="w-3 h-3 text-aletis-grafite-medio" />
              </Link>
            </div>
          </DSCard>

          <DSCard>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-aletis-verde" />
              <h2 className="text-sm font-display font-semibold text-aletis-grafite-escuro dark:text-white">
                ALIX
              </h2>
            </div>
            <p className="text-xs font-body text-aletis-grafite-claro dark:text-white/60 mb-3">
              Toda resposta do ALIX deste cliente leva auditoria de fontes e confiança.
            </p>
            <DSButton
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => navigate(`/alix?cliente=${id}`)}
            >
              Abrir conversa com ALIX <ChevronRight className="w-3 h-3" />
            </DSButton>
          </DSCard>
        </div>
      </div>
    </div>
  )
}

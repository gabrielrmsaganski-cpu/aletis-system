// ============================================================
// ClientePropostasTab — lista de propostas reais do cliente
// (substitui o placeholder antigo).
// ============================================================
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../hooks/useApi'
import { DSCard, DSStatCard, DSEmpty, DSTable, DSBadge, DSButton } from '../ds'
import { FileText, Plus, ExternalLink, TrendingDown, Calendar, CheckCircle2 } from 'lucide-react'

interface Proposta {
  id: string
  apiId?: string
  clienteId: string
  clienteNome?: string
  credor?: string
  titulo: string
  tipo?: string
  status: 'rascunho' | 'enviada' | 'aceita' | 'rejeitada' | 'expirada' | string
  valorDivida?: number
  valorProposta?: number
  descontoPercentual?: number
  dataCriacao?: string
  dataValidade?: string
  ultimaAtualizacao?: string
}

const STATUS_TONE: Record<string, 'positive' | 'warning' | 'neutral' | 'negative' | 'info' | 'gold'> = {
  rascunho: 'neutral',
  enviada: 'info',
  aceita: 'positive',
  rejeitada: 'negative',
  expirada: 'warning',
}

const TIPO_LABEL: Record<string, string> = {
  liquidacao: 'Liquidação',
  reestruturacao: 'Reestruturação',
  carencia: 'Carência',
  refinanciamento: 'Refinanciamento',
}

const fmtBRL = (v: number | undefined | null) => {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

const fmtDate = (s: string | undefined) => {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('pt-BR')
  } catch {
    return s
  }
}

interface Props {
  clienteId: string
  onGerarProposta?: () => void
}

export default function ClientePropostasTab({ clienteId, onGerarProposta }: Props) {
  const [list, setList] = useState<Proposta[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId) return
    apiFetch<Proposta[]>(`/propostas?clienteId=${encodeURIComponent(clienteId)}`)
      .then((d) => setList(d ?? []))
      .catch((err) => setError(String(err?.message || err)))
  }, [clienteId])

  if (error) {
    return (
      <DSCard className="border-red-300 bg-red-50/30 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300">Erro carregando propostas: {error}</p>
      </DSCard>
    )
  }

  if (list === null) {
    return (
      <DSCard>
        <div className="h-32 bg-aletis-borda/30 rounded animate-pulse" />
      </DSCard>
    )
  }

  if (list.length === 0) {
    return (
      <DSCard>
        <DSEmpty
          icon={<FileText className="w-6 h-6" />}
          title="Sem propostas para este cliente"
          description="Gere a primeira proposta de reestruturação — ela aparecerá aqui com status, valor e descontos."
          cta={
            onGerarProposta && (
              <DSButton variant="primary" onClick={onGerarProposta}>
                <Plus className="w-4 h-4" /> Gerar nova proposta
              </DSButton>
            )
          }
        />
      </DSCard>
    )
  }

  // KPIs agregados
  const aceitas = list.filter((p) => p.status === 'aceita').length
  const ativas = list.filter((p) => p.status === 'enviada' || p.status === 'rascunho').length
  const valorTotal = list.reduce((s, p) => s + (p.valorProposta || 0), 0)
  const economiaTotal = list.reduce((s, p) => s + Math.max(0, (p.valorDivida || 0) - (p.valorProposta || 0)), 0)

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DSStatCard
          label="Total propostas"
          value={list.length}
          hint={`${aceitas} aceitas · ${ativas} ativas`}
          tone="info"
          icon={<FileText className="w-4 h-4" />}
        />
        <DSStatCard
          label="Valor proposto"
          value={fmtBRL(valorTotal)}
          tone="info"
          icon={<TrendingDown className="w-4 h-4" />}
        />
        <DSStatCard
          label="Desconto agregado"
          value={fmtBRL(economiaTotal)}
          hint={
            list.reduce((s, p) => s + (p.valorDivida || 0), 0) > 0
              ? `${((economiaTotal / list.reduce((s, p) => s + (p.valorDivida || 0), 0)) * 100).toFixed(1)}% de redução`
              : undefined
          }
          tone="positive"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <DSStatCard
          label="Última atualização"
          value={
            list.length > 0
              ? fmtDate(
                  list
                    .map((p) => p.ultimaAtualizacao || p.dataCriacao || '')
                    .filter(Boolean)
                    .sort()
                    .reverse()[0],
                )
              : '—'
          }
          tone="neutral"
          icon={<Calendar className="w-4 h-4" />}
        />
      </div>

      <DSCard className="!p-0 overflow-hidden">
        <DSTable<Proposta>
          dense
          columns={[
            {
              key: 'titulo',
              label: 'Proposta',
              render: (p) => (
                <div className="min-w-0">
                  <p className="font-display font-semibold text-aletis-grafite-escuro dark:text-white truncate">
                    {p.titulo}
                  </p>
                  <p className="text-[11px] text-aletis-grafite-claro dark:text-white/60 truncate">
                    {[p.credor, TIPO_LABEL[p.tipo ?? ''] ?? p.tipo].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              render: (p) => <DSBadge tone={STATUS_TONE[p.status] ?? 'neutral'}>{p.status}</DSBadge>,
            },
            {
              key: 'valor',
              label: 'Dívida → Proposta',
              align: 'right',
              render: (p) => (
                <span className="font-mono text-xs">
                  {fmtBRL(p.valorDivida)}
                  {p.valorProposta != null && (
                    <>
                      {' → '}
                      <span className="text-positivo">{fmtBRL(p.valorProposta)}</span>
                    </>
                  )}
                </span>
              ),
            },
            {
              key: 'desconto',
              label: 'Desconto',
              align: 'right',
              render: (p) =>
                p.descontoPercentual != null && p.descontoPercentual > 0
                  ? `${p.descontoPercentual.toFixed(1)}%`
                  : '—',
            },
            {
              key: 'validade',
              label: 'Validade',
              align: 'right',
              render: (p) => fmtDate(p.dataValidade),
            },
            {
              key: 'actions',
              label: '',
              align: 'right',
              render: (p) => (
                <Link
                  to={`/propostas?id=${encodeURIComponent(p.id)}`}
                  className="inline-flex items-center gap-1 text-xs text-aletis-verde hover:underline"
                >
                  abrir <ExternalLink className="w-3 h-3" />
                </Link>
              ),
            },
          ]}
          rows={list}
          rowKey={(p) => p.id}
        />
      </DSCard>

      {onGerarProposta && (
        <div className="flex justify-end">
          <DSButton variant="primary" onClick={onGerarProposta}>
            <Plus className="w-4 h-4" /> Gerar nova proposta
          </DSButton>
        </div>
      )}
    </div>
  )
}

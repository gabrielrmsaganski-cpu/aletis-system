// ============================================================
// ClienteDocumentosTab — listagem + upload de documentos do cliente
// ============================================================
// Substitui o placeholder anterior. Usa /api/clientes/:id/documentos
// que reusa portal_upload (cofre digital, com controle de duplicidade
// via SHA256 e categorização por tipo).
// ============================================================
import { useEffect, useState, useRef, useMemo } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { DSCard, DSStatCard, DSEmpty, DSTable, DSBadge, DSButton } from '../ds'
import {
  FileCheck,
  Upload,
  Download,
  Trash2,
  FileText,
  AlertCircle,
  Filter,
  Hash,
} from 'lucide-react'

interface Documento {
  id: string
  nome: string
  mime: string
  tamanho: number
  categoria: string
  enviadoPor: 'cliente' | 'consultor'
  enviadoEm: string
  sha256?: string
  downloadUrl: string
}

const CATEGORIAS: Array<{ id: string; label: string; tone: 'positive' | 'warning' | 'neutral' | 'negative' | 'info' | 'gold' }> = [
  { id: 'fiscal', label: 'Fiscal', tone: 'gold' },
  { id: 'contrato', label: 'Contratos', tone: 'info' },
  { id: 'identidade', label: 'Identidade', tone: 'neutral' },
  { id: 'patrimonio', label: 'Patrimônio', tone: 'positive' },
  { id: 'agro', label: 'Agro', tone: 'positive' },
  { id: 'outros', label: 'Outros', tone: 'neutral' },
]

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.label]))
const CAT_TONE: Record<string, any> = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.tone]))

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return s
  }
}

interface Props {
  clienteId: string
}

export default function ClienteDocumentosTab({ clienteId }: Props) {
  const [list, setList] = useState<Documento[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filterCat, setFilterCat] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadCategoria, setUploadCategoria] = useState<string>('outros')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const reload = () => {
    setError(null)
    apiFetch<Documento[]>(`/clientes/${encodeURIComponent(clienteId)}/documentos`)
      .then(setList)
      .catch((err) => setError(String(err?.message || err)))
  }
  useEffect(reload, [clienteId])

  const filtered = useMemo(() => {
    if (!list) return null
    if (!filterCat) return list
    return list.filter((d) => d.categoria === filterCat)
  }, [list, filterCat])

  const counts = useMemo(() => {
    if (!list) return null
    const out: Record<string, number> = {}
    for (const d of list) out[d.categoria] = (out[d.categoria] ?? 0) + 1
    const totalBytes = list.reduce((s, d) => s + d.tamanho, 0)
    return { porCategoria: out, totalBytes, total: list.length }
  }, [list])

  async function handleUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('categoria', uploadCategoria)
      // Não usa apiFetch porque é multipart (apiFetch força application/json)
      const res = await fetch(
        `/api/clientes/${encodeURIComponent(clienteId)}/documentos?categoria=${encodeURIComponent(uploadCategoria)}`,
        { method: 'POST', body: fd },
      )
      const json = await res.json()
      if (!res.ok || json.success === false) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      reload()
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(doc: Documento) {
    if (!confirm(`Excluir "${doc.nome}"? Esta ação não pode ser desfeita.`)) return
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/documentos/${encodeURIComponent(doc.id)}`, {
        method: 'DELETE',
      })
      reload()
    } catch (err: any) {
      setError(String(err?.message || err))
    }
  }

  if (error) {
    return (
      <DSCard className="border-red-300 bg-red-50/30 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300">Erro: {error}</p>
        <DSButton variant="secondary" size="sm" onClick={reload} className="mt-2">
          Tentar novamente
        </DSButton>
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

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header com upload */}
      <DSCard>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-aletis-verde/10 flex items-center justify-center flex-shrink-0">
              <FileCheck className="w-5 h-5 text-aletis-verde" />
            </div>
            <div>
              <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro dark:text-white">
                Documentos do cliente
              </h2>
              <p className="text-xs font-body text-aletis-grafite-claro dark:text-white/60 mt-0.5">
                Cofre digital com controle de duplicidade (SHA256) e categorização por tipo.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={uploadCategoria}
              onChange={(e) => setUploadCategoria(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-body rounded-lg border border-aletis-borda dark:bg-white/5 dark:border-white/10 dark:text-white focus:outline-none focus:ring-2 focus:ring-aletis-verde/20"
            >
              {CATEGORIAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
              }}
            />
            <DSButton
              variant="primary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4" /> {uploading ? 'Enviando…' : 'Upload'}
            </DSButton>
          </div>
        </div>
      </DSCard>

      {/* KPIs */}
      {counts && counts.total > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DSStatCard
            label="Total documentos"
            value={counts.total}
            tone="info"
            icon={<FileText className="w-4 h-4" />}
          />
          <DSStatCard
            label="Espaço usado"
            value={fmtBytes(counts.totalBytes)}
            tone="neutral"
          />
          <DSStatCard
            label="Categorias"
            value={Object.keys(counts.porCategoria).length}
            hint={Object.entries(counts.porCategoria)
              .map(([k, v]) => `${CAT_LABEL[k] ?? k}: ${v}`)
              .join(' · ')}
            tone="neutral"
          />
          <DSStatCard
            label="Limite por arquivo"
            value="25 MB"
            hint="MIME type validado server-side"
            tone="gold"
          />
        </div>
      )}

      {/* Filtros */}
      {counts && counts.total > 0 && (
        <DSCard className="!p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-aletis-grafite-medio" />
            <button
              type="button"
              onClick={() => setFilterCat(null)}
              className={`px-2.5 py-1 text-[11px] font-body font-semibold uppercase rounded-full transition-colors ${
                !filterCat
                  ? 'bg-aletis-verde text-white'
                  : 'bg-aletis-borda/60 text-aletis-grafite-escuro hover:bg-aletis-bege dark:bg-white/10 dark:text-white/80'
              }`}
            >
              Todos ({counts.total})
            </button>
            {CATEGORIAS.filter((c) => counts.porCategoria[c.id]).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilterCat(filterCat === c.id ? null : c.id)}
                className={`px-2.5 py-1 text-[11px] font-body font-semibold uppercase rounded-full transition-colors ${
                  filterCat === c.id
                    ? 'bg-aletis-verde text-white'
                    : 'bg-aletis-borda/60 text-aletis-grafite-escuro hover:bg-aletis-bege dark:bg-white/10 dark:text-white/80'
                }`}
              >
                {c.label} ({counts.porCategoria[c.id]})
              </button>
            ))}
          </div>
        </DSCard>
      )}

      {/* Tabela ou Empty */}
      {(filtered ?? []).length === 0 ? (
        <DSCard>
          <DSEmpty
            icon={<AlertCircle className="w-6 h-6" />}
            title={
              filterCat
                ? `Nenhum documento na categoria "${CAT_LABEL[filterCat]}"`
                : 'Nenhum documento ainda'
            }
            description={
              filterCat
                ? 'Limpe o filtro acima para ver outros documentos ou faça upload nesta categoria.'
                : 'Faça o primeiro upload — contratos, RG/CPF, CCIR, ITR, comprovantes financeiros etc.'
            }
            cta={
              !filterCat && (
                <DSButton variant="primary" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4" /> Enviar primeiro documento
                </DSButton>
              )
            }
          />
        </DSCard>
      ) : (
        <DSCard className="!p-0 overflow-hidden">
          <DSTable<Documento>
            dense
            columns={[
              {
                key: 'nome',
                label: 'Documento',
                render: (d) => (
                  <div className="min-w-0 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-aletis-grafite-medio flex-shrink-0" />
                    <span className="font-display font-semibold text-aletis-grafite-escuro dark:text-white truncate">
                      {d.nome}
                    </span>
                  </div>
                ),
              },
              {
                key: 'categoria',
                label: 'Categoria',
                render: (d) => <DSBadge tone={CAT_TONE[d.categoria] ?? 'neutral'}>{CAT_LABEL[d.categoria] ?? d.categoria}</DSBadge>,
              },
              {
                key: 'tamanho',
                label: 'Tamanho',
                align: 'right',
                render: (d) => <span className="font-mono text-xs">{fmtBytes(d.tamanho)}</span>,
              },
              {
                key: 'origem',
                label: 'Origem',
                render: (d) => (
                  <span className="text-[11px] text-aletis-grafite-medio dark:text-white/50">
                    {d.enviadoPor === 'cliente' ? 'Cliente (portal)' : 'Consultor (interno)'}
                  </span>
                ),
              },
              {
                key: 'enviadoEm',
                label: 'Data',
                render: (d) => (
                  <span className="text-[11px] text-aletis-grafite-claro dark:text-white/60">
                    {fmtDate(d.enviadoEm)}
                  </span>
                ),
              },
              {
                key: 'hash',
                label: 'SHA256',
                render: (d) =>
                  d.sha256 ? (
                    <span
                      className="font-mono text-[10px] text-aletis-grafite-medio dark:text-white/40"
                      title={d.sha256}
                    >
                      <Hash className="w-2.5 h-2.5 inline -mt-0.5" /> {d.sha256.slice(0, 8)}…
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (d) => (
                  <div className="flex items-center justify-end gap-1">
                    <a
                      href={d.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded hover:bg-aletis-bege dark:hover:bg-white/5 text-aletis-verde"
                      title="Baixar"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDelete(d)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filtered ?? []}
            rowKey={(d) => d.id}
          />
        </DSCard>
      )}
    </div>
  )
}

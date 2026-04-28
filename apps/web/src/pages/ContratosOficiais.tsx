// ============================================================
// ContratosOficiais — página standalone para gerar os 10
// contratos oficiais ALETIS escolhendo um cliente do CRM.
// ============================================================
// O componente reusa <ContratosOficiaisTab> mas adiciona um
// seletor de cliente (busca por nome/CPF/cidade) no topo.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../hooks/useApi'
import ContratosOficiaisTab from '../components/contratos/ContratosOficiaisTab'
import { Search, User, FileText } from 'lucide-react'

interface ClienteListItem {
  id: string
  nome: string
  cidade?: string
  uf?: string
  cpfCnpj?: string
  estagio?: string
  consultor?: string
}

export default function ContratosOficiais() {
  const [clientes, setClientes] = useState<ClienteListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<ClienteListItem[]>('/clientes')
      .then((d) => setClientes(d))
      .catch((err) => setError(String(err?.message || err)))
  }, [])

  const filtered = useMemo(() => {
    if (!clientes) return []
    const q = search.trim().toLowerCase()
    if (!q) return clientes.slice(0, 30)
    return clientes
      .filter((c) =>
        [c.nome, c.cidade, c.uf, c.cpfCnpj, c.consultor]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q)),
      )
      .slice(0, 30)
  }, [clientes, search])

  const selected = useMemo(
    () => clientes?.find((c) => c.id === selectedId) ?? null,
    [clientes, selectedId],
  )

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ───────────────────────────────────── */}
      <div className="card-premium p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-aletis-verde to-aletis-dourado flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
              Contratos & Anexos Oficiais
            </h1>
            <p className="text-sm font-body text-aletis-grafite-claro mt-1 max-w-2xl">
              Os 10 documentos padronizados ALETIS. Escolha o cliente do CRM, selecione o
              template e o sistema preenche os dados preservando 100% da formatação,
              fontes, logos e layout original.
            </p>
          </div>
        </div>
      </div>

      {/* ── Seletor de cliente ────────────────────────────── */}
      <div className="card-premium p-5">
        <h2 className="text-xs font-body font-semibold uppercase tracking-wider text-aletis-grafite-claro mb-3">
          1. Selecione o cliente
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-medio pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ, cidade ou consultor…"
            className="w-full pl-10 pr-3 py-2.5 text-sm font-body rounded-lg border border-aletis-borda focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/20"
          />
        </div>
        {error && (
          <p className="mt-3 text-xs text-red-700">Erro carregando clientes: {error}</p>
        )}
        {clientes && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
            {filtered.map((c) => {
              const isSel = c.id === selectedId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    isSel
                      ? 'border-aletis-verde bg-aletis-verde/5 ring-2 ring-aletis-verde/20'
                      : 'border-aletis-borda hover:border-aletis-verde/40 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <User className={`w-4 h-4 flex-shrink-0 ${isSel ? 'text-aletis-verde' : 'text-aletis-grafite-medio'}`} />
                    <p className="text-sm font-display font-semibold text-aletis-grafite-escuro truncate flex-1">
                      {c.nome}
                    </p>
                  </div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro mt-0.5 ml-6 truncate">
                    {[c.cpfCnpj, [c.cidade, c.uf].filter(Boolean).join('/'), c.estagio]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="col-span-full text-sm text-aletis-grafite-medio italic py-8 text-center">
                Nenhum cliente encontrado.
              </p>
            )}
          </div>
        )}
        {selected && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-aletis-verde/10 text-sm font-body">
            <strong className="text-aletis-verde-escuro">Cliente selecionado:</strong>{' '}
            {selected.nome}
            {selected.cpfCnpj && <span className="text-aletis-grafite-medio"> · {selected.cpfCnpj}</span>}
          </div>
        )}
      </div>

      {/* ── Templates ──────────────────────────────────────── */}
      {selected ? (
        <div>
          <h2 className="text-xs font-body font-semibold uppercase tracking-wider text-aletis-grafite-claro mb-3">
            2. Escolha o documento
          </h2>
          <ContratosOficiaisTab clienteId={selected.id} />
        </div>
      ) : (
        <div className="card-premium p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-aletis-borda/40 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6 text-aletis-grafite-medio" />
          </div>
          <p className="text-sm font-body text-aletis-grafite-claro">
            Selecione um cliente acima para ver os 10 templates disponíveis.
          </p>
        </div>
      )}
    </div>
  )
}

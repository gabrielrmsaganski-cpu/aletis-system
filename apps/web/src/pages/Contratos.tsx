/**
 * Contratos — Geração de instrumentos contratuais para
 * reestruturação de dívida rural e comercialização de safra.
 *
 * Lista contratos gerados + wizard de criação por tipo (6 tipos
 * suportados: CPR-F, CPR-Física, Confissão, Renegociação, Acordo,
 * Transação Excepcional). Cada contrato gerado tem preview
 * markdown e download de PDF formal.
 */
import React, { useState, useMemo } from 'react'
import { useApi, apiFetch } from '../hooks/useApi'
import {
  FileCheck,
  Plus,
  Eye,
  Download,
  Trash2,
  FileText,
  Scale,
  Wheat,
  RefreshCw,
  Handshake,
  Banknote,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building2,
  User,
  FileSignature,
} from 'lucide-react'

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtDate = (iso?: string): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR')
}

type TipoContrato =
  | 'cpr_financeira'
  | 'cpr_fisica'
  | 'confissao_divida'
  | 'termo_renegociacao'
  | 'acordo_extrajudicial'
  | 'transacao_excepcional'

interface TipoInfo {
  tipo: TipoContrato
  titulo: string
  fundamento: string[]
  quando: string
}

interface ContratoSummary {
  id: string
  tipo: TipoContrato
  titulo: string
  dataGeracao: string
  partes: { devedor: string; credor: string }
  valorTotal: number
  dataVencimentoOrVigencia?: string
}

interface ContratoGerado extends ContratoSummary {
  conteudoMarkdown: string
  metadados: {
    clausulas: number
    fundamentoLegal: string[]
    necessarioRevisao: string[]
  }
}

const TIPO_ICON: Record<TipoContrato, React.ElementType> = {
  cpr_financeira: Banknote,
  cpr_fisica: Wheat,
  confissao_divida: FileSignature,
  termo_renegociacao: RefreshCw,
  acordo_extrajudicial: Handshake,
  transacao_excepcional: Scale,
}

const TIPO_COR: Record<TipoContrato, string> = {
  cpr_financeira: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cpr_fisica: 'bg-amber-50 text-amber-700 border-amber-200',
  confissao_divida: 'bg-purple-50 text-purple-700 border-purple-200',
  termo_renegociacao: 'bg-blue-50 text-blue-700 border-blue-200',
  acordo_extrajudicial: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  transacao_excepcional: 'bg-rose-50 text-rose-700 border-rose-200',
}

export default function Contratos() {
  const { data: tiposResp, loading: loadingTipos } = useApi<TipoInfo[]>('/contratos/tipos', [])
  const { data: contratos, loading: loadingContratos, refetch } = useApi<ContratoSummary[]>(
    '/contratos',
    []
  )
  const [showWizard, setShowWizard] = useState(false)
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoContrato | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)

  const tipos = Array.isArray(tiposResp) ? tiposResp : []

  const showToast = (tipo: 'sucesso' | 'erro', msg: string) => {
    setToast({ tipo, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const handleCriar = async (dados: any) => {
    try {
      await apiFetch('/contratos/gerar', {
        method: 'POST',
        body: JSON.stringify(dados),
      })
      showToast('sucesso', 'Contrato gerado com sucesso')
      setShowWizard(false)
      setTipoSelecionado(null)
      refetch()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao gerar contrato')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este contrato?')) return
    try {
      await apiFetch(`/contratos/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Contrato excluído')
      refetch()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao excluir')
    }
  }

  const contratosSafe = Array.isArray(contratos) ? contratos : []

  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* Header */}
      <header className="relative mb-6 overflow-hidden rounded-2xl border border-aletis-verde/20 bg-gradient-to-br from-aletis-verde via-aletis-verde to-aletis-grafite-escuro shadow-lg">
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #C9A84C 0%, transparent 35%), radial-gradient(circle at 80% 60%, #ffffff 0%, transparent 30%)' }} />
        <div className="relative flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-aletis-dourado/40 bg-aletis-dourado/10 px-3 py-1">
              <FileCheck className="h-3 w-3 text-aletis-dourado" />
              <span className="text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-aletis-dourado">
                Instrumentos Jurídicos
              </span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white lg:text-[2.5rem]">
              Contratos
            </h1>
            <p className="mt-2 max-w-2xl font-body text-sm text-white/75 lg:text-base">
              CPR Financeira, CPR Física, Confissão de Dívida, Renegociação Bancária,
              Acordo Extrajudicial e Transação Excepcional — templates juridicamente
              fundamentados prontos para revisão e assinatura.
            </p>
          </div>
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-aletis-dourado px-5 py-2.5 font-display text-sm font-semibold text-aletis-grafite-escuro shadow-md hover:bg-aletis-dourado-suave transition"
          >
            <Plus className="h-4 w-4" />
            Novo Contrato
          </button>
        </div>
      </header>

      {/* Cards de tipos */}
      <section className="mb-6">
        <h2 className="mb-3 font-display text-sm font-semibold text-aletis-grafite-escuro">
          Tipos de contrato suportados
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {loadingTipos && (
            <p className="text-xs text-aletis-grafite-claro col-span-3">Carregando…</p>
          )}
          {tipos.map((t) => {
            const Icon = TIPO_ICON[t.tipo]
            return (
              <button
                key={t.tipo}
                onClick={() => {
                  setTipoSelecionado(t.tipo)
                  setShowWizard(true)
                }}
                className="text-left rounded-xl border border-aletis-borda/60 bg-white p-4 hover:border-aletis-verde/40 hover:shadow-md transition"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${TIPO_COR[t.tipo]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro">{t.titulo}</h3>
                </div>
                <p className="text-xs font-body text-aletis-grafite-medio leading-relaxed">
                  {t.quando}
                </p>
                <p className="mt-2 text-[10px] font-body uppercase tracking-wider text-aletis-grafite-claro">
                  {t.fundamento[0]}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Lista de contratos gerados */}
      <section className="rounded-xl border border-aletis-borda/60 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-aletis-borda/40 px-5 py-3">
          <h2 className="font-display text-sm font-semibold text-aletis-grafite-escuro">
            Contratos gerados ({contratosSafe.length})
          </h2>
          <button
            onClick={refetch}
            className="text-xs font-body text-aletis-grafite-medio hover:text-aletis-verde transition inline-flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
        </div>

        {loadingContratos ? (
          <div className="p-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-aletis-verde" />
            <p className="mt-2 text-xs text-aletis-grafite-claro">Carregando contratos…</p>
          </div>
        ) : contratosSafe.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-aletis-grafite-claro" />
            <p className="mt-2 font-display text-sm font-semibold text-aletis-grafite-medio">
              Nenhum contrato gerado ainda
            </p>
            <p className="mt-1 text-xs text-aletis-grafite-claro">
              Clique em "Novo Contrato" para começar.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-aletis-borda/40">
            {contratosSafe.map((c) => {
              const Icon = TIPO_ICON[c.tipo]
              return (
                <div key={c.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`flex-shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border ${TIPO_COR[c.tipo]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-semibold text-aletis-grafite-escuro truncate">
                        {c.titulo}
                      </p>
                      <p className="text-xs font-body text-aletis-grafite-medio truncate">
                        <User className="inline h-3 w-3 mr-1" />
                        {c.partes.devedor} → {c.partes.credor}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-aletis-grafite-claro">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {fmtDate(c.dataGeracao)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Banknote className="h-3 w-3" />
                          {fmtBRL(c.valorTotal)}
                        </span>
                        {c.dataVencimentoOrVigencia && (
                          <span>Venc: {fmtDate(c.dataVencimentoOrVigencia)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewId(c.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-aletis-borda bg-white px-3 py-1.5 text-xs font-display font-semibold text-aletis-grafite-medio hover:bg-aletis-bege transition"
                      title="Visualizar"
                    >
                      <Eye className="h-3 w-3" /> Preview
                    </button>
                    <a
                      href={`/api/contratos/${c.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-aletis-verde px-3 py-1.5 text-xs font-display font-semibold text-white hover:bg-aletis-verde-escuro transition"
                      title="Baixar PDF"
                    >
                      <Download className="h-3 w-3" /> PDF
                    </a>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="inline-flex items-center justify-center rounded-lg border border-aletis-borda bg-white p-1.5 text-red-600 hover:bg-red-50 transition"
                      title="Excluir"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Wizard modal */}
      {showWizard && (
        <WizardContrato
          tipoInicial={tipoSelecionado}
          tipos={tipos}
          onClose={() => {
            setShowWizard(false)
            setTipoSelecionado(null)
          }}
          onSubmit={handleCriar}
        />
      )}

      {/* Preview modal */}
      {previewId && <PreviewModal id={previewId} onClose={() => setPreviewId(null)} />}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg border ${
            toast.tipo === 'sucesso'
              ? 'bg-green-50 border-green-300 text-green-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          {toast.tipo === 'sucesso' ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span className="font-display text-sm">{toast.msg}</span>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// WIZARD (form de geração)
// ════════════════════════════════════════════════════════════
interface WizardProps {
  tipoInicial: TipoContrato | null
  tipos: TipoInfo[]
  onClose: () => void
  onSubmit: (dados: any) => Promise<void>
}

function WizardContrato({ tipoInicial, tipos, onClose, onSubmit }: WizardProps) {
  const [tipo, setTipo] = useState<TipoContrato>(tipoInicial ?? 'cpr_financeira')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    // Devedor
    devedorNome: '',
    devedorCpf: '',
    devedorEndereco: '',
    devedorCidade: '',
    devedorUf: '',
    // Credor
    credorNome: '',
    credorCpf: '',
    credorEndereco: '',
    credorCidade: '',
    credorUf: '',
    // Comum
    local: '',
    uf: '',
    dataAssinatura: new Date().toISOString().slice(0, 10),
    observacoes: '',
    foro: '',
    // CPR
    cprProduto: '',
    cprQuantidade: '',
    cprUnidade: 'sacas de 60kg',
    cprPrecoUnitario: '',
    cprValorTotal: '',
    cprDataVencimento: '',
    cprSafra: '2025/26',
    cprLocalEntrega: '',
    // Dívida
    dividaValorOriginal: '',
    dividaValorAtualizado: '',
    dividaFundamento: '',
    // Parcelas (simplificado: número e valor total)
    numeroParcelas: '12',
    valorParcela: '',
    primeiraParcela: '',
  })

  const tipoInfo = tipos.find((t) => t.tipo === tipo)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Montar parcelas a partir do form
    const parcelas: Array<{ numero: number; valor: number; vencimento: string }> = []
    const nPar = parseInt(form.numeroParcelas) || 0
    const vPar = parseFloat(form.valorParcela) || 0
    if (nPar > 0 && vPar > 0 && form.primeiraParcela) {
      const inicio = new Date(form.primeiraParcela)
      for (let i = 0; i < nPar; i++) {
        const venc = new Date(inicio)
        venc.setMonth(venc.getMonth() + i)
        parcelas.push({ numero: i + 1, valor: vPar, vencimento: venc.toISOString().slice(0, 10) })
      }
    }

    const dados: any = {
      tipo,
      devedor: {
        nomeCompleto: form.devedorNome,
        cpfCnpj: form.devedorCpf,
        enderecoCompleto: form.devedorEndereco,
        cidade: form.devedorCidade,
        uf: form.devedorUf,
      },
      credor: {
        nomeCompleto: form.credorNome,
        cpfCnpj: form.credorCpf,
        enderecoCompleto: form.credorEndereco,
        cidade: form.credorCidade,
        uf: form.credorUf,
      },
      local: form.local,
      uf: form.uf,
      dataAssinatura: form.dataAssinatura,
      observacoes: form.observacoes || undefined,
      foro: form.foro || undefined,
    }

    if (tipo === 'cpr_financeira' || tipo === 'cpr_fisica') {
      dados.cpr = {
        produto: form.cprProduto || undefined,
        quantidade: form.cprQuantidade ? parseFloat(form.cprQuantidade) : undefined,
        unidade: form.cprUnidade || undefined,
        precoUnitario: form.cprPrecoUnitario ? parseFloat(form.cprPrecoUnitario) : undefined,
        valorTotal: form.cprValorTotal ? parseFloat(form.cprValorTotal) : undefined,
        dataVencimento: form.cprDataVencimento || undefined,
        safra: form.cprSafra || undefined,
        localEntrega: form.cprLocalEntrega || undefined,
      }
    }

    if (['confissao_divida', 'termo_renegociacao', 'acordo_extrajudicial', 'transacao_excepcional'].includes(tipo)) {
      dados.divida = {
        valorOriginal: form.dividaValorOriginal ? parseFloat(form.dividaValorOriginal) : undefined,
        valorAtualizado: parseFloat(form.dividaValorAtualizado) || 0,
        fundamento: form.dividaFundamento || undefined,
      }
      if (parcelas.length > 0) dados.parcelas = parcelas
    }

    await onSubmit(dados)
    setLoading(false)
  }

  const isCPR = tipo === 'cpr_financeira' || tipo === 'cpr_fisica'
  const isDivida = !isCPR

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-aletis-borda/60 bg-white px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-aletis-grafite-escuro">
              Novo Contrato
            </h2>
            {tipoInfo && (
              <p className="text-xs font-body text-aletis-grafite-medio">
                {tipoInfo.titulo}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-aletis-grafite-medio hover:bg-aletis-bege">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Tipo */}
          <div>
            <label className="mb-2 block text-xs font-display font-semibold uppercase tracking-wider text-aletis-grafite-medio">
              Tipo de Contrato
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoContrato)}
              className="w-full rounded-lg border border-aletis-borda bg-white px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
            >
              {tipos.map((t) => (
                <option key={t.tipo} value={t.tipo}>{t.titulo}</option>
              ))}
            </select>
            {tipoInfo && (
              <p className="mt-1 text-[11px] text-aletis-grafite-claro">
                <strong>Quando usar:</strong> {tipoInfo.quando}
              </p>
            )}
          </div>

          {/* Devedor */}
          <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
            <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-aletis-verde">
              Devedor
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormInput name="devedorNome" label="Nome completo" value={form.devedorNome} onChange={handleChange} required />
              <FormInput name="devedorCpf" label="CPF/CNPJ" value={form.devedorCpf} onChange={handleChange} required />
              <FormInput name="devedorEndereco" label="Endereço" value={form.devedorEndereco} onChange={handleChange} className="md:col-span-2" />
              <FormInput name="devedorCidade" label="Cidade" value={form.devedorCidade} onChange={handleChange} />
              <FormInput name="devedorUf" label="UF" value={form.devedorUf} onChange={handleChange} maxLength={2} />
            </div>
          </fieldset>

          {/* Credor */}
          <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
            <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-aletis-verde">
              Credor
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormInput name="credorNome" label="Nome completo" value={form.credorNome} onChange={handleChange} required />
              <FormInput name="credorCpf" label="CPF/CNPJ" value={form.credorCpf} onChange={handleChange} required />
              <FormInput name="credorEndereco" label="Endereço" value={form.credorEndereco} onChange={handleChange} className="md:col-span-2" />
              <FormInput name="credorCidade" label="Cidade" value={form.credorCidade} onChange={handleChange} />
              <FormInput name="credorUf" label="UF" value={form.credorUf} onChange={handleChange} maxLength={2} />
            </div>
          </fieldset>

          {/* CPR fields */}
          {isCPR && (
            <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
              <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-aletis-dourado">
                CPR ({tipo === 'cpr_financeira' ? 'Financeira' : 'Física'})
              </legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormInput name="cprProduto" label="Produto" placeholder="SOJA EM GRÃOS" value={form.cprProduto} onChange={handleChange} />
                <FormInput name="cprSafra" label="Safra" value={form.cprSafra} onChange={handleChange} />
                <FormInput name="cprQuantidade" label="Quantidade" type="number" value={form.cprQuantidade} onChange={handleChange} />
                <FormInput name="cprUnidade" label="Unidade" value={form.cprUnidade} onChange={handleChange} />
                <FormInput name="cprPrecoUnitario" label="Preço unitário (R$)" type="number" step="0.01" value={form.cprPrecoUnitario} onChange={handleChange} />
                <FormInput name="cprValorTotal" label="Valor total (R$)" type="number" step="0.01" value={form.cprValorTotal} onChange={handleChange} />
                <FormInput name="cprDataVencimento" label="Data de vencimento" type="date" value={form.cprDataVencimento} onChange={handleChange} />
                <FormInput name="cprLocalEntrega" label="Local de entrega" value={form.cprLocalEntrega} onChange={handleChange} />
              </div>
            </fieldset>
          )}

          {/* Dívida fields */}
          {isDivida && (
            <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
              <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-aletis-dourado">
                Dívida / Renegociação
              </legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormInput name="dividaValorOriginal" label="Valor original (R$)" type="number" step="0.01" value={form.dividaValorOriginal} onChange={handleChange} />
                <FormInput name="dividaValorAtualizado" label="Valor atualizado (R$)" type="number" step="0.01" value={form.dividaValorAtualizado} onChange={handleChange} required />
                <FormInput name="dividaFundamento" label="Fundamento (ex: CCB n. XXX)" value={form.dividaFundamento} onChange={handleChange} className="md:col-span-2" />
                <FormInput name="numeroParcelas" label="Número de parcelas" type="number" value={form.numeroParcelas} onChange={handleChange} />
                <FormInput name="valorParcela" label="Valor por parcela (R$)" type="number" step="0.01" value={form.valorParcela} onChange={handleChange} />
                <FormInput name="primeiraParcela" label="Vencimento 1ª parcela" type="date" value={form.primeiraParcela} onChange={handleChange} className="md:col-span-2" />
              </div>
            </fieldset>
          )}

          {/* Metadata */}
          <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
            <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-aletis-grafite-medio">
              Metadados
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FormInput name="local" label="Local de assinatura" value={form.local} onChange={handleChange} required />
              <FormInput name="uf" label="UF" value={form.uf} onChange={handleChange} required maxLength={2} />
              <FormInput name="dataAssinatura" label="Data de assinatura" type="date" value={form.dataAssinatura} onChange={handleChange} />
              <FormInput name="foro" label="Foro (opcional)" value={form.foro} onChange={handleChange} className="md:col-span-3" />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-[11px] font-display font-semibold uppercase tracking-wider text-aletis-grafite-medio">
                Observações
              </label>
              <textarea
                name="observacoes"
                value={form.observacoes}
                onChange={handleChange}
                rows={3}
                className="w-full rounded-lg border border-aletis-borda bg-white px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
              />
            </div>
          </fieldset>

          <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-aletis-borda/60 bg-white px-6 py-4 flex items-center justify-between">
            <p className="text-[11px] text-aletis-grafite-claro max-w-sm">
              ⚠ Documento gerado requer revisão jurídica antes da assinatura.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-aletis-borda bg-white px-4 py-2 text-sm font-display font-semibold text-aletis-grafite-medio hover:bg-aletis-bege"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-5 py-2 text-sm font-display font-semibold text-white hover:bg-aletis-verde-escuro disabled:opacity-60 transition"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                Gerar Contrato
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// FormInput helper
// ════════════════════════════════════════════════════════════
interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  className?: string
}

function FormInput({ label, className, ...rest }: FormInputProps) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-display font-semibold uppercase tracking-wider text-aletis-grafite-medio">
        {label}{rest.required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      <input
        {...rest}
        className="w-full rounded-lg border border-aletis-borda bg-white px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// PREVIEW MODAL
// ════════════════════════════════════════════════════════════
function PreviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, loading, error } = useApi<ContratoGerado | null>(`/contratos/${id}`, null as any)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-aletis-borda/60 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-aletis-grafite-escuro">
              {data?.titulo ?? 'Carregando…'}
            </h2>
            {data && (
              <p className="text-xs font-body text-aletis-grafite-medio">
                {data.metadados.clausulas} cláusulas · {data.metadados.fundamentoLegal.join(', ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <a
                href={`/api/contratos/${id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-aletis-verde px-3 py-1.5 text-xs font-display font-semibold text-white"
              >
                <Download className="h-3 w-3" /> PDF
              </a>
            )}
            <button onClick={onClose} className="rounded-lg p-1 text-aletis-grafite-medio hover:bg-aletis-bege">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 bg-aletis-bege/30">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-aletis-verde" />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {data && (
            <pre className="whitespace-pre-wrap font-body text-sm leading-relaxed text-aletis-grafite-escuro max-w-none">
              {data.conteudoMarkdown}
            </pre>
          )}
        </div>

        {data && data.metadados.necessarioRevisao.length > 0 && (
          <div className="border-t border-aletis-borda/60 bg-amber-50 px-6 py-3">
            <p className="text-[11px] font-display font-semibold uppercase tracking-wider text-amber-800 mb-1">
              Requer revisão antes da assinatura
            </p>
            <ul className="space-y-0.5 text-xs text-amber-900">
              {data.metadados.necessarioRevisao.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

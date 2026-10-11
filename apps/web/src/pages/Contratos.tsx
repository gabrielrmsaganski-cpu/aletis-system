import { SectionNav } from '../components/ui/SectionNav'
import SearchField from '../components/ui/SearchField'
import FilterBar from '../components/ui/FilterBar'
import PageHeader from '../components/ui/PageHeader'
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
  Loader2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building2,
  User,
  FileSignature,
  Briefcase,
} from 'lucide-react'
import AppDialog from '../components/ui/AppDialog'
import { uiAction } from '../components/ui/foundation'

const fmtBRL = (value: string | number): string => {
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  if (typeof value === 'number') return formatter.format(value)
  const match = value.match(/^(\d+)\.(\d{2})$/)
  if (!match) return '—'
  // Intl formata a parte inteira exata; os centavos chegam como string do banco.
  return formatter.formatToParts(BigInt(match[1]))
    .map(part => part.type === 'fraction' ? match[2] : part.value).join('')
}
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
  | 'prestacao_servicos_aletis'

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
  valorTotal: string | number
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
  prestacao_servicos_aletis: Briefcase,
}

const TIPO_COR: Record<TipoContrato, string> = {
  cpr_financeira: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cpr_fisica: 'bg-amber-50 text-amber-700 border-amber-200',
  confissao_divida: 'bg-purple-50 text-purple-700 border-purple-200',
  termo_renegociacao: 'bg-blue-50 text-blue-700 border-blue-200',
  acordo_extrajudicial: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  transacao_excepcional: 'bg-rose-50 text-rose-700 border-rose-200',
  prestacao_servicos_aletis: 'bg-aletis-dourado/15 text-foreground border-aletis-dourado/40',
}

export default function Contratos() {
  const { data: tiposResp, loading: loadingTipos } = useApi<TipoInfo[]>('/contratos/tipos', [])
  const { data: contratos, loading: loadingContratos, refetch } = useApi<ContratoSummary[]>(
    '/contratos',
    []
  )
  const [area, setArea] = useState<'gerados' | 'modelos'>('gerados')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('todos')
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

  const filteredContracts = contratosSafe.filter(contract => (typeFilter === 'todos' || contract.tipo === typeFilter) && [contract.titulo, contract.partes.devedor, contract.partes.credor].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')))

  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* Header */}
      <PageHeader eyebrow="Instrumentos jurídicos" title={<>Contratos</>} description={<> <p className="mt-2 max-w-2xl font-body text-sm text-[var(--text-soft)] lg:text-base">
              CPR Financeira, CPR Física, Confissão de Dívida, Renegociação Bancária,
              Acordo Extrajudicial e Transação Excepcional — templates juridicamente
              fundamentados prontos para revisão e assinatura.
            </p> </>} actions={<> <button
            onClick={() => setShowWizard(true)}
            className={uiAction.primary}
          >
            <Plus className="h-4 w-4" />
            Novo Contrato
          </button> </>} />

      <SectionNav label="Áreas de contratos" active={area} onChange={setArea} items={[{id:'gerados',label:'Contratos gerados',icon:FileCheck,detail:loadingContratos ? 'Carregando' : contratosSafe.length+' documentos'},{id:'modelos',label:'Modelos disponíveis',icon:FileText,detail:'Escolha o instrumento para gerar um contrato'}]} />
      {/* Cards de tipos */}
      {area === 'modelos' && (
      <section className="mb-6">
        <h2 className="mb-3 font-display text-sm font-semibold text-foreground">
          Tipos de contrato suportados
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {loadingTipos && (
            <p className="text-xs text-muted-foreground col-span-3">Carregando…</p>
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
                className="text-left rounded-xl border border-aletis-borda/60 bg-card p-4 hover:border-aletis-verde/40 transition-colors"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${TIPO_COR[t.tipo]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="font-display text-sm font-semibold text-foreground">{t.titulo}</h3>
                </div>
                <p className="text-xs font-body text-[var(--text-soft)] leading-relaxed">
                  {t.quando}
                </p>
                <p className="mt-2 text-[11px] font-body uppercase tracking-wider text-muted-foreground">
                  {t.fundamento[0]}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      )}
      {area === 'gerados' && <>
      <FilterBar className="mb-4" activeCount={Number(Boolean(search.trim())) + Number(typeFilter !== 'todos')} onClear={() => {setSearch('');setTypeFilter('todos')}}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SearchField label="Buscar contratos" value={search} onChange={setSearch} placeholder="Título, devedor ou credor" />
          <label className="text-xs font-medium text-muted-foreground">Tipo de contrato<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="input-field mt-1.5 block w-full sm:w-64"><option value="todos">Todos os tipos</option>{tipos.map(t=><option key={t.tipo} value={t.tipo}>{t.titulo}</option>)}</select></label>
        </div>
      </FilterBar>
      {/* Lista de contratos gerados */}
      <section className="rounded-xl border border-aletis-borda/60 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-aletis-borda/40 px-5 py-3">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Contratos gerados ({filteredContracts.length})
          </h2>
          <button
            onClick={refetch}
            className="text-xs font-body text-[var(--text-soft)] hover:text-aletis-verde transition inline-flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
        </div>

        {loadingContratos ? (
          <div className="p-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">Carregando contratos…</p>
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 font-display text-sm font-semibold text-[var(--text-soft)]">
              {contratosSafe.length ? 'Nenhum contrato para estes filtros' : 'Nenhum contrato gerado ainda'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {contratosSafe.length ? 'Limpe os filtros ou busque por outro título, devedor ou credor.' : 'Clique em “Novo Contrato” para começar.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-aletis-borda/40">
            {filteredContracts.map((c) => {
              const Icon = TIPO_ICON[c.tipo]
              return (
                <div key={c.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`flex-shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border ${TIPO_COR[c.tipo]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-semibold text-foreground truncate">
                        {c.titulo}
                      </p>
                      <p className="text-xs font-body text-[var(--text-soft)] truncate">
                        <User className="inline h-3 w-3 mr-1" />
                        {c.partes.devedor} → {c.partes.credor}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
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
                      className="inline-flex items-center gap-1 rounded-lg border border-aletis-borda bg-card px-3 py-1.5 text-xs font-display font-semibold text-[var(--text-soft)] hover:bg-aletis-bege transition"
                      title="Visualizar"
                    >
                      <Eye className="h-3 w-3" /> Visualizar
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
                      className="inline-flex items-center justify-center rounded-lg border border-aletis-borda bg-card p-1.5 text-red-600 hover:bg-red-50 transition"
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

      </>}
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
    devedorEmail: '',
    // Credor
    credorNome: '',
    credorCpf: '',
    credorEndereco: '',
    credorCidade: '',
    credorUf: '',
    credorEmail: '',
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
    // Prestação de Serviços ALETIS
    servicosModelo: 'hibrido_fixo_exito' as
      | 'fixo'
      | 'mensal'
      | 'exito'
      | 'hibrido_fixo_exito'
      | 'hibrido_mensal_exito',
    servicosHonorarioFixo: '',
    servicosMensalidade: '',
    servicosMesesRetainer: '6',
    servicosPercentualExito: '20',
    servicosBaseCalculoExito: 'economia_total' as
      | 'economia_total'
      | 'reducao_saldo'
      | 'valor_renegociado',
    servicosPisoExito: '',
    servicosTetoExito: '',
    servicosPrazoVigencia: '12',
    servicosCondicaoExito: 'a_vista_liquidacao' as
      | 'a_vista_liquidacao'
      | 'pro_rata_parcelas_credor'
      | 'parcelado_ate_180d',
    servicosSaldoDevedor: '',
    servicosNumeroCredores: '',
    servicosCredoresListados: '',
    servicosDescricaoCaso: '',
    servicosAplicaCdc: false,
    servicosAplicaSuper: false,
    servicosConsultorNome: 'Christian Kohler',
    servicosConsultorEmail: 'contato@aletis.com.br',
    servicosConsultorFone: '',
    servicosPlataformaAssinatura: 'Clicksign',
    servicosArbitragem: false,
    servicosCamaraArbitral: 'CAM-CCBC',
    // Escopo (checkbox)
    escDiagnostico: true,
    escMemoria: true,
    escAbusividade: true,
    escDescaracterizacao: true,
    escFluxo: true,
    escProposta: true,
    escNegociacao: true,
    escGarantias: true,
    escMinutas: true,
    escSuportePericial: false,
    escAcompanhamento: true,
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
        email: form.devedorEmail || undefined,
      },
      credor: {
        nomeCompleto: form.credorNome,
        cpfCnpj: form.credorCpf,
        enderecoCompleto: form.credorEndereco,
        cidade: form.credorCidade,
        uf: form.credorUf,
        email: form.credorEmail || undefined,
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

    if (tipo === 'prestacao_servicos_aletis') {
      dados.servicos = {
        escopo: {
          diagnosticoFinanceiro: form.escDiagnostico,
          memoriaCalculoAuditavel: form.escMemoria,
          deteccaoAbusividadeEAnatocismo: form.escAbusividade,
          deteccaoDescaracterizacaoCreditoRural: form.escDescaracterizacao,
          projecaoFluxoCaixaEStressTest: form.escFluxo,
          propostaEstruturadaReestruturacao: form.escProposta,
          negociacaoCredoresMulti: form.escNegociacao,
          estruturacaoGarantiasDacao: form.escGarantias,
          minutasContratuais: form.escMinutas,
          suportePericialRevisional: form.escSuportePericial,
          acompanhamentoExecucao: form.escAcompanhamento,
        },
        modeloHonorarios: form.servicosModelo,
        honorarioFixo: form.servicosHonorarioFixo ? parseFloat(form.servicosHonorarioFixo) : undefined,
        mensalidade: form.servicosMensalidade ? parseFloat(form.servicosMensalidade) : undefined,
        mesesRetainer: form.servicosMesesRetainer ? parseInt(form.servicosMesesRetainer) : undefined,
        percentualExito: form.servicosPercentualExito ? parseFloat(form.servicosPercentualExito) : undefined,
        baseCalculoExito: form.servicosBaseCalculoExito,
        pisoExito: form.servicosPisoExito ? parseFloat(form.servicosPisoExito) : undefined,
        tetoExito: form.servicosTetoExito ? parseFloat(form.servicosTetoExito) : undefined,
        prazoVigenciaMeses: parseInt(form.servicosPrazoVigencia) || 12,
        condicaoPagamentoExito: form.servicosCondicaoExito,
        operacao: {
          saldoDevedorAtualizado: form.servicosSaldoDevedor ? parseFloat(form.servicosSaldoDevedor) : 0,
          numeroCredores: form.servicosNumeroCredores ? parseInt(form.servicosNumeroCredores) : undefined,
          credoresListados: form.servicosCredoresListados
            ? form.servicosCredoresListados.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
          descricaoSituacao: form.servicosDescricaoCaso || undefined,
        },
        aplicaCdc: form.servicosAplicaCdc,
        aplicaSuperendividamento: form.servicosAplicaSuper,
        contatoAletis: {
          consultorResponsavel: form.servicosConsultorNome,
          email: form.servicosConsultorEmail,
          telefone: form.servicosConsultorFone || undefined,
        },
        plataformaAssinaturaEletronica: form.servicosPlataformaAssinatura || undefined,
        arbitragem: form.servicosArbitragem
          ? {
              adotar: true,
              camara: form.servicosCamaraArbitral,
              tipo: 'institucional' as const,
              idioma: 'português',
              sede: `${form.local}-${form.uf}`,
            }
          : undefined,
      }
    }

    await onSubmit(dados)
    setLoading(false)
  }

  const isCPR = tipo === 'cpr_financeira' || tipo === 'cpr_fisica'
  const isServicos = tipo === 'prestacao_servicos_aletis'
  const isDivida = !isCPR && !isServicos

  return (
    <AppDialog
      title="Novo contrato"
      eyebrow="Contratos"
      subtitle={tipoInfo?.titulo ?? 'Instrumento jurídico para revisão e assinatura.'}
      icon={<FileCheck className="h-5 w-5" />}
      size="lg"
      onClose={onClose}
      closeOnBackdrop={!loading}
      bodyClassName="p-0"
      className="md:max-h-[min(94dvh,1040px)]"
      footer={(
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="flex max-w-md items-start gap-2 text-xs leading-relaxed text-[var(--text-soft)] dark:text-aletis-sage">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            Documento gerado requer revisão jurídica antes da assinatura.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className={uiAction.secondary}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="contrato-wizard-form"
              disabled={loading}
              className={uiAction.primary}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
              Gerar contrato
            </button>
          </div>
        </div>
      )}
    >
        <form id="contrato-wizard-form" onSubmit={handleSubmit} className="space-y-6 px-5 py-5 md:px-6">
          {/* Tipo */}
          <div>
            <label className="mb-2 block text-xs font-display font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Tipo de Contrato
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoContrato)}
              className="w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
            >
              {tipos.map((t) => (
                <option key={t.tipo} value={t.tipo}>{t.titulo}</option>
              ))}
            </select>
            {tipoInfo && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                <strong>Quando usar:</strong> {tipoInfo.quando}
              </p>
            )}
          </div>

          {/* Devedor / Contratante */}
          <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
            <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-foreground">
              {isServicos ? 'Contratante (Cliente)' : 'Devedor'}
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormInput name="devedorNome" label="Nome completo" value={form.devedorNome} onChange={handleChange} required />
              <FormInput name="devedorCpf" label="CPF/CNPJ" value={form.devedorCpf} onChange={handleChange} required />
              <FormInput name="devedorEndereco" label="Endereço" value={form.devedorEndereco} onChange={handleChange} className="md:col-span-2" />
              <FormInput name="devedorCidade" label="Cidade" value={form.devedorCidade} onChange={handleChange} />
              <FormInput name="devedorUf" label="UF" value={form.devedorUf} onChange={handleChange} maxLength={2} />
              {isServicos && (
                <FormInput name="devedorEmail" label="E-mail" type="email" value={form.devedorEmail} onChange={handleChange} className="md:col-span-2" />
              )}
            </div>
          </fieldset>

          {/* Credor / Contratada */}
          <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
            <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-foreground">
              {isServicos ? 'Contratada (ALETIS)' : 'Credor'}
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormInput name="credorNome" label="Nome completo / Razão Social" value={form.credorNome} onChange={handleChange} required />
              <FormInput name="credorCpf" label="CPF/CNPJ" value={form.credorCpf} onChange={handleChange} required />
              <FormInput name="credorEndereco" label="Endereço" value={form.credorEndereco} onChange={handleChange} className="md:col-span-2" />
              <FormInput name="credorCidade" label="Cidade" value={form.credorCidade} onChange={handleChange} />
              <FormInput name="credorUf" label="UF" value={form.credorUf} onChange={handleChange} maxLength={2} />
              {isServicos && (
                <FormInput name="credorEmail" label="E-mail" type="email" value={form.credorEmail} onChange={handleChange} className="md:col-span-2" />
              )}
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

          {/* Prestação de Serviços ALETIS */}
          {isServicos && (
            <>
              {/* Operação base */}
              <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
                <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-aletis-dourado">
                  Operação objeto dos serviços
                </legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormInput name="servicosSaldoDevedor" label="Saldo devedor atualizado (R$)" type="number" step="0.01" value={form.servicosSaldoDevedor} onChange={handleChange} required />
                  <FormInput name="servicosNumeroCredores" label="Nº de credores" type="number" value={form.servicosNumeroCredores} onChange={handleChange} />
                  <FormInput name="servicosCredoresListados" label="Credores (separar por vírgula)" value={form.servicosCredoresListados} onChange={handleChange} className="md:col-span-2" placeholder="Banco do Brasil, Sicredi, Fertiflora" />
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                    Descrição da situação do Contratante
                  </label>
                  <textarea
                    name="servicosDescricaoCaso"
                    value={form.servicosDescricaoCaso}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Breve contexto do caso (inadimplência, contratos de crédito rural em execução, penhoras, etc.)"
                    className="w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-xs font-body text-[var(--text-soft)]">
                    <input
                      type="checkbox"
                      checked={form.servicosAplicaCdc}
                      onChange={(e) => setForm({ ...form, servicosAplicaCdc: e.target.checked })}
                      className="h-4 w-4 rounded border-aletis-borda text-foreground focus:ring-aletis-verde"
                    />
                    Contratante é consumidor — aplica CDC (Lei 8.078/90)
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-body text-[var(--text-soft)]">
                    <input
                      type="checkbox"
                      checked={form.servicosAplicaSuper}
                      onChange={(e) => setForm({ ...form, servicosAplicaSuper: e.target.checked })}
                      className="h-4 w-4 rounded border-aletis-borda text-foreground focus:ring-aletis-verde"
                    />
                    Situação de superendividamento (Lei 14.181/21)
                  </label>
                </div>
              </fieldset>

              {/* Escopo modular */}
              <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
                <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-aletis-dourado">
                  Escopo — Módulos de Serviço
                </legend>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Selecione os módulos que compõem o escopo deste contrato. O texto da cláusula III será gerado listando apenas os módulos ativos.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {([
                    ['escDiagnostico', 'Diagnóstico financeiro integral'],
                    ['escMemoria', 'Memória de cálculo auditável'],
                    ['escAbusividade', 'Detecção de abusividade / anatocismo'],
                    ['escDescaracterizacao', 'Descaracterização de crédito rural (Res. BCB 4.966/21)'],
                    ['escFluxo', 'Projeção de fluxo de caixa + stress test'],
                    ['escProposta', 'Proposta estruturada de reestruturação'],
                    ['escNegociacao', 'Negociação multi-credor'],
                    ['escGarantias', 'Estruturação de garantias / dação em pagamento'],
                    ['escMinutas', 'Minutas contratuais (CPR, Confissão, Renegociação)'],
                    ['escSuportePericial', 'Suporte pericial / revisional judicial'],
                    ['escAcompanhamento', 'Acompanhamento de execução pós-acordo'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-2 text-xs font-body text-[var(--text-soft)]">
                      <input
                        type="checkbox"
                        checked={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                        className="h-4 w-4 rounded border-aletis-borda text-foreground focus:ring-aletis-verde"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Honorários */}
              <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
                <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-aletis-dourado">
                  Honorários
                </legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                      Modelo de honorários
                    </label>
                    <select
                      name="servicosModelo"
                      value={form.servicosModelo}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
                    >
                      <option value="fixo">Fixo</option>
                      <option value="mensal">Mensal (retainer)</option>
                      <option value="exito">Somente êxito</option>
                      <option value="hibrido_fixo_exito">Híbrido — Fixo + Êxito</option>
                      <option value="hibrido_mensal_exito">Híbrido — Mensal + Êxito</option>
                    </select>
                  </div>
                  <FormInput name="servicosPrazoVigencia" label="Prazo de vigência (meses)" type="number" min={1} value={form.servicosPrazoVigencia} onChange={handleChange} />

                  {(form.servicosModelo === 'fixo' || form.servicosModelo === 'hibrido_fixo_exito') && (
                    <FormInput name="servicosHonorarioFixo" label="Honorário fixo (R$)" type="number" step="0.01" value={form.servicosHonorarioFixo} onChange={handleChange} />
                  )}

                  {(form.servicosModelo === 'mensal' || form.servicosModelo === 'hibrido_mensal_exito') && (
                    <>
                      <FormInput name="servicosMensalidade" label="Mensalidade (R$)" type="number" step="0.01" value={form.servicosMensalidade} onChange={handleChange} />
                      <FormInput name="servicosMesesRetainer" label="Nº de mensalidades" type="number" min={1} value={form.servicosMesesRetainer} onChange={handleChange} />
                    </>
                  )}

                  {(form.servicosModelo === 'exito' ||
                    form.servicosModelo === 'hibrido_fixo_exito' ||
                    form.servicosModelo === 'hibrido_mensal_exito') && (
                    <>
                      <FormInput name="servicosPercentualExito" label="Percentual de êxito (%)" type="number" step="0.1" value={form.servicosPercentualExito} onChange={handleChange} />
                      <div>
                        <label className="mb-1 block text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                          Base de cálculo do êxito
                        </label>
                        <select
                          name="servicosBaseCalculoExito"
                          value={form.servicosBaseCalculoExito}
                          onChange={handleChange}
                          className="w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
                        >
                          <option value="economia_total">Economia total (saldo − valor renegociado)</option>
                          <option value="reducao_saldo">Redução de saldo (deságio)</option>
                          <option value="valor_renegociado">Valor renegociado</option>
                        </select>
                      </div>
                      <FormInput name="servicosPisoExito" label="Piso do êxito (R$) — opcional" type="number" step="0.01" value={form.servicosPisoExito} onChange={handleChange} />
                      <FormInput name="servicosTetoExito" label="Teto do êxito (R$) — opcional" type="number" step="0.01" value={form.servicosTetoExito} onChange={handleChange} />
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                          Condição de pagamento do êxito
                        </label>
                        <select
                          name="servicosCondicaoExito"
                          value={form.servicosCondicaoExito}
                          onChange={handleChange}
                          className="w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
                        >
                          <option value="a_vista_liquidacao">À vista, na liquidação/formalização do acordo</option>
                          <option value="pro_rata_parcelas_credor">Pro rata das parcelas pagas ao credor</option>
                          <option value="parcelado_ate_180d">Parcelado em até 180 dias</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </fieldset>

              {/* Contato ALETIS + formalização */}
              <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
                <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-aletis-dourado">
                  Contato ALETIS & Formalização
                </legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormInput name="servicosConsultorNome" label="Consultor responsável" value={form.servicosConsultorNome} onChange={handleChange} />
                  <FormInput name="servicosConsultorEmail" label="E-mail" type="email" value={form.servicosConsultorEmail} onChange={handleChange} />
                  <FormInput name="servicosConsultorFone" label="Telefone" value={form.servicosConsultorFone} onChange={handleChange} />
                  <div>
                    <label className="mb-1 block text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                      Plataforma de assinatura eletrônica
                    </label>
                    <select
                      name="servicosPlataformaAssinatura"
                      value={form.servicosPlataformaAssinatura}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
                    >
                      <option value="Clicksign">Clicksign</option>
                      <option value="DocuSign">DocuSign</option>
                      <option value="D4Sign">D4Sign</option>
                      <option value="Gov.br">Gov.br</option>
                      <option value="ICP-Brasil">ICP-Brasil (certificado A1/A3)</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-body text-[var(--text-soft)]">
                    <input
                      type="checkbox"
                      checked={form.servicosArbitragem}
                      onChange={(e) => setForm({ ...form, servicosArbitragem: e.target.checked })}
                      className="h-4 w-4 rounded border-aletis-borda text-foreground focus:ring-aletis-verde"
                    />
                    Incluir cláusula arbitral (Lei 9.307/96)
                  </label>
                  {form.servicosArbitragem && (
                    <input
                      name="servicosCamaraArbitral"
                      value={form.servicosCamaraArbitral}
                      onChange={handleChange}
                      placeholder="Câmara (ex: CAM-CCBC)"
                      className="flex-1 rounded-lg border border-aletis-borda bg-card px-3 py-1.5 text-xs focus:border-aletis-verde focus:outline-none"
                    />
                  )}
                </div>
              </fieldset>
            </>
          )}

          {/* Metadata */}
          <fieldset className="rounded-lg border border-aletis-borda/60 p-4">
            <legend className="px-2 font-display text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Metadados
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FormInput name="local" label="Local de assinatura" value={form.local} onChange={handleChange} required />
              <FormInput name="uf" label="UF" value={form.uf} onChange={handleChange} required maxLength={2} />
              <FormInput name="dataAssinatura" label="Data de assinatura" type="date" value={form.dataAssinatura} onChange={handleChange} />
              <FormInput name="foro" label="Foro (opcional)" value={form.foro} onChange={handleChange} className="md:col-span-3" />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                Observações
              </label>
              <textarea
                name="observacoes"
                value={form.observacoes}
                onChange={handleChange}
                rows={3}
                className="w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
              />
            </div>
          </fieldset>

        </form>
    </AppDialog>
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
      <label className="mb-1 block text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--text-soft)]">
        {label}{rest.required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      <input
        {...rest}
        className="w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
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
    <AppDialog
      title={data?.titulo ?? 'Carregando contrato'}
      eyebrow="Preview"
      subtitle={data ? `${data.metadados.clausulas} cláusulas · ${data.metadados.fundamentoLegal.join(', ')}` : 'Preparando visualização do instrumento.'}
      icon={<FileText className="h-5 w-5" />}
      size="xl"
      onClose={onClose}
      bodyClassName="p-0"
      footer={data && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {data.metadados.necessarioRevisao.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]">
                <AlertCircle className="h-3.5 w-3.5" />
                Requer revisão antes da assinatura
              </p>
              <ul className="space-y-0.5 text-xs">
                {data.metadados.necessarioRevisao.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-xs text-[var(--text-soft)] dark:text-aletis-sage">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
              Sem alertas adicionais de revisão registrados.
            </p>
          )}
          <a
            href={`/api/contratos/${id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${uiAction.primary} shrink-0`}
          >
            <Download className="h-4 w-4" /> Baixar PDF
          </a>
        </div>
      )}
    >
        <div className="min-h-[420px] bg-aletis-cream-papel/60 px-5 py-5 dark:bg-white/[0.03] md:px-8">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-foreground" />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {data && <ContractMarkdownPreview markdown={data.conteudoMarkdown} />}
        </div>
    </AppDialog>
  )
}

function ContractMarkdownPreview({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')

  return (
    <article className="mx-auto max-w-4xl rounded-lg border border-aletis-borda/70 bg-card px-6 py-6 text-foreground shadow-none dark:border-white/10 dark:bg-card dark:text-aletis-cream">
      {lines.map((raw, index) => {
        const line = raw.trim()
        if (!line) return <div key={index} className="h-3" />
        if (line.startsWith('### ')) {
          return (
            <h4 key={index} className="mt-4 text-sm font-semibold leading-snug text-foreground dark:text-aletis-gold">
              {line.replace(/^###\s+/, '')}
            </h4>
          )
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={index} className="mt-5 text-base font-semibold leading-snug text-foreground dark:text-white">
              {line.replace(/^##\s+/, '')}
            </h3>
          )
        }
        if (line.startsWith('# ')) {
          return (
            <h2 key={index} className="mb-3 text-lg font-semibold leading-snug text-foreground dark:text-white">
              {line.replace(/^#\s+/, '')}
            </h2>
          )
        }
        if (/^[-*]\s+/.test(line)) {
          return (
            <p key={index} className="flex gap-2 text-sm leading-relaxed text-[var(--text-soft)] dark:text-aletis-sage">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-aletis-verde dark:bg-aletis-gold" />
              <span>{line.replace(/^[-*]\s+/, '')}</span>
            </p>
          )
        }
        return (
          <p key={index} className="text-sm leading-relaxed text-[var(--text-soft)] dark:text-aletis-sage">
            {line}
          </p>
        )
      })}
    </article>
  )
}

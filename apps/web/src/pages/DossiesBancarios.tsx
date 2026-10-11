import PageHeader from '../components/ui/PageHeader'
import SearchField from '../components/ui/SearchField'
import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { ToastContainer } from '../components/Toast'
import { apiFetch, useApi } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import {
  bancosDossie,
  camposCanonicosAletis,
  etapasDossieBancario,
  modelosBancarios,
  modelosDoBanco,
  nomeBancoDossie,
  perfisCasoBancario,
  type BancoDossieId,
  type CategoriaModeloBancario,
  type ModeloBancario,
} from '../data/dossiesBancarios'

type BancoFiltro = BancoDossieId | 'todos'

interface ChecklistItem {
  item: string
  origem: string
  etapa: string
  status: 'mapeado' | 'cliente' | 'validar'
}

interface PreparacaoDossie {
  checklist: ChecklistItem[]
  prontidao: number
  status: {
    mapeados: number
    validar: number
    solicitarAoCliente: number
  }
  fontes: Array<{
    fonte: 'crm' | 'dossie_agro' | 'gestao_financeira' | 'farms' | 'manual'
    registros: number
    detalhe: string
  }>
  cobertura: Record<string, number>
}

interface CatalogoDossie {
  modelos: Array<ModeloBancario & {
    disponivel?: boolean
    bytes?: number
  }>
}

interface ClienteResumo {
  id: string
  nome: string
  cidade?: string
  uf?: string
}

interface ClienteDetalhe extends ClienteResumo {
  cpfCnpj?: string
  tipo?: 'pessoa_fisica' | 'pessoa_juridica'
  telefone?: string
  email?: string
  atividade?: string
  observacoes?: string
  cep?: string
  endereco?: string | {
    formatado?: string
    logradouro?: string
    numero?: string
    bairro?: string
    cidade?: string
    uf?: string
  }
  grupoFamiliar?: Array<{
    nome?: string
    cpfCnpj?: string
    parentesco?: string
    telefone?: string
    email?: string
    atuaAtividade?: boolean
  }>
  dividas?: Array<{
    contrato?: string
    valorOriginal?: number
    valorAtualizado?: number
    vencimento?: string
    credor?: string
  }>
}

interface FormularioDossie {
  clienteId: string
  nome: string
  cpfCnpj: string
  cidade: string
  uf: string
  atividade: string
  cultura: string
  limiteSolicitado: string
  prazo: string
  safra: string
  areaPropriaHa: string
  areaArrendadaHa: string
  produtividade: string
  precoUnitario: string
  custoHa: string
}

const FORMULARIO_INICIAL: FormularioDossie = {
  clienteId: '',
  nome: '',
  cpfCnpj: '',
  cidade: '',
  uf: '',
  atividade: '',
  cultura: '',
  limiteSolicitado: '',
  prazo: '',
  safra: '',
  areaPropriaHa: '',
  areaArrendadaHa: '',
  produtividade: '',
  precoUnitario: '',
  custoHa: '',
}

const bancosOperacionais = bancosDossie.filter((banco) => banco.id !== 'safras')

const categoriaLabel: Record<CategoriaModeloBancario, string> = {
  cadastro: 'Cadastro',
  autorizacao: 'Autorização',
  checklist: 'Checklist',
  producao: 'Produção',
  inteligencia: 'Inteligência',
}

const categoriaTone: Record<CategoriaModeloBancario, string> = {
  cadastro: 'border-aletis-verde/20 bg-aletis-verde/10 text-foreground',
  autorizacao: 'border-aletis-dourado/30 bg-aletis-dourado/10 text-aletis-dourado-escuro',
  checklist: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  producao: 'border-sky-200 bg-sky-50 text-sky-800',
  inteligencia: 'border-amber-200 bg-amber-50 text-amber-800',
}

const statusTone: Record<ModeloBancario['status'], string> = {
  mapeado: 'border-positivo/20 bg-positivo/10 text-positivo',
  'exige limpeza': 'border-amber-200 bg-amber-50 text-amber-800',
  'converter legado': 'border-red-200 bg-red-50 text-red-800',
}

function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function parseNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed
  const number = Number(normalized)
  return Number.isFinite(number) ? number : undefined
}

function enderecoCliente(cliente: ClienteDetalhe | null): string {
  if (!cliente?.endereco) return ''
  if (typeof cliente.endereco === 'string') return cliente.endereco
  if (cliente.endereco.formatado) return cliente.endereco.formatado
  return [
    cliente.endereco.logradouro,
    cliente.endereco.numero,
    cliente.endereco.bairro,
    cliente.endereco.cidade,
    cliente.endereco.uf,
  ].filter(Boolean).join(', ')
}

function buildChecklist(banco: BancoDossieId, perfilId: string): ChecklistItem[] {
  const perfil = perfisCasoBancario.find((item) => item.id === perfilId) ?? perfisCasoBancario[0]
  const modelos = modelosDoBanco(banco).filter((modelo) => modelo.categoria !== 'inteligencia')
  const requisitos = unique([
    ...perfil.requisitosExtras,
    ...modelos.flatMap((modelo) => modelo.requisitos),
    'PDF executivo do dossie com indice, checklist e matriz de modelos',
    'Versao final revisada antes de envio ao banco',
  ])

  return requisitos.map((item, index) => {
    const lower = fold(item)
    const isLegal = lower.includes('bacen') || lower.includes('scr') || lower.includes('assinatura') || lower.includes('autoriz')
    const isClient = lower.includes('irpf') || lower.includes('irpj') || lower.includes('documento') || lower.includes('contrato') || lower.includes('matricula') || lower.includes('car') || lower.includes('ccir') || lower.includes('itr')
    const isProduction = lower.includes('produc') || lower.includes('safra') || lower.includes('produtividade') || lower.includes('area')
    const status: ChecklistItem['status'] = isClient ? 'cliente' : index % 5 === 0 ? 'validar' : 'mapeado'

    return {
      item,
      origem: isLegal ? 'Legal' : isProduction ? 'Produção' : isClient ? 'Cliente' : 'Cadastro único',
      etapa: isLegal ? 'Autorizacoes' : isClient ? 'Documentos' : isProduction ? 'Quadro safra' : 'Dados ALETIS',
      status,
    }
  })
}

function checklistStatusLabel(status: ChecklistItem['status']): string {
  if (status === 'mapeado') return 'Mapeado'
  if (status === 'cliente') return 'Pedir ao cliente'
  return 'Validar'
}

function checklistStatusClass(status: ChecklistItem['status']): string {
  if (status === 'mapeado') return 'border-positivo/20 bg-positivo/10 text-positivo'
  if (status === 'cliente') return 'border-aletis-dourado/30 bg-aletis-dourado/10 text-aletis-dourado-escuro'
  return 'border-sky-200 bg-sky-50 text-sky-800'
}

function formatModeloResumo(modelo: ModeloBancario): string {
  return `${nomeBancoDossie(modelo.banco)} · ${categoriaLabel[modelo.categoria]} · ${modelo.formato.toUpperCase()}`
}

async function downloadResponse(response: Response, fallbackFilename: string): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    try {
      const parsed = JSON.parse(body) as { error?: string }
      throw new Error(parsed.error || `Falha HTTP ${response.status}`)
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(body || `Falha HTTP ${response.status}`)
      throw error
    }
  }
  const blob = await response.blob()
  const contentDisposition = response.headers.get('Content-Disposition') || ''
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filenameMatch?.[1] || fallbackFilename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function DossiesBancarios() {
  const { toasts, show, dismiss } = useToast()
  const { data: clientes, loading: carregandoClientes } = useApi<ClienteResumo[]>('/clientes', [])
  const { data: catalogo } = useApi<CatalogoDossie>('/dossies-bancarios/catalogo', {
    modelos: modelosBancarios,
  })
  const modelosCatalogo: CatalogoDossie['modelos'] = catalogo.modelos.length ? catalogo.modelos : modelosBancarios
  const [bancoFiltro, setBancoFiltro] = useState<BancoFiltro>('todos')
  const [busca, setBusca] = useState('')
  const [bancoCaso, setBancoCaso] = useState<BancoDossieId>('btg')
  const [perfilCaso, setPerfilCaso] = useState(perfisCasoBancario[0].id)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [modeloSelecionadoId, setModeloSelecionadoId] = useState(modelosBancarios[0].id)
  const [exportando, setExportando] = useState(false)
  const [exportandoZip, setExportandoZip] = useState(false)
  const [exportandoBase, setExportandoBase] = useState(false)
  const [carregandoCliente, setCarregandoCliente] = useState(false)
  const [carregandoPreparacao, setCarregandoPreparacao] = useState(false)
  const [clienteDetalhe, setClienteDetalhe] = useState<ClienteDetalhe | null>(null)
  const [preparacao, setPreparacao] = useState<PreparacaoDossie | null>(null)
  const [formulario, setFormulario] = useState<FormularioDossie>(FORMULARIO_INICIAL)

  const modelosFiltrados = useMemo(() => {
    const query = fold(busca)
    return modelosCatalogo.filter((modelo) => {
      const matchBanco = bancoFiltro === 'todos' || modelo.banco === bancoFiltro
      if (!matchBanco) return false
      if (!query) return true
      const haystack = fold([
        modelo.titulo,
        modelo.arquivo,
        modelo.finalidade,
        modelo.secoes.join(' '),
        modelo.requisitos.join(' '),
        nomeBancoDossie(modelo.banco),
      ].join(' '))
      return haystack.includes(query)
    })
  }, [bancoFiltro, busca, modelosCatalogo])
  const clientesFiltrados = useMemo(() => {
    const query = fold(buscaCliente.trim())
    const selected = formulario.clienteId
    return clientes
      .filter((cliente) => {
        if (cliente.id === selected || !query) return true
        return fold([cliente.nome, cliente.cidade, cliente.uf].filter(Boolean).join(' ')).includes(query)
      })
      .slice(0, 100)
  }, [buscaCliente, clientes, formulario.clienteId])

  const checklistPadrao = useMemo(() => buildChecklist(bancoCaso, perfilCaso), [bancoCaso, perfilCaso])
  const checklistCaso = preparacao?.checklist ?? checklistPadrao
  const modeloSelecionado = modelosCatalogo.find((modelo) => modelo.id === modeloSelecionadoId) ?? modelosFiltrados[0] ?? modelosCatalogo[0]
  const prontidao = preparacao?.prontidao
    ?? Math.round((checklistCaso.filter((item) => item.status !== 'cliente').length / checklistCaso.length) * 100)
  const bancosMapeados = new Set(modelosCatalogo.map((modelo) => modelo.banco)).size
  const secoesMapeadas = modelosCatalogo.reduce((total, modelo) => total + modelo.secoes.length, 0)
  const modelosLegais = modelosCatalogo.filter((modelo) => modelo.categoria === 'autorizacao').length
  const dadosImportados = preparacao?.fontes.reduce((total, fonte) => total + fonte.registros, 0)
    ?? (clienteDetalhe?.grupoFamiliar?.length ?? 0) + (clienteDetalhe?.dividas?.length ?? 0)

  useEffect(() => {
    if (!formulario.clienteId) {
      setPreparacao(null)
      return
    }
    let active = true
    setPreparacao(null)
    setCarregandoPreparacao(true)
    void apiFetch<PreparacaoDossie>('/dossies-bancarios/preparacao', {
      method: 'POST',
      body: JSON.stringify({
        banco: bancoCaso,
        perfilId: perfilCaso,
        clienteId: formulario.clienteId,
      }),
    })
      .then((result) => {
        if (active) setPreparacao(result)
      })
      .catch((error) => {
        console.warn('Falha ao analisar preparação do dossiê:', error)
        if (active) setPreparacao(null)
      })
      .finally(() => {
        if (active) setCarregandoPreparacao(false)
      })
    return () => {
      active = false
    }
  }, [bancoCaso, formulario.clienteId, perfilCaso])
  function atualizarFormulario(campo: keyof FormularioDossie, valor: string) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }))
  }

  async function handleClienteChange(clienteId: string) {
    if (!clienteId) {
      setClienteDetalhe(null)
      setFormulario(FORMULARIO_INICIAL)
      setBuscaCliente('')
      return
    }
    setCarregandoCliente(true)
    try {
      const cliente = await apiFetch<ClienteDetalhe>(`/clientes/${clienteId}`)
      setClienteDetalhe(cliente)
      setBuscaCliente(cliente.nome)
      setFormulario((atual) => ({
        ...atual,
        clienteId: cliente.id,
        nome: cliente.nome || '',
        cpfCnpj: cliente.cpfCnpj || '',
        cidade: cliente.cidade || '',
        uf: cliente.uf || '',
        atividade: cliente.atividade || '',
        cultura: atual.cultura || '',
      }))
      show('Dados do CRM carregados para o dossiê.', 'success')
    } catch (error) {
      console.error(error)
      show('Não foi possível carregar o cliente do CRM.', 'error')
    } finally {
      setCarregandoCliente(false)
    }
  }

  function montarPayloadDossie(incluirOriginais: boolean) {
    const temProducao = Boolean(
      formulario.cultura.trim()
      && (
        formulario.areaPropriaHa.trim()
        || formulario.areaArrendadaHa.trim()
        || formulario.produtividade.trim()
        || formulario.precoUnitario.trim()
        || formulario.custoHa.trim()
      ),
    )
    return {
      banco: bancoCaso,
      clienteId: formulario.clienteId || undefined,
      perfilId: perfilCaso,
      incluirOriginais,
      incluirInteligencia: false,
      gerarModelosPreenchidos: true,
      cliente: {
        id: formulario.clienteId || undefined,
        nome: formulario.nome.trim(),
        cpfCnpj: formulario.cpfCnpj.trim(),
        tipo: clienteDetalhe?.tipo,
        cidade: formulario.cidade.trim(),
        uf: formulario.uf.trim(),
        endereco: enderecoCliente(clienteDetalhe),
        cep: clienteDetalhe?.cep,
        telefone: clienteDetalhe?.telefone,
        email: clienteDetalhe?.email,
        atividade: formulario.atividade.trim(),
        observacoes: clienteDetalhe?.observacoes,
        responsavel: 'ALETIS',
      },
      dados: {
        dataBase: new Date().toISOString().slice(0, 10),
        operacao: {
          cultura: formulario.cultura.trim() || undefined,
          limiteSolicitado: parseNumber(formulario.limiteSolicitado),
          prazo: formulario.prazo.trim() || undefined,
        },
        atividades: formulario.atividade.trim()
          ? [{ tipo: formulario.atividade.trim() }]
          : [],
        grupoEconomico: (clienteDetalhe?.grupoFamiliar ?? []).map((membro) => ({
          nome: membro.nome,
          cpfCnpj: membro.cpfCnpj,
          parentesco: membro.parentesco,
          telefone: membro.telefone,
          email: membro.email,
          atuaAtividade: membro.atuaAtividade,
        })),
        dividas: (clienteDetalhe?.dividas ?? []).map((divida) => ({
          tomador: formulario.nome.trim(),
          documento: formulario.cpfCnpj.trim(),
          instituicao: divida.credor,
          contrato: divida.contrato,
          tipoCredito: 'Crédito rural / operação cadastrada no CRM',
          vencimento: divida.vencimento,
          moeda: 'BRL',
          saldoDevedor: divida.valorAtualizado ?? divida.valorOriginal,
        })),
        producoes: temProducao
          ? [{
              cultura: formulario.cultura.trim(),
              periodo: 'atual',
              safra: formulario.safra.trim() || undefined,
              regiao: [formulario.cidade.trim(), formulario.uf.trim()].filter(Boolean).join('/'),
              areaPropriaHa: parseNumber(formulario.areaPropriaHa),
              areaArrendadaHa: parseNumber(formulario.areaArrendadaHa),
              produtividade: parseNumber(formulario.produtividade),
              precoUnitario: parseNumber(formulario.precoUnitario),
              custoHa: parseNumber(formulario.custoHa),
            }]
          : [],
      },
    }
  }

  async function handleExportPdf() {
    if (!formulario.nome.trim()) {
      show('Selecione um cliente do CRM ou informe o nome antes de gerar.', 'error')
      return
    }
    setExportando(true)
    try {
      const response = await fetch('/api/dossies-bancarios/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(montarPayloadDossie(false)),
      })
      await downloadResponse(response, `dossie-executivo-${bancoCaso}.pdf`)
      show('PDF executivo completo gerado com a marca principal ALETIS.', 'success')
    } catch (error) {
      console.error(error)
      show(error instanceof Error ? error.message : 'Não foi possível gerar o PDF executivo.', 'error')
    } finally {
      setExportando(false)
    }
  }

  async function handlePreviewBase() {
    if (!formulario.nome.trim()) {
      show('Selecione um cliente do CRM ou informe o nome antes de gerar a Base ALETIS.', 'error')
      return
    }

    // Abre no gesto do usuário para evitar bloqueio de pop-up; o documento é
    // inserido após o backend consolidar CRM, Dossiê, Gestão e Farms.
    const preview = window.open('', '_blank')
    if (!preview) {
      show('O navegador bloqueou a nova aba. Autorize pop-ups para visualizar a Base ALETIS.', 'error')
      return
    }

    setExportandoBase(true)
    try {
      preview.document.title = 'Gerando Base ALETIS...'
      preview.document.body.innerHTML = '<main style="font-family:Arial,sans-serif;padding:32px;color:#17251b">Gerando documento Base ALETIS...</main>'
      const response = await fetch('/api/dossies-bancarios/html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(montarPayloadDossie(false)),
      })
      const body = await response.text()
      if (!response.ok) {
        try {
          const parsed = JSON.parse(body) as { error?: string }
          throw new Error(parsed.error || `Falha HTTP ${response.status}`)
        } catch (error) {
          if (error instanceof SyntaxError) throw new Error(`Falha HTTP ${response.status}`)
          throw error
        }
      }
      preview.document.open()
      preview.document.write(body)
      preview.document.close()
      show('Base ALETIS estruturada e pronta para impressão foi aberta em nova aba.', 'success')
    } catch (error) {
      preview.close()
      console.error(error)
      show(error instanceof Error ? error.message : 'Não foi possível gerar o documento Base ALETIS.', 'error')
    } finally {
      setExportandoBase(false)
    }
  }

  async function handleExportZip() {
    if (!formulario.nome.trim()) {
      show('Selecione um cliente do CRM ou informe o nome antes de gerar.', 'error')
      return
    }
    setExportandoZip(true)
    try {
      const response = await fetch('/api/dossies-bancarios/pacote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(montarPayloadDossie(false)),
      })
      await downloadResponse(response, `pacote-dossie-${bancoCaso}.zip`)
      show('Pacote gerado com PDF executivo, cadastro canônico e modelos bancários preenchidos.', 'success')
    } catch (error) {
      console.error(error)
      show(error instanceof Error ? error.message : 'Não foi possível gerar o pacote ZIP.', 'error')
    } finally {
      setExportandoZip(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operação" title="Dossiês bancários" description="Selecione o cliente, revise a operação e prepare os documentos para o banco." />
      <details className="rounded-lg border border-aletis-borda bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Modelos disponíveis e como preparar um dossiê</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-sm leading-relaxed text-muted-foreground">Um cadastro único alimenta BTG, Itaú, Santander, Daycoval e BOCOM, reduzindo digitação repetida e erro manual. Revise os dados para gerar modelos bancários higienizados e preenchidos, cadastro canônico e PDF executivo.</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">{['Gerar checklist por banco', 'Reusar dados do cliente', 'Exportar PDF executivo', 'Gerar XLSX e DOCX preenchidos'].map(item=><li key={item} className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 text-positivo" />{item}</li>)}</ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon={FileSpreadsheet} label="Modelos" value={modelosCatalogo.length} />
            <MetricCard icon={Building2} label="Bancos/fontes" value={bancosMapeados} />
            <MetricCard icon={Layers3} label="Seções mapeadas" value={secoesMapeadas} />
            <MetricCard icon={ShieldCheck} label="Documentos legais" value={modelosLegais} />
          </div>
        </div>
      </details>

      <section className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-aletis-borda bg-card p-5 shadow-none">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-foreground" />
            <h2 className="font-display text-lg font-bold text-foreground">Montador de caso</h2>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-soft)]">Banco</span>
              <select
                value={bancoCaso}
                onChange={(event) => setBancoCaso(event.target.value as BancoDossieId)}
                className="mt-1 w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-aletis-dourado"
              >
                {bancosOperacionais.map((banco) => (
                  <option key={banco.id} value={banco.id}>{banco.nome}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-soft)]">Perfil do caso</span>
              <select
                value={perfilCaso}
                onChange={(event) => setPerfilCaso(event.target.value)}
                className="mt-1 w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-aletis-dourado"
              >
                {perfisCasoBancario.map((perfil) => (
                  <option key={perfil.id} value={perfil.id}>{perfil.titulo}</option>
                ))}
              </select>
            </label>

            <div className="border-t border-aletis-borda pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-foreground" />
                  <span className="text-xs font-bold text-foreground">Cliente e operação</span>
                </div>
                {dadosImportados > 0 && (
                  <span className="rounded-md bg-positivo/10 px-2 py-1 text-[11px] font-bold text-positivo">
                    {dadosImportados} registros consolidados
                  </span>
                )}
              </div>

              <label className="mt-3 block">
                <span className="text-xs font-semibold text-[var(--text-soft)]">Buscar cliente no CRM</span>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-soft)]" />
                  <input
                    value={buscaCliente}
                    onChange={(event) => setBuscaCliente(event.target.value)}
                    placeholder="Nome, cidade ou UF"
                    className="w-full rounded-lg border border-aletis-borda bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-aletis-dourado"
                  />
                </div>
                <span className="mt-3 block text-xs font-semibold text-[var(--text-soft)]">Selecionar cliente</span>
                <select
                  value={formulario.clienteId}
                  onChange={(event) => void handleClienteChange(event.target.value)}
                  disabled={carregandoClientes || carregandoCliente}
                  className="mt-1 w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-aletis-dourado disabled:cursor-wait disabled:opacity-60"
                >
                  <option value="">
                    {carregandoClientes ? 'Carregando clientes...' : 'Selecionar cliente'}
                  </option>
                  {clientesFiltrados.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nome}{cliente.cidade ? ` · ${cliente.cidade}/${cliente.uf || ''}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-3 space-y-3">
                <FormInput
                  label="Nome ou razão social"
                  value={formulario.nome}
                  onChange={(value) => atualizarFormulario('nome', value)}
                />
                <FormInput
                  label="CPF/CNPJ"
                  value={formulario.cpfCnpj}
                  onChange={(value) => atualizarFormulario('cpfCnpj', value)}
                />
                <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
                  <FormInput
                    label="Cidade"
                    value={formulario.cidade}
                    onChange={(value) => atualizarFormulario('cidade', value)}
                  />
                  <FormInput
                    label="UF"
                    value={formulario.uf}
                    maxLength={2}
                    onChange={(value) => atualizarFormulario('uf', value.toUpperCase())}
                  />
                </div>
                <FormInput
                  label="Atividade principal"
                  value={formulario.atividade}
                  onChange={(value) => atualizarFormulario('atividade', value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <FormInput
                    label="Cultura"
                    value={formulario.cultura}
                    onChange={(value) => atualizarFormulario('cultura', value)}
                  />
                  <FormInput
                    label="Safra atual"
                    value={formulario.safra}
                    placeholder="25/26"
                    onChange={(value) => atualizarFormulario('safra', value)}
                  />
                </div>
                <FormInput
                  label="Limite solicitado (R$)"
                  value={formulario.limiteSolicitado}
                  inputMode="decimal"
                  onChange={(value) => atualizarFormulario('limiteSolicitado', value)}
                />
                <FormInput
                  label="Prazo"
                  value={formulario.prazo}
                  placeholder="Ex.: 60 meses"
                  onChange={(value) => atualizarFormulario('prazo', value)}
                />
              </div>
            </div>

            <details className="border-t border-aletis-borda pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-foreground">
                <span>Produção da safra atual</span>
                <WandSparkles className="h-4 w-4 text-aletis-dourado-escuro" />
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <FormInput
                  label="Área própria (ha)"
                  value={formulario.areaPropriaHa}
                  inputMode="decimal"
                  onChange={(value) => atualizarFormulario('areaPropriaHa', value)}
                />
                <FormInput
                  label="Área arrendada (ha)"
                  value={formulario.areaArrendadaHa}
                  inputMode="decimal"
                  onChange={(value) => atualizarFormulario('areaArrendadaHa', value)}
                />
                <FormInput
                  label="Produtividade"
                  value={formulario.produtividade}
                  inputMode="decimal"
                  onChange={(value) => atualizarFormulario('produtividade', value)}
                />
                <FormInput
                  label="Preço unitário"
                  value={formulario.precoUnitario}
                  inputMode="decimal"
                  onChange={(value) => atualizarFormulario('precoUnitario', value)}
                />
                <div className="col-span-2">
                  <FormInput
                    label="Custo por hectare (R$)"
                    value={formulario.custoHa}
                    inputMode="decimal"
                    onChange={(value) => atualizarFormulario('custoHa', value)}
                  />
                </div>
              </div>
            </details>
          </div>

          <div className="mt-5 rounded-lg border border-aletis-borda bg-muted p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[var(--text-soft)]">Prontidão estrutural</span>
              <span className="font-display text-2xl font-bold text-foreground">{prontidao}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-card">
              <div className="h-2 rounded-full bg-aletis-dourado" style={{ width: `${prontidao}%` }} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--text-soft)]">
              {carregandoPreparacao
                ? 'Conferindo CRM, Dossiê Agro, Gestão Financeira e FARMS...'
                : 'Calculada com os dados disponíveis e as validações ou documentos ainda pendentes.'}
            </p>
            {preparacao && (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-positivo/10 p-2">
                    <div className="text-base font-bold text-positivo">{preparacao.status.mapeados}</div>
                    <div className="text-[11px] font-semibold text-[var(--text-soft)]">Mapeados</div>
                  </div>
                  <div className="rounded-md bg-sky-50 p-2">
                    <div className="text-base font-bold text-sky-800">{preparacao.status.validar}</div>
                    <div className="text-[11px] font-semibold text-[var(--text-soft)]">Validar</div>
                  </div>
                  <div className="rounded-md bg-aletis-dourado/10 p-2">
                    <div className="text-base font-bold text-aletis-dourado-escuro">{preparacao.status.solicitarAoCliente}</div>
                    <div className="text-[11px] font-semibold text-[var(--text-soft)]">Solicitar</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {preparacao.fontes.filter((fonte) => fonte.registros > 0).map((fonte) => (
                    <span
                      key={fonte.fonte}
                      title={fonte.detalhe}
                      className="rounded-md border border-aletis-borda bg-card px-2 py-1 text-[11px] font-semibold text-foreground"
                    >
                      {fonte.fonte.replace(/_/g, ' ')} · {fonte.registros}
                    </span>
                  ))}
                </div>
                <div className="mt-3 border-t border-aletis-borda pt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-soft)]">Cobertura encontrada</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {Object.entries(preparacao.cobertura).map(([campo, total]) => (
                      <div key={campo} className="flex items-center justify-between gap-2">
                        <span className="capitalize text-[var(--text-soft)]">{campo.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="font-bold text-foreground">{total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleExportZip}
            disabled={exportandoZip}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-aletis-verde px-4 py-3 text-sm font-semibold text-aletis-cream transition hover:bg-aletis-verde-escuro disabled:cursor-wait disabled:opacity-70"
          >
            <Archive className="h-4 w-4" />
            {exportandoZip ? 'Preenchendo modelos...' : 'Gerar pacote bancário completo'}
          </button>

          {bancoCaso === 'geral' && (
            <button
              type="button"
              onClick={handlePreviewBase}
              disabled={exportandoBase}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-aletis-dourado px-4 py-3 text-sm font-bold text-aletis-verde-escuro transition hover:bg-aletis-dourado-escuro disabled:cursor-wait disabled:opacity-70"
            >
              <FileText className="h-4 w-4" />
              {exportandoBase ? 'Estruturando Base ALETIS...' : 'Gerar documento Base ALETIS'}
            </button>
          )}

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportando}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-aletis-verde/20 bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:border-aletis-dourado/50 hover:bg-aletis-cream-papel disabled:cursor-wait disabled:opacity-70"
          >
            <Download className="h-4 w-4" />
            {exportando ? 'Montando dossiê...' : 'Baixar somente PDF executivo'}
          </button>

          <div className="mt-5 space-y-3">
            {etapasDossieBancario.map((etapa, index) => (
              <div key={etapa.titulo} className="flex gap-3">
                <div className="flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-aletis-borda bg-card text-xs font-bold text-foreground">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{etapa.titulo.replace(/^\d+\.\s*/, '')}</p>
                  <p className="text-xs leading-relaxed text-[var(--text-soft)]">{etapa.descricao}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-5 min-w-0">
          <section className="rounded-lg border border-aletis-borda bg-card p-5 shadow-none">
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-foreground" />
                  <h2 className="font-display text-lg font-bold text-foreground">Biblioteca de modelos</h2>
                </div>
                <p className="mt-1 text-sm text-[var(--text-soft)]">
                  Arquivos enviados ao servidor organizados por banco, finalidade e risco de automação.
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
                <SearchField label="Buscar modelos" value={busca} onChange={setBusca} placeholder="Modelo, banco ou seção" />
                <label className="text-xs font-medium text-muted-foreground">Banco dos modelos<select
                  value={bancoFiltro}
                  onChange={(event) => setBancoFiltro(event.target.value as BancoFiltro)}
                  className="input-field mt-1.5 block w-full sm:w-48"
                >
                  <option value="todos">Todos os bancos</option>
                  {bancosDossie.map((banco) => (
                    <option key={banco.id} value={banco.id}>{banco.nome}</option>
                  ))}
                </select></label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p role="status">{modelosFiltrados.length} modelos encontrados</p>{(busca.trim() || bancoFiltro !== 'todos') && <button type="button" onClick={()=>{setBusca('');setBancoFiltro('todos')}} className="rounded px-2 py-1 font-medium hover:bg-muted">Limpar filtros dos modelos</button>}</div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {modelosFiltrados.map((modelo) => (
                <button
                  key={modelo.id}
                  type="button"
                  onClick={() => setModeloSelecionadoId(modelo.id)}
                  className={`group min-w-0 rounded-lg border bg-card p-4 text-left transition hover:border-aletis-dourado/60  ${modeloSelecionado.id === modelo.id ? 'border-aletis-dourado shadow-none' : 'border-aletis-borda'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-soft)]">{formatModeloResumo(modelo)}</p>
                      <h3 className="mt-1 line-clamp-2 font-display text-base font-bold text-foreground">{modelo.titulo}</h3>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1">
                      <span className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${statusTone[modelo.status]}`}>
                        {modelo.status}
                      </span>
                      {modelo.disponivel === false && (
                        <span className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800">
                          arquivo ausente
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[var(--text-soft)]">{modelo.finalidade}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${categoriaTone[modelo.categoria]}`}>
                      {categoriaLabel[modelo.categoria]}
                    </span>
                    <span className="rounded-lg border border-aletis-borda bg-muted px-2 py-1 text-[11px] font-semibold text-foreground">
                      {modelo.formato.toUpperCase()}
                    </span>
                    <span className="rounded-lg border border-aletis-borda bg-card px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)]">
                      {modelo.secoes.length} secoes
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-aletis-borda bg-card p-5 shadow-none">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-foreground" />
                <h2 className="font-display text-lg font-bold text-foreground">Checklist do caso</h2>
              </div>
              <p className="mt-1 text-sm text-[var(--text-soft)]">
                {nomeBancoDossie(bancoCaso)} · {perfisCasoBancario.find((perfil) => perfil.id === perfilCaso)?.titulo}
              </p>

              <div className="mt-4 max-h-[520px] space-y-2 overflow-auto pr-1">
                {checklistCaso.map((item) => (
                  <div key={`${item.item}-${item.etapa}`} className="rounded-lg border border-aletis-borda bg-card p-3">
                    <p className="text-sm font-semibold leading-snug text-foreground">{item.item}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-lg border border-aletis-borda bg-muted px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)]">
                        {item.origem}
                      </span>
                      <span className="rounded-lg border border-aletis-borda bg-card px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)]">
                        {item.etapa}
                      </span>
                      <span className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${checklistStatusClass(item.status)}`}>
                        {checklistStatusLabel(item.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="rounded-lg border border-aletis-borda bg-card p-5 shadow-none">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-foreground" />
                <h2 className="font-display text-lg font-bold text-foreground">Modelo selecionado</h2>
              </div>
              <div className="mt-4">
                <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${categoriaTone[modeloSelecionado.categoria]}`}>
                  {categoriaLabel[modeloSelecionado.categoria]}
                </span>
                <h3 className="mt-3 font-display text-xl font-bold text-foreground">{modeloSelecionado.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">{modeloSelecionado.finalidade}</p>
              </div>
              <div className="mt-4 space-y-3">
                <DetailBlock title="Arquivo original" items={[modeloSelecionado.arquivo]} />
                <DetailBlock title="Secoes mapeadas" items={modeloSelecionado.secoes} />
                <DetailBlock title="Saidas planejadas" items={modeloSelecionado.saidas} />
                <DetailBlock title="Controle de qualidade" items={modeloSelecionado.observacoes} />
              </div>
            </aside>
          </section>
        </div>
      </section>

      <section className="rounded-lg border border-aletis-borda bg-card p-5 shadow-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-foreground" />
              <h2 className="font-display text-lg font-bold text-foreground">Dicionário único ALETIS</h2>
            </div>
            <p className="mt-1 text-sm text-[var(--text-soft)]">
              Campos que devem existir uma vez no cliente e alimentar todos os modelos bancários.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg border border-aletis-borda bg-muted px-3 py-2 text-xs font-semibold text-foreground">
            <Filter className="h-4 w-4" />
            {camposCanonicosAletis.length} blocos canonicos
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {camposCanonicosAletis.map((campo) => (
            <div key={campo.id} className="rounded-lg border border-aletis-borda bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-muted text-foreground">
                  <Target className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold text-foreground">{campo.titulo}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-soft)]">{campo.descricao}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {campo.usadoEm.slice(0, 4).map((banco) => (
                  <span key={banco} className="rounded-lg border border-aletis-borda bg-muted px-2 py-1 text-[11px] font-semibold text-foreground">
                    {nomeBancoDossie(banco)}
                  </span>
                ))}
                {campo.usadoEm.length > 4 && (
                  <span className="rounded-lg border border-aletis-borda bg-card px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)]">
                    +{campo.usadoEm.length - 4}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-aletis-borda bg-aletis-verde p-5 text-aletis-cream shadow-none">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-aletis-dourado">
              <BarChart3 className="h-5 w-5" />
              <h2 className="font-display text-xl font-bold text-aletis-cream">Próxima etapa técnica</h2>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-aletis-cream/80">
              BTG e Itaú já geram cópias preenchidas e higienizadas. O próximo ciclo amplia o mesmo motor para Santander, Daycoval e BOCOM, preservando macros, fórmulas e layouts oficiais.
            </p>
          </div>
          <div className="rounded-lg border border-aletis-cream/15 bg-white/8 p-4">
            <p className="text-xs font-semibold text-aletis-dourado">Fluxo final</p>
            <p className="mt-1 font-display text-2xl font-bold">Cliente → Dossie → Banco</p>
            <div className="mt-3 flex items-center gap-2 text-sm text-aletis-cream/80">
              <span>Dados únicos</span>
              <ArrowRight className="h-4 w-4" />
              <span>Arquivos finais</span>
            </div>
          </div>
        </div>
      </section>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-aletis-borda bg-muted p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-aletis-dourado-escuro" />
        <span className="text-xs font-semibold text-[var(--text-soft)]">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
    </div>
  )
}

function DetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-aletis-borda bg-muted p-3">
      <p className="text-xs font-bold text-foreground">{title}</p>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-xs leading-relaxed text-[var(--text-soft)]">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-positivo" />
            <span className="min-w-0 break-words">{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputMode?: 'text' | 'decimal' | 'numeric'
  maxLength?: number
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-semibold leading-tight text-[var(--text-soft)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        className="mt-1 w-full min-w-0 rounded-lg border border-aletis-borda bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-aletis-grafite-medio/50 focus:border-aletis-dourado"
      />
    </label>
  )
}

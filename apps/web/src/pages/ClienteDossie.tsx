/**
 * Página de Dossiê Agro Canônico (padrão Daycoval 2025).
 *
 * Organiza o preenchimento do dossiê em 9 seções colapsáveis:
 * grupo econômico, operacional, produção, imóveis, máquinas, dívidas,
 * capital de giro, relacionamento bancário, comerciais.
 *
 * Cada mudança agenda um save (debounce 1.5s). Toolbar mostra versão
 * atual, permite abrir histórico e exportar JSON. O layout é
 * deliberadamente denso: o objetivo é acomodar o padrão de mercado
 * completo sem esconder campos atrás de modais.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, History, Save, AlertCircle, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import {
  dossieAgroVazio,
  type DossieAgro,
  type IntegrantePF,
  type IntegrantePJ,
  type QuadroAgriculturaUF,
  type QuadroPecuariaUF,
  type ImovelRuralDossie,
  type MaquinaAgricola,
  type DividaBancaria,
  type DividaFornecedor,
  type DividaTerra,
  type ContaBancaria,
  type RelacaoComercial,
  type AdministradorChave,
  type FornecedorResumo,
  type SafraAgricola,
  type UF,
  type CulturaAgricola,
  type AtividadePecuaria,
  type ModalidadeCreditoDossie,
  type Moeda,
} from '@aletis/shared-types'
import { apiFetch } from '../hooks/useApi'

// ─── helpers genéricos ─────────────────────────────────────

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10)
}
function rid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}
function fmtData(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

// ─── listas de opções ──────────────────────────────────────

const UFS: UF[] = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]

const CULTURAS: Array<{ v: CulturaAgricola; label: string }> = [
  { v: 'soja_sequeiro', label: 'Soja Sequeiro' },
  { v: 'soja_irrigada', label: 'Soja Irrigada' },
  { v: 'soja_sementes_propria', label: 'Soja Sementes (própria)' },
  { v: 'soja_sementes_cooperados', label: 'Soja Sementes (cooperados)' },
  { v: 'milho_verao', label: 'Milho Verão' },
  { v: 'milho_verao_irrigado', label: 'Milho Verão Irrigado' },
  { v: 'milho_safrinha', label: 'Milho Safrinha' },
  { v: 'milho_safrinha_irrigado', label: 'Milho Safrinha Irrigado' },
  { v: 'algodao_1a_safra', label: 'Algodão 1ª Safra' },
  { v: 'algodao_1a_safra_irrigado', label: 'Algodão 1ª Safra Irrigado' },
  { v: 'algodao_2a_safra', label: 'Algodão 2ª Safra' },
  { v: 'algodao_2a_safra_irrigado', label: 'Algodão 2ª Safra Irrigado' },
  { v: 'sorgo', label: 'Sorgo' },
  { v: 'feijao', label: 'Feijão' },
  { v: 'arroz', label: 'Arroz' },
  { v: 'cafe', label: 'Café' },
  { v: 'cana', label: 'Cana' },
  { v: 'trigo', label: 'Trigo' },
  { v: 'girassol', label: 'Girassol' },
  { v: 'amendoim', label: 'Amendoim' },
  { v: 'outra', label: 'Outra (descrever)' },
]

const ATIV_PECUARIA: Array<{ v: AtividadePecuaria; label: string }> = [
  { v: 'cria', label: 'Cria' },
  { v: 'recria', label: 'Recria' },
  { v: 'engorda', label: 'Engorda' },
  { v: 'ciclo_completo', label: 'Ciclo completo' },
  { v: 'leite', label: 'Leite' },
  { v: 'ovinocultura', label: 'Ovinocultura' },
  { v: 'suinocultura', label: 'Suinocultura' },
  { v: 'avicultura', label: 'Avicultura' },
  { v: 'outra', label: 'Outra' },
]

const MODALIDADES_CREDITO: Array<{ v: ModalidadeCreditoDossie; label: string }> = [
  { v: 'custeio', label: 'Custeio' },
  { v: 'investimento', label: 'Investimento' },
  { v: 'capital_giro', label: 'Capital de Giro' },
  { v: 'pronaf', label: 'Pronaf' },
  { v: 'pronamp', label: 'Pronamp' },
  { v: 'cpr_fisica', label: 'CPR Física' },
  { v: 'cpr_financeira', label: 'CPR Financeira' },
  { v: 'barter', label: 'Barter' },
  { v: 'fornecedor', label: 'Fornecedor' },
  { v: 'terra', label: 'Compra de Terra' },
  { v: 'leasing', label: 'Leasing' },
  { v: 'outro', label: 'Outro' },
]

const MOEDAS: Moeda[] = ['BRL', 'USD', 'EUR']

// ─── UI atoms ──────────────────────────────────────────────

function Section({
  titulo,
  descricao,
  children,
  defaultOpen = false,
}: {
  titulo: string
  descricao?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details
      className="card-premium p-0 mb-4 overflow-hidden"
      open={defaultOpen}
    >
      <summary className="px-5 py-4 cursor-pointer bg-aletis-bg-suave/40 hover:bg-aletis-bg-suave/60 transition-colors flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">{titulo}</h2>
          {descricao && <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">{descricao}</p>}
        </div>
        <span className="text-xs text-aletis-grafite-claro font-mono">clique p/ expandir</span>
      </summary>
      <div className="p-5 space-y-4">{children}</div>
    </details>
  )
}

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-body text-aletis-grafite-medio">
      <span className="font-medium text-aletis-grafite-escuro">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-aletis-grafite-claro">{hint}</span>}
    </label>
  )
}

const inputCls = 'input-base w-full text-sm px-3 py-2 border border-aletis-borda rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-aletis-verde'
const textareaCls = inputCls + ' min-h-[80px] resize-y font-body'

// ─── Página ────────────────────────────────────────────────

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export default function ClienteDossie() {
  const { id = '' } = useParams<{ id: string }>()
  const apiId = id === 'ailton-caeiro' ? 'cli-001' : id === 'paulo-luciano' ? 'cli-002' : id
  const [dossie, setDossie] = useState<DossieAgro | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [ultimoSalvo, setUltimoSalvo] = useState<string | null>(null)
  const [historico, setHistorico] = useState<Array<{ versao: number; atualizadoEm: string; atualizadoPor?: string }>>([])
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const primeiraCargaRef = useRef(true)

  // Carrega o dossiê; se não existe, usa vazio.
  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setErro(null)
    fetch(`/api/clientes/${apiId}/dossie`)
      .then(async (res) => {
        const json = await res.json()
        if (cancelado) return
        if (res.ok && json.success) {
          setDossie(json.data as DossieAgro)
          setUltimoSalvo((json.data as DossieAgro).atualizadoEm)
        } else if (res.status === 404 && json.data?.vazio) {
          setDossie(json.data.vazio as DossieAgro)
        } else {
          // fallback — gera vazio local mesmo
          setDossie(dossieAgroVazio(apiId, hojeIso()))
          if (res.status !== 404) setErro(json.error || 'Falha ao carregar dossiê.')
        }
      })
      .catch((e) => {
        if (cancelado) return
        setErro((e as Error).message)
        setDossie(dossieAgroVazio(apiId, hojeIso()))
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [apiId])

  // carregar histórico
  const recarregarHistorico = useCallback(async () => {
    try {
      const itens = await apiFetch<Array<{ versao: number; atualizadoEm: string; atualizadoPor?: string }>>(
        `/clientes/${apiId}/dossie/historico?limit=10`,
      )
      setHistorico(itens)
    } catch {
      setHistorico([])
    }
  }, [apiId])

  useEffect(() => {
    if (mostrarHistorico) void recarregarHistorico()
  }, [mostrarHistorico, recarregarHistorico])

  // Autosave com debounce de 1.5s. Ignora a primeira render (hidratação inicial).
  useEffect(() => {
    if (primeiraCargaRef.current) {
      primeiraCargaRef.current = false
      return
    }
    if (!dossie) return
    setSaveState('pending')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveState('saving')
      try {
        const persistido = await apiFetch<DossieAgro>(`/clientes/${apiId}/dossie`, {
          method: 'PUT',
          body: JSON.stringify(dossie),
        })
        // atualiza versão/timestamp sem disparar novo save
        primeiraCargaRef.current = true
        setDossie(persistido)
        setUltimoSalvo(persistido.atualizadoEm)
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
      } catch (e) {
        setErro((e as Error).message)
        setSaveState('error')
      }
    }, 1500)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [dossie, apiId])

  const salvarAgora = useCallback(async () => {
    if (!dossie) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('saving')
    try {
      const persistido = await apiFetch<DossieAgro>(`/clientes/${apiId}/dossie`, {
        method: 'PUT',
        body: JSON.stringify(dossie),
      })
      primeiraCargaRef.current = true
      setDossie(persistido)
      setUltimoSalvo(persistido.atualizadoEm)
      setSaveState('saved')
    } catch (e) {
      setErro((e as Error).message)
      setSaveState('error')
    }
  }, [dossie, apiId])

  const exportarJson = useCallback(() => {
    if (!dossie) return
    const blob = new Blob([JSON.stringify(dossie, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dossie-agro-${dossie.clienteId}-v${dossie.versao}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [dossie])

  // ─── updater helper (imutável) ──────────────────────────
  const update = useCallback(<K extends keyof DossieAgro>(key: K, value: DossieAgro[K]) => {
    setDossie((prev) => (prev ? { ...prev, [key]: value } : prev))
  }, [])

  // ─── render ───────────────────────────────────────────
  if (carregando || !dossie) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-aletis-dourado" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      {/* TOOLBAR */}
      <div className="card-premium p-4 mb-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={`/clientes/${apiId}`}
            className="btn-outline inline-flex items-center gap-1.5 text-sm px-3 py-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar
          </Link>
          <div>
            <h1 className="text-xl font-display font-bold text-aletis-grafite-escuro">Dossiê Agro Canônico</h1>
            <p className="text-xs font-body text-aletis-grafite-claro">
              Padrão Daycoval 2025 — cliente <span className="font-mono">{apiId}</span> · versão{' '}
              <span className="font-mono">v{dossie.versao}</span> · salvo{' '}
              {ultimoSalvo ? fmtData(ultimoSalvo) : 'nunca'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-body flex items-center gap-1.5">
            {saveState === 'idle' && <span className="text-aletis-grafite-claro">Rascunho sincronizado</span>}
            {saveState === 'pending' && <span className="text-aletis-dourado">Editando…</span>}
            {saveState === 'saving' && <span className="text-aletis-verde">Salvando…</span>}
            {saveState === 'saved' && (
              <span className="text-aletis-verde inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Salvo
              </span>
            )}
            {saveState === 'error' && (
              <span className="text-red-600 inline-flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Falha ao salvar
              </span>
            )}
          </span>
          <button onClick={() => setMostrarHistorico((v) => !v)} className="btn-outline inline-flex items-center gap-1.5 text-sm px-3 py-1.5">
            <History className="w-3.5 h-3.5" />
            Histórico
          </button>
          <button onClick={exportarJson} className="btn-outline inline-flex items-center gap-1.5 text-sm px-3 py-1.5">
            <Download className="w-3.5 h-3.5" />
            Exportar JSON
          </button>
          <button onClick={salvarAgora} className="btn-gold inline-flex items-center gap-1.5 text-sm px-3 py-1.5">
            <Save className="w-3.5 h-3.5" />
            Salvar agora
          </button>
        </div>
      </div>

      {erro && (
        <div className="card-premium p-3 mb-4 text-sm text-red-700 bg-red-50 border border-red-200">
          {erro}
        </div>
      )}

      {mostrarHistorico && (
        <div className="card-premium p-4 mb-4">
          <h2 className="text-sm font-display font-semibold text-aletis-grafite-escuro mb-2">Histórico de versões</h2>
          {historico.length === 0 ? (
            <p className="text-xs text-aletis-grafite-claro">Nenhuma versão anterior ainda.</p>
          ) : (
            <ul className="space-y-1">
              {historico.map((h) => (
                <li key={h.versao} className="text-xs font-body flex justify-between items-center border-b border-aletis-borda/50 py-1.5">
                  <span>v{h.versao} — {fmtData(h.atualizadoEm)}{h.atualizadoPor ? ` · ${h.atualizadoPor}` : ''}</span>
                  <Link
                    to={`/clientes/${apiId}/dossie/versao/${h.versao}`}
                    onClick={async (e) => {
                      e.preventDefault()
                      try {
                        const d = await apiFetch<DossieAgro>(`/clientes/${apiId}/dossie/versao/${h.versao}`)
                        const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `dossie-agro-${apiId}-v${h.versao}.json`
                        a.click()
                        URL.revokeObjectURL(url)
                      } catch {
                        // best-effort
                      }
                    }}
                    className="text-xs text-aletis-verde hover:underline"
                  >
                    baixar JSON
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* CABEÇALHO */}
      <Section titulo="Cabeçalho" descricao="Data-base de referência e observações globais" defaultOpen>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Data-base">
            <input
              type="date"
              className={inputCls}
              value={dossie.dataBase}
              onChange={(e) => update('dataBase', e.target.value)}
            />
          </Field>
          <Field label="Atualizado por (nome)">
            <input
              className={inputCls}
              value={dossie.atualizadoPor ?? ''}
              onChange={(e) => update('atualizadoPor', e.target.value)}
            />
          </Field>
          <Field label="Versão atual">
            <input className={inputCls} value={`v${dossie.versao}`} disabled />
          </Field>
        </div>
        <Field label="Observações gerais">
          <textarea
            className={textareaCls}
            value={dossie.observacoes ?? ''}
            onChange={(e) => update('observacoes', e.target.value)}
            placeholder="Notas livres sobre o dossiê (safra difícil, reestruturação em curso, etc)."
          />
        </Field>
      </Section>

      {/* 1. GRUPO ECONÔMICO */}
      <Section titulo="1. Grupo Econômico" descricao="Pessoas físicas e empresas que compõem o grupo (padrão Daycoval §1)" defaultOpen>
        <GrupoEconomicoEditor
          valor={dossie.grupoEconomico}
          onChange={(g) => update('grupoEconomico', g)}
        />
      </Section>

      {/* 2. OPERACIONAL */}
      <Section titulo="2. Operacional" descricao="Histórico, administradores, infraestrutura, comercialização, fornecedores">
        <OperacionalEditor
          valor={dossie.operacional}
          onChange={(o) => update('operacional', o)}
        />
      </Section>

      {/* 3. PRODUÇÃO */}
      <Section titulo="3. Produção" descricao="Quadros de agricultura (por UF x cultura) e pecuária">
        <ProducaoEditor valor={dossie.producao} onChange={(p) => update('producao', p)} />
      </Section>

      {/* 4. IMÓVEIS */}
      <Section titulo="4. Imóveis Rurais" descricao="Propriedades, vendas em curso, arrendamentos recebidos, armazenagem">
        <ImoveisEditor valor={dossie.imoveis} onChange={(v) => update('imoveis', v)} />
      </Section>

      {/* 5. MÁQUINAS */}
      <Section titulo="5. Frota / Máquinas" descricao="Trator, colheitadeira, plantadeira, pulverizador, implementos">
        <MaquinasEditor valor={dossie.maquinas} onChange={(v) => update('maquinas', v)} />
      </Section>

      {/* 6. DÍVIDAS */}
      <Section titulo="6. Estrutura de Dívidas" descricao="Bancárias (com amortização anual), fornecedores/barter, terras">
        <DividasEditor valor={dossie.dividas} onChange={(v) => update('dividas', v)} />
      </Section>

      {/* 7. CAPITAL DE GIRO */}
      <Section titulo="7. Capital de Giro" descricao="Recebíveis, estoques, disponibilidades, NCG">
        <CapitalGiroEditor valor={dossie.capitalGiro} onChange={(v) => update('capitalGiro', v)} />
      </Section>

      {/* 8. RELACIONAMENTO BANCÁRIO */}
      <Section titulo="8. Relacionamento Bancário" descricao="Contas, limites, cheque-especial">
        <RelacionamentoBancarioEditor
          valor={dossie.relacionamentoBancario}
          onChange={(v) => update('relacionamentoBancario', v)}
        />
      </Section>

      {/* 9. COMERCIAIS */}
      <Section titulo="9. Relações Comerciais" descricao="Tradings, cooperativas, frigoríficos, industriais">
        <ComerciaisEditor valor={dossie.comerciais} onChange={(v) => update('comerciais', v)} />
      </Section>
    </div>
  )
}

/* ============================================================
 *  Editores por seção
 * ============================================================ */

// ── 1. Grupo econômico ─────────────────────────────────────

function GrupoEconomicoEditor({
  valor,
  onChange,
}: {
  valor: DossieAgro['grupoEconomico']
  onChange: (v: DossieAgro['grupoEconomico']) => void
}) {
  const addPF = () => {
    const novo: IntegrantePF = { id: rid('pf'), nome: '', cpf: '' }
    onChange({ ...valor, pessoasFisicas: [...valor.pessoasFisicas, novo] })
  }
  const addPJ = () => {
    const novo: IntegrantePJ = { id: rid('pj'), razaoSocial: '', cnpj: '' }
    onChange({ ...valor, pessoasJuridicas: [...valor.pessoasJuridicas, novo] })
  }
  const updatePF = (id: string, patch: Partial<IntegrantePF>) =>
    onChange({
      ...valor,
      pessoasFisicas: valor.pessoasFisicas.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  const updatePJ = (id: string, patch: Partial<IntegrantePJ>) =>
    onChange({
      ...valor,
      pessoasJuridicas: valor.pessoasJuridicas.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  const removePF = (id: string) =>
    onChange({ ...valor, pessoasFisicas: valor.pessoasFisicas.filter((p) => p.id !== id) })
  const removePJ = (id: string) =>
    onChange({ ...valor, pessoasJuridicas: valor.pessoasJuridicas.filter((p) => p.id !== id) })

  return (
    <>
      {/* PFs */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-display font-semibold">Pessoas Físicas</h3>
          <button onClick={addPF} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> adicionar PF
          </button>
        </div>
        {valor.pessoasFisicas.length === 0 && <p className="text-xs text-aletis-grafite-claro">Nenhuma PF cadastrada.</p>}
        {valor.pessoasFisicas.map((pf) => (
          <div key={pf.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
            <Field label="Nome">
              <input className={inputCls} value={pf.nome} onChange={(e) => updatePF(pf.id, { nome: e.target.value })} />
            </Field>
            <Field label="CPF (só dígitos)">
              <input
                className={inputCls}
                value={pf.cpf}
                onChange={(e) => updatePF(pf.id, { cpf: e.target.value.replace(/\D/g, '') })}
                maxLength={11}
              />
            </Field>
            <Field label="Idade">
              <input type="number" className={inputCls} value={pf.idade ?? ''} onChange={(e) => updatePF(pf.id, { idade: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Bacen total (R$)">
              <input type="number" step="0.01" className={inputCls} value={pf.bacenTotal ?? ''} onChange={(e) => updatePF(pf.id, { bacenTotal: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Curto prazo (R$)">
              <input type="number" step="0.01" className={inputCls} value={pf.curtoPrazo ?? ''} onChange={(e) => updatePF(pf.id, { curtoPrazo: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Longo prazo (R$)">
              <input type="number" step="0.01" className={inputCls} value={pf.longoPrazo ?? ''} onChange={(e) => updatePF(pf.id, { longoPrazo: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Coobrigações (R$)">
              <input type="number" step="0.01" className={inputCls} value={pf.coobrigacoes ?? ''} onChange={(e) => updatePF(pf.id, { coobrigacoes: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Moeda estrangeira (R$)">
              <input type="number" step="0.01" className={inputCls} value={pf.moedaEstrangeira ?? ''} onChange={(e) => updatePF(pf.id, { moedaEstrangeira: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Restrições (texto)">
              <input className={inputCls} value={pf.restricoes ?? ''} onChange={(e) => updatePF(pf.id, { restricoes: e.target.value })} />
            </Field>
            <Field label="Observações">
              <input className={inputCls} value={pf.observacoes ?? ''} onChange={(e) => updatePF(pf.id, { observacoes: e.target.value })} />
            </Field>
            <div className="col-span-full flex justify-end">
              <button onClick={() => removePF(pf.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> remover
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* PJs */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-display font-semibold">Pessoas Jurídicas</h3>
          <button onClick={addPJ} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> adicionar PJ
          </button>
        </div>
        {valor.pessoasJuridicas.length === 0 && <p className="text-xs text-aletis-grafite-claro">Nenhuma PJ cadastrada.</p>}
        {valor.pessoasJuridicas.map((pj) => (
          <div key={pj.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
            <Field label="Razão Social">
              <input className={inputCls} value={pj.razaoSocial} onChange={(e) => updatePJ(pj.id, { razaoSocial: e.target.value })} />
            </Field>
            <Field label="CNPJ (só dígitos)">
              <input
                className={inputCls}
                value={pj.cnpj}
                onChange={(e) => updatePJ(pj.id, { cnpj: e.target.value.replace(/\D/g, '') })}
                maxLength={14}
              />
            </Field>
            <Field label="Atividade / CNAE">
              <input className={inputCls} value={pj.atividade ?? ''} onChange={(e) => updatePJ(pj.id, { atividade: e.target.value })} />
            </Field>
            <Field label="Bacen total (R$)">
              <input type="number" step="0.01" className={inputCls} value={pj.bacenTotal ?? ''} onChange={(e) => updatePJ(pj.id, { bacenTotal: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Curto prazo (R$)">
              <input type="number" step="0.01" className={inputCls} value={pj.curtoPrazo ?? ''} onChange={(e) => updatePJ(pj.id, { curtoPrazo: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Longo prazo (R$)">
              <input type="number" step="0.01" className={inputCls} value={pj.longoPrazo ?? ''} onChange={(e) => updatePJ(pj.id, { longoPrazo: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Coobrigações (R$)">
              <input type="number" step="0.01" className={inputCls} value={pj.coobrigacoes ?? ''} onChange={(e) => updatePJ(pj.id, { coobrigacoes: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Moeda estrangeira (R$)">
              <input type="number" step="0.01" className={inputCls} value={pj.moedaEstrangeira ?? ''} onChange={(e) => updatePJ(pj.id, { moedaEstrangeira: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Restrições">
              <input className={inputCls} value={pj.restricoes ?? ''} onChange={(e) => updatePJ(pj.id, { restricoes: e.target.value })} />
            </Field>
            <Field label="Observações">
              <input className={inputCls} value={pj.observacoes ?? ''} onChange={(e) => updatePJ(pj.id, { observacoes: e.target.value })} />
            </Field>
            <div className="col-span-full flex justify-end">
              <button onClick={() => removePJ(pj.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> remover
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Field label="Demanda total declarada (R$)">
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={valor.demandaTotal ?? ''}
            onChange={(e) => onChange({ ...valor, demandaTotal: e.target.value ? Number(e.target.value) : undefined })}
          />
        </Field>
        <Field label="Observações do grupo">
          <input className={inputCls} value={valor.observacoes ?? ''} onChange={(e) => onChange({ ...valor, observacoes: e.target.value })} />
        </Field>
      </div>
    </>
  )
}

// ── 2. Operacional ─────────────────────────────────────────

function OperacionalEditor({
  valor,
  onChange,
}: {
  valor: DossieAgro['operacional']
  onChange: (v: DossieAgro['operacional']) => void
}) {
  const addAdmin = () => {
    const n: AdministradorChave = { id: rid('adm'), nome: '', responsabilidade: '' }
    onChange({ ...valor, administradores: [...valor.administradores, n] })
  }
  const updAdmin = (id: string, patch: Partial<AdministradorChave>) =>
    onChange({ ...valor, administradores: valor.administradores.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
  const rmAdmin = (id: string) =>
    onChange({ ...valor, administradores: valor.administradores.filter((a) => a.id !== id) })

  const addFornecedor = () => {
    const n: FornecedorResumo = { id: rid('forn'), tipoProduto: 'fertilizantes', fornecedores: '' }
    onChange({ ...valor, fornecedores: [...valor.fornecedores, n] })
  }
  const updFornecedor = (id: string, patch: Partial<FornecedorResumo>) =>
    onChange({ ...valor, fornecedores: valor.fornecedores.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  const rmFornecedor = (id: string) =>
    onChange({ ...valor, fornecedores: valor.fornecedores.filter((f) => f.id !== id) })

  return (
    <>
      <Field label="História / Contexto operacional" hint="Origem, evolução, safras difíceis, investimentos.">
        <textarea
          className={textareaCls}
          value={valor.historia ?? ''}
          onChange={(e) => onChange({ ...valor, historia: e.target.value })}
        />
      </Field>

      {/* Administradores */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-display font-semibold">Administradores</h3>
          <button onClick={addAdmin} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> adicionar
          </button>
        </div>
        {valor.administradores.map((a) => (
          <div key={a.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
            <Field label="Nome"><input className={inputCls} value={a.nome} onChange={(e) => updAdmin(a.id, { nome: e.target.value })} /></Field>
            <Field label="Responsabilidade"><input className={inputCls} value={a.responsabilidade} onChange={(e) => updAdmin(a.id, { responsabilidade: e.target.value })} /></Field>
            <Field label="Grau de instrução / experiência"><input className={inputCls} value={a.grauInstrucaoOuExperiencia ?? ''} onChange={(e) => updAdmin(a.id, { grauInstrucaoOuExperiencia: e.target.value })} /></Field>
            <div className="col-span-full flex justify-end">
              <button onClick={() => rmAdmin(a.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> remover
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Terceirizações */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="p-3 rounded border border-aletis-borda/50">
          <h4 className="text-sm font-display font-semibold mb-2">Terceirização de maquinário</h4>
          <label className="text-xs inline-flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={valor.terceirizacaoMaquinario?.possui ?? false}
              onChange={(e) => onChange({ ...valor, terceirizacaoMaquinario: { ...(valor.terceirizacaoMaquinario ?? { possui: false }), possui: e.target.checked } })}
            />
            Possui terceirização?
          </label>
          <Field label="Descrição">
            <input className={inputCls} value={valor.terceirizacaoMaquinario?.descricao ?? ''} onChange={(e) => onChange({ ...valor, terceirizacaoMaquinario: { ...(valor.terceirizacaoMaquinario ?? { possui: false }), descricao: e.target.value } })} />
          </Field>
          <Field label="Valor por safra (R$)">
            <input type="number" step="0.01" className={inputCls} value={valor.terceirizacaoMaquinario?.valorPorSafra ?? ''} onChange={(e) => onChange({ ...valor, terceirizacaoMaquinario: { ...(valor.terceirizacaoMaquinario ?? { possui: false }), valorPorSafra: e.target.value ? Number(e.target.value) : undefined } })} />
          </Field>
        </div>
        <div className="p-3 rounded border border-aletis-borda/50">
          <h4 className="text-sm font-display font-semibold mb-2">Terceirização de armazenagem</h4>
          <label className="text-xs inline-flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={valor.terceirizacaoArmazenagem?.possui ?? false}
              onChange={(e) => onChange({ ...valor, terceirizacaoArmazenagem: { ...(valor.terceirizacaoArmazenagem ?? { possui: false }), possui: e.target.checked } })}
            />
            Possui terceirização?
          </label>
          <Field label="Descrição">
            <input className={inputCls} value={valor.terceirizacaoArmazenagem?.descricao ?? ''} onChange={(e) => onChange({ ...valor, terceirizacaoArmazenagem: { ...(valor.terceirizacaoArmazenagem ?? { possui: false }), descricao: e.target.value } })} />
          </Field>
          <Field label="Capacidade (sacas)">
            <input type="number" className={inputCls} value={valor.terceirizacaoArmazenagem?.capacidadeSacas ?? ''} onChange={(e) => onChange({ ...valor, terceirizacaoArmazenagem: { ...(valor.terceirizacaoArmazenagem ?? { possui: false }), capacidadeSacas: e.target.value ? Number(e.target.value) : undefined } })} />
          </Field>
          <Field label="Valor por safra (R$)">
            <input type="number" step="0.01" className={inputCls} value={valor.terceirizacaoArmazenagem?.valorPorSafra ?? ''} onChange={(e) => onChange({ ...valor, terceirizacaoArmazenagem: { ...(valor.terceirizacaoArmazenagem ?? { possui: false }), valorPorSafra: e.target.value ? Number(e.target.value) : undefined } })} />
          </Field>
        </div>
      </div>

      {/* Fornecedores resumo */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-display font-semibold">Fornecedores (resumo)</h3>
          <button onClick={addFornecedor} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> adicionar
          </button>
        </div>
        {valor.fornecedores.map((f) => (
          <div key={f.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
            <Field label="Tipo">
              <select className={inputCls} value={f.tipoProduto} onChange={(e) => updFornecedor(f.id, { tipoProduto: e.target.value as FornecedorResumo['tipoProduto'] })}>
                <option value="fertilizantes">Fertilizantes</option>
                <option value="defensivos">Defensivos</option>
                <option value="sementes">Sementes</option>
                <option value="combustivel">Combustível</option>
                <option value="servicos">Serviços</option>
                <option value="outro">Outro</option>
              </select>
            </Field>
            <Field label="Fornecedores (ex: Yara, Heringer)">
              <input className={inputCls} value={f.fornecedores} onChange={(e) => updFornecedor(f.id, { fornecedores: e.target.value })} />
            </Field>
            <Field label="Prazo de pagamento">
              <input className={inputCls} value={f.prazoPagamento ?? ''} onChange={(e) => updFornecedor(f.id, { prazoPagamento: e.target.value })} />
            </Field>
            <div className="col-span-full flex justify-end">
              <button onClick={() => rmFornecedor(f.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> remover
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Field label="Volume produção em barter (sc)">
          <input type="number" className={inputCls} value={valor.barterComprometidoSacas ?? ''} onChange={(e) => onChange({ ...valor, barterComprometidoSacas: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Dívida atual c/ fornecedores (R$)">
          <input type="number" step="0.01" className={inputCls} value={valor.dividaFornecedoresAtual ?? ''} onChange={(e) => onChange({ ...valor, dividaFornecedoresAtual: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
      </div>
      <Field label="Observações">
        <textarea className={textareaCls} value={valor.observacoes ?? ''} onChange={(e) => onChange({ ...valor, observacoes: e.target.value })} />
      </Field>
    </>
  )
}

// ── 3. Produção ────────────────────────────────────────────

function ProducaoEditor({
  valor,
  onChange,
}: {
  valor: DossieAgro['producao']
  onChange: (v: DossieAgro['producao']) => void
}) {
  const addAgri = () => {
    const quadro: QuadroAgriculturaUF = {
      id: rid('agri'),
      uf: 'GO',
      cultura: 'soja_sequeiro',
      safras: [
        { safra: '23/24', tipo: 'anterior' },
        { safra: '24/25', tipo: 'atual' },
        { safra: '25/26', tipo: 'prevista' },
      ],
    }
    onChange({ ...valor, agricultura: [...valor.agricultura, quadro] })
  }
  const updAgri = (id: string, patch: Partial<QuadroAgriculturaUF>) =>
    onChange({ ...valor, agricultura: valor.agricultura.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
  const rmAgri = (id: string) =>
    onChange({ ...valor, agricultura: valor.agricultura.filter((a) => a.id !== id) })

  const addSafra = (quadroId: string) => {
    const novo: SafraAgricola = { safra: '', tipo: 'anterior' }
    const q = valor.agricultura.find((a) => a.id === quadroId)
    if (!q) return
    updAgri(quadroId, { safras: [...q.safras, novo] })
  }
  const updSafra = (quadroId: string, idx: number, patch: Partial<SafraAgricola>) => {
    const q = valor.agricultura.find((a) => a.id === quadroId)
    if (!q) return
    updAgri(quadroId, { safras: q.safras.map((s, i) => (i === idx ? { ...s, ...patch } : s)) })
  }
  const rmSafra = (quadroId: string, idx: number) => {
    const q = valor.agricultura.find((a) => a.id === quadroId)
    if (!q) return
    updAgri(quadroId, { safras: q.safras.filter((_, i) => i !== idx) })
  }

  const addPec = () => {
    const p: QuadroPecuariaUF = { id: rid('pec'), uf: 'GO', atividade: 'cria' }
    onChange({ ...valor, pecuaria: [...valor.pecuaria, p] })
  }
  const updPec = (id: string, patch: Partial<QuadroPecuariaUF>) =>
    onChange({ ...valor, pecuaria: valor.pecuaria.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const rmPec = (id: string) =>
    onChange({ ...valor, pecuaria: valor.pecuaria.filter((p) => p.id !== id) })

  return (
    <>
      <Field label="Data-base dos números">
        <input type="date" className={inputCls} value={valor.dataBase ?? ''} onChange={(e) => onChange({ ...valor, dataBase: e.target.value })} />
      </Field>

      {/* Agricultura */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-display font-semibold">Agricultura — quadros por UF × cultura</h3>
          <button onClick={addAgri} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> adicionar quadro
          </button>
        </div>
        {valor.agricultura.length === 0 && <p className="text-xs text-aletis-grafite-claro">Nenhum quadro cadastrado.</p>}
        {valor.agricultura.map((q) => (
          <div key={q.id} className="p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30 mb-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <Field label="UF">
                <select className={inputCls} value={q.uf} onChange={(e) => updAgri(q.id, { uf: e.target.value as UF })}>
                  {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Cultura">
                <select className={inputCls} value={q.cultura} onChange={(e) => updAgri(q.id, { cultura: e.target.value as CulturaAgricola })}>
                  {CULTURAS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
              </Field>
              {q.cultura === 'outra' && (
                <Field label="Descrição da cultura">
                  <input className={inputCls} value={q.outroDescricao ?? ''} onChange={(e) => updAgri(q.id, { outroDescricao: e.target.value })} />
                </Field>
              )}
              <Field label="Observações">
                <input className={inputCls} value={q.observacoes ?? ''} onChange={(e) => updAgri(q.id, { observacoes: e.target.value })} />
              </Field>
            </div>

            {/* Safras dentro do quadro */}
            <div className="mt-3">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-semibold text-aletis-grafite-escuro">Safras</h4>
                <button onClick={() => addSafra(q.id)} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
                  <Plus className="w-3 h-3" /> safra
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-aletis-grafite-claro">
                      <th className="text-left p-1">Safra</th>
                      <th className="text-left p-1">Tipo</th>
                      <th className="text-right p-1">Área (ha)</th>
                      <th className="text-right p-1">Própria</th>
                      <th className="text-right p-1">Arrendada</th>
                      <th className="text-right p-1">Rend. (sc/ha)</th>
                      <th className="text-right p-1">Produção (sc)</th>
                      <th className="text-right p-1">Preço (R$/sc)</th>
                      <th className="text-right p-1">Custo R$/ha</th>
                      <th className="text-right p-1">Receita (R$)</th>
                      <th className="text-right p-1">Custo total (R$)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {q.safras.map((s, i) => (
                      <tr key={i}>
                        <td><input className={inputCls} value={s.safra} onChange={(e) => updSafra(q.id, i, { safra: e.target.value })} /></td>
                        <td>
                          <select className={inputCls} value={s.tipo} onChange={(e) => updSafra(q.id, i, { tipo: e.target.value as SafraAgricola['tipo'] })}>
                            <option value="anterior">anterior</option>
                            <option value="atual">atual</option>
                            <option value="prevista">prevista</option>
                          </select>
                        </td>
                        <td><input type="number" className={inputCls} value={s.areaPlantadaHa ?? ''} onChange={(e) => updSafra(q.id, i, { areaPlantadaHa: e.target.value ? Number(e.target.value) : undefined })} /></td>
                        <td><input type="number" className={inputCls} value={s.areaPropriaHa ?? ''} onChange={(e) => updSafra(q.id, i, { areaPropriaHa: e.target.value ? Number(e.target.value) : undefined })} /></td>
                        <td><input type="number" className={inputCls} value={s.areaArrendadaHa ?? ''} onChange={(e) => updSafra(q.id, i, { areaArrendadaHa: e.target.value ? Number(e.target.value) : undefined })} /></td>
                        <td><input type="number" className={inputCls} value={s.rendimentoScHa ?? ''} onChange={(e) => updSafra(q.id, i, { rendimentoScHa: e.target.value ? Number(e.target.value) : undefined })} /></td>
                        <td><input type="number" className={inputCls} value={s.producaoTotalSc ?? ''} onChange={(e) => updSafra(q.id, i, { producaoTotalSc: e.target.value ? Number(e.target.value) : undefined })} /></td>
                        <td><input type="number" step="0.01" className={inputCls} value={s.precoMedio ?? ''} onChange={(e) => updSafra(q.id, i, { precoMedio: e.target.value ? Number(e.target.value) : undefined })} /></td>
                        <td><input type="number" step="0.01" className={inputCls} value={s.custoMedioPorHa ?? ''} onChange={(e) => updSafra(q.id, i, { custoMedioPorHa: e.target.value ? Number(e.target.value) : undefined })} /></td>
                        <td><input type="number" step="0.01" className={inputCls} value={s.receitaTotal ?? ''} onChange={(e) => updSafra(q.id, i, { receitaTotal: e.target.value ? Number(e.target.value) : undefined })} /></td>
                        <td><input type="number" step="0.01" className={inputCls} value={s.custoTotal ?? ''} onChange={(e) => updSafra(q.id, i, { custoTotal: e.target.value ? Number(e.target.value) : undefined })} /></td>
                        <td><button onClick={() => rmSafra(q.id, i)} className="text-red-600"><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end mt-2">
              <button onClick={() => rmAgri(q.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> remover quadro
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pecuária */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-display font-semibold">Pecuária</h3>
          <button onClick={addPec} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> adicionar
          </button>
        </div>
        {valor.pecuaria.map((p) => (
          <div key={p.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
            <Field label="UF">
              <select className={inputCls} value={p.uf} onChange={(e) => updPec(p.id, { uf: e.target.value as UF })}>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Atividade">
              <select className={inputCls} value={p.atividade} onChange={(e) => updPec(p.id, { atividade: e.target.value as AtividadePecuaria })}>
                {ATIV_PECUARIA.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
              </select>
            </Field>
            <Field label="Cabeças">
              <input type="number" className={inputCls} value={p.cabecas ?? ''} onChange={(e) => updPec(p.id, { cabecas: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Área pastagem (ha)">
              <input type="number" className={inputCls} value={p.areaPastagemHa ?? ''} onChange={(e) => updPec(p.id, { areaPastagemHa: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Lotação (UA/ha)">
              <input type="number" step="0.01" className={inputCls} value={p.lotacaoUaHa ?? ''} onChange={(e) => updPec(p.id, { lotacaoUaHa: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Produtividade leite (L/vaca)">
              <input type="number" step="0.01" className={inputCls} value={p.produtividadeLeite ?? ''} onChange={(e) => updPec(p.id, { produtividadeLeite: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Receita anual (R$)">
              <input type="number" step="0.01" className={inputCls} value={p.receitaAnual ?? ''} onChange={(e) => updPec(p.id, { receitaAnual: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Custo anual (R$)">
              <input type="number" step="0.01" className={inputCls} value={p.custoAnual ?? ''} onChange={(e) => updPec(p.id, { custoAnual: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Obs">
              <input className={inputCls} value={p.observacoes ?? ''} onChange={(e) => updPec(p.id, { observacoes: e.target.value })} />
            </Field>
            <div className="col-span-full flex justify-end">
              <button onClick={() => rmPec(p.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> remover
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── 4. Imóveis ─────────────────────────────────────────────

function ImoveisEditor({
  valor,
  onChange,
}: {
  valor: DossieAgro['imoveis']
  onChange: (v: DossieAgro['imoveis']) => void
}) {
  const addProp = () => {
    const p: ImovelRuralDossie = { id: rid('im'), fazenda: '', proprietario: '', municipio: '', uf: 'GO', areasTotaisHa: 0 }
    onChange({ ...valor, propriedades: [...valor.propriedades, p] })
  }
  const updProp = (id: string, patch: Partial<ImovelRuralDossie>) =>
    onChange({ ...valor, propriedades: valor.propriedades.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const rmProp = (id: string) =>
    onChange({ ...valor, propriedades: valor.propriedades.filter((p) => p.id !== id) })

  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-display font-semibold">Propriedades rurais</h3>
        <button onClick={addProp} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> adicionar
        </button>
      </div>
      {valor.propriedades.map((p) => (
        <div key={p.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
          <Field label="Fazenda">
            <input className={inputCls} value={p.fazenda} onChange={(e) => updProp(p.id, { fazenda: e.target.value })} />
          </Field>
          <Field label="Proprietário">
            <input className={inputCls} value={p.proprietario} onChange={(e) => updProp(p.id, { proprietario: e.target.value })} />
          </Field>
          <Field label="Matrícula">
            <input className={inputCls} value={p.matricula ?? ''} onChange={(e) => updProp(p.id, { matricula: e.target.value })} />
          </Field>
          <Field label="Município">
            <input className={inputCls} value={p.municipio} onChange={(e) => updProp(p.id, { municipio: e.target.value })} />
          </Field>
          <Field label="UF">
            <select className={inputCls} value={p.uf} onChange={(e) => updProp(p.id, { uf: e.target.value as UF })}>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Área total (ha)">
            <input type="number" step="0.01" className={inputCls} value={p.areasTotaisHa} onChange={(e) => updProp(p.id, { areasTotaisHa: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Plantio (ha)">
            <input type="number" step="0.01" className={inputCls} value={p.areasPlantioHa ?? ''} onChange={(e) => updProp(p.id, { areasPlantioHa: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
          <Field label="Irrigada (ha)">
            <input type="number" step="0.01" className={inputCls} value={p.areaIrrigadaHa ?? ''} onChange={(e) => updProp(p.id, { areaIrrigadaHa: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
          <Field label="Pastagem (ha)">
            <input type="number" step="0.01" className={inputCls} value={p.areaPastagemHa ?? ''} onChange={(e) => updProp(p.id, { areaPastagemHa: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
          <Field label="Reserva legal (ha)">
            <input type="number" step="0.01" className={inputCls} value={p.reservaLegalHa ?? ''} onChange={(e) => updProp(p.id, { reservaLegalHa: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
          <Field label="Valor mercado (R$)">
            <input type="number" step="0.01" className={inputCls} value={p.valorMercado ?? ''} onChange={(e) => updProp(p.id, { valorMercado: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
          <Field label="Livre de ônus (ha)">
            <input type="number" step="0.01" className={inputCls} value={p.areasLivresOnusHa ?? ''} onChange={(e) => updProp(p.id, { areasLivresOnusHa: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
          <Field label="Ônus (texto livre)">
            <input className={inputCls} value={p.onus ?? ''} onChange={(e) => updProp(p.id, { onus: e.target.value })} />
          </Field>
          <div className="col-span-full flex justify-end">
            <button onClick={() => rmProp(p.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> remover
            </button>
          </div>
        </div>
      ))}
      <Field label="Observações">
        <textarea className={textareaCls} value={valor.observacoes ?? ''} onChange={(e) => onChange({ ...valor, observacoes: e.target.value })} />
      </Field>
    </>
  )
}

// ── 5. Máquinas ────────────────────────────────────────────

function MaquinasEditor({
  valor,
  onChange,
}: {
  valor: DossieAgro['maquinas']
  onChange: (v: DossieAgro['maquinas']) => void
}) {
  const add = () => {
    const m: MaquinaAgricola = { id: rid('maq'), tipo: 'trator', descricao: '', quantidade: 1 }
    onChange({ ...valor, maquinas: [...valor.maquinas, m] })
  }
  const upd = (id: string, patch: Partial<MaquinaAgricola>) =>
    onChange({ ...valor, maquinas: valor.maquinas.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  const rm = (id: string) =>
    onChange({ ...valor, maquinas: valor.maquinas.filter((m) => m.id !== id) })

  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-display font-semibold">Frota agrícola</h3>
        <button onClick={add} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> adicionar
        </button>
      </div>
      {valor.maquinas.map((m) => (
        <div key={m.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
          <Field label="Tipo">
            <select className={inputCls} value={m.tipo} onChange={(e) => upd(m.id, { tipo: e.target.value as MaquinaAgricola['tipo'] })}>
              <option value="trator">Trator</option>
              <option value="colheitadeira">Colheitadeira</option>
              <option value="plantadeira">Plantadeira</option>
              <option value="pulverizador">Pulverizador</option>
              <option value="caminhao">Caminhão</option>
              <option value="implemento">Implemento</option>
              <option value="outro">Outro</option>
            </select>
          </Field>
          <Field label="Descrição"><input className={inputCls} value={m.descricao} onChange={(e) => upd(m.id, { descricao: e.target.value })} /></Field>
          <Field label="Marca"><input className={inputCls} value={m.marca ?? ''} onChange={(e) => upd(m.id, { marca: e.target.value })} /></Field>
          <Field label="Modelo"><input className={inputCls} value={m.modelo ?? ''} onChange={(e) => upd(m.id, { modelo: e.target.value })} /></Field>
          <Field label="Ano"><input type="number" className={inputCls} value={m.ano ?? ''} onChange={(e) => upd(m.id, { ano: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label="Qtd"><input type="number" className={inputCls} value={m.quantidade} onChange={(e) => upd(m.id, { quantidade: Number(e.target.value) || 1 })} /></Field>
          <Field label="Valor unitário (R$)"><input type="number" step="0.01" className={inputCls} value={m.valorMercadoUnitario ?? ''} onChange={(e) => upd(m.id, { valorMercadoUnitario: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label="Condição">
            <select className={inputCls} value={m.condicao ?? ''} onChange={(e) => upd(m.id, { condicao: (e.target.value || undefined) as MaquinaAgricola['condicao'] })}>
              <option value="">—</option>
              <option value="novo">Novo</option>
              <option value="bom">Bom</option>
              <option value="regular">Regular</option>
              <option value="ruim">Ruim</option>
            </select>
          </Field>
          <Field label="Dívida vinculada (ID)"><input className={inputCls} value={m.dividaId ?? ''} onChange={(e) => upd(m.id, { dividaId: e.target.value })} /></Field>
          <div className="col-span-full flex justify-end">
            <button onClick={() => rm(m.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> remover
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

// ── 6. Dívidas ─────────────────────────────────────────────

function DividasEditor({
  valor,
  onChange,
}: {
  valor: DossieAgro['dividas']
  onChange: (v: DossieAgro['dividas']) => void
}) {
  const addBanco = () => {
    const b: DividaBancaria = {
      id: rid('db'),
      instituicao: '',
      tomador: '',
      modalidade: 'capital_giro',
      moeda: 'BRL',
      saldoTotal: 0,
      amortizacoesPorAno: {},
    }
    onChange({ ...valor, bancarias: [...valor.bancarias, b] })
  }
  const updBanco = (id: string, patch: Partial<DividaBancaria>) =>
    onChange({ ...valor, bancarias: valor.bancarias.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const rmBanco = (id: string) => onChange({ ...valor, bancarias: valor.bancarias.filter((x) => x.id !== id) })

  const addForn = () => {
    const f: DividaFornecedor = { id: rid('df'), fornecedor: '' }
    onChange({ ...valor, fornecedores: [...valor.fornecedores, f] })
  }
  const updForn = (id: string, patch: Partial<DividaFornecedor>) =>
    onChange({ ...valor, fornecedores: valor.fornecedores.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const rmForn = (id: string) => onChange({ ...valor, fornecedores: valor.fornecedores.filter((x) => x.id !== id) })

  const addTerra = () => {
    const t: DividaTerra = { id: rid('dt'), fazenda: '', amortizacoesPorSafra: [] }
    onChange({ ...valor, terras: [...valor.terras, t] })
  }
  const updTerra = (id: string, patch: Partial<DividaTerra>) =>
    onChange({ ...valor, terras: valor.terras.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const rmTerra = (id: string) => onChange({ ...valor, terras: valor.terras.filter((x) => x.id !== id) })

  return (
    <>
      <Field label="Data-base da posição">
        <input type="date" className={inputCls} value={valor.dataBase ?? ''} onChange={(e) => onChange({ ...valor, dataBase: e.target.value })} />
      </Field>

      {/* Bancárias */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-display font-semibold">Dívidas bancárias</h3>
          <button onClick={addBanco} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> adicionar
          </button>
        </div>
        {valor.bancarias.map((b) => (
          <div key={b.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
            <Field label="Instituição"><input className={inputCls} value={b.instituicao} onChange={(e) => updBanco(b.id, { instituicao: e.target.value })} /></Field>
            <Field label="Tomador"><input className={inputCls} value={b.tomador} onChange={(e) => updBanco(b.id, { tomador: e.target.value })} /></Field>
            <Field label="Contrato"><input className={inputCls} value={b.numeroContrato ?? ''} onChange={(e) => updBanco(b.id, { numeroContrato: e.target.value })} /></Field>
            <Field label="Modalidade">
              <select className={inputCls} value={b.modalidade} onChange={(e) => updBanco(b.id, { modalidade: e.target.value as ModalidadeCreditoDossie })}>
                {MODALIDADES_CREDITO.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Moeda">
              <select className={inputCls} value={b.moeda} onChange={(e) => updBanco(b.id, { moeda: e.target.value as Moeda })}>
                {MOEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Finalidade"><input className={inputCls} value={b.finalidade ?? ''} onChange={(e) => updBanco(b.id, { finalidade: e.target.value })} /></Field>
            <Field label="Data contratação">
              <input type="date" className={inputCls} value={b.dataContratacao ?? ''} onChange={(e) => updBanco(b.id, { dataContratacao: e.target.value })} />
            </Field>
            <Field label="Vencimento">
              <input type="date" className={inputCls} value={b.dataVencimento ?? ''} onChange={(e) => updBanco(b.id, { dataVencimento: e.target.value })} />
            </Field>
            <Field label="Taxa juros a.a. (fração)" hint="Ex: 0.0149 = 1,49% a.a.">
              <input type="number" step="0.0001" className={inputCls} value={b.taxaJuros ?? ''} onChange={(e) => updBanco(b.id, { taxaJuros: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Saldo total (R$)">
              <input type="number" step="0.01" className={inputCls} value={b.saldoTotal} onChange={(e) => updBanco(b.id, { saldoTotal: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Amortização por ano (JSON)" hint='Ex: {"2025": 160678.38, "2026": 160678.38}'>
              <textarea
                className={textareaCls + ' text-[11px] font-mono'}
                value={JSON.stringify(b.amortizacoesPorAno, null, 0)}
                onChange={(e) => {
                  try {
                    const obj = JSON.parse(e.target.value)
                    if (obj && typeof obj === 'object') updBanco(b.id, { amortizacoesPorAno: obj })
                  } catch {
                    // ignora JSON inválido enquanto digita
                  }
                }}
              />
            </Field>
            <Field label="Status">
              <select className={inputCls} value={b.status ?? ''} onChange={(e) => updBanco(b.id, { status: (e.target.value || undefined) as DividaBancaria['status'] })}>
                <option value="">—</option>
                <option value="ativa">Ativa</option>
                <option value="em_atraso">Em atraso</option>
                <option value="em_negociacao">Em negociação</option>
                <option value="renegociada">Renegociada</option>
                <option value="quitada">Quitada</option>
              </select>
            </Field>
            <Field label="Garantias"><input className={inputCls} value={b.garantias ?? ''} onChange={(e) => updBanco(b.id, { garantias: e.target.value })} /></Field>
            <Field label="Observações"><input className={inputCls} value={b.observacoes ?? ''} onChange={(e) => updBanco(b.id, { observacoes: e.target.value })} /></Field>
            <div className="col-span-full flex justify-end">
              <button onClick={() => rmBanco(b.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> remover
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Fornecedores */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-display font-semibold">Dívidas com fornecedores / barter</h3>
          <button onClick={addForn} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> adicionar
          </button>
        </div>
        {valor.fornecedores.map((f) => (
          <div key={f.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
            <Field label="Fornecedor"><input className={inputCls} value={f.fornecedor} onChange={(e) => updForn(f.id, { fornecedor: e.target.value })} /></Field>
            <Field label="Valor (R$)"><input type="number" step="0.01" className={inputCls} value={f.valorBRL ?? ''} onChange={(e) => updForn(f.id, { valorBRL: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            <Field label="Volume soja (sc)"><input type="number" className={inputCls} value={f.volumeSojaSacas ?? ''} onChange={(e) => updForn(f.id, { volumeSojaSacas: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            <Field label="Volume milho (sc)"><input type="number" className={inputCls} value={f.volumeMilhoSacas ?? ''} onChange={(e) => updForn(f.id, { volumeMilhoSacas: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            <Field label="Data pagto"><input type="date" className={inputCls} value={f.dataPagamento ?? ''} onChange={(e) => updForn(f.id, { dataPagamento: e.target.value })} /></Field>
            <Field label="Observações"><input className={inputCls} value={f.observacoes ?? ''} onChange={(e) => updForn(f.id, { observacoes: e.target.value })} /></Field>
            <div className="col-span-full flex justify-end">
              <button onClick={() => rmForn(f.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> remover
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Terras */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-display font-semibold">Dívidas com terras</h3>
          <button onClick={addTerra} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> adicionar
          </button>
        </div>
        {valor.terras.map((t) => (
          <div key={t.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
            <Field label="Fazenda"><input className={inputCls} value={t.fazenda} onChange={(e) => updTerra(t.id, { fazenda: e.target.value })} /></Field>
            <Field label="Área (ha)"><input type="number" className={inputCls} value={t.areaHa ?? ''} onChange={(e) => updTerra(t.id, { areaHa: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            <Field label="Data aquisição"><input type="date" className={inputCls} value={t.dataAquisicao ?? ''} onChange={(e) => updTerra(t.id, { dataAquisicao: e.target.value })} /></Field>
            <Field label="Valor aquisição (R$)"><input type="number" step="0.01" className={inputCls} value={t.valorAquisicao ?? ''} onChange={(e) => updTerra(t.id, { valorAquisicao: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            <Field label="Total a vencer (R$)"><input type="number" step="0.01" className={inputCls} value={t.totalVencer ?? ''} onChange={(e) => updTerra(t.id, { totalVencer: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            <Field label="Amortizações por safra (JSON)" hint='Ex: [{"safra":"25/26","valor":500000}]'>
              <textarea
                className={textareaCls + ' text-[11px] font-mono'}
                value={JSON.stringify(t.amortizacoesPorSafra)}
                onChange={(e) => {
                  try {
                    const arr = JSON.parse(e.target.value)
                    if (Array.isArray(arr)) updTerra(t.id, { amortizacoesPorSafra: arr })
                  } catch {
                    // ignora
                  }
                }}
              />
            </Field>
            <Field label="Observações"><input className={inputCls} value={t.observacoes ?? ''} onChange={(e) => updTerra(t.id, { observacoes: e.target.value })} /></Field>
            <div className="col-span-full flex justify-end">
              <button onClick={() => rmTerra(t.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> remover
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── 7. Capital de Giro ─────────────────────────────────────

function CapitalGiroEditor({
  valor,
  onChange,
}: {
  valor: DossieAgro['capitalGiro']
  onChange: (v: DossieAgro['capitalGiro']) => void
}) {
  const numField = (key: keyof DossieAgro['capitalGiro'], label: string) => (
    <Field label={label}>
      <input
        type="number"
        step="0.01"
        className={inputCls}
        value={(valor[key] as number | undefined) ?? ''}
        onChange={(e) => onChange({ ...valor, [key]: e.target.value ? Number(e.target.value) : undefined })}
      />
    </Field>
  )
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {numField('recebiveis', 'Recebíveis (R$)')}
      {numField('estoques', 'Estoques (R$)')}
      {numField('disponibilidades', 'Disponibilidades (R$)')}
      {numField('adiantamentosFornecedores', 'Adiantamentos a fornecedores (R$)')}
      {numField('adiantamentosClientes', 'Adiantamentos de clientes (R$)')}
      {numField('ncg', 'NCG estimada (R$)')}
      <Field label="Observações">
        <textarea className={textareaCls} value={valor.observacoes ?? ''} onChange={(e) => onChange({ ...valor, observacoes: e.target.value })} />
      </Field>
    </div>
  )
}

// ── 8. Relacionamento Bancário ─────────────────────────────

function RelacionamentoBancarioEditor({
  valor,
  onChange,
}: {
  valor: DossieAgro['relacionamentoBancario']
  onChange: (v: DossieAgro['relacionamentoBancario']) => void
}) {
  const add = () => {
    const c: ContaBancaria = { id: rid('cb'), banco: '' }
    onChange({ ...valor, contas: [...valor.contas, c] })
  }
  const upd = (id: string, patch: Partial<ContaBancaria>) =>
    onChange({ ...valor, contas: valor.contas.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const rm = (id: string) => onChange({ ...valor, contas: valor.contas.filter((c) => c.id !== id) })

  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-display font-semibold">Contas bancárias</h3>
        <button onClick={add} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> adicionar
        </button>
      </div>
      {valor.contas.map((c) => (
        <div key={c.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
          <Field label="Banco"><input className={inputCls} value={c.banco} onChange={(e) => upd(c.id, { banco: e.target.value })} /></Field>
          <Field label="Agência"><input className={inputCls} value={c.agencia ?? ''} onChange={(e) => upd(c.id, { agencia: e.target.value })} /></Field>
          <Field label="Conta"><input className={inputCls} value={c.conta ?? ''} onChange={(e) => upd(c.id, { conta: e.target.value })} /></Field>
          <Field label="Tipo">
            <select className={inputCls} value={c.tipo ?? ''} onChange={(e) => upd(c.id, { tipo: (e.target.value || undefined) as ContaBancaria['tipo'] })}>
              <option value="">—</option>
              <option value="corrente">Corrente</option>
              <option value="poupanca">Poupança</option>
              <option value="investimento">Investimento</option>
              <option value="outro">Outro</option>
            </select>
          </Field>
          <Field label="Titular"><input className={inputCls} value={c.titular ?? ''} onChange={(e) => upd(c.id, { titular: e.target.value })} /></Field>
          <Field label="Observações"><input className={inputCls} value={c.observacoes ?? ''} onChange={(e) => upd(c.id, { observacoes: e.target.value })} /></Field>
          <div className="col-span-full flex justify-end">
            <button onClick={() => rm(c.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> remover
            </button>
          </div>
        </div>
      ))}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Field label="Limite cheque-especial (R$)">
          <input type="number" step="0.01" className={inputCls} value={valor.limiteChequeEspecial ?? ''} onChange={(e) => onChange({ ...valor, limiteChequeEspecial: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Limites outras linhas (R$)">
          <input type="number" step="0.01" className={inputCls} value={valor.limitesOutrasLinhas ?? ''} onChange={(e) => onChange({ ...valor, limitesOutrasLinhas: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
      </div>
      <Field label="Observações">
        <textarea className={textareaCls} value={valor.observacoes ?? ''} onChange={(e) => onChange({ ...valor, observacoes: e.target.value })} />
      </Field>
    </>
  )
}

// ── 9. Comerciais ──────────────────────────────────────────

function ComerciaisEditor({
  valor,
  onChange,
}: {
  valor: DossieAgro['comerciais']
  onChange: (v: DossieAgro['comerciais']) => void
}) {
  const add = () => {
    const r: RelacaoComercial = { id: rid('rc'), tipo: 'trading', razaoSocial: '' }
    onChange({ ...valor, relacoes: [...valor.relacoes, r] })
  }
  const upd = (id: string, patch: Partial<RelacaoComercial>) =>
    onChange({ ...valor, relacoes: valor.relacoes.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  const rm = (id: string) => onChange({ ...valor, relacoes: valor.relacoes.filter((r) => r.id !== id) })

  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-display font-semibold">Relações comerciais</h3>
        <button onClick={add} className="btn-outline text-xs px-2 py-1 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> adicionar
        </button>
      </div>
      {valor.relacoes.map((r) => (
        <div key={r.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 p-3 rounded border border-aletis-borda/50 bg-aletis-bg-suave/30">
          <Field label="Tipo">
            <select className={inputCls} value={r.tipo} onChange={(e) => upd(r.id, { tipo: e.target.value as RelacaoComercial['tipo'] })}>
              <option value="trading">Trading</option>
              <option value="cooperativa">Cooperativa</option>
              <option value="frigorifico">Frigorífico</option>
              <option value="lacticinio">Laticínio</option>
              <option value="industria">Indústria</option>
              <option value="distribuidor">Distribuidor</option>
              <option value="outro">Outro</option>
            </select>
          </Field>
          <Field label="Razão social"><input className={inputCls} value={r.razaoSocial} onChange={(e) => upd(r.id, { razaoSocial: e.target.value })} /></Field>
          <Field label="CNPJ"><input className={inputCls} value={r.cnpj ?? ''} onChange={(e) => upd(r.id, { cnpj: e.target.value.replace(/\D/g, '') })} maxLength={14} /></Field>
          <Field label="Produtos"><input className={inputCls} value={r.produtos ?? ''} onChange={(e) => upd(r.id, { produtos: e.target.value })} /></Field>
          <Field label="Volume médio"><input type="number" className={inputCls} value={r.volumeMedio ?? ''} onChange={(e) => upd(r.id, { volumeMedio: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label="Unidade">
            <select className={inputCls} value={r.unidadeVolume ?? ''} onChange={(e) => upd(r.id, { unidadeVolume: (e.target.value || undefined) as RelacaoComercial['unidadeVolume'] })}>
              <option value="">—</option>
              <option value="sc">Sacas</option>
              <option value="arroba">Arrobas</option>
              <option value="ton">Toneladas</option>
              <option value="outro">Outra</option>
            </select>
          </Field>
          <Field label="Desde"><input className={inputCls} value={r.desde ?? ''} onChange={(e) => upd(r.id, { desde: e.target.value })} /></Field>
          <Field label="Obs"><input className={inputCls} value={r.observacoes ?? ''} onChange={(e) => upd(r.id, { observacoes: e.target.value })} /></Field>
          <div className="col-span-full flex justify-end">
            <button onClick={() => rm(r.id)} className="text-xs text-red-600 inline-flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> remover
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

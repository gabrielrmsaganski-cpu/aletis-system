// ============================================================
// WizardOnboarding — fluxo guiado em 4 passos para criar grupo
// 1. Fonte de dados (CRM/Dossiê/Template/Vazio)
// 2. Cabeçalho (nome do grupo, data base, histórico)
// 3. Conteúdo (template ou paste do Excel ou skip)
// 4. Confirmação (preview + criar)
// ============================================================
import { useState, useEffect, lazy, Suspense } from 'react'
import { apiFetch } from '../../hooks/useApi'
import {
  X, ChevronRight, ChevronLeft, Sparkles, Check, Loader2,
  Database, FileText, Wand2, FileSpreadsheet, Plus,
} from 'lucide-react'

const BulkPasteEditor = lazy(() => import('./BulkPasteEditor'))

interface Props {
  clienteId: string
  clienteNome?: string
  onClose: () => void
  onSuccess: (grupoId: string) => void
}

type Fonte = 'crm' | 'template' | 'paste' | 'vazio'

interface DadosCabecalho {
  nomeGrupo: string
  dataBase: string
  historico: string
  observacoes: string
}

const TEMPLATES = [
  { id: 'soja-mt', rotulo: '🌾 Soja/Milho — Mato Grosso', desc: '3000ha+2400ha+600ha · 8 custos · 3 contratos' },
  { id: 'cafe-mg', rotulo: '☕ Café — Sul de Minas', desc: '280ha arábica + 80ha conilon · 6 custos · 2 contratos' },
  { id: 'boi-go', rotulo: '🐂 Pecuária — Goiás', desc: '1800ha pasto + confinamento · 7 custos · 2 contratos' },
  { id: 'cana-sp', rotulo: '🌱 Cana — São Paulo', desc: '2000ha (1ª colheita+soca) · 5 custos · 2 contratos' },
]

export default function WizardOnboarding({ clienteId, clienteNome, onClose, onSuccess }: Props) {
  const [step, setStep] = useState(1)
  const [fonte, setFonte] = useState<Fonte | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [cabecalho, setCabecalho] = useState<DadosCabecalho>({
    nomeGrupo: clienteNome ?? '',
    dataBase: new Date().toISOString().slice(0, 10),
    historico: '',
    observacoes: '',
  })
  const [pastedRows, setPastedRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [grupoIdCriado, setGrupoIdCriado] = useState<string | null>(null)

  function next() { if (step < 4) setStep(step + 1) }
  function prev() { if (step > 1) setStep(step - 1) }

  function fontePodeAvancar(): boolean { return fonte !== null }
  function cabecalhoValido(): boolean { return cabecalho.nomeGrupo.trim().length >= 2 && !!cabecalho.dataBase }

  async function executar() {
    setLoading(true)
    setError(null)
    try {
      let grupoId: string

      if (fonte === 'crm') {
        // Auto-import do CRM já cria + popula
        const r = await apiFetch<{ grupo: any; estatisticas: any }>(
          '/gestao-financeira/auto-import-crm',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId }) },
        )
        grupoId = r.grupo.id
        // Atualiza cabeçalho se diferente
        if (
          cabecalho.nomeGrupo !== r.grupo.nomeGrupo ||
          cabecalho.dataBase !== String(r.grupo.dataBase).slice(0, 10) ||
          cabecalho.historico ||
          cabecalho.observacoes
        ) {
          await apiFetch(`/gestao-financeira/grupos/${grupoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nomeGrupo: cabecalho.nomeGrupo,
              dataBase: cabecalho.dataBase,
              historico: cabecalho.historico || undefined,
              observacoes: cabecalho.observacoes || undefined,
            }),
          })
        }
      } else {
        // Cria vazio com cabeçalho
        const r = await apiFetch<{ grupo: any }>('/gestao-financeira/grupos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clienteId,
            nomeGrupo: cabecalho.nomeGrupo,
            dataBase: cabecalho.dataBase,
            historico: cabecalho.historico || undefined,
            observacoes: cabecalho.observacoes || undefined,
          }),
        })
        grupoId = r.grupo.id

        // Aplicar template se selecionado
        if (fonte === 'template' && templateId) {
          await apiFetch(`/gestao-financeira/grupos/${grupoId}/aplicar-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: templateId }),
          })
        }
        // Aplicar paste se houver
        if (fonte === 'paste' && pastedRows.length > 0) {
          await apiFetch(`/gestao-financeira/grupos/${grupoId}/culturas/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: pastedRows }),
          })
        }
      }

      setGrupoIdCriado(grupoId)
      // Navegar para conclusão
      setStep(5)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-foreground" />
            <div>
              <p className="text-[11px] font-mono text-foreground uppercase font-semibold">Wizard Onboarding</p>
              <h2 className="text-base font-display font-semibold text-foreground">
                Criar grupo de Gestão Financeira
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </header>

        {/* Steps progress */}
        <div className="px-5 py-3 border-b border-aletis-grafite-claro/10 bg-aletis-cream/20">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex items-center flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    step > n ? 'bg-aletis-verde text-white' : step === n ? 'bg-aletis-verde text-white ring-4 ring-aletis-verde/20' : 'bg-aletis-grafite-claro/20 text-muted-foreground'
                  }`}
                >
                  {step > n ? <Check className="w-3.5 h-3.5" /> : n}
                </div>
                {n < 4 && <div className={`flex-1 h-0.5 mx-1 ${step > n ? 'bg-aletis-verde' : 'bg-aletis-grafite-claro/20'}`} />}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[11px] mt-1.5 font-body">
            <span className={step === 1 ? 'text-foreground font-semibold' : 'text-muted-foreground'}>1. Fonte</span>
            <span className={step === 2 ? 'text-foreground font-semibold' : 'text-muted-foreground'}>2. Cabeçalho</span>
            <span className={step === 3 ? 'text-foreground font-semibold' : 'text-muted-foreground'}>3. Conteúdo</span>
            <span className={step === 4 ? 'text-foreground font-semibold' : 'text-muted-foreground'}>4. Confirmar</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 mb-3">{error}</div>}

          {step === 1 && (
            <div className="space-y-3">
              <h3 className="text-sm font-display font-semibold text-foreground">Como deseja iniciar o grupo?</h3>
              <p className="text-xs text-muted-foreground">Escolha a fonte de dados — cada opção acelera o cadastro de forma diferente.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                <FonteCard
                  active={fonte === 'crm'}
                  onClick={() => setFonte('crm')}
                  icon={<Database className="w-5 h-5" />}
                  titulo="⚡ Auto-importar do CRM"
                  desc="Puxa cliente, dívidas, culturas, área e cidade automaticamente. ~5 min de setup."
                  badge="MAIS RÁPIDO"
                />
                <FonteCard
                  active={fonte === 'template'}
                  onClick={() => setFonte('template')}
                  icon={<Wand2 className="w-5 h-5" />}
                  titulo="🎯 Template agro típico"
                  desc="Soja-MT, Café-MG, Pecuária-GO ou Cana-SP. Cria estrutura realista para customizar."
                />
                <FonteCard
                  active={fonte === 'paste'}
                  onClick={() => setFonte('paste')}
                  icon={<FileSpreadsheet className="w-5 h-5" />}
                  titulo="📋 Paste do Excel"
                  desc="Cole tabela de safras direto do Excel/Sheets — TSV/CSV. Sistema parseia automaticamente."
                />
                <FonteCard
                  active={fonte === 'vazio'}
                  onClick={() => setFonte('vazio')}
                  icon={<Plus className="w-5 h-5" />}
                  titulo="➕ Começar do zero"
                  desc="Apenas cabeçalho. Adicione manualmente nas sub-tabs depois."
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h3 className="text-sm font-display font-semibold text-foreground">Identificação do grupo</h3>
              <p className="text-xs text-muted-foreground">Defina nome, data base e contexto.</p>
              <div className="space-y-3 mt-3">
                <Field label="Nome do grupo" required>
                  <input
                    value={cabecalho.nomeGrupo}
                    onChange={(e) => setCabecalho({ ...cabecalho, nomeGrupo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-sm"
                    placeholder="Grupo Familiar X"
                  />
                </Field>
                <Field label="Data base" required>
                  <input
                    type="date"
                    value={cabecalho.dataBase}
                    onChange={(e) => setCabecalho({ ...cabecalho, dataBase: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-sm"
                  />
                </Field>
                <Field label="Histórico (opcional)">
                  <textarea
                    value={cabecalho.historico}
                    onChange={(e) => setCabecalho({ ...cabecalho, historico: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-sm resize-y"
                    placeholder="Histórico do grupo familiar / atividade rural"
                  />
                </Field>
                <Field label="Observações (opcional)">
                  <textarea
                    value={cabecalho.observacoes}
                    onChange={(e) => setCabecalho({ ...cabecalho, observacoes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-sm resize-y"
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-sm font-display font-semibold text-foreground">Conteúdo inicial</h3>
              {fonte === 'crm' && (
                <div className="rounded-lg bg-aletis-verde/10 border border-aletis-verde/30 p-3 text-xs text-foreground">
                  ⚡ Auto-import do CRM vai puxar automaticamente: 1 membro principal · todas as culturas declaradas · 1 contrato semente (se houver dívida) · 1 fazenda placeholder · 4 premissas (Selic/IPCA/taxas).
                </div>
              )}
              {fonte === 'template' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Selecione o perfil agro mais próximo do cliente:</p>
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                        templateId === t.id ? 'border-aletis-verde bg-aletis-verde/5' : 'border-aletis-grafite-claro/15 hover:border-aletis-verde/40'
                      }`}
                    >
                      <p className="text-sm font-display font-semibold">{t.rotulo}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              )}
              {fonte === 'paste' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Cole as safras do Excel (cultura, safra, cenário, área própria, área arrendada, rendimento, preço, custo, arrend. base):</p>
                  <button
                    type="button"
                    onClick={() => setShowPaste(true)}
                    className="w-full p-4 rounded-lg border-2 border-dashed border-aletis-grafite-claro/30 hover:border-aletis-verde transition-colors"
                  >
                    <FileSpreadsheet className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                    <p className="text-xs font-body font-semibold">Clique para abrir paste editor</p>
                    {pastedRows.length > 0 && (
                      <p className="text-[11px] text-foreground mt-1">✓ {pastedRows.length} linhas prontas</p>
                    )}
                  </button>
                </div>
              )}
              {fonte === 'vazio' && (
                <div className="rounded-lg bg-aletis-cream/30 border border-aletis-grafite-claro/15 p-3 text-xs text-muted-foreground">
                  Grupo será criado vazio. Você adicionará culturas, contratos e custos manualmente nas sub-tabs depois.
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h3 className="text-sm font-display font-semibold text-foreground">Confirmação</h3>
              <div className="space-y-2 rounded-lg bg-aletis-cream/30 p-4 border border-aletis-grafite-claro/15">
                <ConfirmRow label="Cliente" value={clienteNome ?? clienteId} />
                <ConfirmRow label="Nome do grupo" value={cabecalho.nomeGrupo} />
                <ConfirmRow label="Data base" value={cabecalho.dataBase} />
                <ConfirmRow label="Fonte de dados" value={
                  fonte === 'crm' ? '⚡ Auto-import do CRM'
                  : fonte === 'template' ? `🎯 Template ${TEMPLATES.find((t) => t.id === templateId)?.rotulo}`
                  : fonte === 'paste' ? `📋 Paste com ${pastedRows.length} linhas`
                  : '➕ Começar do zero'
                } />
                {cabecalho.historico && <ConfirmRow label="Histórico" value={cabecalho.historico.slice(0, 80) + (cabecalho.historico.length > 80 ? '…' : '')} />}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Ao clicar em <strong>Criar grupo</strong>, o sistema executa todas as ações acima e você é levado direto ao Dashboard 360°.
              </div>
            </div>
          )}

          {step === 5 && grupoIdCriado && (
            <div className="text-center py-8 space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-aletis-verde flex items-center justify-center">
                <Check className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-display font-semibold">Grupo criado!</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                <strong>{cabecalho.nomeGrupo}</strong> está pronto. Você será levado ao Dashboard 360° onde os cálculos rodam em tempo real.
              </p>
              <button
                type="button"
                onClick={() => onSuccess(grupoIdCriado)}
                className="px-5 py-2 rounded-lg bg-aletis-verde text-white text-sm font-body font-semibold hover:bg-aletis-verde-escuro"
              >
                Abrir Dashboard 360° →
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step < 5 && (
          <footer className="px-5 py-3 border-t border-aletis-grafite-claro/15 bg-aletis-cream/10 flex items-center justify-between">
            <button
              type="button"
              onClick={prev}
              disabled={step === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-body inline-flex items-center gap-1 disabled:opacity-40 hover:bg-aletis-grafite-escuro/5"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Voltar
            </button>
            <span className="text-[11px] text-muted-foreground">passo {step} de 4</span>
            {step < 4 ? (
              <button
                type="button"
                onClick={next}
                disabled={(step === 1 && !fontePodeAvancar()) || (step === 2 && !cabecalhoValido())}
                className="px-4 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-body font-semibold hover:bg-aletis-verde-escuro inline-flex items-center gap-1 disabled:opacity-40"
              >
                Próximo <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={executar}
                disabled={loading}
                className="px-5 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-body font-semibold hover:bg-aletis-verde-escuro inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Criar grupo
              </button>
            )}
          </footer>
        )}

        {showPaste && (
          <Suspense fallback={null}>
            <BulkPasteEditor
              title="Paste de safras"
              endpoint=""
              columns={[
                { key: 'cultura', label: 'Cultura', type: 'text', required: true },
                { key: 'safra', label: 'Safra', type: 'text', required: true },
                { key: 'cenario', label: 'Cenário', type: 'text', default: 'planejado' },
                { key: 'areaPropriaHa', label: 'Área Própria', type: 'number' },
                { key: 'areaArrendadaHa', label: 'Área Arrend.', type: 'number' },
                { key: 'rendimentoScHa', label: 'Rend.', type: 'number' },
                { key: 'precoMedioRs', label: 'Preço', type: 'number' },
                { key: 'custoUnitarioInsumosRs', label: 'Custo', type: 'number' },
              ]}
              onClose={() => setShowPaste(false)}
              onSuccess={() => setShowPaste(false)}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}

function FonteCard({ active, onClick, icon, titulo, desc, badge }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; titulo: string; desc: string; badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-xl border-2 transition-all relative ${
        active
          ? 'border-aletis-verde bg-aletis-verde/5 shadow-md'
          : 'border-aletis-grafite-claro/15 hover:border-aletis-verde/40 hover:shadow-sm'
      }`}
    >
      {badge && (
        <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[11px] font-mono font-bold bg-aletis-dourado text-foreground rounded">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-foreground">{icon}</span>
        <span className="text-sm font-display font-semibold text-foreground">{titulo}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
    </button>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}{required && <span className="text-red-600">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] text-muted-foreground min-w-[120px]">{label}:</span>
      <span className="text-xs font-body text-foreground font-medium">{value}</span>
    </div>
  )
}

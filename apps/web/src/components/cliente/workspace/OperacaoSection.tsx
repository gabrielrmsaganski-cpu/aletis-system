// ============================================================
// OperacaoSection — Gestão Financeira ALETIS dentro do cliente.
// ============================================================
import { lazy, Suspense } from 'react'
import { Calculator, Database, FileText, Pencil, Plus, ShieldCheck } from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'

const GestaoFinanceiraTab = lazy(() => import('../../gestao-financeira/GestaoFinanceiraTab'))

interface Props {
  data: UseClienteDataReturn
  onEditFinancial: () => void
}

export default function OperacaoSection({ data, onEditFinancial }: Props) {
  const { cliente, apiId } = data
  if (!cliente || !apiId) {
    return (
      <div className="rounded-lg border border-aletis-borda bg-card p-8 text-center shadow-none">
        <p className="text-xs text-muted-foreground">Cliente não identificado.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <header className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-aletis-borda bg-aletis-bege/45 text-foreground">
            <Database className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-mono text-foreground uppercase font-semibold tracking-[0.18em]">
              financeiro do cliente
            </p>
            <h2 className="mt-1 text-lg font-display font-semibold text-foreground">
              Gestão Financeira ALETIS
            </h2>
            <p className="mt-1 max-w-4xl text-xs font-body leading-relaxed text-[var(--text-soft)]">
              Cadastre a estrutura econômica do cliente, safras, custos, dívidas, garantias, premissas e demandas.
              As saídas de diagnóstico, banco e auditoria ficam no próprio módulo.
            </p>
          </div>
          <button type="button" onClick={onEditFinancial} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-aletis-verde px-4 text-sm font-semibold text-white hover:bg-aletis-verde-escuro"><Pencil className="h-4 w-4" /> Editar contratos e pagamentos</button>
        </div>
        <details className="mt-4 border-t border-aletis-borda pt-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Como usar a gestão financeira</summary><div className="mt-3 grid gap-2 md:grid-cols-3">
          <Signal icon={Calculator} label="Análise" value="Raio X, DRE/FCL, EBITDA, LTV, dívida/EBITDA, safra e cenários" />
          <Signal icon={ShieldCheck} label="Governança" value="Dados por cliente, trilha de auditoria, comentários e snapshots" />
          <Signal icon={FileText} label="Saídas" value="Kit Banco PDF, diagnóstico em apresentação e exportação Excel quando necessário" />
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-aletis-verde/20 bg-aletis-verde/5 px-3 py-2 text-xs text-[var(--text-soft)]"><Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" /><p><strong className="text-foreground">Todos os blocos abaixo são editáveis.</strong> Abra uma área, adicione linhas e altere diretamente cadastro, propriedades, safras, custos, dívidas, passivos, garantias, demandas e premissas.</p></div>
        </details>
      </header>

      <Suspense fallback={<EditorSkeleton />}>
        <GestaoFinanceiraTab
          clienteId={apiId}
          clienteNome={cliente.nome}
          compact
          initialSubTab="endividamento"
        />
      </Suspense>
    </div>
  )
}

function Signal({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-aletis-borda bg-aletis-bege/25 px-3 py-2">
      <div className="flex items-center gap-2 text-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-mono uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-[var(--text-soft)]">{value}</p>
    </div>
  )
}

function EditorSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-12 rounded-xl bg-gray-100 animate-pulse" />
      <div className="h-96 rounded-xl bg-gray-100 animate-pulse" />
    </div>
  )
}

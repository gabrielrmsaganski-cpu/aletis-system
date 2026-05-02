// ============================================================
// OperacaoSection — matriz de dados estruturados (R.OP.001 v2.0).
// Embeda GestaoFinanceiraTab em modo compact, ocultando sub-tabs
// que pertencem a outras áreas do workspace (dashboard/insights →
// Diagnóstico, comentários/changelog → Workflow).
// ============================================================
import { lazy, Suspense } from 'react'
import { Database, Sparkles } from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'

const GestaoFinanceiraTab = lazy(() => import('../../gestao-financeira/GestaoFinanceiraTab'))

interface Props {
  data: UseClienteDataReturn
}

export default function OperacaoSection({ data }: Props) {
  const { cliente, apiId } = data
  if (!cliente || !apiId) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-xs text-aletis-grafite-claro">Cliente não identificado.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <header className="card-premium p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center flex-shrink-0">
          <Database className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-amber-700 uppercase font-semibold tracking-wider">
            🗂️ matriz de dados estruturados
          </p>
          <h2 className="text-base font-display font-bold text-aletis-grafite-escuro">
            Operação — R.OP.001 v2.0
          </h2>
          <p className="text-xs font-body text-aletis-grafite-medio mt-0.5">
            Cadastro · Safras · Custos · Endividamento · Passivos · Garantias · Demandas · Fazendas · Premissas.
            Todas as fórmulas da planilha (28 sheets, 12k cálculos) reimplementadas nativamente.
          </p>
        </div>
        <div className="hidden md:block flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-aletis-verde/10 text-aletis-verde text-[10px] font-bold">
            <Sparkles className="w-3 h-3" /> Sistema nativo
          </span>
        </div>
      </header>

      <Suspense fallback={<EditorSkeleton />}>
        <GestaoFinanceiraTab
          clienteId={apiId}
          clienteNome={cliente.nome}
          compact
          initialSubTab="cadastro"
          hideSubTabs={['dashboard', 'workflow', 'benchmark', 'comentarios', 'changelog', 'insights']}
        />
      </Suspense>
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

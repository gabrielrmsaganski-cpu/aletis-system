// ============================================================
// CarteiraConsultor — visão consolidada multi-grupo do consultor.
// Wrapper de rota para o componente CarteiraPanel; ao clicar em um
// grupo, navega para /clientes/:clienteId?tab=gestao-financeira&grupoId=X
// ============================================================
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Suspense, lazy } from 'react'

const CarteiraPanel = lazy(() => import('../components/gestao-financeira/CarteiraPanel'))

export default function CarteiraConsultor() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const consultorId = params.get('consultorId') ?? undefined

  return (
    <div className="space-y-4">
      <header className="card-premium p-4">
        <p className="text-[10px] font-mono text-aletis-verde uppercase font-semibold tracking-wider">
          📊 Visão consolidada · multi-grupo
        </p>
        <h1 className="text-xl font-display font-bold text-aletis-grafite-escuro mt-1">
          Carteira do consultor
        </h1>
        <p className="text-xs font-body text-aletis-grafite-claro mt-1 max-w-3xl">
          KPIs agregados, rankings (melhor margem, pior margem, mais alavancado, maior receita)
          e distribuição saudável/atenção/crítico de todos os grupos sob gestão. Clique em um grupo
          para abrir o R.OP.001 v2.0 dele.
        </p>
      </header>

      <Suspense fallback={<div className="card-premium p-8 text-center text-xs text-aletis-grafite-claro">Carregando carteira…</div>}>
        <CarteiraPanel
          consultorId={consultorId}
          onSelectGrupo={(clienteId) => {
            navigate(`/clientes/${clienteId}?tab=gestao-financeira`)
          }}
        />
      </Suspense>
    </div>
  )
}

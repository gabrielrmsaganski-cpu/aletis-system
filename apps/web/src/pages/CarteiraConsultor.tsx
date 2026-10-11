import PageHeader from '../components/ui/PageHeader'
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
      <PageHeader title={<>Carteira do consultor</>} eyebrow={<> <p className="text-[11px] font-mono text-foreground uppercase font-semibold tracking-wider">
          📊 Visão consolidada · multi-grupo
        </p> </>} description={<> <p className="text-xs font-body text-muted-foreground mt-1 max-w-3xl">
          KPIs agregados, rankings (melhor margem, pior margem, mais alavancado, maior receita)
          e distribuição saudável/atenção/crítico de todos os grupos sob gestão. Clique em um grupo
          para abrir o R.OP.001 v2.0 dele.
        </p> </>} />

      <Suspense fallback={<div className="card-premium p-8 text-center text-xs text-muted-foreground">Carregando carteira…</div>}>
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

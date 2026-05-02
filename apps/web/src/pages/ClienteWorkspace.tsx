// ============================================================
// ClienteWorkspace — entrada canônica do cliente.
// Substitui ClienteDetalhes (god-component de 14 abas + 33 contextos)
// por 6 áreas claras alinhadas ao workflow do consultor:
//
//   1. Pulse        — home de comando (alertas, próxima ação, KPIs)
//   2. Identidade   — pessoa, terra, patrimônio
//   3. Diagnóstico  — radiografia financeira (Dashboard 360°, SRAI)
//   4. Operação     — matriz R.OP.001 (9 editores)
//   5. Negociação   — propostas, deal, demandas, contratos
//   6. Workflow     — processo TEX, docs, comms, timeline, chat
//
// A QuickActionsBar promove ações épicas (Simulador, Stress test,
// Marketplace, Narrativa ALIX, exports) que estavam escondidas
// atrás de 3-4 cliques.
// ============================================================
import { useParams } from 'react-router-dom'
import WorkspaceShell from '../components/cliente/workspace/WorkspaceShell'

export default function ClienteWorkspace() {
  const { id } = useParams<{ id: string }>()
  if (!id) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-sm text-aletis-grafite-medio">URL inválida.</p>
      </div>
    )
  }
  return <WorkspaceShell urlId={id} />
}

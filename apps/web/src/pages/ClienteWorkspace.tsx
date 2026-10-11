// ============================================================
// ClienteWorkspace — entrada canônica do cliente no CRM.
// Organiza o atendimento em áreas operacionais claras para o consultor.
// ============================================================
import { useParams } from 'react-router-dom'
import WorkspaceShell from '../components/cliente/workspace/WorkspaceShell'

export default function ClienteWorkspace() {
  const { id } = useParams<{ id: string }>()
  if (!id) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-sm text-[var(--text-soft)]">URL inválida.</p>
      </div>
    )
  }
  return <WorkspaceShell urlId={id} />
}

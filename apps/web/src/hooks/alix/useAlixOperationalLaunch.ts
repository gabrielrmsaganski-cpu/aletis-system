import { useCallback, useEffect, useRef, useState } from 'react'
import type { AlixMission } from '../../components/alix/AlixTaskCenter'

export interface AlixOperationalHandoff {
  id: string
  session: { id: string; clienteId: string; archived: boolean }
  mission: AlixMission
  deliverables: string[]
  actionPolicy: 'prepare_only'
  canStart: boolean
  reused: boolean
}

/** Espera o histórico e o contexto corretos antes de iniciar uma única vez. */
export function useAlixOperationalLaunch(input: {
  sessionId: string | null
  clienteId: string | null
  loadedSessionId: string | null
  missionId: string | null
  busy: boolean
  ready: boolean
  contextVersion: number
  send: (prompt: string) => Promise<void>
}) {
  const [pending, setPending] = useState<{ handoff: AlixOperationalHandoff; contextVersion: number } | null>(null)
  const launching = useRef<string | null>(null)
  useEffect(() => {
    if (!pending) return
    const handoff = pending.handoff
    if (input.contextVersion !== pending.contextVersion || (input.loadedSessionId === handoff.session.id && input.clienteId !== handoff.session.clienteId)) { setPending(null); return }
    if (input.busy || !input.ready || input.loadedSessionId !== handoff.session.id || input.sessionId !== handoff.session.id || input.clienteId !== handoff.session.clienteId || input.missionId !== handoff.mission.id) return
    if (!handoff.canStart || handoff.session.archived || launching.current === handoff.mission.id) { setPending(null); return }
    launching.current = handoff.mission.id
    setPending(null)
    // O servidor confirma a posse exclusiva; outro navegador abre a missão
    // em andamento sem executar as ferramentas novamente.
    void input.send(handoff.mission.prompt).catch(() => undefined).finally(() => { if (launching.current === handoff.mission.id) launching.current = null })
  }, [pending, input.sessionId, input.clienteId, input.loadedSessionId, input.missionId, input.busy, input.ready, input.contextVersion, input.send])
  const schedule = useCallback((handoff: AlixOperationalHandoff, contextVersion: number) => setPending({ handoff, contextVersion }), [])
  return { schedule }
}

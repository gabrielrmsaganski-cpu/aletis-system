import { useCallback, useState } from 'react'
import type { AlixExecution, AlixRoutingDecision, AlixToolProgress } from '../../components/alix/alixWorkspacePresentation'

export function useAlixExecution() {
  const [execution, setExecution] = useState<AlixExecution | null>(null)
  const begin = useCallback((id: string) => setExecution({ id, startedAt: Date.now(), status: 'running', tools: [] }), [])
  const route = useCallback((id: string, routing: AlixRoutingDecision) => {
    setExecution(current => current?.id === id && current.status === 'running' ? { ...current, routing } : current)
  }, [])
  const progress = useCallback((id: string, event: AlixToolProgress) => {
    setExecution(current => {
      if (current?.id !== id || current.status !== 'running') return current
      const previous = current.tools.find(tool => tool.id === event.id)
      if (previous && previous.phase !== 'started' && event.phase === 'started') return current
      const tools = previous
        ? current.tools.map(tool => tool.id === event.id ? { ...tool, ...event } : tool)
        : [...current.tools, event]
      return { ...current, tools }
    })
  }, [])
  const finish = useCallback((id: string, status: Exclude<AlixExecution['status'], 'running'>) => {
    setExecution(current => current?.id === id && current.status === 'running' ? { ...current, status, finishedAt: Date.now() } : current)
  }, [])
  const reset = useCallback(() => setExecution(null), [])
  return { execution, begin, route, progress, finish, reset }
}

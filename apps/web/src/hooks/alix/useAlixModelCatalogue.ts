import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../useApi'
import type { AlixModelOption } from '../../components/alix/AlixModelSelector'

export interface AlixCatalogueModel {
  id: string
  deployment: string
  provider: string
  availability: 'available' | 'unavailable' | 'unknown'
  capabilities: string[]
  label: string
  verifiedAt?: string
  protocols?: Array<'responses' | 'chat_completions'>
  verificationSource?: string
}

export function availableAlixModelOptions(models: AlixCatalogueModel[]): AlixModelOption[] {
  return models.filter(model => typeof model.id === 'string' && model.id.trim()).map(model => ({
    id: model.id,
    label: typeof model.label === 'string' && model.label.trim() ? model.label : model.id,
    available: model.availability === 'available' && Array.isArray(model.capabilities) && model.capabilities.includes('chat') && model.capabilities.includes('tool_calling') && Array.isArray(model.protocols) && model.protocols.includes('responses'),
    detail: 'Conversa e execução de ferramentas. A resposta registra a IA efetivamente usada.',
  }))
}

export function useAlixModelCatalogue() {
  const [options, setOptions] = useState<AlixModelOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setOptions([])
    setError(null)
    try {
      const catalogue = await apiFetch<{ checkedAt: string; configured: boolean; stale?: boolean; error?: string; models: AlixCatalogueModel[] }>('/alix/models', { signal: controller.signal })
      if (controller.signal.aborted || controllerRef.current !== controller) return
      if (!catalogue || !Array.isArray(catalogue.models)) throw new Error('O catálogo de IA não pôde ser confirmado agora.')
      setOptions(catalogue.configured && !catalogue.stale ? availableAlixModelOptions(catalogue.models) : [])
      setCheckedAt(typeof catalogue.checkedAt === 'string' ? catalogue.checkedAt : null)
      if (!catalogue.configured) setError('A seleção de IA não está disponível neste ambiente.')
      else if (catalogue.stale || catalogue.error) setError('Não foi possível confirmar a disponibilidade dos modelos agora. Consulte novamente ou use a seleção automática.')
    } catch (failure) {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        setOptions([])
        setError('Não foi possível consultar os modelos disponíveis. A escolha automática será verificada quando você enviar o pedido.')
      }
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) setLoading(false)
    }
  }, [])
  useEffect(() => { void refresh(); return () => controllerRef.current?.abort() }, [refresh])
  return { options, loading, error, checkedAt, refresh }
}

import { useCallback, useEffect, useRef, useState } from 'react'

export interface DocumentIndicator {
  nome: string
  valor: string | number
  unidade?: string
  fonte?: string
  confianca?: number
}

export interface DocumentAnalysis {
  documentoId: string
  filename: string
  kind: string
  status: 'llm' | 'deterministic'
  tipoDocumento: string
  resumoExecutivo: string
  achadosChave: string[]
  indicadores: DocumentIndicator[]
  riscos: string[]
  lacunas: string[]
  acoesSugeridas: string[]
  evidencias: string[]
  aviso?: string
}

export interface DocumentAnalysisResult {
  analysis: DocumentAnalysis
  cached: boolean
  processing?: { status: string; reason: string; nextStep: string | null }
  sourceReadiness: {
    extractedTextChars: number
    evidenceCount: number
    hasNativeFile: boolean
    clientScope: 'cliente' | 'sessao'
  }
}

function apiError(status: number, raw: string): Error {
  try {
    const value = JSON.parse(raw) as { error?: string }
    return new Error(value.error || `HTTP ${status}`)
  } catch {
    return new Error(/<\/?(?:html|body|!doctype)\b/i.test(raw)
      ? `O servidor demorou para responder (HTTP ${status}). Tente novamente.`
      : `A resposta da análise não é válida (HTTP ${status}).`)
  }
}

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Análise cancelada.', 'AbortError')); return }
    const cancel = () => { window.clearTimeout(timer); reject(new DOMException('Análise cancelada.', 'AbortError')) }
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, ms)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

async function pollAnalysisJob(statusUrl: string, signal: AbortSignal): Promise<DocumentAnalysisResult> {
  const deadline = Date.now() + 10 * 60_000
  while (Date.now() < deadline) {
    if (signal.aborted) throw new DOMException('Análise cancelada.', 'AbortError')
    const response = await fetch(statusUrl, { headers: { Accept: 'application/json' }, signal })
    const raw = await response.text()
    if (!response.ok) throw apiError(response.status, raw)
    let payload: {
      success?: boolean
      error?: string
      data?: { state?: string; output?: DocumentAnalysisResult; failed?: boolean; completed?: boolean; finished?: boolean }
    }
    try {
      payload = JSON.parse(raw) as typeof payload
    } catch {
      throw apiError(response.status, raw)
    }
    if (payload.success === false) throw new Error(payload.error || 'Falha ao consultar a análise.')
    const job = payload.data
    if (job?.failed || job?.state === 'cancelled') {
      throw new Error('A análise profunda não pôde ser concluída após as tentativas automáticas.')
    }
    if ((job?.finished || job?.completed) && job.output?.analysis) {
      const result = job.output
      const processing = result.processing
      return processing && processing.status !== 'completed'
        ? { ...result, analysis: { ...result.analysis, aviso: [processing.reason, processing.nextStep, result.analysis.aviso].filter(Boolean).join(' ') } }
        : result
    }
    await wait(1_500, signal)
  }
  throw new Error('A análise continua em processamento. Ela poderá ser consultada novamente em instantes.')
}

export function useDocumentAnalysis() {
  const [analysis, setAnalysis] = useState<DocumentAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const generation = useRef(0)
  useEffect(() => () => { generation.current += 1; controllerRef.current?.abort() }, [])

  const fetchAnalysis = useCallback(async (docId: string, sessionId: string, focus?: string) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const current = ++generation.current
    setLoading(true)
    setError(null)
    setAnalysis(null)
    try {
      const response = await fetch(
        `/api/alix/documents/${encodeURIComponent(sessionId)}/${encodeURIComponent(docId)}/analyze-deep`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...(focus ? { foco: focus } : {}), async: true }),
        },
      )
      const raw = await response.text()
      if (!response.ok) throw apiError(response.status, raw)
      let payload: {
        success?: boolean
        error?: string
        data?: DocumentAnalysisResult | { queued?: boolean; statusUrl?: string }
      }
      try {
        payload = JSON.parse(raw) as typeof payload
      } catch {
        throw apiError(response.status, raw)
      }
      if (payload.success === false || !payload.data) {
        throw new Error(payload.error || 'A ALIX não retornou uma análise utilizável.')
      }
      const queued = payload.data as { queued?: boolean; statusUrl?: string }
      const result = queued.queued && queued.statusUrl
        ? await pollAnalysisJob(queued.statusUrl, controller.signal)
        : payload.data as DocumentAnalysisResult
      if (controller.signal.aborted || generation.current !== current) throw new DOMException('Análise cancelada.', 'AbortError')
      if (!result.analysis) throw new Error('A ALIX não retornou uma análise utilizável.')
      setAnalysis(result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao analisar documento.'
      if (!controller.signal.aborted && generation.current === current) setError(message)
      throw err
    } finally {
      if (generation.current === current) { controllerRef.current = null; setLoading(false) }
    }
  }, [])

  const clear = useCallback(() => {
    generation.current += 1
    controllerRef.current?.abort()
    controllerRef.current = null
    setAnalysis(null)
    setError(null)
    setLoading(false)
  }, [])

  return { analysis, loading, error, fetchAnalysis, clear }
}

/**
 * ErrorBoundary — captura erros de render e previne tela branca.
 *
 * Quando qualquer componente filho lança uma exceção, substituímos por
 * um painel explicando o problema com CTAs de "tentar de novo" e
 * "voltar pro dashboard". Em dev, mostra stack completa; em prod, só
 * mensagem curta.
 */
import React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  label?: string
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
  errorId?: string
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorId: `err_${Date.now().toString(36)}` }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log para console — em prod pode ir para telemetria
    console.error('[ErrorBoundary] render falhou:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined, errorId: undefined })
  }

  handleGoHome = (): void => {
    window.location.href = '/dashboard'
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback

    const isDev = (import.meta as any).env?.DEV ?? true

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white dark:bg-aletis-grafite-escuro border border-red-200 dark:border-red-800 rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-red-50 dark:bg-red-950/30 px-6 py-4 flex items-center gap-3 border-b border-red-200 dark:border-red-800">
            <AlertTriangle size={24} className="text-red-600 dark:text-red-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-red-900 dark:text-red-200">
                {this.props.label ?? 'Algo quebrou ao renderizar'}
              </h2>
              <p className="text-sm text-red-700 dark:text-red-300">
                A tela caiu em um erro inesperado. Seus dados estão seguros.
              </p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-aletis-grafite-escuro dark:text-white/85">
              <b>Mensagem:</b>{' '}
              <code className="font-mono text-xs bg-aletis-bege dark:bg-white/5 px-2 py-0.5 rounded">
                {this.state.error?.message || 'erro sem mensagem'}
              </code>
            </p>
            {this.state.errorId && (
              <p className="text-[11px] text-aletis-grafite-medio dark:text-white/50">
                ID do erro: <code className="font-mono">{this.state.errorId}</code> · {new Date().toLocaleString('pt-BR')}
              </p>
            )}
            {isDev && this.state.error?.stack && (
              <details className="text-xs">
                <summary className="cursor-pointer text-aletis-grafite-medio dark:text-white/60 hover:text-aletis-verde">
                  Ver stack trace (dev)
                </summary>
                <pre className="mt-2 p-3 bg-slate-100 dark:bg-slate-900 rounded overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-aletis-verde text-white font-semibold text-sm hover:bg-aletis-verde-escuro transition"
              >
                <RefreshCw size={14} /> Tentar de novo
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-aletis-borda dark:border-white/10 text-aletis-grafite-escuro dark:text-white font-medium text-sm hover:bg-aletis-bege dark:hover:bg-white/5 transition"
              >
                <RefreshCw size={14} /> Recarregar página
              </button>
              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-aletis-borda dark:border-white/10 text-aletis-grafite-medio dark:text-white/70 font-medium text-sm hover:bg-aletis-bege dark:hover:bg-white/5 transition"
              >
                <Home size={14} /> Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

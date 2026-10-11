// ============================================================
// PortalErrorBoundary — captura crashes em sub-componentes do portal
// e oferece reload em vez de tela em branco.
// ============================================================
import React from 'react'
import { AlertCircle, RefreshCw, MessageCircle } from 'lucide-react'

interface State {
  hasError: boolean
  error?: Error
}

export class PortalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log para o backend opcional (best-effort)
    try {
      fetch('/api/portal/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
          path: window.location.pathname,
          ts: new Date().toISOString(),
        }),
      }).catch(() => {/* offline ou endpoint não criado ainda */})
    } catch {/* swallow */}
    if (typeof console !== 'undefined') console.error('[Portal]', error, info)
  }

  reset = () => this.setState({ hasError: false, error: undefined })

  reload = () => window.location.reload()

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-aletis-cream flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card rounded-2xl shadow-2xl border border-aletis-borda p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-red-600" />
            </div>
            <h2 className="text-lg font-display font-bold text-foreground">
              Algo travou no portal
            </h2>
            <p className="mt-2 text-sm font-body text-muted-foreground leading-relaxed">
              Não conseguimos renderizar esta área agora. Sua sessão e seus dados estão intactos —
              só esta tela travou. Tente recarregar.
            </p>
            {this.state.error?.message && (
              <pre className="mt-3 text-[10px] font-mono text-[var(--text-soft)] bg-aletis-bege/40 rounded p-2 overflow-auto max-h-24">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={this.reload}
                className="w-full inline-flex items-center justify-center gap-2 bg-aletis-verde text-white px-4 py-2.5 rounded-lg font-body font-semibold text-sm hover:bg-aletis-verde-escuro transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Recarregar portal
              </button>
              <a
                href="mailto:contato@aletis.com.br?subject=Erro no portal"
                className="w-full inline-flex items-center justify-center gap-2 border border-aletis-borda text-foreground px-4 py-2.5 rounded-lg font-body font-semibold text-sm hover:bg-aletis-bege transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> Avisar o consultor
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

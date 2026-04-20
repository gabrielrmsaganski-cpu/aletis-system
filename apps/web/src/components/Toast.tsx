import React from 'react'
import { X, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { ToastItem } from '../hooks/useToast'

const iconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const

const colorMap = {
  info: {
    bg: 'bg-aletis-grafite-escuro',
    icon: 'text-aletis-dourado',
    text: 'text-white',
    close: 'text-white/60 hover:text-white',
  },
  success: {
    bg: 'bg-aletis-grafite-escuro',
    icon: 'text-positivo',
    text: 'text-white',
    close: 'text-white/60 hover:text-white',
  },
  warning: {
    bg: 'bg-aletis-grafite-escuro',
    icon: 'text-ambar',
    text: 'text-white',
    close: 'text-white/60 hover:text-white',
  },
  error: {
    bg: 'bg-red-900',
    icon: 'text-red-300',
    text: 'text-white',
    close: 'text-white/60 hover:text-white',
  },
} as const

interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type]
        const colors = colorMap[toast.type]
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border border-white/10 ${colors.bg} animate-fade-in min-w-[280px] max-w-[420px]`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 ${colors.icon}`} />
            <p className={`text-sm font-body flex-1 ${colors.text}`}>
              {toast.message}
            </p>
            <button
              onClick={() => onDismiss(toast.id)}
              className={`p-1 rounded-lg transition-colors flex-shrink-0 ${colors.close}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

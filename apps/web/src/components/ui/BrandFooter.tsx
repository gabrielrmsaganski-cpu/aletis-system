/**
 * BrandFooter — rodapé global de marca para todas as páginas autenticadas.
 *
 * Assinatura compacta para o ambiente operacional autenticado.
 */
import { Link } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'

export default function BrandFooter() {
  const year = new Date().getFullYear()
  return (
    <footer
      className="border-t border-border px-6 py-3"
      aria-label="Rodapé ALETIS"
    >
      <div className="mx-auto flex w-full max-w-[1540px] flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            © {year} ALETIS Soluções · sistema interno
          </p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-muted-foreground transition hover:bg-white hover:text-aletis-verde dark:text-aletis-sage dark:hover:bg-white/10 dark:hover:text-white"
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          Visão geral
        </Link>
      </div>
    </footer>
  )
}

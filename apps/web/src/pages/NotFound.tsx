/**
 * NotFound — página 404 oficial.
 *
 * Substitui o redirect silencioso `*` → `/dashboard` por uma página
 * informativa que respeita identidade visual ALETIS, sugere ações
 * úteis e mantém a Sidebar/Header (renderiza dentro do Layout).
 */
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Home, Search, AlertCircle } from 'lucide-react'

export default function NotFound() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const sugestoes: Array<{ label: string; href: string; nota: string }> = [
    { label: 'Dashboard', href: '/dashboard', nota: 'visão geral do escritório' },
    { label: 'CRM', href: '/crm', nota: 'lista de clientes ativos' },
    { label: 'Prospecção', href: '/prospeccao', nota: 'OODA — leads qualificados' },
    { label: 'Aletéia', href: '/ia', nota: 'assistente IA' },
  ]

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12">
      <div className="card-premium max-w-2xl w-full p-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-aletis-gold/15 border border-aletis-gold/40 mb-5">
          <AlertCircle className="w-8 h-8 text-aletis-gold-escuro" />
        </div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-aletis-gold-escuro">
          404 · Rota não encontrada
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-4xl font-bold text-aletis-verde tracking-tight">
          Essa página não está no mapa.
        </h1>
        <p className="mt-3 max-w-md mx-auto font-body text-[14px] leading-relaxed text-aletis-verde-medio">
          Tentei abrir{' '}
          <code className="px-1.5 py-0.5 rounded bg-aletis-cream font-mono text-[12px] text-aletis-verde-escuro">
            {pathname}
          </code>
          , mas não encontrei. Talvez o link esteja desatualizado, ou a tela
          tenha sido movida em uma das ondas do sistema.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="btn-outline inline-flex items-center gap-2"
          >
            <ArrowLeft size={14} /> Voltar
          </button>
          <Link to="/dashboard" className="btn-primary inline-flex items-center gap-2">
            <Home size={14} /> Ir para o Dashboard
          </Link>
        </div>

        <div className="mt-9 pt-7 border-t border-aletis-cream-escuro/60">
          <p className="font-display text-[10.5px] font-semibold uppercase tracking-widest text-aletis-verde-medio">
            <Search size={12} className="inline -mt-0.5 mr-1.5" />
            Atalhos rápidos
          </p>
          <ul className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {sugestoes.map((s) => (
              <li key={s.href}>
                <Link
                  to={s.href}
                  className="block rounded-xl border border-aletis-cream-escuro/70 bg-aletis-cream-papel px-3 py-2.5 hover:border-aletis-gold/45 hover:bg-white transition"
                >
                  <p className="font-display text-[12.5px] font-bold text-aletis-verde">
                    {s.label}
                  </p>
                  <p className="font-body text-[10.5px] text-aletis-verde-medio mt-0.5">
                    {s.nota}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-5 font-body text-[11.5px] text-aletis-verde-claro">
            Pressione <kbd className="px-1.5 py-0.5 rounded bg-aletis-cream-papel border border-aletis-cream-escuro font-mono text-[10px]">⌘K</kbd> para abrir a paleta de comandos.
          </p>
        </div>
      </div>
    </div>
  )
}

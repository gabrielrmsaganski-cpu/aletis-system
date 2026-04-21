'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, X, ArrowUpRight } from 'lucide-react'
import { nav, siteConfig } from '@/lib/siteConfig'
import { cn } from '@/lib/cn'

export function Header() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header
      className={cn(
        'fixed left-0 right-0 top-0 z-50 transition-all duration-500',
        scrolled
          ? 'bg-aletis-verde-profundo/92 backdrop-blur-xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.35)]'
          : 'bg-transparent',
      )}
    >
      <div className="container-refined flex h-[76px] items-center justify-between">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-3" aria-label="ALETIS — Início">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/15 font-display text-xl font-bold text-aletis-dourado transition-all duration-300 group-hover:border-aletis-dourado group-hover:bg-aletis-dourado/25">
            A
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[20px] font-bold tracking-wider text-aletis-dourado">
              {siteConfig.name}
            </span>
            <span className="mt-0.5 font-body text-[10px] uppercase tracking-widest2 text-white/50">
              {siteConfig.tagline}
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Navegação principal" className="hidden items-center gap-9 lg:flex">
          {nav.primary.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'nav-link',
                  active && 'text-white after:w-full after:!block after:absolute after:left-0 after:-bottom-1.5 after:h-px after:w-full after:bg-aletis-dourado',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="hidden lg:flex">
          <Link
            href="/contato"
            className="group inline-flex items-center gap-2 rounded-full bg-aletis-dourado px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-wider2 text-aletis-verde-escuro shadow-gold transition-all duration-300 hover:bg-aletis-dourado-suave hover:-translate-y-0.5"
          >
            Falar com especialista
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <button
          type="button"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/90 transition hover:border-aletis-dourado/50 hover:text-aletis-dourado lg:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-x-0 top-[76px] bottom-0 z-40 overflow-y-auto bg-aletis-verde-profundo/98 backdrop-blur-xl transition-all duration-500 lg:hidden',
          open ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none',
        )}
      >
        <nav className="container-refined flex flex-col gap-2 py-8" aria-label="Menu mobile">
          {nav.primary.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4 transition hover:border-aletis-dourado/30 hover:bg-white/[0.05]"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="font-display text-lg font-semibold text-white">{item.label}</span>
              <ArrowUpRight className="h-4 w-4 text-aletis-dourado opacity-60 transition group-hover:opacity-100" />
            </Link>
          ))}
          <Link
            href="/contato"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-aletis-dourado px-6 py-4 font-display text-sm font-semibold uppercase tracking-wider2 text-aletis-verde-escuro shadow-gold"
          >
            Falar com especialista
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </nav>
      </div>
    </header>
  )
}

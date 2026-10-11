'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, X, ArrowUpRight } from 'lucide-react'
import { nav } from '@/lib/siteConfig'
import { cn } from '@/lib/cn'
import BrandMark from '@/components/ui/BrandMark'

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
          ? 'bg-aletis-verde/95 backdrop-blur-xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.4)] border-b border-aletis-sage/10'
          : 'bg-aletis-verde/40 backdrop-blur-sm',
      )}
      style={
        scrolled
          ? undefined
          : {
              backgroundImage:
                'linear-gradient(180deg, rgba(13,22,17,0.6) 0%, rgba(13,22,17,0.0) 100%)',
            }
      }
    >
      <div className="container-refined flex h-[80px] items-center justify-between">
        {/* Logo oficial */}
        <Link href="/" className="group flex items-center gap-3" aria-label="ALETIS — Início">
          <BrandMark variant="full" tone="cream" size={34} />
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Navegação principal" className="hidden items-center gap-7 xl:flex">
          {nav.primary.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('nav-link', active && 'is-active')}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="hidden xl:flex">
          <Link
            href="/contato"
            className="group inline-flex items-center gap-2 rounded-full bg-aletis-gold px-5 py-2.5 font-display text-[11.5px] font-semibold uppercase tracking-wider2 text-aletis-verde shadow-gold transition-all duration-300 hover:bg-aletis-gold-claro hover:-translate-y-0.5"
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
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-aletis-sage/20 text-aletis-cream transition hover:border-aletis-gold/50 hover:text-aletis-gold xl:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-x-0 top-[80px] bottom-0 z-40 overflow-y-auto bg-aletis-verde/98 backdrop-blur-xl transition-all duration-500 xl:hidden',
          open ? 'translate-x-0 opacity-100 visible' : 'translate-x-0 opacity-0 pointer-events-none invisible',
        )}
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(23,37,27,0.97) 0%, rgba(13,22,17,0.99) 100%), url(/brand/pattern/repetidor.png)',
          backgroundSize: 'auto, 320px',
          backgroundBlendMode: 'normal, soft-light',
        }}
      >
        <nav className="container-refined flex flex-col gap-2 py-8" aria-label="Menu mobile">
          {nav.primary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center justify-between rounded-xl border border-aletis-sage/15 bg-aletis-cream/[0.03] px-5 py-4 transition hover:border-aletis-gold/35 hover:bg-aletis-cream/[0.06]"
            >
              <span className="font-display text-lg font-semibold text-aletis-cream">
                {item.label}
              </span>
              <ArrowUpRight className="h-4 w-4 text-aletis-gold opacity-65 transition group-hover:opacity-100" />
            </Link>
          ))}
          <Link
            href="/contato"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-aletis-gold px-6 py-4 font-display text-sm font-semibold uppercase tracking-wider2 text-aletis-verde shadow-gold"
          >
            Falar com especialista
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </nav>
      </div>
    </header>
  )
}

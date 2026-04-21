import Link from 'next/link'
import { Mail, Phone, MapPin, Instagram, Linkedin, ArrowUpRight } from 'lucide-react'
import { nav, siteConfig } from '@/lib/siteConfig'

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="relative bg-aletis-verde-profundo text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] bg-grain mix-blend-overlay"
      />

      {/* CTA band */}
      <div className="border-b border-white/10">
        <div className="container-refined flex flex-col items-start justify-between gap-8 py-14 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="eyebrow eyebrow--light">
              <span className="gold-hairline" aria-hidden="true" />
              Pronto para a próxima conversa com seus credores?
            </p>
            <h2 className="mt-4 display-lg text-white">
              Diagnóstico gratuito. Memória de cálculo auditável.{' '}
              <span className="text-gold-gradient">Decisão em 72h.</span>
            </h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/contato"
              className="btn-primary"
            >
              Solicitar diagnóstico
            </Link>
            <Link href="/calculadoras" className="btn-ghost">
              Simular agora
            </Link>
          </div>
        </div>
      </div>

      {/* Grid de colunas */}
      <div className="container-refined grid grid-cols-1 gap-12 py-16 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/15 font-display text-xl font-bold text-aletis-dourado">
              A
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-2xl font-bold tracking-wider text-aletis-dourado">
                ALETIS
              </span>
              <span className="mt-1 text-[10px] uppercase tracking-widest2 text-white/50">
                {siteConfig.tagline}
              </span>
            </span>
          </Link>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/65">
            {siteConfig.longDescription}
          </p>

          <div className="mt-8 flex flex-col gap-3 text-sm text-white/70">
            <a
              href={`mailto:${siteConfig.contact.email}`}
              className="group inline-flex items-center gap-3 transition hover:text-aletis-dourado"
            >
              <Mail className="h-4 w-4 text-aletis-dourado" />
              {siteConfig.contact.email}
            </a>
            <a
              href={`tel:${siteConfig.contact.telefone.replace(/[^+\d]/g, '')}`}
              className="group inline-flex items-center gap-3 transition hover:text-aletis-dourado"
            >
              <Phone className="h-4 w-4 text-aletis-dourado" />
              {siteConfig.contact.telefone}
            </a>
            <span className="inline-flex items-center gap-3">
              <MapPin className="h-4 w-4 text-aletis-dourado" />
              {siteConfig.contact.endereco}
            </span>
          </div>

          <div className="mt-8 flex gap-3">
            <a
              href={siteConfig.social.linkedin}
              aria-label="LinkedIn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-aletis-dourado hover:text-aletis-dourado"
            >
              <Linkedin className="h-4 w-4" />
            </a>
            <a
              href={siteConfig.social.instagram}
              aria-label="Instagram"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-aletis-dourado hover:text-aletis-dourado"
            >
              <Instagram className="h-4 w-4" />
            </a>
          </div>
        </div>

        <FooterColumn title="Empresa" items={nav.footer.empresa} />
        <FooterColumn title="Consultoria" items={nav.footer.solucoes} />
        <FooterColumn title="Ferramentas" items={nav.footer.ferramentas} />
      </div>

      {/* Legal bar */}
      <div className="border-t border-white/10">
        <div className="container-refined flex flex-col items-start justify-between gap-4 py-6 text-xs text-white/50 md:flex-row md:items-center">
          <p>
            © {year} ALETIS Finanças Estratégicas. Todos os direitos reservados.
          </p>
          <nav className="flex flex-wrap gap-5">
            {nav.footer.legal.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="transition hover:text-aletis-dourado"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  items,
}: {
  title: string
  items: readonly { label: string; href: string }[]
}) {
  return (
    <div>
      <h3 className="font-display text-[11px] font-semibold uppercase tracking-widest2 text-aletis-dourado">
        {title}
      </h3>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group inline-flex items-center gap-1.5 text-sm text-white/70 transition hover:text-white"
            >
              {item.label}
              <ArrowUpRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

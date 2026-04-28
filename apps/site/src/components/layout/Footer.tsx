import Link from 'next/link'
import { Mail, Phone, MapPin, Instagram, Linkedin, ArrowUpRight, Sparkles } from 'lucide-react'
import { nav, siteConfig, pilares } from '@/lib/siteConfig'
import BrandMark from '@/components/ui/BrandMark'
import BrandWatermark from '@/components/ui/BrandWatermark'

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer
      className="relative overflow-hidden bg-aletis-verde text-aletis-cream"
      style={{
        backgroundImage:
          'linear-gradient(180deg, rgba(13,22,17,0.96) 0%, rgba(8,13,9,0.99) 100%), url(/brand/pattern/repetidor.png)',
        backgroundSize: 'auto, 360px',
        backgroundBlendMode: 'normal, soft-light',
      }}
    >
      {/* Watermark do bracket-A */}
      <BrandWatermark
        size={620}
        tone="cream"
        opacity={0.04}
        className="absolute -right-32 top-32 hidden lg:block"
        rotate={-6}
      />

      {/* CTA band */}
      <div className="relative border-b border-aletis-sage/10">
        <div className="container-refined flex flex-col items-start justify-between gap-8 py-16 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="eyebrow eyebrow--light">
              <span className="gold-hairline" aria-hidden="true" />
              Pronto para a próxima conversa com seus credores?
            </p>
            <h2 className="mt-4 display-lg text-aletis-cream">
              Diagnóstico inicial sem custo. Memória de cálculo auditável.{' '}
              <span className="text-gold-gradient italic">Decisão em 72h.</span>
            </h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/contato" className="btn-primary">
              Solicitar diagnóstico
            </Link>
            <Link href="/calculadoras" className="btn-ghost">
              Simular agora
            </Link>
          </div>
        </div>
      </div>

      {/* Pilares de serviço — 4 verticais Agro/Corporate/Fomento/Gestão */}
      <div className="relative border-b border-aletis-sage/10">
        <div className="container-refined py-14">
          <p className="eyebrow eyebrow--light flex items-center gap-2">
            <Sparkles className="h-3 w-3" />
            Pilares de serviço
          </p>
          <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
            {pilares.map((p) => (
              <div key={p.key} className="border-l border-aletis-gold/30 pl-4">
                <h3 className="font-display text-[14px] font-bold uppercase tracking-wider2 text-aletis-gold">
                  {p.titulo}
                </h3>
                <p className="mt-2 font-body text-[12.5px] leading-relaxed text-aletis-sage">
                  {p.descricao}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid de colunas */}
      <div className="relative container-refined grid grid-cols-1 gap-12 py-16 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Link href="/" className="inline-block">
            <BrandMark variant="full" tone="cream" size={42} />
          </Link>
          <p className="mt-6 max-w-sm font-body text-[13px] leading-relaxed text-aletis-sage">
            {siteConfig.longDescription}
          </p>

          <div className="mt-8 flex flex-col gap-3 font-body text-[13px] text-aletis-cream/80">
            <a
              href={`mailto:${siteConfig.contact.email}`}
              className="group inline-flex items-center gap-3 transition hover:text-aletis-gold"
            >
              <Mail className="h-4 w-4 text-aletis-gold" />
              {siteConfig.contact.email}
            </a>
            {siteConfig.contact.telefone && (
              <a
                href={`tel:${siteConfig.contact.telefone.replace(/[^+\d]/g, '')}`}
                className="group inline-flex items-center gap-3 transition hover:text-aletis-gold"
              >
                <Phone className="h-4 w-4 text-aletis-gold" />
                {siteConfig.contact.telefone}
              </a>
            )}
            <span className="inline-flex items-center gap-3">
              <MapPin className="h-4 w-4 text-aletis-gold" />
              {siteConfig.contact.endereco}
            </span>
          </div>

          <div className="mt-8 flex gap-3">
            {siteConfig.social.linkedin && (
            <a
              href={siteConfig.social.linkedin}
              aria-label="LinkedIn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-aletis-sage/20 text-aletis-cream/75 transition hover:border-aletis-gold hover:text-aletis-gold"
            >
              <Linkedin className="h-4 w-4" />
            </a>
            )}
            {siteConfig.social.instagram && (
            <a
              href={siteConfig.social.instagram}
              aria-label="Instagram"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-aletis-sage/20 text-aletis-cream/75 transition hover:border-aletis-gold hover:text-aletis-gold"
            >
              <Instagram className="h-4 w-4" />
            </a>
            )}
          </div>
        </div>

        <FooterColumn title="Empresa" items={nav.footer.empresa} />
        <FooterColumn title="Consultoria" items={nav.footer.solucoes} />
        <FooterColumn title="Ferramentas" items={nav.footer.ferramentas} />
      </div>

      {/* Legal bar */}
      <div className="relative border-t border-aletis-sage/10">
        <div className="container-refined flex flex-col items-start justify-between gap-4 py-6 font-body text-[11.5px] text-aletis-cream/55 md:flex-row md:items-center">
          <p>
            © {year} ALETIS Soluções · Finanças Estratégicas &amp; Agrobusiness · Todos os direitos reservados.
          </p>
          <nav className="flex flex-wrap gap-5">
            {nav.footer.legal.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="transition hover:text-aletis-gold"
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
      <h3 className="font-display text-[11px] font-semibold uppercase tracking-widest2 text-aletis-gold">
        {title}
      </h3>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group inline-flex items-center gap-1.5 font-body text-[13px] text-aletis-cream/75 transition hover:text-aletis-cream"
            >
              {item.label}
              <ArrowUpRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100 text-aletis-gold" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

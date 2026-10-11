import Link from 'next/link'
import { ArrowRight, ShieldCheck, MessageCircle } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { getWhatsappHref } from '@/lib/siteConfig'

export function CtaFinal() {
  const waLink = getWhatsappHref(
    'Olá ALETIS, vim pelo site e gostaria de um diagnóstico.',
  )

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-aletis-verde-profundo via-aletis-verde-escuro to-[#04140F] text-white">
      <div aria-hidden="true" className="absolute inset-0 bg-hero-radial opacity-80" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] bg-grain mix-blend-overlay"
      />
      {/* corner ornaments */}
      <div aria-hidden="true" className="absolute left-10 top-10 hidden h-24 w-px bg-gradient-to-b from-aletis-dourado/60 to-transparent md:block" />
      <div aria-hidden="true" className="absolute right-10 bottom-10 hidden h-24 w-px bg-gradient-to-t from-aletis-dourado/60 to-transparent md:block" />

      <Container className="relative py-28 md:py-36">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Eyebrow light>Próximo passo</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white md:text-[56px]">
              Antes de negociar, organize a leitura.{' '}
              <span className="block italic text-gold-gradient">Depois decida.</span>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-7 text-base text-white/70 md:text-lg">
              A primeira conversa define escopo, urgência e documentos prioritários.
              NDA antes de qualquer contrato sensível e próximos passos claros em até 72 horas.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link href="/contato" className="btn-primary">
                Solicitar diagnóstico
                <ArrowRight className="h-4 w-4" />
              </Link>
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp direto
                </a>
              )}
            </div>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] text-white/60 backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5 text-aletis-dourado" />
              Sigilo profissional · NDA · LGPD · documentos tratados com critério
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}

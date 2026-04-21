import Link from 'next/link'
import { ArrowRight, Compass, MessageCircle } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { siteConfig } from '@/lib/siteConfig'

const whatsappHref = `https://wa.me/${siteConfig.contact.whatsapp}?text=${encodeURIComponent(
  'Olá, caí numa página inexistente do site ALETIS e gostaria de conversar.',
)}`

export default function NotFound() {
  return (
    <section className="relative flex min-h-[calc(100vh-76px)] items-center overflow-hidden bg-gradient-to-b from-aletis-verde-profundo via-aletis-verde-escuro to-aletis-verde-escuro py-24 text-white">
      <div aria-hidden="true" className="absolute inset-0 bg-hero-radial opacity-80" />
      <div aria-hidden="true" className="absolute inset-0 opacity-[0.06] bg-grain mix-blend-overlay" />

      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-display text-[128px] font-bold leading-none text-transparent bg-clip-text bg-gradient-to-b from-aletis-dourado to-aletis-dourado/30 md:text-[180px]">
            404
          </p>
          <p className="eyebrow eyebrow--light justify-center">
            <span className="gold-hairline" aria-hidden="true" />
            Página fora da rota
          </p>

          <h1 className="mt-6 font-display text-4xl font-semibold leading-tight md:text-[48px]">
            Essa página{' '}
            <span className="italic text-aletis-dourado">não está na mesa</span>.
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-[16px] leading-relaxed text-white/70">
            O link pode ter sido movido, removido ou digitado de outra forma. Sem prejuízo — há três caminhos dali para continuar a conversa.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/" className="btn-primary">
              Voltar ao início
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/solucoes"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3 font-display text-[12px] font-semibold uppercase tracking-wider2 text-white transition hover:border-aletis-dourado hover:text-aletis-dourado"
            >
              <Compass className="h-4 w-4" />
              Ver soluções
            </Link>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-aletis-dourado/50 bg-aletis-dourado/10 px-6 py-3 font-display text-[12px] font-semibold uppercase tracking-wider2 text-aletis-dourado transition hover:bg-aletis-dourado/20"
            >
              <MessageCircle className="h-4 w-4" />
              Chamar no WhatsApp
            </a>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            <Link
              href="/calculadoras"
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-sm transition hover:border-aletis-dourado/40 hover:bg-white/[0.06]"
            >
              <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
                Ferramentas
              </p>
              <p className="mt-2 text-[13px] text-white/80">
                3 calculadoras técnicas para dimensionar o seu caso em minutos.
              </p>
            </Link>
            <Link
              href="/insights"
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-sm transition hover:border-aletis-dourado/40 hover:bg-white/[0.06]"
            >
              <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
                Insights
              </p>
              <p className="mt-2 text-[13px] text-white/80">
                Teses revisionais, DSCR aplicado ao agro e mais.
              </p>
            </Link>
            <Link
              href="/contato"
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-sm transition hover:border-aletis-dourado/40 hover:bg-white/[0.06]"
            >
              <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
                Contato
              </p>
              <p className="mt-2 text-[13px] text-white/80">
                Diagnóstico gratuito em 72h. Retorno em 1 dia útil.
              </p>
            </Link>
          </div>
        </div>
      </Container>
    </section>
  )
}

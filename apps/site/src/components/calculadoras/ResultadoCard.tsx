import Link from 'next/link'
import { ArrowRight, Download, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { siteConfig } from '@/lib/siteConfig'

interface ResultadoItem {
  label: string
  valor: string
  destaque?: boolean
  sub?: string
}

export function ResultadoCard({
  titulo,
  subtitulo,
  itens,
  cta,
  children,
}: {
  titulo: string
  subtitulo?: string
  itens: ResultadoItem[]
  cta?: React.ReactNode
  children?: React.ReactNode
}) {
  const waLink = `https://wa.me/${siteConfig.contact.whatsapp}?text=${encodeURIComponent(
    `Olá ALETIS, simulei no site (${titulo}) e gostaria de validar o resultado com um especialista.`,
  )}`

  return (
    <div className="relative overflow-hidden rounded-2xl border border-aletis-dourado/30 bg-gradient-to-br from-aletis-verde-profundo to-aletis-verde-escuro p-7 text-white shadow-premium">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] bg-grain mix-blend-overlay"
      />
      <div className="relative">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-aletis-dourado/40 bg-aletis-dourado/10 px-3 py-1">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-aletis-dourado" />
          <span className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
            Resultado da simulação
          </span>
        </div>

        <h3 className="font-display text-2xl font-semibold md:text-3xl">{titulo}</h3>
        {subtitulo && (
          <p className="mt-1 text-sm text-white/60">{subtitulo}</p>
        )}

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {itens.map((it) => (
            <div
              key={it.label}
              className={cn(
                'rounded-xl border p-4 backdrop-blur',
                it.destaque
                  ? 'border-aletis-dourado/40 bg-aletis-dourado/10'
                  : 'border-white/10 bg-white/[0.03]',
              )}
            >
              <p className="text-[11px] font-display font-semibold uppercase tracking-wider text-white/50">
                {it.label}
              </p>
              <p
                className={cn(
                  'mt-1 font-display font-semibold',
                  it.destaque ? 'text-2xl text-aletis-dourado md:text-[28px]' : 'text-xl text-white',
                )}
              >
                {it.valor}
              </p>
              {it.sub && <p className="mt-1 text-[11px] text-white/50">{it.sub}</p>}
            </div>
          ))}
        </div>

        {children && <div className="mt-6">{children}</div>}

        <div className="mt-7 flex flex-wrap gap-3 border-t border-white/10 pt-6">
          {cta ?? (
            <>
              <Link
                href="/contato"
                className="inline-flex items-center gap-2 rounded-full bg-aletis-dourado px-5 py-3 font-display text-sm font-semibold uppercase tracking-wider2 text-aletis-verde-escuro shadow-gold transition hover:-translate-y-0.5 hover:bg-aletis-dourado-suave"
              >
                Falar com especialista
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-aletis-dourado/40 bg-transparent px-5 py-3 font-display text-sm font-semibold uppercase tracking-wider2 text-aletis-dourado transition hover:border-aletis-dourado hover:bg-aletis-dourado/10"
              >
                <MessageCircle className="h-4 w-4" />
                Enviar pelo WhatsApp
              </a>
            </>
          )}
        </div>

        <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-white/45">
          <Download className="mt-0.5 h-3 w-3 flex-shrink-0 text-aletis-dourado" />
          Estimativa preliminar. O diagnóstico oficial ALETIS é feito com os contratos originais
          e memória de cálculo auditável, entregue em 72h.
        </p>
      </div>
    </div>
  )
}

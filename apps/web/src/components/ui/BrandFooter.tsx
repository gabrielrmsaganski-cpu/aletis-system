/**
 * BrandFooter — rodapé global de marca para todas as páginas autenticadas.
 *
 * Renderiza a assinatura ALETIS em cream sobre fundo discreto, com
 * slogan oficial, copyright dinâmico e selo "Finanças Estratégicas &
 * Agrobusiness" na linha inferior. Faz a "fechadura" visual da página.
 */
import BrandMark from './BrandMark'
import { Sparkles } from 'lucide-react'

const TAGLINE_PILARES = [
  { label: 'Agro', desc: 'crédito rural & gestão financeira' },
  { label: 'Corporate', desc: 'BPO & gestão financeira para empresas' },
  { label: 'Fomento', desc: 'crédito & reestruturação' },
  { label: 'Gestão', desc: 'governança & controles' },
]

export default function BrandFooter() {
  const year = new Date().getFullYear()
  return (
    <footer
      className="mt-12 pt-8 pb-6 border-t border-aletis-cream-escuro/60"
      aria-label="Rodapé ALETIS"
    >
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-8 items-start">
        {/* Coluna 1 — assinatura */}
        <div className="space-y-3">
          <BrandMark variant="full" tone="verde" size={36} />
          <p className="max-w-xs text-[12px] font-body leading-relaxed text-aletis-verde-medio">
            Verdade nos números. Prosperidade nos acordos. Plataforma agro-financeira
            que une dados públicos, inteligência de mercado e execução real para
            consultores rurais.
          </p>
        </div>

        {/* Coluna 2 — pilares de serviço */}
        <div className="lg:pl-8">
          <p className="eyebrow mb-3 inline-flex items-center gap-2">
            <Sparkles size={11} />
            Pilares de serviço
          </p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {TAGLINE_PILARES.map((p) => (
              <li key={p.label} className="flex items-baseline gap-2">
                <span className="font-display font-semibold text-[12.5px] tracking-[0.08em] uppercase text-aletis-verde">
                  {p.label}
                </span>
                <span className="font-body text-[11.5px] text-aletis-verde-medio leading-tight">
                  {p.desc}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Coluna 3 — selo + copyright */}
        <div className="lg:text-right space-y-2 lg:min-w-[220px]">
          <span className="section-chip-gold">
            Identidade Visual oficial
          </span>
          <p className="font-body text-[11px] text-aletis-verde-medio leading-relaxed">
            © {year} ALETIS Soluções
            <br />
            Finanças Estratégicas &amp; Agrobusiness
          </p>
          <p className="font-mono text-[10px] text-aletis-verde-claro/80 tracking-wide">
            v0.1 · sistema interno
          </p>
        </div>
      </div>
    </footer>
  )
}

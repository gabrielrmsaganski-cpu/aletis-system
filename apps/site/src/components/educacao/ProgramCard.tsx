import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export interface ProgramCardData {
  href: string
  nome: string
  sigla?: string
  publicoAlvo: string
  taxaResumo: string
  finalidades: string[]
  cor?: 'verde' | 'gold' | 'sage'
}

const corMap: Record<NonNullable<ProgramCardData['cor']>, string> = {
  verde: 'bg-aletis-verde text-aletis-cream',
  gold: 'bg-aletis-gold text-aletis-verde',
  sage: 'bg-aletis-sage text-aletis-verde',
}

export function ProgramCard({ data }: { data: ProgramCardData }) {
  return (
    <Link
      href={data.href}
      className="group flex h-full flex-col rounded-xl border border-aletis-verde/15 bg-white p-6 transition hover:border-aletis-gold hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        {data.sigla && (
          <span
            className={`inline-flex h-12 min-w-[3rem] flex-shrink-0 items-center justify-center rounded-lg px-2 font-display text-[12px] font-bold uppercase tracking-wider2 ${
              corMap[data.cor || 'verde']
            }`}
          >
            {data.sigla}
          </span>
        )}
        <div>
          <h3 className="font-display text-[17px] font-semibold leading-tight text-aletis-verde">
            {data.nome}
          </h3>
          <p className="mt-0.5 text-[12px] text-aletis-verde/60">{data.publicoAlvo}</p>
        </div>
      </div>

      <p className="mt-4 font-mono text-[13px] font-semibold text-aletis-gold-escuro">
        {data.taxaResumo}
      </p>

      <ul className="mt-3 flex-1 space-y-1 text-[12.5px] text-aletis-verde/75">
        {data.finalidades.slice(0, 4).map((f) => (
          <li key={f} className="flex items-start gap-1.5">
            <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-aletis-gold" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <span className="mt-4 inline-flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-wider2 text-aletis-gold">
        Ver detalhes <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

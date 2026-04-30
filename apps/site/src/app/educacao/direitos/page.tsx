import type { Metadata } from 'next'
import Link from 'next/link'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, Strong, Callout } from '@/components/educacao/Prose'
import { ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Direitos do produtor rural · Educação ALETIS',
  description: 'Superendividamento (Lei 14.181/21), impenhorabilidade da pequena propriedade rural, súmulas STJ favoráveis, CAR/ITR/IRPF.',
  alternates: { canonical: 'https://aletis.com.br/educacao/direitos' },
}

const items = [
  {
    href: '/educacao/direitos/superendividamento',
    nome: 'Superendividamento (Lei 14.181/21)',
    desc: 'Direito previsto desde 2021 — repactuação coletiva de dívidas com preservação do mínimo existencial. Aplicável ao produtor PF.',
  },
  {
    href: '/educacao/direitos/impenhorabilidade-rural',
    nome: 'Impenhorabilidade da pequena propriedade rural',
    desc: 'Constituição art. 5º XXVI + Lei 8.009/90: a pequena propriedade trabalhada pela família é impenhorável. Como comprovar.',
  },
  {
    href: '/educacao/direitos/sumulas-stj',
    nome: 'Súmulas STJ que favorecem o produtor',
    desc: 'Listagem prática das súmulas estabilizadas: CDC aplica-se a banco, capitalização exige cláusula expressa, comissão de permanência não cumula.',
  },
  {
    href: '/educacao/direitos/car-itr-irpf',
    nome: 'CAR, ITR e IRPF — obrigações que protegem',
    desc: 'O cumprimento das três principais obrigações abre acesso a crédito, defende em execução e prova boa-fé em renegociação.',
  },
]

export default function DireitosIndex() {
  return (
    <EduLayout
      titulo="Direitos do produtor rural"
      subtitulo="O produtor rural tem proteções legais que muitos consultores e advogados desconhecem. Saber exercer cada uma muda o equilíbrio da mesa."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Direitos' },
      ]}
      prev={{ label: 'Renegociação', href: '/educacao/renegociacao' }}
      next={{ label: 'Superendividamento', href: '/educacao/direitos/superendividamento' }}
      fontes={[
        { label: 'CF/88 — art. 5º XXVI', href: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm' },
        { label: 'Lei 8.009/1990 — impenhorabilidade', href: 'https://www.planalto.gov.br/ccivil_03/leis/l8009.htm' },
        { label: 'Lei 14.181/2021 — superendividamento', href: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14181.htm' },
      ]}
    >
      <Lead>
        Quatro proteções consolidadas. A maioria dos produtores em estresse financeiro nunca acionou nenhuma delas — porque não sabe que existem ou porque o credor se cala. Aqui está o mapa.
      </Lead>

      <Callout tone="info" title="Princípio orientador">
        Direitos do produtor rural não são "manhas processuais". São <Strong>ferramentas legais</Strong> previstas em lei e jurisprudência consolidada. Usá-las bem é fazer a mesa de negociação ficar honesta.
      </Callout>

      <div className="my-10 grid gap-4">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="group flex flex-col rounded-xl border border-aletis-verde/15 bg-white p-6 transition hover:border-aletis-gold hover:shadow-md"
          >
            <h3 className="font-display text-[18px] font-semibold text-aletis-verde">{it.nome}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-aletis-verde/80">{it.desc}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-wider2 text-aletis-gold">
              Ver detalhe <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </EduLayout>
  )
}

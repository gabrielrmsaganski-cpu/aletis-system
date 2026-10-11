import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { PageHeader } from '@/components/ui/PageHeader'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { ButtonLink } from '@/components/ui/Button'
import {
  ArrowRight,
  BookOpen,
  Tractor,
  Banknote,
  ScrollText,
  Scale,
  ShieldCheck,
  FileSignature,
  GitCompare,
} from 'lucide-react'
import { eduTree } from '@/components/educacao/eduTree'

export const metadata: Metadata = {
  title: 'Educação ALETIS — entenda crédito rural, programas e seus direitos',
  description:
    'A enciclopédia prática do produtor rural: crédito rural, Plano Safra, Pronaf, Pronamp, CPR, LCA, Fiagro, renegociação PGFN, superendividamento e seus direitos. Atualizado conforme Plano Safra 2025/26 e atualizações abril/2026.',
  alternates: { canonical: 'https://aletis.com.br/educacao' },
}

const ICONS: Record<string, typeof Tractor> = {
  '/educacao/credito-rural': Tractor,
  '/educacao/programas': Banknote,
  '/educacao/instrumentos': ScrollText,
  '/educacao/renegociacao': Scale,
  '/educacao/direitos': ShieldCheck,
  '/educacao/contrato': FileSignature,
  '/educacao/comparativos': GitCompare,
}

const NUMEROS = [
  { valor: 'R$ 516,2 bi', label: 'Plano Safra 2025/26 — recurso total' },
  { valor: 'R$ 600 bi+', label: 'Plano Safra 2026/27 — projeção (Mapa, abr/26)' },
  { valor: '8,3 %', label: 'inadimplência rural mar/26 (Mapa)' },
  { valor: '55,3 %', label: 'do Plano Safra 25/26 desembolsado até fev/26' },
]

export default function EducacaoIndex() {
  return (
    <>
      <PageHeader
        eyebrow="Educação ALETIS"
        titulo={
          <>
            A enciclopédia prática
            <br />
            do <span className="text-aletis-gold">financeiro agro</span>
          </>
        }
        subtitulo="Crédito rural, programas oficiais, instrumentos do mercado, renegociação, direitos e anatomia de contratos — tudo o que o produtor precisa para decidir com clareza e sem dialeto bancário."
        breadcrumbs={[{ label: 'Início', href: '/' }, { label: 'Educação' }]}
      />

      <Section tone="marfim" compact>
        <Container>
          <Reveal>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {NUMEROS.map((n) => (
                <div
                  key={n.label}
                  className="rounded-lg border border-aletis-verde/15 bg-white p-5"
                >
                  <p className="font-display text-[24px] font-semibold text-aletis-verde md:text-[28px]">
                    {n.valor}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-aletis-verde/65">
                    {n.label}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-aletis-verde/60">
              Fontes: Mapa, Faesp, agências de imprensa especializadas — última atualização abril/2026.
            </p>
          </Reveal>
        </Container>
      </Section>

      <Section tone="cream">
        <Container>
          <Reveal>
            <Eyebrow>Mapa da Educação</Eyebrow>
            <h2 className="mt-3 max-w-3xl font-display text-[28px] font-semibold text-aletis-verde md:text-[36px]">
              Sete eixos. Tudo o que pesa no caixa do produtor — explicado.
            </h2>
            <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-aletis-verde/80">
              Cada eixo abre em páginas curtas, com tabelas, exemplos numéricos e referência legal direta. Sem texto jurídico opaco, com explicação que cabe na conversa de gestão.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {eduTree.map((node, idx) => {
              const Icon = ICONS[node.href] || BookOpen
              return (
                <Reveal key={node.href} delay={idx * 60}>
                  <Link
                    href={node.href}
                    className="group flex h-full flex-col rounded-xl border border-aletis-verde/15 bg-white p-7 transition hover:border-aletis-gold hover:shadow-md"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-aletis-verde text-aletis-cream transition group-hover:bg-aletis-gold group-hover:text-aletis-verde">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-[18px] font-semibold text-aletis-verde">
                      {node.label.replace(/^\d+\. /, '')}
                    </h3>
                    {node.desc && (
                      <p className="mt-2 flex-1 text-[14px] leading-relaxed text-aletis-verde/75">
                        {node.desc}
                      </p>
                    )}
                    {node.children && node.children.length > 0 && (
                      <ul className="mt-4 space-y-1.5 text-[12.5px] text-aletis-verde/70">
                        {node.children.slice(0, 4).map((c) => (
                          <li key={c.href} className="flex items-start gap-1.5">
                            <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-aletis-gold" />
                            <span>{c.label}</span>
                          </li>
                        ))}
                        {node.children.length > 4 && (
                          <li className="text-aletis-verde/55">
                            + {node.children.length - 4} tópicos…
                          </li>
                        )}
                      </ul>
                    )}
                    <span className="mt-5 inline-flex items-center gap-1.5 font-display text-[12px] font-semibold uppercase tracking-wider2 text-aletis-gold">
                      Abrir eixo <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </Reveal>
              )
            })}
          </div>
        </Container>
      </Section>

      <Section tone="escuro">
        <Container>
          <div className="grid gap-10 md:grid-cols-[2fr_1fr] md:items-center">
            <Reveal>
              <Eyebrow light>ALETIS</Eyebrow>
              <h2 className="mt-3 font-display text-[28px] font-semibold text-aletis-cream md:text-[36px]">
                Educação é o ponto de partida.<br />
                <span className="text-aletis-gold">Decisão informada</span>{' '}
                exige método do seu lado.
              </h2>
              <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-aletis-cream/85">
                Aprender o que é DSCR, CPR ou transação tributária resolve metade do problema. A outra metade é traduzir o cenário do seu balanço em uma decisão concreta — repactuação, captação, transação ou litígio. É o que a ALETIS faz.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/contato" variant="primary">
                  Conversar com a ALETIS
                </ButtonLink>
                <ButtonLink href="/calculadoras" variant="ghost">
                  Abrir calculadoras
                </ButtonLink>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="rounded-xl border border-aletis-sage/20 bg-white/5 p-6 backdrop-blur">
                <p className="font-display text-[12px] font-semibold uppercase tracking-wider2 text-aletis-gold">
                  Atualizado em abril/2026
                </p>
                <p className="mt-3 text-[14px] leading-relaxed text-aletis-cream/85">
                  Conteúdo aderente ao Plano Safra 2025/26 (Resolução CMN 5.234/2025), Lei do Agro 2 (14.421/22), Edital PGFN/PGDAU 11/2025 (prazo até 29-mai-2026), Lei 14.181/21 (superendividamento) e jurisprudência atual do STJ.
                </p>
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, Strong, Callout } from '@/components/educacao/Prose'
import { ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Renegociação de dívida — guia completo · Educação ALETIS',
  description: 'PGFN transação, Edital 11/2025, prorrogação rural, Refis, abusividade e execução fiscal. O que existe, quem pode aderir, qual o desconto.',
  alternates: { canonical: 'https://aletis.com.br/educacao/renegociacao' },
}

const items = [
  {
    href: '/educacao/renegociacao/pgfn-transacao',
    nome: 'Transação tributária PGFN',
    desc: 'Edital PGDAU 11/2025 (prorrogado até 29-mai-2026): descontos até 65%, parcelamento em até 145 meses, dívidas até R$ 45 mi.',
    chip: 'ATIVO até mai/2026',
  },
  {
    href: '/educacao/renegociacao/prorrogacao-rural',
    nome: 'Prorrogação rural (MCR)',
    desc: 'Direito previsto no Manual de Crédito Rural — prorrogação automática em caso de evento climático ou queda generalizada de preço.',
    chip: 'DIREITO LEGAL',
  },
  {
    href: '/educacao/renegociacao/refis-historico',
    nome: 'Refis e programas históricos',
    desc: 'Refis Rural, PRR (Lei 13.606/18), Pesa, Securitização. O que ainda está aberto e o que valeu enquanto valeu.',
    chip: 'HISTÓRICO',
  },
  {
    href: '/educacao/renegociacao/abusividade',
    nome: 'Cobrança abusiva — como reagir',
    desc: 'Anatocismo, capitalização ilegal, encargos abusivos, comissão de permanência. As teses que viraram lei e jurisprudência.',
    chip: 'JURISPRUDÊNCIA',
  },
  {
    href: '/educacao/renegociacao/executivo-fiscal',
    nome: 'Execução fiscal e judicial',
    desc: 'Quando o banco/PGFN ajuíza, o que fazer no prazo de 5 dias, embargos, exceção de pré-executividade.',
    chip: 'PROCESSUAL',
  },
]

export default function RenegociacaoIndex() {
  return (
    <EduLayout
      titulo="Renegociação de dívida — guia completo"
      subtitulo="Cinco caminhos. Saber qual cabe ao seu caso é metade do problema. A outra é executar antes que o credor execute primeiro."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Renegociação' },
      ]}
      prev={{ label: 'Instrumentos', href: '/educacao/instrumentos' }}
      next={{ label: 'PGFN — transação', href: '/educacao/renegociacao/pgfn-transacao' }}
      fontes={[
        { label: 'PGFN — Editais ativos', href: 'https://www.gov.br/pgfn/pt-br/assuntos/noticias' },
        { label: 'Banco Central — MCR §6º', href: 'https://www3.bcb.gov.br/mcr' },
        { label: 'STJ — pesquisa de jurisprudência', href: 'https://scon.stj.jus.br/SCON/' },
      ]}
    >
      <Lead>
        <Strong>8,3% da população rural brasileira está inadimplente</Strong> em mar/26 (Mapa). É o nível mais alto desde 2017. Selic alta, custos elevados, quebra de soja — combinou tudo. Ao mesmo tempo, nunca houve tantos caminhos abertos para renegociar dívida tributária e financeira. O guia abaixo mostra cada um.
      </Lead>

      <H2 id="diagnostico">Diagnóstico antes de qualquer movimento</H2>
      <P>
        Antes de aderir a qualquer programa, o produtor precisa saber:
      </P>
      <Callout tone="info" title="Checklist mínimo">
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>Qual o saldo devedor consolidado, por credor, com encargos atualizados?</li>
          <li>Qual a natureza da dívida — bancária (Custeio/Investimento), tributária (PGFN/Receita) ou comercial (CPR/barter/fornecedor)?</li>
          <li>Há ação judicial em curso? Em qual fase?</li>
          <li>Qual é a capacidade real de pagamento (DSCR projetado das próximas 3 safras)?</li>
          <li>Existe ativo livre de garantia?</li>
        </ol>
        Sem essas 5 respostas, qualquer adesão a programa de renegociação é apostar no escuro.
      </Callout>

      <div className="my-10 grid gap-4">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="group flex flex-col rounded-xl border border-aletis-verde/15 bg-white p-6 transition hover:border-aletis-gold hover:shadow-md"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-[18px] font-semibold text-aletis-verde">
                {it.nome}
              </h3>
              <span className="font-display text-[10px] font-semibold uppercase tracking-wider2 text-aletis-gold-escuro">
                {it.chip}
              </span>
            </div>
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

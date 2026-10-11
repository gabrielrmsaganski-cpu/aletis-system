import type { Metadata } from 'next'
import Link from 'next/link'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, Strong, Callout, Table } from '@/components/educacao/Prose'
import { ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Instrumentos financeiros do agronegócio · Educação ALETIS',
  description: 'CPR, CDA/WA, LCA, Fiagro, CRA e Barter: como o produtor capta fora do banco oficial usando o mercado privado.',
  alternates: { canonical: 'https://aletis.com.br/educacao/instrumentos' },
}

const items = [
  {
    href: '/educacao/instrumentos/cpr',
    nome: 'CPR — Cédula de Produto Rural',
    desc: 'O título de crédito do agro. Promete entregar produto futuro (CPR Física) ou pagar valor (CPR Financeira). Lei 8.929/94, modernizada pela Lei 13.986/20 (Lei do Agro) e Lei 14.421/22 (Lei do Agro 2).',
    quando: 'Captação privada antes/durante a safra. Lastro para Fiagro, FIDC, trader, fornecedor de insumo.',
  },
  {
    href: '/educacao/instrumentos/cda-wa',
    nome: 'CDA/WA — Certificado de Depósito Agropecuário e Warrant',
    desc: 'Dois títulos emitidos juntos por armazém certificado MAPA. CDA = título de propriedade do produto depositado; WA = penhor. Quem comprou o CDA é dono; quem aceitou o WA financiou.',
    quando: 'Quando você tem produto colhido em armazém certificado e quer usar como lastro de financiamento — sem vender.',
  },
  {
    href: '/educacao/instrumentos/lca',
    nome: 'LCA — Letra de Crédito do Agronegócio',
    desc: 'Título emitido por banco para captar do investidor. Lastreado em operações de crédito agro. Isento de IR para PF — virou paraíso de captação para banco e fonte de funding barata para o agro.',
    quando: 'Indireto: a LCA é o que financia parte expressiva do crédito rural controlado. Para o produtor, virou via principal de funding bancário.',
  },
  {
    href: '/educacao/instrumentos/fiagro',
    nome: 'Fiagro — Fundo de Investimento nas Cadeias Produtivas Agroindustriais',
    desc: 'Lei 14.130/21. Fundo regulado pela CVM que investe em direitos creditórios, imóveis rurais ou ações de empresas agro. Permite o investidor financiar o agro com benefício tributário e o produtor captar via título.',
    quando: 'Captação de médio porte (R$ 5-100 mi) — alternativa ao Pronamp/BNDES quando volume excede teto ou quando produtor quer prazo/condição customizada.',
  },
  {
    href: '/educacao/instrumentos/cra',
    nome: 'CRA — Certificado de Recebíveis do Agronegócio',
    desc: 'Securitização: empresa gestora compra os recebíveis do produtor (CPRs, contratos) e emite CRA para investidores. CRA é o "atacado" do mercado de capitais agro.',
    quando: 'Para volumes grandes (R$ 50 mi+) e produtor com estrutura — normalmente cooperativas, integradoras e grandes fazendas.',
  },
  {
    href: '/educacao/instrumentos/barter',
    nome: 'Barter — troca de insumos por safra',
    desc: 'Operação de escambo modernizada: trader/fornecedor entrega insumos hoje; produtor entrega sacas na colheita pelo preço contratado (com indexador). Não é "crédito" — é compra a prazo com lastro físico.',
    quando: 'Quando a relação é direta com a trader/fornecedor e o produtor prefere fixar custo + preço de uma vez. Atenção: contraparte normalmente é a CPR Física.',
  },
]

export default function Instrumentos() {
  return (
    <EduLayout
      titulo="Instrumentos financeiros do agronegócio"
      subtitulo="Como o produtor capta fora do banco oficial. O mercado privado de crédito agro é maior do que parece — e cresce 30-40% ao ano."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Instrumentos' },
      ]}
      prev={{ label: 'Programas', href: '/educacao/programas' }}
      next={{ label: 'CPR', href: '/educacao/instrumentos/cpr' }}
      fontes={[
        { label: 'Lei 8.929/94 — CPR (consolidada)', href: 'https://www.planalto.gov.br/ccivil_03/leis/l8929.htm' },
        { label: 'Lei 13.986/2020 — Lei do Agro', href: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/L13986.htm' },
        { label: 'Lei 14.421/2022 — Lei do Agro 2', href: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/L14421.htm' },
        { label: 'Lei 14.130/21 — Fiagro', href: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/L14130.htm' },
      ]}
    >
      <Lead>
        Hoje, <Strong>40% do funding do agro brasileiro vem do mercado privado</Strong> (CPR, LCA, Fiagro, CRA), não do banco oficial. Em 2024 a B3 registrou crescimento de <Strong>39% no volume de CPRs emitidas</Strong>. Saber operar esses instrumentos é o que separa o produtor que toma R$ 5 mi/ano de quem toma R$ 50 mi.
      </Lead>

      <H2 id="comparativo">Visão comparativa</H2>
      <Table
        caption="Os 6 instrumentos lado a lado"
        headers={['Instrumento', 'Quem emite', 'Quem compra', 'Volume típico']}
        rows={[
          ['CPR Financeira', 'Produtor / cooperativa', 'Fiagro, trader, FIDC, banco', 'R$ 50k a R$ 100 mi'],
          ['CPR Física', 'Produtor / cooperativa', 'Trader, indústria, exportador', 'R$ 100k a R$ 200 mi'],
          ['CDA/WA', 'Armazém certificado MAPA', 'Banco, Fiagro, investidor', 'R$ 1 mi a R$ 50 mi'],
          ['LCA', 'Banco', 'Investidor PF/PJ', 'R$ 1k a R$ ilimitado'],
          ['Fiagro (cota)', 'Gestora regulada CVM', 'Investidor qualificado/PF', 'R$ 100 a R$ ilimitado'],
          ['CRA', 'Securitizadora', 'Investidor qualificado', 'R$ 50 mi a R$ 1 bi'],
          ['Barter', 'Produtor (CPR Física)', 'Trader / fornecedor de insumo', 'R$ 100k a R$ 50 mi'],
        ]}
      />

      <Callout tone="info" title="Onde mora o ouro">
        A maioria dos produtores conhece e usa apenas <Strong>CPR Física e Barter</Strong>. Os 4 instrumentos restantes (Financeira, CDA/WA, Fiagro, CRA) abrem captação <Strong>2 a 4 pontos mais barata</Strong> e prazo melhor — mas exigem estrutura: balanço auditado (mesmo que simplificado), CAR ativo, armazém certificado, governança. É a fronteira que a ALETIS ajuda a cruzar.
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
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-aletis-gold transition group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-aletis-verde/80">{it.desc}</p>
            <p className="mt-3 text-[12.5px] text-aletis-verde/65">
              <span className="font-display text-[11px] font-semibold uppercase tracking-wider2 text-aletis-gold-escuro">
                Quando usar:
              </span>{' '}
              {it.quando}
            </p>
          </Link>
        ))}
      </div>
    </EduLayout>
  )
}

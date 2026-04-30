import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'LCA — Letra de Crédito do Agronegócio · Educação ALETIS',
  description: 'LCA: como o banco capta do investidor (isento de IR) para irrigar o crédito rural — e por que isso impacta a taxa que você paga.',
  alternates: { canonical: 'https://aletis.com.br/educacao/instrumentos/lca' },
}

export default function LCAPage() {
  return (
    <EduLayout
      titulo="LCA — Letra de Crédito do Agronegócio"
      subtitulo="Quem financia o agro brasileiro? Em grande parte, o investidor de varejo via LCA. Entender o instrumento explica por que sua taxa é o que é."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Instrumentos', href: '/educacao/instrumentos' },
        { label: 'LCA' },
      ]}
      prev={{ label: 'CDA/WA', href: '/educacao/instrumentos/cda-wa' }}
      next={{ label: 'Fiagro', href: '/educacao/instrumentos/fiagro' }}
      fontes={[
        { label: 'Lei 11.076/2004 — LCA', href: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11.076.htm' },
        { label: 'Resolução CMN 4.967/2021', href: 'https://www.bcb.gov.br/estabilidadefinanceira/buscanormas' },
      ]}
    >
      <Lead>
        A <Strong>LCA</Strong> não é um instrumento que o produtor emite. É como o <Strong>banco capta dinheiro do investidor</Strong> — e como esse dinheiro chega ao produtor por baixo da forma de crédito rural. É a "tubulação" oculta do financiamento agro.
      </Lead>

      <H2 id="como-funciona">Como funciona</H2>
      <P>
        O banco emite uma <Strong>Letra de Crédito do Agronegócio</Strong>: um título que paga juros ao investidor, lastreado em <Strong>operações de crédito rural já contratadas</Strong>. O investidor (PF ou PJ) compra a LCA, e o banco usa esses recursos para originar mais crédito rural.
      </P>
      <P>
        Para o investidor PF, a LCA tem um benefício gigante: <Strong>isenção de Imposto de Renda</Strong>. Para a mesma rentabilidade líquida, ele aceita uma taxa nominal menor — o que reduz o custo de captação do banco e, em tese, o custo do crédito ao produtor.
      </P>

      <H2 id="impacto">Por que isso importa para você, produtor</H2>
      <UL>
        <LI>Os recursos LCA são <Strong>uma das principais fontes</Strong> dos R$ 516 bi do Plano Safra 2025/26. Quando o estoque de LCA cresce, sobra crédito; quando cai, fila aparece.</LI>
        <LI>A <Strong>taxa do crédito rural livre</Strong> (recursos não-controlados) reflete o custo da LCA + spread + IOF + risco. Subiu LCA → subiu seu juro.</LI>
        <LI>Em 2024, o CMN restringiu o lastro elegível para LCA (Resolução 5.118/24) — restrição que aperteu o funding e contribuiu para a alta de taxas em 2025/26.</LI>
      </UL>

      <H2 id="produtor-pode">O produtor pode comprar LCA?</H2>
      <P>
        Sim — e em muitos casos é a melhor aplicação para o caixa de tesouraria do produtor (PF ou PJ). LCA isenta de IR, com lastro real no agro brasileiro, costuma render 95-110% do CDI líquido.{' '}
        <Strong>Para o produtor com excedente de caixa em conta-corrente, é a aplicação default.</Strong>
      </P>

      <Callout tone="tip" title="Vínculo cruzado">
        Banco que vende LCA precisa originar crédito rural. Se você é cliente importante e cliente investidor (compra LCA), a relação ganha um poder extra de negociação — bancos valorizam quem ajuda nas duas pontas.
      </Callout>

      <H2 id="riscos">Riscos para o investidor PF</H2>
      <UL>
        <LI><Strong>FGC cobre até R$ 250 mil</Strong> por banco/CPF. Acima disso, é risco do banco emissor.</LI>
        <LI>LCA tem <Strong>prazo mínimo</Strong> (90 dias após Resolução 5.118/24). Não é liquidez D+0.</LI>
        <LI>Em ambiente de queda de juros, o investidor pode lamentar ter travado prazo longo.</LI>
      </UL>

      <FAQ
        items={[
          {
            q: 'LCA é a mesma coisa que CRA?',
            a: 'Não. LCA é emitida por banco; CRA por securitizadora. LCA é mais simples e mais comum no varejo; CRA é mais sofisticada e típica em volumes maiores. Investidor de varejo costuma misturar as duas.',
          },
          {
            q: 'O Banco do Brasil oferece LCA?',
            a: 'Oferece, e os principais grandes bancos (BB, Itaú, Santander, Bradesco, Caixa) têm produtos competitivos. Cooperativas (Sicredi, Sicoob) também — em condições muitas vezes melhores que os grandes.',
          },
        ]}
      />
    </EduLayout>
  )
}

import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, Quote, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Cobrança abusiva — como reagir · Educação ALETIS',
  description: 'Anatocismo, capitalização ilegal, comissão de permanência, encargos abusivos. As teses jurisprudenciais que defendem o produtor.',
  alternates: { canonical: 'https://aletis.com.br/educacao/renegociacao/abusividade' },
}

export default function Abusividade() {
  return (
    <EduLayout
      titulo="Cobrança abusiva — como reagir"
      subtitulo="Os limites da execução bancária. O que jurisprudência consolidada do STJ permite revisar — e o que não permite mais."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Renegociação', href: '/educacao/renegociacao' },
        { label: 'Abusividade' },
      ]}
      prev={{ label: 'Refis e históricos', href: '/educacao/renegociacao/refis-historico' }}
      next={{ label: 'Execução fiscal', href: '/educacao/renegociacao/executivo-fiscal' }}
      fontes={[
        { label: 'STJ — Tema 247 (anatocismo)', href: 'https://scon.stj.jus.br/SCON/' },
        { label: 'Súmula 596 STJ', href: 'https://scon.stj.jus.br/SCON/' },
        { label: 'Súmula 472 STJ — comissão de permanência', href: 'https://scon.stj.jus.br/SCON/' },
        { label: 'CDC — Lei 8.078/90', href: 'https://www.planalto.gov.br/ccivil_03/leis/l8078.htm' },
      ]}
    >
      <Lead>
        Nem toda taxa alta é abusiva. Mas há um conjunto bem definido de práticas que <Strong>jurisprudência consolidada do STJ considera ilegais</Strong> — anatocismo sem previsão, comissão de permanência cumulada, encargos não pactuados. Saber o que é defensável muda o jogo da renegociação.
      </Lead>

      <H2 id="o-que-nao-e">O que NÃO é abusividade</H2>
      <Callout tone="info" title="Súmula 596 STJ — o muro intransponível">
        <Quote source="Súmula 596 STJ">
          As disposições do Decreto 22.626/1933 não se aplicam às taxas de juros e aos demais encargos cobrados nas operações realizadas por instituições públicas ou privadas, integrantes do Sistema Financeiro Nacional.
        </Quote>
      </Callout>
      <UL>
        <LI><Strong>Taxa acima de 12% a.a.</Strong> em operação bancária — não é abusiva por si só. Lei da Usura não se aplica a banco.</LI>
        <LI><Strong>Taxa contratada acima da média do mercado</Strong> — a banca julga caso a caso, mas só decide pela revisão se a diferença for "extraordinariamente discrepante".</LI>
        <LI><Strong>IOF, tarifa de cadastro, taxa de avaliação</Strong> — quando previstos no contrato e dentro de tabela do banco, são válidos.</LI>
      </UL>

      <H2 id="o-que-e">O que É abusividade — teses ainda vivas</H2>

      <H2 id="anatocismo">Anatocismo (juros sobre juros)</H2>
      <P>
        A <Strong>capitalização mensal de juros</Strong> só é válida se <Strong>expressamente prevista</Strong> no contrato (STJ Tema 247). Quando o contrato é silente ou prevê apenas "capitalização anual" mas o cálculo é mensal → anatocismo ilegal, valor cobrado a mais é repetível.
      </P>
      <Callout tone="ok" title="Como identificar">
        Compare a parcela cobrada com a parcela calculada por planilha sem capitalização. Se houver diferença sistemática de 5-15% em um contrato silente sobre capitalização, há tese de revisão.
      </Callout>

      <H2 id="comissao-permanencia">Comissão de permanência cumulada</H2>
      <P>
        A <Strong>Súmula 472 STJ</Strong> proíbe a cumulação da comissão de permanência com outros encargos (correção monetária, juros remuneratórios, multa, juros moratórios). A "comissão de permanência" é o encargo do período de inadimplência — substitui os demais, não soma.
      </P>
      <Quote source="Súmula 472 STJ">
        A cobrança de comissão de permanência — cujo valor não pode ultrapassar a soma dos encargos remuneratórios e moratórios previstos no contrato — exclui a exigibilidade dos juros remuneratórios, moratórios e da multa contratual.
      </Quote>

      <H2 id="encargos-nao-pactuados">Encargos não pactuados</H2>
      <UL>
        <LI><Strong>"Despesas administrativas"</Strong> não previstas no contrato.</LI>
        <LI><Strong>Tarifas de "manutenção"</Strong> sem clausula expressa.</LI>
        <LI><Strong>"Cesta de tarifas"</Strong> aplicada a operação rural sem adesão formal.</LI>
      </UL>
      <P>
        Tudo que não está no contrato — não pode ser cobrado. Se foi cobrado, é repetível em dobro (CDC art. 42 §único).
      </P>

      <H2 id="venda-casada">Venda casada</H2>
      <P>
        Banco que <Strong>vincula aprovação de Custeio à compra de seguro de vida, capitalização ou consórcio</Strong> comete venda casada (CDC art. 39 I). Tese estável no STJ. Operação fica imune e o produto vendido em casamento pode ser anulado.
      </P>

      <H2 id="cdc">CDC se aplica?</H2>
      <P>
        Sim — produtor rural <Strong>é consumidor</Strong> em operações bancárias por equiparação (Súmula 297 STJ: "O Código de Defesa do Consumidor é aplicável às instituições financeiras"). Isso abre espaço para inversão do ônus da prova, repetição de indébito em dobro e proteção a cláusulas abusivas (CDC art. 51).
      </P>

      <H2 id="quando-judicializar">Quando vale judicializar</H2>
      <UL>
        <LI><Strong>Volume relevante</Strong>: dívida acima de R$ 500 mil. Ação revisional bem instruída pode reduzir 15-40% do saldo.</LI>
        <LI><Strong>Cláusulas claramente ilegais</Strong>: comissão de permanência cumulada, capitalização não pactuada, encargo abusivo identificável.</LI>
        <LI><Strong>Banco recusa renegociar</Strong>: o ajuizamento muda o tom da conversa.</LI>
      </UL>
      <Callout tone="warn" title="Cuidado com perícia">
        Toda revisional bem-feita exige perícia contábil. Calcular o "valor justo" com base em tese de cálculo (capitalização anual, sem comissão, etc) leva 30-90 dias e custa entre R$ 5 mil e R$ 50 mil dependendo do volume. Vale para dívidas grandes, não para pequenas.
      </Callout>

      <FAQ
        items={[
          {
            q: 'Posso pedir revisão judicial do meu Custeio Pronamp?',
            a: 'Pode, mas Pronamp tem taxa fixa pactuada por norma CMN — pouca margem para revisão. O foco maior das revisionais é capital de giro livre, recurso livre e operações onde encargos foram aplicados sem clausula expressa.',
          },
          {
            q: 'Tese de "limitação a juros de 12% a.a." ainda vale?',
            a: 'Não. Foi superada pela Súmula 596 STJ desde 1976 e reafirmada repetidamente. Ação que pleiteia limitação genérica é improcedente.',
          },
          {
            q: 'Como saber se há abusividade no meu contrato?',
            a: 'A ALETIS faz diagnóstico de abusividade com base em planilha de evolução do contrato. Em 70% dos contratos analisados encontramos ao menos um ponto questionável — variando de 1% a 25% do saldo devedor. É um exame frio do contrato, não promessa.',
          },
        ]}
      />
    </EduLayout>
  )
}

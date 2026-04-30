import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, Quote, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Impenhorabilidade da pequena propriedade rural · Educação ALETIS',
  description: 'CF art. 5º XXVI + Lei 8.009/90: como comprovar pequena propriedade rural trabalhada pela família para protegê-la da execução.',
  alternates: { canonical: 'https://aletis.com.br/educacao/direitos/impenhorabilidade-rural' },
}

export default function Impenhorabilidade() {
  return (
    <EduLayout
      titulo="Impenhorabilidade da pequena propriedade rural"
      subtitulo="A propriedade trabalhada pela família é constitucionalmente protegida. Saber comprovar muda o desfecho de qualquer execução."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Direitos', href: '/educacao/direitos' },
        { label: 'Impenhorabilidade' },
      ]}
      prev={{ label: 'Superendividamento', href: '/educacao/direitos/superendividamento' }}
      next={{ label: 'Súmulas STJ', href: '/educacao/direitos/sumulas-stj' }}
      fontes={[
        { label: 'CF/88 art. 5º XXVI', href: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm' },
        { label: 'Lei 8.009/1990', href: 'https://www.planalto.gov.br/ccivil_03/leis/l8009.htm' },
        { label: 'Lei 8.629/93 — módulos fiscais', href: 'https://www.planalto.gov.br/ccivil_03/leis/l8629.htm' },
      ]}
    >
      <Lead>
        A Constituição protege uma faixa específica do agro brasileiro: a <Strong>pequena propriedade rural trabalhada pela família</Strong>. Bem dimensionada e bem comprovada, é impenhorável <Strong>até para dívidas decorrentes da própria atividade produtiva</Strong>. Quase ninguém usa.
      </Lead>

      <Quote source="CF/88 art. 5º XXVI">
        A pequena propriedade rural, assim definida em lei, desde que trabalhada pela família, não será objeto de penhora para pagamento de débitos decorrentes de sua atividade produtiva, dispondo a lei sobre os meios de financiar o seu desenvolvimento.
      </Quote>

      <H2 id="dois-requisitos">Os dois requisitos</H2>
      <UL>
        <LI><Strong>Pequena propriedade rural</Strong> — definida em lei (Lei 8.629/93 art. 4º II): até 4 módulos fiscais.</LI>
        <LI><Strong>Trabalhada pela família</Strong> — exploração predominantemente pelo grupo familiar, sem uso massivo de mão de obra contratada permanente.</LI>
      </UL>

      <H2 id="modulo-fiscal">O módulo fiscal varia por município</H2>
      <P>
        O módulo fiscal varia conforme o município (Lei 6.746/79). Vai de <Strong>5 ha</Strong> em municípios litorâneos densamente povoados (SP, RJ) até <Strong>110 ha</Strong> em fronteira agrícola (parte do MT, PA, RR). Saber o módulo fiscal do seu município é o primeiro passo. Consulta na <strong>tabela do INCRA</strong>.
      </P>

      <Callout tone="info" title="Exemplos práticos">
        <UL>
          <LI>Município PR com módulo fiscal de 18 ha → pequena propriedade vai até 72 ha.</LI>
          <LI>Município MT com módulo fiscal de 80 ha → pequena propriedade vai até 320 ha.</LI>
          <LI>Município litoral SP com módulo de 5 ha → pequena propriedade vai até 20 ha.</LI>
        </UL>
        Áreas grandes em regiões de fronteira (até 320 ha em MT, por exemplo) se enquadram tecnicamente como "pequena propriedade" — fato que muitos juízes desconhecem.
      </Callout>

      <H2 id="como-comprovar">Como comprovar o trabalho familiar</H2>
      <UL>
        <LI><Strong>CCIR</Strong> e <Strong>ITR</Strong> em nome do produtor.</LI>
        <LI><Strong>CAF / DAP</Strong> — Cadastro de Aptidão ao Pronaf — é a prova oficial mais forte de "agricultura familiar".</LI>
        <LI><Strong>Declaração da Emater/RS, Iapar, ATER</Strong> local sobre o caráter da exploração.</LI>
        <LI><Strong>Notas fiscais de produtor</Strong> em nome do titular.</LI>
        <LI><Strong>Folha de pagamento mínima</Strong> — máximo 2-3 empregados rurais; o resto é trabalho familiar.</LI>
        <LI><Strong>Inscrição estadual rural</Strong> em nome do titular.</LI>
      </UL>

      <H2 id="bem-de-familia">Bem de família — Lei 8.009/90</H2>
      <P>
        Mesmo propriedades acima de 4 módulos fiscais podem ser parcialmente protegidas como <Strong>bem de família</Strong>: a residência da família e o terreno em torno usado para subsistência ficam impenhoráveis (Lei 8.009/90), a menos que o débito seja <Strong>tributário da própria propriedade</Strong> (ITR, IPTU) ou <Strong>de financiamento da própria construção</Strong>.
      </P>

      <H2 id="como-arguir">Como arguir em juízo</H2>
      <UL>
        <LI>Por <Strong>embargos à penhora</Strong> ou <Strong>exceção de pré-executividade</Strong> (matéria de ordem pública).</LI>
        <LI>Documentação completa: matrícula, ITR, CCIR, CAF, IRPF.</LI>
        <LI>Indicar <Strong>bem alternativo</Strong> à penhora — facilita a aceitação.</LI>
      </UL>

      <FAQ
        items={[
          {
            q: 'Tenho 50 ha em município com módulo de 18 ha. Sou pequeno produtor?',
            a: 'Tecnicamente sim — sua área (50 ha) é menor que 4 módulos fiscais (72 ha). Se a exploração é familiar, você se enquadra na proteção do art. 5º XXVI da Constituição. Já há jurisprudência STJ favorável.',
          },
          {
            q: 'Banco pode penhorar minha propriedade pelo Custeio que não paguei?',
            a: 'Tese ativa — vários ministros do STJ já votaram pela impenhorabilidade até para dívida operacional do produtor familiar (REsp 1.751.781/RS). A jurisprudência ainda está em formação, mas a defesa é viável e tem ganhado.',
          },
          {
            q: 'Vale registrar o "bem de família" no cartório?',
            a: 'Sim — o registro voluntário (Lei 8.009/90) facilita a comprovação em juízo. Custo simbólico, proteção significativa. Faça antes de entrar em estresse financeiro — depois pode caracterizar fraude contra credor.',
          },
        ]}
      />
    </EduLayout>
  )
}

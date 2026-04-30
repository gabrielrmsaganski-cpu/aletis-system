import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, Table } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Refis e programas históricos · Educação ALETIS',
  description: 'Refis Rural, PRR, Pesa, Securitização Agrícola. Por que sumiram e qual a alternativa hoje.',
  alternates: { canonical: 'https://aletis.com.br/educacao/renegociacao/refis-historico' },
}

export default function RefisHistorico() {
  return (
    <EduLayout
      titulo="Refis e programas históricos — o que valeu, o que ainda vale"
      subtitulo="A linha do tempo das renegociações setoriais. Aprender com os programas passados é decidir melhor o que vem agora."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Renegociação', href: '/educacao/renegociacao' },
        { label: 'Refis e históricos' },
      ]}
      prev={{ label: 'Prorrogação rural', href: '/educacao/renegociacao/prorrogacao-rural' }}
      next={{ label: 'Abusividade', href: '/educacao/renegociacao/abusividade' }}
      fontes={[
        { label: 'Lei 9.964/00 — Refis I', href: 'https://www.planalto.gov.br/ccivil_03/leis/l9964.htm' },
        { label: 'Lei 11.941/09 — Refis "da crise"', href: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l11941.htm' },
        { label: 'Lei 13.606/18 — PRR', href: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13606.htm' },
        { label: 'Lei 13.988/20 — Transação tributária', href: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l13988.htm' },
      ]}
    >
      <Lead>
        Refis viveu uma era. Entre 2000 e 2017, foram <Strong>14 programas federais de parcelamento especial</Strong> — Refis I, PAES, PAEX, "Refis da Crise", "Refis da Copa", PRT, PERT, PRR, etc. Em 2020 a lógica mudou: o legislador trocou Refis por <Strong>transação tributária</Strong> (Lei 13.988/20). Os históricos importantes seguem ativos para quem aderiu — e a transação 2025/26 é o que hoje funciona.
      </Lead>

      <H2 id="linha-tempo">A linha do tempo dos Refis (federais)</H2>
      <Table
        caption="Os principais programas de renegociação tributária federal"
        headers={['Programa', 'Lei / Ano', 'Foco', 'Status hoje']}
        rows={[
          ['Refis I', 'Lei 9.964/00', 'Geral — débitos federais', 'Encerrado; quem aderiu segue pagando'],
          ['PAES', 'Lei 10.684/03', 'Parcelamento especial', 'Encerrado'],
          ['"Refis da Crise"', 'Lei 11.941/09', 'Pós-crise 2008', 'Quem aderiu segue pagando até 180 parcelas'],
          ['PRR — Programa de Regularização Rural', 'Lei 13.606/18', 'Funrural — produtor rural PF/PJ', 'Encerrado para novas adesões; quem aderiu segue ativo'],
          ['PERT', 'Lei 13.496/17', 'Programa Especial de Regularização Tributária', 'Encerrado'],
          ['Transação tributária (Lei 13.988/20)', '2020+', 'Substitui o modelo Refis', 'ATIVO — Edital 11/2025 aberto até mai/2026'],
        ]}
      />

      <H2 id="por-que-mudou">Por que o legislador trocou Refis por transação</H2>
      <UL>
        <LI><Strong>Refis era cíclico e amplo</Strong> — descontos generosos para todo mundo. Premiava quem não pagava e gerava risco moral.</LI>
        <LI><Strong>Transação é seletiva</Strong> — desconto vinculado à categoria do débito (probabilidade de recuperação). Quem tem patrimônio e capacidade paga próximo ao integral; quem não tem, recebe desconto cheio.</LI>
        <LI><Strong>Transação é permanente</Strong> — não depende de janela legislativa. Editais saem regularmente.</LI>
      </UL>

      <Callout tone="info" title="O que isso significa para o produtor hoje">
        Não há "Refis Rural" novo no horizonte. A regularização federal hoje passa, na prática, por:
        <UL>
          <LI><Strong>Transação PGFN</Strong> (Edital 11/2025 e sucessores) — a porta principal.</LI>
          <LI><Strong>PRR</Strong> de 2018 — quem aderiu na época, segue. Não há reabertura.</LI>
          <LI><Strong>Desenrola Rural</Strong> (Edital PGDAU 3/2025 — encerrado em jan/26) — episódio específico que não deve repetir tão cedo.</LI>
        </UL>
      </Callout>

      <H2 id="estado-pesa">E os programas estaduais (Pesa)?</H2>
      <P>
        O <Strong>Pesa — Programa Especial de Saneamento de Ativos</Strong> foi um modelo dos anos 90/2000 voltado para securitização da dívida rural. Hoje sobrevive em <Strong>versões pontuais nos estados</Strong> (PR, RS, MS principalmente) — moradias, parcelamentos especiais. Cada Secretaria de Fazenda estadual tem agenda própria. Vale verificar caso a caso quando há débito estadual (ICMS, ITR estadual rural).
      </P>

      <H2 id="dica">Dica prática</H2>
      <P>
        Não espere por "o próximo Refis salvar". Em 2026, a janela ativa é a <Strong>transação PGFN 11/2025 até 29-mai-2026</Strong>. Se você se enquadra, agir agora é melhor que esperar. Apostar em programa político futuro é apostar no escuro.
      </P>
    </EduLayout>
  )
}

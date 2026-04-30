import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, KV, Step, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Superendividamento — Lei 14.181/21 · Educação ALETIS',
  description: 'Como o produtor PF acessa a repactuação de dívidas pela Lei do Superendividamento. Mínimo existencial, plano de pagamento, processo judicial.',
  alternates: { canonical: 'https://aletis.com.br/educacao/direitos/superendividamento' },
}

export default function Superendividamento() {
  return (
    <EduLayout
      titulo="Superendividamento — Lei 14.181/21"
      subtitulo="Quando a soma das dívidas inviabiliza o mínimo existencial, a lei abre porta para repactuação coletiva. Aplicável ao produtor pessoa física."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Direitos', href: '/educacao/direitos' },
        { label: 'Superendividamento' },
      ]}
      prev={{ label: 'Direitos', href: '/educacao/direitos' }}
      next={{ label: 'Impenhorabilidade rural', href: '/educacao/direitos/impenhorabilidade-rural' }}
      fontes={[
        { label: 'Lei 14.181/2021', href: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14181.htm' },
        { label: 'CDC art. 54-A a 54-G', href: 'https://www.planalto.gov.br/ccivil_03/leis/l8078.htm' },
      ]}
    >
      <Lead>
        A <Strong>Lei 14.181/2021</Strong> — Lei do Superendividamento — alterou o CDC para criar um instrumento de <Strong>repactuação coletiva de dívidas de consumo</Strong> com preservação do mínimo existencial. Aplica-se ao produtor pessoa física quando a soma de obrigações compromete a subsistência da família.
      </Lead>

      <H2 id="conceito">O conceito</H2>
      <P>
        <Strong>Superendividamento</Strong> é a impossibilidade manifesta do consumidor pessoa física, de boa-fé, pagar a totalidade de suas dívidas de consumo, exigíveis e vincendas, <Strong>sem comprometer seu mínimo existencial</Strong> (CDC art. 54-A).
      </P>

      <H2 id="quem-pode">Quem pode acessar</H2>
      <UL>
        <LI><Strong>Pessoa física consumidora</Strong> — produtor PF entra (Súmula 297 STJ).</LI>
        <LI>De <Strong>boa-fé</Strong> — quem contraiu dívidas com intenção de não pagar é excluído.</LI>
        <LI>Dívidas de <Strong>consumo</Strong> — bancárias, financeiras, parcelamentos, cartões.</LI>
        <LI><Strong>Não cabe</Strong>: dívidas trabalhistas, alimentares, ilícitas (jogo, etc).</LI>
      </UL>

      <Callout tone="warn" title="O dilema do produtor PF">
        Discussão jurídica em curso: dívida agropecuária <Strong>operacional</Strong> (Custeio, Investimento) é dívida de consumo? STJ vem reconhecendo que sim, em vários julgados — afastando a antiga visão de que produtor seria "empresário" e não consumidor. A Súmula 297 reforça aplicação do CDC ao produtor PF em operações bancárias.
      </Callout>

      <H2 id="como-funciona">Como funciona o processo</H2>
      <Step n={1} title="Audiência conciliatória">
        Tribunal convoca <Strong>todos os credores</Strong> em audiência única. Devedor apresenta plano de pagamento de até 5 anos com preservação do mínimo existencial.
      </Step>
      <Step n={2} title="Plano aceito">
        Se credores aceitam o plano, vira homologação judicial. Devedor passa a pagar conforme plano, e os credores ficam impedidos de cobranças paralelas.
      </Step>
      <Step n={3} title="Plano rejeitado — fase compulsória">
        Se credores rejeitam, juiz impõe plano compulsório (até 5 anos). Cláusulas de juros excessivos podem ser revisadas, encargos moratórios reduzidos.
      </Step>
      <Step n={4} title="Cumprimento e quitação">
        Após cumprir o plano, dívidas restantes são consideradas extintas. Histórico negativo limpo após 5 anos.
      </Step>

      <H2 id="minimo-existencial">Mínimo existencial</H2>
      <P>
        Decreto 11.150/22 fixou o mínimo existencial em <Strong>25% do salário mínimo nacional</Strong>. Em 2026, com salário mínimo R$ 1.518, é R$ 379,50/mês de renda preservada — valor questionado por entidades de defesa do consumidor por ser muito baixo. STJ tem expandido em casos concretos, considerando custo de vida real, dependentes, doenças.
      </P>

      <H2 id="exemplo">Exemplo aplicado</H2>
      <KV
        items={[
          { k: 'Produtor', v: 'Sítio 18 ha em PR, renda mensal R$ 8.500 (líquido)' },
          { k: 'Família', v: 'Esposa + 2 filhos menores' },
          { k: 'Dívidas consumo', v: 'R$ 380 mil distribuídas em 7 credores (banco, cartão, financeira)' },
          { k: 'Parcelas mensais', v: 'R$ 9.200 — supera renda' },
          { k: 'Plano superendividamento', v: 'Renda preservada R$ 4.800/mês (mínimo existencial família + custeio essencial)' },
          { k: 'Saldo para credores', v: 'R$ 3.700/mês × 60 meses = R$ 222 mil' },
          { k: 'Saldo extinto', v: '~R$ 158 mil (40% das dívidas) — extintos pela lei' },
        ]}
      />

      <FAQ
        items={[
          {
            q: 'A Lei do Superendividamento alcança CPR e contratos rurais?',
            a: 'A jurisprudência ainda está em formação. Julgados recentes do STJ vêm aceitando, especialmente quando o produtor é pessoa física pequeno/médio sem CNPJ ativo. Para grandes produtores PJ a aplicação é mais restrita. A ALETIS analisa caso a caso.',
          },
          {
            q: 'O processo é caro?',
            a: 'Não. É gratuito para hipossuficientes (justiça gratuita) ou custas reduzidas. O Procon de cada estado é via complementar de mediação pré-judicial — ainda mais barato.',
          },
          {
            q: 'Tenho que ter CPF "limpo" antes de entrar?',
            a: 'Não. Pelo contrário — o procedimento existe justamente para devedor com CPF negativado e múltiplas dívidas. A inscrição é parte do diagnóstico de superendividamento.',
          },
        ]}
      />
    </EduLayout>
  )
}

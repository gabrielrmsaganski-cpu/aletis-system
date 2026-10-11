import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, H3, P, UL, LI, Strong, Callout, Table, KV, Step, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Transação tributária PGFN — Edital 11/2025 · Educação ALETIS',
  description: 'Como aderir à transação tributária da PGFN: descontos até 65%, parcelamento em 145 meses, dívidas até R$ 45 mi. Prazo até 29/mai/2026.',
  alternates: { canonical: 'https://aletis.com.br/educacao/renegociacao/pgfn-transacao' },
}

export default function PGFNTransacao() {
  return (
    <EduLayout
      titulo="Transação tributária PGFN — Edital PGDAU 11/2025"
      subtitulo="A maior janela de regularização tributária aberta em 2026. Prorrogada até 29/maio/2026. Para o produtor com débitos federais inscritos em dívida ativa."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Renegociação', href: '/educacao/renegociacao' },
        { label: 'PGFN — transação' },
      ]}
      prev={{ label: 'Renegociação', href: '/educacao/renegociacao' }}
      next={{ label: 'Prorrogação rural', href: '/educacao/renegociacao/prorrogacao-rural' }}
      fontes={[
        { label: 'PGFN — Edital PGDAU 11/2025 oficial', href: 'https://www.gov.br/pgfn/pt-br/servicos/orientacoes-contribuintes/acordo-de-transacao/edital-pgdau-11-2025' },
        { label: 'Lei 13.988/2020 — base legal da transação', href: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l13988.htm' },
        { label: 'Portal Regularize — adesão online', href: 'https://www.regularize.pgfn.gov.br/' },
      ]}
    >
      <Lead>
        O <Strong>Edital PGDAU 11/2025</Strong> é o programa de regularização tributária mais relevante em 2026 para débitos federais inscritos em dívida ativa. Originalmente válido até janeiro de 2026, foi <Strong>prorrogado até 29 de maio de 2026 às 19h</Strong> pelo Edital PGDAU 1/2026. Para o produtor com débitos federais represados, é uma janela rara.
      </Lead>

      <H2 id="quem-pode">Quem pode aderir</H2>
      <UL>
        <LI>Pessoas físicas, jurídicas e <Strong>cooperativas de agricultura familiar</Strong> com débitos inscritos em dívida ativa da União até <Strong>1º/nov/2025</Strong> (modalidades por capacidade de pagamento, irrecuperáveis e garantidos por seguro/carta).</LI>
        <LI>Para a modalidade de pequeno valor: dívidas inscritas até <Strong>30/jan/2025</Strong>.</LI>
        <LI>Limite máximo do débito consolidado: <Strong>R$ 45 milhões</Strong>.</LI>
      </UL>

      <H2 id="modalidades">As 4 modalidades</H2>
      <Table
        caption="Modalidades disponíveis no Edital 11/2025"
        headers={['Modalidade', 'Critério', 'Desconto', 'Parcelamento']}
        rows={[
          ['Capacidade de pagamento', 'Análise da renda/faturamento da PF/PJ', 'Até 65 % de juros, multas e encargos', 'Até 145 meses'],
          ['Débitos irrecuperáveis', 'Inscritos há mais de 15 anos sem garantia, ou sob falência/recuperação', 'Até 65 % do valor consolidado', 'Até 145 meses'],
          ['Pequeno valor', 'Total ≤ 60 salários mínimos', 'Até 50 % de juros, multas e encargos', 'Até 55 meses'],
          ['Garantia ou seguro', 'Débito com garantia de seguro/carta fiança', 'Sem desconto sobre principal', 'Conforme garantia'],
        ]}
      />

      <H2 id="capacidade-pagamento">Modalidade Capacidade de Pagamento — a mais usada</H2>
      <P>
        O contribuinte declara a renda/receita; a PGFN classifica o débito em uma das 4 categorias (A, B, C, D) conforme a probabilidade de recuperação. Quanto pior a categoria (irrecuperável → D), maior o desconto:
      </P>

      <Table
        caption="Capacidade de pagamento — descontos por categoria"
        headers={['Categoria', 'Probabilidade de recuperação', 'Desconto sobre encargos']}
        rows={[
          ['A', 'Alta — débito recente e tomador com bom faturamento', '0 %'],
          ['B', 'Média', '30 %'],
          ['C', 'Baixa', '50 %'],
          ['D', 'Irrecuperável', '65 %'],
        ]}
      />

      <Callout tone="warn" title="O que NÃO pode descontar">
        Em qualquer modalidade do Edital 11/2025, há vedação ao <Strong>uso de prejuízos fiscais e bases negativas de CSLL</Strong> para reduzir a dívida. Isso é específico da transação por adesão (em transação individual o tema é negociável). Para empresa com bilhão em prejuízos acumulados, a transação por adesão pode não ser a melhor.
      </Callout>

      <H2 id="entrada">Entrada e parcela</H2>
      <UL>
        <LI><Strong>Entrada</Strong>: 6% do total já com descontos, paga em até 12 parcelas.</LI>
        <LI><Strong>Saldo</Strong>: parcelado pelo prazo restante (até 145 meses), com juros Selic + 1% a.m.</LI>
        <LI>Para PF/empresa de pequeno porte: parcela mínima R$ 100/mês.</LI>
      </UL>

      <H2 id="passo-a-passo">Como aderir</H2>
      <Step n={1} title="Acessar o portal Regularize">
        Site oficial: regularize.pgfn.gov.br. Acesso via gov.br (selo prata mínimo) ou certificado digital.
      </Step>
      <Step n={2} title="Consultar saldo consolidado">
        Veja quais débitos estão inscritos, valores atualizados, categoria proposta. Esse passo é diagnóstico — não compromete nada.
      </Step>
      <Step n={3} title="Simular nas modalidades elegíveis">
        O sistema simula desconto e parcela em cada modalidade aplicável. Compare com cuidado — diferentes modalidades têm impactos diferentes em renúncias (ações judiciais).
      </Step>
      <Step n={4} title="Optar e formalizar">
        Adere online. Confessa a dívida e renuncia a defesas administrativas/judiciais sobre os débitos transacionados — irreversível depois de formalizado.
      </Step>
      <Step n={5} title="Pagar a entrada">
        Primeira parcela tem que ser paga até o último dia útil do mês da formalização. Atraso = transação rescindida e dívida volta cheia.
      </Step>
      <Step n={6} title="Manter regularidade">
        Quebra da transação em 3 parcelas seguidas ou 6 alternadas reativa o débito original com encargos cheios. Mantenha em dia.
      </Step>

      <H2 id="quando-vale">Quando vale (e quando não)</H2>
      <Callout tone="ok" title="Vale quando">
        <UL>
          <LI>Você não tem prejuízos fiscais relevantes para compensar (caso típico do produtor PF).</LI>
          <LI>Débito está em estágio de execução ou ameaça iminente de bloqueio de bens.</LI>
          <LI>Sua categoria é C ou D (desconto 50-65% torna a operação muito vantajosa).</LI>
          <LI>Você precisa de regularidade fiscal para acessar crédito (CND limpa = volta a captar).</LI>
        </UL>
      </Callout>
      <Callout tone="danger" title="NÃO vale quando">
        <UL>
          <LI>Você tem volumes grandes de prejuízo fiscal — perde o benefício de compensação.</LI>
          <LI>Há tese sólida de inexigibilidade do débito (você ganharia em juízo) — confessar invalida defesa.</LI>
          <LI>Categoria A (sem desconto) e dívida baixa — pagamento à vista pode sair melhor.</LI>
          <LI>Sua capacidade de pagamento real é baixa — entrar para depois inadimplir reativa o débito cheio.</LI>
        </UL>
      </Callout>

      <H2 id="exemplo">Exemplo — produtor com R$ 1,8 mi de Funrural inscrito</H2>
      <KV
        items={[
          { k: 'Débito', v: 'R$ 1.800.000 (Funrural inscrito em 2018-2020)' },
          { k: 'Categoria PGFN', v: 'D — irrecuperável (mais de 6 anos sem pagamento, sem garantia)' },
          { k: 'Desconto sobre encargos', v: '65 % → ~R$ 700 mil de redução' },
          { k: 'Saldo após desconto', v: '~R$ 1,1 mi' },
          { k: 'Entrada (6%)', v: '~R$ 66 mil em até 12 parcelas (R$ 5,5 mil/mês)' },
          { k: 'Saldo parcelado', v: '~R$ 1,03 mi em 132 parcelas (R$ 7,8 mil/mês)' },
          { k: 'Total pago', v: '~R$ 1,1 mi (vs R$ 1,8 mi originais)' },
          { k: 'Benefício adicional', v: 'CND federal em ordem → habilitação a Pronamp/Moderfrota' },
        ]}
      />

      <H2 id="faq">Perguntas frequentes</H2>
      <FAQ
        items={[
          {
            q: 'Posso aderir à transação se já tenho ação judicial sobre o mesmo débito?',
            a: 'Pode, mas a adesão exige desistência expressa da ação e renúncia ao direito sobre o qual ela se funda. É via de mão única — não dá pra tentar transação E ação ao mesmo tempo. Avaliar antes qual caminho tem mais valor (depende da tese e do estágio).',
          },
          {
            q: 'Após aderir, o nome sai do Cadin/SPC?',
            a: 'Sim — o débito fica suspenso para fins de cadastro restritivo enquanto a transação estiver em dia. CND e CNDs específicas voltam a ser emitidas após a primeira parcela. É o que destrava acesso a crédito novo.',
          },
          {
            q: 'Posso aderir agora e ainda complementar com transação individual depois?',
            a: 'Para o mesmo débito, não — a transação consome a dívida. Para débitos diferentes (ex: ITR vs Funrural separados), pode misturar — adesão para um, individual para outro. ALETIS mapeia isso na fase de diagnóstico.',
          },
          {
            q: 'Vale esperar um Refis novo ou aderir agora?',
            a: 'O cenário 2026 é desfavorável para Refis novo — base política para edição de Refis perdeu força após 2017. Editais PGFN têm sido a única via consistente desde 2020. Se você se enquadra, a janela atual (até 29-mai-2026) é provavelmente a melhor que verá nos próximos 12-18 meses.',
          },
        ]}
      />
    </EduLayout>
  )
}

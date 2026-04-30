import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, Table, KV, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Industrialização — produtor que processa a própria safra · Educação ALETIS',
  description:
    'Crédito de industrialização: quando o produtor beneficia ou industrializa a própria produção. Café torrado, laticínio, etanol, farinha. Regras, taxas e exemplos.',
  alternates: { canonical: 'https://aletis.com.br/educacao/credito-rural/industrializacao' },
}

export default function Industrializacao() {
  return (
    <EduLayout
      titulo="Industrialização — quando o produtor vai além do bruto"
      subtitulo="Café torrado, leite UHT, etanol da própria cana, farinha, frigorífico próprio. Crédito que financia a etapa industrial — exclusivo de quem produziu a matéria-prima."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Crédito Rural', href: '/educacao/credito-rural' },
        { label: 'Industrialização' },
      ]}
      prev={{ label: 'Comercialização', href: '/educacao/credito-rural/comercializacao' }}
      next={{ label: 'Programas oficiais', href: '/educacao/programas' }}
      fontes={[
        { label: 'MCR Cap. 4 — Industrialização', href: 'https://www3.bcb.gov.br/mcr' },
        { label: 'CMN — Resolução 5.234/2025', href: 'https://www.bcb.gov.br/estabilidadefinanceira/buscanormas' },
      ]}
    >
      <Lead>
        A modalidade <Strong>Industrialização</Strong> existe para quem <Strong>processa a própria produção</Strong> — café torrado, leite pasteurizado/UHT, etanol da cana, farinha, frigorífico próprio. É a ponte para o produtor que quer capturar margem que normalmente vai para o intermediário.
      </Lead>

      <H2 id="quem-pode">Quem pode</H2>
      <UL>
        <LI><Strong>Produtor rural</Strong> que industrializa pelo menos 50% da matéria-prima oriunda da própria propriedade.</LI>
        <LI><Strong>Cooperativas de produção</Strong> que industrializam matéria-prima dos cooperados.</LI>
        <LI><Strong>Agroindústria familiar</Strong> com SIM, SUSAF, SIE ou SIF.</LI>
      </UL>
      <Callout tone="warn" title="Limite estrutural">
        Se você comprar mais matéria-prima de terceiros do que produzir, você deixa de ser produtor industrializando — vira agroindústria empresarial e perde acesso ao crédito rural. Para esse perfil: BNDES Indústria, FCO/FNE Empresarial.
      </Callout>

      <H2 id="o-que-financia">O que financia</H2>
      <UL>
        <LI><Strong>Insumos da fase industrial</Strong>: embalagens, conservantes, fermentos, açúcar, sal, condimentos, paletização, energia, mão de obra de planta.</LI>
        <LI><Strong>Equipamentos industriais</Strong>: pasteurizador, autoclave, envasadora, secador, torrador, alambique, câmara fria, ordenhadeira de planta.</LI>
        <LI><Strong>Adequação sanitária</Strong>: SIM/SUSAF/SIE/SIF, MAPA, vigilância sanitária — obras de conformidade.</LI>
      </UL>

      <H2 id="taxas">Taxas (Plano Safra 2025/26)</H2>
      <Table
        caption="Industrialização — taxas vigentes"
        headers={['Programa', 'Taxa a.a.', 'Prazo', 'Limite']}
        rows={[
          ['Pronaf Agroindústria', '3 % a 5 %', 'até 10 anos', 'R$ 250 mil'],
          ['Pronaf Mais Alimentos — agroindústria', '5 %', 'até 10 anos', 'R$ 250 mil'],
          ['Pronamp Industrialização', '10 %', 'até 8 anos', 'R$ 1,5 mi'],
          ['Demais — controlados', '12 % a 14 %', '6-10 anos', 'R$ 5 mi'],
          ['Prodecoop (cooperativas)', '8,5 % a 13,5 %', '12 anos + 3 carência', 'R$ 80 mi/coop'],
        ]}
      />

      <H2 id="exemplo">Exemplo — agroindústria familiar (queijo artesanal, MG)</H2>
      <KV
        items={[
          { k: 'Perfil', v: 'Família com 30 vacas em ordenha, 250L/dia, processa 100% do leite em queijo minas' },
          { k: 'Investimento desejado', v: 'Pasteurizador + tanque + sala de cura — R$ 180.000' },
          { k: 'Programa', v: 'Pronaf Agroindústria' },
          { k: 'Taxa', v: '3 % a.a.' },
          { k: 'Prazo', v: '10 anos com 2 anos carência' },
          { k: 'Parcela anual aprox.', v: 'R$ 22.000' },
          { k: 'Margem incremental projetada', v: 'R$ 60.000/ano (queijo @ R$ 35/kg vs leite @ R$ 2,30/L)' },
          { k: 'DSCR', v: '~2,7× — sobra confortável' },
        ]}
      />
      <Callout tone="ok" title="Por que isso transforma">
        Vendendo leite, a família tira R$ 210 mil/ano. Vendendo queijo, R$ 270 mil/ano. <Strong>Industrialização eleva o teto da renda anual</Strong> — e isso muda o enquadramento futuro (acesso a Pronamp, por exemplo). É escada.
      </Callout>

      <H2 id="riscos">Riscos específicos</H2>
      <UL>
        <LI><Strong>Selo sanitário</Strong>: SIM cobre só município, SUSAF/SIE estado, SIF nacional. Erro de escolha trava venda interestadual.</LI>
        <LI><Strong>Capital de giro</Strong>: produto industrializado tem ciclo financeiro maior que o bruto (estoque + recebimento). Calcule o giro.</LI>
        <LI><Strong>Mercado próprio</Strong>: vender para gôndola exige marca, código de barras, distribuição. Sem isso, fica refém de revendedor.</LI>
        <LI><Strong>Tributação</Strong>: PJ rural industrializadora paga PIS/COFINS, ICMS — diferente do produtor pessoa física só com Funrural. Consulte contador antes.</LI>
      </UL>

      <H2 id="faq">Perguntas frequentes</H2>
      <FAQ
        items={[
          {
            q: 'Preciso ter CNPJ para acessar Industrialização?',
            a: 'Não obrigatoriamente — o produtor pessoa física pode acessar Pronaf Agroindústria com inscrição estadual de produtor rural. Mas para SIE/SIF e venda em escala, o CNPJ vira praticamente inevitável (e abre o crédito do Pronamp/demais).',
          },
          {
            q: 'Posso financiar a marca/registro/embalagem desde o desenho?',
            a: 'Embalagem e código de barras: sim, são insumos industriais. Marca/registro INPI: não, é despesa de marketing — fora do crédito rural. Para isso, capital próprio ou crédito de pequeno porte (Sebrae, FAT, Cresol).',
          },
          {
            q: 'Cooperativa industrializadora cabe em Pronamp?',
            a: 'Cooperativas têm linha própria — Prodecoop. Permite até R$ 80 mi por cooperativa (não por cooperado), prazo 12 anos com 3 de carência, taxa 8,5% a 13,5% conforme porte. Mais vantajoso que partir Pronamp em vários cooperados.',
          },
        ]}
      />
    </EduLayout>
  )
}

import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, KV, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Prorrogação rural (MCR §6º) · Educação ALETIS',
  description: 'Direito legal previsto no Manual de Crédito Rural — prorrogação automática em caso de evento climático ou queda generalizada de preço.',
  alternates: { canonical: 'https://aletis.com.br/educacao/renegociacao/prorrogacao-rural' },
}

export default function ProrrogacaoRural() {
  return (
    <EduLayout
      titulo="Prorrogação rural — direito que o banco não conta"
      subtitulo="O Manual de Crédito Rural §6º obriga o banco a prorrogar Custeio em casos específicos. Não é favor — é dispositivo legal."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Renegociação', href: '/educacao/renegociacao' },
        { label: 'Prorrogação rural' },
      ]}
      prev={{ label: 'PGFN — transação', href: '/educacao/renegociacao/pgfn-transacao' }}
      next={{ label: 'Refis e históricos', href: '/educacao/renegociacao/refis-historico' }}
      fontes={[
        { label: 'MCR — Manual de Crédito Rural Bacen', href: 'https://www3.bcb.gov.br/mcr' },
        { label: 'Lei 4.829/65 — Crédito Rural', href: 'https://www.planalto.gov.br/ccivil_03/leis/l4829.htm' },
      ]}
    >
      <Lead>
        Existe um dispositivo no <Strong>Manual de Crédito Rural §6º</Strong> que poucos produtores conhecem e bancos raramente apresentam: em casos de <Strong>evento climático adverso</Strong> ou <Strong>queda generalizada de preço</Strong>, a operação de Custeio <Strong>deve ser prorrogada</Strong> mantendo a mesma taxa contratada — sem virar renegociação punitiva.
      </Lead>

      <H2 id="quando-cabe">Quando a prorrogação cabe</H2>
      <UL>
        <LI><Strong>Evento climático adverso</Strong>: seca, granizo, geada, inundação, ataque de praga reconhecido oficialmente — comprovado por laudo do Mapa, Embrapa, Conab ou Inmet.</LI>
        <LI><Strong>Queda generalizada de preço</Strong>: preço de mercado abaixo do custo de produção médio nacional — comprovado por dados oficiais (Cepea, Conab).</LI>
        <LI><Strong>Doença em criação ou plantio</Strong>: epizootia ou epifitia reconhecida.</LI>
      </UL>

      <H2 id="como-funciona">Como funciona</H2>
      <UL>
        <LI>Prorrogação automática (até 1 ano) <Strong>sem mudança de taxa</Strong>.</LI>
        <LI>O período prorrogado mantém a taxa do contrato original. Sem capitalização punitiva.</LI>
        <LI>Em casos extremos, o banco pode aplicar prorrogação maior (até 3-4 anos), avaliada caso a caso.</LI>
        <LI>Garantias permanecem.</LI>
      </UL>

      <Callout tone="warn" title="Banco pode resistir — está dentro do esperado">
        A prorrogação reduz a receita do banco no curto prazo. Pelo MCR ele <Strong>tem que dar</Strong>, mas o caminho prático envolve solicitar formalmente, acompanhar e, em alguns casos, ir ao Bacen ou ao Procon. Há jurisprudência do STJ favorável (ex: STJ AgInt no REsp 1.835.020/RS).
      </Callout>

      <H2 id="passo-pratico">Passo prático</H2>
      <KV
        items={[
          { k: '1. Documentar a quebra', v: 'Laudo do Proagro/seguro privado + relatório de assistência técnica + comprovação Conab/Cepea (se preço)' },
          { k: '2. Carta formal ao banco', v: 'Solicitação de prorrogação com base no MCR §6º, anexando laudos. Protocolar no banco com cópia.' },
          { k: '3. Prazo de resposta', v: 'Banco deve responder em até 30 dias (prática). Se silenciar, escalar para ouvidoria.' },
          { k: '4. Se for negada', v: 'Reclamação no Bacen via fala.bcb.gov.br e/ou ação judicial declaratória do direito à prorrogação.' },
          { k: '5. Concedida', v: 'Aditivo contratual mantendo taxa, com novo cronograma de amortização.' },
        ]}
      />

      <FAQ
        items={[
          {
            q: 'A prorrogação cabe para Investimento (Moderfrota, ABC+, etc)?',
            a: 'O MCR §6º foca em Custeio. Para Investimento, a prática é a "novação" caso a caso, sem direito automático. Mas em quebra generalizada (eventos como crise da peste suína 2018 ou geada do café 2021) o BNDES já flexibilizou.',
          },
          {
            q: 'Banco pode cobrar taxa de prorrogação?',
            a: 'Não — taxa de "tarifa de prorrogação" foi proibida pela Resolução CMN 3.919/10 em operações de crédito rural. Se cobrarem, é repetível em juízo.',
          },
          {
            q: 'A prorrogação macula o histórico do produtor?',
            a: 'Não — prorrogação MCR §6º não consta como inadimplência no Sicor/Sisbacen. Diferente de "renegociação corretiva" pós-default, que altera o rating.',
          },
        ]}
      />
    </EduLayout>
  )
}

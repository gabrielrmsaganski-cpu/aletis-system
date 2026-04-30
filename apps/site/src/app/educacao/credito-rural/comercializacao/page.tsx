import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import {
  Lead, H2, H3, P, UL, LI, Strong, Callout, Table, KV, FAQ,
} from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Comercialização — segurar a safra para vender bem · Educação ALETIS',
  description:
    'EGF, FEPM, antecipação de exportação, contratos de opção CONAB, PEPRO. Como o produtor financia a guarda da safra para escapar do preço deprimido da colheita.',
  alternates: { canonical: 'https://aletis.com.br/educacao/credito-rural/comercializacao' },
}

export default function Comercializacao() {
  return (
    <EduLayout
      titulo="Comercialização — comprando tempo para vender bem"
      subtitulo="Quem vende na colheita aceita o pior preço do ano. Crédito de comercialização paga para você esperar."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Crédito Rural', href: '/educacao/credito-rural' },
        { label: 'Comercialização' },
      ]}
      prev={{ label: 'Investimento', href: '/educacao/credito-rural/investimento' }}
      next={{ label: 'Industrialização', href: '/educacao/credito-rural/industrializacao' }}
      fontes={[
        { label: 'CONAB — Política de Garantia de Preços Mínimos', href: 'https://www.conab.gov.br/agricultura-familiar/comercializacao-af' },
        { label: 'MCR Cap. 5 — Comercialização', href: 'https://www3.bcb.gov.br/mcr' },
      ]}
    >
      <Lead>
        Quando o produtor colhe, o mercado já sabe — preço cai. Quem precisa vender em maio vende a mínima. Comercialização é a modalidade que <Strong>financia a guarda do produto</Strong> para você vender em julho, setembro ou no próximo ano.
      </Lead>

      <H2 id="ferramentas">As 6 ferramentas oficiais</H2>

      <H3>EGF — Empréstimo do Governo Federal</H3>
      <P>
        Banco financia o produtor que mantém o produto guardado em armazém certificado. Lastro é o próprio produto. Prazo até <Strong>240 dias</Strong>, taxa do Plano Safra. Pode ser EGF-COV (com opção de venda à CONAB) ou EGF sem opção.
      </P>

      <H3>FEPM — Financiamento para Estocagem de Produtos Agropecuários</H3>
      <P>
        Para <Strong>cooperativas e cerealistas</Strong> que estocam produção dos cooperados/clientes. Permite que a cooperativa pague o produtor à vista e venda gradualmente, sem espremer o caixa coletivo.
      </P>

      <H3>Contratos de Opção da CONAB</H3>
      <P>
        Funciona como um <Strong>seguro de preço</Strong>: você paga um prêmio à CONAB e ganha o direito (não a obrigação) de vender pelo preço mínimo na data de exercício. Se preço de mercado &gt; opção, você vende ao mercado e o prêmio "vira pó". Se mercado &lt; opção, exerce e vende à CONAB pelo preço mínimo.
      </P>

      <H3>PEPRO — Prêmio Equalizador Pago ao Produtor</H3>
      <P>
        Quando a CONAB não compra mas quer escoar a produção, ela paga um <Strong>prêmio direto ao produtor</Strong> que vendeu acima do preço mínimo a um comprador privado em região definida (normalmente fora do raio das fábricas).
      </P>

      <H3>PEP — Prêmio para Escoamento de Produto</H3>
      <P>
        Variação do PEPRO em que o prêmio vai ao <Strong>arrematante</Strong> em leilão público — para garantir escoamento de áreas com excedente.
      </P>

      <H3>Antecipação de exportação (ACC/ACE)</H3>
      <P>
        Não é controlado, mas relevante: produtor com contrato de exportação assinado (CPR-E ou contrato de gaveta com trader) pode <Strong>antecipar até 95% do contrato</Strong> em USD via banco, com taxa Libor + spread. Permite quitar o Custeio e segurar o produto físico.
      </P>

      <H2 id="taxas">Taxas (Plano Safra 2025/26)</H2>
      <Table
        caption="Comercialização — taxa por programa"
        headers={['Programa', 'Taxa a.a.', 'Prazo', 'Limite']}
        rows={[
          ['EGF — Pronaf', '3 % a 6 %', '240 dias', 'R$ 250 mil'],
          ['EGF — Pronamp', '10 %', '240 dias', 'R$ 3 mi'],
          ['EGF — demais', '12 % a 14 %', '240 dias', 'R$ 5 mi'],
          ['FEPM — cooperativas', '11,5 %', '240 dias', 'R$ 50 mi'],
          ['Antecipação ACC/ACE', 'SOFR + 4-6 %', '180-360 dias', 'volume contrato'],
        ]}
      />

      <H2 id="quando-usar">Quando usar (e quando não)</H2>
      <Callout tone="ok" title="Faz sentido EGF quando">
        a curva de preço futura sinaliza alta &gt; (taxa + custo de armazém + perda) e o produtor tem armazém certificado disponível. Em ano de carry positivo (preço M+3 maior que pronto), a conta sempre fecha.
      </Callout>
      <Callout tone="warn" title="NÃO faz sentido quando">
        a curva é invertida (pronto &gt; futuro) ou o custo de armazenamento (R$ 1,50-3,00/saca/mês) + capital empenhado &gt; ganho esperado. Nesses casos, vender e operar via Bolsa (futuros B3) é mais barato.
      </Callout>

      <H2 id="exemplo">Exemplo — soja MT, 30.000 sacas</H2>
      <KV
        items={[
          { k: 'Cenário', v: '30.000 sacas colhidas em fev/26, preço pronto R$ 115,00/sc' },
          { k: 'Curva ago/26 (futuro)', v: 'R$ 138,00/sc — alta de R$ 23/sc' },
          { k: 'Receita imediata', v: 'R$ 3.450.000' },
          { k: 'EGF — Pronamp 10 % a.a., 180 dias', v: 'R$ 172.500 de juros' },
          { k: 'Armazenagem 6 meses × R$ 2/sc/mês', v: 'R$ 360.000' },
          { k: 'Receita projetada ago/26', v: 'R$ 4.140.000' },
          { k: 'Resultado líquido extra', v: 'R$ 4.140.000 − R$ 172.500 − R$ 360.000 − R$ 3.450.000 = R$ 157.500' },
        ]}
      />
      <P>
        Mesmo descontando juros e armazém, segurar 6 meses gerou <Strong>R$ 157.500 a mais</Strong> — equivalente a 4,5% sobre a receita. Em ano de carry forte, EGF paga o próprio custo + sobra.
      </P>

      <H2 id="faq">Perguntas frequentes</H2>
      <FAQ
        items={[
          {
            q: 'Posso pegar EGF sobre safra que ainda não colhi?',
            a: 'Não — EGF exige produto colhido, padronizado e depositado em armazém certificado pelo MAPA. Para a fase pré-colheita, a ferramenta é Custeio (despesas operacionais) ou CPR Financeira (capital de giro lastreado em produção futura).',
          },
          {
            q: 'Tenho que vender o produto à CONAB no fim?',
            a: 'Só se for EGF-COV (com opção de venda). Em EGF sem opção, você é livre para vender a qualquer comprador — o banco só quer o pagamento do EGF na liquidação. CONAB compra apenas em PEP/PEPRO ou contrato de opção exercido.',
          },
          {
            q: 'Comercialização ajuda na renegociação de Custeio que venceu?',
            a: 'Sim — em caso de quebra parcial e produto colhido, o produtor pode tomar EGF para alongar o Custeio que venceria na colheita, dando ar até a venda em janela melhor. Operação tem que ser estruturada com o banco antes do vencimento — depois vira renegociação corretiva, com perda de subsídio.',
          },
        ]}
      />
    </EduLayout>
  )
}

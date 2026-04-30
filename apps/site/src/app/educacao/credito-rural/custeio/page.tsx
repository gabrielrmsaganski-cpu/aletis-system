import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import {
  Lead, H2, H3, P, UL, OL, LI, Strong, Callout, Table, KV, Step, FAQ,
} from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Custeio agrícola e pecuário · Educação ALETIS',
  description:
    'Custeio rural: o que pode ser financiado, prazos, garantias, taxas Plano Safra 2025/26, exemplos numéricos e armadilhas comuns.',
  alternates: { canonical: 'https://aletis.com.br/educacao/credito-rural/custeio' },
}

export default function Custeio() {
  return (
    <EduLayout
      titulo="Custeio — financiando a operação da safra"
      subtitulo="O coração do crédito rural. O dinheiro que paga o que sai do bolso entre o plantio e a colheita."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Crédito Rural', href: '/educacao/credito-rural' },
        { label: 'Custeio' },
      ]}
      prev={{ label: 'Crédito Rural — visão geral', href: '/educacao/credito-rural' }}
      next={{ label: 'Investimento', href: '/educacao/credito-rural/investimento' }}
      fontes={[
        { label: 'MCR — Cap. 3 (Custeio)', href: 'https://www3.bcb.gov.br/mcr' },
        { label: 'CMN — Resolução 5.234/2025', href: 'https://www.bcb.gov.br/estabilidadefinanceira/buscanormas' },
        { label: 'Mapa — Zarc por cultura', href: 'https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico' },
      ]}
    >
      <Lead>
        Custeio é o crédito que <Strong>cobre o caixa da safra ou do ciclo do animal</Strong>. Você toma na prepração, paga após a colheita ou venda. É a operação mais comum do agro brasileiro e — quando bem desenhada — a mais barata.
      </Lead>

      <H2 id="o-que-pode">O que pode ser financiado</H2>
      <UL>
        <LI><Strong>Custeio agrícola</Strong>: sementes, mudas, fertilizantes, defensivos, corretivos, óleo diesel, mão de obra, manutenção de máquinas, energia elétrica, irrigação, transporte interno, frete da colheita, secagem, armazenagem temporária, prêmios de seguro agrícola.</LI>
        <LI><Strong>Custeio pecuário</Strong>: ração, suplementação mineral, sanidade animal (vacinas, vermífugos), inseminação, mão de obra, manutenção de cercas, água, energia, frete de animais, prêmios de seguro pecuário.</LI>
        <LI><Strong>Custeio aquícola/pesqueiro</Strong>: alevinos, ração, oxigenação, larvicultura, manejo, mão de obra.</LI>
      </UL>

      <Callout tone="warn" title="O que NÃO entra no Custeio">
        Compra de terra, máquinas, implementos, formação de pasto, plantios perenes (café, citros, eucalipto na fase de formação), construções, aquisição de matrizes — tudo isso é <Strong>Investimento</Strong>, modalidade separada com regras próprias.
      </Callout>

      <H2 id="taxas">Taxas vigentes (Plano Safra 2025/26)</H2>
      <Table
        caption="Taxas de Custeio por programa — todas com desconto adicional de 0,5 p.p. já incluído"
        headers={['Programa', 'Taxa a.a.', 'Limite por mutuário', 'Quando usar']}
        rows={[
          ['Pronaf — alimentos (cesta básica)', '3 %', 'até R$ 250 mil/ano', 'Renda bruta familiar até R$ 500 mil/ano'],
          ['Pronaf — agroecologia/orgânicos', '2 %', 'até R$ 250 mil/ano', 'Produção certificada ou em transição'],
          ['Pronaf — demais', '4 % a 6 %', 'até R$ 250 mil/ano', 'Outras culturas/atividades'],
          ['Pronamp', '10 %', 'até R$ 3 mi/ano', 'Renda bruta até R$ 3,5 mi/ano'],
          ['Demais produtores — controlados', '12 % a 14 %', 'até R$ 5 mi/ano', 'Acima da faixa Pronamp'],
          ['Recursos livres (LCA, CDB)', '15 % a 20 %', 'sem teto', 'Quando esgotou os controlados'],
        ]}
      />

      <H2 id="prazos">Prazos</H2>
      <Table
        caption="Prazo máximo conforme cultura/atividade (MCR)"
        headers={['Atividade', 'Prazo padrão', 'Carência típica']}
        rows={[
          ['Soja, milho, algodão, arroz, feijão', '12 meses', '8-10 meses (até a colheita)'],
          ['Café, citros (manutenção)', '24 meses', '12 meses'],
          ['Cana-de-açúcar (manutenção)', '24-30 meses', '12-18 meses'],
          ['Bovinos (engorda)', '24 meses', '18 meses'],
          ['Bovinos (cria/recria)', '36-48 meses', 'até 24 meses'],
          ['Suínos, aves', '12-24 meses', 'conforme ciclo'],
          ['Aquicultura', '12-24 meses', 'conforme ciclo'],
        ]}
      />

      <H2 id="garantias">Garantias mais usadas</H2>
      <UL>
        <LI><Strong>Penhor da safra</Strong> — a própria produção financiada serve de garantia. Padrão para Custeio agrícola.</LI>
        <LI><Strong>Penhor pecuário</Strong> — animais financiados respondem pela dívida.</LI>
        <LI><Strong>Aval ou fiança</Strong> — terceiro garantidor, normalmente exigido para tomadores iniciantes ou volumes menores.</LI>
        <LI><Strong>Hipoteca rural</Strong> — para volumes acima de R$ 1 mi ou tomador novo no banco.</LI>
        <LI><Strong>CPR</Strong> — Cédula de Produto Rural, comum em Custeio com financiador privado (Fiagro, trader, fornecedor de insumo).</LI>
      </UL>

      <H2 id="exemplo">Exemplo numérico — soja em MT, 500 ha</H2>
      <KV
        items={[
          { k: 'Cultura', v: 'Soja convencional, 500 ha em Mato Grosso' },
          { k: 'Custo direto/ha', v: 'R$ 7.800 (sementes + adubo + defensivos + diesel + mão de obra)' },
          { k: 'Custeio total demandado', v: 'R$ 3.900.000 (= 500 × 7.800)' },
          { k: 'Programa', v: 'Pronamp (renda bruta R$ 2,8 mi)' },
          { k: 'Taxa nominal', v: '10 % a.a. — Plano Safra 2025/26' },
          { k: 'Bônus 0,5 p.p.', v: 'taxa final 9,5 % a.a.' },
          { k: 'Prazo', v: '12 meses, pagamento único na colheita' },
          { k: 'Juros pagos no fim do ciclo', v: '~ R$ 370.500' },
          { k: 'Comparado a recurso livre 18 % a.a.', v: 'R$ 702.000 — diferença de R$ 331.500/ano' },
        ]}
      />

      <Callout tone="tip" title="A matemática que importa">
        Em uma operação de R$ 3,9 mi por uma safra, ficar dentro do Pronamp em vez de cair no recurso livre <Strong>economiza ~R$ 331 mil em juros</Strong>. É margem inteira de muitos hectares. Vale qualquer esforço de enquadramento.
      </Callout>

      <H2 id="armadilhas">Armadilhas comuns</H2>
      <OL>
        <LI><Strong>Pegar mais Custeio do que precisa.</Strong> Banco gosta de aprovar grande, e produtor toma "sobra" para "outras coisas". Isso vira juros pago a 10% para usar em consumo — é caro e desvio de finalidade (rescisão contratual).</LI>
        <LI><Strong>Atrasar a CPR/cessão para o trader.</Strong> Quando o produtor cede a CPR ao mesmo tempo do Custeio bancário, vira dívida dupla sobre a mesma safra. Se a colheita falha, a quebra é catastrófica.</LI>
        <LI><Strong>Trocar fertilizante por barter sem fechar o banco.</Strong> Comum: pega adubo da trader em barter (paga em soja) E custeio bancário sobre os MESMOS hectares. Mesmo penhor para dois credores — é fraude.</LI>
        <LI><Strong>Não respeitar o Zarc.</Strong> Plantou fora da janela = perde cobertura Proagro. Em ano ruim, indenização nega.</LI>
        <LI><Strong>Esquecer o seguro agrícola.</Strong> Custeio sem seguro é uma aposta. Para soja em MT em 2025/26, o prêmio com Proagro fica em ~2-3% do Custeio — barato pelo que protege.</LI>
      </OL>

      <H2 id="liberacao">Como o dinheiro chega</H2>
      <P>
        Custeio raramente libera 100% de uma vez. O banco segue o <Strong>cronograma de desembolso</Strong> baseado nas etapas:
      </P>

      <Step n={1} title="1ª parcela — Pré-plantio">
        Tipicamente 40-50% — para pagar sementes, fertilizantes e início de operação. Liberada após assinatura do contrato e registro das garantias.
      </Step>
      <Step n={2} title="2ª parcela — Tratos culturais">
        Mais 30-40% — para defensivos, adubação de cobertura, mão de obra. Liberada com fiscalização do banco confirmando que o plantio aconteceu dentro do Zarc.
      </Step>
      <Step n={3} title="3ª parcela — Colheita">
        Saldo restante — para diesel, mão de obra de colheita, frete, secagem, armazenagem. Vinculada à comprovação da produção.
      </Step>

      <H2 id="faq">Perguntas frequentes</H2>
      <FAQ
        items={[
          {
            q: 'Posso ter Custeio em mais de um banco simultaneamente?',
            a: 'Pode, desde que cada operação tenha uma área/cultura distinta como garantia. Não pode dar a MESMA safra como penhor para dois bancos diferentes — isso é fraude. O sistema do Banco Central cruza informações via Sicor (Sistema de Operações do Crédito Rural), e a duplicidade é detectada.',
          },
          {
            q: 'O que acontece se a safra quebra e eu não consigo pagar?',
            a: 'Primeiro caminho: prorrogação rural (MCR cap. 2 §6º) — banco é obrigado a prorrogar nos casos de evento climático ou queda generalizada de preço, com mesma taxa. Segundo: Proagro/seguro indeniza. Terceiro: renegociação direta. Quarto: ajuizamento e contestação judicial. A ALETIS atua nos quatro caminhos.',
          },
          {
            q: 'Custeio do banco pode ser usado para pagar arrendamento da terra?',
            a: 'Não. Arrendamento é "despesa de aquisição" para fins do MCR e não entra no plano de Custeio. Para arrendamento, ou se paga com caixa próprio ou se busca capital de giro do agronegócio (recurso livre, mais caro).',
          },
          {
            q: 'Tem como antecipar o Custeio antes do banco aprovar?',
            a: 'Sim, via CPR Financeira com Fiagro/trader. Você emite a CPR, recebe o caixa, e quita ou na colheita (CPR Física) ou em data certa (CPR Financeira). Taxa fica entre IPCA+8% e CDI+5%, dependendo do rating. Mais caro que Pronamp, mais rápido.',
          },
        ]}
      />
    </EduLayout>
  )
}

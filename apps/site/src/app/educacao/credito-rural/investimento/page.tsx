import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import {
  Lead, H2, H3, P, UL, LI, Strong, Callout, Table, KV, Step, FAQ,
} from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Investimento rural · Educação ALETIS',
  description:
    'Crédito de investimento agropecuário: máquinas, irrigação, armazenagem, energia solar, formação de pasto. Programas BNDES e Plano Safra 25/26.',
  alternates: { canonical: 'https://aletis.com.br/educacao/credito-rural/investimento' },
}

export default function Investimento() {
  return (
    <EduLayout
      titulo="Investimento — capex agrícola e pecuário"
      subtitulo="Máquinas, irrigação, armazenagem, energia, formação de pastagem e plantios perenes. Prazo longo, garantia real, escolha cuidadosa."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Crédito Rural', href: '/educacao/credito-rural' },
        { label: 'Investimento' },
      ]}
      prev={{ label: 'Custeio', href: '/educacao/credito-rural/custeio' }}
      next={{ label: 'Comercialização', href: '/educacao/credito-rural/comercializacao' }}
      fontes={[
        { label: 'BNDES — Crédito Rural', href: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/credito-rural' },
        { label: 'Mapa — Programas de Investimento', href: 'https://www.gov.br/agricultura/pt-br/assuntos/politica-agricola/credito-rural' },
        { label: 'CMN — Resolução 5.234/2025', href: 'https://www.bcb.gov.br/estabilidadefinanceira/buscanormas' },
      ]}
    >
      <Lead>
        Investimento financia <Strong>bens de capital</Strong> — coisas que duram anos e geram renda durante esse tempo. Pelo prazo longo (5 a 12 anos) e pela garantia real, é onde mora o maior risco e a maior alavancagem do produtor. Errar na entrada compromete uma década.
      </Lead>

      <H2 id="o-que-pode">O que pode ser financiado</H2>
      <UL>
        <LI><Strong>Máquinas e implementos</Strong>: tratores, colhedoras, plantadeiras, pulverizadores, autopropelidos, veículos utilitários (até 50%), equipamentos de irrigação, GPS, drones agrícolas.</LI>
        <LI><Strong>Construções e melhorias</Strong>: silos, armazéns, currais, galpões, estábulos, ordenhadeiras, salas de manejo, tanques de leite, abatedouros (próprios), açudes.</LI>
        <LI><Strong>Formação e recuperação</Strong>: formação de pasto, recuperação de pastagem degradada, plantios perenes (café, citros, eucalipto, dendê), reflorestamento.</LI>
        <LI><Strong>Sustentáveis</Strong>: energia solar, biodigestor, ILPF, plantio direto, recuperação de áreas degradadas, integração ABC+.</LI>
        <LI><Strong>Aquisição de animais</Strong>: matrizes bovinas, suínas, ovinas, caprinos, peixes (para reposição/expansão).</LI>
        <LI><Strong>Tecnologia e inovação</Strong>: agricultura de precisão, software de gestão, sistemas de monitoramento, comunicação rural.</LI>
      </UL>

      <H2 id="programas">Programas (Plano Safra 2025/26)</H2>
      <Table
        caption="Os principais programas de investimento — taxas e tetos vigentes"
        headers={['Programa', 'Foco', 'Taxa a.a.', 'Teto/mutuário', 'Prazo']}
        rows={[
          ['Pronaf Mais Alimentos', 'agro familiar (até R$ 100 mil)', '2,5 %', 'R$ 100 mil', '10 anos + 3 carência'],
          ['Pronaf Mais Alimentos', 'tratores e implementos (até R$ 250 mil)', '5 %', 'R$ 250 mil', '10 anos + 3 carência'],
          ['Pronaf ABC+', 'baixo carbono familiar', '4 % a 6 %', 'R$ 250 mil', '10 anos + 8 carência'],
          ['Pronamp Investimento', 'médio produtor', '10 %', 'R$ 500 mil', '8 anos + 3 carência'],
          ['Moderfrota — pequenos', 'tratores/colhedoras pequeno produtor', '8,5 % a 11,5 %', 'R$ 1,5 mi', '7 anos'],
          ['Moderfrota — demais', 'tratores/colhedoras demais', '13,5 %', 'R$ 4 mi', '7 anos'],
          ['Inovagro', 'tecnologia / agricultura de precisão', '11,5 %', 'R$ 2 mi', '10 anos'],
          ['ABC+ — demais', 'baixo carbono empresarial', '8,5 % a 12 %', 'R$ 5 mi', '10-15 anos + 8 carência'],
          ['PCA', 'armazenagem (silos/granéis)', '11,5 %', 'R$ 50 mi/empresa', '12 anos + 3 carência'],
          ['Moderagro', 'pecuária, fruticultura, sanidade', '13,5 %', 'R$ 880 mil', '8-10 anos + 3 carência'],
          ['Proirriga', 'irrigação inteligente', '11,5 %', 'R$ 4 mi', '10 anos'],
          ['BNDES Crédito Rural Investimento', 'demais investimentos', '12 % a 14 %', 'sem teto fixo', 'até 12 anos'],
        ]}
      />

      <Callout tone="info" title="Subsídio explícito">
        O investimento controlado tem subsídio do Tesouro maior que o Custeio. Para o Moderfrota empresarial, por exemplo, a diferença entre os 13,5% pagos pelo produtor e os ~17% que o BNDES capta é equalizada pelo governo. <Strong>Por isso há fila — e por isso a documentação é mais rigorosa.</Strong>
      </Callout>

      <H2 id="estrutura">Estrutura típica de uma operação</H2>
      <KV
        items={[
          { k: 'Plano de investimento', v: 'orçamento + cronograma físico-financeiro do bem' },
          { k: 'Análise de viabilidade', v: 'projeção de receita, DSCR ≥ 1,2× em todos os anos do prazo' },
          { k: 'Garantia real', v: 'alienação fiduciária do bem financiado + hipoteca rural' },
          { k: 'Carência', v: 'período em que só se paga juros (formação do pasto/cultura)' },
          { k: 'Amortização', v: 'parcelas anuais ou semestrais — sempre após a colheita' },
          { k: 'Sistema de juros', v: 'normalmente Tabela Price (parcela igual) ou SAC (decrescente)' },
        ]}
      />

      <H2 id="exemplo">Exemplo — colhedora de R$ 1,8 mi via Moderfrota</H2>
      <KV
        items={[
          { k: 'Bem', v: 'Colhedora de soja seminova, R$ 1.800.000' },
          { k: 'Programa', v: 'Moderfrota — produtor empresarial' },
          { k: 'Taxa', v: '13,5 % a.a. (Plano Safra 25/26)' },
          { k: 'Prazo', v: '7 anos com carência de 1 ano' },
          { k: 'Sistema', v: 'Price (parcela anual)' },
          { k: 'Parcela anual aprox.', v: 'R$ 408.000/ano' },
          { k: 'Juros totais ao final', v: '~R$ 1,06 milhão (≈ 59% do principal)' },
          { k: 'Capacidade necessária', v: 'DSCR ≥ 1,2× → resultado anual ≥ R$ 490 mil' },
        ]}
      />

      <Callout tone="warn" title="O custo real do alongamento">
        O charme do prazo de 7 anos é a parcela cabível. Mas <Strong>59% do principal vira juros</Strong>. Antes de alongar tudo, pergunte: e se eu pagasse em 4 anos? Em muitos casos o valor presente líquido é melhor.
      </Callout>

      <H2 id="armadilhas">Armadilhas em Investimento</H2>
      <UL>
        <LI><Strong>Comprar máquina sobredimensionada.</Strong> Trator de 200 cv para área de 200 ha é capital empenhado parado — virou colega da família, não mais ferramenta de retorno.</LI>
        <LI><Strong>Pegar BNDES máximo.</Strong> Banco aprova "o que cabe", não "o que precisa". Margem operacional aperta, e na safra 3 vira inadimplência.</LI>
        <LI><Strong>Não casar prazo do bem com prazo da dívida.</Strong> Plantio de eucalipto começa a render no ano 7. Operação com primeira parcela no ano 4 quebra fluxo.</LI>
        <LI><Strong>Esquecer manutenção.</Strong> Trator/colhedora demanda 8-12% do valor/ano em manutenção. Quem só projeta a parcela da dívida quebra na 4ª safra.</LI>
        <LI><Strong>Misturar Investimento com Custeio.</Strong> Comum: usar Custeio para "completar" reforma de máquina. É desvio de finalidade — banco fiscaliza e quebra o contrato.</LI>
      </UL>

      <H2 id="alternativas">Quando NÃO fazer Investimento via banco</H2>
      <P>
        Há cenários em que <Strong>leasing</Strong>, <Strong>consórcio</Strong>, <Strong>finame fabricante</Strong> ou <Strong>compra à vista com CPR Financeira</Strong> ganham do BNDES tradicional:
      </P>
      <UL>
        <LI>Quando o bem tem alta liquidez de revenda → leasing pode ter taxa próxima e ICMS recuperável.</LI>
        <LI>Quando o produtor já tem operações no limite Pronamp/BNDES → CPR libera recurso fora do tomador.</LI>
        <LI>Quando a depreciação real é maior que a depreciação fiscal → leasing acelera benefício tributário.</LI>
        <LI>Quando o fabricante oferece taxa subsidiada (Finame fabricante) abaixo do Plano Safra para liquidar estoque.</LI>
      </UL>

      <H2 id="passo-a-passo">Como sair do "quero" para a operação aprovada</H2>
      <Step n={1} title="Defina a tese de retorno">
        Não inicie pelo bem. Inicie pelo retorno: quantos hectares a mais, quantas cabeças a mais, quantas horas/dia ganhas. Calcule margem incremental por safra e DSCR projetado. Se DSCR &lt; 1,2× em qualquer safra → não tome.
      </Step>
      <Step n={2} title="Cote 3 fornecedores">
        Mesmo modelo, 3 fornecedores. Negocie 5-12% de desconto por à vista. Esse desconto deve ser comparado ao custo de tomar o financiamento — às vezes pagar à vista é melhor.
      </Step>
      <Step n={3} title="Compare programas">
        Mesmo bem, 3 programas (Moderfrota / Inovagro / BNDES Rural / Finame). Cada um tem teto, taxa, prazo, carência diferente. O melhor depende do tomador.
      </Step>
      <Step n={4} title="Monte o pacote de garantias">
        Banco quer alienação fiduciária do bem + segunda garantia (hipoteca, aval). Negocie a segunda — produtor experiente preserva área-mãe e oferece área de expansão como hipoteca.
      </Step>
      <Step n={5} title="Reserve capital de manutenção">
        Antes da primeira parcela, reserve 10% do valor financiado em capital de giro. É o que separa quem honra de quem entra em default no ano 2.
      </Step>

      <H2 id="faq">Perguntas frequentes</H2>
      <FAQ
        items={[
          {
            q: 'Posso usar Investimento para comprar terra?',
            a: 'Não. Compra de terra é a única finalidade vetada no crédito rural controlado (com exceção do Programa Nacional de Reforma Agrária). Para terra: capital próprio, FCO/FNE em programas específicos de assentamento, ou estruturação privada (Fiagro Imobiliário).',
          },
          {
            q: 'O Investimento serve para reformar a casa-sede?',
            a: 'Não. Construção de moradia rural pode ser financiada pelo Pronaf Habitação (linha específica até R$ 80 mil), mas não pelos programas de investimento produtivo.',
          },
          {
            q: 'Vale aliená-las fiduciariamente para o banco?',
            a: 'Para o bem financiado, sim — é praticamente obrigatório. Para área-mãe ou bem fora do escopo, pense duas vezes: alienação fiduciária permite execução extrajudicial mais rápida, e em caso de inadimplência você perde sem passar pelo juiz.',
          },
        ]}
      />
    </EduLayout>
  )
}

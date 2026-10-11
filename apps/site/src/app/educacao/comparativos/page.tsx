import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, Strong, Callout, Table } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Comparativos rápidos · Educação ALETIS',
  description: 'Pronaf vs Pronamp · Custeio vs Investimento · CPR vs LCA · Banco vs Fiagro · Refis vs Transação. Decisões em uma tabela.',
  alternates: { canonical: 'https://aletis.com.br/educacao/comparativos' },
}

export default function Comparativos() {
  return (
    <EduLayout
      titulo="Comparativos rápidos — quando usar o quê"
      subtitulo="Lado a lado. Cinco decisões que aparecem todo dia na gestão do produtor — resolvidas em uma tabela."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Comparativos' },
      ]}
      prev={{ label: 'Anatomia do contrato', href: '/educacao/contrato' }}
      next={{ label: 'Mapa da educação', href: '/educacao' }}
      fontes={[
        { label: 'Mapa — Plano Safra 2025/26', href: 'https://www.gov.br/agricultura/pt-br/assuntos/politica-agricola/credito-rural' },
      ]}
    >
      <Lead>
        Cinco escolhas binárias que aparecem repetidamente. Ao invés de explicar cada uma do zero, aqui estão lado a lado, com regra prática para cada decisão.
      </Lead>

      <H2 id="pronaf-pronamp">Pronaf × Pronamp</H2>
      <Table
        caption="Quem se enquadra em qual"
        headers={['Critério', 'Pronaf', 'Pronamp']}
        rows={[
          ['Renda bruta familiar/ano', 'até R$ 500 mil', 'R$ 500 mil – R$ 3,5 mi'],
          ['Trabalho familiar', 'predominante (≥ 50%)', 'não exigido'],
          ['Documento-chave', 'CAF (Cadastro de Aptidão ao Pronaf)', 'IRPF + CCIR'],
          ['Taxa Custeio', '2 % a 6 %', '10 % (-0,5 p.p. bônus)'],
          ['Limite Custeio', 'R$ 250 mil/ano', 'R$ 3 mi/ano'],
          ['Bônus de adimplência', 'até 40 % nas linhas B', 'não tem'],
        ]}
      />
      <Callout tone="tip" title="Regra prática">
        Renda &lt; R$ 500 mil e trabalho familiar = <Strong>Pronaf</Strong> (taxa muito menor).{' '}
        Renda entre R$ 500 mil e R$ 3,5 mi = <Strong>Pronamp</Strong> (única alternativa subsidiada).
      </Callout>

      <H2 id="custeio-investimento">Custeio × Investimento</H2>
      <Table
        caption="Modalidade certa para cada despesa"
        headers={['Atributo', 'Custeio', 'Investimento']}
        rows={[
          ['Para que serve', 'Despesas correntes da safra/ciclo', 'Bens de capital com vida útil > 1 ano'],
          ['Prazo padrão', '12-24 meses', '5-12 anos'],
          ['Reembolso', 'Após colheita / venda', 'Parcelas anuais ou semestrais'],
          ['Garantia comum', 'Penhor da safra/animais', 'Alienação fiduciária + hipoteca'],
          ['Taxa típica (Pronamp)', '10 %', '10 %'],
          ['Taxa típica (Demais)', '12 % a 14 %', '8,5 % a 14 %'],
          ['Carência', 'até a colheita', '1-8 anos conforme finalidade'],
        ]}
      />
      <Callout tone="info" title="Erro comum">
        Tentar usar Custeio para comprar máquina = desvio de finalidade. Investimento não pode pagar mão de obra da safra. <Strong>Cada finalidade tem sua modalidade.</Strong>
      </Callout>

      <H2 id="cpr-lca">CPR × LCA × Fiagro</H2>
      <Table
        caption="Os 3 pilares do funding privado"
        headers={['Aspecto', 'CPR', 'LCA', 'Fiagro']}
        rows={[
          ['Quem emite', 'Produtor/cooperativa', 'Banco', 'Gestora regulada CVM'],
          ['Quem investe', 'Banco, trader, Fiagro, FIDC', 'Investidor PF/PJ', 'Investidor PF/PJ'],
          ['Volume típico', 'R$ 50k – R$ 100 mi', 'R$ 1k – ilimitado', 'R$ 10 mi – R$ 100 mi'],
          ['Garantia', 'Penhor + hipoteca + aval', 'Lastro de operações de crédito agro', 'Conforme estrutura'],
          ['Para o produtor', 'Capta caixa', 'Investe excedente', 'Capta volume estruturado'],
          ['Custo', 'CDI+5 a 10%', 'N/A (investidor recebe)', 'CDI+4 a 9%'],
          ['Documentação', 'CPR + lastro', '—', 'Balanço + projeto + rating'],
        ]}
      />

      <H2 id="banco-fiagro">Banco × Fiagro</H2>
      <Table
        caption="Quando capital tradicional bate Fiagro estruturado"
        headers={['Cenário', 'Banco', 'Fiagro']}
        rows={[
          ['Volume até R$ 5 mi', 'Mais ágil, taxa subsidiada', 'Não cabe (custo de estruturação)'],
          ['Volume R$ 5-50 mi', 'Pode esgotar limite Pronamp', 'Alternativa estruturada'],
          ['Volume R$ 50 mi+', 'Difícil em uma única operação', 'Caminho natural'],
          ['Prazo até 5 anos', 'BNDES rural cobre', 'Fiagro também'],
          ['Prazo 5-10 anos', 'Limitado a programas específicos', 'Negociável'],
          ['Indexador customizado', 'Geralmente prefixado', 'CDI, IPCA, prefixado'],
          ['Disclosure financeiro', 'Pequeno (banco)', 'Maior (cotistas)'],
          ['Custo de estruturação', 'Tarifa de cadastro', '1-3% do volume'],
        ]}
      />

      <H2 id="refis-transacao">Refis × Transação tributária</H2>
      <Table
        caption="O modelo antigo vs o atual"
        headers={['Aspecto', 'Refis (modelo antigo)', 'Transação (Lei 13.988/20)']}
        rows={[
          ['Disponibilidade', 'Cíclico (depende de lei)', 'Permanente (editais regulares)'],
          ['Desconto', 'Igual para todos', 'Por categoria de capacidade (até 65%)'],
          ['Lógica', 'Política — anistia ampla', 'Técnica — recuperação proporcional'],
          ['Status hoje', 'Encerrado para novas adesões', 'ATIVO — Edital 11/2025 até mai/2026'],
          ['Recomendação 2026', 'Não esperar', 'Aderir agora se cabe'],
        ]}
      />

      <H2 id="price-sac">Tabela Price × SAC</H2>
      <Table
        caption="Os 2 sistemas de amortização — exemplo R$ 1 mi por 7 anos a 12% a.a."
        headers={['Aspecto', 'Tabela Price', 'SAC']}
        rows={[
          ['Parcela 1', 'R$ 219.020', 'R$ 262.857'],
          ['Parcela 7', 'R$ 219.020', 'R$ 159.286'],
          ['Total juros pagos', 'R$ 533.140', 'R$ 480.000'],
          ['Diferença', '+R$ 53.140 (mais caro)', 'base'],
          ['Caixa nos primeiros anos', 'mais leve', 'mais pesado'],
          ['Caixa nos últimos anos', 'mesmo', 'mais leve'],
        ]}
      />
      <Callout tone="tip" title="Regra prática">
        Se seu caixa <Strong>cresce com o tempo</Strong> (cultura perene formando, gado em recria, fazenda em expansão) → SAC. Se seu caixa <Strong>é estável ou decresce</Strong> → Price.
      </Callout>
    </EduLayout>
  )
}

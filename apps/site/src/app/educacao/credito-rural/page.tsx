import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import {
  Lead, H2, H3, P, UL, OL, LI, Strong, Callout, Table, KV, Step,
} from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Crédito Rural — o que é, fontes e modalidades · Educação ALETIS',
  description:
    'Crédito rural explicado: recursos controlados vs. livres, custeio, investimento, comercialização, industrialização. Quem pode, como acessa, taxas e Plano Safra 2025/26.',
  alternates: { canonical: 'https://aletis.com.br/educacao/credito-rural' },
}

export default function CreditoRural() {
  return (
    <EduLayout
      titulo="Crédito Rural — a base do agro brasileiro"
      subtitulo="Como o produtor financia safra, máquinas, armazenagem e exportação. Onde está o subsídio, onde está o risco, onde está a fila."
      breadcrumbs={[
        { label: 'Início', href: '/' },
        { label: 'Educação', href: '/educacao' },
        { label: 'Crédito Rural' },
      ]}
      next={{ label: 'Custeio', href: '/educacao/credito-rural/custeio' }}
      fontes={[
        { label: 'Banco Central — Manual de Crédito Rural (MCR)', href: 'https://www3.bcb.gov.br/mcr' },
        { label: 'Mapa — Plano Safra 2025/26', href: 'https://www.gov.br/agricultura/pt-br/assuntos/noticias/governo-federal-lanca-plano-safra-2025-2026-com-r-516-2-bilhoes-para-impulsionar-o-agro-brasileiro' },
        { label: 'CMN — Resolução 5.234/2025 (taxas Plano Safra 2025/26)', href: 'https://www.bcb.gov.br/estabilidadefinanceira/buscanormas' },
        { label: 'Lei 4.829/65 — Lei do Crédito Rural', href: 'https://www.planalto.gov.br/ccivil_03/leis/l4829.htm' },
      ]}
    >
      <Lead>
        Crédito Rural é toda operação financeira destinada à produção rural, com regras próprias instituídas pela{' '}
        <Strong>Lei 4.829/1965</Strong> e detalhadas no <Strong>Manual de Crédito Rural (MCR)</Strong> do Banco Central.
        É o que move o agro: 70% do que é plantado no Brasil depende dele.
      </Lead>

      <H2 id="objetivo">Para que serve</H2>
      <P>
        O crédito rural existe para resolver o descasamento entre <Strong>despesa imediata</Strong> (insumos, máquinas, mão de obra) e{' '}
        <Strong>receita tardia</Strong> (que só chega na colheita ou após o ciclo do animal). Sem ele, a safra não fecha — e quase todo produtor brasileiro depende dele em algum grau.
      </P>

      <H2 id="fontes">De onde vem o dinheiro: fontes</H2>
      <P>
        A taxa que você paga depende da <Strong>fonte do recurso</Strong>. O dinheiro do banco para o produtor pode vir de duas grandes origens:
      </P>

      <Table
        caption="As duas fontes do crédito rural — e por que isso muda sua taxa"
        headers={['Fonte', 'Origem', 'Tem subsídio?', 'Quem decide a taxa']}
        rows={[
          [
            <Strong key="1">Recursos controlados</Strong>,
            'Exigibilidade da poupança rural, LCA, BNDES, Funcafé, Tesouro Nacional (equalização)',
            <span key="2">Sim — Tesouro paga ao banco a diferença entre captação e taxa cobrada</span>,
            'CMN (Resolução anual, edição do Plano Safra)',
          ],
          [
            <Strong key="3">Recursos livres</Strong>,
            'Captação privada do banco (CDBs, depósitos, fundings)',
            'Não — banco precifica conforme custo + risco + spread',
            'Banco e produtor (mercado)',
          ],
        ]}
      />

      <Callout tone="tip" title="Onde mora o ouro">
        <Strong>Sempre que possível, antes de captar livre, esgote os controlados.</Strong>{' '}
        Em 2025/26, a diferença entre Pronamp (10% a.a.) e capital de giro livre (18-22% a.a.) chega a{' '}
        <Strong>10 pontos percentuais</Strong>. Em uma operação de R$ 1 milhão por 1 ano, isso são R$ 100 mil que ficam no caixa em vez de irem para o banco.
      </Callout>

      <H2 id="modalidades">As 4 modalidades</H2>
      <P>
        Toda operação de crédito rural se enquadra em uma das quatro finalidades abaixo. A <Strong>finalidade dita a taxa, o prazo, a garantia exigida e a documentação</Strong> — não dá para misturar.
      </P>

      <H3>Custeio (operação)</H3>
      <P>
        Para pagar <Strong>despesas correntes</Strong> da safra ou do ciclo: sementes, fertilizantes, defensivos, combustível, mão de obra, ração. Prazo curto (1 a 2 anos), reembolso após a colheita.{' '}
        <a className="text-aletis-verde underline decoration-aletis-gold/60 underline-offset-4 hover:text-aletis-gold" href="/educacao/credito-rural/custeio">
          Ver detalhe →
        </a>
      </P>

      <H3>Investimento</H3>
      <P>
        Para <Strong>bens com vida útil longa</Strong>: máquinas, implementos, irrigação, armazenagem, formação de pasto, plantios perenes, energia solar. Prazo longo (5 a 12 anos), com carência durante a formação.{' '}
        <a className="text-aletis-verde underline decoration-aletis-gold/60 underline-offset-4 hover:text-aletis-gold" href="/educacao/credito-rural/investimento">
          Ver detalhe →
        </a>
      </P>

      <H3>Comercialização</H3>
      <P>
        Para <Strong>segurar o produto colhido</Strong> e vender na hora certa, em vez de na hora da colheita (quando o preço está deprimido). EGF, FEPM, antecipação de exportação, contratos de opção da CONAB.{' '}
        <a className="text-aletis-verde underline decoration-aletis-gold/60 underline-offset-4 hover:text-aletis-gold" href="/educacao/credito-rural/comercializacao">
          Ver detalhe →
        </a>
      </P>

      <H3>Industrialização</H3>
      <P>
        Para o produtor que <Strong>beneficia/processa a própria produção</Strong> (laticínio próprio, suíno, café torrado, etanol da própria cana etc.). Funciona como um custeio estendido para a etapa industrial.{' '}
        <a className="text-aletis-verde underline decoration-aletis-gold/60 underline-offset-4 hover:text-aletis-gold" href="/educacao/credito-rural/industrializacao">
          Ver detalhe →
        </a>
      </P>

      <H2 id="quem-pode">Quem pode tomar crédito rural</H2>
      <UL>
        <LI><Strong>Produtor rural pessoa física</Strong> com inscrição no Cadastro de Contribuinte (CCIR/INCRA + CAR + ITR em dia).</LI>
        <LI><Strong>Produtor pessoa jurídica</Strong> cujo objeto social seja produção, beneficiamento ou comercialização agropecuária.</LI>
        <LI><Strong>Cooperativas</Strong> de produção rural ou de crédito.</LI>
        <LI><Strong>Condomínios rurais</Strong> e <Strong>parceiros/arrendatários</Strong> com contrato registrado.</LI>
        <LI><Strong>Pescadores artesanais e aquicultores</Strong> com Registro Geral da Pesca.</LI>
      </UL>

      <Callout tone="warn" title="Pré-requisitos que travam o crédito">
        Antes de qualquer aprovação, o banco exige: <Strong>CAR ativo</Strong> (Cadastro Ambiental Rural),{' '}
        <Strong>ITR em dia</Strong>, <Strong>Receituário Agronômico</Strong> dos defensivos no Custeio,{' '}
        <Strong>Zarc</Strong> (a partir de 2025/26 obrigatório para todo Custeio acima de R$ 200 mil) e{' '}
        <Strong>CND da Receita Federal</Strong>. Falta um → operação trava.
      </Callout>

      <H2 id="taxas">Taxas vigentes (Plano Safra 2025/26)</H2>
      <P>
        As taxas são fixadas anualmente pelo CMN. As do ciclo atual (1º/jul/2025 → 30/jun/2026) estão na{' '}
        <Strong>Resolução CMN nº 5.234/2025</Strong>. Resumo prático:
      </P>

      <Table
        caption="Taxas oficiais por programa — Plano Safra 2025/26"
        headers={['Programa / público', 'Taxa a.a.', 'Limite', 'Observação']}
        rows={[
          ['Pronaf — alimentos da cesta básica', '3 %', 'até R$ 250 mil', 'Custeio e investimento'],
          ['Pronaf — agroecologia / orgânicos', '2 %', 'até R$ 250 mil', 'Inclui sociobiodiversidade'],
          ['Pronaf B — microcrédito agroecológico', '0,5 %', 'até R$ 20 mil', 'Bônus adimplência até 40 %'],
          ['Pronaf — Mais Alimentos (até R$ 100 mil)', '2,5 %', 'até R$ 100 mil', 'Famílias até R$ 150 mil/ano'],
          ['Pronaf — Mais Alimentos (até R$ 250 mil)', '5 %', 'até R$ 250 mil', 'Tratores e implementos'],
          ['Pronamp — médio produtor', '10 %', 'até R$ 3,5 mi/ano', 'Limite renda elevado em 2025/26'],
          ['Demais produtores — controlados', '8,5 % a 14 %', 'conforme programa', 'Custeio, Moderfrota, ABC+, etc.'],
          ['Funcafé', '11 % a 12 %', 'até R$ 5 mi/cafeicultor', 'Recursos do Fundo do Café'],
        ]}
      />

      <Callout tone="info" title="Tem desconto adicional no Custeio">
        O Plano Safra 2025/26 prorrogou o desconto de <Strong>0,5 ponto percentual</Strong> nas taxas de Custeio entre 1º/jul/2025 e 30/jun/2026 — vale para Pronamp e demais produtores, ajustando a taxa "de fato" para baixo.
      </Callout>

      <H2 id="passo-a-passo">Como acessar — passo a passo</H2>

      <Step n={1} title="Diagnóstico de capacidade">
        Antes de qualquer banco, calcule sua capacidade real de pagamento. O DSCR projetado (resultado operacional ÷ serviço da dívida) precisa ficar acima de <Strong>1,2×</Strong> em todas as 3 próximas safras. Abaixo disso, o crédito vai aprovar — e quebrar você na safra ruim.
      </Step>

      <Step n={2} title="Documentação básica">
        IRPF + DECORE, balanço (se PJ), última safra produzida com notas, ITR, CAR ativo, CCIR/INCRA, matrícula do imóvel, CND federal e estadual, plano de safra com Zarc. Falta de papelada explica 60% dos atrasos.
      </Step>

      <Step n={3} title="Escolha do programa correto">
        Renda anual define se você é Pronaf, Pronamp ou demais. Finalidade define modalidade. <Strong>Não cabe escolher pela taxa mais baixa se o programa não te enquadra</Strong> — o banco devolve a operação ao final do enquadramento.
      </Step>

      <Step n={4} title="Banco operador e relacionamento">
        Cada programa tem agentes financeiros credenciados. Banco do Brasil, BNDES, Caixa, cooperativas (Sicredi, Sicoob, Cresol), bancos privados (Santander, Bradesco, Itaú) e bancos regionais (BNB, BRDE) operam parte. Pequena dica: banco com agência onde você tem caixa primário aprova mais rápido.
      </Step>

      <Step n={5} title="Garantias">
        Para volume acima de R$ 200 mil, normalmente exigem hipoteca rural ou alienação fiduciária do bem financiado. Para volume menor, aval/fiança costuma resolver. <Strong>Tente preservar a área-mãe (sede)</Strong> — se a operação azedar, é o que sobra.
      </Step>

      <Step n={6} title="Liberação e fiscalização">
        Custeio libera em parcelas conforme cronograma da safra. Investimento libera contra nota fiscal do bem. Ambos têm <Strong>fiscalização in loco</Strong> — o gerente vai à propriedade. Desvio de finalidade = quebra de contrato e vencimento antecipado.
      </Step>

      <H2 id="zarc">Zarc — o filtro silencioso</H2>
      <P>
        Desde 2025/26, o <Strong>Zoneamento Agrícola de Risco Climático (Zarc)</Strong> é obrigatório para todo Custeio agrícola — não só para os que entram no Proagro. O Zarc define janela de plantio, cultivar e solo aceitos para sua microrregião. Se sua intenção de plantio cair fora dessa janela, a operação é negada — independentemente do seu histórico.
      </P>

      <Callout tone="ok" title="Vantagem prática">
        Plantar dentro do Zarc não só destrava o crédito — também garante cobertura do <Strong>Proagro</Strong> (seguro público) e elegibilidade para <Strong>indenizações em caso de evento climático</Strong>. Vale o esforço de planejamento.
      </Callout>

      <KV
        items={[
          { k: 'Lei base', v: 'Lei 4.829/1965 (Lei do Crédito Rural)' },
          { k: 'Norma operacional', v: 'Manual de Crédito Rural — Bacen (MCR)' },
          { k: 'Plano vigente', v: '2025/26 — Resolução CMN 5.234/2025' },
          { k: 'Vigência', v: '01/jul/2025 → 30/jun/2026' },
          { k: 'Próximo plano', v: '2026/27 — lançamento previsto jun/jul-2026 (R$ 600 bi+ projetado)' },
        ]}
      />
    </EduLayout>
  )
}

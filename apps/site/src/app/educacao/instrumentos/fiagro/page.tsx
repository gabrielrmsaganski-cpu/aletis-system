import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, Table, KV, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Fiagro — Fundo de Investimento nas Cadeias Agroindustriais · Educação ALETIS',
  description: 'Fiagro: o fundo de investimento agro regulado pela CVM. Tipos (FII, FIDC, FIP), benefícios fiscais e quando captar via Fiagro.',
  alternates: { canonical: 'https://aletis.com.br/educacao/instrumentos/fiagro' },
}

export default function FiagroPage() {
  return (
    <EduLayout
      titulo="Fiagro — Fundo de Investimento nas Cadeias Produtivas Agroindustriais"
      subtitulo="O fundo regulado CVM que conecta capital de mercado com o produtor rural. Estruturação de captação fora do banco."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Instrumentos', href: '/educacao/instrumentos' },
        { label: 'Fiagro' },
      ]}
      prev={{ label: 'LCA', href: '/educacao/instrumentos/lca' }}
      next={{ label: 'CRA', href: '/educacao/instrumentos/cra' }}
      fontes={[
        { label: 'Lei 14.130/2021 — Fiagro', href: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/L14130.htm' },
        { label: 'CVM — RES 175 / Anexo III', href: 'https://conteudo.cvm.gov.br/legislacao/resolucoes/resol175.html' },
      ]}
    >
      <Lead>
        Criado pela <Strong>Lei 14.130/2021</Strong> e regulado pela CVM, o <Strong>Fiagro</Strong> é o fundo de investimento que dá ao agro a mesma estrutura que o FII deu ao mercado imobiliário: cota negociada em bolsa, governança profissional, benefícios fiscais para o investidor e captação estruturada para o produtor.
      </Lead>

      <H2 id="tipos">Os 3 tipos de Fiagro</H2>
      <Table
        caption="Tipos de Fiagro pela natureza do ativo investido"
        headers={['Tipo', 'O que compra', 'Quando o produtor capta']}
        rows={[
          ['Fiagro-FII (Imobiliário)', 'Imóveis rurais, sale-leaseback, terras', 'Vende terra e arrenda de volta com prazo longo'],
          ['Fiagro-FIDC (Direitos Creditórios)', 'CPRs, CDA/WA, contratos comerciais', 'Emite CPR/contrato e o Fiagro compra'],
          ['Fiagro-FIP (Participações)', 'Ações de empresas agroindustriais', 'Captação de equity para empresa agro/cooperativa'],
        ]}
      />

      <H2 id="por-que">Por que existe</H2>
      <UL>
        <LI><Strong>Investidor PF</Strong> ganha isenção de IR sobre rendimento (em FIIs e Fiagros listados em bolsa, com regras específicas).</LI>
        <LI><Strong>Investidor PJ/institucional</Strong> ganha exposição agrícola líquida (cota negociável em bolsa) que antes só conseguia tomando posição direta.</LI>
        <LI><Strong>Produtor</Strong> acessa funding fora do banco — com prazo, indexador e estrutura customizada para sua operação.</LI>
      </UL>

      <H2 id="captar">Como captar via Fiagro</H2>
      <KV
        items={[
          { k: 'Volume mínimo viável', v: 'R$ 5 mi (operações estruturadas)' },
          { k: 'Volume típico', v: 'R$ 10 mi a R$ 100 mi' },
          { k: 'Indexador', v: 'CDI, IPCA ou prefixado — negociável' },
          { k: 'Spread sobre indexador', v: '4 % a 9 % a.a. conforme rating + colateral' },
          { k: 'Prazo', v: '1 a 5 anos (mais comum: 2-3 anos)' },
          { k: 'Garantia', v: 'CPR + hipoteca + aval ou Fundo Garantidor Solidário (Lei do Agro)' },
          { k: 'Documentação mínima', v: 'Balanço, faturamento auditado, ITR, CAR, matrícula livre, projeto técnico' },
        ]}
      />

      <Callout tone="info" title="Quando faz sentido">
        Faz sentido quando:
        <UL>
          <LI>Volume excede teto Pronamp (R$ 3 mi) e BNDES Rural (~R$ 5 mi).</LI>
          <LI>Prazo desejado está fora do que o banco oferece.</LI>
          <LI>Estrutura quer indexador específico (IPCA+ vs CDI+) que banco rejeita.</LI>
          <LI>Produtor está consolidando dívidas (várias CPRs/contratos viram um único Fiagro com prazo melhor).</LI>
        </UL>
      </Callout>

      <H2 id="exemplo">Exemplo — fazenda 5.000 ha consolidando dívidas</H2>
      <KV
        items={[
          { k: 'Cenário', v: 'Fazenda 5.000 ha de soja/milho safrinha com 6 dívidas em diferentes bancos somando R$ 28 mi, prazo médio 18 meses' },
          { k: 'Solução estruturada', v: 'Emissão de CPR Financeira de R$ 28 mi e cessão a Fiagro-FIDC' },
          { k: 'Prazo nova operação', v: '4 anos com 1 ano de carência' },
          { k: 'Indexador', v: 'IPCA + 8 % a.a. (rating BBB)' },
          { k: 'Garantias', v: 'PRA (Patrimônio Rural em Afetação) sobre 1.500 ha + aval pessoal' },
          { k: 'Resultado', v: 'Redução do custo financeiro médio de ~19% para ~13% e alongamento do prazo médio de 18 para 48 meses' },
          { k: 'Impacto no caixa', v: 'Folga de R$ 4 mi/ano nos primeiros 2 anos — viabiliza retomada operacional' },
        ]}
      />

      <H2 id="riscos">Riscos do Fiagro para o produtor</H2>
      <UL>
        <LI><Strong>Cláusulas de aceleração</Strong>: Fiagros têm covenants financeiros (ex: DSCR mínimo, dívida/EBITDA). Quebrar covenant = vencimento antecipado.</LI>
        <LI><Strong>Custo de estruturação</Strong>: emissão custa 1-3% do volume (advogados, agência classificadora, custodiante, B3). Não cabe em volumes pequenos.</LI>
        <LI><Strong>Disclosure</Strong>: dados do produtor (faturamento, dívida, ativos) ficam disclosados aos cotistas. Para muitos produtores, isso é desconfortável.</LI>
      </UL>

      <FAQ
        items={[
          {
            q: 'Fiagro é melhor que banco?',
            a: 'Não é "melhor", é diferente. Banco é mais ágil, mais barato em volumes pequenos, mais previsível. Fiagro abre captação para volumes grandes, prazos longos e estruturas customizadas. A estratégia certa é usar os dois — banco para o curto, Fiagro para o estrutural.',
          },
          {
            q: 'Posso vender minha fazenda para um Fiagro-FII e arrendar de volta?',
            a: 'Pode — operação chama-se sale-leaseback. Comum em fazendas em estresse financeiro: monetiza o ativo terra, paga as dívidas, e mantém a operação como arrendatário. Tem implicações tributárias e operacionais — exige análise cuidadosa.',
          },
          {
            q: 'O Fiagro paga taxa subsidiada como o Pronamp?',
            a: 'Não. Fiagro é mercado livre — taxa de mercado, sem equalização do Tesouro. A vantagem do Fiagro é prazo, volume e flexibilidade, não taxa.',
          },
        ]}
      />
    </EduLayout>
  )
}

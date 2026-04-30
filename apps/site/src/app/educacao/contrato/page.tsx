import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, H3, P, UL, LI, Strong, Callout, Table, KV, FAQ, Code } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Anatomia do contrato rural · Educação ALETIS',
  description: 'Como ler um contrato de crédito rural: CET, IOF, encargos, Price vs SAC, juros remuneratórios e moratórios, comissão de permanência.',
  alternates: { canonical: 'https://aletis.com.br/educacao/contrato' },
}

export default function ContratoPage() {
  return (
    <EduLayout
      titulo="Anatomia do contrato rural"
      subtitulo="O documento de 30 páginas que ninguém lê — e que define se você vai pagar 9% ou 14% pela mesma operação. Cláusula a cláusula."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Anatomia do contrato' },
      ]}
      prev={{ label: 'Direitos', href: '/educacao/direitos' }}
      next={{ label: 'Comparativos', href: '/educacao/comparativos' }}
      fontes={[
        { label: 'Bacen — Custo Efetivo Total (CET)', href: 'https://www.bcb.gov.br/cidadaniafinanceira/cet' },
        { label: 'Resolução CMN 4.196/2013 — CET', href: 'https://www.bcb.gov.br/estabilidadefinanceira/buscanormas' },
        { label: 'Lei 10.931/04 — CCB', href: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.931.htm' },
      ]}
    >
      <Lead>
        Um contrato de crédito rural típico tem 30-50 páginas. Quase nenhum produtor lê. <Strong>Cinco blocos</Strong> definem o custo real da operação — e três deles permitem questionamento posterior. Saber ler é o primeiro filtro contra surpresa.
      </Lead>

      <H2 id="bloco-1">Bloco 1 — Identificação e finalidade</H2>
      <P>Quem, quanto, para quê, quando.</P>
      <UL>
        <LI><Strong>Mutuário</Strong> — nome completo, CPF/CNPJ, qualificação completa.</LI>
        <LI><Strong>Mutuante</Strong> — banco, com agência e CNPJ.</LI>
        <LI><Strong>Valor</Strong> — principal contratado.</LI>
        <LI><Strong>Finalidade</Strong> — Custeio (com plano de safra anexo), Investimento (com cronograma físico-financeiro), Comercialização ou Industrialização.</LI>
        <LI><Strong>Programa</Strong> — Pronaf, Pronamp, Moderfrota, ABC+, etc. Define a taxa equalizada.</LI>
      </UL>
      <Callout tone="warn" title="Atenção 1">
        Finalidade declarada errada = desvio de finalidade = vencimento antecipado e perda do subsídio. Não aceite "assinar agora e detalhar depois".
      </Callout>

      <H2 id="bloco-2">Bloco 2 — Encargos financeiros</H2>
      <P>O coração do contrato. Os 4 elementos que definem o custo:</P>

      <Table
        caption="Os 4 encargos financeiros típicos"
        headers={['Encargo', 'O que é', 'Limites legais']}
        rows={[
          [<Strong key="1">Juros remuneratórios</Strong>, 'Remuneração pelo capital — taxa nominal anual', 'Livre em banco (Súmula 596 STJ); CMN tabela em programas controlados'],
          [<Strong key="2">Juros moratórios</Strong>, 'Encargo após inadimplência', 'Máximo 12% a.a. + multa 2%, conforme CDC e jurisprudência'],
          [<Strong key="3">Multa contratual</Strong>, 'Penalidade por inadimplência', 'Máximo 2% (CDC art. 52 §1º)'],
          [<Strong key="4">Comissão de permanência</Strong>, 'Encargo do período de inadimplência', 'Não pode cumular com outros (Súmula 472 STJ)'],
        ]}
      />

      <Callout tone="danger" title="Cumulação ilegal">
        Banco que cobra <Strong>juros moratórios + multa + comissão de permanência + correção</Strong> está cumulando indevidamente. Súmula 472 STJ: comissão de permanência substitui — não soma.
      </Callout>

      <H2 id="bloco-3">Bloco 3 — Sistema de amortização</H2>

      <H3>Tabela Price (parcela igual)</H3>
      <UL>
        <LI>Parcela fixa do início ao fim.</LI>
        <LI>Início: pagamento concentrado em juros.</LI>
        <LI>Fim: pagamento concentrado em principal.</LI>
        <LI>Juros totais maiores que SAC ao longo da vida do contrato.</LI>
        <LI>Comum em Investimento longo (Moderfrota, BNDES Rural).</LI>
      </UL>

      <H3>SAC (parcela decrescente)</H3>
      <UL>
        <LI>Amortização fixa de principal a cada parcela.</LI>
        <LI>Parcela total alta no início, baixa no fim.</LI>
        <LI>Juros totais menores que Price.</LI>
        <LI>Comum em Custeio e operações curtas.</LI>
      </UL>

      <Callout tone="tip" title="Comparação direta">
        Em uma operação de R$ 1 mi por 7 anos a 12% a.a., a diferença entre Price e SAC é de aproximadamente <Strong>R$ 95 mil em juros pagos a mais</Strong> na Price. Se o caixa permitir parcelas decrescentes (mais altas no início), <Strong>sempre escolha SAC</Strong>.
      </Callout>

      <H2 id="bloco-4">Bloco 4 — IOF e CET</H2>
      <P>
        <Strong>IOF — Imposto sobre Operações Financeiras</Strong>: alíquota 0,38% (fixa) + 0,0082% ao dia (variável) sobre o saldo. Em Custeio rural, IOF é reduzido a 0%.
      </P>
      <P>
        <Strong>CET — Custo Efetivo Total</Strong>: a taxa única que engloba juros + IOF + tarifas + seguro obrigatório. <Strong>É o número que importa</Strong>. Bacen exige sua divulgação obrigatória pré-contrato (Resolução 4.196/13).
      </P>
      <Callout tone="info" title="Sempre exija o CET por escrito antes de assinar">
        O CET sempre é maior que a taxa nominal divulgada (10% a.a. nominal vira 11,5% CET por causa dos acessórios). Se o banco hesita em fornecer o CET, peça por escrito — é direito do consumidor.
      </Callout>

      <H2 id="bloco-5">Bloco 5 — Garantias</H2>
      <P>O que o banco toma se você não pagar.</P>
      <UL>
        <LI><Strong>Penhor</Strong>: produto agrícola, animais, maquinário. Banco fica como credor pignoratício, mas posse fica com produtor.</LI>
        <LI><Strong>Hipoteca rural</Strong>: registro em cartório de imóveis. Execução judicial, demorada (1-3 anos).</LI>
        <LI><Strong>Alienação fiduciária</Strong>: bem fica em nome do banco como proprietário fiduciário até o pagamento. Execução extrajudicial muito rápida (60-180 dias).</LI>
        <LI><Strong>Aval</Strong>: terceiro garantidor responde solidariamente. Comum exigir aval de cônjuge.</LI>
      </UL>
      <Callout tone="warn" title="Negocie a ordem de excussão">
        Cláusula que permite o banco "escolher qual bem executar primeiro" é desfavorável. O ideal é estabelecer ordem (primeiro o bem alienado, depois aval, depois hipoteca, etc.) — protege patrimônio em caso de default parcial.
      </Callout>

      <H2 id="exemplo">Exemplo — Custeio R$ 1 mi, 12 meses</H2>
      <KV
        items={[
          { k: 'Programa', v: 'Pronamp' },
          { k: 'Taxa nominal', v: '9,5 % a.a. (após bônus 0,5 p.p.)' },
          { k: 'IOF', v: 'Isento (Custeio rural)' },
          { k: 'Tarifa de cadastro', v: 'R$ 280 (única)' },
          { k: 'Seguro Proagro Mais', v: '~R$ 28 mil (2,8% do principal)' },
          { k: 'CET nominal', v: '~12,8 % a.a.' },
          { k: 'Total a pagar em 12m', v: 'R$ 1.128.000' },
          { k: 'Cláusula moratória', v: 'Juros 12% a.a. + multa 2%' },
        ]}
      />

      <H2 id="cuidados">5 cuidados antes de assinar</H2>
      <UL>
        <LI><Strong>Compare o CET</Strong>, não a taxa nominal. Banco joga com a nominal.</LI>
        <LI><Strong>Negocie tarifa de cadastro</Strong> e tarifas eventuais — em operação acima de R$ 500 mil, é negociável.</LI>
        <LI><Strong>Recuse cláusulas de "venda casada"</Strong> com seguro de vida ou capitalização sem necessidade.</LI>
        <LI><Strong>Leia a cláusula de vencimento antecipado</Strong>: gatilhos como "queda de produtividade" abrem brecha para o banco quebrar contrato unilateralmente.</LI>
        <LI><Strong>Verifique a cláusula de remuneração</Strong>: alguns contratos preveem reajustes automáticos por TR ou Selic — em ambiente de juros altos, vira armadilha.</LI>
      </UL>

      <FAQ
        items={[
          {
            q: 'Posso negociar cláusulas de contrato bancário padrão?',
            a: 'Pode, mas há limites práticos. Cláusulas dos programas controlados (Plano Safra) seguem norma do CMN — taxa não negocia. Mas tarifas, multas, ordem de excussão, exigência de avalista, vencimento antecipado e cláusulas de fiscalização são todas negociáveis em volumes acima de R$ 500 mil.',
          },
          {
            q: 'O contrato pode mudar a taxa depois de assinado?',
            a: 'Não, a menos que o contrato seja "pós-fixado" (vinculado a Selic, CDI, IPCA). Em programas controlados a taxa é prefixada, definida no momento da assinatura, e o banco não pode alterar unilateralmente.',
          },
          {
            q: 'Quanto tempo guardar o contrato após quitar?',
            a: 'No mínimo 5 anos após quitação (prazo prescricional do CC). A ALETIS recomenda guardar 10 anos com cópia digital — ainda há repetição de indébito viável até 5 anos depois da quitação se houver cobrança abusiva identificada.',
          },
        ]}
      />
    </EduLayout>
  )
}

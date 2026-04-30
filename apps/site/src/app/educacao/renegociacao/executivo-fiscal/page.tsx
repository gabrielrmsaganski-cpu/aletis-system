import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, Step, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Execução fiscal e judicial — primeiros 30 dias · Educação ALETIS',
  description: 'O que fazer quando o banco ou a PGFN ajuíza execução. Prazo de 5 dias, embargos, exceção de pré-executividade.',
  alternates: { canonical: 'https://aletis.com.br/educacao/renegociacao/executivo-fiscal' },
}

export default function ExecutivoFiscal() {
  return (
    <EduLayout
      titulo="Execução fiscal e judicial — primeiros 30 dias"
      subtitulo="Quando a citação chega, o relógio começa. O que fazer no prazo de 5 dias e como os 30 dias seguintes definem o desfecho."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Renegociação', href: '/educacao/renegociacao' },
        { label: 'Execução' },
      ]}
      prev={{ label: 'Abusividade', href: '/educacao/renegociacao/abusividade' }}
      next={{ label: 'Direitos do produtor', href: '/educacao/direitos' }}
      fontes={[
        { label: 'Lei 6.830/80 — Execução Fiscal', href: 'https://www.planalto.gov.br/ccivil_03/leis/l6830.htm' },
        { label: 'CPC — Lei 13.105/15 (execução por título extrajudicial)', href: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm' },
      ]}
    >
      <Lead>
        Quando o oficial de justiça aparece com mandado de citação, o produtor entra em processo executivo — e <Strong>o prazo de 5 dias para pagamento começa imediatamente</Strong>. Saber o que fazer (e o que NÃO fazer) nesses primeiros 30 dias define se o caso vai virar tragédia ou negociação ordenada.
      </Lead>

      <H2 id="diferenca">Execução fiscal vs execução comum (banco)</H2>
      <UL>
        <LI><Strong>Execução fiscal</Strong> (Lei 6.830/80) — quando credor é Fazenda (PGFN, Estadual, Municipal). CDA — Certidão de Dívida Ativa serve de título.</LI>
        <LI><Strong>Execução por título extrajudicial</Strong> (CPC) — quando credor é banco, com base em CCB, cédula rural, CPR registrada.</LI>
      </UL>

      <H2 id="primeiros-passos">O que fazer nos primeiros 30 dias</H2>

      <Step n={1} title="Dia 1 a 3 — Validar a citação e identificar o título">
        Confirme se a citação é válida (assinatura sua, endereço correto, mandado completo). Pegue cópia do título (CCB/CDA). Identifique credor, valor, fundamento.
      </Step>
      <Step n={2} title="Dia 3 a 5 — Decidir sobre pagamento">
        Pelo CPC art. 829, executado tem <Strong>3 dias</Strong> para pagar com 50% de redução de honorários. Se a dívida é certa e há caixa, pagar nesse prazo é a opção mais barata.
      </Step>
      <Step n={3} title="Dia 5 a 15 — Garantir o juízo (se for embargar)">
        Para embargar à execução, é preciso <Strong>garantir o juízo</Strong>: depósito em dinheiro, fiança bancária, seguro garantia ou penhora. Sem garantia, embargos não são recebidos.
      </Step>
      <Step n={4} title="Dia 15 a 30 — Embargos ou exceção de pré-executividade">
        <UL>
          <LI><Strong>Embargos</Strong>: ação autônoma com cognição ampla. Permite alegar tudo (abusividade, prescrição, excesso de execução, ilegitimidade).</LI>
          <LI><Strong>Exceção de pré-executividade</Strong>: só matéria de ordem pública (prescrição, ilegitimidade, falta de título). Não suspende.</LI>
        </UL>
      </Step>

      <H2 id="penhora-online">Penhora online — o BacenJud (atual SisbaJud)</H2>
      <P>
        Em execuções, o juiz autoriza pesquisa de ativos pelo SisbaJud — sistema integrado que busca dinheiro em conta corrente do executado em todos os bancos. <Strong>Bloqueio é online, sem aviso</Strong>. Pode "esvaziar" a conta em 30 minutos.
      </P>
      <Callout tone="warn" title="Como mitigar">
        <UL>
          <LI>Não deixar saldo significativo em conta corrente do CPF/CNPJ executado.</LI>
          <LI>Verba salarial e impenhorável (CPC art. 833) — pode ser desbloqueada por petição.</LI>
          <LI>Se a conta é da família, há jurisprudência protegendo conta com benefício de assistência ou subsistência.</LI>
        </UL>
      </Callout>

      <H2 id="impenhorabilidade">Impenhorabilidade da pequena propriedade rural</H2>
      <P>
        A <Strong>Constituição art. 5º XXVI</Strong> e a <Strong>Lei 8.009/90</Strong> protegem a pequena propriedade rural trabalhada pela família — desde que devidamente comprovada. Detalhes no eixo Direitos do Produtor.
      </P>

      <H2 id="tatica">Tática quando o caso é negociável</H2>
      <UL>
        <LI><Strong>Não esperar a citação</Strong> para mover. Se você sabe que vai vir execução, antecipa a transação ou negociação.</LI>
        <LI><Strong>Garantia do juízo via seguro garantia</Strong> custa 1-3% do valor/ano e libera caixa. Banco aceita; juiz aceita.</LI>
        <LI><Strong>Pré-executividade pode suspender em parte</Strong>: se a tese é prescrição parcial, o juiz pode reconhecer e mandar requalificar valor — ganhando meses.</LI>
        <LI><Strong>Em PGFN, transação simultânea com embargos</Strong>: aderir à transação extingue a execução (na parte transacionada) e libera o juízo.</LI>
      </UL>

      <FAQ
        items={[
          {
            q: 'Posso ignorar a citação e fingir que não recebi?',
            a: 'Pode, mas a revelia em execução é catastrófica. O processo segue, penhora acontece, hasta pública é marcada — e o devedor perde o direito de defesa. Citado é citado, há que reagir.',
          },
          {
            q: 'Banco pode tomar minha fazenda inteira por uma dívida menor?',
            a: 'Penhora deve respeitar gradação (CPC art. 835): dinheiro, ações, imóveis sem moradia, seguidos de outros bens. A residência e a pequena propriedade rural trabalhada pela família são impenhoráveis (com prova). Penhora desproporcional é defesável judicialmente.',
          },
        ]}
      />
    </EduLayout>
  )
}

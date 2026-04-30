import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, H3, P, UL, LI, Strong, Callout, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'CAR, ITR e IRPF — obrigações que protegem · Educação ALETIS',
  description: 'CAR ativo, ITR pago, IRPF correto. As três obrigações que destravam crédito, defendem em execução e provam boa-fé.',
  alternates: { canonical: 'https://aletis.com.br/educacao/direitos/car-itr-irpf' },
}

export default function CARITRIRPF() {
  return (
    <EduLayout
      titulo="CAR, ITR e IRPF — obrigações que protegem"
      subtitulo="Tem produtor que vê CAR, ITR e IRPF como burocracia. Errado: são as três obrigações que mais destravam crédito, defendem em execução e fundamentam direitos."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Direitos', href: '/educacao/direitos' },
        { label: 'CAR, ITR, IRPF' },
      ]}
      prev={{ label: 'Súmulas STJ', href: '/educacao/direitos/sumulas-stj' }}
      next={{ label: 'Anatomia do contrato', href: '/educacao/contrato' }}
      fontes={[
        { label: 'CAR — Sistema oficial Sicar', href: 'https://www.car.gov.br/' },
        { label: 'Lei 12.651/2012 — Código Florestal', href: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651.htm' },
        { label: 'Receita Federal — ITR', href: 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/itr' },
      ]}
    >
      <Lead>
        Três obrigações simples — CAR, ITR e IRPF — fazem mais pelo produtor que muito advogado. Em dia, abrem crédito subsidiado, defendem em execução e provam boa-fé na renegociação. Em atraso, tudo trava.
      </Lead>

      <H2 id="car">CAR — Cadastro Ambiental Rural</H2>
      <P>
        Criado pela <Strong>Lei 12.651/2012</Strong> (Código Florestal), é o registro georreferenciado obrigatório para todo imóvel rural. <Strong>Sem CAR ativo, banco não libera nenhum crédito rural.</Strong> Sem CAR ativo, sua propriedade fica em situação irregular para o IBAMA, secretaria estadual e Receita Federal.
      </P>

      <H3>Status do CAR</H3>
      <UL>
        <LI><Strong>Cadastrado</Strong>: você inscreveu mas ainda está em análise. Aceito para crédito.</LI>
        <LI><Strong>Análise pendente</Strong>: estado vai revisar. Aceito.</LI>
        <LI><Strong>Em PRA (Programa de Regularização Ambiental)</Strong>: você assinou termo de regularização. Aceito.</LI>
        <LI><Strong>Cancelado/Suspenso</Strong>: bloqueia crédito imediatamente.</LI>
      </UL>

      <Callout tone="warn" title="Atenção 2026">
        Estados estão implementando o <Strong>SiCAR 3.0</Strong> com cruzamento de dados de imagens de satélite (Mapbiomas, INPE) — irregularidade ambiental fica visível e o CAR pode ser suspenso de ofício. Manter o CAR atualizado e respeitar a Reserva Legal/APP é critério inegociável.
      </Callout>

      <H2 id="itr">ITR — Imposto sobre a Propriedade Territorial Rural</H2>
      <P>
        Imposto federal anual sobre a propriedade rural. Declarado entre agosto e setembro pelo proprietário/possuidor.
      </P>
      <UL>
        <LI><Strong>Não declarar</Strong> = multa de 1% sobre o valor declarado, mínimo R$ 50.</LI>
        <LI><Strong>Não pagar</Strong> = inscrição em dívida ativa após 5 anos, virando crédito da PGFN com Selic + 1%.</LI>
        <LI><Strong>Inadimplente em ITR não acessa Plano Safra</Strong> — banco exige certidão de regularidade.</LI>
        <LI><Strong>Reservas legais e APPs</Strong> declaradas no ITR <Strong>não são tributadas</Strong> — incentivo direto à conservação.</LI>
      </UL>

      <H2 id="irpf">IRPF — Imposto de Renda Pessoa Física</H2>
      <P>
        Para o produtor PF, o IRPF é o <Strong>retrato oficial da renda</Strong>. Banco usa para enquadrar Pronaf/Pronamp/demais. PGFN usa para classificar capacidade de pagamento na transação. Justiça usa para definir mínimo existencial.
      </P>
      <UL>
        <LI><Strong>Receita rural</Strong> deve ser declarada no Anexo da Atividade Rural — apuração específica com 20% de presunção de despesa em "operação simplificada".</LI>
        <LI><Strong>Despesa real</Strong> exige escrituração (Livro Caixa do Produtor Rural), mas permite deduzir 100% das despesas operacionais — em geral mais vantajoso para produtor de porte médio/grande.</LI>
        <LI><Strong>Funrural</Strong>: 1,2% de contribuição patronal sobre comercialização — separado do IRPF.</LI>
      </UL>

      <H2 id="estrategia">Estratégia: as 3 em conjunto</H2>
      <Callout tone="ok" title="Por que importa estarem alinhadas">
        Em uma execução, em uma transação PGFN ou em um pedido de superendividamento, as três precisam contar a mesma história:
        <UL>
          <LI><Strong>CAR</Strong> ativo confirma que o imóvel é regular ambientalmente — fundamenta a impenhorabilidade da pequena propriedade.</LI>
          <LI><Strong>ITR</Strong> declarado e pago confirma área, atividade e valor.</LI>
          <LI><Strong>IRPF</Strong> coerente comprova renda e enquadramento.</LI>
        </UL>
        Quando os três batem, você tem boa-fé documentada. Quando não batem, qualquer credor desconfia e qualquer juiz hesita.
      </Callout>

      <FAQ
        items={[
          {
            q: 'Estou atrasado em ITR de 5 anos. Como regularizar?',
            a: 'O ITR atrasado pode entrar na transação tributária PGFN (modalidade pequeno valor ou capacidade de pagamento, dependendo do montante). Se ainda não foi inscrito em DAU, entre em parcelamento simplificado direto na Receita Federal — menos burocracia.',
          },
          {
            q: 'Meu CAR está suspenso por sobreposição com unidade de conservação. O que fazer?',
            a: 'Caso comum em fronteira agrícola. Caminho: ação declaratória de domínio + parecer técnico de georreferenciamento + retificação no Sicar. Trabalho longo (12-24 meses), mas é o único caminho. Há advogados especializados em direito ambiental rural.',
          },
          {
            q: 'IRPF "simplificado" (20% presunção) ou "completo" (livro caixa)?',
            a: 'Para faturamento até R$ 250 mil/ano, simplificado costuma ser mais simples e cabível. Para faturamento maior — especialmente em soja/milho onde despesa real ultrapassa 70% — livro caixa reduz mais imposto. Sempre passar por contador.',
          },
        ]}
      />
    </EduLayout>
  )
}

import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Moderfrota — Modernização da Frota Agrícola · Educação ALETIS',
  description: 'Moderfrota 2025/26: taxas 8,5% a 13,5%, financiamento até R$ 4 mi, prazo 7 anos. Tratores, colhedoras, pulverizadores.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/moderfrota' },
}

export default function ModerfrotaPage() {
  return (
    <ProgramTemplate
      slug="moderfrota"
      nome="Moderfrota — Modernização da Frota Agrícola"
      subtitulo="O programa carro-chefe para máquinas: trator, colhedora, plantadeira, pulverizador. Subsidiado pelo Tesouro via BNDES."
      lead={
        <>
          Programa de financiamento de <Strong>tratores, colhedoras e implementos novos</Strong> (e seminovos com restrição). Operado via BNDES — conta com equalização do Tesouro Nacional. Em 2025/26 sofreu o maior reajuste de taxa do Plano Safra: para grandes produtores, subiu de 8,5% (24/25) para <Strong>13,5%</Strong>.
        </>
      }
      publicoAlvo={
        <>
          Produtor rural pessoa física ou jurídica e cooperativas de produção. Há diferenciação <Strong>pequeno produtor</Strong> (taxa menor) vs <Strong>demais</Strong>. Pequeno é normalmente quem se enquadra no Pronaf ou Pronamp.
        </>
      }
      finalidades={[
        { finalidade: 'Tratores, colhedoras, autopropelidos novos', taxa: '8,5 % a 13,5 %', limite: 'R$ 4 mi', prazo: '7 anos' },
        { finalidade: 'Plataformas, plantadeiras, semeadoras', taxa: '8,5 % a 13,5 %', limite: 'R$ 4 mi', prazo: '7 anos' },
        { finalidade: 'Pulverizadores e equipamentos sanitários', taxa: '8,5 % a 13,5 %', limite: 'R$ 4 mi', prazo: '7 anos' },
        { finalidade: 'Equipamentos seminovos certificados', taxa: '13,5 %', limite: 'R$ 4 mi', prazo: '5 anos', obs: 'Até 8 anos de uso' },
        { finalidade: 'Pequeno produtor', taxa: '8,5 %', limite: 'até R$ 1,5 mi', prazo: '7 anos' },
      ]}
      caracteristicas={[
        { k: 'Operador', v: 'BNDES (via banco repassador: BB, Caixa, Itaú, Santander, Bradesco, BRDE, BNB)' },
        { k: 'Garantia obrigatória', v: 'Alienação fiduciária do bem financiado' },
        { k: 'Garantia complementar', v: 'Hipoteca rural ou aval, conforme volume' },
        { k: 'Carência', v: 'Até 14 meses (varia por banco repassador)' },
        { k: 'Tipo de juros', v: 'Pré-fixado (a taxa do contrato)' },
        { k: 'Sistema de amortização', v: 'Price (parcela igual) ou SAC, escolhido pelo produtor' },
      ]}
      vantagens={[
        <>Taxa subsidiada — em 2025/26 ainda é melhor que recurso livre (~17-20%) mesmo nos 13,5%.</>,
        <>Carência permite alinhar parcela com calendário de safra.</>,
        <>Tratativa rápida em fabricantes credenciados (financeiras de fábrica) para máquinas novas.</>,
        <>Pode ser combinado com Custeio Pronamp na mesma propriedade.</>,
      ]}
      limitacoes={[
        <>Reajuste de 5 p.p. (8,5%→13,5%) em 2025/26 mata a vantagem de subsídio para grandes — comparar com Finame fabricante.</>,
        <>Bem fica alienado ao banco — você não pode vender enquanto durar a operação sem quitar.</>,
        <>Manutenção fora da concessionária autorizada pode invalidar garantia da máquina.</>,
        <>Seguro do bem é obrigatório durante todo o contrato (custo extra ~2-4% a.a. do valor).</>,
      ]}
      exemplo={{
        titulo: 'Trator 165 CV — produtor empresarial',
        items: [
          { k: 'Bem', v: 'Trator novo, 165 CV, R$ 750.000' },
          { k: 'Programa', v: 'Moderfrota — demais produtores' },
          { k: 'Taxa', v: '13,5 % a.a.' },
          { k: 'Prazo', v: '7 anos' },
          { k: 'Sistema', v: 'Price' },
          { k: 'Parcela anual', v: '~R$ 170.000' },
          { k: 'Total pago', v: 'R$ 1,19 mi (juros + principal)' },
          { k: 'Juros totais', v: 'R$ 442 mil (~59% do valor)' },
        ],
      }}
      faq={[
        {
          q: 'Vale a pena Moderfrota a 13,5% em 2025/26?',
          a: 'Depende. Se a alternativa é capital de giro a 18-22%, sim. Se é Finame Fabricante (taxa que algumas fabricantes oferecem para liquidar estoque) abaixo de 13%, talvez não. Sempre simule os dois caminhos.',
        },
        {
          q: 'Posso usar Moderfrota para máquina seminova?',
          a: 'Sim, mas com limitações: até 8 anos de uso, com revisão completa em concessionária autorizada e CR de revisão. Taxa única 13,5% (não há faixa de pequeno produtor para seminovos). Prazo limitado a 5 anos.',
        },
      ]}
      prev={{ label: 'Pronamp', href: '/educacao/programas/pronamp' }}
      next={{ label: 'Inovagro', href: '/educacao/programas/inovagro' }}
      fontes={[
        { label: 'BNDES — Moderfrota', href: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/credito-rural/moderfrota' },
      ]}
    />
  )
}

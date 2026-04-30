import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Procap-Agro — Capital de Giro de Cooperativas · Educação ALETIS',
  description: 'Procap-Agro: capital de giro para cooperativas singulares. Taxa 11,5% e teto R$ 65 mi.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/procap-agro' },
}

export default function ProcapAgroPage() {
  return (
    <ProgramTemplate
      slug="procap-agro"
      nome="Procap-Agro — Capital de Giro do Cooperativismo"
      subtitulo="Para a cooperativa pagar o cooperado à vista e estocar/processar gradualmente. Liquidez do agro cooperativista."
      lead={
        <>
          Cooperativa que recebe a safra dos cooperados precisa pagar à vista, mas só vende o produto industrializado/comercializado meses depois. O <Strong>Procap-Agro</Strong> financia esse vão de caixa — é o capital de giro estrutural do cooperativismo de produção.
        </>
      }
      publicoAlvo={
        <>Cooperativas singulares e centrais de produção agropecuária.</>
      }
      finalidades={[
        { finalidade: 'Capital de giro para industrialização', taxa: '11,5 %', limite: 'R$ 65 mi', prazo: '4 anos' },
        { finalidade: 'Compra da produção dos cooperados', taxa: '11,5 %', limite: 'R$ 65 mi', prazo: '4 anos' },
        { finalidade: 'Recomposição de capital social/recursos', taxa: '11,5 %', limite: 'R$ 65 mi', prazo: '4 anos' },
        { finalidade: 'Antecipação de pagamento do cooperado', taxa: '11,5 %', limite: 'R$ 65 mi', prazo: '4 anos' },
      ]}
      caracteristicas={[
        { k: 'Operador', v: 'BNDES via banco repassador' },
        { k: 'Garantia', v: 'Aval da diretoria + caução de recebíveis (saldos com cooperados, contas a receber)' },
        { k: 'Combina com', v: 'Prodecoop (industrialização) + PCA (armazém)' },
      ]}
      vantagens={[
        <>Taxa <Strong>11,5%</Strong> — bem abaixo do que cooperativa toma em capital de giro livre (16-20%).</>,
        <>Permite operação de "compra à vista" do cooperado em ano de preço bom — preserva relacionamento e produção.</>,
        <>Recomposição de capital social: linha que não existe em outros programas — solução para cooperativa em estresse.</>,
      ]}
      limitacoes={[
        <>Exclusivo cooperativa — produtor individual não acessa.</>,
        <>Caução de recebíveis exige assembleia ou aprovação dos cooperados (depende do estatuto).</>,
        <>Limite por CNPJ da cooperativa — central com várias singulares precisa estruturar.</>,
      ]}
      faq={[
        {
          q: 'Cooperativa pode acumular Procap-Agro + Prodecoop + PCA?',
          a: 'Sim, e essa é a combinação clássica do cooperativismo bem estruturado. Cada programa tem teto independente: até R$ 65 mi (Procap) + R$ 80 mi (Prodecoop) + R$ 50 mi (PCA) = R$ 195 mi por cooperativa, em condições subsidiadas.',
        },
      ]}
      prev={{ label: 'PCA', href: '/educacao/programas/pca' }}
      next={{ label: 'Funcafé', href: '/educacao/programas/funcafe' }}
      fontes={[
        { label: 'BNDES — Procap-Agro', href: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/credito-rural/procap-agro' },
      ]}
    />
  )
}

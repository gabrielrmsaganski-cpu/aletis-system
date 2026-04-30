import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, Table } from '@/components/educacao/Prose'
import { ProgramCard } from '@/components/educacao/ProgramCard'
import { programsData } from '@/components/educacao/programs.data'

export const metadata: Metadata = {
  title: 'Programas oficiais do Plano Safra · Educação ALETIS',
  description:
    'Pronaf, Pronamp, Moderfrota, Inovagro, ABC+, PCA, Procap-Agro, Funcafé, Prodecoop, Moderagro e Proirriga. Taxas, limites, prazos e quando usar cada um.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas' },
}

export default function Programas() {
  return (
    <EduLayout
      titulo="Programas oficiais do Plano Safra"
      subtitulo="Onze programas, cada um com público, taxa, limite e finalidade próprios. Saber qual é o seu antes de ir ao banco economiza meses e dezenas de milhares de reais."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Programas oficiais' },
      ]}
      prev={{ label: 'Crédito Rural', href: '/educacao/credito-rural' }}
      next={{ label: 'Pronaf', href: '/educacao/programas/pronaf' }}
      fontes={[
        { label: 'Mapa — Plano Safra 2025/26', href: 'https://www.gov.br/agricultura/pt-br/assuntos/politica-agricola/credito-rural' },
        { label: 'BNDES — Linhas de Crédito Rural', href: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/credito-rural' },
        { label: 'CMN — Resolução 5.234/2025', href: 'https://www.bcb.gov.br/estabilidadefinanceira/buscanormas' },
      ]}
    >
      <Lead>
        Cada programa do Plano Safra existe para um <Strong>perfil + finalidade</Strong>. Tomar pelo programa errado significa pagar mais juros do que você precisava — ou ter a operação rejeitada por falta de enquadramento.
      </Lead>

      <H2 id="enquadramento">Enquadramento — qual é o seu</H2>
      <Table
        caption="Decisão rápida: qual programa cabe ao seu perfil"
        headers={['Perfil', 'Renda bruta anual', 'Programa elegível']}
        rows={[
          ['Agricultura familiar', 'até R$ 500 mil', 'Pronaf'],
          ['Médio produtor', 'R$ 500 mil – R$ 3,5 mi', 'Pronamp'],
          ['Demais produtores PF/PJ', 'acima de R$ 3,5 mi', 'BNDES Rural / Moderfrota / Inovagro / ABC+ / PCA'],
          ['Cooperativa de produção', '—', 'Prodecoop, Procap-Agro'],
          ['Cafeicultor', '—', 'Funcafé (independente do porte)'],
          ['Pecuária / fruticultura específica', '—', 'Moderagro'],
          ['Investimento em irrigação', '—', 'Proirriga'],
          ['Sustentabilidade / baixo carbono', '—', 'ABC+'],
        ]}
      />

      <Callout tone="tip" title="Pode somar">
        Um produtor pode ter <Strong>Pronamp Custeio</Strong> + <Strong>Moderfrota Investimento</Strong> + <Strong>PCA armazém</Strong> + <Strong>Funcafé</Strong> simultaneamente — desde que cada um tenha lastro e finalidade própria. O sistema do Bacen cruza limites por programa, não por tomador.
      </Callout>

      <H2 id="lista">Os 11 programas</H2>
      <P>
        Clique em qualquer card para o detalhe completo: taxa exata, limites por finalidade, prazo, carência, garantias usuais e exemplos numéricos.
      </P>

      <div className="grid gap-5 md:grid-cols-2">
        {programsData.map((p) => (
          <ProgramCard key={p.href} data={p} />
        ))}
      </div>

      <H2 id="comparativo-base">O que comparar antes de escolher</H2>
      <UL>
        <LI><Strong>Taxa nominal</Strong> — o número que aparece no contrato.</LI>
        <LI><Strong>CET (Custo Efetivo Total)</Strong> — taxa + IOF + tarifa + seguro obrigatório. Sempre maior que a nominal.</LI>
        <LI><Strong>Carência</Strong> — primeiros meses pagando só juros (ou nada). Crítica em investimentos com formação longa.</LI>
        <LI><Strong>Sistema de amortização</Strong> — Price (parcela igual, juros maiores no total) vs SAC (parcela decrescente, total menor).</LI>
        <LI><Strong>Equalização</Strong> — quanto o Tesouro paga ao banco. Programas com mais equalização têm fila maior e exigem mais documentação.</LI>
      </UL>

      <Callout tone="info" title="Mesa ALETIS">
        Antes de qualquer captação, a equipe ALETIS faz a <Strong>análise de enquadramento múltiplo</Strong> — em qual cesto de programas seu perfil cabe e como combinar para extrair o máximo de subsídio. É a diferença entre tomar Moderfrota a 13,5% ou ficar fora dele e pagar BNDES Rural a 14% — pode parecer pouco, mas em R$ 4 mi por 7 anos são quase R$ 280 mil em juros a mais.
      </Callout>
    </EduLayout>
  )
}

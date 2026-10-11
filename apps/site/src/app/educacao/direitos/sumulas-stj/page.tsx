import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, Strong, Callout, Quote, Table } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Súmulas STJ favoráveis ao produtor · Educação ALETIS',
  description: 'Listagem prática das súmulas e teses do STJ que defendem o produtor rural em operações bancárias.',
  alternates: { canonical: 'https://aletis.com.br/educacao/direitos/sumulas-stj' },
}

export default function SumulasSTJ() {
  return (
    <EduLayout
      titulo="Súmulas STJ favoráveis ao produtor"
      subtitulo="A jurisprudência consolidada que serve como argumento em renegociação e defesa judicial."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Direitos', href: '/educacao/direitos' },
        { label: 'Súmulas STJ' },
      ]}
      prev={{ label: 'Impenhorabilidade rural', href: '/educacao/direitos/impenhorabilidade-rural' }}
      next={{ label: 'CAR, ITR, IRPF', href: '/educacao/direitos/car-itr-irpf' }}
      fontes={[
        { label: 'STJ — Pesquisa de súmulas', href: 'https://scon.stj.jus.br/SCON/' },
      ]}
    >
      <Lead>
        Selecionamos as súmulas STJ <Strong>mais usadas em mesas de renegociação</Strong> e em defesa judicial de produtores rurais. Cada uma é um argumento estabilizado — saber citar mexe com o tom da negociação.
      </Lead>

      <H2 id="quando-aplicar">Quando aplicar</H2>
      <Table
        caption="Mapa rápido — qual súmula serve a qual situação"
        headers={['Súmula', 'Tese', 'Quando usar']}
        rows={[
          ['297 STJ', 'O CDC é aplicável às instituições financeiras', 'Sempre que o credor é banco e o devedor é PF'],
          ['381 STJ', 'Nos contratos bancários, é vedado ao julgador conhecer, de ofício, da abusividade das cláusulas', 'Lembrete: tem que alegar — juiz não revisa sozinho'],
          ['472 STJ', 'Comissão de permanência não cumula com outros encargos', 'Cobrança bancária após inadimplência'],
          ['596 STJ', 'Lei da Usura não se aplica a banco', 'Limite a tese de "limitação a 12% a.a." — defesa fora desse argumento'],
          ['Súmula 233 STJ', 'Contrato de abertura de crédito não é título executivo', 'Bancos tentam executar — defesa pode argüir nulidade'],
          ['Súmula 26 STJ', 'O avalista do título responde solidariamente, ainda que o avalizado seja a esposa do executado', 'Em execuções de aval'],
          ['Súmula 364 STJ', 'O conceito de impenhorabilidade do bem de família abrange o imóvel pertencente a solteiros, separados e viúvos', 'Estendeu Lei 8.009 — não é só para casados com filhos'],
          ['Súmula 449 STJ', 'A vaga de garagem com matrícula própria não constitui bem de família', 'Negativa — não invocar para vaga separada'],
        ]}
      />

      <H2 id="teses-em-formacao">Teses em formação (sem súmula ainda)</H2>
      <Quote source="STJ — REsp 1.751.781/RS (julgamento em curso)">
        A pequena propriedade rural trabalhada pela família, ainda que dada em garantia hipotecária, é impenhorável para débito decorrente da própria atividade produtiva.
      </Quote>
      <Quote source="STJ — Tese 247">
        A capitalização mensal de juros é admitida nos contratos celebrados a partir de 31 de março de 2000 desde que expressamente pactuada.
      </Quote>

      <H2 id="dica-pratica">Dica prática</H2>
      <Callout tone="tip" title="Como usar">
        Em <Strong>negociação</Strong>: levante as súmulas aplicáveis ao seu contrato — o gerente sabe quando você sabe. Muda postura.{' '}
        Em <Strong>defesa judicial</Strong>: peticionar com referência expressa à súmula força o juiz a se posicionar sobre a tese. Tese estabilizada raramente é ignorada.
      </Callout>
    </EduLayout>
  )
}

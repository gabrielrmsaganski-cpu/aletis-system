import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { ReestruturacaoCalc } from '@/components/calculadoras/ReestruturacaoCalc'

export const metadata: Metadata = {
  title: 'Simulador de reestruturação de dívida',
  description:
    'Estime a economia real em um acordo ALETIS. Saldo devedor, perfil de credores e prazo — retorno em tempo real com DSCR projetado.',
}

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="Calculadora 01 · Reestruturação"
        titulo={
          <>
            Quanto você{' '}
            <span className="italic text-aletis-dourado">economizaria</span> em um acordo ALETIS?
          </>
        }
        subtitulo="Simulação baseada em média histórica por perfil de credor, com recálculo de abusividade e descaracterização quando aplicável."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Calculadoras', href: '/calculadoras' },
          { label: 'Reestruturação' },
        ]}
      />
      <Section tone="marfim">
        <Container>
          <ReestruturacaoCalc />
        </Container>
      </Section>
    </>
  )
}

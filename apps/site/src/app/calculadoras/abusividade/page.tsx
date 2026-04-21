import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { AbusividadeCalc } from '@/components/calculadoras/AbusividadeCalc'

export const metadata: Metadata = {
  title: 'Detector de abusividade contratual',
  description:
    'Compare a taxa contratada com a taxa subsidiada da época e identifique risco revisional. Súmulas STJ 93, 296 e Res. BCB 4.966/21.',
}

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="Calculadora 03 · Revisional"
        titulo={
          <>
            Seu contrato{' '}
            <span className="italic text-aletis-dourado">pode ser revisado?</span>
          </>
        }
        subtitulo="Compara a taxa contratada com o PRONAMP da época e identifica anatocismo e descaracterização. Score revisional em tempo real."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Calculadoras', href: '/calculadoras' },
          { label: 'Abusividade' },
        ]}
      />
      <Section tone="marfim">
        <Container>
          <AbusividadeCalc />
        </Container>
      </Section>
    </>
  )
}

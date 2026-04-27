import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { CapacidadeSafraCalc } from '@/components/calculadoras/CapacidadeSafraCalc'

export const metadata: Metadata = {
  title: 'Capacidade de pagamento safra',
  description:
    'Calcule quanto de dívida sua próxima safra suporta. DSCR projetado, stress test de −15% no preço e capacidade máxima de serviço da dívida.',
  alternates: { canonical: '/calculadoras/capacidade-safra' },
}

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="Calculadora 02 · Safra"
        titulo={
          <>
            Sua safra{' '}
            <span className="italic text-aletis-dourado">segura</span> a dívida atual?
          </>
        }
        subtitulo="Modelo DSCR com stress test de preço. Veja se o fluxo projetado cobre as parcelas e qual o teto saudável de endividamento anual."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Calculadoras', href: '/calculadoras' },
          { label: 'Capacidade Safra' },
        ]}
      />
      <Section tone="marfim">
        <Container>
          <CapacidadeSafraCalc />
        </Container>
      </Section>
    </>
  )
}

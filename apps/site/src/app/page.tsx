import { Hero } from '@/components/home/Hero'
import { StatsBand } from '@/components/home/StatsBand'
import { Pilares } from '@/components/home/Pilares'
import { Solucoes } from '@/components/home/Solucoes'
import { Diferenciais } from '@/components/home/Diferenciais'
import { CalculadorasPreview } from '@/components/home/CalculadorasPreview'
import { Metodologia } from '@/components/home/Metodologia'
import { Depoimentos } from '@/components/home/Depoimentos'
import { Faq } from '@/components/home/Faq'
import { CtaFinal } from '@/components/home/CtaFinal'

export default function HomePage() {
  return (
    <>
      <Hero />
      <StatsBand />
      <Pilares />
      <Solucoes />
      <Diferenciais />
      <CalculadorasPreview />
      <Metodologia />
      <Depoimentos />
      <Faq />
      <CtaFinal />
    </>
  )
}

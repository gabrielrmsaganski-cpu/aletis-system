import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Moderagro — Pecuária e Fruticultura · Educação ALETIS',
  description: 'Moderagro 2025/26: matrizes, sanidade, fruticultura. Taxa 13,5% e teto R$ 880 mil.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/moderagro' },
}

export default function ModeragroPage() {
  return (
    <ProgramTemplate
      slug="moderagro"
      nome="Moderagro — Modernização da Agropecuária"
      subtitulo="Para pecuária bovina/suína/avícola, fruticultura e sanidade animal. O programa nicho do BNDES Rural."
      lead={
        <>
          O <Strong>Moderagro</Strong> cobre nichos que não cabem nos demais programas: aquisição de matrizes, sanidade animal, fruticultura comercial, modernização de instalações pecuárias. Limite R$ 880 mil — voltado para o produtor médio com necessidades específicas.
        </>
      }
      publicoAlvo={
        <>Pecuarista, fruticultor, suinocultor, avicultor e aquicultor (PF/PJ).</>
      }
      finalidades={[
        { finalidade: 'Aquisição de matrizes (bovinos, suínos, ovinos)', taxa: '13,5 %', limite: 'R$ 880 mil', prazo: '8 anos' },
        { finalidade: 'Sanidade animal (vacinação, controle)', taxa: '13,5 %', limite: 'R$ 880 mil', prazo: '6 anos' },
        { finalidade: 'Implantação de fruticultura comercial', taxa: '13,5 %', limite: 'R$ 880 mil', prazo: '10 anos + 3 carência' },
        { finalidade: 'Modernização de currais, ordenhadeira, baia', taxa: '13,5 %', limite: 'R$ 880 mil', prazo: '8 anos' },
        { finalidade: 'Adequação de granja de aves/suínos', taxa: '13,5 %', limite: 'R$ 880 mil', prazo: '8 anos' },
      ]}
      caracteristicas={[
        { k: 'Operador', v: 'BNDES via banco repassador' },
        { k: 'Garantia', v: 'Penhor pecuário + alienação dos bens financiados' },
        { k: 'Documentação', v: 'GTA (Guia de Trânsito Animal) + sanidade em dia + projeto técnico' },
      ]}
      vantagens={[
        <>Cobre matrizes — algo que outros programas raramente fazem.</>,
        <>Fruticultura tem 10 anos de prazo + 3 de carência (cobre formação do pomar).</>,
        <>Adequação sanitária: única linha que cobre conformidade com SIM/SUSAF/SIE.</>,
      ]}
      limitacoes={[
        <>Teto baixo (R$ 880 mil) — para projetos grandes, precisa combinar com BNDES Rural.</>,
        <>Taxa subiu de 8,5% para 13,5% nos últimos 2 ciclos (impacto da Selic).</>,
      ]}
      prev={{ label: 'Prodecoop', href: '/educacao/programas/prodecoop' }}
      next={{ label: 'Proirriga', href: '/educacao/programas/proirriga' }}
      fontes={[
        { label: 'BNDES — Moderagro', href: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/credito-rural/moderagro' },
      ]}
    />
  )
}

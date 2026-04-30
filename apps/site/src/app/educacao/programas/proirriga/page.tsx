import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Proirriga — Irrigação Inteligente · Educação ALETIS',
  description: 'Proirriga 2025/26: pivô central, gotejamento, sensores. Taxa 11,5% e teto R$ 4 mi.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/proirriga' },
}

export default function ProirrigaPage() {
  return (
    <ProgramTemplate
      slug="proirriga"
      nome="Proirriga — Irrigação Inteligente"
      subtitulo="Para tirar a fazenda da dependência da chuva. Pivô central, gotejamento, sensores, captação."
      lead={
        <>
          O <Strong>Proirriga</Strong> financia sistemas de irrigação modernos com foco em <Strong>eficiência hídrica</Strong> — pivô central de baixa pressão, gotejamento, sensores de umidade e infraestrutura de captação. Em ambiente de mudança climática, irrigar deixa de ser opcional.
        </>
      }
      publicoAlvo={
        <>Produtor PF/PJ que quer implantar ou modernizar sistema de irrigação.</>
      }
      finalidades={[
        { finalidade: 'Pivô central de baixa pressão', taxa: '11,5 %', limite: 'R$ 4 mi', prazo: '10 anos + 1 carência' },
        { finalidade: 'Gotejamento e microaspersão', taxa: '11,5 %', limite: 'R$ 4 mi', prazo: '10 anos' },
        { finalidade: 'Sensores de umidade e fertirrigação', taxa: '11,5 %', limite: 'R$ 4 mi', prazo: '10 anos' },
        { finalidade: 'Reservatórios e captação', taxa: '11,5 %', limite: 'R$ 4 mi', prazo: '12 anos' },
        { finalidade: 'Energia para irrigação (solar/grid)', taxa: '11,5 %', limite: 'R$ 4 mi', prazo: '10 anos' },
      ]}
      caracteristicas={[
        { k: 'Operador', v: 'BNDES via banco repassador' },
        { k: 'Documentação extra', v: 'Outorga de uso da água do órgão estadual de meio ambiente' },
        { k: 'Garantia', v: 'Alienação fiduciária dos equipamentos + complemento usual' },
        { k: 'Combina com', v: 'ABC+ Energia (solar para irrigar) e Custeio para a primeira safra irrigada' },
      ]}
      vantagens={[
        <>Outorga + Proirriga viabiliza fazenda de sequeiro virar fazenda irrigada — produtividade dobra/triplica.</>,
        <>Sistema de baixa pressão consome 30-40% menos energia que pivô tradicional.</>,
        <>Combinação com ABC+ Energia Solar zera conta de luz operacional.</>,
      ]}
      limitacoes={[
        <>Outorga da água é gargalo: alguns estados (PR, SP, GO em microbacias) com lista de espera longa.</>,
        <>Operação só libera após outorga emitida — cronograma do projeto fica refém.</>,
      ]}
      prev={{ label: 'Moderagro', href: '/educacao/programas/moderagro' }}
      next={{ label: 'Instrumentos do agro', href: '/educacao/instrumentos' }}
      fontes={[
        { label: 'BNDES — Proirriga', href: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/credito-rural/proirriga' },
      ]}
    />
  )
}

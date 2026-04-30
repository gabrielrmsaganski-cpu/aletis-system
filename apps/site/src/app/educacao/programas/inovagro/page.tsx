import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Inovagro — Inovação Tecnológica · Educação ALETIS',
  description: 'Inovagro 2025/26: financia agricultura de precisão, AgTech, automação, drones e software de gestão.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/inovagro' },
}

export default function InovagroPage() {
  return (
    <ProgramTemplate
      slug="inovagro"
      nome="Inovagro — Inovação Tecnológica Agropecuária"
      subtitulo="O programa para AgTech: precisão, automação, sensores, software, drones."
      lead={
        <>
          O Inovagro financia <Strong>tecnologia que aumenta produtividade ou reduz uso de insumos</Strong>: agricultura de precisão (GPS, sensores, taxa variável), automação de irrigação, software de gestão, comunicação rural, drones, mapeamento. É a porta de entrada do produtor brasileiro na agricultura digital.
        </>
      }
      publicoAlvo={
        <>
          Produtor pessoa física ou jurídica e cooperativas. Sem restrição de porte — mas o teto efetivo é R$ 2 mi/operação. Ideal para fazendas em curva de modernização incremental.
        </>
      }
      finalidades={[
        { finalidade: 'Agricultura de precisão (GPS, monitores)', taxa: '11,5 %', limite: 'R$ 2 mi', prazo: '10 anos + 3 carência' },
        { finalidade: 'Software de gestão / ERP rural', taxa: '11,5 %', limite: 'R$ 2 mi', prazo: '10 anos' },
        { finalidade: 'Sensores, estações meteorológicas, IoT', taxa: '11,5 %', limite: 'R$ 2 mi', prazo: '10 anos' },
        { finalidade: 'Drones e aeronaves não-tripuladas', taxa: '11,5 %', limite: 'R$ 2 mi', prazo: '10 anos' },
        { finalidade: 'Comunicação rural (4G, internet rural)', taxa: '11,5 %', limite: 'R$ 2 mi', prazo: '10 anos' },
        { finalidade: 'Bioinsumos e biofábrica on-farm', taxa: '11,5 %', limite: 'R$ 2 mi', prazo: '10 anos' },
      ]}
      caracteristicas={[
        { k: 'Operador', v: 'BNDES (com banco repassador)' },
        { k: 'Garantia', v: 'Alienação fiduciária dos bens + complemento usual' },
        { k: 'Documentação extra', v: 'Plano de inovação descrevendo ganho esperado (produtividade ou economia de insumos)' },
        { k: 'Combina com', v: 'Custeio Pronamp + Moderfrota — mesmo tomador pode ter as três operações' },
      ]}
      vantagens={[
        <>Prazo de 10 anos para tecnologia que tipicamente paga em 2-4 — gera caixa positivo desde o início.</>,
        <>Taxa abaixo de Moderfrota empresarial (11,5% vs 13,5%) — pode ser melhor para pacotes de tecnologia que misturam software + hardware.</>,
        <>Financia bioinsumos e biofábrica on-farm — único programa que cobre essa fronteira.</>,
        <>Carência de 3 anos = tempo para a tecnologia gerar ROI antes da primeira parcela.</>,
      ]}
      limitacoes={[
        <>Software puro tem que ser de fornecedor cadastrado no BNDES — a maioria das AgTechs nacionais ainda não tem credenciamento.</>,
        <>Cobertura de "consultoria" associada à tecnologia é limitada (até 20% do valor).</>,
        <>Drones precisam ter homologação ANAC e laudo técnico para serem aceitos.</>,
      ]}
      exemplo={{
        titulo: 'Pacote agricultura de precisão — fazenda 1.500 ha',
        items: [
          { k: 'Composição', v: 'GPS RTK + monitor de plantio/colheita + sensores solo + ERP rural' },
          { k: 'Investimento', v: 'R$ 320.000' },
          { k: 'Programa', v: 'Inovagro' },
          { k: 'Taxa', v: '11,5 % a.a.' },
          { k: 'Prazo', v: '7 anos com 1 ano carência' },
          { k: 'Parcela anual', v: '~R$ 70.000' },
          { k: 'Economia de insumos esperada', v: '8% × R$ 11 mi de Custeio = R$ 880 mil/ano' },
          { k: 'Payback estimado', v: '< 1 safra (DSCR > 10×)' },
        ],
      }}
      faq={[
        {
          q: 'Posso financiar internet rural via Inovagro?',
          a: 'Sim — antena 4G/5G rural, link satélite (Starlink, HughesNet) e infraestrutura de rede (radio, fibra) entram. É das poucas portas oficiais para conectar a fazenda.',
        },
        {
          q: 'Software SaaS (mensalidade) cabe?',
          a: 'Cabe parcialmente: o BNDES financia a "implantação + 24 meses de licença" como pacote inicial. Mensalidades subsequentes voltam a ser despesa operacional.',
        },
      ]}
      prev={{ label: 'Moderfrota', href: '/educacao/programas/moderfrota' }}
      next={{ label: 'ABC+', href: '/educacao/programas/abc-mais' }}
      fontes={[
        { label: 'BNDES — Inovagro', href: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/credito-rural/inovagro' },
      ]}
    />
  )
}

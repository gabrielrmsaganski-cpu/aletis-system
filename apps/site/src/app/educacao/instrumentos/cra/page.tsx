import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'CRA — Certificado de Recebíveis do Agronegócio · Educação ALETIS',
  description: 'CRA: securitização de recebíveis agro. Como o agro brasileiro acessa o mercado de capitais.',
  alternates: { canonical: 'https://aletis.com.br/educacao/instrumentos/cra' },
}

export default function CRAPage() {
  return (
    <EduLayout
      titulo="CRA — Certificado de Recebíveis do Agronegócio"
      subtitulo="O atacado do mercado de capitais agro. Para quando volumes ultrapassam o tamanho de uma operação bilateral."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Instrumentos', href: '/educacao/instrumentos' },
        { label: 'CRA' },
      ]}
      prev={{ label: 'Fiagro', href: '/educacao/instrumentos/fiagro' }}
      next={{ label: 'Barter', href: '/educacao/instrumentos/barter' }}
      fontes={[
        { label: 'Lei 11.076/2004 — CRA', href: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11.076.htm' },
        { label: 'CVM — RES 60', href: 'https://conteudo.cvm.gov.br/legislacao/resolucoes/resol060.html' },
      ]}
    >
      <Lead>
        O <Strong>CRA</Strong> é a versão atacado do crédito agro: uma empresa <Strong>securitizadora</Strong> compra recebíveis agropecuários (CPRs, contratos, CDAs/WAs) de várias contrapartes, "empacota" em um título único e emite ao mercado de capitais.
      </Lead>

      <H2 id="estrutura">Como funciona a estrutura</H2>
      <UL>
        <LI><Strong>Originador</Strong>: produtor, cooperativa ou trader que tem recebíveis (CPR, contrato).</LI>
        <LI><Strong>Cessionária/Securitizadora</Strong>: compra os recebíveis com deságio. Usa esse fluxo de caixa para emitir CRA.</LI>
        <LI><Strong>CRA emitido</Strong>: tem rating de agência classificadora, é registrado na CVM, distribuído ao mercado.</LI>
        <LI><Strong>Investidor (qualificado/profissional)</Strong>: compra o CRA, recebe os juros conforme o lastro paga.</LI>
      </UL>

      <H2 id="por-que">Quando faz sentido emitir</H2>
      <UL>
        <LI><Strong>Volume grande</Strong>: a estruturação custa caro (1-2% do volume), só vale a partir de R$ 50 mi.</LI>
        <LI><Strong>Múltiplos originadores</Strong>: cooperativas que consolidam recebíveis dos cooperados são o caso típico.</LI>
        <LI><Strong>Prazo longo</Strong>: CRA chega a 7-10 anos, prazo que banco e Fiagro raramente alcançam.</LI>
        <LI><Strong>Acesso a investidores institucionais</Strong>: fundos de pensão, seguradoras, gestoras.</LI>
      </UL>

      <H2 id="emissores-tipicos">Emissores típicos</H2>
      <UL>
        <LI><Strong>Cooperativas grandes</Strong>: Coamo, Lar, C.Vale, Aurora, Nutrien — emitem CRA para captar capital de giro.</LI>
        <LI><Strong>Tradings</Strong>: Cargill, ADM, Bunge, Amaggi, COFCO — emitem CRA lastreado em CPRs originadas dos produtores parceiros.</LI>
        <LI><Strong>Indústrias agro listadas</Strong>: SLC, BrasilAgro, JBS, Marfrig, Minerva — usam CRA como funding alternativo.</LI>
      </UL>

      <Callout tone="info" title="Para o produtor pessoa física">
        Você quase nunca emite um CRA diretamente. Mas se você assina CPR com uma trader/cooperativa, é provável que <Strong>essa CPR vire lastro de um CRA</Strong>. Saber isso muda o valor com que você negocia: se a trader vai securitizar o seu papel, há margem para reduzir o deságio que ela está cobrando.
      </Callout>

      <FAQ
        items={[
          {
            q: 'O CRA é tributado?',
            a: 'Para investidor PF, é isento de IR sobre rendimento (incentivo fiscal para canalizar capital ao agro). Para PJ, normal. Esse benefício PF é o que torna o CRA atrativo a juros relativamente baixos.',
          },
          {
            q: 'Pode investir em CRA pelo home broker?',
            a: 'Pode, mas a maioria é de oferta restrita (limitada a investidores qualificados ou profissionais). Em ofertas públicas amplas, o varejo entra. Liquidez no secundário é menor que ações ou CDB.',
          },
        ]}
      />
    </EduLayout>
  )
}

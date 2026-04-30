import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, KV, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'CDA/WA — Certificado de Depósito Agropecuário e Warrant · Educação ALETIS',
  description: 'CDA e WA: títulos emitidos por armazém certificado MAPA. Como financiar a safra colhida sem vender.',
  alternates: { canonical: 'https://aletis.com.br/educacao/instrumentos/cda-wa' },
}

export default function CDAWAPage() {
  return (
    <EduLayout
      titulo="CDA/WA — Certificado de Depósito + Warrant Agropecuário"
      subtitulo="A dupla que transforma a safra colhida em colateral líquido. O instrumento da estocagem inteligente."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Instrumentos', href: '/educacao/instrumentos' },
        { label: 'CDA/WA' },
      ]}
      prev={{ label: 'CPR', href: '/educacao/instrumentos/cpr' }}
      next={{ label: 'LCA', href: '/educacao/instrumentos/lca' }}
      fontes={[
        { label: 'Lei 11.076/2004 — CDA/WA', href: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11.076.htm' },
        { label: 'Mapa — armazéns certificados', href: 'https://www.gov.br/agricultura/pt-br/assuntos/sustentabilidade/armazenagem' },
      ]}
    >
      <Lead>
        Quando o produtor coloca a safra colhida em <Strong>armazém certificado pelo MAPA</Strong>, o armazenador emite dois títulos pareados: o <Strong>CDA</Strong> (que representa a propriedade do produto) e o <Strong>WA — Warrant Agropecuário</Strong> (que representa o penhor do produto). Juntos, viram colateral aceito por banco, Fiagro e investidor.
      </Lead>

      <H2 id="logica">A lógica do par CDA/WA</H2>
      <P>
        O armazém deposita o produto e emite os dois títulos <Strong>simultaneamente</Strong>:
      </P>
      <UL>
        <LI><Strong>CDA</Strong> — quem está com o CDA é o dono do produto. Pode endossar (vender) o CDA e a propriedade passa adiante.</LI>
        <LI><Strong>WA</Strong> — quem está com o WA é o credor do produtor. O produto está empenhado em favor de quem detém o warrant.</LI>
      </UL>
      <P>
        O produtor pode <Strong>separar os dois</Strong>: fica com o CDA (mantém propriedade) e <Strong>endossa o WA</Strong> a um banco/Fiagro como garantia de empréstimo. Recebe caixa, mantém o produto. Liquida o empréstimo → recupera o WA → vende o produto quando quiser.
      </P>

      <H2 id="como-emite">Como emitir</H2>
      <KV
        items={[
          { k: 'Pré-requisito', v: 'Produto entregue em armazém com certificação MAPA (não é qualquer armazém)' },
          { k: 'Emissão', v: 'Armazém emite CDA e WA via sistema eletrônico (B3, CIP, Cerc)' },
          { k: 'Custo', v: 'Taxa de armazenagem mensal + taxa de emissão + emolumentos B3' },
          { k: 'Endosso', v: 'Pode ser endossado quantas vezes quiser; cada endosso vai ao registro' },
          { k: 'Liquidação', v: 'CDA + WA juntos resgatam o produto físico no armazém' },
        ]}
      />

      <Callout tone="info" title="Vantagem do par">
        O CDA/WA é o único instrumento que <Strong>separa propriedade de garantia</Strong> de forma líquida. Com CPR, você compromete a entrega futura. Com CDA/WA, o produto já está estocado e pronto — o banco corre menos risco e cobra menos juros.
      </Callout>

      <H2 id="exemplo">Exemplo — milho safrinha em silo certificado</H2>
      <KV
        items={[
          { k: 'Produtor', v: 'Fazenda em GO, 30.000 sacas milho safrinha colhidas em jul/26' },
          { k: 'Preço pronto', v: 'R$ 65/sc — R$ 1,95 mi total' },
          { k: 'Curva futura jan/27', v: 'R$ 88/sc' },
          { k: 'Estratégia', v: 'Depositar em armazém certificado, emitir CDA + WA' },
          { k: 'Endossar WA', v: 'a banco/Fiagro — R$ 1,5 mi (LTV 77%) a CDI + 4 % a.a.' },
          { k: 'Liquidação', v: 'jan/27, vende o milho a R$ 88, paga banco, embolsa diferença' },
          { k: 'Resultado bruto', v: 'R$ 2,64 mi (jan) − R$ 1,5 mi × 1,15 (juros 6m) = R$ 915 mil + os recursos antecipados a R$ 1,5 mi de liquidez via WA' },
          { k: 'Vs vender pronto', v: '~R$ 690 mil a mais — financiou-se a guarda' },
        ]}
      />

      <H2 id="vs-egf">CDA/WA vs EGF</H2>
      <UL>
        <LI><Strong>EGF</Strong> é crédito controlado (taxa Plano Safra, prazo 240 dias, exigências documentais). Funding subsidiado.</LI>
        <LI><Strong>CDA/WA endossado</Strong> é mercado livre (taxa CDI + spread, prazo livre, exigências menores). Mais ágil.</LI>
        <LI>Combinação ótima: <Strong>esgotar EGF</Strong> primeiro (mais barato) e <Strong>complementar com CDA/WA</Strong> para o saldo restante.</LI>
      </UL>

      <H2 id="cuidados">Cuidados</H2>
      <UL>
        <LI>Só armazém com <Strong>certificação MAPA vigente</Strong> emite CDA/WA. Sempre conferir.</LI>
        <LI>Em caso de armazém quebrar (raro mas existiu), o produtor é credor quirografário pela mercadoria. Diversificar quando volume justifica.</LI>
        <LI>Taxa de armazenagem mensal corrói rendimento — calcular se segurar compensa o carry positivo do mercado.</LI>
      </UL>

      <FAQ
        items={[
          {
            q: 'Qualquer cooperativa pode emitir CDA/WA?',
            a: 'Só se for armazém certificado MAPA. Cooperativas grandes geralmente são. Cooperativas pequenas e silos rurais (não certificados) emitem apenas "depósito de produto" sem força de título.',
          },
          {
            q: 'Vale a pena para cafeicultor?',
            a: 'Sim — café tem mercado de armazenagem certificado bem desenvolvido (especialmente Espírito Santo, Minas e SP). CDA/WA de café com Funcafé EGF é combinação clássica de gestão de timing.',
          },
        ]}
      />
    </EduLayout>
  )
}

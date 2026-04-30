import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, KV, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Barter — troca de insumos por safra · Educação ALETIS',
  description: 'Operação de barter: como funciona, vantagens, riscos e a CPR Física que está embutida.',
  alternates: { canonical: 'https://aletis.com.br/educacao/instrumentos/barter' },
}

export default function BarterPage() {
  return (
    <EduLayout
      titulo="Barter — troca de insumos por safra"
      subtitulo="O escambo modernizado do agro. Operação dominante no Centro-Oeste — e a que mais arrasta produtor para inadimplência quando a safra quebra."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Instrumentos', href: '/educacao/instrumentos' },
        { label: 'Barter' },
      ]}
      prev={{ label: 'CRA', href: '/educacao/instrumentos/cra' }}
      next={{ label: 'Renegociação', href: '/educacao/renegociacao' }}
      fontes={[
        { label: 'Lei 8.929/94 — CPR (lastro do barter)', href: 'https://www.planalto.gov.br/ccivil_03/leis/l8929.htm' },
      ]}
    >
      <Lead>
        Em uma operação de <Strong>barter</Strong>, o produtor recebe insumos hoje (sementes, fertilizantes, defensivos) e se compromete a entregar sacas da safra colhida — em quantidade fixa e data certa — para quitar. É a operação mais comum no Centro-Oeste para soja e milho. Funciona muito bem em ano normal; <Strong>devasta</Strong> em ano de quebra de safra.
      </Lead>

      <H2 id="estrutura">Estrutura típica</H2>
      <KV
        items={[
          { k: 'Contraparte', v: 'Trader (Cargill, Bunge, ADM, COFCO, Amaggi) ou indústria de insumo (Yara, Heringer, Mosaic)' },
          { k: 'Lastro', v: 'CPR Física (entrega de sacas) ou contrato de cessão de safra' },
          { k: 'Indexador', v: 'Razão de troca: ex. R$ 10.000/ha de insumo = 70 sacas/ha de soja' },
          { k: 'Vencimento', v: 'Janela da colheita (jan-mar para soja CO; jul-ago para milho safrinha)' },
          { k: 'Liquidação', v: 'Entrega física no porto/armazém da contraparte' },
        ]}
      />

      <H2 id="vantagens">Vantagens do barter</H2>
      <UL>
        <LI><Strong>Sem desembolso de caixa</Strong> — não precisa fazer plano com banco, conta no banco etc. para os insumos.</LI>
        <LI><Strong>Trava de preço</Strong>: o produtor sai do plantio sabendo exatamente o quanto vai colher e o quanto vai entregar — risco de preço fica com a trader.</LI>
        <LI><Strong>Crédito simplificado</Strong>: muitas vezes a trader aceita produtor que banco recusou (carteira própria, sem MCR).</LI>
        <LI><Strong>Suprimento garantido</Strong>: insumo entregue na fazenda, na época certa, sem fila.</LI>
      </UL>

      <H2 id="riscos">Riscos — o lado escuro do barter</H2>
      <Callout tone="danger" title="A armadilha matemática do barter">
        A razão de troca <Strong>fixa em sacas</Strong> a quantidade que você precisa entregar. Se sua produtividade quebrar (seca, granizo, praga), você precisa entregar a mesma quantidade absoluta — e não tem da onde tirar. Compra soja no mercado para honrar (preço cheio) ou inadimple e perde garantia. Em 2021/22, milhares de produtores brasileiros viveram esse cenário.
      </Callout>

      <UL>
        <LI><Strong>Quebra de safra</Strong>: produtor obrigado a entregar valor absoluto em sacas, mesmo sem produção. Casos célebres em MT/MS no biênio 21/22.</LI>
        <LI><Strong>Acúmulo com Custeio bancário</Strong>: comum produtor pegar barter para insumos E Custeio bancário sobre os mesmos hectares — endividamento dobrado sobre uma safra.</LI>
        <LI><Strong>Cláusulas leoninas</Strong>: multa por atraso, vencimento antecipado por inadimplemento de outras dívidas, exigência de seguro custeado pelo produtor.</LI>
        <LI><Strong>Razão de troca desfavorável</Strong>: em ano de preço alto da soja na contratação, a razão fica boa para a trader (você "vendeu barato"). Em ano de preço baixo, o efeito inverte.</LI>
      </UL>

      <H2 id="exemplo">Exemplo — barter em soja MT</H2>
      <KV
        items={[
          { k: 'Cenário', v: '500 ha soja em MT' },
          { k: 'Custo de barter', v: 'R$ 9.000/ha (sementes + fertilizante + defensivo)' },
          { k: 'Razão de troca contratada', v: '60 sacas/ha (preço soja contratual R$ 150/sc)' },
          { k: 'Compromisso de entrega', v: '500 × 60 = 30.000 sacas (independente da produtividade)' },
          { k: 'Cenário 1 — produtividade 65 sc/ha', v: 'colheu 32.500 sc, entregou 30.000, sobra 2.500 (tudo bem)' },
          { k: 'Cenário 2 — quebra para 40 sc/ha', v: 'colheu 20.000 sc, entrega 20.000, falta 10.000 → tem que comprar a R$ 200/sc → R$ 2 mi de prejuízo' },
        ]}
      />

      <H2 id="defesa">Como se proteger</H2>
      <UL>
        <LI><Strong>Seguro Multirrisco</Strong>: barter exige seguro — incluir Proagro Mais ou seguro privado. Indenização cobre quebra.</LI>
        <LI><Strong>Cláusula de quebra</Strong>: negociar gatilho que reduz a entrega proporcional à quebra documentada (ex: -30% produtividade = -30% obrigação).</LI>
        <LI><Strong>Limite de exposição</Strong>: nunca barterar mais de 60% da safra esperada — preserva margem para honrar Custeio bancário.</LI>
        <LI><Strong>Não duplicar lastro</Strong>: hectares barterados saem do penhor do banco. Trader não aceita "rateio" de safra com banco — escolha um caminho por área.</LI>
      </UL>

      <FAQ
        items={[
          {
            q: 'Em ano ruim, posso renegociar o barter?',
            a: 'Pode tentar. Em 2022, várias tradings aceitaram alongar prazo ou reduzir a entrega proporcionalmente. Em 2023-2024, com mercado mais apertado, a postura ficou mais dura. Renegociar exige prova documentada da quebra (Proagro/laudo) e relacionamento.',
          },
          {
            q: 'Vale entrar em juízo contra cláusula leonina de barter?',
            a: 'Em casos extremos, sim. Há jurisprudência STJ favorável quando o contrato impõe entrega absoluta sem cláusula de quebra (revisão por onerosidade excessiva, art. 478 do CC, em caso fortuito). A ALETIS já atuou em casos do gênero — depende do contrato e do estado da safra.',
          },
        ]}
      />
    </EduLayout>
  )
}

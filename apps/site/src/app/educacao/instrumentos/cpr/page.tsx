import type { Metadata } from 'next'
import { EduLayout } from '@/components/educacao/EduLayout'
import { Lead, H2, H3, P, UL, LI, Strong, Callout, Table, KV, FAQ } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'CPR — Cédula de Produto Rural · Educação ALETIS',
  description: 'CPR Física e Financeira: como funciona, lei 8.929/94 + 13.986/20 + 14.421/22, registro obrigatório, quando usar.',
  alternates: { canonical: 'https://aletis.com.br/educacao/instrumentos/cpr' },
}

export default function CPRPage() {
  return (
    <EduLayout
      titulo="CPR — Cédula de Produto Rural"
      subtitulo="O título de crédito do agro brasileiro. Foi para o agro o que a CCB foi para o crédito comum: portátil, executável, registrável."
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Instrumentos', href: '/educacao/instrumentos' },
        { label: 'CPR' },
      ]}
      prev={{ label: 'Instrumentos', href: '/educacao/instrumentos' }}
      next={{ label: 'CDA/WA', href: '/educacao/instrumentos/cda-wa' }}
      fontes={[
        { label: 'Lei 8.929/1994 (consolidada)', href: 'https://www.planalto.gov.br/ccivil_03/leis/l8929.htm' },
        { label: 'Lei 13.986/2020 — Lei do Agro', href: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/L13986.htm' },
        { label: 'Lei 14.421/2022 — Lei do Agro 2 (CPR 3.0)', href: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/L14421.htm' },
        { label: 'B3 — registro de CPR', href: 'https://www.b3.com.br/pt_br/produtos-e-servicos/balcao/registro/cedula-de-produto-rural-cpr/' },
      ]}
    >
      <Lead>
        A <Strong>Cédula de Produto Rural (CPR)</Strong> é o título mais importante do agro brasileiro. Inventada pela <Strong>Lei 8.929/1994</Strong> e modernizada por duas grandes reformas (Lei 13.986/20 — Lei do Agro; Lei 14.421/22 — Lei do Agro 2), virou o pivô do mercado privado de crédito rural. Em 2024, o volume cresceu <Strong>39%</Strong> conforme a B3.
      </Lead>

      <H2 id="o-que-e">O que é</H2>
      <P>
        Título de crédito que <Strong>representa promessa</Strong>. O produtor (ou cooperativa, ou agroindústria) emite a CPR e se compromete a entregar — em data futura — uma quantidade certa de produto rural <Strong>(CPR Física)</Strong> ou um valor em dinheiro <Strong>(CPR Financeira)</Strong>. Em troca, recebe à vista o valor antecipado, com deságio.
      </P>

      <H2 id="dois-tipos">Os dois tipos</H2>

      <H3>CPR Física</H3>
      <P>
        Liquidação por <Strong>entrega do produto</Strong>. Ex: produtor recebe R$ 1 mi hoje e se compromete a entregar 8.500 sacas de soja em janeiro/27. Comum em barter (com fornecedor de insumo) ou contrato com trader. Lastro tipicamente é a própria safra.
      </P>

      <H3>CPR Financeira</H3>
      <P>
        Liquidação <Strong>em dinheiro</Strong>, valor calculado pela cotação de mercado do produto na data de vencimento. Mais usada com bancos, Fiagros e investidores institucionais — quem financia não quer ficar com saca de soja física.
      </P>

      <H2 id="evolucao">A evolução legal — por que a Lei do Agro mudou tudo</H2>
      <Table
        caption="O antes e o depois da Lei 13.986/20 + 14.421/22"
        headers={['Aspecto', 'Pré-2020', 'Pós Lei do Agro 2 (CPR 3.0)']}
        rows={[
          ['Quem emite', 'Só produtor agropecuário primário', 'Inclui agroindústria, biocombustíveis, silvicultura'],
          ['Variação cambial', 'Vedada na CPR padrão', 'Permitida — emissão direta em USD'],
          ['Juros flutuantes', 'Restritos', 'Permitidos (CDI+, IPCA+, etc.)'],
          ['Garantias', 'Lista limitada', 'Aval, penhor, hipoteca, alienação fiduciária, FGS, PRA'],
          ['Forma', 'Cartular (papel)', 'Escritural eletrônica (B3, Cerc, CIP)'],
          ['Uso dos recursos', 'Custeio agropecuário', 'Inclui corretivos, defensivos, fertilizantes, máquinas, conservação ambiental (CPR Verde)'],
          ['Registro obrigatório', 'Não', 'Sim — toda CPR independente de valor (a partir de 2024)'],
        ]}
      />

      <H2 id="cpr-verde">CPR Verde</H2>
      <P>
        Variação criada pela Lei do Agro 2: emissor usa os recursos para <Strong>projetos de conservação e preservação ambiental</Strong> (recuperação de pastagem degradada, reflorestamento, sistemas agroflorestais, plantio direto) e os credores ganham um título com <Strong>etiqueta verde</Strong> — o que eleva apetite e baixa taxa em fundos ESG.
      </P>

      <H2 id="registro">Registro obrigatório — cronograma</H2>
      <Table
        caption="Cronograma de obrigatoriedade do registro (Lei 13.986/20)"
        headers={['Vigência', 'CPRs alcançadas']}
        rows={[
          ['1º/jan/2021', 'CPRs ≥ R$ 1 milhão'],
          ['1º/jul/2021', 'CPRs ≥ R$ 250 mil'],
          ['1º/jul/2022', 'CPRs ≥ R$ 50 mil'],
          ['1º/jan/2024', 'TODAS as CPRs, qualquer valor'],
        ]}
      />
      <Callout tone="warn" title="Sem registro = sem força executiva">
        CPR não registrada após 1º/jan/2024 perde a executividade do título — vira contrato comum. Em caso de inadimplência, o credor não tem ação executiva expedita; tem que ajuizar ação ordinária. Isso encarece tudo: spread sobe, prazo encolhe, investidor recusa.
      </Callout>

      <H2 id="garantias">As novas garantias da Lei do Agro</H2>
      <UL>
        <LI><Strong>FGS — Fundo Garantidor Solidário</Strong>: pool de garantias administrado por entidade credenciada, dilui risco entre vários produtores.</LI>
        <LI><Strong>PRA — Patrimônio Rural em Afetação</Strong>: produtor pode segregar parte da fazenda em "patrimônio especial" que serve só de garantia para a CPR — protege o restante em caso de inadimplência.</LI>
        <LI><Strong>Aval, penhor, hipoteca, alienação fiduciária</Strong>: combinações livres conforme estrutura.</LI>
      </UL>

      <H2 id="exemplo">Exemplo — CPR Financeira para Custeio antecipado</H2>
      <KV
        items={[
          { k: 'Produtor', v: 'Fazenda 800 ha de soja em GO, sem teto Pronamp disponível' },
          { k: 'Necessidade', v: 'R$ 6 mi para Custeio (banco aprovou só R$ 3 mi)' },
          { k: 'Solução', v: 'Emitir CPR Financeira de R$ 3 mi com Fiagro' },
          { k: 'Indexador', v: 'CDI + 5,5 % a.a.' },
          { k: 'Prazo', v: '14 meses (até final da próxima colheita)' },
          { k: 'Garantia', v: 'Penhor da safra + aval pessoal + matrícula livre como hipoteca' },
          { k: 'Custo total estimado', v: '~17 % a.a. (CDI 11,75 % + 5,5 % spread)' },
          { k: 'Vs. capital de giro livre', v: '~22 % a.a. — economia de ~R$ 150 mil em 14 meses' },
        ]}
      />

      <H2 id="riscos">Riscos da CPR para o emissor</H2>
      <UL>
        <LI><Strong>Quebra de safra</Strong> em CPR Física = produtor tem que comprar soja no mercado para honrar entrega. Se preço subiu, a operação vira prejuízo gigante. Em 2021, vários produtores brasileiros foram à justiça pleiteando revisão (caso "soja R$ 70 vs R$ 200"). STJ tem julgado caso a caso.</LI>
        <LI><Strong>Variação cambial</Strong>: CPR em USD permite captar barato mas exporcia o produtor a risco cambial — só cabe se receita também é em USD (exportação).</LI>
        <LI><Strong>Cláusulas de rescisão antecipada</Strong>: muitos contratos têm gatilhos (queda de produtividade, mudança de uso da terra, alienação) que aceleram pagamento. Ler antes.</LI>
        <LI><Strong>Execução extrajudicial</Strong>: a CPR registrada permite execução acelerada — em alienação fiduciária, banco pode tomar o bem em poucos meses sem ação judicial.</LI>
      </UL>

      <H2 id="faq">Perguntas frequentes</H2>
      <FAQ
        items={[
          {
            q: 'Posso emitir CPR sobre safra que ainda não plantei?',
            a: 'Pode, mas é alto risco e os investidores cobram caro. CPR pré-plantio sem garantia complementar tem spread de CDI+8% a 10%. Para sair barata, precisa de hipoteca ou Patrimônio Rural em Afetação.',
          },
          {
            q: 'Tenho que pagar imposto sobre o valor recebido na CPR?',
            a: 'Não — CPR não é "venda" para fins de IR. Para o produtor PF, a tributação é normal (Funrural na efetiva venda do produto). Mas atenção: a CPR Financeira pode gerar tributação como receita financeira em alguns setups — sempre passe por contador antes de emitir.',
          },
          {
            q: 'O que é a CPR-E?',
            a: 'CPR-E é a CPR de Exportação — variação que prevê liquidação em USD ou via contrato de câmbio. Comum em soja/milho/algodão para trader internacional. Permite ACC/ACE no banco quando registrada.',
          },
          {
            q: 'Vale assinar CPR no escuro com a trader?',
            a: 'Nunca. CPR é título executável — quem assina compra obrigação contratual. Com a Lei do Agro 2, a complexidade aumentou (cláusulas de FGS, PRA, indexador). ALETIS revisa CPRs antes de assinatura e aponta pontos que merecem renegociação.',
          },
        ]}
      />
    </EduLayout>
  )
}

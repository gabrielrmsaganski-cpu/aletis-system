import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Pronaf — Agricultura Familiar · Educação ALETIS',
  description: 'Pronaf 2025/26: linhas Mais Alimentos, Agroecologia, ABC+, B Microcrédito. Taxas 0,5% a 6%, limites e novidades do Plano Safra.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/pronaf' },
}

export default function PronafPage() {
  return (
    <ProgramTemplate
      slug="pronaf"
      nome="Pronaf — Agricultura Familiar"
      subtitulo="O programa estruturante da agricultura familiar brasileira. Maior subsídio, mais linhas, exigências de enquadramento."
      lead={
        <>
          O <Strong>Pronaf — Programa Nacional de Fortalecimento da Agricultura Familiar</Strong> tem o maior subsídio do crédito rural brasileiro. Em 2025/26, o ciclo bateu recorde: <Strong>R$ 89 bilhões</Strong> destinados ao programa, com taxas que vão de 0,5% (microcrédito agroecológico) a 6% (custeio convencional). Para quem se enquadra, é dinheiro 60-80% mais barato que o livre.
        </>
      }
      publicoAlvo={
        <>
          Famílias com <Strong>renda bruta familiar até R$ 500 mil/ano</Strong>, com pelo menos 50% da renda vinda da atividade rural, mão de obra majoritariamente familiar e DAP/CAF (Cadastro de Aptidão ao Pronaf) ativo. Inclui agricultores, pescadores artesanais, extrativistas, povos indígenas, quilombolas e assentados da reforma agrária.
        </>
      }
      finalidades={[
        { finalidade: 'Custeio — alimentos da cesta básica', taxa: '3 %', limite: 'R$ 250 mil/ano', prazo: '12-24 meses', obs: 'Arroz, feijão, mandioca, milho, leite, ovo' },
        { finalidade: 'Custeio — agroecologia/orgânicos', taxa: '2 %', limite: 'R$ 250 mil/ano', prazo: '12-24 meses', obs: 'Inclui sociobiodiversidade' },
        { finalidade: 'Custeio — demais', taxa: '4 % a 6 %', limite: 'R$ 250 mil/ano', prazo: '12-24 meses' },
        { finalidade: 'Mais Alimentos (até R$ 100 mil)', taxa: '2,5 %', limite: 'R$ 100 mil', prazo: '10 anos + 3 carência', obs: 'Famílias até R$ 150 mil/ano' },
        { finalidade: 'Mais Alimentos — tratores/implementos', taxa: '5 %', limite: 'R$ 250 mil', prazo: '10 anos + 3 carência' },
        { finalidade: 'Pronaf B — Microcrédito', taxa: '0,5 %', limite: 'R$ 20 mil', prazo: '2 anos', obs: 'Bônus adimplência até 40%' },
        { finalidade: 'Pronaf B Agroecologia (novo 25/26)', taxa: '0,5 %', limite: 'R$ 20 mil', prazo: '2 anos', obs: 'Sistemas em transição/orgânicos' },
        { finalidade: 'Pronaf B Quintais Produtivos (novo 25/26)', taxa: '0,5 %', limite: 'R$ 20 mil', prazo: '2 anos', obs: 'Mulheres rurais — bônus 40%' },
        { finalidade: 'Pronaf Floresta / Bioeconomia / Jovem', taxa: '3 %', limite: 'R$ 250 mil', prazo: '20 anos + 8 carência' },
        { finalidade: 'Pronaf Adaptação às Mudanças Climáticas', taxa: '2,5 a 3 %', limite: 'R$ 40 mil – R$ 250 mil', prazo: '10 anos + 3 carência', obs: 'Irrigação solar, semiárido' },
      ]}
      caracteristicas={[
        { k: 'Documento-chave', v: 'CAF (Cadastro de Aptidão ao Pronaf) ativo — substitui a antiga DAP' },
        { k: 'Bancos operadores', v: 'Banco do Brasil, BNB, BNDES, BRDE, cooperativas (Cresol, Sicoob, Sicredi)' },
        { k: 'Garantia mais comum', v: 'Penhor da safra ou dos animais; aval-cruzado em cooperativa' },
        { k: 'Bônus de adimplência', v: 'Até 40% nas linhas B; reduz a parcela quando paga em dia' },
        { k: 'Vinculação ao Zarc', v: 'Obrigatório a partir de 2025/26 mesmo abaixo de R$ 200 mil' },
        { k: 'Seguro', v: 'Proagro Mais com prêmio subsidiado' },
      ]}
      vantagens={[
        <>Taxa real <Strong>negativa em alimentos</Strong> (3% ao ano vs IPCA ~4,5%) — dinheiro mais barato do mercado.</>,
        <>Linhas específicas para mulheres, jovens, povos tradicionais — ampliação do acesso.</>,
        <>Pronaf Floresta com 20 anos de prazo — viável até para fruticultura perene e silvicultura.</>,
        <>Pronaf Adaptação Climática 25/26: irrigação solar com 3% a.a. e prazo de 10 anos.</>,
        <>Bônus de adimplência reduz juros efetivos pagos em ~40% nas linhas B.</>,
      ]}
      limitacoes={[
        <>Renda bruta familiar acima de <Strong>R$ 500 mil</Strong> tira do enquadramento — vai para Pronamp.</>,
        <>CAF é exigido. Sem CAF ativo, banco recusa direto. Renovação anual obrigatória.</>,
        <>Limite por mutuário consolidado — não somar duas DAPs/CAFs da mesma família.</>,
        <>Linhas B: o microcrédito tem fila e exige assistência técnica vinculada (ATER ou cooperativa).</>,
      ]}
      exemplo={{
        titulo: 'Custeio cesta básica em propriedade familiar 12 ha (RS)',
        items: [
          { k: 'Cultura', v: 'Milho + feijão consorciado, 12 ha' },
          { k: 'Custo de Custeio', v: 'R$ 75.000 (insumos + diesel + mão de obra)' },
          { k: 'Programa', v: 'Pronaf — alimentos da cesta básica' },
          { k: 'Taxa', v: '3 % a.a.' },
          { k: 'Prazo', v: '12 meses' },
          { k: 'Juros pagos no fim do ciclo', v: '~R$ 2.250' },
          { k: 'Comparado a recurso livre 18%', v: 'Economia de R$ 11.250 — equivale a 1,5 hectares de margem' },
        ],
      }}
      faq={[
        {
          q: 'Tenho que ter terra própria para acessar o Pronaf?',
          a: 'Não. Arrendatários, parceiros, posseiros e meeiros podem acessar desde que tenham CAF e contrato registrado. A terra própria não é requisito — é o trabalho familiar e a renda predominantemente rural.',
        },
        {
          q: 'O Pronaf B vale a pena ou só dá trabalho?',
          a: 'Vale muito — taxa 0,5% a.a. com bônus de 40% torna o crédito quase gratuito. Para quintais produtivos, agroecologia e atividades de pequeno porte é o instrumento certo. O "trabalho" é a relação com ATER (assistência técnica) que normalmente uma cooperativa local provê.',
        },
        {
          q: 'Posso usar Pronaf para comprar terra?',
          a: 'Não diretamente. Existe a linha Pronaf Terra (PNCF — Programa Nacional de Crédito Fundiário) com taxa 1% a 4% e prazo até 25 anos, mas é separada e tem fila própria.',
        },
      ]}
      next={{ label: 'Pronamp', href: '/educacao/programas/pronamp' }}
      fontes={[
        { label: 'MDA — Linhas Pronaf 2025/26 (PDF oficial)', href: 'https://www.gov.br/mda/pt-br/acesso-a-informacao/acoes-e-programas/programas-projetos-acoes-obras-e-atividades/plano-safra-da-agricultura-familiar/documentos/resumo-linhas-plano-safra-pronaf-2025-2026.pdf' },
        { label: 'Mapa — novidades Plano Safra 2025/26', href: 'https://www.gov.br/agricultura/pt-br/assuntos/noticias/governo-federal-lanca-plano-safra-2025-2026-com-r-516-2-bilhoes-para-impulsionar-o-agro-brasileiro' },
        { label: 'CAF — emissão e renovação', href: 'https://www.gov.br/mda/pt-br/acesso-a-informacao/acoes-e-programas/CAF' },
      ]}
    />
  )
}

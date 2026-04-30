import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Pronamp — Médio Produtor · Educação ALETIS',
  description: 'Pronamp 2025/26: taxa 10% a.a., limite renda elevado para R$ 3,5 mi, custeio até R$ 3 mi/ano e investimento até R$ 500 mil.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/pronamp' },
}

export default function PronampPage() {
  return (
    <ProgramTemplate
      slug="pronamp"
      nome="Pronamp — Médio Produtor Rural"
      subtitulo="A faixa do meio. Quem ganhou demais para Pronaf e ainda não tem porte para BNDES Rural empresarial."
      lead={
        <>
          O <Strong>Programa Nacional de Apoio ao Médio Produtor Rural (Pronamp)</Strong> é o degrau entre Pronaf e crédito rural empresarial. Em 2025/26 a taxa é <Strong>10% a.a.</Strong> — significativa em ambiente Selic 15% — e o limite de renda subiu para R$ 3,5 mi/ano, abrindo a porta para mais médios produtores.
        </>
      }
      publicoAlvo={
        <>
          Produtores com <Strong>renda bruta agropecuária anual de até R$ 3,5 milhões</Strong> (era R$ 3 mi até 2024/25) e que tenham pelo menos 80% da renda vinda da atividade rural. Pessoa física ou jurídica.
        </>
      }
      finalidades={[
        { finalidade: 'Custeio agropecuário', taxa: '10 %', limite: 'R$ 3 mi/ano', prazo: '12-24 meses', obs: 'Bônus 0,5 p.p. → 9,5% efetivos' },
        { finalidade: 'Investimento (Pronamp Investimento)', taxa: '10 %', limite: 'R$ 500 mil', prazo: '8 anos + 3 carência' },
        { finalidade: 'Comercialização (EGF)', taxa: '10 %', limite: 'R$ 3 mi', prazo: '240 dias' },
        { finalidade: 'Funcafé via Pronamp (novo 25/26)', taxa: '11 %', limite: 'R$ 5 mi', prazo: 'até 18 meses', obs: 'Pode acumular com contrato Pronamp ativo' },
      ]}
      caracteristicas={[
        { k: 'Documento-chave', v: 'IRPF/DECORE comprovando renda; certidões + matrícula' },
        { k: 'Bancos operadores', v: 'Todos os bancos credenciados ao Plano Safra' },
        { k: 'Garantia comum', v: 'Penhor de safra (Custeio) + alienação fiduciária (Investimento)' },
        { k: 'Bônus 0,5 p.p.', v: 'Desconto adicional no Custeio prorrogado para 25/26' },
      ]}
      vantagens={[
        <>Taxa <Strong>10 vs 18% no recurso livre</Strong> = economia de 8 pontos. Em R$ 3 mi/ano, ~R$ 240 mil de juros poupados.</>,
        <>Limite renda elevado em 25/26 amplia base elegível em ~15%.</>,
        <>Funcafé pode acumular com Pronamp ativo (novidade 25/26) — o cafeicultor médio ganhou folga.</>,
        <>Permite tomar Custeio + Investimento simultaneamente sem afetar o teto consolidado.</>,
      ]}
      limitacoes={[
        <>Renda comprovada por IRPF — pequena distorção entre regime caixa/competência pode tirar do enquadramento.</>,
        <>Atividades não-rurais excedendo 20% da renda invalidam o enquadramento.</>,
        <>Limite Investimento (R$ 500 mil) costuma ficar pequeno para operações em larga escala — precisa combinar com BNDES.</>,
        <>Selic alta torna o subsídio menos generoso que em ciclos anteriores (taxa subiu de 8% para 10% nos últimos 2 anos).</>,
      ]}
      exemplo={{
        titulo: 'Custeio soja 600 ha em GO',
        items: [
          { k: 'Área', v: '600 ha de soja' },
          { k: 'Custo/ha', v: 'R$ 7.200' },
          { k: 'Custeio total', v: 'R$ 4,32 mi (acima do teto Pronamp)' },
          { k: 'Estratégia', v: 'R$ 3 mi via Pronamp + R$ 1,32 mi via recurso livre' },
          { k: 'Juros mistos', v: '9,5% × 3 mi + 17% × 1,32 mi = R$ 285 mi + R$ 224 mi = R$ 509 mil' },
          { k: 'Cenário "tudo livre"', v: 'R$ 734 mil — diferença R$ 225 mil/safra' },
        ],
      }}
      faq={[
        {
          q: 'Posso somar Pronamp + Pronaf no mesmo mutuário?',
          a: 'Não — são programas excludentes pelo enquadramento de renda. Quem está em Pronaf, sai automaticamente quando passa de R$ 500 mil. Nesse trimestre, o produtor passa por uma janela onde pode escolher (transição), mas não acumular.',
        },
        {
          q: 'O Pronamp tem fila grande?',
          a: 'Em 2025/26 a procura ficou abaixo do esperado (55% do Plano Safra desembolsado até fev/26). Bancos estão com apetite — mas a documentação tem que estar perfeita: IRPF, ITR, CAR, CCIR, Zarc, certidões. Falta de papel é a principal causa de atraso, não falta de funding.',
        },
      ]}
      prev={{ label: 'Pronaf', href: '/educacao/programas/pronaf' }}
      next={{ label: 'Moderfrota', href: '/educacao/programas/moderfrota' }}
      fontes={[
        { label: 'CMN — Resolução 5.234/2025', href: 'https://www.bcb.gov.br/estabilidadefinanceira/buscanormas' },
        { label: 'Banco do Brasil — Pronamp', href: 'https://www.bb.com.br/pronamp' },
      ]}
    />
  )
}

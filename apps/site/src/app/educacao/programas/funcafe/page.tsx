import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Funcafé — Fundo do Café · Educação ALETIS',
  description: 'Funcafé 2025/26: custeio, EGF, FAC e recuperação de cafezal. Taxa 11-12%.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/funcafe' },
}

export default function FuncafePage() {
  return (
    <ProgramTemplate
      slug="funcafe"
      nome="Funcafé — Fundo de Defesa da Economia Cafeeira"
      subtitulo="O fundo setorial do café. Cinco linhas que cobrem o ciclo do cafeicultor — independente do Plano Safra geral."
      lead={
        <>
          O <Strong>Funcafé</Strong> é um fundo setorial alimentado pela contribuição da exportação de café. Em 2025/26, ganhou novidade importante: <Strong>cafeicultores Pronaf e Pronamp podem acumular Funcafé com seus contratos vigentes</Strong>, ampliando o crédito sem prejuízo do enquadramento principal.
        </>
      }
      publicoAlvo={
        <>Cafeicultor (PF/PJ), cooperativa de cafeicultores e indústria de torrefação que processe café de produtor cooperado.</>
      }
      finalidades={[
        { finalidade: 'Custeio do cafezal', taxa: '11 %', limite: 'R$ 5 mi/cafeicultor', prazo: '24 meses' },
        { finalidade: 'EGF (estocagem do café)', taxa: '11 %', limite: 'R$ 5 mi', prazo: '240 dias' },
        { finalidade: 'FAC (Financiamento para Aquisição de Café)', taxa: '12 %', limite: 'R$ 50 mi/empresa', prazo: '12 meses', obs: 'Para indústria/cooperativa que compra café' },
        { finalidade: 'Recuperação de cafezal danificado', taxa: '11 %', limite: 'R$ 5 mi', prazo: '6 anos + 2 carência' },
        { finalidade: 'Capital de giro indústria torrefadora', taxa: '12 %', limite: 'R$ 30 mi', prazo: '12 meses' },
      ]}
      caracteristicas={[
        { k: 'Operador', v: 'Banco do Brasil (gestor do Funcafé) + Caixa, BB, BNB' },
        { k: 'Acumulável com', v: 'Pronaf e Pronamp (novidade 25/26)' },
        { k: 'Garantia', v: 'Penhor dos cafezais (Custeio); penhor do café (EGF/FAC)' },
        { k: 'Vinculação', v: 'Necessário registro no SisCafé' },
      ]}
      vantagens={[
        <>Linha exclusiva — não compete com Custeio Pronamp do mesmo produtor.</>,
        <>FAC permite torrefadora/exportador comprar café de cooperado em volume com taxa 12% (livre cobra 18-20%).</>,
        <>Recuperação de cafezal: única linha pública para cafezais danificados por geada/seca/granizo.</>,
      ]}
      limitacoes={[
        <>Restrito a café (não cobre outras culturas de produtor café-cebola-tomate).</>,
        <>Volume disponível por safra é limitado pela arrecadação do fundo — fila pode aparecer.</>,
        <>Produtor de café Conilon e Arábica concorrem no mesmo balcão (sem cota separada).</>,
      ]}
      faq={[
        {
          q: 'Como saber se há saldo Funcafé disponível?',
          a: 'Os bancos operadores divulgam saldo mensalmente. Banco do Brasil normalmente publica balanço quinzenal no site institucional do Funcafé. Em ano de safra grande, o saldo se esgota até abril.',
        },
        {
          q: 'Pequeno cafeicultor familiar acessa Funcafé?',
          a: 'Sim — e em 2025/26 pode acumular com Pronaf vigente. Operação Pronaf cobre a base, Funcafé adiciona uma camada complementar de Custeio até o teto de R$ 5 mi por mutuário.',
        },
      ]}
      prev={{ label: 'Procap-Agro', href: '/educacao/programas/procap-agro' }}
      next={{ label: 'Prodecoop', href: '/educacao/programas/prodecoop' }}
      fontes={[
        { label: 'BB — Funcafé', href: 'https://www.bb.com.br/funcafe' },
        { label: 'Mapa — Café', href: 'https://www.gov.br/agricultura/pt-br/assuntos/politica-agricola/cafe' },
      ]}
    />
  )
}

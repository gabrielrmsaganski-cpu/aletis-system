import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'Prodecoop — Cooperativismo de Produção · Educação ALETIS',
  description: 'Prodecoop 2025/26: industrialização e modernização de cooperativas. Taxa 8,5% a 13,5% e teto R$ 80 mi.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/prodecoop' },
}

export default function ProdecoopPage() {
  return (
    <ProgramTemplate
      slug="prodecoop"
      nome="Prodecoop — Desenvolvimento Cooperativo"
      subtitulo="A grande linha de capex das cooperativas: industrialização, modernização, adequação ambiental, inovação."
      lead={
        <>
          O <Strong>Prodecoop</Strong> existe para fortalecer a verticalização das cooperativas de produção: industrialização da matéria-prima dos cooperados, modernização de unidades, adequação ambiental e inovação tecnológica. Teto generoso (R$ 80 mi por cooperativa) e prazo longo (12 anos com 3 de carência) o tornam o pilar de capex do cooperativismo agropecuário.
        </>
      }
      publicoAlvo={
        <>Cooperativas singulares e centrais de produção agropecuária e agroindustrial.</>
      }
      finalidades={[
        { finalidade: 'Industrialização (planta de processamento)', taxa: '8,5 % a 13,5 %', limite: 'R$ 80 mi', prazo: '12 anos + 3 carência' },
        { finalidade: 'Modernização e ampliação de unidades', taxa: '8,5 % a 13,5 %', limite: 'R$ 80 mi', prazo: '12 anos + 3 carência' },
        { finalidade: 'Adequação ambiental e licenciamento', taxa: '8,5 % a 13,5 %', limite: 'R$ 80 mi', prazo: '12 anos + 3 carência' },
        { finalidade: 'Inovação tecnológica industrial', taxa: '8,5 % a 13,5 %', limite: 'R$ 80 mi', prazo: '12 anos + 3 carência' },
      ]}
      caracteristicas={[
        { k: 'Operador', v: 'BNDES via banco repassador' },
        { k: 'Garantia', v: 'Aval cooperativa + alienação fiduciária + hipoteca' },
        { k: 'Combina com', v: 'Procap-Agro (giro) + PCA (armazém) + ABC+ (sustentabilidade)' },
        { k: 'Diferenciação', v: 'Taxa 8,5% para pequena cooperativa, 13,5% para porte grande' },
      ]}
      vantagens={[
        <>Maior teto do Plano Safra (R$ 80 mi) para uma única operação.</>,
        <>Carência de 3 anos cobre obra + start-up + amortização gradual.</>,
        <>Combinação com Procap-Agro + PCA permite estruturar projeto integrado de R$ 200 mi+.</>,
      ]}
      limitacoes={[
        <>Exclusivo cooperativa — produtor individual ou empresa fora do escopo.</>,
        <>Análise de crédito da cooperativa (rating, governança, balanço) é decisiva — cooperativas frágeis enfrentam dificuldade.</>,
      ]}
      prev={{ label: 'Funcafé', href: '/educacao/programas/funcafe' }}
      next={{ label: 'Moderagro', href: '/educacao/programas/moderagro' }}
      fontes={[
        { label: 'BNDES — Prodecoop', href: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/credito-rural/prodecoop' },
      ]}
    />
  )
}

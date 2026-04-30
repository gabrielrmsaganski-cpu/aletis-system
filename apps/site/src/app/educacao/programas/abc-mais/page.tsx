import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'ABC+ — Agricultura de Baixo Carbono · Educação ALETIS',
  description: 'ABC+ 2025/26: recuperação de pastagem, ILPF, reflorestamento, energia solar, plantio direto. Taxa 8,5% a 12% e prazo até 15 anos.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/abc-mais' },
}

export default function ABCMaisPage() {
  return (
    <ProgramTemplate
      slug="abc-mais"
      nome="ABC+ — Programa de Agricultura de Baixa Emissão de Carbono"
      subtitulo="O programa de finanças sustentáveis do agro brasileiro. Taxa diferenciada para quem comprova práticas de baixo carbono."
      lead={
        <>
          O <Strong>Plano ABC+</Strong> é o eixo de finanças climáticas do agro. Compromisso do Brasil no Acordo de Paris virou linha de crédito: <Strong>recuperação de pastagem degradada, integração lavoura-pecuária-floresta (ILPF), plantio direto, florestas comerciais, biodigestor, energia solar, agricultura orgânica</Strong>. É também a porta para títulos verdes (CPR Verde, CRA ESG, LCA Verde).
        </>
      }
      publicoAlvo={
        <>
          Produtor PF/PJ, cooperativas. Tem versão familiar (Pronaf ABC+ taxa 4-6%) e empresarial (8,5% a 12%). Comprovação técnica via projeto agronômico assinado.
        </>
      }
      finalidades={[
        { finalidade: 'Recuperação de pastagem degradada', taxa: '8,5 % a 12 %', limite: 'R$ 5 mi', prazo: '12 anos + 8 carência' },
        { finalidade: 'Integração lavoura-pecuária-floresta (ILPF)', taxa: '8,5 % a 12 %', limite: 'R$ 5 mi', prazo: '12 anos + 8 carência' },
        { finalidade: 'Plantio direto na palha', taxa: '8,5 % a 12 %', limite: 'R$ 5 mi', prazo: '8 anos + 3 carência' },
        { finalidade: 'Florestas plantadas (eucalipto, pinus, nativas)', taxa: '8,5 % a 12 %', limite: 'R$ 5 mi', prazo: '15 anos + 8 carência' },
        { finalidade: 'Energia solar fotovoltaica', taxa: '11,5 %', limite: 'R$ 5 mi', prazo: '10 anos' },
        { finalidade: 'Biodigestor e tratamento de dejetos', taxa: '11,5 %', limite: 'R$ 5 mi', prazo: '10 anos' },
        { finalidade: 'Agricultura orgânica (transição/manutenção)', taxa: '8,5 %', limite: 'R$ 2,5 mi', prazo: '10 anos' },
      ]}
      caracteristicas={[
        { k: 'Operador', v: 'BNDES + bancos repassadores (BB, Itaú, Santander, BNB)' },
        { k: 'Documentação extra', v: 'Projeto técnico ABC+ com mensuração de redução de emissões' },
        { k: 'Garantia', v: 'Alienação fiduciária + hipoteca usual' },
        { k: 'Bônus elegibilidade ESG', v: 'Acesso a CPR Verde, fundos ESG, carbono compensado' },
      ]}
      vantagens={[
        <>O <Strong>maior prazo do Plano Safra</Strong> (15 anos para floresta) — único caminho para silvicultura comercial.</>,
        <>Carência de 8 anos em ILPF/floresta — alinha com o tempo de formação do projeto.</>,
        <>Permite emissão de CPR Verde e CRA ESG sobre o ativo financiado, abrindo segunda fonte de captação.</>,
        <>Energia solar paga em 5-7 anos contra 10 do prazo — sobra positiva 3-5 anos.</>,
      ]}
      limitacoes={[
        <>Projeto técnico ABC+ tem que ser assinado por engenheiro agrônomo cadastrado — custo R$ 5-30k para projetos grandes.</>,
        <>Verificação in loco do BNDES é mais rigorosa (cumprimento das metas climáticas).</>,
        <>Quebra de promessa ambiental (ex: replantio que não vingou) pode gerar perda do subsídio.</>,
      ]}
      exemplo={{
        titulo: 'Energia solar 250 kWp para fazenda de leite',
        items: [
          { k: 'Sistema', v: '250 kWp on-grid, gera 31 MWh/mês' },
          { k: 'Investimento', v: 'R$ 850.000' },
          { k: 'Programa', v: 'ABC+ Energia' },
          { k: 'Taxa', v: '11,5 % a.a.' },
          { k: 'Prazo', v: '10 anos com 1 ano carência' },
          { k: 'Economia em conta de luz', v: 'R$ 220 mil/ano' },
          { k: 'Parcela anual', v: '~R$ 165 mil' },
          { k: 'Saldo positivo desde o ano 2', v: '+R$ 55 mil/ano' },
          { k: 'Payback simples', v: '4 anos' },
        ],
      }}
      faq={[
        {
          q: 'O que conta como "pastagem degradada" para acessar a recuperação?',
          a: 'Pastagem com lotação inferior a 0,5 UA/ha, baixa cobertura vegetal (< 60%) ou produtividade abaixo de 60% do potencial regional. Comprovação por laudo técnico e/ou imagem de satélite — o BNDES aceita relatório do Lapig/UFG e da Embrapa.',
        },
        {
          q: 'Posso vender o crédito de carbono gerado pelo projeto ABC+?',
          a: 'Sim — o produtor é dono dos créditos gerados (CBIO, RCB, ou outros padrões). Pode comercializar via plataformas como SystemBio, Moss, NetZero ou diretamente para empresas no mercado voluntário. Receita extra que não conta para a equalização do empréstimo.',
        },
      ]}
      prev={{ label: 'Inovagro', href: '/educacao/programas/inovagro' }}
      next={{ label: 'PCA — Armazenagem', href: '/educacao/programas/pca' }}
      fontes={[
        { label: 'BNDES — ABC+', href: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/credito-rural/programa-abc' },
        { label: 'Mapa — Plano ABC+', href: 'https://www.gov.br/agricultura/pt-br/assuntos/sustentabilidade/plano-abc' },
      ]}
    />
  )
}

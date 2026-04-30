import type { Metadata } from 'next'
import { ProgramTemplate } from '@/components/educacao/ProgramTemplate'
import { Strong } from '@/components/educacao/Prose'

export const metadata: Metadata = {
  title: 'PCA — Construção e Ampliação de Armazéns · Educação ALETIS',
  description: 'PCA 2025/26: silos, secadores, balanças e adequação MAPA. Taxa 11,5%, até R$ 50 mi e prazo 12 anos.',
  alternates: { canonical: 'https://aletis.com.br/educacao/programas/pca' },
}

export default function PCAPage() {
  return (
    <ProgramTemplate
      slug="pca"
      nome="PCA — Construção e Ampliação de Armazéns"
      subtitulo="Para sair da dependência do armazém de terceiro. O programa de capex de armazenagem do agro brasileiro."
      lead={
        <>
          Brasil tem déficit estrutural de armazéns: capacidade estática para apenas <Strong>~64% da safra</Strong> (FAO recomenda 120%). O PCA financia silos, secadores, balanças, moegas e adequação MAPA — com prazo de 12 anos e teto generoso de R$ 50 mi por empresa.
        </>
      }
      publicoAlvo={
        <>
          Produtor PF/PJ, cooperativas e cerealistas. Para cooperativas, soma com Prodecoop. Empresas exclusivamente armazenadoras (sem produção própria) podem acessar a versão "PCA Armazém Geral".
        </>
      }
      finalidades={[
        { finalidade: 'Silos verticais (graneleiros)', taxa: '11,5 %', limite: 'R$ 50 mi', prazo: '12 anos + 3 carência' },
        { finalidade: 'Silos horizontais e tulhas', taxa: '11,5 %', limite: 'R$ 50 mi', prazo: '12 anos + 3 carência' },
        { finalidade: 'Secadores, moegas, elevadores', taxa: '11,5 %', limite: 'R$ 50 mi', prazo: '12 anos + 3 carência' },
        { finalidade: 'Balanças rodoviárias e tombadores', taxa: '11,5 %', limite: 'R$ 50 mi', prazo: '12 anos + 3 carência' },
        { finalidade: 'Adequação a armazém certificado MAPA', taxa: '11,5 %', limite: 'R$ 50 mi', prazo: '12 anos + 3 carência' },
        { finalidade: 'Câmara fria e armazenagem refrigerada', taxa: '11,5 %', limite: 'R$ 50 mi', prazo: '12 anos + 3 carência' },
      ]}
      caracteristicas={[
        { k: 'Operador', v: 'BNDES + bancos repassadores' },
        { k: 'Garantia', v: 'Hipoteca + alienação fiduciária do bem' },
        { k: 'Documento crítico', v: 'Projeto de engenharia + ART' },
        { k: 'Adequação obrigatória', v: 'Inspeção MAPA conclui certificação para emitir CDA/WA' },
      ]}
      vantagens={[
        <>Carência de 3 anos cobre toda obra + start-up.</>,
        <>Armazém certificado MAPA permite emitir <Strong>CDA/WA</Strong> — vira lastro de captação privada (mais um instrumento financeiro).</>,
        <>Permite <Strong>EGF próprio</Strong> sem depender de armazém de terceiro — ganha em margem e timing de venda.</>,
        <>Para cooperativa: combinar PCA + Prodecoop financia até R$ 130 mi.</>,
      ]}
      limitacoes={[
        <>Obra civil exige projeto + ART de engenheiro civil agro — custo R$ 30-100k para projetos grandes.</>,
        <>Adequação MAPA tem checklist extenso: piso, ventilação, controle de pragas, temperatura, segurança.</>,
        <>Operação só libera contra cronograma físico-financeiro fiscalizado in loco — cada etapa precisa de medição.</>,
      ]}
      exemplo={{
        titulo: 'Silo graneleiro 5.000 t — fazenda 2.000 ha (MT)',
        items: [
          { k: 'Capacidade', v: '5.000 toneladas (suficiente para safra de soja da fazenda)' },
          { k: 'Investimento total', v: 'R$ 4,2 mi (silos + secador + balança + adequação MAPA)' },
          { k: 'Programa', v: 'PCA' },
          { k: 'Taxa', v: '11,5 % a.a.' },
          { k: 'Prazo', v: '12 anos com 3 carência' },
          { k: 'Parcela anual após carência', v: '~R$ 575 mil' },
          { k: 'Economia em frete + armazém terceiro', v: 'R$ 280 mil/ano' },
          { k: 'Ganho de timing de venda (EGF próprio)', v: '~R$ 250 mil/ano (segurando 6 meses em ano de carry)' },
          { k: 'Payback efetivo', v: '~7 anos com horizon 12 anos' },
        ],
      }}
      faq={[
        {
          q: 'Posso compartilhar o silo financiado com vizinhos?',
          a: 'Pode — desde que não vire armazenamento comercial sem certificação. Para "guarda privada" entre vizinhos é OK. Para cobrar pelo serviço, precisa virar armazém geral certificado MAPA, que tem regulamentação específica.',
        },
        {
          q: 'O PCA cobre câmara fria para fruticultura?',
          a: 'Sim. Câmara fria e armazenagem refrigerada (citros, hortifruti, leite UHT, peixe) entram no escopo. Limite e prazo idênticos ao silo de grãos.',
        },
      ]}
      prev={{ label: 'ABC+', href: '/educacao/programas/abc-mais' }}
      next={{ label: 'Procap-Agro', href: '/educacao/programas/procap-agro' }}
      fontes={[
        { label: 'BNDES — PCA', href: 'https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/credito-rural/pca' },
      ]}
    />
  )
}

import type { ReactNode } from 'react'
import { EduLayout } from './EduLayout'
import { Lead, H2, P, UL, LI, Strong, Callout, Table, KV, FAQ } from './Prose'

export interface ProgramFinalidade {
  finalidade: string
  taxa: string
  limite: string
  prazo: string
  obs?: string
}

export interface ProgramTemplateProps {
  /** Nome completo: ex. "Pronaf — Programa Nacional de Fortalecimento da Agricultura Familiar" */
  nome: string
  /** Subtítulo curto */
  subtitulo: string
  /** Descrição-âncora em 1 parágrafo */
  lead: ReactNode
  /** Quem é o público-alvo */
  publicoAlvo: ReactNode
  /** Tabela de finalidades + taxas */
  finalidades: ProgramFinalidade[]
  /** Características operacionais */
  caracteristicas: { k: string; v: ReactNode }[]
  /** Por que usar (vantagens) */
  vantagens: ReactNode[]
  /** O que NÃO esperar (limites/armadilhas) */
  limitacoes: ReactNode[]
  /** Exemplo numérico */
  exemplo?: { titulo: string; items: { k: string; v: ReactNode }[] }
  /** FAQ */
  faq?: { q: string; a: ReactNode }[]
  /** Slug atual */
  slug: string
  /** Anterior/próximo */
  prev?: { label: string; href: string }
  next?: { label: string; href: string }
  /** Fontes oficiais */
  fontes: { label: string; href: string }[]
}

export function ProgramTemplate(props: ProgramTemplateProps) {
  return (
    <EduLayout
      titulo={props.nome}
      subtitulo={props.subtitulo}
      breadcrumbs={[
        { label: 'Educação', href: '/educacao' },
        { label: 'Programas', href: '/educacao/programas' },
        { label: props.nome.split('—')[0].trim() },
      ]}
      prev={props.prev || { label: 'Programas', href: '/educacao/programas' }}
      next={props.next}
      fontes={props.fontes}
    >
      <Lead>{props.lead}</Lead>

      <H2 id="publico">Público-alvo</H2>
      <P>{props.publicoAlvo}</P>

      <H2 id="finalidades">Finalidades, taxas e limites</H2>
      <Table
        caption="Linhas e parâmetros oficiais — Plano Safra 2025/26"
        headers={['Finalidade', 'Taxa a.a.', 'Limite', 'Prazo', 'Observação']}
        rows={props.finalidades.map((f) => [
          f.finalidade,
          f.taxa,
          f.limite,
          f.prazo,
          f.obs || '—',
        ])}
      />

      <H2 id="caracteristicas">Características operacionais</H2>
      <KV items={props.caracteristicas} />

      <H2 id="vantagens">Por que usar</H2>
      <UL>
        {props.vantagens.map((v, i) => (
          <LI key={i}>{v}</LI>
        ))}
      </UL>

      <H2 id="limitacoes">Atenção</H2>
      <UL>
        {props.limitacoes.map((v, i) => (
          <LI key={i}>{v}</LI>
        ))}
      </UL>

      {props.exemplo && (
        <>
          <H2 id="exemplo">Exemplo: {props.exemplo.titulo}</H2>
          <KV items={props.exemplo.items} />
        </>
      )}

      {props.faq && props.faq.length > 0 && (
        <>
          <H2 id="faq">Perguntas frequentes</H2>
          <FAQ items={props.faq} />
        </>
      )}
    </EduLayout>
  )
}

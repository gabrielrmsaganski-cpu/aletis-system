import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Tractor,
  Building2,
  Users2,
  Warehouse,
  Briefcase,
  ArrowRight,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

export const metadata: Metadata = {
  title: 'Para quem é · Produtores, grupos, cooperativas e empresas do agro',
  description:
    'A ALETIS atende produtores rurais, grupos agrícolas, cooperativas, cerealistas e empresas do agronegócio em situações de reestruturação, revisional ou profissionalização financeira.',
}

const publicos = [
  {
    icone: Tractor,
    titulo: 'Produtor Rural',
    sub: 'Pessoa Física ou PJ Rural',
    dor: 'Safra comprometida pela parcela, múltiplos credores pressionando, falta de interlocução técnica que fale a língua do campo.',
    solucao: 'Diagnóstico auditável em 72h, mesa multi-credor simultânea, plano com DSCR realista e contratos prontos.',
    resultado: 'Redução média de 62% no saldo devedor e parcela compatível com o fluxo de safra.',
  },
  {
    icone: Users2,
    titulo: 'Grupo Agrícola',
    sub: 'Holdings e grupos familiares',
    dor: 'Exposição consolidada difícil de visualizar, gestão financeira fragmentada entre fazendas, risco de uma ponta derrubar o grupo.',
    solucao: 'Diagnóstico consolidado por entidade, cenarização de stress por CAR e CPF/CNPJ, plano unificado de reestruturação.',
    resultado: 'Visão 360° do passivo do grupo e plano estratégico que preserva o patrimônio familiar.',
  },
  {
    icone: Building2,
    titulo: 'Cooperativa',
    sub: 'Cooperativas agropecuárias',
    dor: 'Cooperados em inadimplência, risco sistêmico na carteira, necessidade de reestruturar sem perder relacionamento.',
    solucao: 'Apoio técnico na estruturação de acordos com cooperados, modelos de renegociação em escala e triagem rápida de carteira.',
    resultado: 'Carteira regularizada, cooperado ativo e previsibilidade financeira para a cooperativa.',
  },
  {
    icone: Warehouse,
    titulo: 'Cerealista / Trading',
    sub: 'Empresas de originação',
    dor: 'Produtor rural devedor que não entrega a CPR, risco de perda da originação, dificuldade em dimensionar exposição real.',
    solucao: 'Auditoria da carteira, reestruturação de CPRs problemáticas, acordos com descaracterização quando cabível.',
    resultado: 'Originação preservada com previsibilidade de entrega física ou financeira.',
  },
  {
    icone: Briefcase,
    titulo: 'Empresa do Agro',
    sub: 'Revendas, insumos, serviços',
    dor: 'Inadimplência de clientes produtores, carteira de recebíveis deteriorada, necessidade de cobrança sem queimar relacionamento.',
    solucao: 'Estruturação de acordos extrajudiciais, confissão de dívida, plano de quitação com garantias reais.',
    resultado: 'Recuperação de recebíveis com contrato sólido e manutenção do cliente na carteira comercial.',
  },
]

export default function ParaQuemPage() {
  return (
    <>
      <PageHeader
        eyebrow="Para quem é"
        titulo={
          <>
            Se o seu negócio{' '}
            <span className="italic text-aletis-dourado">depende do agro</span>, a ALETIS foi feita para você.
          </>
        }
        subtitulo="Do produtor pessoa física ao grupo com múltiplas fazendas, da cooperativa ao cerealista — atendemos toda a cadeia que vive do campo e precisa de interlocução financeira sofisticada."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Para quem é' },
        ]}
      />

      <Section tone="marfim">
        <Container>
          <div className="space-y-5">
            {publicos.map((p, i) => {
              const Icon = p.icone
              return (
                <Reveal key={p.titulo} delay={i * 60}>
                  <article className="group relative overflow-hidden rounded-3xl border border-aletis-borda/70 bg-white transition-all duration-500 hover:border-aletis-dourado/40 hover:shadow-premium">
                    <div className="grid gap-8 p-8 md:grid-cols-[280px_1fr] md:gap-12 md:p-10">
                      {/* Left — persona */}
                      <div className="flex flex-col items-start gap-4 border-aletis-borda/60 md:border-r md:pr-10">
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10 text-aletis-verde-escuro">
                          <Icon className="h-6 w-6" />
                        </div>
                        <div>
                          <h2 className="font-display text-2xl font-semibold text-aletis-grafite-escuro">
                            {p.titulo}
                          </h2>
                          <p className="mt-1 text-[11px] font-body uppercase tracking-widest2 text-aletis-dourado-escuro">
                            {p.sub}
                          </p>
                        </div>
                      </div>

                      {/* Right — dor → solução → resultado */}
                      <div className="grid gap-6 md:grid-cols-3">
                        <div>
                          <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-red-600">
                            Cenário
                          </p>
                          <p className="mt-2 text-[14px] leading-relaxed text-aletis-grafite-medio">
                            {p.dor}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-verde-escuro">
                            Como a ALETIS resolve
                          </p>
                          <p className="mt-2 text-[14px] leading-relaxed text-aletis-grafite-escuro">
                            {p.solucao}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                            Resultado esperado
                          </p>
                          <p className="mt-2 text-[14px] leading-relaxed text-aletis-grafite-escuro">
                            {p.resultado}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className="absolute left-0 top-0 h-full w-[2px] origin-top scale-y-0 bg-gradient-to-b from-aletis-dourado to-aletis-dourado/0 transition-transform duration-500 group-hover:scale-y-100"
                    />
                  </article>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={300}>
            <div className="mt-14 overflow-hidden rounded-2xl border border-aletis-borda/70 bg-gradient-to-br from-aletis-verde-escuro to-aletis-verde-profundo p-8 text-white md:p-12">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="eyebrow eyebrow--light">
                    <span className="gold-hairline" aria-hidden="true" />
                    Seu caso não está na lista?
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-semibold md:text-3xl">
                    Toda conversa começa com um diagnóstico. Gratuito. Em 72h.
                  </h3>
                  <p className="mt-2 max-w-xl text-sm text-white/70">
                    Se o seu passivo envolve crédito rural, CPR, cooperativa ou qualquer ponta do agro, faz sentido sentarmos.
                  </p>
                </div>
                <Link href="/contato" className="btn-primary flex-shrink-0">
                  Solicitar conversa
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  )
}

import type { Metadata } from 'next'
import { Mail, Phone, MapPin, Clock, ShieldCheck, MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { ContatoForm } from '@/components/ContatoForm'
import { siteConfig } from '@/lib/siteConfig'

export const metadata: Metadata = {
  title: 'Contato · Fale com a mesa ALETIS',
  description:
    'Solicite diagnóstico gratuito, proposta comercial ou NDA. Retorno em até 1 dia útil — consultoria financeira estratégica para o agro.',
  alternates: { canonical: '/contato' },
}

const whatsappHref = `https://wa.me/${siteConfig.contact.whatsapp}?text=${encodeURIComponent(
  'Olá, vim pelo site da ALETIS e gostaria de conversar.',
)}`

export default function ContatoPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contato"
        titulo={
          <>
            Uma conversa{' '}
            <span className="italic text-aletis-dourado">sob sigilo</span> pode mudar o rumo da sua safra.
          </>
        }
        subtitulo="Preencha o formulário, escreva por e-mail ou chame no WhatsApp. Em até 1 dia útil um consultor ALETIS retorna com próximos passos — com NDA quando o caso pedir."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Contato' },
        ]}
      />

      <Section tone="marfim">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-14">
            <Reveal>
              <div className="rounded-3xl border border-aletis-borda/70 bg-white p-8 shadow-premium-sm md:p-10">
                <p className="eyebrow">
                  <span className="gold-hairline" aria-hidden="true" />
                  Formulário estratégico
                </p>
                <h2 className="mt-4 font-display text-2xl font-semibold text-aletis-grafite-escuro md:text-3xl">
                  Conte seu cenário. Nós devolvemos um caminho.
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-aletis-grafite-medio">
                  Quanto mais contexto você trouxer (saldo aproximado, credores, prazo ideal), mais assertivo será o retorno.
                </p>
                <div className="mt-8">
                  <ContatoForm />
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <aside className="flex flex-col gap-5">
                <div className="rounded-3xl border border-aletis-borda/70 bg-gradient-to-br from-aletis-verde-escuro to-aletis-verde-profundo p-8 text-white shadow-premium">
                  <p className="eyebrow eyebrow--light">
                    <span className="gold-hairline" aria-hidden="true" />
                    Canais diretos
                  </p>
                  <h3 className="mt-4 font-display text-xl font-semibold">
                    Três formas de começar.
                  </h3>

                  <ul className="mt-6 space-y-5 text-[14px]">
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-aletis-dourado/40 bg-aletis-dourado/15 text-aletis-dourado">
                        <Mail className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest2 text-aletis-dourado">E-mail</p>
                        <a
                          href={`mailto:${siteConfig.contact.email}`}
                          className="mt-0.5 block font-display text-[15px] font-semibold hover:text-aletis-dourado"
                        >
                          {siteConfig.contact.email}
                        </a>
                        <p className="mt-1 text-[12px] text-white/60">
                          Resposta em até 1 dia útil
                        </p>
                      </div>
                    </li>

                    {siteConfig.contact.whatsapp && siteConfig.contact.telefone && (
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-aletis-dourado/40 bg-aletis-dourado/15 text-aletis-dourado">
                        <MessageCircle className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest2 text-aletis-dourado">WhatsApp</p>
                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 block font-display text-[15px] font-semibold hover:text-aletis-dourado"
                        >
                          {siteConfig.contact.telefone}
                        </a>
                        <p className="mt-1 text-[12px] text-white/60">
                          Canal preferencial para urgências
                        </p>
                      </div>
                    </li>
                    )}

                    {siteConfig.contact.telefone && (
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-aletis-dourado/40 bg-aletis-dourado/15 text-aletis-dourado">
                        <Phone className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest2 text-aletis-dourado">Telefone</p>
                        <a
                          href={`tel:+${siteConfig.contact.whatsapp ?? ''}`}
                          className="mt-0.5 block font-display text-[15px] font-semibold hover:text-aletis-dourado"
                        >
                          {siteConfig.contact.telefone}
                        </a>
                        <p className="mt-1 text-[12px] text-white/60">Horário comercial</p>
                      </div>
                    </li>
                    )}
                  </ul>
                </div>

                <div className="rounded-3xl border border-aletis-borda/70 bg-white p-7">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10 text-aletis-verde-escuro">
                      <MapPin className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                        Base operacional
                      </p>
                      <p className="mt-1 font-display text-[15px] font-semibold text-aletis-grafite-escuro">
                        {siteConfig.contact.endereco}
                      </p>
                      <p className="mt-1 text-[13px] text-aletis-grafite-medio">
                        Atendimento nacional · reuniões in loco em todo o Brasil mediante agenda.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-aletis-borda/70 bg-white p-7">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10 text-aletis-verde-escuro">
                      <Clock className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                        Horário de atendimento
                      </p>
                      <p className="mt-1 font-display text-[15px] font-semibold text-aletis-grafite-escuro">
                        Segunda a sexta · 8h–18h
                      </p>
                      <p className="mt-1 text-[13px] text-aletis-grafite-medio">
                        Plantão por WhatsApp fora do horário para casos em urgência.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-aletis-borda/70 bg-aletis-bege/70 p-7">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-white text-aletis-verde-escuro">
                      <ShieldCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                        Sigilo e LGPD
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-aletis-grafite-medio">
                        Tratamos seus dados conforme a Lei 13.709/18. NDA disponível antes de qualquer análise de contrato. Nenhuma informação é compartilhada com terceiros.
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            </Reveal>
          </div>
        </Container>
      </Section>
    </>
  )
}

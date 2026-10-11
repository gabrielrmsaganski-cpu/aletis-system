'use client'

import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

const faqs = [
  {
    q: 'A ALETIS é um escritório de advocacia?',
    a: 'Não. ALETIS é uma assessoria financeira estratégica. Quando um caso exige atuação jurídica, trabalhamos com advogados parceiros ou com o jurídico do cliente. Nosso papel principal é organizar números, documentos e estratégia de negociação.',
  },
  {
    q: 'Em quanto tempo consigo o diagnóstico?',
    a: 'O diagnóstico inicial é entregue em 72h após o envio dos contratos e extratos. Para casos com múltiplos credores, o plano estratégico completo fica pronto em até 1 semana.',
  },
  {
    q: 'Quanto custa o trabalho da ALETIS?',
    a: 'Operamos em modelos fixo, mensal, êxito ou híbrido. A primeira conversa serve para entender escopo e urgência; o modelo final é definido caso a caso, com piso e teto de êxito transparentes em contrato quando houver essa modalidade.',
  },
  {
    q: 'Vocês atuam fora do agronegócio?',
    a: 'Nosso foco e diferencial é o agro — produtor rural, grupos agrícolas, cooperativas, cerealistas e empresas do setor. Casos comerciais não-agro são avaliados pontualmente quando há sinergia.',
  },
  {
    q: 'Como fica a confidencialidade dos meus dados?',
    a: 'Assinamos NDA antes de qualquer acesso a contratos. Toda informação trafega em ambientes com LGPD aplicada, criptografia em repouso e retenção definida. O dossiê só sai da ALETIS com autorização expressa.',
  },
  {
    q: 'Os contratos que vocês geram valem juridicamente?',
    a: 'Os contratos são gerados em formato jurídico completo (CPR, confissão de dívida, termo de renegociação, acordo extrajudicial) e passam por revisão antes da assinatura. A formalização é feita por assinatura eletrônica ICP-Brasil ou plataforma equivalente (Clicksign, DocuSign, D4Sign, Gov.br).',
  },
]

export function Faq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <Section tone="marfim" id="faq">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
          <Reveal>
            <Eyebrow>Perguntas frequentes</Eyebrow>
            <h2 className="mt-6 display-lg text-aletis-grafite-escuro">
              O que{' '}
              <span className="italic text-aletis-verde-escuro">perguntam</span> antes de começar.
            </h2>
            <p className="mt-6 max-w-sm text-base leading-relaxed text-aletis-grafite-medio">
              Se a sua dúvida não estiver aqui, envie o contexto. Em casos de dívida rural,
              a resposta depende muito dos documentos e da safra.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="divide-y divide-aletis-borda/60 overflow-hidden rounded-2xl border border-aletis-borda/70 bg-white">
              {faqs.map((f, i) => {
                const open = openIdx === i
                return (
                  <div key={f.q}>
                    <button
                      type="button"
                      onClick={() => setOpenIdx(open ? null : i)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left transition hover:bg-aletis-bege/60"
                    >
                      <span className="font-display text-[17px] font-semibold text-aletis-grafite-escuro">
                        {f.q}
                      </span>
                      <span
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition ${
                          open
                            ? 'border-aletis-dourado bg-aletis-dourado/15 text-aletis-dourado-escuro'
                            : 'border-aletis-borda text-aletis-grafite-medio'
                        }`}
                      >
                        {open ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                    <div
                      className={`grid transition-[grid-template-rows] duration-500 ${
                        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="px-6 pb-6 text-sm leading-relaxed text-aletis-grafite-medio">
                          {f.a}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}

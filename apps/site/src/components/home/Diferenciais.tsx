import { Check, X } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'

const linhas = [
  {
    tema: 'Abordagem',
    convencional: 'Escritório ou banco atuando por interesse próprio',
    aletis: 'Mesa técnica independente, do lado do produtor',
  },
  {
    tema: 'Análise da dívida',
    convencional: 'Aceita a planilha do credor como verdade',
    aletis: 'Recálculo auditável, peça por peça, com memória pública',
  },
  {
    tema: 'Visão do agro',
    convencional: 'Trata o produtor como uma PJ qualquer',
    aletis: 'Safra, basis, clima e câmbio dentro do modelo',
  },
  {
    tema: 'Rigor técnico',
    convencional: 'Planilhas genéricas e retrabalho manual',
    aletis: 'Memória de cálculo auditável apoiada por mesa digital interna',
  },
  {
    tema: 'Negociação',
    convencional: 'Um credor por vez, sem coordenação',
    aletis: 'Mesa multi-credor simultânea com cenário consolidado',
  },
  {
    tema: 'Entrega final',
    convencional: 'Parecer jurídico ou simulação frágil',
    aletis: 'Plano executável, contratos prontos e acompanhamento pós-acordo',
  },
  {
    tema: 'Pós-acordo',
    convencional: 'Fecha o contrato e desaparece',
    aletis: 'Monitoramento mensal de DSCR e renegociação preventiva',
  },
]

export function Diferenciais() {
  return (
    <Section tone="escuro">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Eyebrow light>Por que ALETIS</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-6 display-lg text-white">
              Não somos{' '}
              <span className="italic text-aletis-dourado">mais um</span> no tabuleiro.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 text-white/65 md:text-lg">
              Comparativo honesto entre o caminho tradicional e a abordagem ALETIS.
              Sem marketing vazio — aqui está a diferença concreta na entrega.
            </p>
          </Reveal>
        </div>

        <Reveal delay={240}>
          <div className="mt-16 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur">
            <div className="grid grid-cols-[1fr_1fr_1.2fr] items-center border-b border-white/10 bg-white/[0.03]">
              <div className="px-6 py-4 text-[11px] font-display font-semibold uppercase tracking-widest2 text-white/40">
                Dimensão
              </div>
              <div className="px-6 py-4 text-[11px] font-display font-semibold uppercase tracking-widest2 text-white/40">
                Mercado convencional
              </div>
              <div className="border-l border-aletis-dourado/30 bg-aletis-dourado/5 px-6 py-4 text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
                ALETIS
              </div>
            </div>
            {linhas.map((l, i) => (
              <div
                key={l.tema}
                className={`grid grid-cols-[1fr_1fr_1.2fr] items-start ${
                  i !== linhas.length - 1 ? 'border-b border-white/5' : ''
                }`}
              >
                <div className="px-6 py-5 font-display text-sm font-semibold text-white/85">
                  {l.tema}
                </div>
                <div className="flex items-start gap-2 px-6 py-5 text-sm text-white/55">
                  <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-alerta" />
                  <span>{l.convencional}</span>
                </div>
                <div className="flex items-start gap-2 border-l border-aletis-dourado/20 bg-aletis-dourado/[0.04] px-6 py-5 text-sm text-white">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-aletis-dourado" />
                  <span>{l.aletis}</span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}

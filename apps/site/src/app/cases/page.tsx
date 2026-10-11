import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { PageHeader } from '@/components/ui/PageHeader'
import { Reveal } from '@/components/ui/Reveal'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { ButtonLink } from '@/components/ui/Button'
import { TrendingDown, ShieldCheck, Wheat, Building2, Sprout, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Recortes de atuação — ALETIS',
  description:
    'Recortes anonimizados de situações em que a ALETIS organiza diagnóstico, reestruturação, crédito, governança e gestão financeira no agro.',
  alternates: { canonical: 'https://aletis.com.br/cases' },
}

interface Case {
  slug: string
  cluster: 'agro' | 'corporate' | 'fomento' | 'gestao'
  titulo: string
  subtitulo: string
  perfil: string
  desafio: string
  abordagem: string[]
  resultado: {
    label: string
    antes: string
    depois: string
    economia?: string
  }[]
  prazo: string
  duracao: string
  privacidade: string
}

// Recortes anonimizados para explicar padrões de atuação.
// Saldos e detalhes sensíveis devem permanecer genéricos por sigilo e LGPD.
const CASES: Case[] = [
  {
    slug: 'reestruturacao-pj-mt-soja-milho',
    cluster: 'agro',
    titulo: 'Reestruturação total — produtor de soja+milho em MT',
    subtitulo:
      'Concentração de 4 inscrições PGFN com risco de bloqueio Funrural; renegociado com 47% de desconto efetivo.',
    perfil: 'Produtor pessoa física · 3.800ha · safra principal soja+milho · MT · 18 anos de operação',
    desafio:
      'Entrou em ciclo de inadimplência após quebra de safra 2022/23 (déficit hídrico) e sucessão familiar mal estruturada. Quatro inscrições PGFN ativas (R$ 4,82M consolidado), três delas com cobrança ajuizada em vias para penhora online, e ITR atrasado em 6 exercícios. Inviabilizava acesso a crédito Pronamp para a próxima safra.',
    abordagem: [
      'Mapeamento integral do passivo e separação por título exequível vs. prescrito',
      'Análise técnica das cobranças com tese de descaracterização parcial (juros remuneratórios em fase administrativa)',
      'Diagnóstico DSCR: capacidade real de pagamento líquida = R$ 1,18M/safra',
      'Negociação direta com PGFN via Edital de Transação Tributária do Agro (vigente)',
      'Coordenação simultânea com receita ITR + INCRA CCIR para liberar crédito Pronamp paralelo',
    ],
    resultado: [
      { label: 'Passivo consolidado', antes: 'R$ 4.820.000', depois: 'R$ 2.560.000', economia: 'R$ 2,26M' },
      { label: 'DSCR pré × pós', antes: '0,42', depois: '1,68' },
      { label: 'Acesso a crédito', antes: 'Bloqueado', depois: 'Pronamp R$ 1,8M aprovado' },
      { label: 'Bloqueios judiciais', antes: '3 ações ativas', depois: 'Suspensos' },
    ],
    prazo: '2024-Q3 → 2024-Q4',
    duracao: '11 semanas',
    privacidade: 'Cliente autorizou divulgação anônima · Documentos referência arquivados ALETIS · LGPD-compliant',
  },
  {
    slug: 'corporate-bpo-revenda-agroinsumos',
    cluster: 'corporate',
    titulo: 'BPO completo — revenda de insumos no centro-oeste',
    subtitulo:
      'Revenda com R$ 28M de faturamento sem visibilidade de DRE; passou a operar com fechamento mensal em D+5.',
    perfil: 'Revenda de insumos · faturamento R$ 28M · 24 colaboradores · GO · sócios em conflito sobre rumo financeiro',
    desafio:
      'Operação rentável em receita mas sem clareza de margem por linha (defensivos, sementes, fertilizantes, serviços). DRE manual em planilha Excel com 9 meses de atraso. Endividamento bancário concentrado em 3 instituições com vencimentos não casados ao ciclo de safra. Conflito societário travando captação.',
    abordagem: [
      'Implantação de fechamento contábil-gerencial mensal em 30 dias (squad de 2 + sistema integrado)',
      'Apuração de DRE por centro de custo + por linha de produto + por safra',
      'Renegociação coordenada das 3 dívidas bancárias com prazo casado ao ciclo (60-65% das vendas concentradas em 90 dias)',
      'Estruturação de governança: comitê quinzenal de caixa + dashboards mensais para os sócios',
      'Treinamento da equipe interna ao longo de 6 meses para absorver o BPO',
    ],
    resultado: [
      { label: 'Atraso do fechamento mensal', antes: '270 dias', depois: '5 dias úteis' },
      { label: 'Margem líquida visível', antes: 'Não calculada', depois: '11,4% (auditada)' },
      { label: 'Custo financeiro anual', antes: 'R$ 1,42M', depois: 'R$ 0,78M', economia: 'R$ 640k/ano' },
      { label: 'Conflito societário', antes: 'Bloqueio total', depois: 'Acordo assinado · captação destravada' },
    ],
    prazo: '2024-Q1 → 2024-Q4',
    duracao: '9 meses',
    privacidade: 'Cliente autorizou divulgação anônima · Sob NDA até divulgação de oferta de capital',
  },
  {
    slug: 'fomento-captacao-pronamp-reformulado',
    cluster: 'fomento',
    titulo: 'Captação Pronamp + FCO — produtor médio em transição agroecológica',
    subtitulo:
      'Conduziu liberação de R$ 2,1M com taxa subsidiada (5,5% a.a.) para conversão de 600ha para soja não-OGM premium.',
    perfil: 'Produtor PF · 1.200ha · transição grãos convencionais → grãos não-OGM · PR · sucessão familiar em curso',
    desafio:
      'Cliente queria converter 600ha (50% da área) para sistema integração lavoura-floresta + soja não-OGM premium (mercado europeu). Custo de investimento estimado em R$ 2,4M. Banco principal vinha negando crédito por enquadramento Funrural irregular e DAP em revisão (DAP-PF caducada há 4 meses). Janela de plantio em 70 dias.',
    abordagem: [
      'Regularização DAP-PF + ITR em paralelo (frente fiscal + agro)',
      'Estruturação financeira: Pronamp (R$ 1,5M) + FCO Verde (R$ 600k) com taxa subsidiada por enquadramento agroecológico',
      'Modelagem de fluxo de caixa de transição (ano 1 produtividade -18%, ano 2 paridade, ano 3-5 prêmio sobre commodity convencional)',
      'Coordenação com banco operador (Banco do Brasil) e SEAB-PR (laudo técnico de enquadramento)',
      'Plano de mitigação climática: contrato de hedge climático para os 600ha em transição',
    ],
    resultado: [
      { label: 'Volume liberado', antes: 'R$ 0 (negado)', depois: 'R$ 2,1M', economia: undefined },
      { label: 'Taxa efetiva', antes: '14,5% a.a. (mercado)', depois: '5,5% a.a. (Pronamp+FCO)' },
      { label: 'Tempo da liberação', antes: 'Negado em 60d', depois: '38d desde diagnóstico' },
      { label: 'Janela de plantio', antes: 'Risco de perder', depois: 'Recuperada (concluído safra 2024/25)' },
    ],
    prazo: '2024-Q2 → 2024-Q3',
    duracao: '38 dias',
    privacidade: 'Cliente autorizou divulgação · Detalhes específicos da operação sob sigilo bancário',
  },
  {
    slug: 'gestao-governanca-cooperativa-paraibana',
    cluster: 'gestao',
    titulo: 'Governança & compliance — cooperativa de produtores rurais',
    subtitulo:
      'Implementou estrutura de auditoria interna + comitê de risco; recuperou rating de risco bancário B → A em 8 meses.',
    perfil: 'Cooperativa · 412 cooperados · setor lácteo + grãos · MG · 22 anos · estatuto desatualizado desde 2008',
    desafio:
      'Cooperativa funcional mas com governança opaca — 14 anos sem auditoria externa, livro de atas com lacunas, conselho fiscal inativo. Bancos parceiros começaram a tarifar premium (40 bps acima de comparáveis) por classificação de risco interno B. Diretoria queria captar emissão de CRA (R$ 8M) para modernização de planta, mas ratings agencies negavam due diligence sem governança formal.',
    abordagem: [
      'Diagnóstico de gaps regulatórios (IFRS 9, BCB Res. 4.434/2015, Lei 5.764)',
      'Reestruturação do estatuto + atualização de regimentos (assembleia extraordinária)',
      'Implantação de comitê de auditoria interno (3 membros independentes)',
      'Reativação do conselho fiscal + cronograma de auditoria externa anual',
      'Manuais de compliance, política de partes relacionadas, código de conduta',
      'Acompanhamento de rating com 2 agências (Fitch e Moodys) ao longo de 8 meses',
    ],
    resultado: [
      { label: 'Rating bancário', antes: 'B', depois: 'A', economia: '40 bps no custo' },
      { label: 'Compliance regulatório', antes: '47% conformidade', depois: '94% conformidade' },
      { label: 'Captação CRA', antes: 'Não viável', depois: 'R$ 8M emitido · taxa CDI+1,8%' },
      { label: 'Tempo até auditoria limpa', antes: '14 anos s/ auditoria', depois: 'Pareceres limpos 2024+2025' },
    ],
    prazo: '2024-Q1 → 2024-Q3',
    duracao: '8 meses',
    privacidade: 'Cliente autorizou divulgação · Detalhes do CRA registrados publicamente na CVM',
  },
  {
    slug: 'agro-descaracterizacao-credito-rural',
    cluster: 'agro',
    titulo: 'Descaracterização de crédito rural — produtor em recuperação',
    subtitulo:
      'Súmula 596 STJ + tese de descaracterização parcial; redução de R$ 1,1M no saldo devedor (47%).',
    perfil: 'Produtor PF · 850ha · soja+milho · GO · operação rural por 22 anos · ação judicial em andamento',
    desafio:
      'Cliente havia tomado financiamento de custeio rural em 2018 que foi convertido pelo banco em "crédito empresarial" após repactuação informal em 2021 — perdendo o caráter rural protegido (juros limitados, prazo casado, garantias diferenciadas). Banco aplicava juros remuneratórios de 17,8% a.a. + comissão de permanência + multa, contrariando Súmula 596 STJ e Resolução BCB 4.292/2013.',
    abordagem: [
      'Recálculo completo do saldo aplicando taxa correta de crédito rural (Selic + delta tabelado)',
      'Mapeamento das parcelas pagas com aplicação de Tabela Price reversa para identificar amortização real vs. juros',
      'Tese jurídica: descaracterização parcial das parcelas pós-2021 (caráter rural mantido pela origem do recurso)',
      'Negociação extrajudicial com o banco antes do leilão da garantia (matrícula de imóvel rural)',
      'Acordo homologado em juízo com desconto sobre o saldo "errado"',
    ],
    resultado: [
      { label: 'Saldo devedor (banco)', antes: 'R$ 2.380.000', depois: 'R$ 1.260.000', economia: 'R$ 1,12M' },
      { label: 'Taxa aplicada (anuais)', antes: '17,8%', depois: '8,2% (Pronamp safra)' },
      { label: 'Bloqueio judicial da matrícula', antes: 'Iminente', depois: 'Suspenso · garantia preservada' },
      { label: 'Dossiê para outros credores', antes: '—', depois: 'Tese aplicada em mais 3 negociações posteriores' },
    ],
    prazo: '2024-Q3 → 2025-Q1',
    duracao: '5 meses',
    privacidade: 'Cliente autorizou divulgação · Acordo homologado tem segredo de justiça parcial · Saldos arredondados',
  },
]

const ICONS: Record<Case['cluster'], typeof Wheat> = {
  agro: Wheat,
  corporate: Building2,
  fomento: Sprout,
  gestao: ShieldCheck,
}

const CLUSTER_LABEL: Record<Case['cluster'], string> = {
  agro: 'ALETIS Agro',
  corporate: 'ALETIS Corporate',
  fomento: 'ALETIS Fomento',
  gestao: 'ALETIS Gestão',
}

export default function CasesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Recortes de atuação"
        titulo="Situações em que método financeiro muda a conversa"
        subtitulo="Exemplos anonimizados de problemas que aparecem no agro: dívida concentrada, caixa sem visibilidade, captação travada, governança frágil e contratos que merecem revisão."
      />

      <Section tone="cream">
        <Container>
          <div className="grid gap-8 lg:gap-12">
            {CASES.map((c, idx) => {
              const Icon = ICONS[c.cluster]
              return (
                <Reveal key={c.slug} delay={idx * 60}>
                  <article className="overflow-hidden rounded-2xl border border-aletis-borda bg-white shadow-sm transition-shadow hover:shadow-md">
                    <header className="border-b border-aletis-borda/60 bg-aletis-cream-marfim p-6 sm:p-8">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-aletis-verde/10 text-aletis-verde">
                            <Icon className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="font-display text-[10px] uppercase tracking-widest2 text-aletis-gold">
                              {CLUSTER_LABEL[c.cluster]} · case #{idx + 1}
                            </p>
                            <h2 className="mt-1 font-display text-xl font-bold leading-tight text-aletis-verde sm:text-2xl">
                              {c.titulo}
                            </h2>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 flex-col gap-1 text-right text-[11px] font-body text-aletis-verde-medio sm:text-xs">
                          <span>
                            <strong className="font-semibold">Prazo</strong>: {c.prazo}
                          </span>
                          <span>
                            <strong className="font-semibold">Duração</strong>: {c.duracao}
                          </span>
                        </div>
                      </div>
                      <p className="mt-4 text-sm font-body text-aletis-verde-medio sm:text-base">
                        {c.subtitulo}
                      </p>
                    </header>

                    <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1fr] lg:gap-10">
                      <div>
                        <Eyebrow>Perfil do cliente</Eyebrow>
                        <p className="mt-2 text-sm font-body text-aletis-verde-medio">{c.perfil}</p>

                        <Eyebrow className="mt-6">O desafio</Eyebrow>
                        <p className="mt-2 text-sm font-body leading-relaxed text-aletis-grafite-escuro">
                          {c.desafio}
                        </p>

                        <Eyebrow className="mt-6">Abordagem ALETIS</Eyebrow>
                        <ul className="mt-2 space-y-1.5">
                          {c.abordagem.map((item, i) => (
                            <li
                              key={i}
                              className="flex gap-2 text-sm font-body text-aletis-grafite-escuro"
                            >
                              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-aletis-gold" />
                              <span className="leading-relaxed">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <Eyebrow>Resultados auditados</Eyebrow>
                        <div className="mt-2 space-y-2">
                          {c.resultado.map((r, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-aletis-cream-escuro/60 bg-aletis-cream-marfim p-3 sm:p-4"
                            >
                              <p className="font-display text-[10px] uppercase tracking-widest2 text-aletis-verde-medio">
                                {r.label}
                              </p>
                              <div className="mt-1 flex items-baseline gap-2 text-sm sm:text-base">
                                <span className="font-mono font-semibold text-aletis-grafite-medio line-through">
                                  {r.antes}
                                </span>
                                <span className="font-display font-bold text-aletis-verde">→</span>
                                <span className="font-mono font-bold text-aletis-verde">
                                  {r.depois}
                                </span>
                              </div>
                              {r.economia && (
                                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-aletis-verde/10 px-2 py-0.5 text-[10px] font-semibold text-aletis-verde">
                                  <TrendingDown className="h-2.5 w-2.5" /> Economia · {r.economia}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="mt-4 text-[11px] italic leading-relaxed text-aletis-verde-medio">
                          {c.privacidade}
                        </p>
                      </div>
                    </div>
                  </article>
                </Reveal>
              )
            })}
          </div>
        </Container>
      </Section>

      <Section tone="bege">
        <Container>
          <div className="mx-auto max-w-3xl rounded-2xl border border-aletis-borda bg-aletis-cream-marfim p-8 text-center sm:p-12">
            <Eyebrow className="justify-center">Seu cenário</Eyebrow>
            <h2 className="mt-3 font-display text-2xl font-bold text-aletis-verde sm:text-3xl">
              Todo trabalho começa por uma primeira leitura organizada
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm font-body leading-relaxed text-aletis-verde-medio sm:text-base">
              Se sua operação se parece com algum desses recortes, a primeira conversa serve
              para entender urgência, documentos disponíveis e se há base para avançar com NDA.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/contato" className="inline-flex items-center gap-1.5">
                Agendar diagnóstico <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/calculadoras/reestruturacao" variant="secondary">
                Simular meu cenário primeiro
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  )
}

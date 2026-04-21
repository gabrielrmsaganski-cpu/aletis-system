import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, FileLock2, UserCog, Mail } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'
import { siteConfig } from '@/lib/siteConfig'

export const metadata: Metadata = {
  title: 'Política de Privacidade · Termos de Uso · LGPD',
  description:
    'Política de Privacidade, Termos de Uso e compromissos LGPD da ALETIS Finanças Estratégicas — como tratamos dados de clientes e visitantes.',
}

const principios = [
  {
    icone: ShieldCheck,
    titulo: 'Finalidade legítima',
    desc: 'Dados coletados somente quando há base legal (consentimento, contrato, interesse legítimo) e finalidade explícita.',
  },
  {
    icone: FileLock2,
    titulo: 'Minimização e segurança',
    desc: 'Coletamos o mínimo necessário. Armazenamento em ambiente controlado, com criptografia em repouso e em trânsito.',
  },
  {
    icone: UserCog,
    titulo: 'Direitos do titular',
    desc: 'Acesso, correção, portabilidade, exclusão e revogação do consentimento — atendidos em até 15 dias úteis.',
  },
  {
    icone: Mail,
    titulo: 'Canal direto',
    desc: `Solicitações LGPD pelo e-mail ${siteConfig.contact.email} — tratadas pessoalmente pelo encarregado de dados.`,
  },
]

const atualizadoEm = '2026-04-10'

export default function PoliticaPage() {
  return (
    <>
      <PageHeader
        eyebrow="Política · LGPD · Termos"
        titulo={
          <>
            Sigilo é pré-requisito,{' '}
            <span className="italic text-aletis-dourado">não marketing</span>.
          </>
        }
        subtitulo="Documento único consolidando Política de Privacidade, compromissos LGPD (Lei 13.709/18) e Termos de Uso do site ALETIS. Escrito para ser lido — não para ser decorativo."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Política de Privacidade' },
        ]}
      />

      <Section tone="marfim">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {principios.map((p, i) => {
              const Icon = p.icone
              return (
                <Reveal key={p.titulo} delay={i * 60}>
                  <article className="h-full rounded-2xl border border-aletis-borda/70 bg-white p-6 transition hover:border-aletis-dourado/40 hover:shadow-premium-sm">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/10 text-aletis-verde-escuro">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 font-display text-base font-semibold text-aletis-grafite-escuro">
                      {p.titulo}
                    </h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-aletis-grafite-medio">
                      {p.desc}
                    </p>
                  </article>
                </Reveal>
              )
            })}
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-[240px_1fr]">
            {/* TOC sticky */}
            <nav aria-label="Sumário" className="hidden lg:block">
              <div className="sticky top-24 rounded-2xl border border-aletis-borda/70 bg-white p-5">
                <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                  Sumário
                </p>
                <ul className="mt-4 space-y-2 text-[12px]">
                  <li>
                    <a href="#lgpd" className="text-aletis-grafite-medio hover:text-aletis-verde-escuro">
                      1 · Política LGPD
                    </a>
                  </li>
                  <li>
                    <a href="#dados" className="text-aletis-grafite-medio hover:text-aletis-verde-escuro">
                      2 · Dados tratados
                    </a>
                  </li>
                  <li>
                    <a href="#bases" className="text-aletis-grafite-medio hover:text-aletis-verde-escuro">
                      3 · Bases legais
                    </a>
                  </li>
                  <li>
                    <a href="#cookies" className="text-aletis-grafite-medio hover:text-aletis-verde-escuro">
                      4 · Cookies
                    </a>
                  </li>
                  <li>
                    <a href="#direitos" className="text-aletis-grafite-medio hover:text-aletis-verde-escuro">
                      5 · Direitos do titular
                    </a>
                  </li>
                  <li>
                    <a href="#compartilhamento" className="text-aletis-grafite-medio hover:text-aletis-verde-escuro">
                      6 · Compartilhamento
                    </a>
                  </li>
                  <li>
                    <a href="#termos" className="text-aletis-grafite-medio hover:text-aletis-verde-escuro">
                      7 · Termos de Uso
                    </a>
                  </li>
                  <li>
                    <a href="#contato" className="text-aletis-grafite-medio hover:text-aletis-verde-escuro">
                      8 · Encarregado / DPO
                    </a>
                  </li>
                </ul>
                <p className="mt-5 border-t border-aletis-borda/70 pt-4 text-[11px] text-aletis-grafite-claro">
                  Última atualização
                  <br />
                  <span className="font-display font-semibold text-aletis-grafite-medio">
                    10 de abril de 2026
                  </span>
                </p>
              </div>
            </nav>

            {/* Corpo */}
            <article className="prose-aletis min-w-0 space-y-12">
              <section id="lgpd">
                <h2 className="font-display text-3xl font-semibold text-aletis-grafite-escuro">
                  1. Política LGPD
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-aletis-grafite-medio">
                  A ALETIS Finanças Estratégicas é controladora de dados pessoais nos termos do art. 5º, VI, da Lei 13.709/18 (LGPD). Atuamos sob a premissa de que dado pessoal é um ativo do titular, não da empresa que o coleta. Toda operação de tratamento passa por análise de finalidade, necessidade e proporcionalidade antes de ocorrer.
                </p>
                <p className="mt-4 text-[16px] leading-relaxed text-aletis-grafite-medio">
                  Nossa política aplica-se a visitantes do site, leads que preenchem formulários, clientes contratados e qualquer pessoa que interaja com os canais oficiais da ALETIS.
                </p>
              </section>

              <section id="dados">
                <h2 className="font-display text-3xl font-semibold text-aletis-grafite-escuro">
                  2. Dados tratados
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-aletis-grafite-medio">
                  Tratamos os seguintes conjuntos de dados, sempre limitados ao necessário para a finalidade declarada:
                </p>
                <ul className="mt-5 space-y-3 text-[15px] leading-relaxed text-aletis-grafite-medio">
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    <span>
                      <strong className="text-aletis-grafite-escuro">Dados de contato:</strong> nome, e-mail, telefone, WhatsApp, cidade, UF.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    <span>
                      <strong className="text-aletis-grafite-escuro">Dados profissionais:</strong> segmento de atuação, tamanho da operação, interesse.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    <span>
                      <strong className="text-aletis-grafite-escuro">Dados contratuais (clientes):</strong> contratos rurais, extratos bancários, documentos financeiros — tratados sob NDA e exclusivamente para a finalidade do serviço contratado.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    <span>
                      <strong className="text-aletis-grafite-escuro">Dados de navegação:</strong> IP anonimizado, user-agent, páginas visitadas, tempo de sessão — via cookies estritamente necessários e analíticos.
                    </span>
                  </li>
                </ul>
              </section>

              <section id="bases">
                <h2 className="font-display text-3xl font-semibold text-aletis-grafite-escuro">
                  3. Bases legais
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-aletis-grafite-medio">
                  Cada tratamento é amparado em uma das bases do art. 7º da LGPD:
                </p>
                <ul className="mt-5 space-y-3 text-[15px] leading-relaxed text-aletis-grafite-medio">
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    <span>
                      <strong className="text-aletis-grafite-escuro">Consentimento</strong> (I) — formulários de contato e comunicações de marketing.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    <span>
                      <strong className="text-aletis-grafite-escuro">Execução de contrato</strong> (V) — prestação dos serviços contratados.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    <span>
                      <strong className="text-aletis-grafite-escuro">Legítimo interesse</strong> (IX) — segurança do site, prevenção a fraude, métricas agregadas.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    <span>
                      <strong className="text-aletis-grafite-escuro">Cumprimento de obrigação legal</strong> (II) — retenção fiscal, contábil e regulatória.
                    </span>
                  </li>
                </ul>
              </section>

              <section id="cookies">
                <h2 className="font-display text-3xl font-semibold text-aletis-grafite-escuro">
                  4. Cookies
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-aletis-grafite-medio">
                  Utilizamos cookies estritamente necessários para operação do site e cookies analíticos anonimizados para entender padrões agregados de uso. Não utilizamos cookies de rastreamento publicitário de terceiros. O usuário pode desabilitar cookies nas preferências do navegador sem prejuízo ao conteúdo institucional.
                </p>
              </section>

              <section id="direitos">
                <h2 className="font-display text-3xl font-semibold text-aletis-grafite-escuro">
                  5. Direitos do titular
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-aletis-grafite-medio">
                  Nos termos do art. 18 da LGPD, o titular dos dados pode requisitar:
                </p>
                <ul className="mt-5 space-y-2 text-[15px] leading-relaxed text-aletis-grafite-medio">
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    Confirmação da existência de tratamento
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    Acesso aos dados tratados
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    Correção de dados incompletos, inexatos ou desatualizados
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    Anonimização, bloqueio ou eliminação de dados desnecessários
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    Portabilidade para outro controlador
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    Eliminação dos dados tratados com consentimento
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
                    Revogação do consentimento a qualquer tempo
                  </li>
                </ul>
              </section>

              <section id="compartilhamento">
                <h2 className="font-display text-3xl font-semibold text-aletis-grafite-escuro">
                  6. Compartilhamento de dados
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-aletis-grafite-medio">
                  A ALETIS não comercializa, aluga ou cede dados pessoais a terceiros para fins de marketing. Compartilhamos dados apenas nas seguintes hipóteses: (i) com operadores contratados sob instrumento formal de tratamento (hospedagem, e-mail transacional); (ii) por determinação legal ou regulatória; (iii) na defesa de direitos em processo judicial, administrativo ou arbitral; (iv) mediante autorização expressa do titular.
                </p>
              </section>

              <section id="termos">
                <h2 className="font-display text-3xl font-semibold text-aletis-grafite-escuro">
                  7. Termos de Uso do site
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-aletis-grafite-medio">
                  O conteúdo deste site é propriedade intelectual da ALETIS e não constitui consultoria financeira, jurídica ou tributária específica. Cálculos e simuladores oferecidos são estimativas preliminares com base em parâmetros informados pelo usuário; qualquer decisão deve ser validada por análise contratual formal.
                </p>
                <p className="mt-4 text-[16px] leading-relaxed text-aletis-grafite-medio">
                  Reprodução total ou parcial de artigos e materiais proprietários requer autorização prévia por escrito. Links externos eventualmente referenciados não implicam endosso institucional.
                </p>
              </section>

              <section id="contato">
                <h2 className="font-display text-3xl font-semibold text-aletis-grafite-escuro">
                  8. Encarregado pelo Tratamento de Dados
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-aletis-grafite-medio">
                  Qualquer solicitação relacionada a dados pessoais, LGPD ou a este documento deve ser encaminhada ao encarregado pelo tratamento de dados (DPO) da ALETIS:
                </p>
                <div className="mt-6 inline-flex flex-col gap-1 rounded-2xl border border-aletis-borda/70 bg-aletis-bege/60 p-6">
                  <span className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado-escuro">
                    Encarregado de Dados · ALETIS
                  </span>
                  <a
                    href={`mailto:${siteConfig.contact.email}`}
                    className="font-display text-lg font-semibold text-aletis-verde-escuro hover:text-aletis-dourado-escuro"
                  >
                    {siteConfig.contact.email}
                  </a>
                  <span className="text-[13px] text-aletis-grafite-medio">
                    Resposta formal em até 15 dias úteis.
                  </span>
                </div>
              </section>

              <div className="mt-16 rounded-2xl border border-aletis-borda/70 bg-white p-6 text-[12px] text-aletis-grafite-claro">
                Última atualização: <strong className="text-aletis-grafite-medio">10/04/2026</strong>.
                A ALETIS pode atualizar esta política a qualquer momento; alterações materiais serão comunicadas
                por e-mail a clientes ativos e destacadas nesta página.
                <span className="sr-only">{atualizadoEm}</span>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link href="/contato" className="btn-primary">
                  Falar com o encarregado
                </Link>
                <Link
                  href="/"
                  className="font-display text-sm font-semibold uppercase tracking-wider2 text-aletis-verde-escuro hover:text-aletis-dourado-escuro"
                >
                  Voltar ao início
                </Link>
              </div>
            </article>
          </div>
        </Container>
      </Section>
    </>
  )
}

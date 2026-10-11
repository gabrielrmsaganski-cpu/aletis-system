import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { PageHeader } from '@/components/ui/PageHeader'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Reveal } from '@/components/ui/Reveal'
import { ButtonLink } from '@/components/ui/Button'
import { BookOpen, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Glossário técnico — ALETIS',
  description:
    'Termos técnicos de crédito rural, negociação, mercado e gestão financeira explicados com a precisão necessária para decidir.',
  alternates: { canonical: 'https://aletis.com.br/glossario' },
}

interface Termo {
  termo: string
  sigla?: string
  categoria: 'Crédito' | 'Reestruturação' | 'Mercado' | 'Compliance' | 'Agro' | 'Fiscal'
  definicao: string
  contexto: string
  ondeAparece?: { label: string; href: string }
}

const TERMOS: Termo[] = [
  {
    termo: 'DSCR',
    sigla: 'Debt Service Coverage Ratio',
    categoria: 'Crédito',
    definicao:
      'Razão entre o resultado operacional disponível para pagamento e o serviço da dívida no mesmo período. Mede a capacidade real de honrar parcelas sem stress.',
    contexto:
      'Bancos exigem DSCR ≥ 1,2× para crédito agro saudável. Abaixo de 1,0 indica que a operação não gera caixa suficiente para honrar — estado pré-default. ALETIS usa DSCR projetado para 3 safras como gating de toda análise.',
    ondeAparece: { label: 'Calculadora de capacidade de safra', href: '/calculadoras/capacidade-safra' },
  },
  {
    termo: 'Basis',
    categoria: 'Mercado',
    definicao:
      'Diferença entre o preço local (porto, cidade do produtor) e o preço de referência (CBOT Chicago, B3). Reflete custo logístico, qualidade e demanda regional.',
    contexto:
      'Em soja brasileira, basis pode oscilar de -US$ 0,80/bu (porto Santos) a -US$ 2,00/bu (interior MT) em meses de safra. Análise de basis é crítica para timing de venda — vender na "errada" costuma custar 8-15% da receita.',
  },
  {
    termo: 'Súmula 596 STJ',
    categoria: 'Crédito',
    definicao:
      'Súmula que estabelece: "As disposições do Decreto 22.626/1933 não se aplicam às taxas de juros e aos demais encargos cobrados nas operações realizadas por instituições públicas ou privadas, integrantes do Sistema Financeiro Nacional."',
    contexto:
      'Frequentemente usada por bancos para justificar juros remuneratórios "ilimitados" em crédito comum. Mas NÃO se aplica integralmente a crédito rural — onde Decreto-Lei 167/67 + Resolução CMN-CMN impõem teto. Tese de descaracterização baseia-se exatamente nesse limite.',
  },
  {
    termo: 'PGFN',
    sigla: 'Procuradoria-Geral da Fazenda Nacional',
    categoria: 'Fiscal',
    definicao:
      'Órgão responsável pela cobrança de débitos tributários federais (incluídos aí ITR, Funrural, contribuições previdenciárias rurais).',
    contexto:
      'Inscrição em PGFN ativa = possibilidade de penhora judicial e bloqueio bancário. Tem editais periódicos de transação tributária (descontos significativos) que ALETIS monitora e usa como alavanca de negociação.',
  },
  {
    termo: 'CPR',
    sigla: 'Cédula de Produto Rural',
    categoria: 'Agro',
    definicao:
      'Título de crédito que permite ao produtor antecipar receita futura da safra. Pode ser CPR física (entrega de produto) ou CPR financeira (liquidação em dinheiro).',
    contexto:
      'Instrumento amplamente usado para captação de recursos. Bancos, traders e fundos compram CPR de produtores. ALETIS estrutura CPRs para clientes capturarem prêmio sobre commodities ou financiarem custeio.',
  },
  {
    termo: 'Pronamp',
    sigla: 'Programa Nacional de Apoio ao Médio Produtor',
    categoria: 'Crédito',
    definicao:
      'Linha de crédito rural com taxa subsidiada para produtores com receita bruta anual de até R$ 3,16M (limite 2025/26).',
    contexto:
      'Taxa típica 5-8% a.a. (vs. 14-16% mercado). Disponível para custeio, investimento e comercialização. Acesso depende de DAP-PF/DAP-J válida + ITR em dia + enquadramento na receita máxima.',
  },
  {
    termo: 'FCO',
    sigla: 'Fundo Constitucional do Centro-Oeste',
    categoria: 'Crédito',
    definicao:
      'Fonte de recursos para projetos de investimento na região Centro-Oeste, operada pelo Banco do Brasil.',
    contexto:
      'Linhas FCO Verde (sustentabilidade), FCO Empresarial e FCO Rural com taxas subsidiadas (4-8% a.a.) e prazos longos (até 20 anos). Particularmente útil para investimento em infraestrutura rural e transição agroecológica.',
  },
  {
    termo: 'Anatocismo',
    categoria: 'Crédito',
    definicao:
      'Capitalização de juros sobre juros — a famosa "juros compostos" aplicada de forma a inflar a dívida sem amortização proporcional.',
    contexto:
      'Vedado em diversos contratos de crédito rural (Súmula 93 STJ, Decreto-Lei 167/67). Quando bancos aplicam anatocismo em contrato rural, pode haver base para revisão judicial. ALETIS revisa os contratos antes de qualquer negociação.',
  },
  {
    termo: 'Funrural',
    categoria: 'Fiscal',
    definicao:
      'Contribuição previdenciária rural devida sobre a receita bruta da comercialização da produção agropecuária do produtor pessoa física.',
    contexto:
      'Alíquota 1,5% sobre a receita bruta. STF confirmou constitucionalidade em 2017. Inadimplência gera bloqueio de comercialização (cooperativas e tradings retêm Funrural na fonte). Regularização passa por parcelamento PGFN ou tese específica de cada caso.',
  },
  {
    termo: 'CCIR',
    sigla: 'Certificado de Cadastro de Imóvel Rural',
    categoria: 'Agro',
    definicao:
      'Certificado emitido pelo INCRA que comprova o cadastro do imóvel rural no SNCR (Sistema Nacional de Cadastro Rural). Documento essencial para qualquer transação rural.',
    contexto:
      'Obrigatório para acessar crédito rural, vender terra, dar em garantia, herdar. Validade anual (vinculada ao ITR em dia). Sem CCIR válido, quase tudo trava — ALETIS regulariza ITR + CCIR como passo zero de qualquer negociação.',
  },
  {
    termo: 'BPO Financeiro',
    sigla: 'Business Process Outsourcing',
    categoria: 'Compliance',
    definicao:
      'Terceirização da operação financeira completa: contas a pagar/receber, conciliação bancária, fluxo de caixa, fechamento contábil-gerencial, DRE, indicadores.',
    contexto:
      'Diferente de contabilidade fiscal (obrigatória, foco compliance). BPO é operacional — gera dashboards e KPIs em tempo real para o sócio decidir. ALETIS Corporate é especializada em BPO para revendas, cooperativas e empresas do agronegócio.',
  },
  {
    termo: 'Reestruturação de dívida',
    categoria: 'Reestruturação',
    definicao:
      'Reorganização do passivo financeiro com objetivo de tornar honrável: novas condições de pagamento, descontos, prazos, garantias, conversão de moeda ou índice.',
    contexto:
      'NÃO é "calote organizado" — é alinhamento entre capacidade real de pagamento e estrutura da dívida. Pode ser bilateral (1 credor) ou consolidada (vários credores no mesmo plano). ALETIS organiza a leitura financeira, a sequência de abordagem e os documentos de apoio.',
    ondeAparece: { label: 'Calculadora de reestruturação', href: '/calculadoras/reestruturacao' },
  },
  {
    termo: 'DAP',
    sigla: 'Declaração de Aptidão ao Pronaf',
    categoria: 'Agro',
    definicao:
      'Documento que comprova que o produtor está apto a acessar políticas públicas de crédito rural — Pronaf, Pronamp, Funcafé, etc.',
    contexto:
      'DAP-PF (pessoa física) ou DAP-J (pessoa jurídica). Validade 2 anos. Sem DAP, sem crédito subsidiado. Emissão pelos sindicatos rurais ou EMATER. Requer ITR em dia + comprovação de renda compatível com o programa pretendido.',
  },
  {
    termo: 'ITR',
    sigla: 'Imposto Territorial Rural',
    categoria: 'Fiscal',
    definicao:
      'Imposto federal sobre propriedades rurais com base no Valor da Terra Nua. Cobrança anual via DITR (Declaração).',
    contexto:
      'ITR atrasado bloqueia praticamente todas as operações rurais (CCIR, DAP, crédito). Regularização passa por declaração do exercício corrente + parcelamento das parcelas anteriores via PGFN. ALETIS trata esse ponto antes da negociação financeira.',
  },
  {
    termo: 'Súmula 93 STJ',
    categoria: 'Crédito',
    definicao:
      '"A legislação sobre cédulas de crédito rural, comercial e industrial admite o pacto de capitalização de juros."',
    contexto:
      'Esta súmula é frequentemente usada por bancos para defender capitalização de juros em CCB rural. Mas ela só vale para CCBs originárias rurais — não vale quando o crédito foi reciclado/repactuado para "crédito empresarial". Caso típico de descaracterização que ALETIS opera.',
  },
  {
    termo: 'Hedge',
    categoria: 'Mercado',
    definicao:
      'Contrato derivativo que trava o preço futuro de venda da commodity, eliminando volatilidade do preço final.',
    contexto:
      'Pode ser via B3 (futuros), CPR de commodity, NDF de câmbio ou contrato OTC com trader. Para o produtor, é seguro contra queda de preço — abre mão do upside em troca de previsibilidade. ALETIS estrutura hedge dimensionado pela necessidade de DSCR mínimo, não pela maximização especulativa.',
  },
  {
    termo: 'Custeio rural',
    categoria: 'Agro',
    definicao:
      'Linha de crédito destinada a financiar custos operacionais da safra (sementes, fertilizantes, defensivos, mão de obra, combustível).',
    contexto:
      'Prazo típico: ciclo da safra (até 12 meses). Taxas subsidiadas (Pronaf 2-4%, Pronamp 5-8%, demais 8-14%). Vinculado a plano simplificado ou diagnóstico técnico (depende do volume). Inadimplência grave em custeio bloqueia próximas safras.',
  },
  {
    termo: 'CRA',
    sigla: 'Certificado de Recebíveis do Agronegócio',
    categoria: 'Mercado',
    definicao:
      'Título de renda fixa emitido por securitizadora, lastreado em recebíveis do agronegócio. Vendido a investidores institucionais e PF qualificados.',
    contexto:
      'Permite ao agronegócio acessar capital de investidores fora do sistema bancário tradicional. Volume crescente — passou de R$ 30B para R$ 100B+ entre 2020-2024. Cooperativas e revendas grandes usam CRA para financiar estoques e expansão.',
  },
]

const CATEGORIAS = ['Crédito', 'Reestruturação', 'Mercado', 'Compliance', 'Agro', 'Fiscal'] as const

export default function GlossarioPage() {
  // Agrupar por categoria mantendo ordem alfabética dentro de cada uma
  const grupos = CATEGORIAS.map((cat) => ({
    cat,
    termos: TERMOS.filter((t) => t.categoria === cat).sort((a, b) => a.termo.localeCompare(b.termo)),
  }))

  return (
    <>
      <PageHeader
        eyebrow="Glossário"
        titulo="Termos técnicos, sem dialeto"
        subtitulo="DSCR, basis, Súmula 596, descaracterização, Pronamp, Funrural — quando algo entra em discussão financeira, queremos que você entenda o que está em jogo."
      />

      <Section tone="cream">
        <Container>
          {/* Quick nav */}
          <nav className="mb-12 flex flex-wrap justify-center gap-2 sm:gap-3">
            {CATEGORIAS.map((cat) => (
              <a
                key={cat}
                href={`#cat-${cat.toLowerCase()}`}
                className="rounded-full border border-aletis-cream-escuro/60 bg-white px-3 py-1.5 text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-verde-medio transition-colors hover:border-aletis-verde hover:text-aletis-verde sm:text-xs"
              >
                {cat}
              </a>
            ))}
          </nav>

          <div className="space-y-16">
            {grupos.map((grupo, gIdx) => (
              <section key={grupo.cat} id={`cat-${grupo.cat.toLowerCase()}`}>
                <Reveal delay={gIdx * 60}>
                  <div className="mb-6 flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-aletis-gold" />
                    <Eyebrow>{grupo.cat}</Eyebrow>
                    <span className="font-body text-xs text-aletis-verde-medio">
                      {grupo.termos.length} termo{grupo.termos.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </Reveal>
                <div className="grid gap-5 sm:grid-cols-2">
                  {grupo.termos.map((t, i) => (
                    <Reveal key={t.termo} delay={i * 40}>
                      <article className="h-full rounded-xl border border-aletis-borda bg-white p-5 transition-shadow hover:shadow-md">
                        <header>
                          <h3 className="font-display text-base font-bold text-aletis-verde">
                            {t.termo}
                          </h3>
                          {t.sigla && (
                            <p className="mt-0.5 font-mono text-[11px] text-aletis-verde-medio">
                              {t.sigla}
                            </p>
                          )}
                        </header>
                        <p className="mt-3 text-sm font-body leading-relaxed text-aletis-grafite-escuro">
                          {t.definicao}
                        </p>
                        <p className="mt-2 text-[12.5px] font-body italic leading-relaxed text-aletis-verde-medio">
                          {t.contexto}
                        </p>
                        {t.ondeAparece && (
                          <Link
                            href={t.ondeAparece.href}
                            className="mt-3 inline-flex items-center gap-1 text-[11px] font-body font-semibold text-aletis-gold hover:underline"
                          >
                            {t.ondeAparece.label} →
                          </Link>
                        )}
                      </article>
                    </Reveal>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="bege" compact>
        <Container>
          <div className="mx-auto max-w-2xl rounded-2xl border border-aletis-borda bg-white p-8 text-center">
            <Eyebrow className="justify-center">Não achou o termo?</Eyebrow>
            <h2 className="mt-3 font-display text-xl font-bold text-aletis-verde sm:text-2xl">
              Mande pra gente. Adicionamos no próximo ciclo.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-body text-aletis-verde-medio">
              Esse glossário cresce com a comunidade. Se um termo travou seu entendimento de algum
              insight ou conversa, escreve pra gente — devolvemos com explicação contextual em até
              48 horas.
            </p>
            <ButtonLink href="/contato" className="mt-6 inline-flex items-center gap-1.5">
              Sugerir termo <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  )
}

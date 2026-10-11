import type { Metadata } from 'next'
import {
  ClipboardCheck,
  FileText,
  Search,
  ChevronRight,
  Check,
  FolderOpen,
  IdCard,
  Landmark,
  Sprout,
  ShieldCheck,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { Reveal } from '@/components/ui/Reveal'

export const metadata: Metadata = {
  title: 'Documentos Necessários · Checklist de Assessoria ALETIS',
  description:
    'Saiba quais documentos e informações são necessários para iniciar a assessoria de reestruturação financeira com a ALETIS: Entrevista Inicial, Documentos do Produtor Rural e Dados Adicionais.',
  alternates: { canonical: '/documentos-necessarios' },
}

/* ─── Dados ─── */
const CHECKLISTS = [
  {
    codigo: 'R.OP.003',
    nome: 'Entrevista Inicial',
    descricao:
      'Questionário para identificação e perfil básico do cliente no primeiro atendimento. Pode ser preenchido presencialmente ou enviado antecipadamente.',
    icone: ClipboardCheck,
    cor: 'text-aletis-verde-escuro bg-aletis-gold/10 border-aletis-gold/30',
    secoes: [
      {
        titulo: 'Identificação',
        itens: [
          'Nome completo do produtor',
          'CPF / CNPJ',
          'Endereço da fazenda / propriedade',
          'Cidade / UF',
          'Telefone de contato',
          'E-mail',
        ],
      },
      {
        titulo: 'Perfil Produtivo e Econômico',
        itens: [
          'Possui área própria? (Sim/Não + hectares)',
          'Cultiva área alugada/arrendada?',
          'Culturas praticadas',
          'Sistema "Porteira Fechada"?',
          'Carteira de estoque existe?',
          'Dívidas de safras anteriores?',
          'Projeto de investimento?',
          'Possui controle de custos / contas?',
          'Possui garantias para oferecer?',
        ],
      },
      {
        titulo: 'Perfil Comercial',
        itens: [
          'Já atendeu escritório de assessoria?',
          'Motivo da busca por consultoria',
          'Prazo esperado para resultado',
          'Valor estimado para investir',
        ],
      },
    ],
  },
  {
    codigo: 'R.OP.004',
    nome: 'Documentos do Produtor Rural',
    descricao:
      'Lista completa de documentação pessoal, fiscal e da propriedade necessária para elaboração do dossiê e abertura do processo.',
    icone: FolderOpen,
    cor: 'text-aletis-verde-escuro bg-aletis-sage/20 border-aletis-sage/45',
    secoes: [
      {
        titulo: 'Documentação Pessoal',
        itens: [
          'CNH (frente e verso)',
          'CPF',
          'RG',
          'Foto 3x4',
          'Título de Eleitor',
          'Certidão de Casamento (se casado)',
          'Comprovante de Residência',
        ],
      },
      {
        titulo: 'Impostos e Declarações',
        itens: [
          'IRPF – Declaração e recibo de entrega (últimos 3 anos)',
          'IRPJ (se pessoa jurídica)',
          'Certidão Negativa da Receita Federal',
          'Certidão Negativa da Fazenda Estadual',
          'Certidão Negativa da Prefeitura Municipal',
          'Certidão Negativa da Justiça do Trabalho (CNDT)',
        ],
      },
      {
        titulo: 'Documentação da Propriedade',
        itens: [
          'Matrícula dos imóveis (atualizada)',
          'CCIR (Certificado de Cadastro de Imóvel Rural)',
          'CAR (Cadastro Ambiental Rural)',
          'ITR (Imposto Territorial Rural) – últimos 3 exercícios',
          'Cópia da Quote Parte (se condomínio)',
          'Contrato de Arrendamento',
          'Contrato de Parceria',
        ],
      },
      {
        titulo: 'Produção e Endividamento',
        itens: [
          'Quadro de Safra Anterior / Atual',
          'Declaração de Endividamento Atual',
          'Contratos de Crédito Atuais',
          'Notas Promissórias / Duplicatas',
        ],
      },
      {
        titulo: 'Documentos Adicionais',
        itens: [
          'Mapa de Romaneios',
          'Declaração de Culturas Plantadas',
          'NTN (se circunstância)',
          'Laudos / Avaliações Técnicas',
          'Outros documentos relevantes',
        ],
      },
    ],
  },
  {
    codigo: 'R.OP.005',
    nome: 'Dados Adicionais',
    descricao:
      'Aprofundamento cadastral pós-entrevista: validação de dados, conferência fiscal e mapeamento de garantias para elaboração do dossiê.',
    icone: Search,
    cor: 'text-aletis-verde-escuro bg-aletis-cream border-aletis-borda',
    secoes: [
      {
        titulo: 'Validação IRPF x Imóveis',
        itens: [
          'IRPF conferido e compatível com censo/cadastro?',
          'Imóveis declarados no IRPF coincidem com CCIR/CAR?',
          'Receita Bruta informada no IRPF',
          'Carteira ARR informada?',
          'Relação de culturas possíveis na propriedade',
          'Área + Potencial de produção',
        ],
      },
      {
        titulo: 'Empresa — Pessoa Jurídica (se aplicável)',
        itens: [
          'Contrato Social / Última Alteração',
          'CCMEI – Verificação e validação',
          'CNPJ de todos os sócios anotados',
          'Relação de sócios e vínculos com outras empresas',
          'BACEN – Carta Letra A consultada',
          'BACEN – Carta Letra B consultada',
          'BACEN – Carta Letra C consultada',
          'BACEN – Carta Letra E consultada',
          'Outras consultas BACEN realizadas',
        ],
      },
      {
        titulo: 'Mapeamento de Garantias',
        itens: [
          'Garantias dadas à instituições de crédito',
          'Ordem de prioridade das garantias',
          'Valor aproximado das garantias',
          'Propriedade com benfeitorias?',
          'Despesas administrativas / operacionais identificadas',
          'Renúncia à garantia?',
          'SonsusPAD / Processos vinculados',
          'Anotações legais / restrições',
        ],
      },
      {
        titulo: 'Dados do Produtor / DAP',
        itens: [
          'CEI (Cadastro Específico do INSS) / GFIP',
          'DAP / RG',
          'Capacidade Produtiva Declarada (CPD)',
          'Rastreabilidade de safra (quem comprou / vendeu)',
          'Programas de governo vinculados',
          'Área declarada na DAP (ha)',
          'Área própria declarada (ha)',
          'Área arrendada / parceria declarada (ha)',
        ],
      },
      {
        titulo: 'Datas e Vencimentos',
        itens: [
          'Data limite / vencimento da operação',
          'Validade dos contratos de arrendamento/parceria',
          'Validade dos contratos de cana (fornecimento)',
          'Validade do Seguro da Safra',
          'Validade das certidões negativas',
        ],
      },
    ],
  },
]

export default function DocumentosNecessariosPage() {
  return (
    <>
      <PageHeader
        eyebrow="Checklist de Assessoria"
        titulo={
          <>
            Documentos necessários para{' '}
            <span className="italic text-aletis-dourado">reestruturação financeira</span>.
          </>
        }
        subtitulo="Reúna antecipadamente a documentação abaixo para que nossa equipe possa iniciar o diagnóstico sem atrasos. Dividimos o processo em três etapas: entrevista inicial, documentos obrigatórios e dados complementares."
        breadcrumbs={[
          { label: 'Início', href: '/' },
          { label: 'Documentos Necessários' },
        ]}
      />

      <Section tone="marfim">
        <Container>
          {/* Resumo visual */}
          <Reveal>
            <div className="grid gap-4 sm:grid-cols-3 mb-12">
              <div className="rounded-2xl border border-aletis-gold/30 bg-aletis-gold/10 p-6 text-center">
                <ClipboardCheck className="w-8 h-8 text-aletis-gold-escuro mx-auto mb-3" />
                <h3 className="font-display font-semibold text-aletis-verde">R.OP.003</h3>
                <p className="text-sm text-aletis-verde-medio mt-1">19 campos de perfil e identificação</p>
              </div>
              <div className="rounded-2xl border border-aletis-sage/45 bg-aletis-sage/20 p-6 text-center">
                <FolderOpen className="w-8 h-8 text-aletis-verde-escuro mx-auto mb-3" />
                <h3 className="font-display font-semibold text-aletis-verde">R.OP.004</h3>
                <p className="text-sm text-aletis-verde-medio mt-1">27 documentos para coleta</p>
              </div>
              <div className="rounded-2xl border border-aletis-borda bg-aletis-cream p-6 text-center">
                <Search className="w-8 h-8 text-aletis-gold-escuro mx-auto mb-3" />
                <h3 className="font-display font-semibold text-aletis-verde">R.OP.005</h3>
                <p className="text-sm text-aletis-verde-medio mt-1">34 campos de validação e aprofundamento</p>
              </div>
            </div>
          </Reveal>

          {/* Checklists detalhados */}
          <div className="space-y-10">
            {CHECKLISTS.map((cl, idx) => {
              const Icon = cl.icone
              const totalItens = cl.secoes.reduce((acc, s) => acc + s.itens.length, 0)
              return (
                <Reveal key={cl.codigo} delay={idx * 80}>
                  <article className="rounded-3xl border border-aletis-borda/70 bg-white overflow-hidden">
                    {/* Header do checklist */}
                    <div className={`px-8 py-6 border-b ${cl.cor.split(' ').slice(1).join(' ')}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${cl.cor.split(' ')[1]}`}>
                            <Icon className={`w-6 h-6 ${cl.cor.split(' ')[0]}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-aletis-verde-medio/55 uppercase tracking-wider">
                                {cl.codigo}
                              </span>
                              <span className="text-xs text-aletis-verde-medio/55">· {totalItens} itens</span>
                            </div>
                            <h2 className="text-xl font-display font-semibold text-aletis-verde">
                              {cl.nome}
                            </h2>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-aletis-verde-medio mt-3">{cl.descricao}</p>
                    </div>

                    {/* Secoes */}
                    <div className="divide-y divide-aletis-borda/50">
                      {cl.secoes.map((sec) => (
                        <div key={sec.titulo} className="px-8 py-5">
                          <h3 className="font-display font-semibold text-aletis-verde mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                            <ChevronRight className="w-4 h-4 text-aletis-dourado" />
                            {sec.titulo}
                          </h3>
                          <ul className="grid gap-2 sm:grid-cols-2">
                            {sec.itens.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2.5 text-[14px] text-aletis-verde-medio"
                              >
                                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-aletis-dourado/30 bg-aletis-dourado/5">
                                  <Check className="h-2.5 w-2.5 text-aletis-dourado-escuro" />
                                </span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </article>
                </Reveal>
              )
            })}
          </div>

          {/* CTA */}
          <Reveal delay={200}>
            <div className="mt-14 rounded-3xl border border-aletis-dourado/30 bg-gradient-to-br from-aletis-verde-escuro to-aletis-verde-profundo p-8 md:p-12 text-white">
              <div className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
                <div>
                  <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-dourado">
                    Primeiro contato
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-semibold md:text-3xl">
                    Não precisa ter tudo pronto para começar.
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-white/75">
                    A primeira conversa é gratuita e sem compromisso. Nosso consultor orienta
                    quais documentos são prioridade no seu caso específico. Muitos itens da R.OP.004
                    e R.OP.005 são obtidos pela própria ALETIS via consultas públicas.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <a
                    href="/contato"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-aletis-verde-escuro hover:bg-aletis-bege transition"
                  >
                    Agendar entrevista inicial
                    <ChevronRight className="w-4 h-4" />
                  </a>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center">
                      <IdCard className="w-4 h-4 mx-auto mb-1 text-aletis-dourado" />
                      <p className="text-[10px] text-white/60">Apenas CPF + contato</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center">
                      <Landmark className="w-4 h-4 mx-auto mb-1 text-aletis-dourado" />
                      <p className="text-[10px] text-white/60">Consultas via ALETIS</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center">
                      <Sprout className="w-4 h-4 mx-auto mb-1 text-aletis-dourado" />
                      <p className="text-[10px] text-white/60">Diagnóstico em 72h</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  )
}

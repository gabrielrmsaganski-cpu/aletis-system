// ============================================================
// Contract Templates Manifest
// ============================================================
// Catálogo dos 10 templates oficiais ALETIS, com schema de
// placeholders + fonte de dados (cliente.X | derived | input).
//
// Templates ficam em apps/api/src/services/contratos/templates/
// (gerados pelo scripts/build-contract-templates.ts a partir dos
// originais em /documentos/).
// ============================================================

export type PlaceholderSource =
  /** Vem do CRM cliente (path dot-notation, ex: 'nome', 'cpf', 'endereco.completo'). */
  | { kind: 'cliente'; path: string; transform?: 'upper' | 'cpf-mask' | 'date-br' }
  /** Calculado pelo backend a partir de outras fontes. */
  | { kind: 'derived'; key: 'contrato_data_hoje' | 'contrato_ano' | 'cidade_assinatura' | 'endereco_completo_from_cliente' | 'qualificacao_from_cliente' }
  /** Input livre do front (com sugestão default opcional). */
  | { kind: 'input'; default?: string }
  /** Bloco multi-pessoa (NDA / Procuração) — recebe array { nome, qualificacao, endereco, rg, cpf } */
  | { kind: 'outorgantes_bloco' }

export interface PlaceholderSpec {
  name: string                  // ex: 'cliente_nome'
  label: string                 // ex: 'Nome do cliente'
  hint?: string
  source: PlaceholderSource
  required: boolean
}

export interface ContractTemplate {
  slug: string
  title: string
  subtitle?: string
  category: 'contrato-base' | 'anexo-servico' | 'nda' | 'procuracao' | 'termo-aceite'
  templateFile: string          // relativo a templates/
  originalFile: string          // relativo a /documentos/ (referência)
  placeholders: PlaceholderSpec[]
}

// ── Placeholders comuns reusados em vários templates ──────────
const PH_CLIENTE_NOME: PlaceholderSpec = {
  name: 'cliente_nome',
  label: 'Nome do cliente',
  source: { kind: 'cliente', path: 'nome', transform: 'upper' },
  required: true,
}
const PH_CLIENTE_NOME_NORMAL: PlaceholderSpec = {
  ...PH_CLIENTE_NOME,
  source: { kind: 'cliente', path: 'nome' },
}
const PH_CLIENTE_CPF: PlaceholderSpec = {
  name: 'cliente_cpf',
  label: 'CPF do cliente',
  source: { kind: 'cliente', path: 'cpf', transform: 'cpf-mask' },
  required: true,
}
const PH_CLIENTE_ENDERECO: PlaceholderSpec = {
  name: 'cliente_endereco_completo',
  label: 'Endereço completo (rua, nº, bairro, cidade/UF, CEP)',
  source: { kind: 'derived', key: 'endereco_completo_from_cliente' },
  required: true,
}
const PH_CLIENTE_CEP: PlaceholderSpec = {
  name: 'cliente_cep',
  label: 'CEP',
  source: { kind: 'cliente', path: 'cep' },
  required: true,
}
const PH_CLIENTE_QUALIFICACAO: PlaceholderSpec = {
  name: 'cliente_qualificacao',
  label: 'Qualificação (agricultor, empresário, produtor rural...)',
  source: { kind: 'derived', key: 'qualificacao_from_cliente' },
  required: true,
}
const PH_CONTRATO_NUMERO: PlaceholderSpec = {
  name: 'contrato_numero',
  label: 'Número do contrato',
  hint: 'ex: 101 ou 112/2025',
  source: { kind: 'input' },
  required: true,
}
const PH_CONTRATO_DATA: PlaceholderSpec = {
  name: 'contrato_data',
  label: 'Data do contrato',
  hint: 'DD/MM/AAAA',
  source: { kind: 'derived', key: 'contrato_data_hoje' },
  required: true,
}

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    slug: 'contrato-base-resumido',
    title: 'Contrato Base — Resumido',
    subtitle: 'Versão sintética para clientes (Anexo 0.1)',
    category: 'contrato-base',
    templateFile: 'contrato-base-resumido.docx',
    originalFile: 'ALETIS_ANEXO_0_1_CONTRATO_BASE_CLIENTES_RESUMIDO_PADRONIZADO_FINAL.docx',
    placeholders: [PH_CLIENTE_NOME_NORMAL, PH_CLIENTE_CPF, PH_CLIENTE_ENDERECO, PH_CLIENTE_CEP],
  },
  {
    slug: 'contrato-base-completo',
    title: 'Contrato Base — Completo',
    subtitle: 'Versão integral assinada por ambas as partes (Anexo 0)',
    category: 'contrato-base',
    templateFile: 'contrato-base-completo.docx',
    originalFile: 'ALETIS_ANEXO_0_CONTRATO_BASE_COMPLETO_PADRONIZADO_FINAL.docx',
    placeholders: [
      PH_CONTRATO_NUMERO,
      PH_CLIENTE_NOME,
      PH_CLIENTE_QUALIFICACAO,
      PH_CLIENTE_ENDERECO,
      PH_CLIENTE_CPF,
    ],
  },
  {
    slug: 'anexo-i-consultoria',
    title: 'Anexo I — Consultoria',
    category: 'anexo-servico',
    templateFile: 'anexo-i-consultoria.docx',
    originalFile: 'ALETIS_ANEXO_I_CONSULTORIA_PADRONIZADO_FINAL.docx',
    placeholders: [PH_CONTRATO_NUMERO, PH_CONTRATO_DATA, PH_CLIENTE_NOME],
  },
  {
    slug: 'anexo-ii-diagnostico',
    title: 'Anexo II — Diagnóstico',
    category: 'anexo-servico',
    templateFile: 'anexo-ii-diagnostico.docx',
    originalFile: 'ALETIS_ANEXO_II_DIAGNOSTICO_PADRONIZADO_FINAL.docx',
    placeholders: [PH_CONTRATO_NUMERO, PH_CONTRATO_DATA, PH_CLIENTE_NOME],
  },
  {
    slug: 'anexo-iii-assessoria-gerencial',
    title: 'Anexo III — Assessoria Gerencial',
    category: 'anexo-servico',
    templateFile: 'anexo-iii-assessoria-gerencial.docx',
    originalFile: 'ALETIS_ANEXO_III_ASSESSORIA_GERENCIAL_PADRONIZADO_FINAL.docx',
    placeholders: [PH_CONTRATO_NUMERO, PH_CLIENTE_NOME],
  },
  {
    slug: 'anexo-iv-assessoria-erp',
    title: 'Anexo IV — Assessoria Gerencial + ERP',
    category: 'anexo-servico',
    templateFile: 'anexo-iv-assessoria-erp.docx',
    originalFile: 'ALETIS_ANEXO_IV_ASSESSORIA_GERENCIAL_ERP_PADRONIZADO_FINAL.docx',
    placeholders: [PH_CONTRATO_NUMERO, PH_CONTRATO_DATA, PH_CLIENTE_NOME],
  },
  {
    slug: 'anexo-v-outros-servicos',
    title: 'Anexo V — Outros Serviços',
    category: 'anexo-servico',
    templateFile: 'anexo-v-outros-servicos.docx',
    originalFile: 'ALETIS_ANEXO_V_OUTROS_SERVICOS_PADRONIZADO_FINAL.docx',
    placeholders: [PH_CONTRATO_NUMERO, PH_CONTRATO_DATA, PH_CLIENTE_NOME],
  },
  {
    slug: 'anexo-vi-nda',
    title: 'Anexo VI — NDA (Acordo de Confidencialidade)',
    category: 'nda',
    templateFile: 'anexo-vi-nda.docx',
    originalFile: 'ALETIS_ANEXO_VI_NDA_PADRONIZADO_FINAL.docx',
    placeholders: [
      PH_CONTRATO_NUMERO,
      {
        name: 'outorgantes_bloco',
        label: 'Bloco completo dos outorgantes',
        hint: 'Lista de pessoas físicas (cliente + cônjuge + outros). O sistema gera o texto.',
        source: { kind: 'outorgantes_bloco' },
        required: true,
      },
    ],
  },
  {
    slug: 'anexo-vii-procuracao',
    title: 'Anexo VII — Procuração',
    subtitle: 'Minuta com poderes específicos',
    category: 'procuracao',
    templateFile: 'anexo-vii-procuracao.docx',
    originalFile: 'ALETIS_ANEXO_VII_MINUTA_PROCURACAO_PADRONIZADO_FINAL.docx',
    placeholders: [
      {
        name: 'outorgantes_bloco',
        label: 'Bloco completo dos outorgantes',
        hint: 'Cliente + cônjuge + dependentes que assinarão',
        source: { kind: 'outorgantes_bloco' },
        required: true,
      },
    ],
  },
  {
    slug: 'anexo-viii-termo-aceite',
    title: 'Anexo VIII — Termo de Aceite',
    category: 'termo-aceite',
    templateFile: 'anexo-viii-termo-aceite.docx',
    originalFile: 'ALETIS_ANEXO_VIII_TERMO_DE_ACEITE_PADRONIZADO_FINAL.docx',
    placeholders: [
      PH_CONTRATO_NUMERO,
      {
        name: 'taxa_percentual',
        label: 'Taxa percentual de honorários',
        hint: 'ex: 3,5%',
        source: { kind: 'input' },
        required: true,
      },
      {
        name: 'valor_desistencia',
        label: 'Valor de desistência (R$)',
        hint: 'ex: 10.000,00',
        source: { kind: 'input' },
        required: true,
      },
      {
        name: 'valor_desistencia_extenso',
        label: 'Valor de desistência por extenso',
        hint: 'ex: dez mil reais',
        source: { kind: 'input' },
        required: true,
      },
    ],
  },
]

export function getTemplateBySlug(slug: string): ContractTemplate | null {
  return CONTRACT_TEMPLATES.find((t) => t.slug === slug) ?? null
}

// ============================================================
// Processo de Assessoria TEX CAPITAL — Manifest
// ============================================================
// Catálogo dos 25 documentos do processo formal de assessoria
// (POL/POP/IT/R.CM/R.OP/R.GQ) extraídos do pacote oficial
// "3. Processo de Assessoria.zip" entregue pela TEX em 2025-08.
//
// Originais ficam em /documentos/processo-assessoria/originais/.
// Templates render-aware ficam em
// apps/api/src/services/processo-assessoria/templates/.
//
// O renderer escolhe a estratégia conforme formato:
//   docx → docxtemplater (substitui {placeholders} preservando estilos)
//   xlsx → exceljs        (substitui células marcadas e preserva fórmulas)
//   xlsm → pizzip simples (preserva VBA + substitui células-chave)
//   pdf  → estático (download direto)
//   pptx → pizzip simples (preserva animações + substitui texto-âncora)
// ============================================================

export type DocFormato = 'docx' | 'xlsx' | 'xlsm' | 'pptx' | 'pdf'

export type DocCategoria =
  | 'checklist-cadastro'
  | 'checklist-rotina'
  | 'contrato-comercial'
  | 'planilha-financeira-core'
  | 'planilha-operacional'
  | 'gerenciador'
  | 'politica'
  | 'pop-rotina'
  | 'instrucao-trabalho'
  | 'relatorio-output'
  | 'apresentacao-comercial'
  | 'registro-qualidade'

export interface PlaceholderSpec {
  /** chave usada no template (ex: 'cliente_nome', 'data_base') */
  name: string
  label: string
  hint?: string
  /** célula no xlsx/xlsm (ex: "Cadastro!C18") — usado por XlsxCellRenderer */
  cell?: string
  /** caminho dot-notation no cliente CRM (ex: 'nome', 'cpfCnpj', 'cidade') */
  clientePath?: string
  /** transform aplicado antes de inserir */
  transform?: 'upper' | 'cpf-mask' | 'cnpj-mask' | 'date-br' | 'date-yyyy-mm'
  /** valor default se nada vier */
  default?: string
  required: boolean
}

export interface ChecklistItemSpec {
  id: string
  label: string
  hint?: string
  /** subseção/etapa pra agrupar visualmente */
  etapa?: string
  /** pede upload de documento? */
  requiresUpload?: boolean
  /** pede observação textual? */
  acceptsObservacao?: boolean
}

export interface ProcessoTemplate {
  /** slug-id estável para REST + tools ALIX */
  slug: string
  /** código TEX original (R.OP.001, R.CM.002, etc) */
  codigo: string
  /** nome humano (sem versão) */
  nome: string
  versao: string
  /** descrição operacional (1-2 frases) */
  descricao: string
  categoria: DocCategoria
  formato: DocFormato
  /** nome do arquivo template (em /templates) — copiado do original na primeira inicialização */
  templateFile: string
  /** nome do arquivo original (em /documentos/processo-assessoria/originais) */
  originalFile: string
  /** se a planilha tem macros VBA — afeta estratégia de render */
  hasVba?: boolean
  /** quantidade de sheets/páginas/slides — informativo */
  estrutura?: { sheets?: number; paginas?: number; slides?: number; formulas?: number }
  /** placeholders preenchíveis (opcional — alguns docs são read-only) */
  placeholders?: PlaceholderSpec[]
  /** UI tab/aba sugerida no ClienteDetalhes */
  uiTab?: 'documentos' | 'checklists' | 'diagnostico' | 'contratos' | 'operacional' | 'docs'
  /** se tem checklist interativo (R.OP.003, 004, 005, 009) */
  checklist?: ChecklistItemSpec[]
  /** referencia ao guia de uso (IT.*) */
  instrucaoTrabalho?: string
}

// ── Placeholders comuns de identificação ─────────────────────
const PH_DATA_HOJE: PlaceholderSpec = {
  name: 'data_hoje',
  label: 'Data de hoje',
  transform: 'date-br',
  default: '',
  required: false,
}
const PH_CLIENTE_NOME: PlaceholderSpec = {
  name: 'cliente_nome',
  label: 'Nome do cliente',
  clientePath: 'nome',
  required: true,
}
const PH_CLIENTE_CPF: PlaceholderSpec = {
  name: 'cliente_cpf',
  label: 'CPF/CNPJ do cliente',
  clientePath: 'cpfCnpj',
  required: false,
}
const PH_RESPONSAVEL: PlaceholderSpec = {
  name: 'responsavel',
  label: 'Responsável (consultor)',
  default: '',
  required: false,
}

// ── Catálogo completo dos 25 documentos ─────────────────────
export const PROCESSO_TEMPLATES: ProcessoTemplate[] = [
  // ============================================================
  // CHECKLISTS DE CADASTRO (interativos no portal/CRM)
  // ============================================================
  {
    slug: 'checklist-informacoes-basicas-pf',
    codigo: 'R.OP.003',
    nome: 'Checklist de Informações Básicas — PF',
    versao: '1.0',
    descricao:
      'Identificação do cliente PF + 17 perguntas SIM/NÃO sobre estoque, insumos, recebíveis, dívidas, funcionários.',
    categoria: 'checklist-cadastro',
    formato: 'docx',
    templateFile: 'R.OP.003_Checklist_Informacoes_Basicas_PF.docx',
    originalFile: 'R.OP.003_Checklist de Informações Básicas PF_v1.0.docx',
    estrutura: { paginas: 4 },
    uiTab: 'checklists',
    placeholders: [PH_CLIENTE_NOME, PH_CLIENTE_CPF, PH_DATA_HOJE, PH_RESPONSAVEL],
    checklist: [
      { id: 'estoque', label: 'Possui estoque?', etapa: 'Estoque & Insumos', acceptsObservacao: true },
      { id: 'insumos', label: 'Possui insumos comprados?', etapa: 'Estoque & Insumos', acceptsObservacao: true },
      { id: 'valor_a_receber', label: 'Possui valores a receber de terceiros?', etapa: 'Recebíveis', acceptsObservacao: true },
      { id: 'arrendamento_recebido', label: 'Recebe arrendamento de terras?', etapa: 'Recebíveis', acceptsObservacao: true },
      { id: 'outras_receitas', label: 'Possui outras receitas (não-agro)?', etapa: 'Recebíveis', acceptsObservacao: true },
      { id: 'dividas_fornecedores', label: 'Possui dívidas com fornecedores de insumos?', etapa: 'Dívidas', acceptsObservacao: true },
      { id: 'dividas_terras', label: 'Possui dívidas com fornecedores de terras?', etapa: 'Dívidas', acceptsObservacao: true },
      { id: 'dividas_bancarias', label: 'Possui dívidas bancárias?', etapa: 'Dívidas', acceptsObservacao: true },
      { id: 'funcionarios', label: 'Possui funcionários?', etapa: 'Pessoal', acceptsObservacao: true },
      { id: 'cnh_valida', label: 'CNH/RG dentro da validade?', etapa: 'Identificação', acceptsObservacao: true },
      { id: 'cpf_regular', label: 'CPF regular junto à RFB?', etapa: 'Identificação', acceptsObservacao: true },
      { id: 'comprovante_endereco', label: 'Comprovante de endereço atualizado?', etapa: 'Identificação', acceptsObservacao: true },
      { id: 'irpf_atualizado', label: 'IRPF dos últimos 3 anos disponível?', etapa: 'Identificação', acceptsObservacao: true },
      { id: 'estado_civil', label: 'Estado civil declarado e documentado?', etapa: 'Identificação', acceptsObservacao: true },
      { id: 'parentesco_grupo', label: 'Relação familiar com membros do grupo identificada?', etapa: 'Grupo Familiar', acceptsObservacao: true },
      { id: 'atua_atividade', label: 'Atua diretamente na atividade rural?', etapa: 'Grupo Familiar', acceptsObservacao: true },
      { id: 'observacoes_gerais', label: 'Observações gerais', etapa: 'Encerramento', acceptsObservacao: true },
    ],
    instrucaoTrabalho: 'instrucao-trabalho-google-drive',
  },
  {
    slug: 'checklist-documentos-produtor-rural',
    codigo: 'R.OP.004',
    nome: 'Checklist de Documentos do Produtor Rural',
    versao: '1.0',
    descricao:
      '6 etapas de coleta documental: sócios, IRPF, quadro safra, PFs do grupo, áreas próprias e arrendadas.',
    categoria: 'checklist-cadastro',
    formato: 'docx',
    templateFile: 'R.OP.004_Checklist_Documentos_Produtor_Rural.docx',
    originalFile: 'R.OP.004_Checklist de Documentos do Produtor Rural_v1.0.docx',
    estrutura: { paginas: 6 },
    uiTab: 'checklists',
    placeholders: [PH_CLIENTE_NOME, PH_CLIENTE_CPF, PH_DATA_HOJE, PH_RESPONSAVEL],
    checklist: [
      // ETAPA 2 — Sócios
      { id: 'cnh_socios', label: 'CNH/CPF/RG dos sócios', etapa: 'Sócios', requiresUpload: true },
      { id: 'certidao_estado_civil', label: 'Certidão de Estado Civil', etapa: 'Sócios', requiresUpload: true },
      { id: 'certidao_nascimento', label: 'Certidão de Nascimento', etapa: 'Sócios', requiresUpload: true },
      { id: 'escritura_uniao_estavel', label: 'Escritura de União Estável (se aplicável)', etapa: 'Sócios', requiresUpload: true },
      { id: 'certidao_casamento', label: 'Certidão de Casamento averbada', etapa: 'Sócios', requiresUpload: true },
      { id: 'comprovante_endereco_socios', label: 'Comprovante de Endereço dos sócios', etapa: 'Sócios', requiresUpload: true },
      // ETAPA 3 — IRPF
      { id: 'irpf_declaracao', label: 'Cópia da declaração IRPF (último ano)', etapa: 'IRPF', requiresUpload: true },
      { id: 'irpf_recibo', label: 'Recibo de entrega IRPF (último ano)', etapa: 'IRPF', requiresUpload: true },
      // ETAPA 4 — Quadro Safra
      { id: 'historico_safra', label: 'Histórico de safras (PDF)', etapa: 'Quadro Safra', requiresUpload: true },
      // ETAPA 5 — PFs do Grupo
      { id: 'endividamento_atualizado', label: 'Endividamento atualizado (todos do grupo)', etapa: 'Endividamento', requiresUpload: true },
      { id: 'extratos_contratos', label: 'Extratos de contratos bancários', etapa: 'Endividamento', requiresUpload: true },
      { id: 'relatorio_scr', label: 'Relatório SCR/Registrato (BACEN)', etapa: 'Endividamento', requiresUpload: true },
      // ETAPA 6 — Áreas Próprias e Arrendadas
      { id: 'relacao_fazendas', label: 'Relação de fazendas (Matrícula + Município + Tamanho)', etapa: 'Áreas Rurais', requiresUpload: true },
      { id: 'ccir', label: 'CCIR atualizado', etapa: 'Áreas Rurais', requiresUpload: true },
      { id: 'car', label: 'CAR (Cadastro Ambiental Rural)', etapa: 'Áreas Rurais', requiresUpload: true },
      { id: 'itr', label: 'ITR pago', etapa: 'Áreas Rurais', requiresUpload: true },
      { id: 'contratos_arrendamento', label: 'Contratos de arrendamento', etapa: 'Áreas Rurais', requiresUpload: true },
      { id: 'contratos_usinas', label: 'Contratos com usinas (cana, etanol)', etapa: 'Áreas Rurais', requiresUpload: true },
    ],
  },
  {
    slug: 'checklist-dados-adicionais',
    codigo: 'R.OP.005',
    nome: 'Checklist de Dados Adicionais (validação interna)',
    versao: '1.0',
    descricao:
      '11 etapas de validação interna: IRPF, PJs, instituição financeira, matrículas, garantias, arrendamento, cana, endividamento, restrições, quadro safra.',
    categoria: 'checklist-cadastro',
    formato: 'docx',
    templateFile: 'R.OP.005_Checklist_Dados_Adicionais.docx',
    originalFile: 'R.OP.005_Checklist de Dados Adicionais_v1.0.docx',
    estrutura: { paginas: 8 },
    uiTab: 'checklists',
    placeholders: [PH_CLIENTE_NOME, PH_CLIENTE_CPF, PH_DATA_HOJE, PH_RESPONSAVEL],
    checklist: [
      { id: 'irpf_bens_imoveis', label: 'IRPF — Bens imóveis declarados', etapa: 'IRPF', acceptsObservacao: true },
      { id: 'irpf_matriculas', label: 'IRPF — Matrículas listadas', etapa: 'IRPF', acceptsObservacao: true },
      { id: 'irpf_cnpjs_ocultos', label: 'IRPF — CNPJs ocultos identificados', etapa: 'IRPF', acceptsObservacao: true },
      { id: 'pj_documentos', label: 'PJ — Documentos das pessoas jurídicas', etapa: 'Pessoa Jurídica', acceptsObservacao: true },
      { id: 'pj_holding_operacional', label: 'PJ — Operacional/Holding identificada', etapa: 'Pessoa Jurídica', acceptsObservacao: true },
      { id: 'if_definicao', label: 'IF — Definição da Instituição Financeira atual', etapa: 'Inst. Financeira', acceptsObservacao: true },
      { id: 'if_cpfs_grupo', label: 'IF — CPFs/CNPJs do grupo identificados', etapa: 'Inst. Financeira', acceptsObservacao: true },
      { id: 'if_carta_bacen', label: 'IF — Carta Bacen atualizada', etapa: 'Inst. Financeira', requiresUpload: true },
      { id: 'matriculas_imoveis', label: 'Matrículas dos imóveis próprios', etapa: 'Imóveis', acceptsObservacao: true },
      { id: 'garantias_mapeamento', label: 'Garantias — Mapeamento completo', etapa: 'Garantias', acceptsObservacao: true },
      { id: 'garantias_comprometimento', label: 'Garantias — Comprometimento devedor avaliado', etapa: 'Garantias', acceptsObservacao: true },
      { id: 'arrendamento_vencimentos', label: 'Arrendamento — Vencimentos verificados', etapa: 'Arrendamento', acceptsObservacao: true },
      { id: 'cana_termo_cessao', label: 'Cana — Termo de Cessão verificado', etapa: 'Cana', acceptsObservacao: true },
      { id: 'endividamento_atualizado', label: 'Endividamento atualizado', etapa: 'Endividamento', acceptsObservacao: true },
      { id: 'restricoes_fragilidades', label: 'Restrições — Fragilidades mapeadas', etapa: 'Restrições', acceptsObservacao: true },
      { id: 'restricoes_terceiros', label: 'Restrições — Terceiros relacionados', etapa: 'Restrições', acceptsObservacao: true },
      { id: 'safra_dados_producao', label: 'Quadro Safra — Dados de produção validados', etapa: 'Quadro Safra', acceptsObservacao: true },
      { id: 'safra_areas_proprias', label: 'Quadro Safra — Áreas próprias validadas', etapa: 'Quadro Safra', acceptsObservacao: true },
      { id: 'safra_areas_arrendadas', label: 'Quadro Safra — Áreas arrendadas validadas', etapa: 'Quadro Safra', acceptsObservacao: true },
      { id: 'safra_divergencias', label: 'Quadro Safra — Divergências identificadas', etapa: 'Quadro Safra', acceptsObservacao: true },
      { id: 'safra_pecuaria', label: 'Quadro Safra — Pecuária verificada', etapa: 'Quadro Safra', acceptsObservacao: true },
    ],
  },

  // ============================================================
  // CHECKLIST DE ROTINA / KANBAN
  // ============================================================
  {
    slug: 'checklist-rotina-assessoria',
    codigo: 'R.OP.009',
    nome: 'Checklist de Rotina de Assessoria',
    versao: '1.0',
    descricao:
      '7 etapas com SLA: Elegibilidade Inicial, Mandato, Diagnóstico, Documentos, Análise Interna, Comitê, Envio à IF.',
    categoria: 'checklist-rotina',
    formato: 'xlsx',
    templateFile: 'R.OP.009_Checklist_Rotina.xlsx',
    originalFile: 'R.OP.009_Checklist de Rotina_v1.0.xlsx',
    estrutura: { sheets: 1, paginas: 4 },
    uiTab: 'operacional',
    placeholders: [PH_CLIENTE_NOME, PH_DATA_HOJE, PH_RESPONSAVEL],
    checklist: [
      // ETAPA 1
      { id: 'entrevista', label: 'Entrevista inicial (2 dias úteis)', etapa: 'Elegibilidade Inicial' },
      { id: 'criterios', label: 'Avaliação de critérios (1 dia útil)', etapa: 'Elegibilidade Inicial' },
      { id: 'reuniao_diagnostico', label: 'Reunião de diagnóstico (3 dias úteis)', etapa: 'Elegibilidade Inicial' },
      // ETAPA 2
      { id: 'documentos_iniciais', label: 'Coleta de documentos iniciais (2 du)', etapa: 'Mandato' },
      { id: 'mandato_assinado', label: 'Mandato assinado (2 du)', etapa: 'Mandato' },
      { id: 'recebimento_mandato', label: 'Recebimento do mandato (2 du)', etapa: 'Mandato' },
      // ETAPA 3
      { id: 'diagnostico_pago', label: 'Diagnóstico R$ 3 mil pago', etapa: 'Diagnóstico' },
      { id: 'agrisk', label: 'AgRisk após mandato (2 du)', etapa: 'Diagnóstico' },
      // ETAPA 4
      { id: 'checklist1_enviado', label: 'Checklist inicial enviado (2 du)', etapa: 'Documentos Cliente' },
      { id: 'retorno_cliente', label: 'Retorno do cliente (2 du)', etapa: 'Documentos Cliente' },
      { id: 'conferencia', label: 'Conferência interna (5 du)', etapa: 'Documentos Cliente' },
      { id: 'checklist2_enviado', label: 'Checklist 2 enviado pós-conferência', etapa: 'Documentos Cliente' },
      // ETAPA 5
      { id: 'analise_interna', label: 'Análise interna — Banco interno + Histórico/Perfil (7 du)', etapa: 'Análise Interna' },
      // ETAPA 6
      { id: 'comite', label: 'Comitê interno de crédito — decisão IF (7 du)', etapa: 'Comitê' },
      // ETAPA 7
      { id: 'quadro_safra_if', label: 'Quadro Safra para IF (5 du)', etapa: 'Envio à IF' },
      { id: 'kit_banco', label: 'Kit Banco montado', etapa: 'Envio à IF' },
      { id: 'aguardar_if', label: 'Aguardar IF (10-15 du)', etapa: 'Envio à IF' },
    ],
  },

  // ============================================================
  // CONTRATOS COMERCIAIS
  // ============================================================
  {
    slug: 'contrato-disponibilizacao-credito',
    codigo: 'R.CM.002',
    nome: 'Contrato de Disponibilização de Crédito',
    versao: '1.0',
    descricao:
      'Contrato CC com remuneração 8% primeira operação / 2% subsequentes, vigência 60 meses, multa 2% + juros mora.',
    categoria: 'contrato-comercial',
    formato: 'docx',
    templateFile: 'R.CM.002_Contrato_Disponibilizacao_Credito.docx',
    originalFile: 'R.CM.002_Contrato Disponibilização de Crédito_v1.0.docx',
    estrutura: { paginas: 8 },
    uiTab: 'contratos',
    placeholders: [
      { name: 'identificacao_documento', label: 'Identificação do documento (nº)', hint: 'ex: 101/2026', required: true },
      { name: 'cliente_nome', label: 'Nome do contratante', clientePath: 'nome', transform: 'upper', required: true },
      { name: 'cliente_profissao', label: 'Profissão', default: 'agricultor', required: true },
      { name: 'cliente_endereco', label: 'Endereço completo', clientePath: 'endereco', required: true },
      { name: 'cliente_cidade', label: 'Cidade', clientePath: 'cidade', required: true },
      { name: 'cliente_uf', label: 'UF', clientePath: 'uf', required: true },
      { name: 'cliente_rg', label: 'RG', required: true },
      { name: 'cliente_orgao_emissor', label: 'Órgão emissor RG', default: 'SSP', required: true },
      { name: 'cliente_cpf', label: 'CPF', clientePath: 'cpfCnpj', transform: 'cpf-mask', required: true },
      { name: 'banco', label: 'Banco para crédito honorários', required: false },
      { name: 'agencia', label: 'Agência', required: false },
      { name: 'conta', label: 'Conta-corrente', required: false },
      PH_DATA_HOJE,
    ],
  },
  {
    slug: 'nda-acordo-nao-divulgacao',
    codigo: 'R.CM.003',
    nome: 'Acordo de Não Divulgação (NDA)',
    versao: '1.0',
    descricao:
      'NDA bilateral com 8 cláusulas — sigilo total, classificação confidencial, multa 4 salários mínimos + LGPD Art. 52.',
    categoria: 'contrato-comercial',
    formato: 'docx',
    templateFile: 'R.CM.003_Acordo_Nao_Divulgacao.docx',
    originalFile: 'R.CM.003_Acordo de Não Divulgação_v1.0.docx',
    estrutura: { paginas: 6 },
    uiTab: 'contratos',
    placeholders: [
      { name: 'cliente_nome', label: 'Nome da Parte Divulgadora', clientePath: 'nome', transform: 'upper', required: true },
      { name: 'cliente_cpf', label: 'CPF/CNPJ', clientePath: 'cpfCnpj', transform: 'cpf-mask', required: true },
      { name: 'cliente_endereco', label: 'Endereço', clientePath: 'endereco', required: true },
      { name: 'cidade_assinatura', label: 'Cidade da assinatura', default: 'Curitiba', required: true },
      PH_DATA_HOJE,
    ],
  },

  // ============================================================
  // PLANILHAS FINANCEIRAS — CORE
  // ============================================================
  {
    slug: 'diagnostico-financeiro',
    codigo: 'R.OP.001',
    nome: 'Diagnóstico Financeiro (XLSM completo)',
    versao: '1.0',
    descricao:
      'Núcleo financeiro de 17 sheets com VBA: BaseSafra, Cadastro, Overview, Crédito, Fornecedores, Ativos, Passivos, Safra, Endividamento, Garantias, Diagnóstico, DRE, RELATÓRIO, BANCO.',
    categoria: 'planilha-financeira-core',
    formato: 'xlsm',
    templateFile: 'R.OP.001_Diagnostico_Financeiro.xlsm',
    originalFile: 'R.OP.001_Diagnóstico Financeiro_v1.0.xlsm',
    hasVba: true,
    estrutura: { sheets: 17, formulas: 12000 },
    uiTab: 'diagnostico',
    placeholders: [
      { name: 'cliente_nome', label: 'Nome do Grupo', cell: 'Cadastro!C18', clientePath: 'nome', required: true },
      { name: 'data_base', label: 'Data base do diagnóstico', cell: 'Cadastro!C15', transform: 'date-br', required: true },
      { name: 'data_emissao', label: 'Data de emissão', cell: 'Cadastro!F15', transform: 'date-br', required: false },
    ],
  },
  {
    slug: 'registro-gestao-financeira-v2',
    codigo: 'R.OP.001',
    nome: 'Registro de Gestão Financeira v2.0 (XLSM expandido)',
    versao: '2.0',
    descricao:
      'Versão evoluída de 28 sheets, ~12000 fórmulas, VBA. Inclui Safra, Rateio de Custos, EBITDA, Premissas, Endividamento, Passivos, Fluxo de Caixa Projetado, DRE FCL, Raio X.',
    categoria: 'planilha-financeira-core',
    formato: 'xlsm',
    templateFile: 'R.OP.001_Registro_Gestao_Financeira_v2.xlsm',
    originalFile: '../../../documentos/processo-assessoria/originais/R.OP.001_Registro de Gestao Financeira_v2.0.xlsm',
    hasVba: true,
    estrutura: { sheets: 28, formulas: 12000 },
    uiTab: 'diagnostico',
    placeholders: [
      { name: 'cliente_nome', label: 'Nome do Grupo', cell: '3 - Cadastro!D15', clientePath: 'nome', required: true },
      { name: 'data_base', label: 'Data base', cell: '3 - Cadastro!D17', transform: 'date-br', required: true },
    ],
  },
  {
    slug: 'foto-mensal',
    codigo: 'R.OP.008',
    nome: 'Foto Mensal (Diagnóstico mês-a-mês)',
    versao: '1.0',
    descricao:
      'Espelho de R.OP.001 com granularidade mensal: receitas/gastos por mês, DRE mensal, EBTDA mensal, projeção 12 meses.',
    categoria: 'planilha-financeira-core',
    formato: 'xlsm',
    templateFile: 'R.OP.008_Foto_Mensal.xlsm',
    originalFile: 'R.OP.008_Foto Mensal_v1.0.xlsm',
    hasVba: true,
    estrutura: { sheets: 15 },
    uiTab: 'diagnostico',
    placeholders: [
      { name: 'cliente_nome', label: 'Nome do Grupo', cell: 'Cadastro!C18', clientePath: 'nome', required: true },
      { name: 'data_base', label: 'Data base', cell: 'Cadastro!C15', transform: 'date-br', required: true },
    ],
  },
  {
    slug: 'registro-financeiro-mensal',
    codigo: 'R.OP.007',
    nome: 'Registro Financeiro Mensal — Cliente',
    versao: '1.0',
    descricao:
      'Operacional mensal — Receitas (PRODUTOS, OUTRAS, FINANCEIRAS), Gastos (4 categorias), Conciliação Bancária, Fluxo de Caixa.',
    categoria: 'planilha-financeira-core',
    formato: 'xlsx',
    templateFile: 'R.OP.007_Registro_Financeiro_Mensal.xlsx',
    originalFile: 'R.OP.007_Registro Financeiro Mensal_Cliente_v1.0.xlsx',
    estrutura: { sheets: 6 },
    uiTab: 'diagnostico',
    placeholders: [
      { name: 'cliente_nome', label: 'Nome do cliente', clientePath: 'nome', required: true },
      PH_DATA_HOJE,
    ],
    instrucaoTrabalho: 'instrucao-trabalho-registro-mensal',
  },

  // ============================================================
  // PLANILHAS OPERACIONAIS
  // ============================================================
  {
    slug: 'cadastro-clientes',
    codigo: 'R.OP.002',
    nome: 'Cadastro de Clientes (DB Master)',
    versao: '1.0',
    descricao:
      'Banco de dados estruturado: Sócios, Demandas, Fazendas, Safras, Produção, Endividamento. Inclui validador de completude.',
    categoria: 'gerenciador',
    formato: 'xlsm',
    templateFile: 'R.OP.002_Cadastro_Clientes.xlsm',
    originalFile: 'R.OP.002_Cadastro de Clientes_v1.0.xlsm',
    hasVba: true,
    estrutura: { sheets: 13 },
    uiTab: 'documentos',
    placeholders: [
      { name: 'cliente_nome', label: 'Nome do cliente', cell: 'Home!D6', clientePath: 'nome', required: true },
    ],
  },
  {
    slug: 'custos-cliente',
    codigo: 'R.OP.010',
    nome: 'Custos do Cliente',
    versao: '1.0',
    descricao:
      'INSUMOS POR CULTURA + DEMAIS CUSTOS. 989 linhas, agregação SUM por categoria.',
    categoria: 'planilha-operacional',
    formato: 'xlsx',
    templateFile: 'R.OP.010_Custos_Cliente.xlsx',
    originalFile: 'R.OP.010_Custos do Cliente_v1.0.xlsx',
    estrutura: { sheets: 1, formulas: 6 },
    uiTab: 'operacional',
    placeholders: [
      { name: 'cliente_nome', label: 'Nome do cliente', clientePath: 'nome', required: true },
      PH_DATA_HOJE,
    ],
  },
  {
    slug: 'quadro-producao-cliente',
    codigo: 'R.OP.011',
    nome: 'Quadro de Produção do Cliente',
    versao: '1.0',
    descricao:
      'Pecuária (CRIA/RECRIA/ENGORDA/CICLO COMPLETO) + agricultura. 1084 linhas, 126 fórmulas.',
    categoria: 'planilha-operacional',
    formato: 'xlsx',
    templateFile: 'R.OP.011_Quadro_Producao_Cliente.xlsx',
    originalFile: 'R.OP.011_Quadro de Produção do Cliente_v1.0.xlsx',
    estrutura: { sheets: 1, formulas: 126 },
    uiTab: 'operacional',
    placeholders: [
      { name: 'cliente_nome', label: 'Nome do cliente', clientePath: 'nome', required: true },
      PH_DATA_HOJE,
    ],
  },

  // ============================================================
  // GERENCIADOR DE CONTRATOS
  // ============================================================
  {
    slug: 'gerenciador-contratos',
    codigo: 'R.CM.004',
    nome: 'Gerenciador de Contratos',
    versao: '1.0',
    descricao:
      'Dashboard interno de contratos: 1894 linhas, 2003 fórmulas com validação, status, vencimentos.',
    categoria: 'gerenciador',
    formato: 'xlsx',
    templateFile: 'R.CM.004_Gerenciador_Contratos.xlsx',
    originalFile: 'R.CM.004_Gerenciador de Contratos_v1.0.xlsx',
    estrutura: { sheets: 1, formulas: 2003 },
    uiTab: 'contratos',
    placeholders: [PH_DATA_HOJE],
  },

  // ============================================================
  // RELATÓRIOS DE OUTPUT (PPTX/PDF)
  // ============================================================
  {
    slug: 'relatorio-diagnostico-financeiro',
    codigo: 'R.OP.006',
    nome: 'Relatório do Cliente — Diagnóstico Financeiro (PPTX)',
    versao: '1.0',
    descricao: 'Apresentação para entrega ao cliente com saída do diagnóstico (13 slides).',
    categoria: 'relatorio-output',
    formato: 'pptx',
    templateFile: 'R.OP.006_Relatorio_Diagnostico_Financeiro.pptx',
    originalFile: 'R.OP.006_Relatório do Cliente_Diagnóstico Financeiro_v1.0.pptx',
    estrutura: { slides: 13 },
    uiTab: 'diagnostico',
    placeholders: [
      { name: 'cliente_nome', label: 'Nome do cliente', clientePath: 'nome', required: true },
      PH_DATA_HOJE,
    ],
  },
  {
    slug: 'apresentacao-comercial',
    codigo: 'R.CM.001',
    nome: 'Apresentação Comercial TEX CAPITAL',
    versao: '1.0',
    descricao: 'Pitch comercial — slides de venda para prospect.',
    categoria: 'apresentacao-comercial',
    formato: 'pptx',
    templateFile: 'R.CM.001_Apresentacao_Comercial.pptx',
    originalFile: 'R.CM.001_Apresentação Comercial_v1.0.pptx',
    uiTab: 'docs',
  },
  {
    slug: 'exemplo-relatorio-cliente',
    codigo: 'R.OP.001-EX',
    nome: 'Exemplo — Diagnóstico Cliente preenchido (PDF)',
    versao: '1.0',
    descricao: 'PDF de referência: Grupo PASCOTTO — modelo do output do diagnóstico (19 páginas).',
    categoria: 'relatorio-output',
    formato: 'pdf',
    templateFile: 'EXEMPLO_R.OP.001_Diagnostico_Cliente.pdf',
    originalFile: 'R.OP.001_Diagnóstico Financeiro_v1.0 - Nome do Cliente.pdf',
    estrutura: { paginas: 19 },
    uiTab: 'docs',
  },
  {
    slug: 'exemplo-kit-banco',
    codigo: 'R.OP.001-KIT',
    nome: 'Exemplo — Kit Banco (PDF)',
    versao: '1.0',
    descricao: 'PDF de referência: 13 seções do kit para envio à IF (composição societária → demanda de crédito).',
    categoria: 'relatorio-output',
    formato: 'pdf',
    templateFile: 'EXEMPLO_R.OP.001_Kit_Banco.pdf',
    originalFile: 'R.OP.001_Diagnóstico Financeiro_Relatorio Banco_v1.0 - Nome do Cliente.pdf',
    estrutura: { paginas: 9 },
    uiTab: 'docs',
  },

  // ============================================================
  // POLÍTICAS, POPs E INSTRUÇÕES DE TRABALHO (read-only)
  // ============================================================
  {
    slug: 'politica-grd-assessoria',
    codigo: 'POL.001',
    nome: 'Política de Gerenciamento da Rotina (GRD) — Assessoria',
    versao: '2.0',
    descricao: 'Fluxograma visual oficial do processo de assessoria (POL.001 v2.0).',
    categoria: 'politica',
    formato: 'pdf',
    templateFile: 'POL.001_GRD_TEX_CAPITAL_Assessoria.pdf',
    originalFile: 'POL.001_GRD_TEX CAPITAL_Assessoria_v2.0.pdf',
    estrutura: { paginas: 1 },
    uiTab: 'docs',
  },
  {
    slug: 'pop-rotina-assessoria',
    codigo: 'POP.OP.001',
    nome: 'POP — Rotina de Assessoria',
    versao: '1.0',
    descricao: 'Procedimento operacional padrão completo: 808 parágrafos, fluxos detalhados de prospecção/captação/diagnóstico.',
    categoria: 'pop-rotina',
    formato: 'docx',
    templateFile: 'POP.OP.001_Rotina_Assessoria.docx',
    originalFile: 'POP.OP.001_Rotina de Assessoria_v1.0.docx',
    uiTab: 'docs',
  },
  {
    slug: 'instrucao-trabalho-google-drive',
    codigo: 'IT.OP.001',
    nome: 'IT — Ferramenta Google Drive',
    versao: '1.0',
    descricao: 'Tutorial passo-a-passo para uso do Google Drive corporativo TEX.',
    categoria: 'instrucao-trabalho',
    formato: 'docx',
    templateFile: 'IT.OP.001_Ferramenta_Google_Drive.docx',
    originalFile: 'IT.OP.001_Ferramenta Google Drive_v1.0.docx',
    uiTab: 'docs',
  },
  {
    slug: 'instrucao-trabalho-registro-mensal',
    codigo: 'IT.OP.002',
    nome: 'IT — Registro Mensal do Cliente',
    versao: '1.0',
    descricao: 'Como preencher R.OP.007 — fluxo de uso da planilha de registro mensal.',
    categoria: 'instrucao-trabalho',
    formato: 'docx',
    templateFile: 'IT.OP.002_Registro_Mensal_Cliente.docx',
    originalFile: 'IT.OP.002_Registro Mensal_Cliente_v1.0.docx',
    uiTab: 'docs',
  },
  {
    slug: 'instrucao-trabalho-download-drive-anydesk',
    codigo: 'IT.OP.003',
    nome: 'IT — Download Google Drive e AnyDesk (Cliente)',
    versao: '1.0',
    descricao: 'Tutorial em PPTX para o cliente baixar Google Drive e AnyDesk.',
    categoria: 'instrucao-trabalho',
    formato: 'pptx',
    templateFile: 'IT.OP.003_Download_Drive_AnyDesk.pptx',
    originalFile: 'IT.OP.003_Download Google Drive e AnyDesk_Cliente_v1.0.pptx',
    uiTab: 'docs',
  },

  // ============================================================
  // REGISTRO DE QUALIDADE
  // ============================================================
  {
    slug: 'registro-treinamento-assessoria',
    codigo: 'R.GQ.002',
    nome: 'Registro de Treinamento — Processo de Assessoria',
    versao: '1.0',
    descricao: 'Comprovante ClickSign — assinaturas, hash SHA256, IPs, geolocalização (4 páginas).',
    categoria: 'registro-qualidade',
    formato: 'pdf',
    templateFile: 'R.GQ.002_Registro_Treinamento_Assessoria.pdf',
    originalFile: 'R.GQ.002_Registro de Treinamento_Processo Assessoria_v1.0 - Clicksign.pdf',
    estrutura: { paginas: 4 },
    uiTab: 'docs',
  },
  {
    slug: 'treinamento-processo-assessoria-2025',
    codigo: 'TR.2025-06-13',
    nome: 'Treinamento do Processo de Assessoria — 13/06/2025',
    versao: '1.0',
    descricao: 'Material de treinamento em PDF (slides aplicados na sessão interna).',
    categoria: 'registro-qualidade',
    formato: 'pdf',
    templateFile: '2025_06_13_Treinamento_Processo_Assessoria.pdf',
    originalFile: '2025_06_13_Treinamento do Processo de Assessoria.pdf',
    uiTab: 'docs',
  },
]

export function getProcessoTemplateBySlug(slug: string): ProcessoTemplate | null {
  return PROCESSO_TEMPLATES.find((t) => t.slug === slug) ?? null
}

export function getProcessoTemplatesByCategoria(cat: DocCategoria): ProcessoTemplate[] {
  return PROCESSO_TEMPLATES.filter((t) => t.categoria === cat)
}

export function getProcessoTemplatesByUiTab(tab: ProcessoTemplate['uiTab']): ProcessoTemplate[] {
  return PROCESSO_TEMPLATES.filter((t) => t.uiTab === tab)
}

/** Dicionário de categorias para UI (label + ícone + descrição) */
export const CATEGORIA_META: Record<
  DocCategoria,
  { label: string; descricao: string; emoji: string; ordem: number }
> = {
  'checklist-cadastro': { label: 'Checklists de Cadastro', descricao: 'Coleta de informações e documentos do cliente', emoji: '📋', ordem: 1 },
  'checklist-rotina': { label: 'Checklist de Rotina', descricao: 'Workflow operacional com SLAs', emoji: '✅', ordem: 2 },
  'contrato-comercial': { label: 'Contratos Comerciais', descricao: 'Contratos CC e NDA com placeholders', emoji: '📜', ordem: 3 },
  'planilha-financeira-core': { label: 'Planilhas Financeiras', descricao: 'Diagnóstico, Foto Mensal, Registro Mensal', emoji: '💰', ordem: 4 },
  'planilha-operacional': { label: 'Planilhas Operacionais', descricao: 'Custos e Quadro de Produção', emoji: '🌾', ordem: 5 },
  'gerenciador': { label: 'Gerenciadores', descricao: 'DB de clientes e gestor de contratos', emoji: '🗂️', ordem: 6 },
  'relatorio-output': { label: 'Relatórios de Output', descricao: 'Saídas para entrega ao cliente/banco', emoji: '📊', ordem: 7 },
  'apresentacao-comercial': { label: 'Apresentação Comercial', descricao: 'Material de venda e prospecção', emoji: '🎯', ordem: 8 },
  'politica': { label: 'Políticas', descricao: 'Diretrizes operacionais oficiais', emoji: '📐', ordem: 9 },
  'pop-rotina': { label: 'POPs', descricao: 'Procedimentos operacionais padrão', emoji: '📚', ordem: 10 },
  'instrucao-trabalho': { label: 'Instruções de Trabalho', descricao: 'Tutoriais passo-a-passo', emoji: '🛠️', ordem: 11 },
  'registro-qualidade': { label: 'Registros de Qualidade', descricao: 'Treinamentos e auditoria', emoji: '🎓', ordem: 12 },
}

/** UI tabs canônicas (frontend) */
export const UI_TABS = [
  { key: 'documentos', label: 'Documentos', emoji: '📄' },
  { key: 'checklists', label: 'Checklists', emoji: '✅' },
  { key: 'diagnostico', label: 'Diagnóstico', emoji: '💰' },
  { key: 'contratos', label: 'Contratos', emoji: '📜' },
  { key: 'operacional', label: 'Operacional', emoji: '🌾' },
  { key: 'docs', label: 'Documentação', emoji: '📚' },
] as const

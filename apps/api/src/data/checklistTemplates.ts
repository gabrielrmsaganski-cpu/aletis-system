export interface ChecklistItem {
  id: string
  ordem: number
  titulo: string
  descricao?: string
  tipo: 'boolean' | 'texto' | 'data' | 'arquivo' | 'numero'
  obrigatorio?: boolean
}

export interface ChecklistSecao {
  id: string
  ordem: number
  titulo: string
  itens: ChecklistItem[]
}

export interface ChecklistTemplate {
  codigo: string
  nome: string
  descricao: string
  secoes: ChecklistSecao[]
}

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    codigo: 'R.OP.003',
    nome: 'Entrevista Inicial',
    descricao:
      'Questionário para identificação e perfil básico do cliente/produtor rural no primeiro atendimento.',
    secoes: [
      {
        id: '003-identificacao',
        ordem: 1,
        titulo: 'Identificação',
        itens: [
          { id: '003-nome-completo', ordem: 1, titulo: 'Nome completo do produtor', tipo: 'texto', obrigatorio: true },
          { id: '003-cpf-cnpj', ordem: 2, titulo: 'CPF / CNPJ', tipo: 'texto', obrigatorio: true },
          { id: '003-endereco-fazenda', ordem: 3, titulo: 'Endereço da fazenda / propriedade', tipo: 'texto' },
          { id: '003-cidade-uf', ordem: 4, titulo: 'Cidade / UF', tipo: 'texto' },
          { id: '003-telefone', ordem: 5, titulo: 'Telefone de contato', tipo: 'texto' },
          { id: '003-email', ordem: 6, titulo: 'E-mail', tipo: 'texto' },
        ],
      },
      {
        id: '003-perfil',
        ordem: 2,
        titulo: 'Perfil Produtivo e Econômico',
        itens: [
          { id: '003-area-propria', ordem: 1, titulo: 'Possui área própria? (Sim/Não + hectares)', tipo: 'boolean' },
          { id: '003-area-alugada', ordem: 2, titulo: 'Cultiva área alugada/arrendada?', tipo: 'boolean' },
          { id: '003-culturas', ordem: 3, titulo: 'Culturas praticadas', tipo: 'texto' },
          { id: '003-porteira-fechada', ordem: 4, titulo: 'Sistema "Porteira Fechada"?', tipo: 'boolean' },
          { id: '003-carteira-estoque', ordem: 5, titulo: 'Carteira de estoque existe?', tipo: 'boolean' },
          { id: '003-dividas-safras', ordem: 6, titulo: 'Dívidas de safras anteriores?', tipo: 'boolean' },
          { id: '003-projeto-investimento', ordem: 7, titulo: 'Projeto de investimento?', tipo: 'boolean' },
          { id: '003-custos-contas', ordem: 8, titulo: 'Possui controle de custos / contas?', tipo: 'boolean' },
          { id: '003-garantias', ordem: 9, titulo: 'Possui garantias para oferecer?', tipo: 'boolean' },
        ],
      },
      {
        id: '003-comercial',
        ordem: 3,
        titulo: 'Perfil Comercial',
        itens: [
          { id: '003-escritorio-associado', ordem: 1, titulo: 'Já atendeu escritório de assessoria?', tipo: 'boolean' },
          { id: '003-motivo-consultoria', ordem: 2, titulo: 'Motivo da busca por consultoria', tipo: 'texto' },
          { id: '003-prazo-esperado', ordem: 3, titulo: 'Prazo esperado para resultado', tipo: 'texto' },
          { id: '003-investimento-disponivel', ordem: 4, titulo: 'Valor estimado para investir', tipo: 'numero' },
        ],
      },
    ],
  },
  {
    codigo: 'R.OP.004',
    nome: 'Documentos do Produtor Rural',
    descricao:
      'Checklist de coleta e conferência da documentação pessoal e da propriedade do produtor rural.',
    secoes: [
      {
        id: '004-pessoal',
        ordem: 1,
        titulo: 'Documentação Pessoal',
        itens: [
          { id: '004-cnh', ordem: 1, titulo: 'CNH (frente e verso)', tipo: 'arquivo' },
          { id: '004-cpf', ordem: 2, titulo: 'CPF', tipo: 'arquivo' },
          { id: '004-rg', ordem: 3, titulo: 'RG', tipo: 'arquivo' },
          { id: '004-foto-3x4', ordem: 4, titulo: 'Foto 3x4', tipo: 'arquivo' },
          { id: '004-titulo-eleitor', ordem: 5, titulo: 'Título de Eleitor', tipo: 'arquivo' },
          { id: '004-certidao-casamento', ordem: 6, titulo: 'Certidão de Casamento (se casado)', tipo: 'arquivo' },
          { id: '004-comprovante-residencia', ordem: 7, titulo: 'Comprovante de Residência', tipo: 'arquivo' },
        ],
      },
      {
        id: '004-impostos',
        ordem: 2,
        titulo: 'Impostos e Declarações',
        itens: [
          { id: '004-irpf', ordem: 1, titulo: 'IRPF – Declaração e recibo de entrega (últimos 3 anos)', tipo: 'arquivo' },
          { id: '004-irpj', ordem: 2, titulo: 'IRPJ (se pessoa jurídica)', tipo: 'arquivo' },
          { id: '004-certidao-federal', ordem: 3, titulo: 'Certidão Negativa da Receita Federal', tipo: 'arquivo' },
          { id: '004-certidao-estadual', ordem: 4, titulo: 'Certidão Negativa da Fazenda Estadual', tipo: 'arquivo' },
          { id: '004-certidao-municipal', ordem: 5, titulo: 'Certidão Negativa da Prefeitura Municipal', tipo: 'arquivo' },
          { id: '004-certidao-trabalhista', ordem: 6, titulo: 'Certidão Negativa da Justiça do Trabalho (CNDT)', tipo: 'arquivo' },
        ],
      },
      {
        id: '004-propriedade',
        ordem: 3,
        titulo: 'Documentação da Propriedade',
        itens: [
          { id: '004-matricula-imoveis', ordem: 1, titulo: 'Matrícula dos imóveis (atualizada)', tipo: 'arquivo' },
          { id: '004-ccir', ordem: 2, titulo: 'CCIR (Certificado de Cadastro de Imóvel Rural)', tipo: 'arquivo' },
          { id: '004-car', ordem: 3, titulo: 'CAR (Cadastro Ambiental Rural)', tipo: 'arquivo' },
          { id: '004-itr', ordem: 4, titulo: 'ITR (Imposto Territorial Rural) – últimos 3 exercícios', tipo: 'arquivo' },
          { id: '004-quote-parte', ordem: 5, titulo: 'Cópia da Quote Parte (se condomínio)', tipo: 'arquivo' },
          { id: '004-contrato-arrendamento', ordem: 6, titulo: 'Contrato de Arrendamento', tipo: 'arquivo' },
          { id: '004-contrato-parceria', ordem: 7, titulo: 'Contrato de Parceria', tipo: 'arquivo' },
        ],
      },
      {
        id: '004-producao',
        ordem: 4,
        titulo: 'Produção e Endividamento',
        itens: [
          { id: '004-quadro-safra', ordem: 1, titulo: 'Quadro de Safra Anterior / Atual', tipo: 'arquivo' },
          { id: '004-declaracao-endividamento', ordem: 2, titulo: 'Declaração de Endividamento Atual', tipo: 'arquivo' },
          { id: '004-contratos-credito', ordem: 3, titulo: 'Contratos de Crédito Atuais', tipo: 'arquivo' },
          { id: '004-notas-promissoria', ordem: 4, titulo: 'Notas Promissórias / Duplicatas', tipo: 'arquivo' },
        ],
      },
      {
        id: '004-adicionais',
        ordem: 5,
        titulo: 'Documentos Adicionais',
        itens: [
          { id: '004-mapa-romaneios', ordem: 1, titulo: 'Mapa de Romaneios', tipo: 'arquivo' },
          { id: '004-declaracao-culturas', ordem: 2, titulo: 'Declaração de Culturas Plantadas', tipo: 'arquivo' },
          { id: '004-ntn', ordem: 3, titulo: 'NTN (se circunstância)', tipo: 'arquivo' },
          { id: '004-laudos', ordem: 4, titulo: 'Laudos / Avaliações Técnicas', tipo: 'arquivo' },
          { id: '004-outros', ordem: 5, titulo: 'Outros documentos relevantes', tipo: 'arquivo' },
        ],
      },
    ],
  },
  {
    codigo: 'R.OP.005',
    nome: 'Dados Adicionais',
    descricao:
      'Aprofundamento cadastral pós-entrevista: validação de dados, cross-check fiscal e mapeamento de garantias para elaboração do dossiê.',
    secoes: [
      {
        id: '005-validacao-irpf',
        ordem: 1,
        titulo: 'Validação IRPF x IMÓVEIS',
        itens: [
          { id: '005-irpf-ok', ordem: 1, titulo: 'IRPF conferido e compatível com censo/cadastro?', tipo: 'boolean' },
          { id: '005-imoveis-declarados-coincide', ordem: 2, titulo: 'Imóveis declarados no IRPF coincidem com CCIR/CAR?', tipo: 'boolean' },
          { id: '005-receita-bruta-irpf', ordem: 3, titulo: 'Receita Bruta informada no IRPF', tipo: 'numero' },
          { id: '005-carteira-arr-informada', ordem: 4, titulo: 'Carteira ARR informada?', tipo: 'boolean' },
          { id: '005-culturas-possiveis', ordem: 5, titulo: 'Relação de culturas possíveis na propriedade', tipo: 'texto' },
          { id: '005-potencial-producao', ordem: 6, titulo: 'Área + Potencial de produção', tipo: 'texto' },
        ],
      },
      {
        id: '005-pj',
        ordem: 2,
        titulo: 'Empresa (Pessoa Jurídica) – se aplicável',
        itens: [
          { id: '005-contrato-social', ordem: 1, titulo: 'Contrato Social / Última Alteração', tipo: 'arquivo' },
          { id: '005-ccmei', ordem: 2, titulo: 'CCMEI – Verificação e validação', tipo: 'boolean' },
          { id: '005-cnpj-todos', ordem: 3, titulo: 'CNPJ de todos os sócios anotados', tipo: 'texto' },
          { id: '005-socios-relacionamento', ordem: 4, titulo: 'Relação de sócios e seus vinculos com outras empresas', tipo: 'texto' },
          { id: '005-bacen-letra-a', ordem: 5, titulo: 'BACEN – Carta Letra A consultada', tipo: 'boolean' },
          { id: '005-bacen-letra-b', ordem: 6, titulo: 'BACEN – Carta Letra B consultada', tipo: 'boolean' },
          { id: '005-bacen-letra-c', ordem: 7, titulo: 'BACEN – Carta Letra C consultada', tipo: 'boolean' },
          { id: '005-bacen-letra-e', ordem: 8, titulo: 'BACEN – Carta Letra E consultada', tipo: 'boolean' },
          { id: '005-bacen-outras', ordem: 9, titulo: 'Outras consultas BACEN realizadas', tipo: 'texto' },
        ],
      },
      {
        id: '005-garantias',
        ordem: 3,
        titulo: 'Mapeamento de Garantias',
        itens: [
          { id: '005-garantias-identificadas', ordem: 1, titulo: 'Garantias dadas à instituições de crédito', tipo: 'texto' },
          { id: '005-ordem-prioridade', ordem: 2, titulo: 'Ordem de prioridade das garantias', tipo: 'texto' },
          { id: '005-valor-garantias', ordem: 3, titulo: 'Valor aproximado das garantias', tipo: 'numero' },
          { id: '005-propriedade-benfeitorias', ordem: 4, titulo: 'Propriedade com benfeitorias?', tipo: 'boolean' },
          { id: '005-despesas-administrativas', ordem: 5, titulo: 'Despesas administrativas / operacionais identificadas', tipo: 'texto' },
          { id: '005-garantia-renuncia', ordem: 6, titulo: 'Renúncia à garantia?', tipo: 'boolean' },
          { id: '005-sonsuspad', ordem: 7, titulo: 'SonsusPAD / Processos vinculados', tipo: 'texto' },
          { id: '005-anotacoes-legais', ordem: 8, titulo: 'Anotações legais / restrições', tipo: 'texto' },
        ],
      },
      {
        id: '005-produtor',
        ordem: 4,
        titulo: 'Dados do Produtor / DAP',
        itens: [
          { id: '005-cei-gfip', ordem: 1, titulo: 'CEI (Cadastro Específico do INSS) / GFIP', tipo: 'boolean' },
          { id: '005-dap-rg', ordem: 2, titulo: 'DAP / RG', tipo: 'arquivo' },
          { id: '005-capacidade-produtiva', ordem: 3, titulo: 'Capacidade Produtiva Declarada (CPD)', tipo: 'texto' },
          { id: '005-rastreabilidade-safra', ordem: 4, titulo: 'Rastreabilidade de safra (quem comprou / vendeu)', tipo: 'texto' },
          { id: '005-programas-governo', ordem: 5, titulo: 'Programas de governo vinculados', tipo: 'texto' },
          { id: '005-area-declarada-dap', ordem: 6, titulo: 'Área declarada na DAP (ha)', tipo: 'numero' },
          { id: '005-area-propria-declarada', ordem: 7, titulo: 'Área própria declarada (ha)', tipo: 'numero' },
          { id: '005-area-arrendada-declarada', ordem: 8, titulo: 'Área arrendada / parceria declarada (ha)', tipo: 'numero' },
        ],
      },
      {
        id: '005-vencimentos',
        ordem: 5,
        titulo: 'Datas e Vencimentos',
        itens: [
          { id: '005-data-vencimento-geral', ordem: 1, titulo: 'Data limite / vencimento da operação', tipo: 'data' },
          { id: '005-contratos-validade', ordem: 2, titulo: 'Validade dos contratos de arrendamento/parceria', tipo: 'data' },
          { id: '005-contratos-cana-validade', ordem: 3, titulo: 'Validade dos contratos de cana (fornecimento)', tipo: 'data' },
          { id: '005-seguro-safra-validade', ordem: 4, titulo: 'Validade do Seguro da Safra', tipo: 'data' },
          { id: '005-certidoes-validade', ordem: 5, titulo: 'Validade das certidões negativas', tipo: 'data' },
        ],
      },
    ],
  },
]

export function getTemplate(codigo: string): ChecklistTemplate | undefined {
  return CHECKLIST_TEMPLATES.find((t) => t.codigo === codigo)
}

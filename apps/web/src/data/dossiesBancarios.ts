export type BancoDossieId =
  | 'btg'
  | 'itau'
  | 'santander'
  | 'daycoval'
  | 'bocom'
  | 'geral'
  | 'safras'

export type FormatoModeloBancario = 'xlsx' | 'xlsm' | 'xls' | 'docx' | 'doc' | 'pptx'

export type CategoriaModeloBancario =
  | 'cadastro'
  | 'autorizacao'
  | 'checklist'
  | 'producao'
  | 'inteligencia'

export interface BancoDossie {
  id: BancoDossieId
  nome: string
  accent: string
}

export interface ModeloBancario {
  id: string
  banco: BancoDossieId
  titulo: string
  arquivo: string
  formato: FormatoModeloBancario
  categoria: CategoriaModeloBancario
  prioridade: 'principal' | 'apoio' | 'legal' | 'legado'
  status: 'mapeado' | 'exige limpeza' | 'converter legado'
  finalidade: string
  secoes: string[]
  requisitos: string[]
  saidas: string[]
  observacoes: string[]
}

export interface PerfilCasoBancario {
  id: string
  titulo: string
  descricao: string
  requisitosExtras: string[]
  foco: string[]
}

export interface CampoCanonicoAletis {
  id: string
  titulo: string
  descricao: string
  fontes: string[]
  usadoEm: BancoDossieId[]
}

export const bancosDossie: BancoDossie[] = [
  { id: 'btg', nome: 'BTG Pactual', accent: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { id: 'itau', nome: 'Itaú BBA', accent: 'bg-orange-50 text-orange-800 border-orange-200' },
  { id: 'santander', nome: 'Santander', accent: 'bg-red-50 text-red-800 border-red-200' },
  { id: 'daycoval', nome: 'Daycoval', accent: 'bg-sky-50 text-sky-800 border-sky-200' },
  { id: 'bocom', nome: 'BOCOM BBM', accent: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  { id: 'geral', nome: 'Modelo ALETIS', accent: 'bg-aletis-cream-papel text-aletis-verde border-aletis-borda' },
  { id: 'safras', nome: 'Safras & Mercado', accent: 'bg-amber-50 text-amber-800 border-amber-200' },
]

export const modelosBancarios: ModeloBancario[] = [
  {
    id: 'daycoval-cadastro-agro-2025',
    banco: 'daycoval',
    titulo: 'Cadastro Agro Daycoval 2025',
    arquivo: '2026.02.03 - Cadastro Agro Daycoval 2025 - ATUALIZACAO 26.xlsx',
    formato: 'xlsx',
    categoria: 'cadastro',
    prioridade: 'principal',
    status: 'mapeado',
    finalidade: 'Cadastro agro completo para aproximar produtor, grupo economico e dados de risco ao banco.',
    secoes: ['Checklist', 'Cadastro', 'Operacional', 'Produção', 'Ativos', 'Relação de bens', 'Passivos'],
    requisitos: [
      'IRPF/IRPJ e declaracoes atualizadas',
      'Autorizacoes BACEN/SCR',
      'Contratos de arrendamento e anuencias',
      'Detalhamento de dividas bancarias e fornecedores',
      'Informacoes de producao por cultura e safra',
    ],
    saidas: ['Cadastro Daycoval preenchido', 'Checklist de pendencias', 'Resumo de risco operacional'],
    observacoes: ['Tem estrutura abrangente e deve receber dados canonicos de cliente, propriedades, producao e passivos.'],
  },
  {
    id: 'btg-sisbacen-pj-pf',
    banco: 'btg',
    titulo: 'BTG SISBACEN - Autorização PJ/PF',
    arquivo: 'BTG _ SISBACEN - Autorização para Consultas PJ-PF.doc',
    formato: 'doc',
    categoria: 'autorizacao',
    prioridade: 'legal',
    status: 'converter legado',
    finalidade: 'Autorização para consulta de informações de crédito, SCR/BACEN e bases correlatas.',
    secoes: ['Identificação do cliente', 'Autorização de consulta', 'Local e data', 'Assinatura'],
    requisitos: ['Nome completo ou razao social', 'CPF/CNPJ', 'Cidade/UF', 'Data de emissao', 'Assinatura do autorizado'],
    saidas: ['Carta de autorizacao BTG em PDF', 'Versao editavel para assinatura'],
    observacoes: ['Arquivo .doc legado; deve ser convertido para docx limpo antes da geracao automatica.'],
  },
  {
    id: 'btg-checklist-documentos',
    banco: 'btg',
    titulo: 'Checklist Documentos BTG',
    arquivo: 'CHECK LIST DOCUMENTOS BTG.docx',
    formato: 'docx',
    categoria: 'checklist',
    prioridade: 'principal',
    status: 'mapeado',
    finalidade: 'Checklist de documentos para PF, PJ agro, holding, garantidores e grupo economico.',
    secoes: ['Pessoa fisica', 'Pessoa juridica agro/holding', 'Garantidores', 'Imoveis rurais', 'Dados financeiros'],
    requisitos: [
      'RG/CNH/CPF e comprovante de endereco',
      'Contrato social, CNPJ e organograma',
      'Demonstracoes financeiras e faturamento',
      'CAR, CCIR, ITR e matriculas',
      'Estrutura de endividamento',
    ],
    saidas: ['Checklist BTG por cliente', 'Lista objetiva de pendencias', 'E-mail de solicitacao ao cliente'],
    observacoes: ['E o melhor ponto de partida para o motor de pendencias por banco.'],
  },
  {
    id: 'santander-cadastro-agro-v32',
    banco: 'santander',
    titulo: 'Cadastro Santander Agronegocios v3.2',
    arquivo: 'Cadastro Santander - Agronegócios (versão 3.2).xlsm',
    formato: 'xlsm',
    categoria: 'cadastro',
    prioridade: 'principal',
    status: 'mapeado',
    finalidade: 'Cadastro/proposta com producao, ativos, passivos, fluxos, graficos e plano comercial.',
    secoes: ['Introdução', 'Cadastro', 'Produção', 'Ativos', 'Passivos', 'Capa', 'Fluxos', 'Gráficos', 'Apresentação', 'Plano Comercial'],
    requisitos: [
      'Grupo economico PF/PJ',
      'Bacen por curto e longo prazo',
      'Produção por safra anterior, atual e prevista',
      'Patrimonio rural e onus',
      'Plano comercial e oportunidades bancarias',
    ],
    saidas: ['Cadastro Santander preenchido', 'Quadro de fluxo', 'Resumo comercial para proposta'],
    observacoes: ['Contém fórmulas e abas de apresentação; a geração deve preservar macros e fórmulas do modelo original.'],
  },
  {
    id: 'bocom-bbm-cadastro',
    banco: 'bocom',
    titulo: 'Cadastro BOCOM BBM',
    arquivo: 'Cadastro_BOCOM BBM.xlsm',
    formato: 'xlsm',
    categoria: 'cadastro',
    prioridade: 'principal',
    status: 'mapeado',
    finalidade: 'Cadastro analitico de credito com historico, producao, ativos, passivos e fluxo de caixa.',
    secoes: ['Sumário', 'Introdução', 'Cadastro', 'Histórico', 'Produção', 'Ativos', 'Passivos', 'Fluxo de Caixa'],
    requisitos: [
      'Historico de area e produtividade',
      'Gross result agricultura/pecuaria',
      'Ativos rurais, biologicos e estoques',
      'Dividas bancarias, terras, fornecedores e tradings',
      'Fluxo de caixa anual',
    ],
    saidas: ['Cadastro BOCOM BBM preenchido', 'Fluxo de caixa base banco', 'Resumo de capacidade operacional'],
    observacoes: ['Modelo mais financeiro; deve consumir diretamente dados de gestao financeira e quadro safra.'],
  },
  {
    id: 'btg-quadro-producao',
    banco: 'btg',
    titulo: 'Quadro de Produção BTG',
    arquivo: 'Documentos Agro - Quadro de produção_MODELO BTG.xlsx',
    formato: 'xlsx',
    categoria: 'producao',
    prioridade: 'apoio',
    status: 'mapeado',
    finalidade: 'Quadro simplificado de producao para soja, milho, outras culturas e pecuaria.',
    secoes: ['Introducao', 'Soja e milho', 'Outras culturas', 'Pecuaria', 'Comentarios'],
    requisitos: [
      'Safra atual, anterior e planejamento',
      'Area propria e arrendada',
      'Produtividade, preco, custo e arrendamento',
      'Historico de vacinacao para limites acima de R$ 5 milhoes',
      'Detalhamento de dividas',
    ],
    saidas: ['Quadro de producao BTG', 'Resumo agricola e pecuario', 'Base para analise de limite'],
    observacoes: ['Otimo modelo para gerar primeiro quando o banco pede informacao rapida de producao.'],
  },
  {
    id: 'itau-questionario-agro',
    banco: 'itau',
    titulo: 'Questionário de Crédito Itaú BBA Agro',
    arquivo: 'MODELO QUADRO ITAU_Questionário de crédito - Itaú BBA Agro.xlsx',
    formato: 'xlsx',
    categoria: 'cadastro',
    prioridade: 'principal',
    status: 'mapeado',
    finalidade: 'Questionario robusto de credito agro com safra, ativos, passivos, investimentos e assinatura.',
    secoes: ['Dados', 'Questionario Safra', 'Situacao Patrimonial - Ativos', 'Situacao Patrimonial - Passivos', 'Intencao de Investimentos', 'Assinatura'],
    requisitos: [
      'Membros do grupo e proprietarios',
      'Culturas por safra, regiao, sistema e unidade',
      'Caixa, contas a receber, estoque, semoventes e terras',
      'Divida bancaria, divida de terras, fornecedores e outras dividas',
      'Intencao de aquisicao de terras e investimentos',
    ],
    saidas: ['Questionário Itaú preenchido', 'Patrimônio consolidado', 'Plano de investimento'],
    observacoes: ['Possui muitas validacoes e campos mesclados; precisa de mapeamento cuidadoso por celula.'],
  },
  {
    id: 'itau-bacen',
    banco: 'itau',
    titulo: 'Autorização BACEN Itaú',
    arquivo: 'MODELO_BACEN_ITAU.docx',
    formato: 'docx',
    categoria: 'autorizacao',
    prioridade: 'legal',
    status: 'exige limpeza',
    finalidade: 'Autorização de consulta ao Sistema de Informações de Crédito para Itaú BBA.',
    secoes: ['Cabecalho legal', 'Declaracoes SCR', 'Ciencia do cliente', 'Local e data', 'Assinatura'],
    requisitos: ['Nome', 'CPF/CNPJ', 'Endereco', 'Cidade/UF', 'Data', 'Assinatura'],
    saidas: ['Autorização Itaú em PDF', 'Arquivo editável para assinatura'],
    observacoes: ['O arquivo contem dados de exemplo; deve ser higienizado antes de virar template automatico.'],
  },
  {
    id: 'btg-cadastro-2025',
    banco: 'btg',
    titulo: 'Cadastro BTG 2025',
    arquivo: 'MODELO_CADASTRO BTG 2025_(Hevellyn).xlsx',
    formato: 'xlsx',
    categoria: 'cadastro',
    prioridade: 'principal',
    status: 'mapeado',
    finalidade: 'Pacote completo BTG com proposta, patrimonio, clientes, dividas e producao.',
    secoes: [
      'Proposta - Cadastro',
      'Areas Proprias',
      'Areas Arrendadas',
      'Maquinas',
      'Clientes',
      'Dividas',
      'Produção soja e milho',
      'Produção pecuária',
      'Outras culturas',
      'Quadro resumo',
    ],
    requisitos: [
      'Informacoes do financiamento',
      'Atividades do grupo economico',
      'Patrimonio rural, maquinas e equipamentos',
      'Contratos com clientes',
      'Dividas bancarias, terras e fornecedores',
    ],
    saidas: ['Cadastro BTG completo', 'Quadro resumo agricola', 'Pacote de analise para credito agro'],
    observacoes: ['Deve ser o template principal BTG quando o caso exige dossie completo.'],
  },
  {
    id: 'produtor-rural-generico',
    banco: 'geral',
    titulo: 'Modelo Cadastro Produtor Rural',
    arquivo: 'Modelo Cadastro - Produtor Rural.xlsx',
    formato: 'xlsx',
    categoria: 'cadastro',
    prioridade: 'principal',
    status: 'mapeado',
    finalidade: 'Base ALETIS para cadastro único de produtor rural quando o banco ainda não foi definido.',
    secoes: ['Cadastro', 'Dados rurais', 'Produção', 'Patrimônio', 'Endividamento'],
    requisitos: [
      'Identificacao do produtor',
      'Dados de imoveis e areas',
      'Safras e produtividade',
      'Bens e garantias',
      'Endividamento consolidado',
    ],
    saidas: ['Cadastro único ALETIS', 'Base para pré-preenchimento bancário', 'Resumo interno do cliente'],
    observacoes: ['Deve virar a tela primaria de preenchimento, antes de exportar para cada banco.'],
  },
  {
    id: 'safras-plataforma-2025',
    banco: 'safras',
    titulo: 'Plataforma Safras 05/2025',
    arquivo: 'Plataforma Safras_05_2025.pptx',
    formato: 'pptx',
    categoria: 'inteligencia',
    prioridade: 'apoio',
    status: 'mapeado',
    finalidade: 'Material de apoio para inteligencia de mercado, cotacoes, graficos, correlacoes e mercado fisico.',
    secoes: ['Cotacoes', 'Graficos', 'Estudos e correlacao', 'Mercado fisico'],
    requisitos: ['Commodity principal', 'Regiao', 'Serie comparativa', 'Premios, basis, fretes e paridades quando aplicavel'],
    saidas: ['Material de apoio ao dossie', 'Anexo de inteligencia de mercado', 'Argumentacao para banco/cliente'],
    observacoes: ['Não é cadastro bancário; deve entrar como anexo de suporte quando houver necessidade técnica.'],
  },
  {
    id: 'quadro-producao-legado',
    banco: 'geral',
    titulo: 'Quadro Produção Legado',
    arquivo: 'QUADRO PRODUÇÃO.xls',
    formato: 'xls',
    categoria: 'producao',
    prioridade: 'legado',
    status: 'converter legado',
    finalidade: 'Quadro safra historico com producao, receita, custo, margem e calendario por cultura.',
    secoes: ['Quadro safra', 'Demonstrativo de producao', 'Receita', 'Custos', 'Margem', 'Calendario'],
    requisitos: [
      'Safras historicas',
      'Areas plantadas',
      'Produtividade por cultura',
      'Receita bruta, despesas e receita liquida',
      'Plantio e colheita por mes',
    ],
    saidas: ['Quadro safra convertido', 'Base historica de producao', 'Indicadores de margem por cultura'],
    observacoes: ['Arquivo .xls legado; precisa conversão confiável para XLSX antes da automação fina.'],
  },
  {
    id: 'bocom-carta-pdev-cad-cpr',
    banco: 'bocom',
    titulo: 'Carta PDEV / Cadastro Positivo / CAD CPR',
    arquivo: '_Carta PDEV_Cadastro Positivo_CAD_CPR.docx',
    formato: 'docx',
    categoria: 'autorizacao',
    prioridade: 'legal',
    status: 'mapeado',
    finalidade: 'Autorização BOCOM BBM para SCR, cadastro positivo, compartilhamento de dados e consulta de CPR.',
    secoes: ['Autorização SCR', 'Cadastro Positivo', 'Compartilhamento de dados', 'Consulta CPR', 'Assinaturas'],
    requisitos: ['Lista PF autorizada', 'Lista PJ autorizada', 'CPF/CNPJ', 'Local e data', 'Assinaturas'],
    saidas: ['Carta BOCOM BBM em PDF', 'Versao bilingue editavel', 'Anexo legal do dossie'],
    observacoes: ['Modelo contem placeholders PF/PJ e deve aceitar multiplos assinantes no mesmo caso.'],
  },
]

export const perfisCasoBancario: PerfilCasoBancario[] = [
  {
    id: 'produtor-pf',
    titulo: 'Produtor rural PF',
    descricao: 'Caso individual com propriedades, safra, passivos e autorizacoes pessoais.',
    requisitosExtras: ['Documento pessoal', 'Estado civil e conjuge quando aplicavel', 'IRPF', 'Comprovante de endereco'],
    foco: ['Identidade PF', 'Patrimônio rural', 'Produção', 'SCR/BACEN'],
  },
  {
    id: 'pj-holding',
    titulo: 'PJ agro ou holding',
    descricao: 'Pessoa juridica, administradores, socios, UBO, demonstracoes e organograma.',
    requisitosExtras: ['Contrato social', 'Cartao CNPJ', 'Demonstracoes financeiras', 'Quadro societario/UBO'],
    foco: ['Grupo economico', 'Governanca', 'Faturamento', 'Garantidores'],
  },
  {
    id: 'grupo-economico',
    titulo: 'Grupo economico completo',
    descricao: 'Unifica PFs, PJs, fazendas, maquinas, clientes, fornecedores e endividamento consolidado.',
    requisitosExtras: ['Mapa de participantes', 'Empresas do grupo', 'Dividas por tomador', 'Consolidacao patrimonial'],
    foco: ['Participantes', 'Ativos', 'Passivos', 'Fluxo consolidado'],
  },
  {
    id: 'producao-safra',
    titulo: 'Safra e producao',
    descricao: 'Foco em areas, produtividade, preco, custo, margem e planejamento da proxima safra.',
    requisitosExtras: ['Area propria/arrendada', 'Produtividade historica', 'Preco medio', 'Custo por hectare'],
    foco: ['Quadro safra', 'Margem bruta', 'Planejamento', 'Mercado'],
  },
  {
    id: 'pecuaria',
    titulo: 'Pecuaria',
    descricao: 'Rebanho, ciclo, comercializacao, custo animal, reposicao e exigencias sanitarias.',
    requisitosExtras: ['Ficha sanitaria', 'Historico de vacinacao', 'Rebanho por faixa etaria', 'Comercializacao em @'],
    foco: ['Semoventes', 'Eficiencia produtiva', 'Sanidade', 'Fluxo pecuario'],
  },
  {
    id: 'investimento',
    titulo: 'Investimento ou aquisicao',
    descricao: 'Compra de terras, maquinas, expansao produtiva ou novo limite de investimento.',
    requisitosExtras: ['Descricao do investimento', 'Valor total', 'Cronograma de amortizacao', 'Garantias propostas'],
    foco: ['Intencao de investimento', 'Capacidade de pagamento', 'Garantias', 'Fluxo futuro'],
  },
]

export const camposCanonicosAletis: CampoCanonicoAletis[] = [
  {
    id: 'identidade',
    titulo: 'Identidade PF/PJ',
    descricao: 'Nome, razao social, CPF/CNPJ, contatos, endereco, estado civil e representantes.',
    fontes: ['CRM', 'Documentos do cliente', 'Cadastro produtor rural'],
    usadoEm: ['btg', 'itau', 'santander', 'daycoval', 'bocom', 'geral'],
  },
  {
    id: 'grupo-economico',
    titulo: 'Grupo economico',
    descricao: 'Participantes, parentesco, participacao, empresas, UBO, administradores e atuacao na atividade.',
    fontes: ['CRM', 'Contrato social', 'Organograma', 'Declaracao do cliente'],
    usadoEm: ['btg', 'itau', 'santander', 'daycoval', 'bocom'],
  },
  {
    id: 'propriedades',
    titulo: 'Imoveis e areas',
    descricao: 'Fazendas, CAR, matricula, municipio, area total, plantio, pastagem, reserva, arrendamento e onus.',
    fontes: ['Matriculas', 'CAR', 'CCIR', 'ITR', 'Contratos de arrendamento'],
    usadoEm: ['btg', 'itau', 'santander', 'daycoval', 'bocom', 'geral'],
  },
  {
    id: 'producao',
    titulo: 'Produção e safra',
    descricao: 'Culturas, area propria/arrendada, produtividade, preco, custo, receita, margem e planejamento.',
    fontes: ['Quadro safra', 'FARMS', 'Historico do cliente', 'Notas/contratos de comercializacao'],
    usadoEm: ['btg', 'itau', 'santander', 'daycoval', 'bocom', 'geral'],
  },
  {
    id: 'pecuaria',
    titulo: 'Pecuaria e semoventes',
    descricao: 'Rebanho, ciclo, faixa etaria, peso, arrobas, preco de venda, custo e sanidade.',
    fontes: ['Ficha sanitaria', 'Historico de vacinacao', 'Relatorio do produtor'],
    usadoEm: ['btg', 'itau', 'daycoval', 'bocom'],
  },
  {
    id: 'passivos',
    titulo: 'Passivos e SCR',
    descricao: 'Divida bancaria, fornecedores, tradings, terras, moeda, vencimento, taxa e amortizacoes.',
    fontes: ['SCR/BACEN', 'Extratos', 'Contratos bancários', 'Planilhas de dívidas'],
    usadoEm: ['btg', 'itau', 'santander', 'daycoval', 'bocom'],
  },
  {
    id: 'clientes-comercializacao',
    titulo: 'Clientes e comercializacao',
    descricao: 'Principais compradores, contratos, cultura, safra, volume, preco, fixacao e hedge.',
    fontes: ['Contratos de venda', 'Notas fiscais', 'Relatorios comerciais'],
    usadoEm: ['btg', 'santander', 'daycoval', 'bocom'],
  },
  {
    id: 'investimentos',
    titulo: 'Investimentos e proposta',
    descricao: 'Limite solicitado, finalidade, prazo, garantias, aquisicoes e novos investimentos.',
    fontes: ['Proposta', 'Simulador v16', 'Plano de investimento'],
    usadoEm: ['btg', 'itau', 'santander', 'daycoval'],
  },
  {
    id: 'autorizacoes',
    titulo: 'Autorizacoes legais',
    descricao: 'SCR/BACEN, cadastro positivo, compartilhamento de dados, CAD CPR e assinaturas.',
    fontes: ['Modelos DOCX/DOC', 'Assinaturas do cliente'],
    usadoEm: ['btg', 'itau', 'bocom'],
  },
]

export const etapasDossieBancario = [
  {
    titulo: '1. Higienizar modelos',
    descricao: 'Preservar originais, remover dados de exemplo e criar templates limpos com placeholders.',
  },
  {
    titulo: '2. Preencher cadastro único',
    descricao: 'Capturar uma vez os dados canonicos ALETIS e reutilizar em qualquer banco.',
  },
  {
    titulo: '3. Montar caso bancário',
    descricao: 'Selecionar banco, perfil do caso e gerar checklist objetivo de pendencias.',
  },
  {
    titulo: '4. Exportar pacote',
    descricao: 'Gerar PDF executivo, DOCX de autorizações e XLSX/XLSM do banco preservando fórmulas.',
  },
  {
    titulo: '5. Versionar e acompanhar',
    descricao: 'Guardar historico por cliente, banco, data, responsavel e status de envio.',
  },
]

export function nomeBancoDossie(id: BancoDossieId): string {
  return bancosDossie.find((banco) => banco.id === id)?.nome ?? id
}

export function modelosDoBanco(banco: BancoDossieId): ModeloBancario[] {
  return modelosBancarios.filter((modelo) => modelo.banco === banco || modelo.banco === 'geral')
}

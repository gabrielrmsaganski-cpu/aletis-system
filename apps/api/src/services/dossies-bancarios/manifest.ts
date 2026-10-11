export type BancoDossieId = 'btg' | 'itau' | 'santander' | 'daycoval' | 'bocom' | 'geral' | 'safras'
export type FormatoModeloBancario = 'xlsx' | 'xlsm' | 'xls' | 'docx' | 'doc' | 'pptx'
export type CategoriaModeloBancario = 'cadastro' | 'autorizacao' | 'checklist' | 'producao' | 'inteligencia'

export interface ModeloBancarioManifest {
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

export interface PerfilCasoBancarioManifest {
  id: string
  titulo: string
  descricao: string
  requisitosExtras: string[]
}

export const BANCOS_DOSSIE: Record<BancoDossieId, string> = {
  btg: 'BTG Pactual',
  itau: 'Itaú BBA',
  santander: 'Santander',
  daycoval: 'Daycoval',
  bocom: 'BOCOM BBM',
  geral: 'Modelo ALETIS',
  safras: 'Safras & Mercado',
}

export const PERFIS_CASO_BANCARIO: PerfilCasoBancarioManifest[] = [
  {
    id: 'produtor-pf',
    titulo: 'Produtor rural PF',
    descricao: 'Caso individual com propriedades, safra, passivos e autorizações pessoais.',
    requisitosExtras: ['Documento pessoal', 'Estado civil e cônjuge quando aplicável', 'IRPF', 'Comprovante de endereço'],
  },
  {
    id: 'pj-holding',
    titulo: 'PJ agro ou holding',
    descricao: 'Pessoa jurídica, administradores, sócios, UBO, demonstrações e organograma.',
    requisitosExtras: ['Contrato social', 'Cartão CNPJ', 'Demonstrações financeiras', 'Quadro societário/UBO'],
  },
  {
    id: 'grupo-economico',
    titulo: 'Grupo econômico completo',
    descricao: 'Unifica PFs, PJs, fazendas, máquinas, clientes, fornecedores e endividamento consolidado.',
    requisitosExtras: ['Mapa de participantes', 'Empresas do grupo', 'Dívidas por tomador', 'Consolidação patrimonial'],
  },
  {
    id: 'producao-safra',
    titulo: 'Safra e produção',
    descricao: 'Foco em áreas, produtividade, preço, custo, margem e planejamento da próxima safra.',
    requisitosExtras: ['Área própria/arrendada', 'Produtividade histórica', 'Preço médio', 'Custo por hectare'],
  },
  {
    id: 'pecuaria',
    titulo: 'Pecuária',
    descricao: 'Rebanho, ciclo, comercialização, custo animal, reposição e exigências sanitárias.',
    requisitosExtras: ['Ficha sanitária', 'Histórico de vacinação', 'Rebanho por faixa etária', 'Comercialização em @'],
  },
  {
    id: 'investimento',
    titulo: 'Investimento ou aquisição',
    descricao: 'Compra de terras, máquinas, expansão produtiva ou novo limite de investimento.',
    requisitosExtras: ['Descrição do investimento', 'Valor total', 'Cronograma de amortização', 'Garantias propostas'],
  },
]

export const MODELOS_BANCARIOS: ModeloBancarioManifest[] = [
  {
    id: 'daycoval-cadastro-agro-2025',
    banco: 'daycoval',
    titulo: 'Cadastro Agro Daycoval 2025',
    arquivo: '2026.02.03 - Cadastro Agro Daycoval 2025 - ATUALIZACAO 26.xlsx',
    formato: 'xlsx',
    categoria: 'cadastro',
    prioridade: 'principal',
    status: 'mapeado',
    finalidade: 'Cadastro agro completo para produtor, grupo econômico e dados de risco.',
    secoes: ['Checklist', 'Cadastro', 'Operacional', 'Produção', 'Ativos', 'Relação de bens', 'Passivos'],
    requisitos: ['IRPF/IRPJ', 'Autorização BACEN/SCR', 'Contratos de arrendamento', 'Detalhamento de dívidas', 'Produção por cultura e safra'],
    saidas: ['Cadastro Daycoval preenchido', 'Checklist de pendências', 'Resumo de risco operacional'],
    observacoes: ['Modelo abrangente; deve receber dados canônicos de cliente, propriedades, produção e passivos.'],
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
    requisitos: ['Nome/razão social', 'CPF/CNPJ', 'Cidade/UF', 'Data de emissão', 'Assinatura'],
    saidas: ['Carta de autorização BTG em PDF', 'Versão editável para assinatura'],
    observacoes: ['Arquivo .doc legado; deve ser convertido para docx limpo antes da geração automática final.'],
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
    finalidade: 'Checklist de documentos para PF, PJ agro, holding, garantidores e grupo econômico.',
    secoes: ['Pessoa física', 'Pessoa jurídica agro/holding', 'Garantidores', 'Imóveis rurais', 'Dados financeiros'],
    requisitos: ['RG/CNH/CPF', 'Contrato social/CNPJ', 'Demonstrações financeiras', 'CAR/CCIR/ITR/matrículas', 'Estrutura de endividamento'],
    saidas: ['Checklist BTG por cliente', 'Lista objetiva de pendências', 'E-mail de solicitação ao cliente'],
    observacoes: ['Ponto de partida do motor de pendências por banco.'],
  },
  {
    id: 'santander-cadastro-agro-v32',
    banco: 'santander',
    titulo: 'Cadastro Santander Agronegócios v3.2',
    arquivo: 'Cadastro Santander - Agronegócios (versão 3.2).xlsm',
    formato: 'xlsm',
    categoria: 'cadastro',
    prioridade: 'principal',
    status: 'mapeado',
    finalidade: 'Cadastro/proposta com produção, ativos, passivos, fluxos, gráficos e plano comercial.',
    secoes: ['Introdução', 'Cadastro', 'Produção', 'Ativos', 'Passivos', 'Capa', 'Fluxos', 'Gráficos', 'Apresentação', 'Plano Comercial'],
    requisitos: ['Grupo econômico PF/PJ', 'Bacen curto/longo prazo', 'Produção por safra', 'Patrimônio rural', 'Plano comercial'],
    saidas: ['Cadastro Santander preenchido', 'Quadro de fluxo', 'Resumo comercial para proposta'],
    observacoes: ['Contém fórmulas e macros; a geração deve preservar o modelo original.'],
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
    finalidade: 'Cadastro analítico de crédito com histórico, produção, ativos, passivos e fluxo de caixa.',
    secoes: ['Sumário', 'Introdução', 'Cadastro', 'Histórico', 'Produção', 'Ativos', 'Passivos', 'Fluxo de Caixa'],
    requisitos: ['Histórico de área e produtividade', 'Resultado agro/pecuária', 'Ativos rurais', 'Dívidas', 'Fluxo de caixa'],
    saidas: ['Cadastro BOCOM BBM preenchido', 'Fluxo de caixa base banco', 'Resumo de capacidade operacional'],
    observacoes: ['Modelo financeiro; deve consumir gestão financeira e quadro safra.'],
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
    finalidade: 'Quadro simplificado de produção para soja, milho, outras culturas e pecuária.',
    secoes: ['Introdução', 'Soja e milho', 'Outras culturas', 'Pecuária', 'Comentários'],
    requisitos: ['Safra atual/anterior/planejada', 'Área própria e arrendada', 'Produtividade', 'Preço/custo', 'Dívidas'],
    saidas: ['Quadro de produção BTG', 'Resumo agrícola e pecuário', 'Base para análise de limite'],
    observacoes: ['Modelo rápido para demanda bancária focada em produção.'],
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
    finalidade: 'Questionário robusto de crédito agro com safra, ativos, passivos, investimentos e assinatura.',
    secoes: ['Dados', 'Questionário Safra', 'Situação Patrimonial - Ativos', 'Situação Patrimonial - Passivos', 'Intenção de Investimentos', 'Assinatura'],
    requisitos: ['Membros do grupo', 'Culturas por safra', 'Ativos', 'Passivos', 'Intenção de investimentos'],
    saidas: ['Questionário Itaú preenchido', 'Patrimônio consolidado', 'Plano de investimento'],
    observacoes: ['Possui muitas validações e campos mesclados; exige mapeamento célula-a-célula.'],
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
    secoes: ['Cabeçalho legal', 'Declarações SCR', 'Ciência do cliente', 'Local e data', 'Assinatura'],
    requisitos: ['Nome', 'CPF/CNPJ', 'Endereço', 'Cidade/UF', 'Data', 'Assinatura'],
    saidas: ['Autorização Itaú em PDF', 'Arquivo editável para assinatura'],
    observacoes: ['O arquivo contém dados de exemplo; deve ser higienizado antes de virar template automático.'],
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
    finalidade: 'Pacote completo BTG com proposta, patrimônio, clientes, dívidas e produção.',
    secoes: ['Proposta - Cadastro', 'Áreas Próprias', 'Áreas Arrendadas', 'Máquinas', 'Clientes', 'Dívidas', 'Produção soja e milho', 'Produção pecuária', 'Outras culturas', 'Quadro resumo'],
    requisitos: ['Financiamento', 'Atividades do grupo', 'Patrimônio rural', 'Clientes', 'Dívidas'],
    saidas: ['Cadastro BTG completo', 'Quadro resumo agrícola', 'Pacote de análise para crédito agro'],
    observacoes: ['Template principal BTG para dossiê completo.'],
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
    requisitos: ['Identificação', 'Imóveis e áreas', 'Safras', 'Bens/garantias', 'Endividamento'],
    saidas: ['Cadastro único ALETIS', 'Base para pré-preenchimento bancário', 'Resumo interno do cliente'],
    observacoes: ['Deve virar a tela primária de preenchimento antes de exportar para cada banco.'],
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
    finalidade: 'Material de apoio para inteligência de mercado, cotações, gráficos e mercado físico.',
    secoes: ['Cotações', 'Gráficos', 'Estudos e correlação', 'Mercado físico'],
    requisitos: ['Commodity', 'Região', 'Série comparativa', 'Prêmios/basis/fretes quando aplicável'],
    saidas: ['Material de apoio ao dossiê', 'Anexo de inteligência de mercado'],
    observacoes: ['Não é cadastro bancário; entra como anexo técnico quando necessário.'],
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
    finalidade: 'Quadro safra histórico com produção, receita, custo, margem e calendário por cultura.',
    secoes: ['Quadro safra', 'Demonstrativo de produção', 'Receita', 'Custos', 'Margem', 'Calendário'],
    requisitos: ['Safras históricas', 'Áreas plantadas', 'Produtividade', 'Receita/custos', 'Plantio e colheita'],
    saidas: ['Quadro safra convertido', 'Base histórica de produção', 'Indicadores de margem por cultura'],
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
    saidas: ['Carta BOCOM BBM em PDF', 'Versão bilíngue editável', 'Anexo legal do dossiê'],
    observacoes: ['Modelo aceita múltiplos assinantes PF/PJ no mesmo caso.'],
  },
]

export function nomeBancoDossie(id: BancoDossieId): string {
  return BANCOS_DOSSIE[id] ?? id
}

export function modelosDoBanco(banco: BancoDossieId): ModeloBancarioManifest[] {
  return MODELOS_BANCARIOS.filter((modelo) => modelo.banco === banco || modelo.banco === 'geral')
}

export function perfilCaso(id: string): PerfilCasoBancarioManifest {
  return PERFIS_CASO_BANCARIO.find((perfil) => perfil.id === id) ?? PERFIS_CASO_BANCARIO[0]
}

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import PizZip from 'pizzip'
import { generateBankFiles } from './BankTemplateGenerator.js'
import {
  consolidarDadosDossie,
  type FonteConsolidacaoDossie,
} from './DossieDataConsolidator.js'
import {
  renderDossieBancarioHtml,
  renderDossieBancarioPdf,
  type DossieBancarioHtmlResult,
  type DossieBancarioPdfResult,
} from './DossieBancarioPdfRenderer.js'
import {
  MODELOS_BANCARIOS,
  PERFIS_CASO_BANCARIO,
  modelosDoBanco,
  nomeBancoDossie,
  perfilCaso,
  type BancoDossieId,
  type ModeloBancarioManifest,
} from './manifest.js'
import type {
  ArquivoBancarioGerado,
  ClienteDossieInput,
  DadosCanonicosDossieInput,
  GerarPacoteDossieInput,
} from './types.js'

export interface PacoteDossieResult {
  buffer: Buffer
  filename: string
  modelos: Array<ModeloBancarioManifest & { disponivel: boolean; caminho?: string; bytes?: number }>
  checklist: ChecklistDossieItem[]
  arquivosGerados: ArquivoBancarioGerado[]
}

export interface ChecklistDossieItem {
  item: string
  origem: string
  etapa: string
  status: 'mapeado' | 'cliente' | 'validar'
}

const CATEGORIA_LABEL: Record<string, string> = {
  cadastro: 'Cadastro',
  autorizacao: 'Autorização',
  checklist: 'Checklist',
  producao: 'Produção',
  inteligencia: 'Inteligência',
}

const CAMPOS_CANONICOS = [
  ['Identidade PF/PJ', 'Nome, razão social, CPF/CNPJ, contatos, endereço, estado civil e representantes.', 'CRM; documentos do cliente; cadastro produtor rural'],
  ['Grupo econômico', 'Participantes, parentesco, participação, empresas, UBO, administradores e atuação na atividade.', 'CRM; contrato social; organograma; declaração do cliente'],
  ['Imóveis e áreas', 'Fazendas, CAR, matrícula, município, área total, plantio, pastagem, reserva, arrendamento e ônus.', 'Matrículas; CAR; CCIR; ITR; contratos de arrendamento'],
  ['Produção e safra', 'Culturas, área própria/arrendada, produtividade, preço, custo, receita, margem e planejamento.', 'Quadro safra; FARMS; histórico do cliente; contratos de comercialização'],
  ['Pecuária e semoventes', 'Rebanho, ciclo, faixa etária, peso, arrobas, preço de venda, custo e sanidade.', 'Ficha sanitária; histórico de vacinação; relatório do produtor'],
  ['Passivos e SCR', 'Dívida bancária, fornecedores, tradings, terras, moeda, vencimento, taxa e amortizações.', 'SCR/BACEN; extratos; contratos bancários; planilhas de dívidas'],
  ['Clientes e comercialização', 'Principais compradores, contratos, cultura, safra, volume, preço, fixação e hedge.', 'Contratos de venda; notas fiscais; relatórios comerciais'],
  ['Investimentos e proposta', 'Limite solicitado, finalidade, prazo, garantias, aquisições e novos investimentos.', 'Proposta; Simulador v16; plano de investimento'],
  ['Autorizações legais', 'SCR/BACEN, cadastro positivo, compartilhamento de dados, CAD CPR e assinaturas.', 'Modelos DOCX/DOC; assinaturas do cliente'],
] as const

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function safeSlug(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'dossie'
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvEscape).join(';')).join('\n') + '\n'
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function resolveSourceDir(): string {
  const candidates = [
    process.env.ALETIS_DOSSIES_BANCARIOS_DIR,
    '/root/ALETIS',
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '../..'),
  ].filter(Boolean) as string[]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function buildChecklist(
  banco: BancoDossieId,
  perfilId: string,
  incluirInteligencia: boolean,
  cliente: ClienteDossieInput,
  dados: DadosCanonicosDossieInput,
): ChecklistDossieItem[] {
  const perfil = perfilCaso(perfilId)
  const modelos = modelosDoBanco(banco).filter((modelo) => incluirInteligencia || modelo.categoria !== 'inteligencia')
  const requisitos = unique([
    ...perfil.requisitosExtras,
    ...modelos.flatMap((modelo) => modelo.requisitos),
    'PDF executivo do dossiê com índice, checklist e matriz de modelos',
    'Cadastro canônico ALETIS revisado',
    'Versão final revisada antes de envio ao banco',
  ])

  const hasIdentity = Boolean(cliente.nome && cliente.cpfCnpj)
  const hasContact = Boolean(cliente.endereco && (cliente.telefone || cliente.email))
  const hasGroup = Boolean(dados.grupoEconomico?.length || dados.empresas?.length)
  const hasProperties = Boolean(dados.propriedades?.length || dados.arrendamentos?.length)
  const hasProduction = Boolean(dados.producoes?.length || dados.pecuaria?.length)
  const hasDebts = Boolean(dados.dividas?.length || dados.dividasTerras?.length || dados.fornecedores?.length)
  const hasCommercial = Boolean(dados.compradores?.length)
  const hasInvestments = Boolean(dados.investimentos?.length || dados.operacao?.limiteSolicitado)

  return requisitos.map((item) => {
    const lower = fold(item)
    const isLegal = /bacen|scr|assinatura|autoriz|cadastro positivo|cpr/.test(lower)
    const isFinancialDocument = /irpf|irpj|demonstr|balanco|dre|sped|faturamento|recibo/.test(lower)
    const isPropertyDocument = /matricula|car|ccir|itr|arrendamento|anuencia/.test(lower)
    const isIdentityDocument = /rg|cnh|cpf|cnpj|comprovante|identifica/.test(lower)
    const isGroup = /grupo economico|organograma|beneficiario|societ|administrador|ubo/.test(lower)
    const isDebt = /divida|endividamento|passivo|fornecedor|barter|credor/.test(lower)
    const isCommercial = /cliente|comprador|comercializa|contrato de venda|hedge/.test(lower)
    const isInvestment = /investimento|limite solicitado|proposta|finalidade|garantia/.test(lower)
    const isProduction = /produc|safra|produtividade|area|pecuaria|rebanho|cultura/.test(lower)
    const isClient = isFinancialDocument || isPropertyDocument || isIdentityDocument
    const isGenerated = /pdf executivo|cadastro canonico/.test(lower)
    const isFinalReview = /versao final revisada|revisao final|revisado antes/.test(lower)
    let status: ChecklistDossieItem['status'] = 'validar'
    if (isGenerated) status = 'mapeado'
    else if (isFinalReview || isLegal || isFinancialDocument) status = isFinalReview ? 'validar' : 'cliente'
    else if (isPropertyDocument) status = hasProperties ? 'validar' : 'cliente'
    else if (isIdentityDocument) status = hasIdentity && hasContact ? 'validar' : 'cliente'
    else if (isGroup) status = hasGroup ? 'mapeado' : 'cliente'
    else if (isDebt) status = hasDebts ? 'mapeado' : 'cliente'
    else if (isCommercial) status = hasCommercial ? 'mapeado' : 'cliente'
    else if (isInvestment) status = hasInvestments ? 'mapeado' : 'cliente'
    else if (isProduction) status = hasProduction ? 'mapeado' : 'cliente'
    return {
      item,
      origem: isLegal ? 'Legal' : isProduction ? 'Produção' : isClient ? 'Cliente' : 'Cadastro único',
      etapa: isLegal
        ? 'Autorizações'
        : isFinancialDocument || isPropertyDocument || isIdentityDocument
          ? 'Documentos'
          : isProduction
            ? 'Quadro safra'
            : 'Dados ALETIS',
      status,
    }
  })
}

function sourcePathFor(modelo: ModeloBancarioManifest, sourceDir: string): string {
  return join(sourceDir, modelo.arquivo)
}

function withAvailability(modelos: ModeloBancarioManifest[], sourceDir: string) {
  return modelos.map((modelo) => {
    const caminho = sourcePathFor(modelo, sourceDir)
    const disponivel = existsSync(caminho)
    return {
      ...modelo,
      disponivel,
      caminho: disponivel ? caminho : undefined,
      bytes: disponivel ? statSync(caminho).size : undefined,
    }
  })
}

function validateBankOutputs(
  banco: BancoDossieId,
  modelos: ReturnType<typeof withAvailability>,
  arquivos: ArquivoBancarioGerado[],
): void {
  if (!['btg', 'itau', 'santander', 'daycoval', 'bocom'].includes(banco)) return
  const requiredModels = modelos.filter((modelo) => modelo.banco === banco)
  const unavailable = requiredModels.filter((modelo) => !modelo.disponivel)
  if (unavailable.length) {
    throw new Error(`Modelos obrigatórios não encontrados: ${unavailable.map((modelo) => modelo.arquivo).join(', ')}`)
  }
  const generatedIds = new Set(arquivos.map((arquivo) => arquivo.modeloId))
  const missing = requiredModels.filter((modelo) => !generatedIds.has(modelo.id))
  if (missing.length) {
    throw new Error(`Geradores não produziram os modelos obrigatórios: ${missing.map((modelo) => modelo.titulo).join(', ')}`)
  }
  const duplicateNames = arquivos
    .map((arquivo) => arquivo.filename)
    .filter((filename, index, all) => all.indexOf(filename) !== index)
  if (duplicateNames.length) {
    throw new Error(`Arquivos gerados com nomes duplicados: ${unique(duplicateNames).join(', ')}`)
  }
  for (const arquivo of arquivos) {
    if (arquivo.buffer.length < 1_000) {
      throw new Error(`Arquivo gerado inválido ou vazio: ${arquivo.filename}`)
    }
    if (/\.(xlsx|xlsm|docx)$/i.test(arquivo.filename)) {
      const zip = new PizZip(arquivo.buffer)
      if (arquivo.filename.endsWith('.xlsm') && !zip.file('xl/vbaProject.bin')) {
        throw new Error(`Macro VBA não foi preservada em ${arquivo.filename}`)
      }
    }
  }
}

async function buildCadastroCanonicoXlsx(input: {
  banco: BancoDossieId
  perfilId: string
  cliente: ClienteDossieInput
  dados: DadosCanonicosDossieInput
  modelos: ModeloBancarioManifest[]
  checklist: ChecklistDossieItem[]
  fontes: FonteConsolidacaoDossie[]
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ALETIS'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.calcProperties.fullCalcOnLoad = true

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17251B' } } as const
  const goldFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCB9D52' } } as const
  const creamFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F2E7' } } as const
  const border = { style: 'thin', color: { argb: 'FFD9D3BC' } } as const

  function styleHeader(row: ExcelJS.Row) {
    row.eachCell((cell) => {
      cell.fill = headerFill
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }
      cell.border = { top: border, right: border, bottom: border, left: border }
      cell.alignment = { vertical: 'middle' }
    })
  }

  function addSheet(name: string, columns: Array<{ header: string; key: string; width: number }>) {
    const ws = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = columns
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    }
    styleHeader(ws.getRow(1))
    return ws
  }

  const resumo = addSheet('Resumo', [
    { header: 'Campo', key: 'campo', width: 34 },
    { header: 'Valor', key: 'valor', width: 72 },
  ])
  const perfil = perfilCaso(input.perfilId)
  resumo.addRows([
    { campo: 'Banco', valor: nomeBancoDossie(input.banco) },
    { campo: 'Perfil do caso', valor: perfil.titulo },
    { campo: 'Descrição', valor: perfil.descricao },
    { campo: 'Cliente', valor: input.cliente.nome ?? '' },
    { campo: 'CPF/CNPJ', valor: input.cliente.cpfCnpj ?? '' },
    { campo: 'Cidade/UF', valor: [input.cliente.cidade, input.cliente.uf].filter(Boolean).join('/') },
    { campo: 'Responsável', valor: input.cliente.responsavel ?? '' },
    { campo: 'Data-base', valor: input.dados.dataBase ?? '' },
    { campo: 'Cultura/objeto', valor: input.dados.operacao?.cultura ?? '' },
    { campo: 'Limite solicitado', valor: input.dados.operacao?.limiteSolicitado ?? '' },
    { campo: 'Prazo', valor: input.dados.operacao?.prazo ?? '' },
    { campo: 'Gerado em', valor: new Date().toLocaleString('pt-BR') },
  ])
  resumo.eachRow((row, number) => {
    if (number > 1) row.eachCell((cell) => {
      cell.fill = creamFill
      cell.border = { top: border, right: border, bottom: border, left: border }
      cell.alignment = { vertical: 'top', wrapText: true }
    })
  })

  const identidade = addSheet('Identidade', [
    { header: 'Campo canônico', key: 'campo', width: 32 },
    { header: 'Valor atual', key: 'valor', width: 50 },
    { header: 'Fonte sugerida', key: 'fonte', width: 42 },
    { header: 'Observação', key: 'obs', width: 46 },
  ])
  identidade.addRows([
    { campo: 'Nome/Razão social', valor: input.cliente.nome ?? '', fonte: 'CRM / documento pessoal', obs: '' },
    { campo: 'CPF/CNPJ', valor: input.cliente.cpfCnpj ?? '', fonte: 'CRM / cartão CNPJ / documento pessoal', obs: '' },
    { campo: 'Endereço', valor: input.cliente.endereco ?? '', fonte: 'Comprovante de endereço', obs: '' },
    { campo: 'Cidade', valor: input.cliente.cidade ?? '', fonte: 'CRM', obs: '' },
    { campo: 'UF', valor: input.cliente.uf ?? '', fonte: 'CRM', obs: '' },
    { campo: 'E-mail', valor: input.cliente.email ?? '', fonte: 'CRM', obs: '' },
    { campo: 'Telefone', valor: input.cliente.telefone ?? '', fonte: 'CRM', obs: '' },
  ])

  const dicionario = addSheet('Dicionario_ALETIS', [
    { header: 'Bloco', key: 'bloco', width: 32 },
    { header: 'Descrição', key: 'descricao', width: 68 },
    { header: 'Fontes', key: 'fontes', width: 58 },
    { header: 'Status', key: 'status', width: 22 },
  ])
  dicionario.addRows(CAMPOS_CANONICOS.map(([bloco, descricao, fontes]) => ({ bloco, descricao, fontes, status: 'Mapear / validar' })))

  const checklist = addSheet('Checklist', [
    { header: 'Item', key: 'item', width: 70 },
    { header: 'Origem', key: 'origem', width: 20 },
    { header: 'Etapa', key: 'etapa', width: 24 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Responsável', key: 'responsavel', width: 28 },
  ])
  checklist.addRows(input.checklist.map((item) => ({
    item: item.item,
    origem: item.origem,
    etapa: item.etapa,
    status: item.status === 'cliente' ? 'Pedir ao cliente' : item.status === 'validar' ? 'Validar' : 'Mapeado',
    responsavel: item.status === 'cliente' ? 'Cliente' : 'ALETIS',
  })))

  const modelos = addSheet('Modelos', [
    { header: 'Banco', key: 'banco', width: 20 },
    { header: 'Modelo', key: 'modelo', width: 42 },
    { header: 'Formato', key: 'formato', width: 12 },
    { header: 'Categoria', key: 'categoria', width: 16 },
    { header: 'Status técnico', key: 'status', width: 18 },
    { header: 'Finalidade', key: 'finalidade', width: 74 },
  ])
  modelos.addRows(input.modelos.map((modelo) => ({
    banco: nomeBancoDossie(modelo.banco),
    modelo: modelo.titulo,
    formato: modelo.formato.toUpperCase(),
    categoria: CATEGORIA_LABEL[modelo.categoria] ?? modelo.categoria,
    status: modelo.status,
    finalidade: modelo.finalidade,
  })))

  const fontes = addSheet('Fontes_Dados', [
    { header: 'Fonte', key: 'fonte', width: 28 },
    { header: 'Registros utilizados', key: 'registros', width: 22 },
    { header: 'Detalhe', key: 'detalhe', width: 78 },
  ])
  fontes.addRows(input.fontes.map((fonte) => ({
    fonte: fonte.fonte,
    registros: fonte.registros,
    detalhe: fonte.detalhe,
  })))

  const grupo = addSheet('Grupo_Economico', [
    { header: 'Nome/Razão social', key: 'nome', width: 40 },
    { header: 'CPF/CNPJ', key: 'documento', width: 24 },
    { header: 'Participação %', key: 'participacao', width: 18 },
    { header: 'Parentesco/vínculo', key: 'parentesco', width: 24 },
    { header: 'Telefone', key: 'telefone', width: 22 },
    { header: 'E-mail', key: 'email', width: 34 },
    { header: 'Atua na atividade', key: 'atua', width: 20 },
  ])
  grupo.addRows((input.dados.grupoEconomico ?? []).map((item) => ({
    nome: item.nome ?? '',
    documento: item.cpfCnpj ?? '',
    participacao: item.participacaoPct ?? '',
    parentesco: item.parentesco ?? '',
    telefone: item.telefone ?? '',
    email: item.email ?? '',
    atua: item.atuaAtividade === undefined ? '' : item.atuaAtividade ? 'Sim' : 'Não',
  })))

  const propriedades = addSheet('Propriedades', [
    { header: 'Fazenda', key: 'fazenda', width: 34 },
    { header: 'Proprietário', key: 'proprietario', width: 34 },
    { header: 'CAR', key: 'car', width: 30 },
    { header: 'Matrícula', key: 'matricula', width: 22 },
    { header: 'Município/UF', key: 'local', width: 28 },
    { header: 'Área total (ha)', key: 'areaTotal', width: 18 },
    { header: 'Plantio (ha)', key: 'plantio', width: 18 },
    { header: 'Pastagem (ha)', key: 'pastagem', width: 18 },
    { header: 'Reserva (ha)', key: 'reserva', width: 18 },
    { header: 'Avaliação (R$)', key: 'avaliacao', width: 20 },
    { header: 'Ônus', key: 'onus', width: 30 },
  ])
  propriedades.addRows((input.dados.propriedades ?? []).map((item) => ({
    fazenda: item.fazenda ?? '',
    proprietario: item.proprietario ?? '',
    car: item.car ?? '',
    matricula: item.matricula ?? '',
    local: [item.municipio, item.uf].filter(Boolean).join('/'),
    areaTotal: item.areaTotalHa ?? '',
    plantio: item.areaPlantioHa ?? '',
    pastagem: item.areaPastagemHa ?? '',
    reserva: item.reservaLegalHa ?? '',
    avaliacao: item.avaliacao ?? '',
    onus: item.onus ?? '',
  })))

  const producao = addSheet('Producao_Safras', [
    { header: 'Cultura', key: 'cultura', width: 24 },
    { header: 'Período', key: 'periodo', width: 16 },
    { header: 'Safra', key: 'safra', width: 16 },
    { header: 'Região', key: 'regiao', width: 24 },
    { header: 'Área própria (ha)', key: 'areaPropria', width: 20 },
    { header: 'Área arrendada (ha)', key: 'areaArrendada', width: 22 },
    { header: 'Produtividade', key: 'produtividade', width: 18 },
    { header: 'Preço unitário', key: 'preco', width: 18 },
    { header: 'Custo/ha', key: 'custo', width: 18 },
    { header: 'Custo arrendamento', key: 'arrendamento', width: 22 },
    { header: 'Observações', key: 'observacoes', width: 42 },
  ])
  producao.addRows((input.dados.producoes ?? []).map((item) => ({
    cultura: item.cultura ?? '',
    periodo: item.periodo ?? 'atual',
    safra: item.safra ?? '',
    regiao: item.regiao ?? '',
    areaPropria: item.areaPropriaHa ?? '',
    areaArrendada: item.areaArrendadaHa ?? '',
    produtividade: item.produtividade ?? '',
    preco: item.precoUnitario ?? '',
    custo: item.custoHa ?? '',
    arrendamento: item.custoArrendamento ?? '',
    observacoes: item.observacoes ?? '',
  })))

  const dividas = addSheet('Dividas', [
    { header: 'Tomador', key: 'tomador', width: 34 },
    { header: 'CPF/CNPJ', key: 'documento', width: 24 },
    { header: 'Instituição', key: 'instituicao', width: 28 },
    { header: 'Contrato', key: 'contrato', width: 22 },
    { header: 'Tipo de crédito', key: 'tipo', width: 28 },
    { header: 'Vencimento', key: 'vencimento', width: 18 },
    { header: 'Moeda', key: 'moeda', width: 14 },
    { header: 'Taxa', key: 'taxa', width: 14 },
    { header: 'Saldo devedor', key: 'saldo', width: 22 },
    { header: 'Finalidade', key: 'finalidade', width: 34 },
  ])
  dividas.addRows((input.dados.dividas ?? []).map((item) => ({
    tomador: item.tomador ?? '',
    documento: item.documento ?? '',
    instituicao: item.instituicao ?? '',
    contrato: item.contrato ?? '',
    tipo: item.tipoCredito ?? '',
    vencimento: item.vencimento ?? '',
    moeda: item.moeda ?? 'BRL',
    taxa: item.taxaJuros ?? '',
    saldo: item.saldoDevedor ?? '',
    finalidade: item.finalidade ?? '',
  })))

  const empresas = addSheet('Empresas', [
    { header: 'Razão social', key: 'razaoSocial', width: 40 },
    { header: 'CNPJ', key: 'cnpj', width: 24 },
    { header: 'Atividade', key: 'atividade', width: 34 },
    { header: 'Faturamento anual', key: 'faturamento', width: 22 },
    { header: 'Restrições', key: 'restricoes', width: 34 },
    { header: 'Bacen total', key: 'bacen', width: 20 },
    { header: 'Curto prazo', key: 'curto', width: 20 },
    { header: 'Longo prazo', key: 'longo', width: 20 },
    { header: 'Coobrigações', key: 'coobrigacoes', width: 20 },
  ])
  empresas.addRows((input.dados.empresas ?? []).map((item) => ({
    razaoSocial: item.razaoSocial ?? '',
    cnpj: item.cnpj ?? '',
    atividade: item.atividade ?? '',
    faturamento: item.faturamentoAnual ?? '',
    restricoes: item.restricoes ?? '',
    bacen: item.bacenTotal ?? '',
    curto: item.curtoPrazo ?? '',
    longo: item.longoPrazo ?? '',
    coobrigacoes: item.coobrigacoes ?? '',
  })))

  const administradores = addSheet('Administradores', [
    { header: 'Nome', key: 'nome', width: 38 },
    { header: 'Responsabilidade', key: 'responsabilidade', width: 44 },
    { header: 'Experiência / formação', key: 'experiencia', width: 52 },
  ])
  administradores.addRows((input.dados.administradores ?? []).map((item) => ({
    nome: item.nome ?? '',
    responsabilidade: item.responsabilidade ?? '',
    experiencia: item.experiencia ?? '',
  })))

  const arrendamentos = addSheet('Arrendamentos', [
    { header: 'Fazenda', key: 'fazenda', width: 34 },
    { header: 'Proprietário', key: 'proprietario', width: 34 },
    { header: 'CAR / matrícula', key: 'registro', width: 30 },
    { header: 'Município/UF', key: 'local', width: 28 },
    { header: 'Área total', key: 'areaTotal', width: 18 },
    { header: 'Área arrendada', key: 'areaArrendada', width: 20 },
    { header: 'Custo mensal', key: 'custoMensal', width: 20 },
    { header: 'Custo sc/ha', key: 'custoSc', width: 18 },
    { header: 'Início', key: 'inicio', width: 16 },
    { header: 'Vencimento', key: 'vencimento', width: 16 },
  ])
  arrendamentos.addRows((input.dados.arrendamentos ?? []).map((item) => ({
    fazenda: item.fazenda ?? '',
    proprietario: item.proprietario ?? '',
    registro: item.matricula || item.car || '',
    local: [item.municipio, item.uf].filter(Boolean).join('/'),
    areaTotal: item.areaTotalHa ?? '',
    areaArrendada: item.areaArrendadaHa ?? '',
    custoMensal: item.custoMensal ?? '',
    custoSc: item.custoScHa ?? '',
    inicio: item.inicio ?? '',
    vencimento: item.vencimento ?? '',
  })))

  const bens = addSheet('Bens_Ativos', [
    { header: 'Classe', key: 'classe', width: 18 },
    { header: 'Tipo', key: 'tipo', width: 24 },
    { header: 'Descrição', key: 'descricao', width: 46 },
    { header: 'Marca / fonte', key: 'fonte', width: 28 },
    { header: 'Ano', key: 'ano', width: 12 },
    { header: 'Quantidade', key: 'quantidade', width: 16 },
    { header: 'Valor', key: 'valor', width: 22 },
    { header: 'Ônus / observações', key: 'observacoes', width: 42 },
  ])
  bens.addRows([
    ...(input.dados.maquinas ?? []).map((item) => ({
      classe: 'Máquina/equipamento',
      tipo: item.tipo ?? '',
      descricao: item.descricao ?? '',
      fonte: item.marca ?? '',
      ano: item.ano ?? '',
      quantidade: 1,
      valor: item.valor ?? '',
      observacoes: item.onus ?? '',
    })),
    ...(input.dados.ativosOutros ?? []).map((item) => ({
      classe: 'Outro ativo',
      tipo: item.tipo ?? '',
      descricao: item.descricao ?? '',
      fonte: item.fonte ?? '',
      ano: '',
      quantidade: item.quantidade ?? '',
      valor: item.valor ?? '',
      observacoes: item.observacoes ?? '',
    })),
  ])

  const comercializacao = addSheet('Comercializacao', [
    { header: 'Comprador', key: 'comprador', width: 38 },
    { header: 'Cultura', key: 'cultura', width: 24 },
    { header: 'Safra', key: 'safra', width: 16 },
    { header: 'Volume', key: 'volume', width: 18 },
    { header: 'Preço unitário', key: 'preco', width: 18 },
    { header: 'Estoque', key: 'estoque', width: 18 },
    { header: '% vendido no plantio', key: 'plantio', width: 22 },
    { header: 'Regime de preço', key: 'regime', width: 20 },
    { header: '% spot', key: 'spot', width: 16 },
    { header: 'Entrega', key: 'entrega', width: 14 },
    { header: 'Hedge', key: 'hedge', width: 30 },
  ])
  comercializacao.addRows((input.dados.compradores ?? []).map((item) => ({
    comprador: item.nome ?? '',
    cultura: item.cultura ?? '',
    safra: item.safra ?? '',
    volume: item.volume ?? '',
    preco: item.precoUnitario ?? '',
    estoque: item.estoque ?? '',
    plantio: item.percentualVendidoPlantio ?? '',
    regime: item.precoRegime ?? '',
    spot: item.percentualSpot ?? '',
    entrega: item.entrega ?? '',
    hedge: item.hedgeCambial ?? '',
  })))

  const outrosPassivos = addSheet('Outros_Passivos', [
    { header: 'Classe', key: 'classe', width: 20 },
    { header: 'Credor / descrição', key: 'credor', width: 42 },
    { header: 'Tipo / forma', key: 'tipo', width: 34 },
    { header: 'Área', key: 'area', width: 16 },
    { header: 'Valor', key: 'valor', width: 22 },
    { header: 'Soja (sc)', key: 'soja', width: 16 },
    { header: 'Milho (sc)', key: 'milho', width: 16 },
    { header: 'Vencimento', key: 'vencimento', width: 18 },
    { header: 'Observações', key: 'observacoes', width: 44 },
  ])
  outrosPassivos.addRows([
    ...(input.dados.fornecedores ?? []).map((item) => ({
      classe: 'Fornecedor/barter',
      credor: item.nome ?? '',
      tipo: item.tipoProduto ?? '',
      area: '',
      valor: item.valor ?? '',
      soja: item.volumeSoja ?? '',
      milho: item.volumeMilho ?? '',
      vencimento: item.vencimento ?? '',
      observacoes: item.observacoes ?? '',
    })),
    ...(input.dados.dividasTerras ?? []).map((item) => ({
      classe: 'Dívida de terra',
      credor: item.descricao ?? '',
      tipo: item.formaPagamento ?? '',
      area: item.areaTotalHa ?? '',
      valor: item.valorTotal ?? '',
      soja: '',
      milho: '',
      vencimento: item.vencimentoFinal ?? '',
      observacoes: '',
    })),
  ])

  const investimentos = addSheet('Investimentos', [
    { header: 'Descrição', key: 'descricao', width: 46 },
    { header: 'Data prevista', key: 'data', width: 18 },
    { header: 'Área (ha)', key: 'area', width: 16 },
    { header: 'Valor total', key: 'valor', width: 22 },
    { header: 'Funding próprio', key: 'proprio', width: 22 },
    { header: 'Funding terceiro', key: 'terceiro', width: 22 },
    { header: 'Prazo', key: 'prazo', width: 18 },
    { header: 'Payback', key: 'payback', width: 16 },
  ])
  investimentos.addRows((input.dados.investimentos ?? []).map((item) => ({
    descricao: item.descricao ?? '',
    data: item.dataPrevista ?? '',
    area: item.areaTotalHa ?? '',
    valor: item.valorTotal ?? '',
    proprio: item.fundingProprio ?? '',
    terceiro: item.fundingTerceiro ?? '',
    prazo: item.prazo ?? '',
    payback: item.payback ?? '',
  })))

  const abasEntrada = [
    'Identidade',
    'Dicionario_ALETIS',
    'Checklist',
    'Modelos',
    'Fontes_Dados',
    'Grupo_Economico',
    'Empresas',
    'Administradores',
    'Propriedades',
    'Arrendamentos',
    'Producao_Safras',
    'Dividas',
    'Bens_Ativos',
    'Comercializacao',
    'Outros_Passivos',
    'Investimentos',
  ]
  for (const name of abasEntrada) {
    const ws = workbook.getWorksheet(name)
    if (!ws) continue
    ws.eachRow((row, number) => {
      if (number === 1) return
      row.eachCell((cell) => {
        cell.border = { top: border, right: border, bottom: border, left: border }
        cell.alignment = { vertical: 'top', wrapText: true }
      })
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

function buildManifestJson(input: {
  banco: BancoDossieId
  perfilId: string
  cliente: ClienteDossieInput
  dados: DadosCanonicosDossieInput
  modelos: ReturnType<typeof withAvailability>
  checklist: ChecklistDossieItem[]
  arquivosGerados: ArquivoBancarioGerado[]
  fontes: FonteConsolidacaoDossie[]
}) {
  return {
    geradoEm: new Date().toISOString(),
    banco: { id: input.banco, nome: nomeBancoDossie(input.banco) },
    perfil: perfilCaso(input.perfilId),
    cliente: input.cliente,
    dadosCanonicos: input.dados,
    fontesConsolidadas: input.fontes,
    modelos: input.modelos.map((modelo) => ({
      id: modelo.id,
      banco: modelo.banco,
      titulo: modelo.titulo,
      arquivo: modelo.arquivo,
      formato: modelo.formato,
      categoria: modelo.categoria,
      status: modelo.status,
      disponivel: modelo.disponivel,
      bytes: modelo.bytes ?? null,
      observacoes: modelo.observacoes,
    })),
    arquivosGerados: input.arquivosGerados.map((arquivo) => ({
      modeloId: arquivo.modeloId,
      filename: arquivo.filename,
      bytes: arquivo.buffer.length,
      sha256: sha256(arquivo.buffer),
      contentType: arquivo.contentType,
      celulasGravadas: arquivo.celulasGravadas,
      celulasHigienizadas: arquivo.celulasHigienizadas,
      formulasAjustadas: arquivo.formulasAjustadas,
      observacoes: arquivo.observacoes,
    })),
    checklist: input.checklist,
    proximosPassos: [
      'Conferir o cadastro canônico ALETIS.',
      'Conferir os arquivos preenchidos e o relatório técnico de cada modelo.',
      'Preencher pendências do cliente.',
      'Validar autorizações legais e coletar assinaturas.',
    ],
  }
}

function readmeText(input: {
  banco: BancoDossieId
  perfilId: string
  modelos: ReturnType<typeof withAvailability>
  checklist: ChecklistDossieItem[]
  arquivosGerados: ArquivoBancarioGerado[]
}) {
  const perfil = perfilCaso(input.perfilId)
  const pendencias = input.checklist.filter((item) => item.status === 'cliente').length
  const indisponiveis = input.modelos.filter((modelo) => !modelo.disponivel)
  return [
    'ALETIS - Pacote de Dossiê Bancário',
    '',
    `Banco: ${nomeBancoDossie(input.banco)}`,
    `Perfil: ${perfil.titulo}`,
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    '',
    'Conteúdo do pacote:',
    '- 00_MANIFESTO/manifesto-dossie.json: metadados estruturados do pacote.',
    '- 00_MANIFESTO/checklist.csv: pendências por origem, etapa e status.',
    '- 00_MANIFESTO/fontes-consolidadas.csv: origem e volume dos dados reutilizados.',
    '- 00_MANIFESTO/arquivos-gerados.csv: tamanho, hash SHA-256 e métricas técnicas de cada saída.',
    '- 01_CADASTRO_CANONICO/Cadastro_Canonico_ALETIS.xlsx: base única para preencher os modelos bancários.',
    '- 02_MODELOS_ORIGINAIS/: somente existe quando a inclusão de originais é solicitada explicitamente.',
    '- 04_ARQUIVOS_PREENCHIDOS/00_Dossie_Executivo_*.pdf: relatório completo com a marca principal ALETIS.',
    '- 04_ARQUIVOS_PREENCHIDOS/: cópias higienizadas e preenchidas sem alterar os originais.',
    '- 04_ARQUIVOS_PREENCHIDOS/RELATORIOS_TECNICOS/: controle de células, fórmulas e observações.',
    '- 05_PENDENCIAS/Pendencias_e_Validacoes.txt: lista pronta para solicitação e revisão.',
    '',
    `Modelos localizados: ${input.modelos.filter((modelo) => modelo.disponivel).length}/${input.modelos.length}`,
    `Arquivos finais gerados: ${input.arquivosGerados.length}`,
    `Pendências que dependem do cliente: ${pendencias}`,
    '',
    'Atenção:',
    'Nunca enviar a pasta 02_MODELOS_ORIGINAIS ao banco. Usar somente arquivos revisados da pasta 04_ARQUIVOS_PREENCHIDOS.',
    '',
    ...(indisponiveis.length
      ? ['Modelos não encontrados na pasta fonte:', ...indisponiveis.map((modelo) => `- ${modelo.arquivo}`), '']
      : []),
  ].join('\n')
}

export class DossieBancarioService {
  private readonly sourceDir = resolveSourceDir()

  catalogo() {
    const modelos = withAvailability(MODELOS_BANCARIOS, this.sourceDir).map(({ caminho: _caminho, ...modelo }) => modelo)
    return {
      bancos: Object.entries({
        btg: nomeBancoDossie('btg'),
        itau: nomeBancoDossie('itau'),
        santander: nomeBancoDossie('santander'),
        daycoval: nomeBancoDossie('daycoval'),
        bocom: nomeBancoDossie('bocom'),
        geral: nomeBancoDossie('geral'),
        safras: nomeBancoDossie('safras'),
      }).map(([id, nome]) => ({ id, nome })),
      perfis: PERFIS_CASO_BANCARIO,
      modelos,
    }
  }

  private async prepararContexto(input: GerarPacoteDossieInput) {
    if (!input.banco || !nomeBancoDossie(input.banco)) {
      throw new Error('Banco obrigatório ou inválido.')
    }
    const perfilId = input.perfilId || 'produtor-pf'
    const incluirInteligencia = input.incluirInteligencia === true
    const modelosBase = modelosDoBanco(input.banco).filter((modelo) => incluirInteligencia || modelo.categoria !== 'inteligencia')
    const modelos = withAvailability(modelosBase, this.sourceDir)
    const consolidado = await consolidarDadosDossie(input)
    const cliente: ClienteDossieInput = {
      ...consolidado.cliente,
      nome: consolidado.cliente.nome || 'Cliente ALETIS',
      cpfCnpj: consolidado.cliente.cpfCnpj || '',
      cidade: consolidado.cliente.cidade || '',
      uf: consolidado.cliente.uf || '',
      endereco: consolidado.cliente.endereco || '',
      email: consolidado.cliente.email || '',
      telefone: consolidado.cliente.telefone || '',
      responsavel: consolidado.cliente.responsavel || 'ALETIS',
      cep: consolidado.cliente.cep || '',
      atividade: consolidado.cliente.atividade || '',
      observacoes: consolidado.cliente.observacoes || '',
    }
    const dados = consolidado.dados
    const checklist = buildChecklist(input.banco, perfilId, incluirInteligencia, cliente, dados)
    const arquivosBancarios = input.gerarModelosPreenchidos !== false
      ? generateBankFiles({ banco: input.banco, sourceDir: this.sourceDir, cliente, dados })
      : []
    if (input.gerarModelosPreenchidos !== false) {
      validateBankOutputs(input.banco, modelos, arquivosBancarios)
    }
    return {
      perfilId,
      incluirInteligencia,
      modelos,
      checklist,
      cliente,
      dados,
      arquivosBancarios,
      fontes: consolidado.fontes,
    }
  }

  async analisarPreparacao(input: GerarPacoteDossieInput) {
    const context = await this.prepararContexto({
      ...input,
      gerarModelosPreenchidos: false,
    })
    const status = {
      mapeados: context.checklist.filter((item) => item.status === 'mapeado').length,
      validar: context.checklist.filter((item) => item.status === 'validar').length,
      solicitarAoCliente: context.checklist.filter((item) => item.status === 'cliente').length,
    }
    const score = context.checklist.length
      ? Math.round(((status.mapeados + status.validar * 0.5) / context.checklist.length) * 100)
      : 0
    return {
      cliente: context.cliente,
      fontes: context.fontes,
      checklist: context.checklist,
      prontidao: score,
      status,
      cobertura: {
        grupoEconomico: (context.dados.grupoEconomico?.length ?? 0) + (context.dados.empresas?.length ?? 0),
        propriedades: context.dados.propriedades?.length ?? 0,
        arrendamentos: context.dados.arrendamentos?.length ?? 0,
        producoes: (context.dados.producoes?.length ?? 0) + (context.dados.pecuaria?.length ?? 0),
        dividas: (context.dados.dividas?.length ?? 0)
          + (context.dados.dividasTerras?.length ?? 0)
          + (context.dados.fornecedores?.length ?? 0),
        ativos: (context.dados.maquinas?.length ?? 0) + (context.dados.ativosOutros?.length ?? 0),
      },
    }
  }

  async gerarPdf(input: GerarPacoteDossieInput): Promise<DossieBancarioPdfResult> {
    const context = await this.prepararContexto(input)
    return renderDossieBancarioPdf({
      banco: input.banco,
      perfilId: context.perfilId,
      cliente: context.cliente,
      dados: context.dados,
      modelos: context.modelos,
      checklist: context.checklist,
      arquivosGerados: context.arquivosBancarios,
    })
  }

  async gerarHtml(input: GerarPacoteDossieInput): Promise<DossieBancarioHtmlResult> {
    // O documento Base é uma visualização independente: não precisa criar
    // planilhas/modelos bancários para montar a leitura executiva.
    const context = await this.prepararContexto({
      ...input,
      gerarModelosPreenchidos: false,
    })
    return renderDossieBancarioHtml({
      banco: input.banco,
      perfilId: context.perfilId,
      cliente: context.cliente,
      dados: context.dados,
      modelos: context.modelos,
      checklist: context.checklist,
      arquivosGerados: [],
    })
  }

  async gerarPacote(input: GerarPacoteDossieInput): Promise<PacoteDossieResult> {
    const context = await this.prepararContexto(input)
    const {
      perfilId,
      modelos,
      checklist,
      cliente,
      dados,
      arquivosBancarios,
    } = context
    const incluirOriginais = input.incluirOriginais === true
    const pdf = await renderDossieBancarioPdf({
      banco: input.banco,
      perfilId,
      cliente,
      dados,
      modelos,
      checklist,
      arquivosGerados: arquivosBancarios,
    })
    const pdfExecutivo: ArquivoBancarioGerado = {
      modeloId: 'aletis-dossie-executivo',
      filename: pdf.filename,
      buffer: pdf.buffer,
      contentType: 'application/pdf',
      celulasGravadas: 0,
      celulasHigienizadas: 0,
      formulasAjustadas: 0,
      observacoes: [
        `PDF executivo estruturado com ${pdf.paginas} páginas.`,
        'Marca principal ALETIS incorporada ao arquivo.',
        'Conteúdo gerado a partir da mesma base canônica usada nos modelos bancários.',
      ],
    }
    const arquivosGerados = [pdfExecutivo, ...arquivosBancarios]

    const zip = new JSZip()
    zip.file('00_MANIFESTO/LEIA-ME.txt', readmeText({
      banco: input.banco,
      perfilId,
      modelos,
      checklist,
      arquivosGerados,
    }))
    zip.file('00_MANIFESTO/manifesto-dossie.json', JSON.stringify(buildManifestJson({
      banco: input.banco,
      perfilId,
      cliente,
      dados,
      modelos,
      checklist,
      arquivosGerados,
      fontes: context.fontes,
    }), null, 2))
    zip.file('00_MANIFESTO/checklist.csv', toCsv([
      ['Item', 'Origem', 'Etapa', 'Status'],
      ...checklist.map((item) => [item.item, item.origem, item.etapa, item.status]),
    ]))
    zip.file('00_MANIFESTO/modelos.csv', toCsv([
      ['Banco', 'Modelo', 'Arquivo', 'Formato', 'Categoria', 'Status técnico', 'Disponível'],
      ...modelos.map((modelo) => [
        nomeBancoDossie(modelo.banco),
        modelo.titulo,
        modelo.arquivo,
        modelo.formato.toUpperCase(),
        CATEGORIA_LABEL[modelo.categoria] ?? modelo.categoria,
        modelo.status,
        modelo.disponivel ? 'sim' : 'não',
      ]),
    ]))
    zip.file('00_MANIFESTO/fontes-consolidadas.csv', toCsv([
      ['Fonte', 'Registros', 'Detalhe'],
      ...context.fontes.map((fonte) => [fonte.fonte, fonte.registros, fonte.detalhe]),
    ]))
    zip.file('00_MANIFESTO/arquivos-gerados.csv', toCsv([
      ['Modelo', 'Arquivo', 'Bytes', 'SHA-256', 'Células gravadas', 'Células higienizadas', 'Fórmulas ajustadas'],
      ...arquivosGerados.map((arquivo) => [
        arquivo.modeloId,
        arquivo.filename,
        arquivo.buffer.length,
        sha256(arquivo.buffer),
        arquivo.celulasGravadas,
        arquivo.celulasHigienizadas,
        arquivo.formulasAjustadas,
      ]),
    ]))
    const solicitar = checklist.filter((item) => item.status === 'cliente')
    const validar = checklist.filter((item) => item.status === 'validar')
    zip.file('05_PENDENCIAS/Pendencias_e_Validacoes.txt', [
      `ALETIS - Pendências do dossiê ${nomeBancoDossie(input.banco)}`,
      `Cliente: ${cliente.nome}`,
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      '',
      `DOCUMENTOS / INFORMAÇÕES A SOLICITAR AO CLIENTE (${solicitar.length})`,
      ...(solicitar.length ? solicitar.map((item, index) => `${index + 1}. ${item.item}`) : ['Nenhuma pendência identificada.']),
      '',
      `VALIDAÇÕES INTERNAS ALETIS (${validar.length})`,
      ...(validar.length ? validar.map((item, index) => `${index + 1}. ${item.item}`) : ['Nenhuma validação pendente.']),
      '',
      'Observação: conferir o checklist e os anexos antes de enviar os arquivos finais ao banco.',
    ].join('\n'))

    const cadastro = await buildCadastroCanonicoXlsx({
      banco: input.banco,
      perfilId,
      cliente,
      dados,
      modelos,
      checklist,
      fontes: context.fontes,
    })
    zip.file('01_CADASTRO_CANONICO/Cadastro_Canonico_ALETIS.xlsx', cadastro)

    for (const modelo of modelos) {
      zip.file(
        `03_MAPEAMENTO/${modelo.id}.json`,
        JSON.stringify({
          id: modelo.id,
          banco: modelo.banco,
          titulo: modelo.titulo,
          arquivo: modelo.arquivo,
          formato: modelo.formato,
          categoria: modelo.categoria,
          prioridade: modelo.prioridade,
          status: modelo.status,
          finalidade: modelo.finalidade,
          secoes: modelo.secoes,
          requisitos: modelo.requisitos,
          saidas: modelo.saidas,
          observacoes: modelo.observacoes,
        }, null, 2),
      )
      if (incluirOriginais && modelo.disponivel && modelo.caminho) {
        const folder = modelo.status === 'mapeado' ? '02_MODELOS_ORIGINAIS' : '02_MODELOS_ORIGINAIS/REVISAR_HIGIENIZAR'
        zip.file(`${folder}/${basename(modelo.arquivo)}`, readFileSync(modelo.caminho))
      }
    }

    for (const arquivo of arquivosGerados) {
      zip.file(`04_ARQUIVOS_PREENCHIDOS/${arquivo.filename}`, arquivo.buffer)
      zip.file(
        `04_ARQUIVOS_PREENCHIDOS/RELATORIOS_TECNICOS/${arquivo.modeloId}.json`,
        JSON.stringify({
          modeloId: arquivo.modeloId,
          filename: arquivo.filename,
          bytes: arquivo.buffer.length,
          sha256: sha256(arquivo.buffer),
          contentType: arquivo.contentType,
          celulasGravadas: arquivo.celulasGravadas,
          celulasHigienizadas: arquivo.celulasHigienizadas,
          formulasAjustadas: arquivo.formulasAjustadas,
          observacoes: arquivo.observacoes,
          geradoEm: new Date().toISOString(),
        }, null, 2),
      )
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })
    const filename = `pacote-dossie-${safeSlug(nomeBancoDossie(input.banco))}-${safeSlug(perfilCaso(perfilId).titulo)}-${new Date().toISOString().slice(0, 10)}.zip`
    return { buffer: zipBuffer, filename, modelos, checklist, arquivosGerados }
  }
}

let singleton: DossieBancarioService | null = null

export function getDossieBancarioService(): DossieBancarioService {
  if (!singleton) singleton = new DossieBancarioService()
  return singleton
}

import type { LLMTool, LLMToolRegistry } from '../../llm/types.js'
import { z } from 'zod'
import { basename } from 'node:path'
import { getSpreadsheetMigrationSummary, type WorkbookProfile } from '../../processo-assessoria/SpreadsheetIntelligenceService.js'

const consultaAcervoSchema = z.object({
  nome: z.string().trim().max(200).optional(),
  modulo: z.string().trim().max(100).optional(),
  somentePendentes: z.boolean().default(false),
  limite: z.number().int().min(1).max(15).default(5),
  offset: z.number().int().min(0).max(100000).default(0),
  limiteAbas: z.number().int().min(1).max(30).default(12),
  offsetAbas: z.number().int().min(0).max(10000).default(0),
}).strict()

const normalizarBusca = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const possuiPendencias = (workbook: WorkbookProfile) => workbook.quality.status !== 'inspected' ||
  workbook.gaps.length > 0 || ['needs-build', 'importable', 'template-only'].includes(workbook.status)

/** Projeção permitida do catálogo: nunca retorna caminhos do servidor nem valores/fórmulas de células. */
function resumirPlanilha(workbook: WorkbookProfile, offsetAbas: number, limiteAbas: number) {
  const quality = workbook.quality
  const abas = workbook.sheetProfiles.slice(offsetAbas, offsetAbas + limiteAbas)
  return {
    filename: basename(workbook.filename.replace(/\\/g, '/')),
    sha256: workbook.sha256,
    modulo: workbook.module,
    status: workbook.status,
    prioridade: workbook.priority,
    substituicao: workbook.replacement,
    implemented: workbook.implemented,
    gaps: workbook.gaps,
    nextActions: workbook.nextActions,
    possuiPendencias: possuiPendencias(workbook),
    ocorrenciasFisicas: workbook.sourceCount,
    copiasDuplicadas: Math.max(0, workbook.sourceCount - 1),
    formulasCatalogadas: workbook.formulas,
    celulasPreenchidasCatalogadas: workbook.populatedCells,
    qualidade: {
      formato: quality.format, status: quality.status, inspecionado: quality.inspected,
      errosCacheFormulas: quality.cachedFormulaErrors,
      celulasComErroLiteral: quality.literalErrorCells,
      formulasSemCache: quality.missingFormulaCaches,
      referenciasQuebradas: quality.brokenFormulaReferences,
      nomesDefinidosQuebrados: quality.brokenDefinedNames,
      vinculosExternos: quality.externalLinks,
      formulasComVinculoExterno: quality.externalFormulaCells,
      abasOcultas: quality.hiddenSheets,
      macrosPresentes: quality.macrosPresent,
      modoCalculo: quality.calculationMode,
    },
    coberturaAbas: {
      totalCatalogado: workbook.sheets,
      perfisDisponiveis: workbook.sheetProfiles.length,
      retornadas: abas.length,
      offset: offsetAbas,
      limite: limiteAbas,
      proximoOffset: offsetAbas + abas.length < workbook.sheetProfiles.length ? offsetAbas + abas.length : null,
      inspecaoIntegralDoArquivo: quality.inspected,
      contagemConfirmada: quality.inspected,
    },
    abas: abas.map((sheet) => ({
      nome: sheet.name, visibilidade: sheet.visibility, linhas: sheet.rows, colunas: sheet.columns,
      formulas: sheet.formulas, celulasPreenchidas: sheet.populatedCells,
      errosCacheFormulas: sheet.cachedFormulaErrors, celulasComErroLiteral: sheet.literalErrorCells,
      formulasSemCache: sheet.missingFormulaCaches, referenciasQuebradas: sheet.brokenFormulaReferences,
      formulasComVinculoExterno: sheet.externalFormulaCells,
    })),
    paridadeFinanceira: 'nao_certificada' as const,
  }
}

const SIMULATORS = [
  {
    id: 'credito_v16',
    nome: 'Operação de crédito v16',
    ferramentas: ['simular_operacao_v16', 'recalcular_operacao_v16', 'ficha_bancaria_v16'],
    entrega: 'Compara PRICE, SAC e SACRE; calcula CET, IOF, seguro, parcelas, custo total e ficha bancária.',
    entradas: ['valor', 'taxa', 'datas', 'número de parcelas', 'periodicidades', 'despesas e seguros'],
  },
  {
    id: 'reestruturacao',
    nome: 'Reestruturação e capacidade de pagamento',
    ferramentas: ['calcular_dscr_cliente', 'simular_reestruturacao_divida', 'simular_renegociacao_gf', 'stress_test_gf'],
    entrega: 'Mede DSCR, compara cenários de alongamento/carência/taxa e testa estresse do fluxo de caixa.',
    entradas: ['cliente ou fluxo anual', 'saldo devedor', 'taxa', 'prazo', 'carência e cenários'],
  },
  {
    id: 'viabilidade_agricola',
    nome: 'FARMS e custo agrícola',
    ferramentas: ['listar_planos_farms_cliente', 'criar_plano_farms_cliente', 'avaliar_plano_farms', 'calcular_custo_cultura'],
    entrega: 'Projeta custo, receita, margem, ponto de equilíbrio e viabilidade por cultura, área e safra.',
    entradas: ['cultura', 'área', 'produtividade', 'preço', 'safra e custos'],
  },
  {
    id: 'regulatorio_tributario',
    nome: 'Rural, tributário e regularização',
    ferramentas: ['simular_desenrola_rural', 'simular_reforma_tributaria', 'calcular_funrural'],
    entrega: 'Compara parcelamento rural, transição CBS/IBS e incidência de Funrural.',
    entradas: ['origem e valor da dívida', 'perfil financeiro', 'receita', 'regime e ano'],
  },
] as const

export function buildSimulatorCatalogTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const spec: LLMTool = {
    name: 'catalogo_simuladores_alix',
    description: 'Lista de forma autoritativa todos os simuladores disponíveis para a ALIX, o que cada um entrega, suas ferramentas e os dados de entrada necessários. Use antes de propor cenários quando ainda não estiver claro qual simulador atende ao pedido.',
    input_schema: {
      type: 'object',
      properties: {
        objetivo: { type: 'string', description: 'Objetivo ou decisão que o consultor quer simular.' },
        clienteId: { type: 'string', description: 'Cliente ativo, quando houver.' },
      },
      additionalProperties: false,
    },
  }
  const acervoSpec: LLMTool = {
    name: 'consultar_acervo_planilhas',
    description: 'Consulta o inventário auditado das planilhas existentes no sistema: nome, SHA-256, módulo nativo, qualidade estrutural, erros, abas ocultas, cobertura, lacunas e próximas ações. Use para analisar planilhas, localizar o Simulador v16, conferir erros e planejar melhorias. Somente leitura; não retorna conteúdo de células, não executa macros e não certifica paridade financeira. Paginação de arquivos e abas é explícita.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', maxLength: 200, description: 'Parte do nome do arquivo, sem distinguir acentos ou maiúsculas.' },
        modulo: { type: 'string', maxLength: 100, description: 'Identificador ou parte do nome do módulo, por exemplo simulador-v16 ou Gestão Financeira.' },
        somentePendentes: { type: 'boolean', description: 'Filtra qualidade que exige revisão, lacunas declaradas ou migração ainda incompleta. Disponibilidade nativa não comprova equivalência financeira.' },
        limite: { type: 'integer', minimum: 1, maximum: 15, default: 5 },
        offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
        limiteAbas: { type: 'integer', minimum: 1, maximum: 30, default: 12 },
        offsetAbas: { type: 'integer', minimum: 0, maximum: 10000, default: 0,
          description: 'Para percorrer todas as abas, filtre um arquivo pelo nome e use coberturaAbas.proximoOffset; null significa fim.' },
      },
      additionalProperties: false,
    },
  }
  return {
    tools: [spec, acervoSpec],
    registry: {
      [spec.name]: {
        spec,
        handler: async (input) => ({
          objetivo: String(input.objetivo || '').trim() || undefined,
          clienteId: String(input.clienteId || '').trim() || undefined,
          total: SIMULATORS.length,
          simuladores: SIMULATORS,
          regra: 'Escolha o simulador compatível, recupere primeiro os dados existentes no CRM/documento e peça somente as premissas realmente ausentes.',
        }),
      },
      [acervoSpec.name]: {
        spec: acervoSpec,
        handler: async (input) => {
          const parsed = consultaAcervoSchema.safeParse(input)
          if (!parsed.success) return { ok: false, code: 'FILTROS_ACERVO_INVALIDOS',
            mensagem: 'Confira os filtros e limites da consulta; limite máximo de 15 arquivos e 30 abas por arquivo.',
            campos: parsed.error.issues.map((issue) => issue.path.join('.')) }
          const filtro = parsed.data
          try {
            // Usa o cache e a inspeção em andamento do serviço; a ferramenta não força nova varredura.
            const summary = await getSpreadsheetMigrationSummary()
            const modulos = new Map(summary.modules.map((module) => [module.id, module]))
            const nome = normalizarBusca(filtro.nome ?? '')
            const modulo = normalizarBusca(filtro.modulo ?? '')
            const workbooks = summary.workbooks.filter((workbook) =>
              (!nome || normalizarBusca(workbook.filename).includes(nome)) &&
              (!modulo || normalizarBusca(`${workbook.module} ${modulos.get(workbook.module)?.label ?? ''}`).includes(modulo)) &&
              (!filtro.somentePendentes || possuiPendencias(workbook)))
              .sort((a, b) => a.priority.localeCompare(b.priority) || a.filename.localeCompare(b.filename) || a.sha256.localeCompare(b.sha256))
            const pagina = workbooks.slice(filtro.offset, filtro.offset + filtro.limite)
            return {
              ok: true,
              fonte: 'Inventário estrutural das planilhas do sistema',
              geradoEm: summary.generatedAt,
              filtros: filtro,
              cobertura: { arquivosUnicosNoInventario: summary.totals.files, arquivosFisicosNoInventario: summary.totals.physicalFiles,
                copiasDuplicadas: summary.totals.duplicateCopies, arquivosCorrespondentes: workbooks.length,
                arquivosRetornados: pagina.length, offset: filtro.offset, limite: filtro.limite,
                proximoOffset: filtro.offset + pagina.length < workbooks.length ? filtro.offset + pagina.length : null },
              modulosDisponiveis: summary.modules.map((module) => ({ id: module.id, nome: module.label, arquivos: module.files })),
              planilhas: pagina.map((workbook) => resumirPlanilha(workbook, filtro.offsetAbas, filtro.limiteAbas)),
              limitesDaAnalise: [
                'Esta consulta apresenta metadados e inspeção estrutural; não contém valores nem fórmulas das células.',
                'Módulo nativo disponível e arquivo inspecionado não certificam paridade financeira total.',
                'Macros e vínculos externos não são executados ou acessados. Cache ausente ou arquivo não inspecionado não equivale a resultado zero.',
                'Confira cobertura e próximos offsets antes de afirmar que todos os arquivos ou abas foram consultados.',
              ],
              proximaAcao: 'Use implemented, gaps e nextActions para escolher o módulo e priorizar a conferência. Para calcular uma operação, recupere os dados reais e use as ferramentas determinísticas do simulador correspondente.',
            }
          } catch {
            return { ok: false, code: 'ACERVO_PLANILHAS_INDISPONIVEL',
              mensagem: 'Não foi possível consultar o inventário agora. Não interprete esta falha como ausência de planilhas ou de pendências.' }
          }
        },
      },
    },
  }
}

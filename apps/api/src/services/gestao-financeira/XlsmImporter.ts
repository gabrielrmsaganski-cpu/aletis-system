// ============================================================
// XlsmImporter — parser reverso do R.OP.001 v2.0 preenchido
// ============================================================
// Lê o xlsm enviado pelo cliente, extrai dados das células
// conhecidas e popula o sistema (membros, safras, contratos,
// custos, fazendas).
//
// Estratégia: usa exceljs em modo loadFromFile que lê valores
// resolvidos (não fórmulas) — quando a planilha está preenchida.
// ============================================================
import ExcelJS from 'exceljs'
import { GestaoFinanceiraService, getGestaoFinanceiraService } from './GestaoFinanceiraService.js'
import { GestaoFinanceiraServiceV2 } from './GestaoFinanceiraServiceV2.js'
import { getDb, isPgEnabled } from '../../db/client.js'
import {
  gfGrupo,
  gfAtivoFazenda,
  gfAtivoOutro,
  gfContratoDivida,
  gfCulturaSafra,
  gfCustoSafra,
  gfDemanda,
  gfGarantia,
  gfInsight,
  gfMembro,
  gfPassivoOutro,
  gfPremissa,
  gfSnapshotCalculo,
  type GfGrupo,
} from '../../db/schema.js'
import { eq, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { publish } from './GfEventBus.js'
import { ChangelogService } from './ChangelogService.js'
import type { GestaoFinanceiraDb } from './GestaoFinanceiraDb.js'
import { createXlsmValueReader, importAnnualToMonthly, XlsmImportValidationError, type XlsmValueReader } from './XlsmImportValues.js'

export interface ImportXlsmInput {
  grupoId: string
  buffer: Buffer
  versao?: 'v1' | 'v2'
  /** se true, deleta dados existentes antes de importar */
  replaceExisting?: boolean
}

export interface ImportXlsmResult {
  grupo: GfGrupo
  imported: {
    membros: number
    culturas: number
    contratos: number
    custos: number
    fazendas: number
    demandas: number
    ativosOutros: number
    passivosOutros: number
    garantias: number
    premissas: number
  }
  coverage: {
    workbookSheets: number
    sheetsRead: string[]
    sheetsMissing: string[]
    formulasDetected: number
    macrosDetected: boolean
  }
  warnings: string[]
}

function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function sheetOrWarn(wb: ExcelJS.Workbook, name: string, warnings: string[], read: string[], missing: string[]) {
  const ws = wb.getWorksheet(name)
  if (ws) read.push(name)
  else {
    missing.push(name)
    warnings.push(`Sheet "${name}" não encontrada`)
  }
  return ws
}

function detectWorkbookFormulas(wb: ExcelJS.Workbook): number {
  let formulas = 0
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value as any
        if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) formulas += 1
      })
    })
  }
  return formulas
}

function hasVbaProject(buffer: Buffer): boolean {
  return buffer.includes(Buffer.from('vbaProject.bin'))
}

type BaseImportMethod = 'upsertMembro' | 'upsertDemanda' | 'upsertContrato' | 'upsertFazenda' | 'upsertCusto' | 'upsertCultura'
type V2ImportMethod = 'upsertAtivoOutro' | 'upsertPassivoOutro' | 'upsertGarantia' | 'upsertPremissa'
type ImportOperation = { service: 'base'; method: BaseImportMethod; payload: Record<string, unknown> } | { service: 'v2'; method: V2ImportMethod; payload: Record<string, unknown> }
export interface XlsmImportPlan {
  operations: ImportOperation[]
  groupPatch?: Parameters<GestaoFinanceiraService['atualizarGrupo']>[1]
  imported: ImportXlsmResult['imported']
  coverage: ImportXlsmResult['coverage']
  warnings: string[]
  sourceSha256: string
}

function validateWorkbookLayout(wb: ExcelJS.Workbook, versao: ImportXlsmInput['versao']): void {
  if (versao === 'v1') throw new XlsmImportValidationError('O layout R.OP.001 v1 ainda não tem mapeamento integral validado. Use o Registro de Gestão Financeira v2; nenhum dado foi alterado.')
  if (versao !== 'v2') throw new XlsmImportValidationError('Versão de importação inválida; selecione R.OP.001 v2')
  const required = ['3 - Cadastro', '5 - Demandas', '10 - Endividamento', '8 - Ativos', '7 - Safra', '6 - Custos do Cliente']
  const missing = required.filter((name) => !wb.getWorksheet(name))
  if (missing.length) throw new XlsmImportValidationError(`Arquivo incompatível com R.OP.001 v2. Abas obrigatórias ausentes: ${missing.join(', ')}. Nenhum dado foi alterado.`)
  if (wb.worksheets.length > 64 || wb.worksheets.some((sheet) => sheet.rowCount > 20000 || sheet.columnCount > 2048)) throw new XlsmImportValidationError('Estrutura excede os limites do layout R.OP.001 v2')
}

export async function prepareXlsmImport(input: ImportXlsmInput, grupo: GfGrupo): Promise<XlsmImportPlan> {
  if (input.buffer.length > 25 * 1024 * 1024) throw new XlsmImportValidationError('Arquivo excede o limite de importação de 25 MiB')
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(input.buffer as unknown as ArrayBuffer) } catch { throw new XlsmImportValidationError('Arquivo Excel inválido ou danificado') }
  const versao = input.versao ?? 'v2'
  validateWorkbookLayout(wb, versao)
  if (input.replaceExisting) {
    const additional = ['11 - Passivos', '14 - Garantias', '10.1 - Premissas Endividamento', '13 - PREMISSAS(PADRONIZAR)', '15 - Premissas e Suporte']
    const missing = additional.filter((name) => !wb.getWorksheet(name))
    if (missing.length) throw new XlsmImportValidationError(`Substituição exige o Registro v2 completo. Abas ausentes: ${missing.join(', ')}. Nenhum dado foi alterado.`)
  }
  const values = await createXlsmValueReader(input.buffer)
  return collectImportPlan(input, wb, values, grupo)
}

async function clearGroupForImport(db: GestaoFinanceiraDb, grupoId: string, changelog: ChangelogService): Promise<void> {
  // Garantias podem referenciar fazendas; remover dependentes primeiro.
  const entities = [
    ['garantia', gfGarantia], ['membro', gfMembro], ['cultura', gfCulturaSafra],
    ['custo', gfCustoSafra], ['demanda', gfDemanda], ['contrato', gfContratoDivida],
    ['ativo_outro', gfAtivoOutro], ['passivo_outro', gfPassivoOutro], ['premissa', gfPremissa],
    ['fazenda', gfAtivoFazenda], ['insight', gfInsight], ['snapshot', gfSnapshotCalculo],
  ] as const
  for (const [entidade, table] of entities) {
    const previous = await db.select().from(table).where(eq(table.grupoId, grupoId))
    for (const row of previous) {
      await changelog.registrar({ grupoId, entidade, entidadeId: String(row.id), acao: 'delete', antes: row })
    }
    await db.delete(table).where(eq(table.grupoId, grupoId))
  }
}

async function applyImportOperation(operation: ImportOperation, svc: GestaoFinanceiraService, svcV2: GestaoFinanceiraServiceV2): Promise<void> {
  switch (operation.method) {
    case 'upsertMembro': await svc.upsertMembro(operation.payload as Parameters<GestaoFinanceiraService['upsertMembro']>[0]); break
    case 'upsertDemanda': await svc.upsertDemanda(operation.payload as Parameters<GestaoFinanceiraService['upsertDemanda']>[0]); break
    case 'upsertContrato': await svc.upsertContrato(operation.payload as Parameters<GestaoFinanceiraService['upsertContrato']>[0]); break
    case 'upsertFazenda': await svc.upsertFazenda(operation.payload as Parameters<GestaoFinanceiraService['upsertFazenda']>[0]); break
    case 'upsertCusto': await svc.upsertCusto(operation.payload as Parameters<GestaoFinanceiraService['upsertCusto']>[0]); break
    case 'upsertCultura': await svc.upsertCultura(operation.payload as Parameters<GestaoFinanceiraService['upsertCultura']>[0]); break
    case 'upsertAtivoOutro': await svcV2.upsertAtivoOutro(operation.payload as Parameters<GestaoFinanceiraServiceV2['upsertAtivoOutro']>[0]); break
    case 'upsertPassivoOutro': await svcV2.upsertPassivoOutro(operation.payload as Parameters<GestaoFinanceiraServiceV2['upsertPassivoOutro']>[0]); break
    case 'upsertGarantia': await svcV2.upsertGarantia(operation.payload as Parameters<GestaoFinanceiraServiceV2['upsertGarantia']>[0]); break
    case 'upsertPremissa': await svcV2.upsertPremissa(operation.payload as Parameters<GestaoFinanceiraServiceV2['upsertPremissa']>[0]); break
  }
}

export async function importarDeXlsm(input: ImportXlsmInput): Promise<ImportXlsmResult> {
  if (!isPgEnabled()) throw new XlsmImportValidationError('PostgreSQL precisa estar habilitado para uma importação atômica')
  const previousGroup = await getGestaoFinanceiraService().obterGrupo(input.grupoId)
  if (!previousGroup) throw new XlsmImportValidationError(`Grupo ${input.grupoId} não encontrado`)
  // Toda leitura e validação antecede a primeira escrita, inclusive no modo substituir.
  const plan = await prepareXlsmImport(input, previousGroup)
  const result = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`gf-xlsm-import:${input.grupoId}`}))`)
    const [current] = await tx.select().from(gfGrupo).where(eq(gfGrupo.id, input.grupoId)).limit(1).for('update')
    if (!current || current.clienteId !== previousGroup.clienteId) throw new XlsmImportValidationError('O grupo foi alterado durante a preparação; confira e tente novamente')
    const svc = new GestaoFinanceiraService(tx)
    const svcV2 = new GestaoFinanceiraServiceV2(tx)
    const changelog = new ChangelogService({ db: tx, strict: true, publishEvents: false, origem: 'import' })
    if (input.replaceExisting) await clearGroupForImport(tx, input.grupoId, changelog)
    if (plan.groupPatch) await svc.atualizarGrupo(input.grupoId, plan.groupPatch)
    for (const operation of plan.operations) await applyImportOperation(operation, svc, svcV2)
    const grupo = await svc.obterGrupo(input.grupoId)
    if (!grupo) throw new Error('Grupo indisponível após a importação')
    await changelog.registrar({
      grupoId: input.grupoId, entidade: 'importacao_xlsm', entidadeId: plan.sourceSha256, acao: 'create',
      depois: { sourceSha256: plan.sourceSha256, replaceExisting: input.replaceExisting === true, imported: plan.imported, coverage: plan.coverage, groupBefore: current, groupAfter: grupo },
    })
    return { grupo, imported: plan.imported, coverage: plan.coverage, warnings: plan.warnings }
  }, { isolationLevel: 'serializable' })
  // A equipe recebe o evento somente depois da confirmação do commit.
  try { publish('changelog', input.grupoId, { entidade: 'importacao_xlsm', acao: 'create', origem: 'import', imported: result.imported }) } catch {}
  return result
}

async function collectImportPlan(input: ImportXlsmInput, wb: ExcelJS.Workbook, values: XlsmValueReader, grupo: GfGrupo): Promise<XlsmImportPlan> {
  const versao = input.versao ?? 'v2'
  const operations: ImportOperation[] = []
  let groupPatch: XlsmImportPlan['groupPatch']
  const recordBase = (method: BaseImportMethod) => async (payload: Record<string, unknown>) => { operations.push({ service: 'base', method, payload }) }
  const recordV2 = (method: V2ImportMethod) => async (payload: Record<string, unknown>) => { operations.push({ service: 'v2', method, payload }) }
  const svc = {
    atualizarGrupo: async (_id: string, patch: XlsmImportPlan['groupPatch']) => { groupPatch = patch },
    upsertMembro: recordBase('upsertMembro'), upsertDemanda: recordBase('upsertDemanda'), upsertContrato: recordBase('upsertContrato'),
    upsertFazenda: recordBase('upsertFazenda'), upsertCusto: recordBase('upsertCusto'), upsertCultura: recordBase('upsertCultura'),
  }
  const svcV2 = { upsertAtivoOutro: recordV2('upsertAtivoOutro'), upsertPassivoOutro: recordV2('upsertPassivoOutro'), upsertGarantia: recordV2('upsertGarantia'), upsertPremissa: recordV2('upsertPremissa') }
  const sheetCadastro = versao === 'v2' ? '3 - Cadastro' : 'Cadastro'
  const sheetDemandas = versao === 'v2' ? '5 - Demandas' : 'Crédito'
  const sheetEndividamento = versao === 'v2' ? '10 - Endividamento' : 'Endividamento'
  const sheetAtivos = versao === 'v2' ? '8 - Ativos' : 'Ativos'
  const sheetSafra = versao === 'v2' ? '7 - Safra' : 'Safra'
  const sheetCustos = versao === 'v2' ? '6 - Custos do Cliente' : 'Custos do Cliente'

  const warnings: string[] = []
  const sheetsRead: string[] = []
  const sheetsMissing: string[] = []
  const imported = {
    membros: 0,
    culturas: 0,
    contratos: 0,
    custos: 0,
    fazendas: 0,
    demandas: 0,
    ativosOutros: 0,
    passivosOutros: 0,
    garantias: 0,
    premissas: 0,
  }

  // ── Membros (3 - Cadastro)
  const wsCad = sheetOrWarn(wb, sheetCadastro, warnings, sheetsRead, sheetsMissing)
  if (wsCad) {
    const dataBase = values.date(wsCad.getCell('D15'))
    const nomeGrupo = values.text(wsCad.getCell('D17'))
    const historico = values.text(wsCad.getCell('C35')) ?? values.text(wsCad.getCell('D35'))
    if (dataBase || nomeGrupo || historico) {
      await svc.atualizarGrupo(input.grupoId, {
        ...(dataBase ? { dataBase } : {}),
        ...(nomeGrupo ? { nomeGrupo } : {}),
        ...(historico ? { historico } : {}),
      })
    }
    const startRow = versao === 'v2' ? 21 : 19
    for (let r = startRow; r < startRow + 12; r++) {
      const nome = values.text(wsCad.getCell(`C${r}`))
      if (!nome) continue
      const cpfCnpj = values.text(wsCad.getCell(`D${r}`))
      const tipoRelacao = values.text(wsCad.getCell(`E${r}`))
      try {
        await svc.upsertMembro({
          grupoId: input.grupoId,
          nome,
          cpfCnpj: cpfCnpj ?? undefined,
          tipoRelacao: tipoRelacao ?? undefined,
          atuaAtividade: values.boolean(wsCad.getCell(`F${r}`)) ?? false,
          ordem: r - startRow,
        })
        imported.membros++
      } catch (e: any) {
        throw new XlsmImportValidationError(`Membro linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
  }

  // ── Demandas
  const wsDem = sheetOrWarn(wb, sheetDemandas, warnings, sheetsRead, sheetsMissing)
  if (wsDem) {
    for (let r = 19; r <= Math.max(32, wsDem.rowCount); r++) {
      const credor = values.text(wsDem.getCell(`F${r}`))
      const finalidade = values.text(wsDem.getCell(`G${r}`))
      const valor = values.decimal(wsDem.getCell(`I${r}`))
      if (!credor && !finalidade && (valor === null || valor === '0')) continue
      try {
        await svc.upsertDemanda({
          grupoId: input.grupoId,
          numero: values.integer(wsDem.getCell(`C${r}`)) ?? undefined,
          data: values.date(wsDem.getCell(`D${r}`)) ?? undefined,
          tomador: values.text(wsDem.getCell(`E${r}`)) ?? undefined,
          credor: credor ?? undefined,
          finalidade: finalidade ?? undefined,
          modalidade: values.text(wsDem.getCell(`H${r}`)) ?? undefined,
          valor: valor !== null ? String(valor) as any : undefined,
          garantias: values.text(wsDem.getCell(`J${r}`)) ?? undefined,
          prazo: values.text(wsDem.getCell(`K${r}`)) ?? undefined,
          parecerTex: values.text(wsDem.getCell(`L${r}`)) ?? undefined,
          status: values.text(wsDem.getCell(`Q${r}`)) ?? 'em_analise',
        })
        imported.demandas++
      } catch (e: any) {
        throw new XlsmImportValidationError(`Demanda linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
  }

  // ── Endividamento (linhas 23-92, ~70 contratos)
  const wsEnd = sheetOrWarn(wb, sheetEndividamento, warnings, sheetsRead, sheetsMissing)
  if (wsEnd) {
    for (let r = 23; r <= 92; r++) {
      const credor = values.text(wsEnd.getCell(`C${r}`))
      if (!credor) continue
      const valorFin = values.decimal(wsEnd.getCell(`I${r}`))
      if (valorFin === null) throw new XlsmImportValidationError(`${wsEnd.name}!I${r}: valor financiado obrigatório; ausência não equivale a zero`)
      try {
        await svc.upsertContrato({
          grupoId: input.grupoId,
          credor,
          emitente: values.text(wsEnd.getCell(`D${r}`)) ?? undefined,
          garantiaVinculada: values.text(wsEnd.getCell(`E${r}`)) ?? undefined,
          outrasGarantias: values.text(wsEnd.getCell(`F${r}`)) ?? undefined,
          contrato: values.text(wsEnd.getCell(`G${r}`)) ?? undefined,
          valorLiberado: values.decimal(wsEnd.getCell(`H${r}`)) !== null ? String(values.decimal(wsEnd.getCell(`H${r}`))) as any : undefined,
          valorFinanciado: String(valorFin) as any,
          parcelaCapitalAmortizar: values.decimal(wsEnd.getCell(`L${r}`)) !== null ? String(values.decimal(wsEnd.getCell(`L${r}`))) as any : undefined,
          valorParcelaFixa: values.decimal(wsEnd.getCell(`M${r}`)) !== null ? String(values.decimal(wsEnd.getCell(`M${r}`))) as any : undefined,
          periodicidade: values.text(wsEnd.getCell(`N${r}`)) ?? undefined,
          metodoCalculo: (values.text(wsEnd.getCell(`O${r}`)) ?? 'PRICE').toUpperCase(),
          enquadramento: values.text(wsEnd.getCell(`P${r}`)) ?? undefined,
          finalidade: values.text(wsEnd.getCell(`Q${r}`)) ?? undefined,
          prazoParcelas: values.integer(wsEnd.getCell(`R${r}`)) ?? undefined,
          dataContratacao: values.date(wsEnd.getCell(`S${r}`)) ?? undefined,
          primeiraParcela: values.date(wsEnd.getCell(`T${r}`)) ?? undefined,
          ultimaParcela: values.date(wsEnd.getCell(`U${r}`)) ?? undefined,
          parcelasPagas: values.integer(wsEnd.getCell(`V${r}`)) ?? 0,
          inadimplente: values.boolean(wsEnd.getCell(`W${r}`)) ?? false,
          taxaNominalAa: values.decimal(wsEnd.getCell(`X${r}`)) !== null ? String(values.decimal(wsEnd.getCell(`X${r}`))) as any : undefined,
          cetAnual: values.decimal(wsEnd.getCell(`AF${r}`)) !== null ? String(values.decimal(wsEnd.getCell(`AF${r}`))) as any : undefined,
          indexador: values.text(wsEnd.getCell(`AB${r}`)) ?? undefined,
          pctIndexador: values.decimal(wsEnd.getCell(`AC${r}`)) !== null ? String(values.decimal(wsEnd.getCell(`AC${r}`))) as any : undefined,
          variacaoCambial: values.boolean(wsEnd.getCell(`AG${r}`)) ?? false,
          origemInfo: values.text(wsEnd.getCell(`AH${r}`)) ?? undefined,
          ultimaAtualizacao: values.date(wsEnd.getCell(`AI${r}`)) ?? undefined,
          valorPresente: values.decimal(wsEnd.getCell(`AJ${r}`)) !== null ? String(values.decimal(wsEnd.getCell(`AJ${r}`))) as any : undefined,
          valorPresenteAtualizado: values.decimal(wsEnd.getCell(`AK${r}`)) !== null ? String(values.decimal(wsEnd.getCell(`AK${r}`))) as any : undefined,
        })
        imported.contratos++
      } catch (e: any) {
        throw new XlsmImportValidationError(`Contrato linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
  }

  // ── Fazendas (8 - Ativos, linha 30+ na v2)
  const wsAt = sheetOrWarn(wb, sheetAtivos, warnings, sheetsRead, sheetsMissing)
  if (wsAt) {
    const startRow = versao === 'v2' ? 30 : 25
    for (let r = startRow; r <= startRow + 67; r++) {
      const fazenda = values.text(wsAt.getCell(`C${r}`))
      if (!fazenda) continue
      try {
        await svc.upsertFazenda({
          grupoId: input.grupoId,
          fazenda,
          proprietario: values.text(wsAt.getCell(`D${r}`)) ?? undefined,
          matricula: values.text(wsAt.getCell(`E${r}`)) ?? undefined,
          cidade: values.text(wsAt.getCell(`F${r}`)) ?? undefined,
          estado: values.text(wsAt.getCell(`G${r}`)) ?? undefined,
          areaTotalHa: values.decimal(wsAt.getCell(`H${r}`)) !== null ? String(values.decimal(wsAt.getCell(`H${r}`))) as any : undefined,
          areaConsolidadaHa: values.optionalDecimal(wsAt.getCell(`I${r}`)),
          areaPlantioHa: values.decimal(wsAt.getCell(`J${r}`)) !== null ? String(values.decimal(wsAt.getCell(`J${r}`))) as any : undefined,
          areaIrrigadaHa: values.optionalDecimal(wsAt.getCell(`K${r}`)),
          areaPastagemHa: values.optionalDecimal(wsAt.getCell(`L${r}`)),
          areaReservaHa: values.optionalDecimal(wsAt.getCell(`M${r}`)),
          outrosUsosHa: values.optionalDecimal(wsAt.getCell(`N${r}`)),
          arrendadaTerceirosHa: values.optionalDecimal(wsAt.getCell(`O${r}`)),
          valorHaMercado: values.decimal(wsAt.getCell(`V${r}`)) !== null ? String(values.decimal(wsAt.getCell(`V${r}`))) as any : undefined,
          valorHaForcado: values.decimal(wsAt.getCell(`X${r}`)) !== null ? String(values.decimal(wsAt.getCell(`X${r}`))) as any : undefined,
          nrCcir: values.text(wsAt.getCell(`Z${r}`)) ?? undefined,
          nrItr: values.text(wsAt.getCell(`AA${r}`)) ?? undefined,
          inscricaoEstadual: values.text(wsAt.getCell(`AB${r}`)) ?? undefined,
          nrCar: values.text(wsAt.getCell(`AC${r}`)) ?? undefined,
          possuiGeo: values.boolean(wsAt.getCell(`AD${r}`)) ?? false,
          observacoes: values.text(wsAt.getCell(`AE${r}`)) ?? undefined,
        })
        imported.fazendas++
      } catch (e: any) {
        throw new XlsmImportValidationError(`Fazenda linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }

    // Estoques e recebíveis da mesma aba viram ativos extras.
    for (let r = startRow; r <= startRow + 67; r++) {
      const produtoEstoque = values.text(wsAt.getCell(`AG${r}`))
      const valorEstoque = values.decimal(wsAt.getCell(`AL${r}`))
      if (produtoEstoque || (valorEstoque !== null && valorEstoque !== '0')) {
        try {
          await svcV2.upsertAtivoOutro({
            grupoId: input.grupoId,
            tipo: 'produto',
            descricao: produtoEstoque ?? `Estoque linha ${r}`,
            produto: produtoEstoque ?? undefined,
            estadoUf: values.text(wsAt.getCell(`AH${r}`)) ?? undefined,
            safra: values.text(wsAt.getCell(`AI${r}`)) ?? undefined,
            unidade: values.text(wsAt.getCell(`AJ${r}`)) ?? undefined,
            quantidade: values.optionalDecimal(wsAt.getCell(`AK${r}`)),
            valorTotal: valorEstoque !== null ? String(valorEstoque) as any : undefined,
            vaiParaFc: values.boolean(wsAt.getCell(`AM${r}`)) ?? true,
            observacoes: values.text(wsAt.getCell(`AN${r}`)) ?? undefined,
          })
          imported.ativosOutros++
        } catch (e: any) {
          throw new XlsmImportValidationError(`Ativo estoque linha ${r}: ${e?.message ?? 'erro'}`)
        }
      }

      const comprador = values.text(wsAt.getCell(`AP${r}`))
      const valorReceber = values.decimal(wsAt.getCell(`AY${r}`))
      if (comprador || (valorReceber !== null && valorReceber !== '0')) {
        try {
          await svcV2.upsertAtivoOutro({
            grupoId: input.grupoId,
            tipo: 'contrato',
            descricao: comprador ? `Recebível ${comprador}` : `Recebível linha ${r}`,
            produto: values.text(wsAt.getCell(`AR${r}`)) ?? undefined,
            estadoUf: values.text(wsAt.getCell(`AS${r}`)) ?? undefined,
            safra: values.text(wsAt.getCell(`AT${r}`)) ?? undefined,
            quantidade: values.optionalDecimal(wsAt.getCell(`AV${r}`)),
            precoUnitario: values.optionalDecimal(wsAt.getCell(`AW${r}`)),
            valorTotal: valorReceber !== null ? String(valorReceber) as any : undefined,
            dataRecebimento: values.date(wsAt.getCell(`AQ${r}`)) ?? undefined,
            vaiParaFc: values.boolean(wsAt.getCell(`AX${r}`)) ?? true,
            observacoes: [comprador, values.text(wsAt.getCell(`AU${r}`))].filter(Boolean).join(' | ') || undefined,
          })
          imported.ativosOutros++
        } catch (e: any) {
          throw new XlsmImportValidationError(`Ativo recebível linha ${r}: ${e?.message ?? 'erro'}`)
        }
      }
    }
  }

  // ── Custos (6 - Custos: bloco demais custos linha 75+, fixos 100+)
  const wsCu = sheetOrWarn(wb, sheetCustos, warnings, sheetsRead, sheetsMissing)
  if (wsCu) {
    const safraCustos = values.text(wsCu.getCell('D13'))
    const culturaCols = ['E', 'F', 'G', 'H', 'I']
    for (const col of culturaCols) {
      const cultura = values.text(wsCu.getCell(`${col}20`))
      if (!cultura || /^cultura$/i.test(cultura)) continue
      for (let r = 21; r <= 69; r++) {
        const desc = values.text(wsCu.getCell(`D${r}`))
        const valor = values.decimal(wsCu.getCell(`${col}${r}`))
        if (!desc || valor === null) continue
        try {
          if (!safraCustos) throw new XlsmImportValidationError(`${wsCu.name}!D13: safra dos custos não informada`)
          await svc.upsertCusto({
            grupoId: input.grupoId,
            safra: safraCustos,
            tipo: r >= 68 ? 'operacional_variavel' : 'insumo_unitario',
            descricao: desc,
            cultura,
            valorAnual: String(valor) as any,
            ordem: r,
          })
          imported.custos++
        } catch (e: any) {
          throw new XlsmImportValidationError(`Custo ${cultura} ${desc}: ${e?.message ?? 'erro'}`)
        }
      }
    }

    // operacionais
    for (let r = 75; r <= 96; r++) {
      const desc = values.text(wsCu.getCell(`D${r}`))
      const valor = values.decimal(wsCu.getCell(`E${r}`))
      if (valor === null || (!desc && valor === '0')) continue
      try {
        if (!safraCustos) throw new XlsmImportValidationError(`${wsCu.name}!D13: safra dos custos não informada`)
          await svc.upsertCusto({
          grupoId: input.grupoId,
          safra: safraCustos,
          tipo: 'operacional',
          descricao: desc ?? `Custo operacional linha ${r}`,
          valorAnual: String(valor) as any,
          valorMensal: importAnnualToMonthly(valor) as any,
          ordem: r,
        })
        imported.custos++
      } catch (e: any) {
        throw new XlsmImportValidationError(`Custo op linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
    // fixos
    for (let r = 100; r <= 120; r++) {
      const desc = values.text(wsCu.getCell(`D${r}`))
      const valor = values.decimal(wsCu.getCell(`E${r}`))
      if (valor === null || (!desc && valor === '0')) continue
      try {
        if (!safraCustos) throw new XlsmImportValidationError(`${wsCu.name}!D13: safra dos custos não informada`)
          await svc.upsertCusto({
          grupoId: input.grupoId,
          safra: safraCustos,
          tipo: 'fixo',
          descricao: desc ?? `Custo fixo linha ${r}`,
          valorAnual: String(valor) as any,
          valorMensal: importAnnualToMonthly(valor) as any,
          ordem: r,
        })
        imported.custos++
      } catch (e: any) {
        throw new XlsmImportValidationError(`Custo fix linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
  }

  // ── Safras (bloco por cultura detectado pelo rótulo NOME DA CULTURA)
  const wsSf = sheetOrWarn(wb, sheetSafra, warnings, sheetsRead, sheetsMissing)
  if (wsSf) {
    const blockStarts: number[] = []
    for (let r = 1; r <= wsSf.rowCount; r++) {
      if ((values.text(wsSf.getCell(`D${r}`)) ?? '').toUpperCase().includes('NOME DA CULTURA')) blockStarts.push(r)
    }
    for (const [i, blockStart] of blockStarts.entries()) {
      const culturaName = values.text(wsSf.getCell(`E${blockStart}`))
      if (!culturaName) continue
      const colMap = ['E', 'F', 'G', 'H', 'I']
      for (let cIdx = 0; cIdx < 5; cIdx++) {
        const col = colMap[cIdx]
        const safra = values.text(wsSf.getCell(`${col}${blockStart + 1}`))
        if (!safra) continue
        const areaPropria = values.decimal(wsSf.getCell(`${col}${blockStart + 4}`))
        const areaArrend = values.decimal(wsSf.getCell(`${col}${blockStart + 5}`))
        const rendimento = values.decimal(wsSf.getCell(`${col}${blockStart + 6}`))
        const preco = values.decimal(wsSf.getCell(`${col}${blockStart + 8}`))
        const custo = values.decimal(wsSf.getCell(`${col}${blockStart + 9}`))
        const arrendBase = values.decimal(wsSf.getCell(`${col}${blockStart + 10}`))
        if (areaPropria === null && areaArrend === null && rendimento === null) continue
        try {
          await svc.upsertCultura({
            grupoId: input.grupoId,
            cultura: culturaName,
            safra,
            cenario: cIdx === 0 ? 'realizado' : cIdx === 1 ? 'planejado' : 'futura',
            areaPropriaHa: areaPropria !== null ? String(areaPropria) as any : undefined,
            areaArrendadaHa: areaArrend !== null ? String(areaArrend) as any : undefined,
            rendimentoScHa: rendimento !== null ? String(rendimento) as any : undefined,
            precoMedioRs: preco !== null ? String(preco) as any : undefined,
            custoUnitarioInsumosRs: custo !== null ? String(custo) as any : undefined,
            arrendamentoBaseScHa: arrendBase !== null ? String(arrendBase) as any : undefined,
            ordem: i,
          })
          imported.culturas++
        } catch (e: any) {
          throw new XlsmImportValidationError(`Cultura ${culturaName} ${safra}: ${e?.message ?? 'erro'}`)
        }
      }
    }
  }

  // ── Passivos não bancários: fornecedores, pró-labore/dividendos, arrendamentos
  const wsPass = sheetOrWarn(wb, '11 - Passivos', warnings, sheetsRead, sheetsMissing)
  if (wsPass) {
    for (let r = 22; r <= 85; r++) {
      const fornecedor = values.text(wsPass.getCell(`AM${r}`))
      const saldoFornecedor = values.decimal(wsPass.getCell(`AQ${r}`))
      if (fornecedor || (saldoFornecedor !== null && saldoFornecedor !== '0')) {
        try {
          await svcV2.upsertPassivoOutro({
            grupoId: input.grupoId,
            tipo: 'fornecedor',
            credor: fornecedor ?? undefined,
            descricao: fornecedor ? `Fornecedor ${fornecedor}` : `Fornecedor linha ${r}`,
            finalidade: values.text(wsPass.getCell(`AO${r}`)) ?? undefined,
            valor: values.requiredDecimal(wsPass.getCell(`AQ${r}`)),
            vencimento: values.date(wsPass.getCell(`AP${r}`)) ?? undefined,
            status: 'a_vencer',
            observacoes: values.text(wsPass.getCell(`AN${r}`)) ?? undefined,
          })
          imported.passivosOutros++
        } catch (e: any) {
          throw new XlsmImportValidationError(`Passivo fornecedor linha ${r}: ${e?.message ?? 'erro'}`)
        }
      }

      const dividendos = values.decimal(wsPass.getCell(`AS${r}`))
      const proLabore = values.decimal(wsPass.getCell(`AT${r}`))
      for (const [tipo, valor] of [['dividendos', dividendos], ['pro_labore', proLabore]] as const) {
        if (valor === null || valor === '0') continue
        try {
          await svcV2.upsertPassivoOutro({
            grupoId: input.grupoId,
            tipo,
            descricao: `${tipo === 'dividendos' ? 'Dividendos' : 'Pró-labore'} linha ${r}`,
            valor: String(valor) as any,
            status: 'a_vencer',
          })
          imported.passivosOutros++
        } catch (e: any) {
          throw new XlsmImportValidationError(`Passivo ${tipo} linha ${r}: ${e?.message ?? 'erro'}`)
        }
      }

      const fazendaArrendada = values.text(wsPass.getCell(`AV${r}`))
      const areaArrendada = values.decimal(wsPass.getCell(`BF${r}`))
      if (fazendaArrendada || (areaArrendada !== null && areaArrendada !== '0')) {
        if (input.replaceExisting) throw new XlsmImportValidationError(`Substituição bloqueada: ${wsPass.name}!AV${r} contém arrendamento sem valor monetário mapeado. Os passivos existentes foram preservados; revise a fonte ou acrescente os demais dados sem substituir.`)
        warnings.push(`Arrendamento ${wsPass.name}!AV${r}: área/descrição identificada, mas sem valor monetário mapeado; nenhum passivo de valor zero foi criado.`)
      }
    }
  }

  // ── Garantias: imóveis vinculados e contratos associados
  const wsGar = sheetOrWarn(wb, '14 - Garantias', warnings, sheetsRead, sheetsMissing)
  if (wsGar) {
    for (let r = 22; r <= 85; r++) {
      const matricula = values.text(wsGar.getCell(`C${r}`))
      const fazenda = values.text(wsGar.getCell(`D${r}`))
      const valorMercado = values.decimal(wsGar.getCell(`H${r}`))
      const contrato = values.text(wsGar.getCell(`P${r}`))
      if (!matricula && !fazenda && valorMercado === null && !contrato) continue
      try {
        await svcV2.upsertGarantia({
          grupoId: input.grupoId,
          tipo: 'imovel_rural',
          descricao: fazenda ?? matricula ?? `Garantia linha ${r}`,
          matricula: matricula ?? undefined,
          areaHa: values.optionalDecimal(wsGar.getCell(`F${r}`)),
          valorMercado: valorMercado !== null ? String(valorMercado) as any : undefined,
          valorForcado: values.optionalDecimal(wsGar.getCell(`I${r}`)),
          contratoVinculado: contrato ?? undefined,
          registrosAverbacoes: values.text(wsGar.getCell(`T${r}`)) ?? undefined,
          baixasAditivos: values.text(wsGar.getCell(`U${r}`)) ?? undefined,
          observacoes: [
            values.text(wsGar.getCell(`E${r}`)),
            values.text(wsGar.getCell(`G${r}`)),
            values.text(wsGar.getCell(`N${r}`)),
            values.text(wsGar.getCell(`V${r}`)),
          ].filter(Boolean).join(' | ') || undefined,
        })
        imported.garantias++
      } catch (e: any) {
        throw new XlsmImportValidationError(`Garantia linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
  }

  // ── Premissas: captura células numéricas rotuladas nas abas de suporte
  for (const premSheet of ['10.1 - Premissas Endividamento', '13 - PREMISSAS(PADRONIZAR)', '15 - Premissas e Suporte']) {
    const wsPrem = sheetOrWarn(wb, premSheet, warnings, sheetsRead, sheetsMissing)
    if (!wsPrem) continue
    for (let r = 1; r <= wsPrem.rowCount; r++) {
      for (let c = 2; c <= Math.min(wsPrem.columnCount, 20); c++) {
        const rotulo = values.text(wsPrem.getRow(r).getCell(c - 1))
        if (!rotulo || /^total$/i.test(rotulo) || rotulo.length > 80) continue
        // No modo substituir, uma premissa rotulada com cache defeituoso não
        // pode simplesmente sumir do plano enquanto a versão anterior é apagada.
        if (input.replaceExisting) values.validateCachedValue(wsPrem.getRow(r).getCell(c))
        if (!values.numericCandidate(wsPrem.getRow(r).getCell(c))) continue
        const valor = values.decimal(wsPrem.getRow(r).getCell(c))
        if (valor === null) continue
        try {
          await svcV2.upsertPremissa({
            grupoId: input.grupoId,
            chave: normalizeKey(`${premSheet}_${rotulo}_${r}_${c}`),
            rotulo,
            valor: String(valor),
            fonte: premSheet,
            observacoes: `${wsPrem.name}!${wsPrem.getRow(r).getCell(c).address}`,
          })
          imported.premissas++
        } catch (e: any) {
          throw new XlsmImportValidationError(`Premissa ${premSheet}!${r}:${c}: ${e?.message ?? 'erro'}`)
        }
      }
    }
  }

  if (operations.length === 0) throw new XlsmImportValidationError('A planilha não contém linhas compatíveis para importar; nenhum dado foi alterado')
  if (operations.length > 5000) throw new XlsmImportValidationError('A planilha excede 5.000 registros por importação')

  return {
    operations,
    groupPatch,
    sourceSha256: createHash('sha256').update(input.buffer).digest('hex'),
    imported,
    coverage: {
      workbookSheets: wb.worksheets.length,
      sheetsRead: Array.from(new Set(sheetsRead)),
      sheetsMissing: Array.from(new Set(sheetsMissing)),
      formulasDetected: detectWorkbookFormulas(wb),
      macrosDetected: hasVbaProject(input.buffer),
    },
    warnings,
  }
}

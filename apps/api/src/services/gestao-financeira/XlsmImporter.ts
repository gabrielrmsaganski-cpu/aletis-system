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
import { getGestaoFinanceiraService } from './GestaoFinanceiraService.js'
import type { GfGrupo } from '../../db/schema.js'

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
  }
  warnings: string[]
}

function asString(v: any): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && v.text) return String(v.text).trim() || null
  if (typeof v === 'object' && v.result !== undefined) return String(v.result).trim() || null
  if (typeof v === 'object' && v.richText) {
    return v.richText.map((rt: any) => rt.text).join('').trim() || null
  }
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function asNumber(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'object' && v.result !== undefined) return asNumber(v.result)
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : null
}

function asDateISO(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = asString(v)
  if (!s) return null
  // tenta DD/MM/YYYY
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  // ISO
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return s.slice(0, 10)
  return null
}

export async function importarDeXlsm(input: ImportXlsmInput): Promise<ImportXlsmResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(input.buffer as unknown as ArrayBuffer)
  const versao = input.versao ?? 'v2'

  const svc = getGestaoFinanceiraService()
  const grupo = await svc.obterGrupo(input.grupoId)
  if (!grupo) throw new Error(`Grupo ${input.grupoId} não encontrado`)

  const sheetCadastro = versao === 'v2' ? '3 - Cadastro' : 'Cadastro'
  const sheetDemandas = versao === 'v2' ? '5 - Demandas' : 'Crédito'
  const sheetEndividamento = versao === 'v2' ? '10 - Endividamento' : 'Endividamento'
  const sheetAtivos = versao === 'v2' ? '8 - Ativos' : 'Ativos'
  const sheetSafra = versao === 'v2' ? '7 - Safra' : 'Safra'
  const sheetCustos = versao === 'v2' ? '6 - Custos do Cliente' : 'Custos do Cliente'

  const warnings: string[] = []
  const imported = { membros: 0, culturas: 0, contratos: 0, custos: 0, fazendas: 0, demandas: 0 }

  // ── Membros (3 - Cadastro)
  const wsCad = wb.getWorksheet(sheetCadastro)
  if (wsCad) {
    const startRow = versao === 'v2' ? 21 : 19
    for (let r = startRow; r < startRow + 12; r++) {
      const nome = asString(wsCad.getCell(`C${r}`).value)
      if (!nome) continue
      const cpfCnpj = asString(wsCad.getCell(`D${r}`).value)
      const tipoRelacao = asString(wsCad.getCell(`E${r}`).value)
      const atuaText = asString(wsCad.getCell(`F${r}`).value)
      try {
        await svc.upsertMembro({
          grupoId: input.grupoId,
          nome,
          cpfCnpj: cpfCnpj ?? undefined,
          tipoRelacao: tipoRelacao ?? undefined,
          atuaAtividade: !!atuaText && /sim|s|true|1/i.test(atuaText),
          ordem: r - startRow,
        })
        imported.membros++
      } catch (e: any) {
        warnings.push(`Membro linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
  } else {
    warnings.push(`Sheet "${sheetCadastro}" não encontrada`)
  }

  // ── Demandas
  const wsDem = wb.getWorksheet(sheetDemandas)
  if (wsDem) {
    for (let r = 19; r < 25; r++) {
      const credor = asString(wsDem.getCell(`F${r}`).value)
      const finalidade = asString(wsDem.getCell(`G${r}`).value)
      const valor = asNumber(wsDem.getCell(`I${r}`).value)
      if (!credor && !finalidade && !valor) continue
      try {
        await svc.upsertDemanda({
          grupoId: input.grupoId,
          numero: asNumber(wsDem.getCell(`C${r}`).value) ?? undefined,
          data: asDateISO(wsDem.getCell(`D${r}`).value) ?? undefined,
          tomador: asString(wsDem.getCell(`E${r}`).value) ?? undefined,
          credor: credor ?? undefined,
          finalidade: finalidade ?? undefined,
          modalidade: asString(wsDem.getCell(`H${r}`).value) ?? undefined,
          valor: valor !== null ? String(valor) as any : undefined,
          garantias: asString(wsDem.getCell(`J${r}`).value) ?? undefined,
          prazo: asString(wsDem.getCell(`K${r}`).value) ?? undefined,
          parecerTex: asString(wsDem.getCell(`L${r}`).value) ?? undefined,
          status: asString(wsDem.getCell(`Q${r}`).value) ?? 'em_analise',
        })
        imported.demandas++
      } catch (e: any) {
        warnings.push(`Demanda linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
  }

  // ── Endividamento (linhas 23-92, ~70 contratos)
  const wsEnd = wb.getWorksheet(sheetEndividamento)
  if (wsEnd) {
    for (let r = 23; r <= 92; r++) {
      const credor = asString(wsEnd.getCell(`C${r}`).value)
      const valorFin = asNumber(wsEnd.getCell(`I${r}`).value)
      if (!credor || !valorFin) continue
      try {
        await svc.upsertContrato({
          grupoId: input.grupoId,
          credor,
          emitente: asString(wsEnd.getCell(`D${r}`).value) ?? undefined,
          garantiaVinculada: asString(wsEnd.getCell(`E${r}`).value) ?? undefined,
          contrato: asString(wsEnd.getCell(`G${r}`).value) ?? undefined,
          valorLiberado: asNumber(wsEnd.getCell(`H${r}`).value) !== null ? String(asNumber(wsEnd.getCell(`H${r}`).value)) as any : undefined,
          valorFinanciado: String(valorFin) as any,
          parcelaCapitalAmortizar: asNumber(wsEnd.getCell(`L${r}`).value) !== null ? String(asNumber(wsEnd.getCell(`L${r}`).value)) as any : undefined,
          valorParcelaFixa: asNumber(wsEnd.getCell(`M${r}`).value) !== null ? String(asNumber(wsEnd.getCell(`M${r}`).value)) as any : undefined,
          periodicidade: asString(wsEnd.getCell(`N${r}`).value) ?? undefined,
          metodoCalculo: (asString(wsEnd.getCell(`O${r}`).value) ?? 'PRICE').toUpperCase(),
          enquadramento: asString(wsEnd.getCell(`P${r}`).value) ?? undefined,
          finalidade: asString(wsEnd.getCell(`Q${r}`).value) ?? undefined,
          prazoParcelas: asNumber(wsEnd.getCell(`R${r}`).value) ?? undefined,
          dataContratacao: asDateISO(wsEnd.getCell(`S${r}`).value) ?? undefined,
          primeiraParcela: asDateISO(wsEnd.getCell(`T${r}`).value) ?? undefined,
          ultimaParcela: asDateISO(wsEnd.getCell(`U${r}`).value) ?? undefined,
          parcelasPagas: asNumber(wsEnd.getCell(`V${r}`).value) ?? 0,
          taxaNominalAa: asNumber(wsEnd.getCell(`X${r}`).value) !== null ? String(asNumber(wsEnd.getCell(`X${r}`).value)) as any : undefined,
          cetAnual: asNumber(wsEnd.getCell(`AF${r}`).value) !== null ? String(asNumber(wsEnd.getCell(`AF${r}`).value)) as any : undefined,
          indexador: asString(wsEnd.getCell(`AB${r}`).value) ?? undefined,
          valorPresente: asNumber(wsEnd.getCell(`AJ${r}`).value) !== null ? String(asNumber(wsEnd.getCell(`AJ${r}`).value)) as any : undefined,
          valorPresenteAtualizado: asNumber(wsEnd.getCell(`AK${r}`).value) !== null ? String(asNumber(wsEnd.getCell(`AK${r}`).value)) as any : undefined,
        })
        imported.contratos++
      } catch (e: any) {
        warnings.push(`Contrato linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
  }

  // ── Fazendas (8 - Ativos, linha 30+ na v2)
  const wsAt = wb.getWorksheet(sheetAtivos)
  if (wsAt) {
    const startRow = versao === 'v2' ? 30 : 25
    for (let r = startRow; r <= startRow + 67; r++) {
      const fazenda = asString(wsAt.getCell(`C${r}`).value)
      if (!fazenda) continue
      try {
        await svc.upsertFazenda({
          grupoId: input.grupoId,
          fazenda,
          proprietario: asString(wsAt.getCell(`D${r}`).value) ?? undefined,
          matricula: asString(wsAt.getCell(`E${r}`).value) ?? undefined,
          cidade: asString(wsAt.getCell(`F${r}`).value) ?? undefined,
          estado: asString(wsAt.getCell(`G${r}`).value) ?? undefined,
          areaTotalHa: asNumber(wsAt.getCell(`H${r}`).value) !== null ? String(asNumber(wsAt.getCell(`H${r}`).value)) as any : undefined,
          areaPlantioHa: asNumber(wsAt.getCell(`J${r}`).value) !== null ? String(asNumber(wsAt.getCell(`J${r}`).value)) as any : undefined,
          valorHaMercado: asNumber(wsAt.getCell(`V${r}`).value) !== null ? String(asNumber(wsAt.getCell(`V${r}`).value)) as any : undefined,
          valorHaForcado: asNumber(wsAt.getCell(`X${r}`).value) !== null ? String(asNumber(wsAt.getCell(`X${r}`).value)) as any : undefined,
          nrCcir: asString(wsAt.getCell(`Z${r}`).value) ?? undefined,
          nrItr: asString(wsAt.getCell(`AA${r}`).value) ?? undefined,
          nrCar: asString(wsAt.getCell(`AC${r}`).value) ?? undefined,
        })
        imported.fazendas++
      } catch (e: any) {
        warnings.push(`Fazenda linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
  }

  // ── Custos (6 - Custos: bloco demais custos linha 75+, fixos 100+)
  const wsCu = wb.getWorksheet(sheetCustos)
  if (wsCu) {
    // operacionais
    for (let r = 75; r <= 96; r++) {
      const desc = asString(wsCu.getCell(`D${r}`).value)
      const valor = asNumber(wsCu.getCell(`E${r}`).value)
      if (!desc || !valor) continue
      try {
        await svc.upsertCusto({
          grupoId: input.grupoId,
          safra: '24/25',
          tipo: 'operacional',
          descricao: desc,
          valorAnual: String(valor) as any,
          valorMensal: String(valor / 12) as any,
        })
        imported.custos++
      } catch (e: any) {
        warnings.push(`Custo op linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
    // fixos
    for (let r = 100; r <= 120; r++) {
      const desc = asString(wsCu.getCell(`D${r}`).value)
      const valor = asNumber(wsCu.getCell(`E${r}`).value)
      if (!desc || !valor) continue
      try {
        await svc.upsertCusto({
          grupoId: input.grupoId,
          safra: '24/25',
          tipo: 'fixo',
          descricao: desc,
          valorAnual: String(valor) as any,
        })
        imported.custos++
      } catch (e: any) {
        warnings.push(`Custo fix linha ${r}: ${e?.message ?? 'erro'}`)
      }
    }
  }

  // ── Safras (bloco por cultura: linhas 49+, intervalos 23 linhas)
  const wsSf = wb.getWorksheet(sheetSafra)
  if (wsSf) {
    for (let i = 0; i < 10; i++) {
      const blockStart = 49 + i * 23
      const culturaName = asString(wsSf.getCell(`E${blockStart}`).value)
      if (!culturaName) continue
      const colMap = ['E', 'F', 'G', 'H', 'I']
      for (let cIdx = 0; cIdx < 5; cIdx++) {
        const col = colMap[cIdx]
        const safra = asString(wsSf.getCell(`${col}${blockStart + 1}`).value)
        if (!safra) continue
        const areaPropria = asNumber(wsSf.getCell(`${col}${blockStart + 2}`).value)
        const areaArrend = asNumber(wsSf.getCell(`${col}${blockStart + 3}`).value)
        const rendimento = asNumber(wsSf.getCell(`${col}${blockStart + 5}`).value)
        const preco = asNumber(wsSf.getCell(`${col}${blockStart + 7}`).value)
        const custo = asNumber(wsSf.getCell(`${col}${blockStart + 8}`).value)
        const arrendBase = asNumber(wsSf.getCell(`${col}${blockStart + 9}`).value)
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
          })
          imported.culturas++
        } catch (e: any) {
          warnings.push(`Cultura ${culturaName} ${safra}: ${e?.message ?? 'erro'}`)
        }
      }
    }
  }

  return {
    grupo: (await svc.obterGrupo(input.grupoId))!,
    imported,
    warnings,
  }
}

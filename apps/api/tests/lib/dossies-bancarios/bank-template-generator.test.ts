import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import PizZip from 'pizzip'
import { generateBankFiles } from '../../../src/services/dossies-bancarios/BankTemplateGenerator.js'

const sourceDir = process.env.ALETIS_DOSSIES_BANCARIOS_DIR || '/root/ALETIS'
const templatesAvailable = [
  'MODELO_CADASTRO BTG 2025_(Hevellyn).xlsx',
  'MODELO QUADRO ITAU_Questionário de crédito - Itaú BBA Agro.xlsx',
  '2026.02.03 - Cadastro Agro Daycoval 2025 - ATUALIZACAO 26.xlsx',
  'Cadastro Santander - Agronegócios (versão 3.2).xlsm',
  'Cadastro_BOCOM BBM.xlsm',
].every((file) => existsSync(`${sourceDir}/${file}`))

const cliente = {
  nome: 'Cliente Automatizado ALETIS',
  cpfCnpj: '12345678901',
  tipo: 'pessoa_fisica' as const,
  cidade: 'Sorriso',
  uf: 'MT',
}

const dados = {
  dataBase: '2026-06-29',
  grupoEconomico: [{ nome: 'Integrante Teste', cpfCnpj: '98765432100' }],
  propriedades: [{
    fazenda: 'Fazenda Automatizada',
    proprietario: 'Cliente Automatizado ALETIS',
    matricula: 'MAT-123',
    municipio: 'Sorriso',
    uf: 'MT',
    areaTotalHa: 1_000,
    areaPlantioHa: 800,
    avaliacao: 20_000_000,
  }],
  producoes: [{
    cultura: 'Soja',
    periodo: 'atual' as const,
    safra: '25/26',
    regiao: 'MT',
    areaPropriaHa: 800,
    produtividade: 60,
    precoUnitario: 120,
    custoHa: 5_000,
  }],
  dividas: [{
    tomador: 'Cliente Automatizado ALETIS',
    instituicao: 'Banco Teste',
    tipoCredito: 'Custeio',
    vencimento: '2027-06-01',
    saldoDevedor: 1_000_000,
  }],
  fornecedores: [{ nome: 'Fornecedor Teste', valor: 100_000 }],
}

describe.skipIf(!templatesAvailable)('BankTemplateGenerator - modelos oficiais', () => {
  it('gera todos os documentos esperados para os cinco bancos', () => {
    const expected = {
      btg: 4,
      itau: 2,
      daycoval: 1,
      santander: 1,
      bocom: 2,
    } as const

    for (const banco of Object.keys(expected) as Array<keyof typeof expected>) {
      const files = generateBankFiles({ banco, sourceDir, cliente, dados })
      expect(files).toHaveLength(expected[banco])
      expect(files.every((file) => file.buffer.length > 10_000)).toBe(true)
      expect(files.every((file) => file.filename.includes('cliente_automatizado_aletis'))).toBe(true)
    }
  }, 30_000)

  it('preserva VBA e remove dados de exemplo dos modelos Santander e BOCOM', () => {
    for (const banco of ['santander', 'bocom'] as const) {
      const workbook = generateBankFiles({ banco, sourceDir, cliente, dados })
        .find((file) => file.filename.endsWith('.xlsm'))
      expect(workbook).toBeDefined()
      const zip = new PizZip(workbook!.buffer)
      expect(zip.file('xl/vbaProject.bin')).not.toBeNull()
      const worksheets = Object.entries(zip.files)
        .filter(([path]) => path.startsWith('xl/worksheets/') && path.endsWith('.xml'))
        .map(([, file]) => file.asText())
        .join('\n')
      expect(worksheets).toContain('Cliente Automatizado ALETIS')
      expect(worksheets).not.toContain('OSVALDO LAERCIO PASCOTTO')
      expect(worksheets).not.toContain('Exemplo de Empresa Ltda')
    }
  }, 30_000)

  it('gera documentos DOCX válidos sem marcadores pendentes', () => {
    const docs = [
      ...generateBankFiles({ banco: 'btg', sourceDir, cliente, dados }),
      ...generateBankFiles({ banco: 'itau', sourceDir, cliente, dados }),
      ...generateBankFiles({ banco: 'bocom', sourceDir, cliente, dados }),
    ].filter((file) => file.filename.endsWith('.docx'))

    expect(docs.length).toBeGreaterThanOrEqual(4)
    for (const file of docs) {
      const zip = new PizZip(file.buffer)
      const document = zip.file('word/document.xml')?.asText() ?? ''
      expect(document).toContain('<w:document')
      expect(document).not.toMatch(/#P_[FJ]#/)
    }
  }, 20_000)

  it('roteia culturas para os blocos corretos e elimina valores de exemplo da produção', async () => {
    const workbookFile = generateBankFiles({
      banco: 'daycoval',
      sourceDir,
      cliente,
      dados: {
        producoes: [{
          cultura: 'Milho Safrinha',
          periodo: 'atual',
          safra: '25/26',
          regiao: 'GO',
          areaPropriaHa: 333,
          produtividade: 99,
          precoUnitario: 55,
          custoHa: 3_210,
        }],
      },
    })[0]
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(workbookFile.buffer as any)
    const production = workbook.getWorksheet('Produção')!

    expect(production.getCell('D90').value).toBe('Milho Safrinha')
    expect(production.getCell('G93').value).toBe(333)
    expect(production.getCell('E103').value).toBe('GO')
    expect(production.getCell('G343').value).toBeNull()
  }, 20_000)
})

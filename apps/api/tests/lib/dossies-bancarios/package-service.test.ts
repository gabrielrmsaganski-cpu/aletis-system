import { existsSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { closeDossieBancarioPdfBrowser } from '../../../src/services/dossies-bancarios/DossieBancarioPdfRenderer.js'
import { getDossieBancarioService } from '../../../src/services/dossies-bancarios/DossieBancarioService.js'

const sourceDir = process.env.ALETIS_DOSSIES_BANCARIOS_DIR || '/root/ALETIS'
const templateAvailable = existsSync(`${sourceDir}/Cadastro_BOCOM BBM.xlsm`)

afterAll(async () => {
  await closeDossieBancarioPdfBrowser()
})

describe.skipIf(!templateAvailable)('DossieBancarioService - pacote final', () => {
  it('organiza arquivos finais, rastreabilidade e pendências sem expor originais por padrão', async () => {
    const result = await getDossieBancarioService().gerarPacote({
      banco: 'bocom',
      perfilId: 'produtor-pf',
      cliente: {
        nome: 'Cliente Pacote Teste',
        cpfCnpj: '12345678901',
        tipo: 'pessoa_fisica',
        cidade: 'Sorriso',
        uf: 'MT',
      },
      dados: {
        dataBase: '2026-07-01',
        operacao: { limiteSolicitado: 1_500_000 },
        producoes: [{
          cultura: 'Soja',
          periodo: 'atual',
          safra: '25/26',
          regiao: 'MT',
          areaPropriaHa: 500,
          produtividade: 60,
          precoUnitario: 120,
          custoHa: 5_000,
        }],
      },
    })

    const zip = await JSZip.loadAsync(result.buffer)
    const names = Object.keys(zip.files)
    expect(names.some((name) => name.startsWith('02_MODELOS_ORIGINAIS/'))).toBe(false)
    expect(names).toContain('00_MANIFESTO/manifesto-dossie.json')
    expect(names).toContain('00_MANIFESTO/arquivos-gerados.csv')
    expect(names).toContain('00_MANIFESTO/fontes-consolidadas.csv')
    expect(names).toContain('05_PENDENCIAS/Pendencias_e_Validacoes.txt')
    expect(names.filter((name) =>
      name.startsWith('04_ARQUIVOS_PREENCHIDOS/')
      && !name.includes('RELATORIOS_TECNICOS')
      && !name.endsWith('/'),
    ))
      .toHaveLength(3)

    const manifest = JSON.parse(await zip.file('00_MANIFESTO/manifesto-dossie.json')!.async('string'))
    expect(manifest.arquivosGerados).toHaveLength(3)
    expect(manifest.arquivosGerados.every((file: any) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)

    const canonical = await zip.file('01_CADASTRO_CANONICO/Cadastro_Canonico_ALETIS.xlsx')!.async('nodebuffer')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(canonical as any)
    expect(workbook.getWorksheet('Fontes_Dados')).toBeDefined()
    expect(workbook.getWorksheet('Bens_Ativos')).toBeDefined()
    expect(workbook.getWorksheet('Outros_Passivos')).toBeDefined()
  }, 30_000)
})

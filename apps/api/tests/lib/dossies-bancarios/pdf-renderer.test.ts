import { afterAll, describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  closeDossieBancarioPdfBrowser,
  renderDossieBancarioPdf,
} from '../../../src/services/dossies-bancarios/DossieBancarioPdfRenderer.js'

afterAll(async () => {
  await closeDossieBancarioPdfBrowser()
})

describe('DossieBancarioPdfRenderer', () => {
  it('gera PDF A4 paginado com metadados e identidade ALETIS', async () => {
    const result = await renderDossieBancarioPdf({
      banco: 'btg',
      perfilId: 'produtor-pf',
      cliente: {
        nome: 'Cliente Teste PDF',
        cpfCnpj: '123.456.789-00',
        cidade: 'Sorriso',
        uf: 'MT',
        atividade: 'Produção de grãos',
        responsavel: 'ALETIS',
      },
      dados: {
        dataBase: '2026-06-28',
        operacao: {
          cultura: 'Soja',
          limiteSolicitado: 1_500_000,
          prazo: '60 meses',
        },
        producoes: [{
          cultura: 'Soja',
          periodo: 'atual',
          safra: '25/26',
          areaPropriaHa: 600,
          produtividade: 61,
          precoUnitario: 122,
        }],
        propriedades: [{
          fazenda: 'Fazenda Teste',
          municipio: 'Sorriso',
          uf: 'MT',
          areaTotalHa: 800,
          areaPlantioHa: 600,
          avaliacao: 12_000_000,
        }],
        dividas: [{
          instituicao: 'Banco Teste',
          saldoDevedor: 900_000,
          vencimento: '2027-03-30',
        }],
      },
      modelos: [],
      checklist: [{
        item: 'Documento pessoal',
        origem: 'Cliente',
        etapa: 'Documentos',
        status: 'cliente',
      }],
      arquivosGerados: [],
    })

    expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(result.filename).toMatch(/^00_Dossie_Executivo_cliente_teste_pdf_\d{8}\.pdf$/)
    expect(result.paginas).toBeGreaterThanOrEqual(8)

    const document = await PDFDocument.load(result.buffer)
    expect(document.getPageCount()).toBe(result.paginas)
    expect(document.getTitle()).toBe('Dossiê Bancário - Cliente Teste PDF')
    expect(document.getAuthor()).toContain('ALETIS')
    const firstPage = document.getPage(0)
    const { width, height } = firstPage.getSize()
    expect(width).toBeCloseTo(595.28, 0)
    expect(height).toBeCloseTo(841.89, 0)
  }, 20_000)
})

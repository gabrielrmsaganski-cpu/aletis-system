import assert from 'node:assert'
import { test } from 'vitest'
import { buildClienteDocumentoDossie, classificarDocumentoCliente } from '../../src/services/documentos/ClienteDocumentoIntelligence.ts'

function row(nomeOriginal: string, resumoIa = '', tamanho = 1200): any {
  return {
    id: `doc-${nomeOriginal}`,
    clienteId: 'cli-test',
    nomeOriginal,
    nomeStorage: nomeOriginal,
    mime: 'application/pdf',
    tamanho,
    categoria: 'outros',
    enviadoPor: 'consultor',
    enviadoEm: new Date(),
    metadata: { resumoIa },
  }
}

test('classifica documentos financeiros e patrimoniais de dossiê rural', () => {
  assert.strictEqual(classificarDocumentoCliente(row('ARJAN - CAR - 34277 e 34278.pdf')).categoriaInteligente, 'ambiental_car')
  assert.strictEqual(classificarDocumentoCliente(row('ARJAN - CCIR - MAT. 34277 E 34278.pdf')).categoriaInteligente, 'fiscal_rural')
  assert.strictEqual(classificarDocumentoCliente(row('Arjan - 3036806 - BANCO JHON DEERE - lançado.pdf')).categoriaInteligente, 'contrato_bancario')
  assert.strictEqual(classificarDocumentoCliente(row('CASA - Acórdão Agravo de Instrumento.pdf')).grupoDocumento, 'juridico')
  assert.strictEqual(classificarDocumentoCliente(row('1º aditivo -Contrato de Arrendamento Rural Arjan.docx')).categoriaInteligente, 'contrato_arrendamento')
})

test('monta dossiê com grupos e revisão operacional', () => {
  const dossie = buildClienteDocumentoDossie([
    row('1 CNH - Arjan.pdf'),
    row('ARJAN - 34277 - Matricula.pdf', 'validation-history sem texto extraído'),
    row('PULVERIZADOR STARA.pdf', 'Arquivo excede limite de análise', 24 * 1024 * 1024),
    row('CONFISSAO DE DIVIDA - JOAO NOORDEGRAAF.pdf'),
  ])

  assert.strictEqual(dossie.total, 4)
  assert.ok(dossie.grupos.some((g) => g.grupo === 'cadastro'))
  assert.ok(dossie.grupos.some((g) => g.grupo === 'patrimonio'))
  assert.ok(dossie.grupos.some((g) => g.grupo === 'financeiro'))
  assert.ok(dossie.documentosRevisao.length >= 2)
})

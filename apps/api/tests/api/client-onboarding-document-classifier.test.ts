import { describe, expect, it } from 'vitest'
import { detectClientOnboardingDocumentType } from '../../src/services/cliente/ClientOnboardingDocumentClassifier.js'

function classify(filename: string, texto: string) {
  return detectClientOnboardingDocumentType({ filename, texto, mimetype: 'application/pdf' })
}

describe('ClientOnboardingDocumentClassifier', () => {
  it.each([
    ['proposta-renegociacao.pdf', 'Condições da proposta: entrada, carência e parcelamento', 'proposta'],
    ['instrumento.pdf', 'Cédula de crédito com cláusula de garantia e assinatura', 'contrato'],
    ['cnh-frente.pdf', 'CARTEIRA NACIONAL DE HABILITAÇÃO - CPF 12345678900', 'identidade'],
    ['darf.pdf', 'Documento de Arrecadação de Receitas Federais', 'fiscal'],
    ['matricula-123.pdf', 'Matrícula do imóvel emitida pelo registro de imóveis', 'patrimonio'],
    ['cadastro-rural.pdf', 'Cadastro Ambiental Rural da fazenda com 350 hectares', 'agro'],
    ['anotacoes.pdf', 'Anotações gerais da reunião com o cliente', 'documento'],
  ] as const)('classifica %s', (filename, texto, expected) => {
    expect(classify(filename, texto)).toBe(expected)
  })

  it('não trata a simples menção a banco como proposta', () => {
    expect(classify('extrato.pdf', 'Extrato de movimentação da conta no Banco do Brasil')).toBe('documento')
  })

  it('prioriza o contexto rural mesmo quando o documento contém CPF', () => {
    expect(classify('car.pdf', 'Cadastro Ambiental Rural do produtor, CPF 12345678900')).toBe('agro')
  })
})

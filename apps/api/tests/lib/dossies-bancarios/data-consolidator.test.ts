import { afterEach, describe, expect, it } from 'vitest'
import { clientes } from '../../../src/routes/clientes.js'
import { consolidarDadosDossie } from '../../../src/services/dossies-bancarios/DossieDataConsolidator.js'

const testId = 'cliente-consolidacao-dossie-test'

afterEach(() => {
  clientes.delete(testId)
})

describe('DossieDataConsolidator', () => {
  it('não multiplica saldo decimal canônico do CRM e conserva precisão de área', async () => {
    ;(clientes as Map<string, any>).set(testId, {
      id: testId, nome: 'Cliente numérico sintético',
      dividas: [{ credor: 'Banco sintético', valorAtualizado: '1234.56', taxaJuros: '1.25' }],
      car: { areaImovel: '123.4567', areaAntropizada: '1.234,5678' },
    })
    const result = await consolidarDadosDossie({ banco: 'btg', clienteId: testId })
    expect(result.dados.dividas?.[0]?.saldoDevedor).toBe(1234.56)
    expect(result.dados.dividas?.[0]?.taxaJuros).toBe(1.25)
    expect(result.dados.propriedades?.[0]?.areaTotalHa).toBe(123.4567)
    expect(result.dados.propriedades?.[0]?.areaConsolidadaHa).toBe(1234.5678)
  })

  it('carrega o cliente selecionado no CRM e preserva ajustes manuais', async () => {
    ;(clientes as Map<string, any>).set(testId, {
      id: testId,
      nome: 'Cliente CRM',
      cpfCnpj: '12345678901',
      tipo: 'pessoa_fisica',
      cidade: 'Sorriso',
      uf: 'MT',
      telefone: '66999999999',
      email: 'cliente@example.com',
      atividade: 'Produção de grãos',
      consultor: 'Consultor ALETIS',
      observacoes: 'Cadastro de teste',
      endereco: { formatado: 'Rua Teste, 100, Sorriso/MT' },
      grupoFamiliar: [{
        nome: 'Integrante CRM',
        cpfCnpj: '98765432100',
        parentesco: 'Cônjuge',
        atuaAtividade: true,
      }],
      dividas: [{
        credor: 'Banco CRM',
        contrato: 'CTR-1',
        valorAtualizado: 250_000,
        vencimento: '2027-05-01',
      }],
    })

    const result = await consolidarDadosDossie({
      banco: 'btg',
      clienteId: testId,
      cliente: { nome: 'Nome revisado manualmente' },
      dados: {
        producoes: [{
          cultura: 'Soja',
          periodo: 'atual',
          safra: '25/26',
          produtividade: 62,
        }],
      },
    })

    expect(result.cliente.id).toBe(testId)
    expect(result.cliente.nome).toBe('Nome revisado manualmente')
    expect(result.cliente.cpfCnpj).toBe('12345678901')
    expect(result.dados.grupoEconomico?.[0]?.nome).toBe('Integrante CRM')
    expect(result.dados.dividas?.[0]?.instituicao).toBe('Banco CRM')
    expect(result.dados.producoes?.[0]?.safra).toBe('25/26')
    expect(result.fontes.map((fonte) => fonte.fonte)).toContain('crm')
    expect(result.fontes.map((fonte) => fonte.fonte)).toContain('manual')
  })
})

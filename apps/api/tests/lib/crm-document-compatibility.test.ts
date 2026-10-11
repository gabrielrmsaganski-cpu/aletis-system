import { expect, it } from 'vitest'
import { clientePatchSchema } from '../../src/lib/crm-write-validation.js'

it('permite dívida com vencimento e estado ainda desconhecidos, sem inventar valores', () => {
  const patch = { dividas: [{ contrato: 'CCB sintética', valorOriginal: '1000.01', valorAtualizado: '1000.01', credor: 'Credor sintético' }] }
  expect(clientePatchSchema.parse(patch)).toEqual(patch)
  const legacy = { dividas: [{ ...patch.dividas[0], vencimento: '' }] }
  expect(clientePatchSchema.parse(legacy)).toEqual(legacy)
  expect(clientePatchSchema.safeParse({ dividas: [{ ...patch.dividas[0], vencimento: '2026-02-31' }] }).success).toBe(false)
  expect(clientePatchSchema.safeParse({ dividas: [{ ...patch.dividas[0], status: 'inventado' }] }).success).toBe(false)
})

it('preserva o cadastro financeiro completo de contratos e pagamentos', () => {
  const patch = {
    dividas: [{
      id: 'div-sintetica', contrato: 'CCB-123', credor: 'Banco sintético', modalidade: 'Custeio rural',
      emitente: 'Produtor sintético', tomador: 'Empresa sintética', finalidade: 'Soja 26/27', enquadramento: 'Programa teste',
      numeroCedula: 'CED-456', valorOriginal: '125000.50', valorAtualizado: '130000.75', valorParcela: '10000.00',
      vencimento: '2027-10-15', dataContratacao: '2026-08-01', primeiraParcela: '2027-01-15', ultimaParcela: '2028-01-15',
      parcelasTotal: 12, parcelasPagas: 2, prazoMeses: 18, carenciaMeses: 6, diasAtraso: 0,
      taxaNominalAa: '12,5%', taxaEfetivaAa: '13,2%', cetAa: '14,1%', indexador: 'CDI', periodicidade: 'Mensal',
      metodoCalculo: 'SAC', garantias: ['Penhor de safra', 'Aval'], observacoes: 'Informação sintética.',
      informacoesAdicionais: [{ campo: 'Agência', valor: '0001' }], status: 'em_dia',
    }],
    pagamentos: [{
      id: 'pag-sintetico', data: '2026-09-21', valor: '10000.00', descricao: 'Parcela sintética', tipo: 'pagamento',
      status: 'realizado', credor: 'Banco sintético', contrato: 'CCB-123', formaPagamento: 'PIX', comprovante: 'REF-1',
      observacoes: 'Informação sintética.', informacoesAdicionais: [{ campo: 'Conta', valor: '123' }],
    }],
  }
  expect(clientePatchSchema.parse(patch)).toEqual(patch)
})

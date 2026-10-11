import type { SimulationDraft } from '../../src/services/simulations/SimulationWorkspaceService.js'

export function syntheticDraft(): SimulationDraft {
  return {
    input: {
      agente: 'Banco sintético', tomador: 'Cliente sintético', contrato: '', valorOperacao: 10000,
      dataCredito: '2026-01-31', primeiroVencimentoPrincipal: '2026-02-28',
      periodicidadePrincipal: 'MENSAL', periodicidadeJuros: 'JUNTO_PRINCIPAL', jurosAte: 'FINAL',
      numeroParcelas: 12, taxaPreAnual: 0.12, taxaPosAnual: 0, despesas: [],
      seguroVidaAtivo: false, seguroFinanciado: false, seguroForma: 'VALOR_FIXO', seguroValor: 0,
      seguroPercentualMensal: 0, iofAtivo: false, iofPessoa: 'PF', iofAdicionalAtivo: false, iofFinanciado: false,
    },
    recalculo: { dataInicial: '2026-01-31', valorCredito: 10000, entrada: 0, custosAcessorios: 0, taxaMensal: 0.01,
      periodicidade: 'ANUAL', parcelas: [{ id: 'p1', data: '2027-01-31', valor: 11200 }] },
    ficha: { taxaMensal: 0.01, valorOperacao: 10000, dataInicio: '2026-01-31',
      eventos: [{ id: 'e1', data: '2026-02-28', evento: 'Amortização', amortizacao: 1000 }] },
  }
}

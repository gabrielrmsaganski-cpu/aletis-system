/**
 * Projeção de fluxo de caixa agrícola.
 */

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export interface ParamsFluxoCaixaAgricola {
  areaHectares: number;
  produtividadeSacasHa: number;
  precoSaca: number;
  custoProducaoHa: number;
  custoArrendamentoHa?: number;
  custosAdministrativos: number;
  outrasReceitas?: number;
  dividasAnuais: number;
  anosProjecao?: number;
  taxaCrescimentoReceita?: number; // % ao ano
  taxaCrescimentoCusto?: number; // % ao ano
}

export interface ProjecaoAnual {
  ano: number;
  receitaBruta: number;
  custoProducao: number;
  custoArrendamento: number;
  custosAdmin: number;
  outrasReceitas: number;
  resultadoOperacional: number;
  servicoDivida: number;
  resultadoLiquido: number;
  saldoAcumulado: number;
}

export function projetarFluxoCaixa(params: ParamsFluxoCaixaAgricola): ProjecaoAnual[] {
  const {
    areaHectares,
    produtividadeSacasHa,
    precoSaca,
    custoProducaoHa,
    custoArrendamentoHa = 0,
    custosAdministrativos,
    outrasReceitas = 0,
    dividasAnuais,
    anosProjecao = 5,
    taxaCrescimentoReceita = 2,
    taxaCrescimentoCusto = 3,
  } = params;

  const projecao: ProjecaoAnual[] = [];
  let saldoAcumulado = 0;
  const anoBase = new Date().getFullYear();

  for (let i = 0; i < anosProjecao; i++) {
    const fatorReceita = Math.pow(1 + taxaCrescimentoReceita / 100, i);
    const fatorCusto = Math.pow(1 + taxaCrescimentoCusto / 100, i);

    const receitaBruta = round(areaHectares * produtividadeSacasHa * precoSaca * fatorReceita, 2);
    const custoProducao = round(areaHectares * custoProducaoHa * fatorCusto, 2);
    const custoArrendamento = round(areaHectares * custoArrendamentoHa * fatorCusto, 2);
    const custosAdmin = round(custosAdministrativos * fatorCusto, 2);
    const outras = round(outrasReceitas * fatorReceita, 2);

    const resultadoOperacional = round(
      receitaBruta + outras - custoProducao - custoArrendamento - custosAdmin,
      2,
    );
    const servicoDivida = round(dividasAnuais, 2);
    const resultadoLiquido = round(resultadoOperacional - servicoDivida, 2);
    saldoAcumulado = round(saldoAcumulado + resultadoLiquido, 2);

    projecao.push({
      ano: anoBase + i,
      receitaBruta,
      custoProducao,
      custoArrendamento,
      custosAdmin,
      outrasReceitas: outras,
      resultadoOperacional,
      servicoDivida,
      resultadoLiquido,
      saldoAcumulado,
    });
  }

  return projecao;
}

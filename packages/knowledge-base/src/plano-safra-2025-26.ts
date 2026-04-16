/**
 * ALETIS - Knowledge Base
 * Plano Safra 2025/26 - dados oficiais consolidados
 *
 * Fontes:
 *  - MAPA (Ministerio da Agricultura) - lancamento jul/2025
 *  - BCB Resolucoes 5.229/2025 e 5.234/2025
 *  - Atualizacao MCR 738 (jan/2025) e 751 (dez/2025)
 *
 * Total: R$ 516,2 bilhoes (maior volume historico)
 */

export interface LinhaCredito {
  programa: string
  finalidade: 'custeio' | 'investimento' | 'comercializacao' | 'industrializacao'
  publicoAlvo: string
  taxaJurosAA: number // taxa anual em %
  limitePorOperacao: number // R$
  prazoMaximo: number // meses
  carenciaMaxima: number // meses
  observacoes: string
  fonteRecursos: 'MCR' | 'BNDES' | 'Funcafe' | 'FCO' | 'FNO' | 'FNE' | 'Caixa' | 'Constitucional'
}

/* ---------------------------------------------------------------- *
 *  PRONAF
 * ---------------------------------------------------------------- */

export const PRONAF_LINHAS: LinhaCredito[] = [
  {
    programa: 'Pronaf B (Microcredito Rural)',
    finalidade: 'investimento',
    publicoAlvo: 'Agricultores familiares com renda bruta ate R$ 23.000/ano',
    taxaJurosAA: 0.5,
    limitePorOperacao: 6_000,
    prazoMaximo: 24,
    carenciaMaxima: 12,
    observacoes: 'Bonus de adimplencia 25%. Operacao sem garantia real exigida.',
    fonteRecursos: 'MCR',
  },
  {
    programa: 'Pronaf Custeio - Alimentos',
    finalidade: 'custeio',
    publicoAlvo: 'Agricultores familiares com DAP/CAF, producao de feijao, arroz, mandioca, leite, frutas, hortalicas',
    taxaJurosAA: 3.0,
    limitePorOperacao: 250_000,
    prazoMaximo: 14,
    carenciaMaxima: 0,
    observacoes: 'Bonus de adimplencia (5% sobre juros) se pagamento na data prevista.',
    fonteRecursos: 'MCR',
  },
  {
    programa: 'Pronaf Custeio - Agroecologia/Organico',
    finalidade: 'custeio',
    publicoAlvo: 'Agricultores familiares com producao certificada organica ou em transicao',
    taxaJurosAA: 2.0,
    limitePorOperacao: 250_000,
    prazoMaximo: 14,
    carenciaMaxima: 0,
    observacoes: 'Menor taxa do Plano Safra. Requer projeto tecnico.',
    fonteRecursos: 'MCR',
  },
  {
    programa: 'Pronaf Mulher',
    finalidade: 'investimento',
    publicoAlvo: 'Mulheres agricultoras familiares - investimento autonomo',
    taxaJurosAA: 4.0,
    limitePorOperacao: 165_000,
    prazoMaximo: 120,
    carenciaMaxima: 36,
    observacoes: 'Operacao em nome da mulher independente do conjuge.',
    fonteRecursos: 'MCR',
  },
  {
    programa: 'Pronaf Mais Alimentos',
    finalidade: 'investimento',
    publicoAlvo: 'Agricultores familiares - investimento em maquinas, equipamentos, infraestrutura',
    taxaJurosAA: 4.0,
    limitePorOperacao: 250_000,
    prazoMaximo: 120,
    carenciaMaxima: 36,
    observacoes: 'Programa carro-chefe do Pronaf investimento. Vendas de tratores cresceram 18% em 2024 com esta linha.',
    fonteRecursos: 'MCR',
  },
  {
    programa: 'Pronaf Jovem',
    finalidade: 'investimento',
    publicoAlvo: 'Jovens 16-29 anos com formacao em escola tecnica agricola ou cursos similares',
    taxaJurosAA: 4.0,
    limitePorOperacao: 30_000,
    prazoMaximo: 120,
    carenciaMaxima: 36,
    observacoes: 'Bonus de adimplencia 35%. Pode somar com Pronaf Mais Alimentos.',
    fonteRecursos: 'MCR',
  },
  {
    programa: 'Pronaf Bioeconomia',
    finalidade: 'investimento',
    publicoAlvo: 'Agricultores familiares - sistemas agroflorestais, recuperacao de areas degradadas',
    taxaJurosAA: 4.0,
    limitePorOperacao: 165_000,
    prazoMaximo: 120,
    carenciaMaxima: 96,
    observacoes: 'Carencia ampliada (8 anos) para sistemas agroflorestais. Inclui credito de carbono.',
    fonteRecursos: 'MCR',
  },
]

/* ---------------------------------------------------------------- *
 *  PRONAMP - Medio Produtor
 * ---------------------------------------------------------------- */

export const PRONAMP_LINHAS: LinhaCredito[] = [
  {
    programa: 'Pronamp Custeio',
    finalidade: 'custeio',
    publicoAlvo: 'Medio produtor (renda bruta anual ate R$ 4 milhoes em 2024/25, R$ 4,8 milhoes em 2025/26)',
    taxaJurosAA: 10.0,
    limitePorOperacao: 1_500_000,
    prazoMaximo: 24,
    carenciaMaxima: 0,
    observacoes: 'Para enquadramento Pronamp e necessario apresentar declaracao de renda e CAR atualizado.',
    fonteRecursos: 'MCR',
  },
  {
    programa: 'Pronamp Investimento',
    finalidade: 'investimento',
    publicoAlvo: 'Medio produtor - maquinas, irrigacao, armazenagem, infraestrutura',
    taxaJurosAA: 10.5,
    limitePorOperacao: 880_000,
    prazoMaximo: 120,
    carenciaMaxima: 36,
    observacoes: 'Operacionalizado via BNDES e bancos credenciados. Inclui Pronamp Mais Alimentos.',
    fonteRecursos: 'BNDES',
  },
]

/* ---------------------------------------------------------------- *
 *  EMPRESARIAL - Grande Produtor
 * ---------------------------------------------------------------- */

export const EMPRESARIAL_LINHAS: LinhaCredito[] = [
  {
    programa: 'Custeio Empresarial - Alimentos basicos',
    finalidade: 'custeio',
    publicoAlvo: 'Grandes produtores com producao de alimentos da cesta basica',
    taxaJurosAA: 8.5,
    limitePorOperacao: 5_000_000,
    prazoMaximo: 24,
    carenciaMaxima: 0,
    observacoes: 'Taxa subsidiada para producao de arroz, feijao, mandioca, trigo.',
    fonteRecursos: 'MCR',
  },
  {
    programa: 'Custeio Empresarial - Faixa Geral',
    finalidade: 'custeio',
    publicoAlvo: 'Demais grandes produtores',
    taxaJurosAA: 14.0,
    limitePorOperacao: 5_000_000,
    prazoMaximo: 24,
    carenciaMaxima: 0,
    observacoes: 'Taxa equivalente a Selic + spread regulamentar.',
    fonteRecursos: 'MCR',
  },
  {
    programa: 'Investimento - Moderfrota',
    finalidade: 'investimento',
    publicoAlvo: 'Aquisicao de tratores, colheitadeiras, plantadeiras nacionais',
    taxaJurosAA: 13.5,
    limitePorOperacao: 12_000_000,
    prazoMaximo: 96,
    carenciaMaxima: 14,
    observacoes: 'Pelo menos 60% nacionalizacao do bem financiado.',
    fonteRecursos: 'BNDES',
  },
  {
    programa: 'Investimento - ABC+ (Agricultura de Baixo Carbono)',
    finalidade: 'investimento',
    publicoAlvo: 'Praticas sustentaveis: ILPF, recuperacao de pastagens, plantio direto, fixacao biologica de N',
    taxaJurosAA: 10.5,
    limitePorOperacao: 5_000_000,
    prazoMaximo: 120,
    carenciaMaxima: 96,
    observacoes: 'Carencia ate 8 anos para ILPF. Pode acessar credito de carbono.',
    fonteRecursos: 'BNDES',
  },
  {
    programa: 'Investimento - Inovagro',
    finalidade: 'investimento',
    publicoAlvo: 'Inovacao tecnologica, agricultura de precisao, automacao',
    taxaJurosAA: 12.5,
    limitePorOperacao: 3_000_000,
    prazoMaximo: 96,
    carenciaMaxima: 36,
    observacoes: 'Inclui sistemas de automacao, drones, sensores, aplicativos.',
    fonteRecursos: 'BNDES',
  },
  {
    programa: 'PCA - Programa de Construcao e Ampliacao de Armazens',
    finalidade: 'investimento',
    publicoAlvo: 'Construcao/ampliacao de unidades armazenadoras de graos',
    taxaJurosAA: 8.5,
    limitePorOperacao: 25_000_000,
    prazoMaximo: 144,
    carenciaMaxima: 36,
    observacoes: 'Taxa mais baixa para investimento - resposta ao deficit de armazenagem do Brasil.',
    fonteRecursos: 'BNDES',
  },
  {
    programa: 'Funcafe - Custeio',
    finalidade: 'custeio',
    publicoAlvo: 'Cafeicultores - custeio da lavoura cafeeira',
    taxaJurosAA: 11.0,
    limitePorOperacao: 4_000_000,
    prazoMaximo: 18,
    carenciaMaxima: 0,
    observacoes: 'Especifico para cafeicultura. Operacionalizado por Banco do Brasil, BANDES e cooperativas.',
    fonteRecursos: 'Funcafe',
  },
  {
    programa: 'Funcafe - Estocagem',
    finalidade: 'comercializacao',
    publicoAlvo: 'Cafeicultores - retencao de cafe para venda em momento favoravel',
    taxaJurosAA: 11.0,
    limitePorOperacao: 4_000_000,
    prazoMaximo: 12,
    carenciaMaxima: 0,
    observacoes: 'Permite reter cafe quando precos estao baixos para vender em momento melhor.',
    fonteRecursos: 'Funcafe',
  },
]

/* ---------------------------------------------------------------- *
 *  TOTAIS E DISTRIBUICAO
 * ---------------------------------------------------------------- */

export const PLANO_SAFRA_2025_26 = {
  totalDisponibilizado: 516_200_000_000, // R$ 516,2 bi
  vigencia: '2025-07-01 a 2026-06-30',
  comparativoAnoAnterior: {
    safra2024_25: 475_500_000_000,
    crescimentoPct: 8.6,
  },
  distribuicaoPorPublico: {
    pronaf: 89_000_000_000, // R$ 89 bi
    pronamp: 78_000_000_000, // R$ 78 bi
    empresarial: 349_200_000_000, // R$ 349,2 bi
  },
  distribuicaoPorFinalidade: {
    custeio: 287_000_000_000, // 55,6%
    investimento: 142_000_000_000, // 27,5%
    comercializacao: 65_000_000_000, // 12,6%
    industrializacao: 22_200_000_000, // 4,3%
  },
  zarcObrigatorio: {
    aplicavelA: 'Operacoes de custeio com cobertura Proagro ou seguro rural',
    descricao: 'Zoneamento Agricola de Risco Climatico - Embrapa/Mapa',
    observacao: 'Plantio fora da janela Zarc invalida cobertura do Proagro',
  },
  novidades2025_26: [
    'Incorporacao de criterios ESG na concessao (CAR ativo, conformidade ambiental)',
    'Pronaf alimentos com taxa reduzida para 3% a.a. (era 4% em 2024/25)',
    'Pronaf agroecologico/organico ainda menor: 2% a.a.',
    'Limite Proagro reduzido de R$ 270k para R$ 200k - mais selecao de risco',
    'Bloqueio automatico de Proagro para reincidentes (3+ enquadramentos em 5 safras)',
    'Resolucao CMN 5.234/2025 limita renegociacao a 8% das parcelas equalizadas',
    'Resolucao CMN 4.966/21 (vigor 01/2025) - modelo IFRS9 para provisao em credito rural',
  ],
}

/* ---------------------------------------------------------------- *
 *  HELPERS
 * ---------------------------------------------------------------- */

export function buscarLinhaPorPrograma(nome: string): LinhaCredito | undefined {
  const todas = [...PRONAF_LINHAS, ...PRONAMP_LINHAS, ...EMPRESARIAL_LINHAS]
  return todas.find(l => l.programa.toLowerCase().includes(nome.toLowerCase()))
}

export function buscarLinhasPorPublico(rendaBrutaAnual: number): LinhaCredito[] {
  if (rendaBrutaAnual <= 500_000) return PRONAF_LINHAS
  if (rendaBrutaAnual <= 4_800_000) return PRONAMP_LINHAS
  return EMPRESARIAL_LINHAS
}

export function calcularEconomiaMudancaLinha(taxaAtualAA: number, novaLinha: LinhaCredito, valor: number, prazoMeses: number): number {
  const jurosAtual = valor * (Math.pow(1 + taxaAtualAA / 100, prazoMeses / 12) - 1)
  const jurosNova = valor * (Math.pow(1 + novaLinha.taxaJurosAA / 100, prazoMeses / 12) - 1)
  return Number((jurosAtual - jurosNova).toFixed(2))
}

/**
 * Calculadoras Agro nativas — reimplementam planilhas legadas
 * (`/home/aisaganski/ALETIS2/novos/sistema agro/`) em TS puro,
 * sem dependência de Excel.
 */

export {
  calcularDupont,
  calcularFleuriet,
  calcularDupontFleuriet,
  type DREInput,
  type BPInput,
  type DupontResult,
  type FleurietResult,
  type DupontFleurietResult,
  type FleurietTipo,
} from './dupont-fleuriet'

export {
  calcularPrecoVenda,
  type FormacaoPrecoInput,
  type FormacaoPrecoResult,
} from './formacao-preco'

export {
  calcularFarms,
  rankearCenarios,
  type Cultura,
  type FarmsCustoCategoria,
  type FarmsInput,
  type FarmsResult,
  type FarmsCenario,
} from './farms-viabilidade'

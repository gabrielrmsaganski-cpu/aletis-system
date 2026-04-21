/**
 * Registro de regras do SmartAdvisor. Adicionar uma nova recomendação
 * é: criar arquivo em `rules/<nome>.ts` exportando `rule: AdvisorRule`,
 * e listá-lo aqui. A ordem no array é irrelevante — o SmartAdvisor
 * reordena por prioridade + categoria.
 */
import { rule as sraiCritico } from './srai-critico.js'
import { rule as absIntegral } from './abs-integral.js'
import { rule as absCarPendente } from './abs-car-pendente.js'
import { rule as margemPrejuizo } from './margem-prejuizo.js'
import { rule as jurosExcessivos } from './juros-excessivos.js'
import { rule as caixaComprometido } from './caixa-comprometido.js'
import { rule as contatoFrio } from './contato-frio.js'
import { rule as exposicaoConcentrada } from './exposicao-concentrada.js'
import { rule as cnpjIrregular } from './cnpj-irregular.js'
import type { AdvisorRule } from '../types.js'

export const REGRAS: AdvisorRule[] = [
  sraiCritico,
  absIntegral,
  absCarPendente,
  margemPrejuizo,
  jurosExcessivos,
  caixaComprometido,
  contatoFrio,
  exposicaoConcentrada,
  cnpjIrregular,
]

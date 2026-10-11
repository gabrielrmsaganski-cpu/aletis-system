// ============================================================
// ALETIS — extração documental especializada
//
// Complementa o SmartExtractor com um contrato de dados único para a
// esteira: cada valor é texto (inclusive dinheiro), tem confiança e um
// trecho literal verificável. Isso permite comparar versões e cruzar
// documentos sem promover inferências a fatos.
// ============================================================

import { createHash } from 'node:crypto'

import { generateStructured, isOpenAIEnabled } from '../../llm/OpenAIClient.js'
import { getModelForRole } from '../../llm/LLMConfig.js'
import type { IngestedDocument } from '../intake/types.js'
import { buildDocumentModelContent } from '../intake/DocumentModelInput.js'
import { classifyDocument } from './DocumentClassifierV2.js'

export type SpecializedDocumentType =
  | 'contrato'
  | 'cpr'
  | 'ccb'
  | 'matricula_imovel'
  | 'car'
  | 'ccir'
  | 'itr'
  | 'extrato_bancario'
  | 'balanco_patrimonial'
  | 'dre'
  | 'proposta'
  | 'outro'

export type SpecializedFieldValueType = 'text' | 'identifier' | 'date' | 'money' | 'percentage' | 'area' | 'integer'

export interface SpecializedField {
  fieldKey: string
  valueText: string
  normalizedValue: string
  valueType: SpecializedFieldValueType
  confidence: number
  evidenceText: string
  evidenceSource: string
  page?: number
  sheet?: string
  expiresAt?: string
  extractor: 'deterministic' | 'smart' | 'structured_output'
}

export interface SpecializedClassification {
  type: SpecializedDocumentType
  confidence: number
  method: 'filename' | 'content' | 'smart_classifier' | 'fallback'
  signals: string[]
}

export interface SpecializedExtraction {
  type: SpecializedDocumentType
  fields: SpecializedField[]
  missingRequiredFields: string[]
  confidence: number
  method: 'deterministic' | 'hybrid'
  profileVersion: string
}

interface FieldDefinition {
  key: string
  label: string
  type: SpecializedFieldValueType
  required?: boolean
  aliases?: string[]
  patterns?: RegExp[]
}

interface DocumentProfile {
  label: string
  fields: FieldDefinition[]
  staleAfterDays?: number
}

const IDENTIFIER = '[A-Z0-9][A-Z0-9./\\-]{2,80}'
const DATE = '(?:\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})'
const MONEY = '(?:R\\$\\s*)?[0-9][0-9.\\s]*(?:,[0-9]{2})?'
const DECIMAL = '[0-9][0-9.\\s]*(?:,[0-9]+)?'
const EXPLICIT_CONTRACT_NUMBER = `contrato\\s*(?:(?:n[ºo°.]|n[uú]mero)\\s*[:.\\-]?\\s*|[:\\-]\\s*)${IDENTIFIER}`

const profiles: Record<SpecializedDocumentType, DocumentProfile> = {
  contrato: {
    label: 'Contrato',
    fields: [
      field('numero_contrato', 'Número do contrato', 'identifier', true, ['número do contrato', 'nº contrato'], [new RegExp(`(?:contrato|opera[cç][aã]o)\\s*(?:(?:n[ºo°.]|n[uú]mero)\\s*[:.\\-]?\\s*|[:\\-]\\s*)(${IDENTIFIER})`, 'i')]),
      field('devedor_nome', 'Devedor', 'text', true, ['devedor', 'mutuário', 'emitente'], [/(?:devedor|mutu[aá]rio|emitente)\s*[:\-]?\s*([^\n;]{4,120})/i]),
      field('devedor_cpf_cnpj', 'CPF/CNPJ do devedor', 'identifier', false, ['cpf/cnpj do devedor'], [/(?:devedor|mutu[aá]rio|emitente)[\s\S]{0,180}?(?:cpf|cnpj)\s*[:\-]?\s*([\d.\/-]{11,22})/i]),
      field('credor_nome', 'Credor', 'text', true, ['credor', 'mutuante', 'instituição financeira'], [/(?:credor|mutuante|institui[cç][aã]o\s+financeira)\s*[:\-]?\s*([^\n;]{3,120})/i]),
      field('valor_original', 'Valor contratado', 'money', true, ['valor liberado', 'valor principal'], [new RegExp(`(?:valor\\s+(?:contratado|liberado|principal|da\\s+opera[cç][aã]o))\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('taxa_juros', 'Taxa de juros', 'percentage', false, ['taxa contratada', 'juros remuneratórios'], [new RegExp(`(?:taxa\\s+(?:de\\s+)?juros|juros\\s+remunerat[oó]rios)\\s*[:\\-]?\\s*(${DECIMAL}\\s*%[^\\n;]{0,18})`, 'i')]),
      field('data_contratacao', 'Data de contratação', 'date', false, ['data da contratação', 'emissão'], [new RegExp(`(?:data\\s+(?:da\\s+)?contrata[cç][aã]o|emitid[ao]\\s+em)\\s*[:\\-]?\\s*(${DATE})`, 'i')]),
      field('data_vencimento', 'Vencimento', 'date', true, ['vencimento final'], [new RegExp(`(?:vencimento(?:\\s+final)?|vence\\s+em)\\s*[:\\-]?\\s*(${DATE})`, 'i')]),
      field('garantias', 'Garantias', 'text', false, ['garantia real', 'garantias constituídas'], [/(?:garantia(?:s)?|em\s+garantia)\s*[:\-]?\s*([^\n]{4,500})/i]),
    ],
  },
  cpr: {
    label: 'Cédula de Produto Rural (CPR)',
    fields: [
      field('numero_cpr', 'Número da CPR', 'identifier', true, ['número da cédula'], [new RegExp(`(?:cpr|c[eé]dula)\\s*(?:(?:n[ºo°.]|n[uú]mero)\\s*[:.\\-]?\\s*|[:\\-]\\s*)(${IDENTIFIER})`, 'i')]),
      field('emitente_nome', 'Emitente', 'text', true, ['produtor emitente'], [/(?:emitente|produtor)\s*[:\-]?\s*([^\n;]{4,120})/i]),
      field('emitente_cpf_cnpj', 'CPF/CNPJ do emitente', 'identifier', false, ['cpf/cnpj emitente'], [/(?:emitente|produtor)[\s\S]{0,180}?(?:cpf|cnpj)\s*[:\-]?\s*([\d.\/-]{11,22})/i]),
      field('credor_nome', 'Credor', 'text', true, ['credor da CPR'], [/(?:credor|benefici[aá]rio)\s*[:\-]?\s*([^\n;]{3,120})/i]),
      field('produto', 'Produto rural', 'text', true, ['produto', 'commodity'], [/(?:produto|commodity)\s*[:\-]?\s*([^\n;]{3,100})/i]),
      field('quantidade', 'Quantidade', 'text', true, ['quantidade de produto'], [new RegExp(`(?:quantidade|volume)\\s*[:\\-]?\\s*(${DECIMAL}\\s*(?:kg|t|toneladas?|sacas?|sc))`, 'i')]),
      field('valor_cpr', 'Valor da CPR', 'money', false, ['valor financeiro'], [new RegExp(`(?:valor\\s+(?:da\\s+)?cpr|valor\\s+financeiro)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('data_vencimento', 'Vencimento/entrega', 'date', true, ['data de entrega', 'vencimento'], [new RegExp(`(?:vencimento|data\\s+(?:de\\s+)?entrega)\\s*[:\\-]?\\s*(${DATE})`, 'i')]),
      field('garantias', 'Garantias', 'text', false, ['garantia'], [/(?:garantia(?:s)?|em\s+garantia)\s*[:\-]?\s*([^\n]{4,500})/i]),
    ],
  },
  ccb: {
    label: 'Cédula de Crédito Bancário (CCB)',
    fields: [
      field('numero_ccb', 'Número da CCB', 'identifier', true, ['número da cédula'], [new RegExp(`(?:ccb|c[eé]dula)\\s*(?:(?:n[ºo°.]|n[uú]mero)\\s*[:.\\-]?\\s*|[:\\-]\\s*)(${IDENTIFIER})`, 'i')]),
      field('emitente_nome', 'Emitente', 'text', true, ['devedor emitente'], [/(?:emitente|devedor)\s*[:\-]?\s*([^\n;]{4,120})/i]),
      field('emitente_cpf_cnpj', 'CPF/CNPJ do emitente', 'identifier', false, ['cpf/cnpj emitente'], [/(?:emitente|devedor)[\s\S]{0,180}?(?:cpf|cnpj)\s*[:\-]?\s*([\d.\/-]{11,22})/i]),
      field('credor_nome', 'Credor', 'text', true, ['instituição credora'], [/(?:credor|institui[cç][aã]o\s+credora)\s*[:\-]?\s*([^\n;]{3,120})/i]),
      field('valor_original', 'Valor da CCB', 'money', true, ['valor principal'], [new RegExp(`(?:valor\\s+(?:da\\s+)?ccb|valor\\s+principal)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('taxa_juros', 'Taxa de juros', 'percentage', false, ['taxa efetiva'], [new RegExp(`(?:taxa\\s+(?:de\\s+)?juros|taxa\\s+efetiva)\\s*[:\\-]?\\s*(${DECIMAL}\\s*%[^\\n;]{0,18})`, 'i')]),
      field('data_vencimento', 'Vencimento', 'date', true, ['vencimento final'], [new RegExp(`(?:vencimento(?:\\s+final)?|vence\\s+em)\\s*[:\\-]?\\s*(${DATE})`, 'i')]),
      field('garantias', 'Garantias', 'text', false, ['garantia'], [/(?:garantia(?:s)?|em\s+garantia)\s*[:\-]?\s*([^\n]{4,500})/i]),
    ],
  },
  matricula_imovel: {
    label: 'Matrícula de imóvel rural',
    fields: [
      field('matricula', 'Número da matrícula', 'identifier', true, ['matrícula'], [new RegExp(`matr[ií]cula\\s*(?:(?:n[ºo°.]|n[uú]mero)\\s*[:.\\-]?\\s*|[:\\-]\\s*)(${IDENTIFIER})`, 'i')]),
      field('cartorio', 'Cartório', 'text', true, ['registro de imóveis', 'serventia'], [/(?:cart[oó]rio|registro\s+de\s+im[oó]veis|serventia)\s*[:\-]?\s*([^\n;]{4,150})/i]),
      field('comarca', 'Comarca', 'text', false, ['comarca'], [/(?:comarca)\s*[:\-]?\s*([^\n;]{3,100})/i]),
      field('proprietario_nome', 'Proprietário', 'text', true, ['proprietário', 'titular'], [/(?:propriet[aá]ri[oa]|titular)\s*[:\-]?\s*([^\n;]{4,150})/i]),
      field('proprietario_cpf_cnpj', 'CPF/CNPJ do proprietário', 'identifier', false, ['cpf/cnpj proprietário'], [/(?:propriet[aá]ri[oa]|titular)[\s\S]{0,220}?(?:cpf|cnpj)\s*[:\-]?\s*([\d.\/-]{11,22})/i]),
      field('imovel_nome', 'Denominação do imóvel', 'text', false, ['imóvel', 'fazenda', 'sítio'], [/(?:im[oó]vel|fazenda|s[ií]tio)\s*(?:denominado)?\s*[:\-]?\s*([^\n;]{3,140})/i]),
      field('area_total', 'Área total', 'area', true, ['área do imóvel'], [new RegExp(`(?:[aá]rea\\s+(?:total|do\\s+im[oó]vel))\\s*[:\\-]?\\s*(${DECIMAL}\\s*(?:ha|hectares?))`, 'i')]),
      field('onus', 'Ônus e averbações', 'text', false, ['ônus reais', 'averbações'], [/(?:[oô]nus(?:\s+reais)?|averba[cç][oõ]es)\s*[:\-]?\s*([^\n]{4,800})/i]),
      field('data_certidao', 'Data da certidão', 'date', false, ['certidão emitida em'], [new RegExp(`(?:data\\s+(?:da\\s+)?certid[aã]o|certid[aã]o\\s+emitida\\s+em)\\s*[:\\-]?\\s*(${DATE})`, 'i')]),
    ],
  },
  car: {
    label: 'Cadastro Ambiental Rural (CAR)',
    fields: [
      field('car', 'Código do CAR', 'identifier', true, ['número do recibo', 'código do imóvel'], [/(?:car|n[uú]mero\s+do\s+recibo|c[oó]digo\s+do\s+im[oó]vel)\s*[:\-]?\s*([A-Z]{2}[\-\dA-Z.]{10,90})/i]),
      field('proprietario_nome', 'Proprietário/possuidor', 'text', true, ['declarante', 'proprietário'], [/(?:propriet[aá]ri[oa]|possuidor|declarante)\s*[:\-]?\s*([^\n;]{4,140})/i]),
      field('proprietario_cpf_cnpj', 'CPF/CNPJ', 'identifier', false, ['cpf/cnpj'], [/(?:cpf|cnpj)\s*[:\-]?\s*([\d.\/-]{11,22})/i]),
      field('imovel_nome', 'Imóvel rural', 'text', false, ['nome do imóvel'], [/(?:nome\s+do\s+im[oó]vel|im[oó]vel\s+rural)\s*[:\-]?\s*([^\n;]{3,140})/i]),
      field('municipio', 'Município', 'text', true, ['município'], [/(?:munic[ií]pio)\s*[:\-]?\s*([^\n;]{3,100})/i]),
      field('uf', 'UF', 'identifier', false, ['estado'], [/(?:uf|estado)\s*[:\-]?\s*([A-Z]{2})\b/i]),
      field('area_total', 'Área total', 'area', true, ['área do imóvel'], [new RegExp(`(?:[aá]rea\\s+(?:total|do\\s+im[oó]vel))\\s*[:\\-]?\\s*(${DECIMAL}\\s*(?:ha|hectares?))`, 'i')]),
      field('data_cadastro', 'Data de cadastro', 'date', false, ['data de inscrição'], [new RegExp(`(?:data\\s+(?:de\\s+)?(?:cadastro|inscri[cç][aã]o))\\s*[:\\-]?\\s*(${DATE})`, 'i')]),
      field('situacao', 'Situação do CAR', 'text', false, ['situação', 'status'], [/(?:situa[cç][aã]o|status)\s*[:\-]?\s*([^\n;]{3,80})/i]),
    ],
  },
  ccir: {
    label: 'Certificado de Cadastro de Imóvel Rural (CCIR)',
    staleAfterDays: 366,
    fields: [
      field('ccir', 'Código do imóvel rural', 'identifier', true, ['código do imóvel', 'número do ccir'], [/(?:ccir|c[oó]digo\s+do\s+im[oó]vel)\s*[:\-]?\s*([\d.\/-]{6,40})/i]),
      field('exercicio', 'Exercício', 'integer', true, ['exercício'], [/(?:exerc[ií]cio)\s*[:\-]?\s*(20\d{2})/i]),
      field('proprietario_nome', 'Titular', 'text', true, ['detentor', 'titular'], [/(?:titular|detentor|propriet[aá]ri[oa])\s*[:\-]?\s*([^\n;]{4,140})/i]),
      field('proprietario_cpf_cnpj', 'CPF/CNPJ', 'identifier', false, ['cpf/cnpj'], [/(?:cpf|cnpj)\s*[:\-]?\s*([\d.\/-]{11,22})/i]),
      field('imovel_nome', 'Imóvel rural', 'text', true, ['denominação do imóvel'], [/(?:denomina[cç][aã]o\s+do\s+im[oó]vel|im[oó]vel\s+rural)\s*[:\-]?\s*([^\n;]{3,140})/i]),
      field('municipio', 'Município', 'text', true, ['município'], [/(?:munic[ií]pio)\s*[:\-]?\s*([^\n;]{3,100})/i]),
      field('area_total', 'Área total', 'area', true, ['área total'], [new RegExp(`(?:[aá]rea\\s+total)\\s*[:\\-]?\\s*(${DECIMAL}\\s*(?:ha|hectares?))`, 'i')]),
      field('modulo_fiscal', 'Módulo fiscal', 'area', false, ['módulo fiscal'], [new RegExp(`(?:m[oó]dulo\\s+fiscal)\\s*[:\\-]?\\s*(${DECIMAL})`, 'i')]),
      field('data_emissao', 'Data de emissão', 'date', false, ['emissão'], [new RegExp(`(?:data\\s+(?:de\\s+)?emiss[aã]o|emitido\\s+em)\\s*[:\\-]?\\s*(${DATE})`, 'i')]),
    ],
  },
  itr: {
    label: 'ITR / DITR',
    staleAfterDays: 366,
    fields: [
      field('cib_nirf', 'CIB/NIRF', 'identifier', true, ['nirf', 'cib'], [/(?:nirf|cib)\s*[:\-]?\s*([\d.\/-]{5,40})/i]),
      field('exercicio', 'Exercício', 'integer', true, ['ano-calendário'], [/(?:exerc[ií]cio|ano[\s-]calend[aá]rio)\s*[:\-]?\s*(20\d{2})/i]),
      field('contribuinte_nome', 'Contribuinte', 'text', true, ['declarante'], [/(?:contribuinte|declarante)\s*[:\-]?\s*([^\n;]{4,140})/i]),
      field('contribuinte_cpf_cnpj', 'CPF/CNPJ', 'identifier', false, ['cpf/cnpj'], [/(?:cpf|cnpj)\s*[:\-]?\s*([\d.\/-]{11,22})/i]),
      field('imovel_nome', 'Imóvel rural', 'text', true, ['nome do imóvel'], [/(?:nome\s+do\s+im[oó]vel|im[oó]vel\s+rural)\s*[:\-]?\s*([^\n;]{3,140})/i]),
      field('area_total', 'Área total', 'area', true, ['área total'], [new RegExp(`(?:[aá]rea\\s+total)\\s*[:\\-]?\\s*(${DECIMAL}\\s*(?:ha|hectares?))`, 'i')]),
      field('imposto_devido', 'Imposto devido', 'money', false, ['valor do imposto'], [new RegExp(`(?:imposto\\s+devido|valor\\s+do\\s+imposto)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('data_entrega', 'Data de entrega', 'date', false, ['recepção da declaração'], [new RegExp(`(?:data\\s+(?:de\\s+)?entrega|recep[cç][aã]o\\s+da\\s+declara[cç][aã]o)\\s*[:\\-]?\\s*(${DATE})`, 'i')]),
    ],
  },
  extrato_bancario: {
    label: 'Extrato bancário',
    staleAfterDays: 90,
    fields: [
      field('instituicao', 'Instituição financeira', 'text', true, ['banco'], [/(?:banco|institui[cç][aã]o)\s*[:\-]?\s*([^\n;]{3,100})/i]),
      field('agencia', 'Agência', 'identifier', false, ['ag'], [/(?:ag[eê]ncia|ag\.)\s*[:\-]?\s*([\d.\-]{2,20})/i]),
      field('conta', 'Conta', 'identifier', true, ['conta corrente'], [/(?:conta(?:\s+corrente)?|c\/c)\s*[:\-]?\s*([\d.\-]{3,30})/i]),
      field('titular_nome', 'Titular', 'text', true, ['correntista'], [/(?:titular|correntista)\s*[:\-]?\s*([^\n;]{4,140})/i]),
      field('titular_cpf_cnpj', 'CPF/CNPJ', 'identifier', false, ['cpf/cnpj'], [/(?:cpf|cnpj)\s*[:\-]?\s*([\d.\/-]{11,22})/i]),
      field('periodo_inicio', 'Início do período', 'date', true, ['período inicial'], [new RegExp(`(?:per[ií]odo|de)\\s*[:\\-]?\\s*(${DATE})\\s*(?:a|at[eé])`, 'i')]),
      field('periodo_fim', 'Fim do período', 'date', true, ['período final'], [new RegExp(`(?:a|at[eé])\\s*(${DATE})`, 'i')]),
      field('saldo_inicial', 'Saldo inicial', 'money', false, ['saldo anterior'], [new RegExp(`(?:saldo\\s+(?:inicial|anterior))\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('saldo_final', 'Saldo final', 'money', true, ['saldo atual'], [new RegExp(`(?:saldo\\s+(?:final|atual))\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
    ],
  },
  balanco_patrimonial: {
    label: 'Balanço patrimonial',
    staleAfterDays: 366,
    fields: [
      field('entidade_nome', 'Entidade', 'text', true, ['razão social'], [/(?:raz[aã]o\s+social|entidade)\s*[:\-]?\s*([^\n;]{4,140})/i]),
      field('entidade_cnpj', 'CNPJ', 'identifier', false, ['cnpj'], [/(?:cnpj)\s*[:\-]?\s*([\d.\/-]{14,22})/i]),
      field('data_base', 'Data-base', 'date', true, ['encerrado em'], [new RegExp(`(?:data[\s-]base|encerrado\\s+em|em\\s+)\\s*[:\\-]?\\s*(${DATE})`, 'i')]),
      field('ativo_total', 'Ativo total', 'money', true, ['total do ativo'], [new RegExp(`(?:ativo\\s+total|total\\s+do\\s+ativo)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('ativo_circulante', 'Ativo circulante', 'money', false, ['ativo circulante'], [new RegExp(`(?:ativo\\s+circulante)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('passivo_total', 'Passivo total', 'money', true, ['total do passivo'], [new RegExp(`(?:passivo\\s+total|total\\s+do\\s+passivo)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('passivo_circulante', 'Passivo circulante', 'money', false, ['passivo circulante'], [new RegExp(`(?:passivo\\s+circulante)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('patrimonio_liquido', 'Patrimônio líquido', 'money', true, ['patrimônio líquido'], [new RegExp(`(?:patrim[oô]nio\\s+l[ií]quido)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
    ],
  },
  dre: {
    label: 'Demonstração do Resultado (DRE)',
    staleAfterDays: 366,
    fields: [
      field('entidade_nome', 'Entidade', 'text', true, ['razão social'], [/(?:raz[aã]o\s+social|entidade)\s*[:\-]?\s*([^\n;]{4,140})/i]),
      field('entidade_cnpj', 'CNPJ', 'identifier', false, ['cnpj'], [/(?:cnpj)\s*[:\-]?\s*([\d.\/-]{14,22})/i]),
      field('periodo', 'Período', 'text', true, ['período da demonstração'], [/(?:per[ií]odo|exerc[ií]cio)\s*[:\-]?\s*([^\n;]{4,80})/i]),
      field('receita_liquida', 'Receita líquida', 'money', true, ['receita operacional líquida'], [new RegExp(`(?:receita\\s+(?:operacional\\s+)?l[ií]quida)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('custos', 'Custos', 'money', false, ['custos dos produtos'], [new RegExp(`(?:custos?(?:\\s+dos\\s+produtos|\\s+das\\s+vendas)?)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('lucro_bruto', 'Lucro bruto', 'money', false, ['resultado bruto'], [new RegExp(`(?:lucro\\s+bruto|resultado\\s+bruto)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('despesas_operacionais', 'Despesas operacionais', 'money', false, ['despesas operacionais'], [new RegExp(`(?:despesas\\s+operacionais)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('resultado_financeiro', 'Resultado financeiro', 'money', false, ['resultado financeiro'], [new RegExp(`(?:resultado\\s+financeiro)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('lucro_liquido', 'Lucro/prejuízo líquido', 'money', true, ['resultado líquido'], [new RegExp(`(?:(?:lucro|preju[ií]zo|resultado)\\s+l[ií]quido)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
    ],
  },
  proposta: {
    label: 'Proposta',
    fields: [
      field('numero_proposta', 'Número da proposta', 'identifier', false, ['proposta nº'], [new RegExp(`proposta\\s*(?:(?:n[ºo°.]|n[uú]mero)\\s*[:.\\-]?\\s*|[:\\-]\\s*)(${IDENTIFIER})`, 'i')]),
      field('cliente_nome', 'Cliente', 'text', true, ['proponente'], [/(?:cliente|proponente)\s*[:\-]?\s*([^\n;]{4,140})/i]),
      field('cliente_cpf_cnpj', 'CPF/CNPJ', 'identifier', false, ['cpf/cnpj'], [/(?:cpf|cnpj)\s*[:\-]?\s*([\d.\/-]{11,22})/i]),
      field('credor_nome', 'Credor/instituição', 'text', true, ['banco', 'credor'], [/(?:credor|banco|institui[cç][aã]o)\s*[:\-]?\s*([^\n;]{3,120})/i]),
      field('valor_proposta', 'Valor proposto', 'money', true, ['valor da proposta'], [new RegExp(`(?:valor\\s+(?:da\\s+)?proposta|valor\\s+proposto)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
      field('taxa_juros', 'Taxa', 'percentage', false, ['taxa de juros'], [new RegExp(`(?:taxa\\s+(?:de\\s+)?juros)\\s*[:\\-]?\\s*(${DECIMAL}\\s*%[^\\n;]{0,18})`, 'i')]),
      field('prazo', 'Prazo', 'text', false, ['prazo total'], [/(?:prazo(?:\s+total)?)\s*[:\-]?\s*([^\n;]{2,70})/i]),
      field('validade', 'Validade', 'date', true, ['válida até'], [new RegExp(`(?:validade|v[aá]lida\\s+at[eé])\\s*[:\\-]?\\s*(${DATE})`, 'i')]),
      field('honorarios', 'Honorários', 'money', false, ['honorários'], [new RegExp(`(?:honor[aá]rios)\\s*[:\\-]?\\s*(${MONEY})`, 'i')]),
    ],
  },
  outro: { label: 'Outro documento', fields: [] },
}

function field(
  key: string,
  label: string,
  type: SpecializedFieldValueType,
  required = false,
  aliases: string[] = [],
  patterns: RegExp[] = [],
): FieldDefinition {
  return { key, label, type, required, aliases, patterns }
}

const CLASSIFICATION_RULES: Array<{ type: SpecializedDocumentType; weight: number; pattern: RegExp }> = [
  { type: 'cpr', weight: 12, pattern: /c[eé]dula\s+de\s+produto\s+rural|\bCPR\b/i },
  { type: 'ccb', weight: 12, pattern: /c[eé]dula\s+de\s+cr[eé]dito\s+banc[aá]rio|\bCCB\b/i },
  { type: 'car', weight: 11, pattern: /cadastro\s+ambiental\s+rural|recibo\s+de\s+inscri[cç][aã]o\s+do\s+im[oó]vel\s+rural/i },
  { type: 'ccir', weight: 11, pattern: /certificado\s+de\s+cadastro\s+de\s+im[oó]vel\s+rural|\bCCIR\b/i },
  { type: 'itr', weight: 11, pattern: /imposto\s+territorial\s+rural|declara[cç][aã]o\s+do\s+itr|\bDITR\b|\bNIRF\b/i },
  { type: 'matricula_imovel', weight: 10, pattern: /matr[ií]cula\s+(?:do\s+)?im[oó]vel|cart[oó]rio\s+de\s+registro\s+de\s+im[oó]veis|certid[aã]o\s+de\s+inteiro\s+teor/i },
  { type: 'balanco_patrimonial', weight: 10, pattern: /balan[cç]o\s+patrimonial|ativo\s+circulante[\s\S]{0,300}passivo\s+circulante/i },
  { type: 'dre', weight: 10, pattern: /demonstra[cç][aã]o\s+do\s+resultado|\bDRE\b|receita\s+l[ií]quida[\s\S]{0,300}(?:lucro|preju[ií]zo)\s+l[ií]quido/i },
  { type: 'extrato_bancario', weight: 9, pattern: /extrato\s+(?:banc[aá]rio|de\s+conta)|saldo\s+(?:anterior|inicial)[\s\S]{0,300}saldo\s+(?:atual|final)/i },
  { type: 'proposta', weight: 8, pattern: /proposta\s+(?:comercial|de\s+cr[eé]dito|de\s+renegocia[cç][aã]o)|condi[cç][oõ]es\s+da\s+proposta/i },
  { type: 'contrato', weight: 8, pattern: new RegExp(EXPLICIT_CONTRACT_NUMBER, 'i') },
  { type: 'contrato', weight: 7, pattern: /contrato\s+(?:de\s+)?(?:cr[eé]dito|financiamento|m[uú]tuo)|c[eé]dula\s+de\s+cr[eé]dito\s+rural/i },
]

export async function classifySpecializedDocument(doc: IngestedDocument): Promise<SpecializedClassification> {
  const corpus = `${doc.filename}\n${doc.extractedText || ''}`.slice(0, 40_000)
  const scores = new Map<SpecializedDocumentType, { score: number; signals: string[]; filename: boolean }>()
  for (const rule of CLASSIFICATION_RULES) {
    const match = corpus.match(rule.pattern)
    if (!match) continue
    const fromFilename = rule.pattern.test(doc.filename)
    const current = scores.get(rule.type) || { score: 0, signals: [], filename: false }
    current.score += rule.weight + (fromFilename ? 4 : 0)
    current.signals.push(match[0].slice(0, 100))
    current.filename ||= fromFilename
    scores.set(rule.type, current)
  }
  const winner = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)[0]
  if (winner) {
    return {
      type: winner[0],
      confidence: Math.min(0.99, 0.62 + winner[1].score / 50),
      method: winner[1].filename ? 'filename' : 'content',
      signals: winner[1].signals,
    }
  }

  const smart = await classifyDocument(doc)
  const mapped: Record<string, SpecializedDocumentType> = {
    contrato_credito_rural: 'contrato',
    proposta_comercial: 'proposta',
    extrato_bancario: 'extrato_bancario',
    planilha_gestao: /balan[cç]o/i.test(corpus) ? 'balanco_patrimonial' : /\bdre\b/i.test(corpus) ? 'dre' : 'outro',
  }
  return {
    type: mapped[smart.tipo] || 'outro',
    confidence: smart.confianca,
    method: mapped[smart.tipo] ? 'smart_classifier' : 'fallback',
    signals: [smart.tipo],
  }
}

export async function extractSpecializedDocument(
  doc: IngestedDocument,
  classification: SpecializedClassification,
): Promise<SpecializedExtraction> {
  const profile = profiles[classification.type]
  const deterministic = extractDeterministic(doc, profile)
  const smart = extractSmartFields(doc, profile)
  let fields = mergeFields([...deterministic, ...smart])
  const required = profile.fields.filter((item) => item.required)
  const coverage = required.length === 0 ? 1 : required.filter((item) => fields.some((value) => value.fieldKey === item.key)).length / required.length

  if (isOpenAIEnabled() && classification.type !== 'outro' && (coverage < 1 || fields.length < Math.max(3, required.length))) {
    const structured = await extractWithStructuredOutput(doc, classification.type, profile).catch((error) => {
      console.warn('[SpecializedDocumentExtractor] structured output falhou:', (error as Error).message)
      return []
    })
    fields = mergeFields([...fields, ...structured])
  }

  fields = fields.map((item) => ({ ...item, expiresAt: item.expiresAt || inferExpiry(item, profile) }))
  const missingRequiredFields = required.filter((item) => !fields.some((value) => value.fieldKey === item.key)).map((item) => item.key)
  const confidence = fields.length
    ? fields.reduce((sum, item) => sum + item.confidence, 0) / fields.length
    : 0
  return {
    type: classification.type,
    fields,
    missingRequiredFields,
    confidence: Math.max(0, Math.min(1, confidence)),
    method: fields.some((item) => item.extractor === 'structured_output') ? 'hybrid' : 'deterministic',
    profileVersion: '2026-08-20.v1',
  }
}

function extractDeterministic(doc: IngestedDocument, profile: DocumentProfile): SpecializedField[] {
  const text = doc.extractedText || ''
  const fields: SpecializedField[] = []
  for (const definition of profile.fields) {
    for (const pattern of definition.patterns || []) {
      pattern.lastIndex = 0
      const match = pattern.exec(text)
      const value = cleanValue(match?.[1])
      if (!match || match.index == null || !value) continue
      const evidenceText = literalWindow(text, match.index, match[0].length)
      fields.push(buildField(definition, value, evidenceText, `${doc.kind}:regex`, 0.9, 'deterministic'))
      break
    }
  }
  return fields
}

function extractSmartFields(doc: IngestedDocument, profile: DocumentProfile): SpecializedField[] {
  const smart = doc.metadata?.smartExtraction as Record<string, unknown> | undefined
  const evidence = Array.isArray(smart?.evidencias) ? smart.evidencias as Array<Record<string, unknown>> : []
  const out: SpecializedField[] = []
  for (const item of evidence) {
    const rawKey = normalizeKey(item.field)
    const definition = profile.fields.find((candidate) => {
      const keys = [candidate.key, candidate.label, ...(candidate.aliases || [])].map(normalizeKey)
      return keys.some((key) => key === rawKey || key.includes(rawKey) || rawKey.includes(key))
    })
    const evidenceText = cleanValue(item.trecho)
    const value = cleanValue(item.value)
    if (!definition || !evidenceText || !value || !containsLiteral(doc.extractedText || '', evidenceText)) continue
    if (!evidenceContainsValue(evidenceText, value, definition.type)) continue
    out.push({
      ...buildField(definition, value, evidenceText, cleanValue(item.fonte) || `${doc.kind}:smart`, clampConfidence(item.confianca, 0.75), 'smart'),
      page: positiveInteger(item.page),
    })
  }
  return out
}

async function extractWithStructuredOutput(
  doc: IngestedDocument,
  type: SpecializedDocumentType,
  profile: DocumentProfile,
): Promise<SpecializedField[]> {
  const schema = {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            fieldKey: { type: 'string', enum: profile.fields.map((item) => item.key) },
            valueText: { type: 'string' },
            evidenceText: { type: 'string' },
            page: { type: 'integer', minimum: 1 },
            sheet: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['fieldKey', 'valueText', 'evidenceText', 'confidence'],
        },
      },
      missingFields: { type: 'array', items: { type: 'string' } },
    },
    required: ['fields', 'missingFields'],
  }
  const fieldGuide = profile.fields.map((item) => `- ${item.key}: ${item.label}; tipo=${item.type}; obrigatório=${Boolean(item.required)}`).join('\n')
  const system = `Você extrai dados de ${profile.label} para uma esteira documental auditável da ALETIS.
Regras obrigatórias:
- extraia apenas valores presentes literalmente no documento;
- valueText deve preservar o valor como texto. Nunca converta dinheiro em número JSON;
- evidenceText deve ser um trecho curto e literal que contenha valueText;
- não calcule, não suponha e não complete campos ausentes;
- use somente as chaves permitidas abaixo.

${fieldGuide}`
  const context = `Arquivo: ${doc.filename}\nTipo esperado: ${type}\n\n${(doc.extractedText || '').slice(0, 100_000)}`
  const content = await buildDocumentModelContent(doc, context)
  const response = await generateStructured<{ fields?: Array<Record<string, unknown>> }>([{ role: 'user', content }], {
    name: `esteira_${type}`,
    schema,
    system,
    model: getModelForRole('doc_extractor'),
    maxTokens: 3_500,
    reasoning: { effort: 'medium' },
  })
  const definitions = new Map(profile.fields.map((item) => [item.key, item]))
  return (Array.isArray(response.data.fields) ? response.data.fields : []).flatMap((item): SpecializedField[] => {
    const definition = definitions.get(cleanValue(item.fieldKey))
    const value = cleanValue(item.valueText)
    const evidenceText = cleanValue(item.evidenceText)
    if (!definition || !value || !evidenceText || !containsLiteral(doc.extractedText || '', evidenceText)) return []
    if (!evidenceContainsValue(evidenceText, value, definition.type)) return []
    return [{
      ...buildField(definition, value, evidenceText, `${doc.kind}:structured-output`, clampConfidence(item.confidence, 0.7), 'structured_output'),
      page: positiveInteger(item.page),
      sheet: cleanValue(item.sheet) || undefined,
    }]
  })
}

function buildField(
  definition: FieldDefinition,
  valueText: string,
  evidenceText: string,
  evidenceSource: string,
  confidence: number,
  extractor: SpecializedField['extractor'],
): SpecializedField {
  return {
    fieldKey: definition.key,
    valueText,
    normalizedValue: normalizeValue(valueText, definition.type),
    valueType: definition.type,
    confidence,
    evidenceText: evidenceText.slice(0, 1_500),
    evidenceSource,
    extractor,
  }
}

function mergeFields(fields: SpecializedField[]): SpecializedField[] {
  const byField = new Map<string, SpecializedField>()
  const extractorPriority: Record<SpecializedField['extractor'], number> = {
    structured_output: 3,
    deterministic: 2,
    smart: 1,
  }
  for (const item of fields) {
    if (!item.fieldKey || !item.normalizedValue || !item.evidenceText) continue
    const current = byField.get(item.fieldKey)
    const stronger = !current
      || item.confidence > current.confidence
      || (item.confidence === current.confidence && extractorPriority[item.extractor] > extractorPriority[current.extractor])
      || (item.confidence === current.confidence && extractorPriority[item.extractor] === extractorPriority[current.extractor]
        && item.evidenceText.length > current.evidenceText.length)
    if (stronger) {
      byField.set(item.fieldKey, item)
    }
  }
  return [...byField.values()].sort((a, b) => a.fieldKey.localeCompare(b.fieldKey))
}

function inferExpiry(item: SpecializedField, profile: DocumentProfile): string | undefined {
  if (item.fieldKey === 'validade' || item.fieldKey === 'data_vencimento') return toIsoDate(item.valueText)
  if (!profile.staleAfterDays) return undefined
  const base = item.fieldKey === 'periodo_fim' || item.fieldKey === 'data_base' || item.fieldKey === 'data_emissao' || item.fieldKey === 'data_entrega'
    ? toIsoDate(item.valueText)
    : item.fieldKey === 'exercicio' && /^20\d{2}$/.test(item.normalizedValue)
      ? `${item.normalizedValue}-12-31`
      : undefined
  if (!base) return undefined
  const date = new Date(`${base}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return undefined
  date.setUTCDate(date.getUTCDate() + profile.staleAfterDays)
  return date.toISOString()
}

export function documentFamilyKey(doc: Pick<IngestedDocument, 'filename' | 'clienteId' | 'sessionId'>, type: SpecializedDocumentType, fields: SpecializedField[]): string {
  const identifierKeys = ['numero_contrato', 'numero_cpr', 'numero_ccb', 'matricula', 'car', 'ccir', 'cib_nirf', 'conta', 'numero_proposta']
  const identifier = identifierKeys.map((key) => fields.find((item) => item.fieldKey === key)?.normalizedValue).find(Boolean)
  const baseName = doc.filename
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,6}$/i, '')
    .replace(/\b(?:v(?:ersao)?\s*)?\d+(?:\.\d+)*\b/g, ' ')
    .replace(/\b20\d{2}[-_.]?\d{0,2}[-_.]?\d{0,2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const raw = `${doc.clienteId || doc.sessionId}:${type}:${identifier || baseName}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 40)
}

function normalizeValue(value: string, type: SpecializedFieldValueType): string {
  const text = cleanValue(value)
  if (type === 'identifier') return text.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (type === 'date') return toIsoDate(text) || normalizeText(text)
  if (type === 'money' || type === 'percentage' || type === 'area' || type === 'integer') {
    const match = text.match(/-?\d[\d.\s]*(?:,\d+)?/)
    if (!match) return normalizeText(text)
    const compact = match[0].replace(/\s/g, '')
    return compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact
  }
  return normalizeText(text)
}

function toIsoDate(value: string): string | undefined {
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[0]
  const br = value.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/)
  if (!br) return undefined
  const year = br[3].length === 2 ? `${Number(br[3]) < 50 ? '20' : '19'}${br[3]}` : br[3]
  const candidate = `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  return Number.isNaN(new Date(`${candidate}T00:00:00.000Z`).getTime()) ? undefined : candidate
}

function literalWindow(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 100)
  const end = Math.min(text.length, index + length + 100)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

function cleanValue(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 2_000)
}

function normalizeText(value: unknown): string {
  // O limite de tamanho é para campos, nunca para o corpus de validação.
  return String(value ?? '').replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function normalizedDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function containsLiteral(corpus: string, quote: string): boolean {
  const normalizedQuote = normalizeText(quote)
  return normalizedQuote.length >= 3 && normalizeText(corpus).includes(normalizedQuote)
}

function evidenceContainsValue(evidence: string, value: string, type: SpecializedFieldValueType): boolean {
  const literal = normalizeText(value)
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const boundary = type === 'text' ? '[^\\p{L}\\p{N}]' : '[^\\p{L}\\p{N}.,/-]'
  const start = /^[\p{L}\p{N}]/u.test(literal) ? `(?:^|${boundary})` : ''
  const end = /[\p{L}\p{N}]$/u.test(literal) ? `(?:$|${boundary})` : ''
  if (literal && new RegExp(`${start}${escaped}${end}`, 'u').test(normalizeText(evidence))) return true
  // A equivalência de formatação numérica não comprova nomes/textos, nem
  // pode procurar uma sequência vazia (que String.includes sempre aceita).
  const digits = normalizedDigits(value)
  if (type === 'text' || !digits) return false
  if (type === 'identifier' && /[a-z]/i.test(value)) return false
  return (evidence.match(/\d[\d.,/\-]*/g) || []).some((token) => normalizedDigits(token) === digits)
}

function normalizeKey(value: unknown): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function clampConfidence(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
}

function positiveInteger(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

export function getSpecializedDocumentProfiles(): Readonly<Record<SpecializedDocumentType, DocumentProfile>> {
  return profiles
}

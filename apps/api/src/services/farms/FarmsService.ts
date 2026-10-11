/**
 * FARMS Service - Calculadora de Viabilidade Agricola v6.
 *
 * Converte a planilha "Calculadora de Viabilidade Agricola FARMS v6.xlsm"
 * em planos persistentes por cliente. A planilha original tem 4 abas
 * produtivas (Soja, Arroz, Milho, Trigo), 1.529 formulas e 2.899 celulas
 * preenchidas; aqui as formulas viram calculo nativo e os itens viram
 * campos editaveis.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type {
  FarmsCenarioId,
  FarmsCenarioInput,
  FarmsCenarioResultado,
  FarmsCreatePayload,
  FarmsCultura,
  FarmsFormulaItem,
  FarmsItem,
  FarmsItemResultado,
  FarmsPlano,
  FarmsResultado,
  FarmsUpdatePayload,
} from '@aletis/shared-types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const STORAGE_DIR = join(__dirname, '..', '..', '..', 'storage', 'farms')

const ORIGEM_PLANILHA =
  'Calculadora de Viabilidade Agricola FARMS v6.xlsm'

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

function genId(): string {
  return 'farms_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function nowIso(): string {
  return new Date().toISOString()
}

function n(value: unknown, fallback = 0): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function r(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0
  const m = Math.pow(10, digits)
  return Math.round(value * m) / m
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
}

type ItemDraft = Omit<FarmsItem, 'id' | 'grupo' | 'ordem' | 'formula'> & {
  formula?: FarmsFormulaItem
}

type Template = {
  cultura: FarmsCultura
  nome: string
  precoBaseRsSc: number
  unidadeSacaKg: number
  conversaoSacaParaQq?: number
  variaveis: ItemDraft[]
  fixos: ItemDraft[]
  cenarios: Omit<FarmsCenarioInput, 'id' | 'nome'>[]
}

function v(
  centroCusto: string,
  descricao: string,
  quantidadePorHa = 0,
  unidade = '',
  valorUnitario = 0,
  opts: Partial<ItemDraft> = {},
): ItemDraft {
  return {
    centroCusto,
    descricao,
    quantidadePorHa,
    unidade,
    valorUnitario,
    formula: 'insumo',
    ...opts,
  }
}

function f(
  centroCusto: string,
  descricao: string,
  formula: FarmsFormulaItem,
  opts: Partial<ItemDraft> = {},
): ItemDraft {
  return { centroCusto, descricao, formula, ...opts }
}

function expand(grupo: 'variavel' | 'fixo', itens: ItemDraft[]): FarmsItem[] {
  return itens.map((item, index) => ({
    id: `${grupo}-${String(index + 1).padStart(3, '0')}-${slug(item.centroCusto)}`,
    grupo,
    ordem: index + 1,
    formula: item.formula ?? 'insumo',
    centroCusto: item.centroCusto,
    descricao: item.descricao,
    areaHa: item.areaHa,
    coeficiente: item.coeficiente,
    quantidadePorHa: item.quantidadePorHa,
    unidade: item.unidade,
    valorUnitario: item.valorUnitario,
    percentual: item.percentual,
    valorTotalManual: item.valorTotalManual,
    observacoes: item.observacoes,
  }))
}

const CENARIO_LABELS: Record<FarmsCenarioId, string> = {
  pessimista: 'Pessimista',
  normal: 'Normal',
  otimista: 'Otimista',
  excelente: 'Excelente',
}

function cenarios(values: Template['cenarios']): FarmsCenarioInput[] {
  const ids: FarmsCenarioId[] = ['pessimista', 'normal', 'otimista', 'excelente']
  return ids.map((id, index) => ({ id, nome: CENARIO_LABELS[id], ...values[index] }))
}

const TEMPLATES: Record<FarmsCultura, Template> = {
  soja: {
    cultura: 'soja',
    nome: 'FARMS Soja 2025/26',
    precoBaseRsSc: 125,
    unidadeSacaKg: 60,
    variaveis: [
      v('Talhao 1', 'Variedade 1', 65, 'kg', 12, { areaHa: 50 }),
      v('Talhao 2', 'Variedade 2', 65, 'kg', 12, { areaHa: 20 }),
      v('Talhao 3', 'Variedade 3', 70, 'kg', 7, { areaHa: 30 }),
      v('Talhao 4', 'Variedade 4', 0, 'kg', 0),
      v('Talhao 5', 'Variedade 5', 0, 'kg', 0),
      v('Talhao 6', 'Variedade 6', 0, 'kg', 0),
      v('Tratamento de semente', 'P1+P2+P3', 67, 'kg', 1),
      v('Condicionador solo Biologico', 'Bio', 0, 'l', 0),
      v('Fertilizante Cobertura', 'KCl', 150, 'kg', 2.3),
      v('Fertilizante de Base', 'MAP', 150, 'kg', 4),
      v('Inoculante Azo - Pseudo', 'Biofree', 1, 'ml', 10),
      v('Inoculante Brad', 'Rizotrop', 6, 'kg', 4),
      v('Condicionador de Calda', 'Adjuvante 1', 13, 'Ds', 3),
      v('Dessecante Pre semeadura', 'Glyphosate', 2.5, 'L', 22),
      v('Adjuvante', 'Adjuvante 2', 0.5, 'L', 15),
      v('Antideriva', 'P', 0.075, 'L', 74),
      v('Herbicidade Folha larga', '2,4D', 1.5, 'L', 16.5),
      v('Herbicida 2', 'Herb 2', 0.8, 'L', 26),
      v('Adjuvante Mineral', 'Oleo', 1.5, 'L', 29.6),
      v('Herbicida Pre Emergente', 'S-metalaclor', 1, 'L', 44.95),
      v('Herbicida Contato', 'Glufosinato', 2.5, 'L', 16.9),
      v('Herbicida pre-emergente 2', 'Sulfentrazone', 0.3, 'L', 105),
      v('Aplic 1 - Dessecante', 'WG Glyphosate', 1.6, 'kg', 24.9),
      v('Aplic 1 - Inseticida Fisio', 'Game', 0.12, 'L', 60),
      v('Aplic 1 - Nutricao Foliar', 'Starter Mn', 1, 'L', 15),
      v('Aplic 1 - Herbecida Seletivo', 'Cletodim', 0.5, 'L', 26),
      v('Aplic 2 - Dessecante', 'WG Glyphosate', 1.5, 'L', 24.9),
      v('Aplic 2 - Inseticida Fisio+choq', 'Certeiro', 0.075, 'L', 146.62),
      v('Aplic 2 - Nutricao Foliar', 'Starter Mn', 1, 'L', 15),
      v('Aplic 3 V4-V5 - Fungicida 1', 'ex Nativo', 0.6, 'L', 74.78),
      v('Aplic 3 - Oleo', 'Aureo', 0.25, 'L', 19.46),
      v('Aplic 3 - Inseticida Percev', '', 0, 'L', 39.5),
      v('Aplic 3 - Inseticida Lagarta', '', 0, 'L', 60),
      v('Aplic 3 - Fung Biologico', '', 0, 'L', 0),
      v('Aplic 4 - Fungicida 2', 'Fox Xpro', 0.5, 'L', 272.57),
      v('Aplic 4 - Fungicida 2 Bio', 'Bombardeiro', 0.3, 'L', 113.68),
      v('Aplic 4 - Fungicida Multi', 'Unizeb', 2, 'kg', 25),
      v('Aplic 4 - Oleo', 'Aureo', 0.25, 'L', 19.46),
      v('Aplic 4 - Inseticida Biologico', 'V core', 1, 'L', 39.5),
      v('Aplic 4 - Nutricao Foliar', 'Fertipeixe', 0.5, 'L', 35),
      v('Aplic 5 - Fungicida 3', 'Fox Supra', 0.35, 'L', 382.78),
      v('Aplic 5 - Fungicida Bio', '', 0, '', 0),
      v('Aplic 5 - Nutricao Foliar', 'Boro', 0.5, 'L', 39),
      v('Aplic 5 - Oleo', 'Oleo', 0.25, 'L', 19.46),
      v('Aplic 5 - Inseticida Percevejo', 'Sperto', 0.2, 'kg', 188.87),
      v('Aplic 5 - Fungicida 3 Multi', 'Unizeb', 1, 'kg', 25),
      v('Aplic 6 - Fungicida 4', 'Sphere Max', 0.2, 'L', 243.93),
      v('Aplic 6 - Oleo', 'Aureo', 0.25, 'L', 19.46),
      v('Aplic 6 - Fungicida 4 Multi', 'Unizeb', 1, 'kg', 25),
      v('Herbicida Contato', 'Aurora', 0.1, 'L', 584),
      v('Bio Estimulante / Nutricao', 'Crop+/Concorde', 0.25, 'L', 129),
      v('Combustivel Diesel', 'TRR Cavera', 35, 'L', 6),
      v('Luz Irrigacao (pivos) Estimado', 'R$/ha/volta', 0, 'Giros', 15),
      v('Aplicacao Aerea / Drone', 'Numero de aplicacoes', 2, 'ha', 80),
      v('Corretivos de Solo', 'Calcario', 0.5, 'T', 193),
    ],
    fixos: [
      f('MO Permanente+Encargos', '1 colaborador por 13,3 meses', 'mensal', { coeficiente: 1, quantidadePorHa: 13.3, unidade: 'Mes', valorUnitario: 3000 }),
      f('Mao-de obra Temporaria', '1 pessoa por 30 dias', 'mensal', { coeficiente: 1, quantidadePorHa: 30, unidade: 'Dias', valorUnitario: 150 }),
      f('Alimentacao Funcionarios', '1 referencia por 12 meses', 'mensal', { coeficiente: 1, quantidadePorHa: 12, unidade: 'Mes', valorUnitario: 200 }),
      f('Manutencao de maquinas', '% do desembolso variavel', 'percentual_variavel', { percentual: 0.02, unidade: '%' }),
      f('Arrendamento Fixo', 'Numero de sacas por hectare', 'sacas_ha', { quantidadePorHa: 10, unidade: 'sc/ha' }),
      f('Prestacao Equipamentos', 'Investimentos em sacas por hectare', 'sacas_ha', { quantidadePorHa: 5, unidade: 'sc/ha' }),
      f('Juros s/ Capital / Financiamento', '% ao ano sobre variaveis', 'percentual_variavel', { percentual: 0.12, unidade: '%' }),
    ],
    cenarios: [
      { produtividadeKgHa: 3000, umidadeImpurezasPct: 0.02, secagemPct: 0, arrendamentoPct: 0, freteRsSc: 3, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
      { produtividadeKgHa: 3500, umidadeImpurezasPct: 0.02, secagemPct: 0, arrendamentoPct: 0, freteRsSc: 3, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
      { produtividadeKgHa: 4000, umidadeImpurezasPct: 0.02, secagemPct: 0, arrendamentoPct: 0, freteRsSc: 3, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
      { produtividadeKgHa: 4200, umidadeImpurezasPct: 0.02, secagemPct: 0, arrendamentoPct: 0, freteRsSc: 3, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
    ],
  },
  arroz: {
    cultura: 'arroz',
    nome: 'FARMS Arroz 2025/26',
    precoBaseRsSc: 80,
    unidadeSacaKg: 50,
    conversaoSacaParaQq: 1.7424,
    variaveis: [
      v('Semente Talhao 1', 'IRGA 424 RI', 90, 'kg', 5, { areaHa: 60 }),
      v('Semente Talhao 2', 'OS 902', 85, 'kg', 5, { areaHa: 40 }),
      v('Semente Talhao 3', '', 0, 'kg', 0),
      v('Semente Talhao 4', '', 0, 'kg', 0),
      v('Tratamento de Sementes', 'Standak Top+', 85, 'kg', 1),
      v('Fertilizante de Base', 'MAP', 180, 'kg', 3.8),
      v('Fertilizante Complementar', 'KCL', 180, 'kg', 2.2),
      v('Fertilizante de Cobertura 1', '45-0-0', 200, 'kg', 2.3),
      v('Fertilizante de Cobertura 2', '30-0-20', 80, 'kg', 2.5),
      v('Fertilizante de Cobertura 3', '40-0-0-6', 0, 'kg', 2.4),
      v('Tratamento Biologico', 'Azo', 1.5, 'ds', 8),
      v('Dessecante Pre-Semeadura', 'Glyphosate', 4, 'L', 22),
      v('Herbicida Pre-semeadura', 'ally', 0.004, 'L', 700),
      v('Dessecante Ponto de Agulha', 'Glyphosate', 2, 'L', 22),
      v('Herbicida Pre-emergente', 'Gamit', 1.2, 'L', 90),
      v('Herbicida Seletivo I', 'Kifix', 0.25, 'Kg', 800),
      v('Inseticida Lagarta', 'Karate', 0.075, 'l', 100),
      v('Adjuvante', 'Dash', 0.305, 'L', 700),
      v('Herbicida Seletivo II', '', 0, 'L', 0),
      v('Adjuvante', '', 0, 'L', 0),
      v('Aviacao Agricola / Drone', 'Numero de aplicacoes', 4, 'L', 80),
      v('Inseticida I', 'Difenuron', 0.12, 'L', 117.14),
      v('Inseticida II', 'V Core', 1, 'kg', 37.93),
      v('Fungicida I', 'Nativo', 0.8, 'L', 80),
      v('Adjuvante II', 'Aureo', 0.25, 'L', 22),
      v('Fungicida II', '', 0, '', 0),
      v('Adjuvante II', 'Aureo', 0.25, 'l', 22),
      v('Nutricao Foliar', 'Fosfito de K (k+)', 1, 'kg', 35),
      v('Nutricao Foliar II', 'Crop+', 0.25, 'l', 150),
      v('Combustivel / Diesel', 'TRR', 180, 'L', 5.8),
      v('Luz Irrigacao Estimado', 'Dias Irrigacao', 100, 'Dias', 3),
      v('Corretivos de Solo', 'Calcario + Aplicacao', 1.5, 'T', 190),
    ],
    fixos: [
      f('MO Permanente+Encargos', '1 colaborador por 13,3 meses', 'mensal', { coeficiente: 1, quantidadePorHa: 13.3, unidade: 'Mes', valorUnitario: 3000 }),
      f('Mao-de obra Temporaria', '1 pessoa por 30 dias', 'mensal', { coeficiente: 1, quantidadePorHa: 30, unidade: 'Dias', valorUnitario: 200 }),
      f('Alimentacao Funcionarios', '0,5 referencia por 12 meses', 'mensal', { coeficiente: 1, quantidadePorHa: 12, unidade: 'Mes', valorUnitario: 500 }),
      f('Manutencao de maquinas', '% do desembolso variavel', 'percentual_variavel', { percentual: 0.12, unidade: '%' }),
      f('Arrendamento Fixo', 'Numero de sacas por hectare', 'sacas_ha', { quantidadePorHa: 20, unidade: 'sc/ha' }),
      f('Prestacao Equipamentos', 'Depreciacao em sacas por hectare', 'sacas_ha', { quantidadePorHa: 20, unidade: 'sc/ha' }),
      f('Juros s/ Capital de Giro', '% ano desembolso', 'percentual_variavel', { percentual: 0.12, unidade: '%' }),
      f('Taxas Fepam, seguros, contador, assessorias', '% ano desembolso', 'percentual_variavel', { percentual: 0.02, unidade: '%' }),
    ],
    cenarios: [
      { produtividadeKgHa: 9500, umidadeImpurezasPct: 0.14, secagemPct: 0.07, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.05, assistenciaPct: 0.02 },
      { produtividadeKgHa: 10500, umidadeImpurezasPct: 0.14, secagemPct: 0.07, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.05, assistenciaPct: 0.02 },
      { produtividadeKgHa: 11100, umidadeImpurezasPct: 0.14, secagemPct: 0.07, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.05, assistenciaPct: 0.02 },
      { produtividadeKgHa: 12000, umidadeImpurezasPct: 0.14, secagemPct: 0.07, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.05, assistenciaPct: 0.02 },
    ],
  },
  milho: {
    cultura: 'milho',
    nome: 'FARMS Milho 2025/26',
    precoBaseRsSc: 80,
    unidadeSacaKg: 60,
    variaveis: [
      v('Semente Talhao 1', 'Pionner', 24, 'kg', 55, { areaHa: 50 }),
      v('Semente Talhao 2', 'Dekalb', 25, 'kg', 60, { areaHa: 30 }),
      v('Semente Talhao 3', 'Agroeste', 22, 'kg', 48, { areaHa: 20 }),
      v('Semente Talhao 4', '', 0, 'kg', 0),
      v('Tratamento de Semente', 'Standak Top', 0, 'kg', 1),
      v('Fertilizante de Base', 'MAP', 200, 'kg', 4),
      v('Fertilizante Complementar', 'KCL', 200, 'kg', 2.5),
      v('Fertilizante de Cobertura 1', '45-0-0', 200, 'kg', 2.8),
      v('Fertilizante de Cobertura 2', '30-0-20', 100, 'kg', 2.5),
      v('Fertilizante de Cobertura 3', '40-0-0-6', 100, 'kg', 2.6),
      v('Biologicos', 'Azo', 1.5, 'ds', 8),
      v('Herbicida Pre-semeadura', '2,4 D', 2, 'L', 18),
      v('Dessecante pre-semeadura', 'Roundap', 3, 'L', 22),
      v('Adjuvante I', 'Iharol Gold', 0.2, 'L', 22),
      v('Herbicida pre-emergente', '', 0, 'L', 0),
      v('Herbicida Seletivo I', '', 0, 'L', 0),
      v('Adjuvante', '', 0, 'L', 0),
      v('Herbicida Seletivo II', '', 0, 'L', 0),
      v('Inseticida Cigarrinha I', '', 0, 'L', 0),
      v('Adjuvante', '', 0, 'L', 0),
      v('Inseticida Biologico', '', 0, 'L', 0),
      v('Inseticida Cigarrinha II', '', 0, 'L', 0),
      v('Inseticida Lagarta', '', 0, 'L', 0),
      v('Adjuvante', '', 0, 'L', 0),
      v('Inseticida Cigarrinha III', '', 0, 'L', 0),
      v('Inseticida', '', 0, 'kg', 0),
      v('Adjuvante', '', 0, 'L', 0),
      v('Fungicida I', 'Nativo', 0.75, 'L', 90),
      v('Adjuvante', 'Aureo', 0.25, 'L', 22),
      v('Fungicida II', '', 0, 'L', 0),
      v('Adjuvante', '', 0, 'L', 0),
      v('Nutricao Foliar I', 'Fosfito K', 1, 'kg', 30),
      v('Nutricao Foliar II', '', 0, 'L', 0),
      v('Aviacao Agricola / Drone', 'Numero de aplicacoes', 2, 'und', 80),
      v('Combustivel / Diesel', 'TRR', 30, 'L', 5.8),
      v('Luz Irrigacao Pivo Estimado', 'R$/ha/volta', 0, 'Giros', 15),
      v('Corretivos de Solo', 'Calcario+Aplicacao', 1, 'T', 200),
    ],
    fixos: [
      f('MO Permanente+Encargos', '1 colaborador por 13,3 meses', 'mensal', { coeficiente: 1, quantidadePorHa: 13.3, unidade: 'Mes', valorUnitario: 3000 }),
      f('Mao-de obra Temporaria', '1 pessoa por 5 dias', 'mensal', { coeficiente: 1, quantidadePorHa: 5, unidade: 'Dias', valorUnitario: 200 }),
      f('Alimentacao Funcionarios', '0,5 referencia por 2 meses', 'mensal', { coeficiente: 1, quantidadePorHa: 2, unidade: 'Mes', valorUnitario: 500 }),
      f('Manutencao de maquinas', '% do desembolso variavel', 'percentual_variavel', { percentual: 0.05, unidade: '%' }),
      f('Arrendamento Fixo', 'Numero de sacas por hectare', 'sacas_ha', { quantidadePorHa: 20, unidade: 'sc/ha' }),
      f('Prestacao Equipamentos', 'Depreciacao em sacas por hectare', 'sacas_ha', { quantidadePorHa: 10, unidade: 'sc/ha' }),
      f('Juros s/ Capital de Giro', '% ano desembolso', 'percentual_variavel', { percentual: 0.12, unidade: '%' }),
      f('Taxas Fepam, seguros, assessorias', '% ano desembolso', 'percentual_variavel', { percentual: 0.02, unidade: '%' }),
    ],
    cenarios: [
      { produtividadeKgHa: 6000, umidadeImpurezasPct: 0.1, secagemPct: 0.06, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
      { produtividadeKgHa: 8000, umidadeImpurezasPct: 0.1, secagemPct: 0.06, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
      { produtividadeKgHa: 10000, umidadeImpurezasPct: 0.1, secagemPct: 0.06, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
      { produtividadeKgHa: 12000, umidadeImpurezasPct: 0.1, secagemPct: 0.06, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
    ],
  },
  trigo: {
    cultura: 'trigo',
    nome: 'FARMS Trigo 2025/26',
    precoBaseRsSc: 70,
    unidadeSacaKg: 60,
    variaveis: [
      v('Semente Talhao 1', 'Ponteiro', 160, 'kg', 3.9, { areaHa: 50 }),
      v('Semente Talhao 2', '', 160, 'kg', 4, { areaHa: 50 }),
      v('Semente Talhao 3', '', 0, 'kg', 0),
      v('Semente Talhao 4', '', 0, 'kg', 0),
      v('Tratamento de Semente', 'Standak Top', 160, 'kg', 0.6),
      v('Inoculante biologico', 'Azo', 1.5, 'ds', 8),
      v('Fertilizante de Base', 'MAP', 100, 'kg', 4),
      v('Fertilizante Complementar', 'KCL', 100, 'kg', 2),
      v('Fertilizante de Cobertura 1', '45-0-0', 100, 'kg', 2.5),
      v('Fertilizante de Cobertura 2', '45-0-0', 70, 'kg', 2.5),
      v('Fertilizante de Cobertura 3', '40-0-0-6', 0, 'kg', 0),
      v('Herbicida Pre-semeadura', '2,4 D', 1.75, 'L', 18),
      v('Dessecante pre-semeadura', 'Roundap', 3, 'L', 22),
      v('Herbicida pre-emergente', 'Dual Gold', 0.4, 'L', 62),
      v('Herbicida Contato', 'Russar', 0.1, 'L', 1150),
      v('Adjuvante I', '', 0.6, 'l', 62),
      v('Herbicida Seletivo I', 'Select', 0.6, 'l', 34.65),
      v('Inseticida Lagarta', 'Trinca', 0.1, 'L', 80),
      v('Adjuvante II', 'Aureo', 0.25, 'L', 20),
      v('Herbicida Seletivo II', '', 0, 'L', 0),
      v('Aviacao Agricola / Drone', 'Numero de aplicacoes', 1, 'L', 80),
      v('Inseticida I', 'Game', 0.12, 'L', 63.5),
      v('Inseticida II', '', 0.3, 'kg', 125),
      v('Fungicida I', 'Fusao', 0.6, 'L', 74),
      v('Adjuvante', 'Iharol', 0.25, 'L', 20),
      v('Fungicida II', 'Nativo', 0.75, 'L', 88),
      v('Adjuvante', 'Aureo x2', 0.5, 'l', 21),
      v('Nutricao Foliar', 'Concorde', 1, 'l', 35),
      v('Nutricao Foliar II', 'Fosfito K', 1, 'kg', 25),
      v('Combustivel / Diesel', 'TRR', 30, 'L', 5.8),
      v('Luz Irrigacao Pivo (Estimado)', 'R$/ha/Volta', 0, 'Giros', 15),
      v('Corretivos de Solo', 'Calcario+Aplicacao', 1, 'T', 200),
    ],
    fixos: [
      f('MO Permanente+Encargos', '1 colaborador por 13,3 meses', 'mensal', { coeficiente: 1, quantidadePorHa: 13.3, unidade: 'Mes', valorUnitario: 2000 }),
      f('Mao-de obra Temporaria', '1 pessoa por 5 dias', 'mensal', { coeficiente: 1, quantidadePorHa: 5, unidade: 'Dias', valorUnitario: 120 }),
      f('Alimentacao Funcionarios', '0,5 referencia por 2 meses', 'mensal', { coeficiente: 1, quantidadePorHa: 2, unidade: 'Mes', valorUnitario: 500 }),
      f('Manutencao de maquinas', '% do desembolso variavel', 'percentual_variavel', { percentual: 0.05, unidade: '%' }),
      f('Arrendamento Fixo', 'Numero de sacas por hectare', 'sacas_ha', { quantidadePorHa: 5, unidade: 'sc/ha' }),
      f('Prestacao Equipamentos', 'Depreciacao em sacas por hectare', 'sacas_ha', { quantidadePorHa: 5, unidade: 'sc/ha' }),
      f('Juros s/ Capital de Giro', '% ano desembolso', 'percentual_variavel', { percentual: 0.12, unidade: '%' }),
      f('Taxas Fepam, seguros, assessorias', '% ano desembolso', 'percentual_variavel', { percentual: 0.02, unidade: '%' }),
    ],
    cenarios: [
      { produtividadeKgHa: 2400, umidadeImpurezasPct: 0.02, secagemPct: 0.02, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
      { produtividadeKgHa: 3000, umidadeImpurezasPct: 0.02, secagemPct: 0.02, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
      { produtividadeKgHa: 3800, umidadeImpurezasPct: 0.02, secagemPct: 0.02, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
      { produtividadeKgHa: 4200, umidadeImpurezasPct: 0.02, secagemPct: 0.02, arrendamentoPct: 0, freteRsSc: 2, colaboradoresPct: 0.02, assistenciaPct: 0.02 },
    ],
  },
}

function createFromTemplate(clienteId: string, payload: FarmsCreatePayload): FarmsPlano {
  const t = TEMPLATES[payload.cultura]
  const agora = nowIso()
  const plano: Omit<FarmsPlano, 'resultado'> = {
    id: genId(),
    clienteId,
    nome: payload.nome || t.nome,
    cultura: t.cultura,
    safra: payload.safra || '2025/26',
    status: 'rascunho',
    criadoEm: agora,
    atualizadoEm: agora,
    origemPlanilha: ORIGEM_PLANILHA,
    areaAplicadaHa: n(payload.areaAplicadaHa, 100),
    areaProdutivaHa: n(payload.areaProdutivaHa, 100),
    precoBaseRsSc: n(payload.precoBaseRsSc, t.precoBaseRsSc),
    unidadeSacaKg: t.unidadeSacaKg,
    conversaoSacaParaQq: t.conversaoSacaParaQq,
    itens: [...expand('variavel', t.variaveis), ...expand('fixo', t.fixos)],
    cenarios: cenarios(t.cenarios),
  }
  return { ...plano, resultado: calcularFarmsPlano(plano as FarmsPlano) }
}

function calcularItem(
  item: FarmsItem,
  plano: Pick<FarmsPlano, 'areaAplicadaHa' | 'areaProdutivaHa' | 'precoBaseRsSc'>,
  totalVariavel: number,
): FarmsItemResultado {
  const areaAplicada = Math.max(n(plano.areaAplicadaHa), 0)
  const areaProdutiva = Math.max(n(plano.areaProdutivaHa), 0)
  const areaBase = item.areaHa !== undefined && n(item.areaHa) > 0 ? n(item.areaHa) : areaAplicada
  const quantidade = n(item.quantidadePorHa)
  const valorUnitario = n(item.valorUnitario)
  const coef = item.coeficiente === undefined ? 1 : n(item.coeficiente, 1)
  const percentual = n(item.percentual)
  const preco = Math.max(n(plano.precoBaseRsSc), 0)

  let quantidadeTotal = 0
  let valorTotal = 0
  let valorPorHa = 0

  switch (item.formula) {
    case 'mensal':
      quantidadeTotal = quantidade * coef
      valorTotal = quantidadeTotal * valorUnitario
      valorPorHa = areaProdutiva > 0 ? valorTotal / areaProdutiva : 0
      break
    case 'percentual_variavel':
      quantidadeTotal = areaProdutiva
      valorTotal = totalVariavel * percentual
      valorPorHa = areaProdutiva > 0 ? valorTotal / areaProdutiva : 0
      break
    case 'sacas_ha':
      quantidadeTotal = quantidade * areaProdutiva
      valorTotal = quantidadeTotal * preco
      valorPorHa = quantidade * preco
      break
    case 'valor_ha':
      quantidadeTotal = areaProdutiva
      valorPorHa = valorUnitario || n(item.valorTotalManual) / Math.max(areaProdutiva, 1)
      valorTotal = valorPorHa * areaProdutiva
      break
    case 'valor_total':
      quantidadeTotal = 1
      valorTotal = n(item.valorTotalManual)
      valorPorHa = areaProdutiva > 0 ? valorTotal / areaProdutiva : 0
      break
    case 'insumo':
    default:
      quantidadeTotal = quantidade * areaBase
      valorPorHa = quantidade * valorUnitario
      valorTotal = quantidadeTotal * valorUnitario
      break
  }

  const sacasPorHa = preco > 0 ? valorPorHa / preco : 0
  return {
    ...item,
    areaBaseHa: r(areaBase, 4),
    quantidadeTotal: r(quantidadeTotal, 4),
    valorPorHa: r(valorPorHa, 4),
    valorTotal: r(valorTotal, 2),
    sacasPorHa: r(sacasPorHa, 4),
  }
}

function calcularCenario(
  cenario: FarmsCenarioInput,
  plano: FarmsPlano,
  desembolsoTotal: number,
): FarmsCenarioResultado {
  const area = Math.max(n(plano.areaProdutivaHa), 0)
  const preco = Math.max(n(plano.precoBaseRsSc), 0)
  const sacaKg = Math.max(n(plano.unidadeSacaKg, 60), 1)

  const produtividadeScHa = n(cenario.produtividadeKgHa) / sacaKg
  const producaoBrutaSc = produtividadeScHa * area
  const descontoUmidadeSc = producaoBrutaSc * n(cenario.umidadeImpurezasPct)
  const producaoSecaSc = producaoBrutaSc - descontoUmidadeSc
  const secagemSc = producaoBrutaSc * n(cenario.secagemPct)
  const arrendamentoSc = producaoSecaSc * n(cenario.arrendamentoPct)
  const freteSc = preco > 0 ? producaoBrutaSc * (n(cenario.freteRsSc) / preco) : 0
  const colaboradoresSc = producaoSecaSc * n(cenario.colaboradoresPct)
  const assistenciaSc = producaoSecaSc * n(cenario.assistenciaPct)
  const descontosSc = secagemSc + arrendamentoSc + freteSc + colaboradoresSc + assistenciaSc
  const disponivelSc = producaoSecaSc - descontosSc
  const disponivelRs = disponivelSc * preco
  const desembolsoSc = preco > 0 ? desembolsoTotal / preco : 0
  const lucroLiquidoSc = disponivelSc - desembolsoSc
  const lucroLiquidoRs = disponivelRs - desembolsoTotal
  const custoTotalScHa = area > 0 ? (desembolsoSc + descontosSc) / area : 0
  const producaoLiquidaScHa = area > 0 ? producaoSecaSc / area : 0
  const lucroScHa = producaoLiquidaScHa - custoTotalScHa
  const custoTotalRsHa = custoTotalScHa * preco
  const producaoLiquidaRsHa = producaoLiquidaScHa * preco
  const lucroRsHa = producaoLiquidaRsHa - custoTotalRsHa
  const custoRsSc = producaoSecaSc > 0 ? ((desembolsoSc + descontosSc) * preco) / producaoSecaSc : 0
  const margemPct = disponivelRs > 0 ? lucroLiquidoRs / disponivelRs : 0

  return {
    ...cenario,
    produtividadeScHa: r(produtividadeScHa, 4),
    producaoBrutaSc: r(producaoBrutaSc, 2),
    descontoUmidadeSc: r(descontoUmidadeSc, 2),
    producaoSecaSc: r(producaoSecaSc, 2),
    secagemSc: r(secagemSc, 2),
    arrendamentoSc: r(arrendamentoSc, 2),
    freteSc: r(freteSc, 2),
    colaboradoresSc: r(colaboradoresSc, 2),
    assistenciaSc: r(assistenciaSc, 2),
    disponivelSc: r(disponivelSc, 2),
    disponivelRs: r(disponivelRs, 2),
    desembolsoSc: r(desembolsoSc, 2),
    desembolsoRs: r(desembolsoTotal, 2),
    lucroLiquidoSc: r(lucroLiquidoSc, 2),
    lucroLiquidoRs: r(lucroLiquidoRs, 2),
    custoTotalScHa: r(custoTotalScHa, 4),
    producaoLiquidaScHa: r(producaoLiquidaScHa, 4),
    lucroScHa: r(lucroScHa, 4),
    custoTotalRsHa: r(custoTotalRsHa, 2),
    producaoLiquidaRsHa: r(producaoLiquidaRsHa, 2),
    lucroRsHa: r(lucroRsHa, 2),
    custoRsSc: r(custoRsSc, 2),
    margemPct: r(margemPct, 4),
    veredicto: margemPct >= 0.15 ? 'viavel' : margemPct >= 0.05 ? 'atencao' : 'inviavel',
  }
}

export function calcularFarmsPlano(plano: FarmsPlano): FarmsResultado {
  const variaveisBase = plano.itens
    .filter((it) => it.grupo === 'variavel')
    .map((it) => calcularItem(it, plano, 0))
  const totalVariavel = variaveisBase.reduce((acc, it) => acc + it.valorTotal, 0)
  const fixos = plano.itens
    .filter((it) => it.grupo === 'fixo')
    .map((it) => calcularItem(it, plano, totalVariavel))
  const itens = [...variaveisBase, ...fixos].sort((a, b) => {
    if (a.grupo !== b.grupo) return a.grupo === 'variavel' ? -1 : 1
    return a.ordem - b.ordem
  })
  const totalFixo = fixos.reduce((acc, it) => acc + it.valorTotal, 0)
  const desembolsoTotal = totalVariavel + totalFixo
  const area = Math.max(n(plano.areaProdutivaHa), 0)
  const preco = Math.max(n(plano.precoBaseRsSc), 0)
  const desembolsoSc = preco > 0 ? desembolsoTotal / preco : 0
  const cenariosCalc = plano.cenarios.map((c) => calcularCenario(c, plano, desembolsoTotal))
  const sorted = [...cenariosCalc].sort((a, b) => a.lucroLiquidoRs - b.lucroLiquidoRs)
  const avisos: string[] = []

  if (area <= 0) avisos.push('Area produtiva precisa ser maior que zero.')
  if (preco <= 0) avisos.push('Preco base por saca precisa ser maior que zero.')
  if (plano.itens.length === 0) avisos.push('Nenhum item de custo informado.')
  if (cenariosCalc.every((c) => c.lucroLiquidoRs < 0)) {
    avisos.push('Todos os cenarios projetam lucro liquido negativo.')
  }

  return {
    calculadoEm: nowIso(),
    itens,
    totalVariavel: r(totalVariavel, 2),
    totalFixo: r(totalFixo, 2),
    desembolsoTotal: r(desembolsoTotal, 2),
    desembolsoPorHa: r(area > 0 ? desembolsoTotal / area : 0, 2),
    desembolsoSc: r(desembolsoSc, 2),
    desembolsoScHa: r(area > 0 ? desembolsoSc / area : 0, 4),
    pontoEquilibrioScHa: r(area > 0 ? desembolsoSc / area : 0, 4),
    precoEquilibrioRsSc: r(sorted[1]?.producaoSecaSc ? desembolsoTotal / sorted[1].producaoSecaSc : 0, 2),
    cenarios: cenariosCalc,
    melhorCenarioId: sorted.at(-1)?.id,
    piorCenarioId: sorted[0]?.id,
    avisos,
  }
}

export class FarmsService {
  private readonly dir: string
  private static instance: FarmsService | null = null

  constructor(baseDir: string = STORAGE_DIR) {
    this.dir = baseDir
    mkdirSync(this.dir, { recursive: true })
  }

  static getInstance(): FarmsService {
    if (!this.instance) this.instance = new FarmsService()
    return this.instance
  }

  private fileFor(id: string): string {
    return join(this.dir, `${safeId(id)}.json`)
  }

  private writeAtomic(plano: FarmsPlano): void {
    const final = this.fileFor(plano.id)
    const tmp = `${final}.tmp`
    writeFileSync(tmp, JSON.stringify(plano, null, 2), 'utf8')
    renameSync(tmp, final)
  }

  private normalize(plano: FarmsPlano): FarmsPlano {
    return {
      ...plano,
      areaAplicadaHa: n(plano.areaAplicadaHa),
      areaProdutivaHa: n(plano.areaProdutivaHa),
      precoBaseRsSc: n(plano.precoBaseRsSc),
      unidadeSacaKg: n(plano.unidadeSacaKg, 60),
      itens: (plano.itens || []).map((it, index) => ({
        ...it,
        id: it.id || `${it.grupo}-${String(index + 1).padStart(3, '0')}-${slug(it.centroCusto || 'item')}`,
        ordem: n(it.ordem, index + 1),
        centroCusto: it.centroCusto || 'Item sem nome',
        formula: it.formula || 'insumo',
        areaHa: it.areaHa === undefined ? undefined : n(it.areaHa),
        coeficiente: it.coeficiente === undefined ? undefined : n(it.coeficiente),
        quantidadePorHa: it.quantidadePorHa === undefined ? undefined : n(it.quantidadePorHa),
        valorUnitario: it.valorUnitario === undefined ? undefined : n(it.valorUnitario),
        percentual: it.percentual === undefined ? undefined : n(it.percentual),
        valorTotalManual: it.valorTotalManual === undefined ? undefined : n(it.valorTotalManual),
      })),
      cenarios: (plano.cenarios || []).map((c) => ({
        ...c,
        nome: c.nome || CENARIO_LABELS[c.id],
        produtividadeKgHa: n(c.produtividadeKgHa),
        umidadeImpurezasPct: n(c.umidadeImpurezasPct),
        secagemPct: n(c.secagemPct),
        arrendamentoPct: n(c.arrendamentoPct),
        freteRsSc: n(c.freteRsSc),
        colaboradoresPct: n(c.colaboradoresPct),
        assistenciaPct: n(c.assistenciaPct),
      })),
    }
  }

  criar(clienteId: string, payload: FarmsCreatePayload): FarmsPlano {
    const plano = this.normalize(createFromTemplate(clienteId, payload))
    plano.resultado = calcularFarmsPlano(plano)
    this.writeAtomic(plano)
    return plano
  }

  buscar(id: string): FarmsPlano | null {
    const file = this.fileFor(id)
    if (!existsSync(file)) return null
    try {
      const plano = this.normalize(JSON.parse(readFileSync(file, 'utf8')) as FarmsPlano)
      return { ...plano, resultado: calcularFarmsPlano(plano) }
    } catch (err) {
      console.warn(`[FarmsService] falha lendo ${file}`, err)
      return null
    }
  }

  listarPorCliente(clienteId: string): FarmsPlano[] {
    if (!existsSync(this.dir)) return []
    const planos: FarmsPlano[] = []
    for (const file of readdirSync(this.dir).filter((f) => f.endsWith('.json'))) {
      try {
        const plano = this.normalize(JSON.parse(readFileSync(join(this.dir, file), 'utf8')) as FarmsPlano)
        if (plano.clienteId === clienteId) planos.push({ ...plano, resultado: calcularFarmsPlano(plano) })
      } catch {
        // ignora arquivo corrompido
      }
    }
    return planos.sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))
  }

  atualizar(id: string, patch: FarmsUpdatePayload): FarmsPlano | null {
    const atual = this.buscar(id)
    if (!atual) return null
    const novo = this.normalize({
      ...atual,
      ...patch,
      id: atual.id,
      clienteId: atual.clienteId,
      criadoEm: atual.criadoEm,
      origemPlanilha: atual.origemPlanilha,
      atualizadoEm: nowIso(),
      itens: patch.itens ?? atual.itens,
      cenarios: patch.cenarios ?? atual.cenarios,
      resultado: atual.resultado,
    } as FarmsPlano)
    novo.resultado = calcularFarmsPlano(novo)
    this.writeAtomic(novo)
    return novo
  }

  recalcular(id: string): FarmsPlano | null {
    const plano = this.buscar(id)
    if (!plano) return null
    plano.resultado = calcularFarmsPlano(plano)
    plano.atualizadoEm = nowIso()
    this.writeAtomic(plano)
    return plano
  }

  duplicar(id: string, safra?: string): FarmsPlano | null {
    const origem = this.buscar(id)
    if (!origem) return null
    const agora = nowIso()
    const novo = this.normalize({
      ...origem,
      id: genId(),
      nome: `${origem.nome} - copia`,
      safra: safra || origem.safra,
      status: 'rascunho',
      criadoEm: agora,
      atualizadoEm: agora,
    })
    novo.resultado = calcularFarmsPlano(novo)
    this.writeAtomic(novo)
    return novo
  }

  deletar(id: string): boolean {
    const file = this.fileFor(id)
    if (!existsSync(file)) return false
    try {
      unlinkSync(file)
      return true
    } catch {
      return false
    }
  }
}

export function getFarmsService(): FarmsService {
  return FarmsService.getInstance()
}

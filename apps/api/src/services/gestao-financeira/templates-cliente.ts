// ============================================================
// templates-cliente — perfis agro típicos que pré-populam um
// grupo com estrutura realista (culturas, custos, contratos).
// ============================================================
import { getGestaoFinanceiraService } from './GestaoFinanceiraService.js'

export interface TemplateAplicado {
  template: string
  rotulo: string
  culturas: number
  custos: number
  contratos: number
}

interface CulturaSeed {
  cultura: string
  area: number
  rendimento: number
  preco: number
  custo: number
  arrendamento?: number
}

interface CustoSeed {
  tipo: 'operacional' | 'fixo' | 'arrendamento'
  descricao: string
  valor: number
}

interface ContratoSeed {
  credor: string
  enquadramento: string
  valor: number
  prazo: number
  taxa: number
  metodo: 'PRICE' | 'SAC' | 'BULLET'
}

interface Template {
  rotulo: string
  safra: string
  culturas: CulturaSeed[]
  custos: CustoSeed[]
  contratos: ContratoSeed[]
}

const CURRENT_SAFRA = (() => {
  const now = new Date()
  const yy = now.getFullYear() % 100
  const mm = now.getMonth() + 1
  if (mm < 7) return `${String((yy - 1) % 100).padStart(2, '0')}/${String(yy).padStart(2, '0')}`
  return `${String(yy).padStart(2, '0')}/${String((yy + 1) % 100).padStart(2, '0')}`
})()

const TEMPLATES: Record<string, Template> = {
  'soja-mt': {
    rotulo: 'Produtor de Soja — Mato Grosso',
    safra: CURRENT_SAFRA,
    culturas: [
      { cultura: 'Soja Sequeiro', area: 3000, rendimento: 62, preco: 135, custo: 85 },
      { cultura: 'Milho Safrinha', area: 2400, rendimento: 110, preco: 65, custo: 35 },
      { cultura: 'Algodão', area: 600, rendimento: 280, preco: 5, custo: 3, arrendamento: 0 },
    ],
    custos: [
      { tipo: 'operacional', descricao: 'Combustível e lubrificantes', valor: 850000 },
      { tipo: 'operacional', descricao: 'Manutenção máquinas', valor: 420000 },
      { tipo: 'operacional', descricao: 'Transporte/logística', valor: 380000 },
      { tipo: 'operacional', descricao: 'Seguro Agrícola/Proagro', valor: 320000 },
      { tipo: 'fixo', descricao: 'Pró-labore', valor: 480000 },
      { tipo: 'fixo', descricao: 'Folha de pagamento administrativa', valor: 720000 },
      { tipo: 'fixo', descricao: 'Energia/comunicação', valor: 96000 },
      { tipo: 'arrendamento', descricao: 'Arrendamento de terras', valor: 1800000 },
    ],
    contratos: [
      { credor: 'Banco do Brasil', enquadramento: 'custeio', valor: 12000000, prazo: 12, taxa: 9.5, metodo: 'BULLET' },
      { credor: 'Sicredi', enquadramento: 'investimento', valor: 4500000, prazo: 60, taxa: 8.5, metodo: 'SAC' },
      { credor: 'Bradesco', enquadramento: 'comercializacao', valor: 3000000, prazo: 18, taxa: 11.5, metodo: 'PRICE' },
    ],
  },
  'cafe-mg': {
    rotulo: 'Cafeicultor — Sul de Minas',
    safra: CURRENT_SAFRA,
    culturas: [
      { cultura: 'Café Arábica (Própria)', area: 280, rendimento: 35, preco: 1100, custo: 700 },
      { cultura: 'Café Conilon', area: 80, rendimento: 50, preco: 850, custo: 550 },
    ],
    custos: [
      { tipo: 'operacional', descricao: 'Mão de obra colheita', valor: 480000 },
      { tipo: 'operacional', descricao: 'Beneficiamento/secagem', valor: 240000 },
      { tipo: 'operacional', descricao: 'Sacaria/insumos pós-colheita', valor: 80000 },
      { tipo: 'fixo', descricao: 'Pró-labore', valor: 240000 },
      { tipo: 'fixo', descricao: 'Folha permanente', valor: 360000 },
      { tipo: 'fixo', descricao: 'Tributos e licenças', valor: 60000 },
    ],
    contratos: [
      { credor: 'Sicoob', enquadramento: 'pronamp-custeio', valor: 1800000, prazo: 12, taxa: 9.5, metodo: 'BULLET' },
      { credor: 'Banco do Nordeste', enquadramento: 'investimento', valor: 950000, prazo: 84, taxa: 7.5, metodo: 'SAC' },
    ],
  },
  'boi-go': {
    rotulo: 'Pecuarista de corte — Goiás',
    safra: CURRENT_SAFRA,
    culturas: [
      { cultura: 'Pastagem Cultivada', area: 1800, rendimento: 8, preco: 320, custo: 180 },
      { cultura: 'Confinamento', area: 0, rendimento: 480, preco: 320, custo: 240 },
    ],
    custos: [
      { tipo: 'operacional', descricao: 'Suplementação mineral/sal', valor: 320000 },
      { tipo: 'operacional', descricao: 'Vacinação/sanidade', valor: 180000 },
      { tipo: 'operacional', descricao: 'Manutenção pasto/cercas', valor: 150000 },
      { tipo: 'operacional', descricao: 'Transporte boiadas', valor: 220000 },
      { tipo: 'fixo', descricao: 'Folha vaqueiros', valor: 480000 },
      { tipo: 'fixo', descricao: 'Pró-labore', valor: 360000 },
      { tipo: 'arrendamento', descricao: 'Arrendamento pasto/retiros', valor: 720000 },
    ],
    contratos: [
      { credor: 'Bradesco', enquadramento: 'pecuária-custeio', valor: 2400000, prazo: 18, taxa: 10.5, metodo: 'BULLET' },
      { credor: 'Banco do Brasil', enquadramento: 'pecuária-investimento', valor: 1800000, prazo: 60, taxa: 9.0, metodo: 'SAC' },
    ],
  },
  'cana-sp': {
    rotulo: 'Fornecedor de cana — São Paulo',
    safra: CURRENT_SAFRA,
    culturas: [
      { cultura: 'Cana de Açúcar (1ª colheita)', area: 1200, rendimento: 90, preco: 110, custo: 60 },
      { cultura: 'Cana de Açúcar (soca)', area: 800, rendimento: 75, preco: 110, custo: 45 },
    ],
    custos: [
      { tipo: 'operacional', descricao: 'CTT — Corte/Carregamento/Transporte', valor: 2400000 },
      { tipo: 'operacional', descricao: 'Tratos culturais', valor: 1200000 },
      { tipo: 'operacional', descricao: 'Adubação cobertura', valor: 720000 },
      { tipo: 'fixo', descricao: 'Pró-labore + folha admin', valor: 540000 },
      { tipo: 'fixo', descricao: 'Tributos rurais', valor: 180000 },
    ],
    contratos: [
      { credor: 'Itaú BBA', enquadramento: 'cana-custeio', valor: 4800000, prazo: 12, taxa: 10.0, metodo: 'BULLET' },
      { credor: 'Santander', enquadramento: 'cana-renovação', valor: 3200000, prazo: 84, taxa: 8.0, metodo: 'SAC' },
    ],
  },
}

export function listarTemplatesCliente(): Array<{ id: string; rotulo: string }> {
  return Object.entries(TEMPLATES).map(([id, tpl]) => ({ id, rotulo: tpl.rotulo }))
}

export async function aplicarTemplateCliente(grupoId: string, templateId: string): Promise<TemplateAplicado> {
  const tpl = TEMPLATES[templateId]
  if (!tpl) throw new Error(`Template "${templateId}" não existe. Disponíveis: ${Object.keys(TEMPLATES).join(', ')}`)
  const svc = getGestaoFinanceiraService()

  let culturas = 0, custos = 0, contratos = 0

  for (const c of tpl.culturas) {
    await svc.upsertCultura({
      grupoId,
      cultura: c.cultura,
      safra: tpl.safra,
      cenario: 'planejado',
      areaPropriaHa: String(c.area * 0.7) as any,
      areaArrendadaHa: String(c.area * 0.3) as any,
      rendimentoScHa: String(c.rendimento) as any,
      precoMedioRs: String(c.preco) as any,
      custoUnitarioInsumosRs: String(c.custo) as any,
      arrendamentoBaseScHa: String(c.arrendamento ?? 18) as any,
    })
    culturas++
  }

  for (const c of tpl.custos) {
    await svc.upsertCusto({
      grupoId,
      safra: tpl.safra,
      tipo: c.tipo,
      descricao: c.descricao,
      valorAnual: String(c.valor) as any,
      valorMensal: String(c.valor / 12) as any,
    })
    custos++
  }

  const today = new Date().toISOString().slice(0, 10)
  for (const c of tpl.contratos) {
    await svc.upsertContrato({
      grupoId,
      credor: c.credor,
      contrato: `${templateId.toUpperCase()}-${c.credor.replace(/\s/g, '')}-001`,
      valorFinanciado: String(c.valor) as any,
      prazoParcelas: c.prazo,
      taxaNominalAa: String(c.taxa) as any,
      periodicidade: c.metodo === 'BULLET' ? 'final' : 'mensal',
      metodoCalculo: c.metodo,
      enquadramento: c.enquadramento,
      dataContratacao: today,
      primeiraParcela: today,
    })
    contratos++
  }

  return { template: templateId, rotulo: tpl.rotulo, culturas, custos, contratos }
}

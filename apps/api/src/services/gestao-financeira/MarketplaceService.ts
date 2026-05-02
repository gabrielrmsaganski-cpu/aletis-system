// ============================================================
// MarketplaceService — templates de cliente compartilháveis
// ============================================================
import { eq, and, or, desc, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb, isPgEnabled } from '../../db/client.js'
import { gfTemplateMarketplace, type GfTemplateMarketplace } from '../../db/schema.js'
import { getGestaoFinanceiraService } from './GestaoFinanceiraService.js'

function id(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

export interface CapturarTemplateInput {
  grupoId: string
  slug: string
  rotulo: string
  descricao?: string
  categoria: string
  emoji?: string
  visibilidade?: 'private' | 'consultor' | 'global'
  consultorId?: string
  consultorNome?: string
}

export interface AplicarTemplateInput {
  grupoId: string
  templateSlug: string
}

export class MarketplaceService {
  /** Captura snapshot do grupo atual e salva como template no marketplace. */
  async capturarTemplate(input: CapturarTemplateInput): Promise<GfTemplateMarketplace> {
    if (!isPgEnabled()) throw new Error('PG desabilitado')
    const svc = getGestaoFinanceiraService()
    const db = getDb()

    const [culturas, custos, contratos, fazendas] = await Promise.all([
      svc.listarCulturas(input.grupoId),
      svc.listarCustos(input.grupoId),
      svc.listarContratos(input.grupoId),
      svc.listarFazendas(input.grupoId),
    ])

    // Despersonaliza: remove ids, datas absolutas, valores específicos do cliente
    const culturasGen = culturas.map((c) => ({
      cultura: c.cultura,
      safra: c.safra,
      cenario: c.cenario,
      areaPropriaHa: c.areaPropriaHa,
      areaArrendadaHa: c.areaArrendadaHa,
      rendimentoScHa: c.rendimentoScHa,
      precoMedioRs: c.precoMedioRs,
      custoUnitarioInsumosRs: c.custoUnitarioInsumosRs,
      arrendamentoBaseScHa: c.arrendamentoBaseScHa,
      unidade: c.unidade,
    }))
    const custosGen = custos.map((c) => ({
      tipo: c.tipo,
      descricao: c.descricao,
      cultura: c.cultura,
      safra: c.safra,
      valorAnual: c.valorAnual,
      valorMensal: c.valorMensal,
    }))
    const contratosGen = contratos.map((c) => ({
      credor: c.credor,
      enquadramento: c.enquadramento,
      finalidade: c.finalidade,
      valorFinanciado: c.valorFinanciado,
      prazoParcelas: c.prazoParcelas,
      taxaNominalAa: c.taxaNominalAa,
      periodicidade: c.periodicidade,
      metodoCalculo: c.metodoCalculo,
    }))
    const fazendasGen = fazendas.map((f) => ({
      fazenda: f.fazenda,
      cidade: f.cidade,
      estado: f.estado,
      areaTotalHa: f.areaTotalHa,
      areaPlantioHa: f.areaPlantioHa,
      valorHaMercado: f.valorHaMercado,
    }))

    const payload = {
      culturas: culturasGen,
      custos: custosGen,
      contratos: contratosGen,
      fazendas: fazendasGen,
    }
    const contadores = {
      culturas: culturas.length,
      custos: custos.length,
      contratos: contratos.length,
      fazendas: fazendas.length,
    }

    const novo = {
      id: id('tpl'),
      slug: input.slug,
      rotulo: input.rotulo,
      descricao: input.descricao ?? null,
      categoria: input.categoria,
      emoji: input.emoji ?? null,
      visibilidade: input.visibilidade ?? 'private',
      autorConsultorId: input.consultorId ?? null,
      autorNome: input.consultorNome ?? null,
      payload: payload as any,
      contadores: contadores as any,
      usoCount: 0,
      isOficial: false,
    }
    await db.insert(gfTemplateMarketplace).values(novo)
    const r = await db.select().from(gfTemplateMarketplace).where(eq(gfTemplateMarketplace.id, novo.id)).limit(1)
    return r[0]
  }

  /** Lista templates visíveis ao consultor (proprios + da carteira + globais + oficiais). */
  async listarTemplates(consultorId?: string): Promise<GfTemplateMarketplace[]> {
    if (!isPgEnabled()) return []
    const db = getDb()
    if (!consultorId) {
      // sem consultor: apenas globais + oficiais
      return db
        .select()
        .from(gfTemplateMarketplace)
        .where(or(eq(gfTemplateMarketplace.visibilidade, 'global'), eq(gfTemplateMarketplace.isOficial, true)))
        .orderBy(desc(gfTemplateMarketplace.usoCount))
    }
    return db
      .select()
      .from(gfTemplateMarketplace)
      .where(
        or(
          eq(gfTemplateMarketplace.visibilidade, 'global'),
          eq(gfTemplateMarketplace.isOficial, true),
          and(
            eq(gfTemplateMarketplace.autorConsultorId, consultorId),
          ),
        ),
      )
      .orderBy(desc(gfTemplateMarketplace.usoCount))
  }

  async obterTemplate(slug: string): Promise<GfTemplateMarketplace | null> {
    if (!isPgEnabled()) return null
    const r = await getDb().select().from(gfTemplateMarketplace).where(eq(gfTemplateMarketplace.slug, slug)).limit(1)
    return r[0] ?? null
  }

  /** Aplica template do marketplace em um grupo. */
  async aplicarTemplate(input: AplicarTemplateInput): Promise<{ aplicados: { culturas: number; custos: number; contratos: number; fazendas: number } }> {
    if (!isPgEnabled()) throw new Error('PG desabilitado')
    const tpl = await this.obterTemplate(input.templateSlug)
    if (!tpl) throw new Error(`Template "${input.templateSlug}" não encontrado`)
    const svc = getGestaoFinanceiraService()
    const payload = tpl.payload as any
    const aplicados = { culturas: 0, custos: 0, contratos: 0, fazendas: 0 }

    for (const c of payload.culturas ?? []) {
      try {
        await svc.upsertCultura({ ...c, grupoId: input.grupoId })
        aplicados.culturas++
      } catch {}
    }
    for (const c of payload.custos ?? []) {
      try {
        await svc.upsertCusto({ ...c, grupoId: input.grupoId, safra: c.safra ?? '24/25' })
        aplicados.custos++
      } catch {}
    }
    for (const c of payload.contratos ?? []) {
      try {
        await svc.upsertContrato({
          ...c,
          grupoId: input.grupoId,
          dataContratacao: new Date().toISOString().slice(0, 10),
          primeiraParcela: new Date().toISOString().slice(0, 10),
        })
        aplicados.contratos++
      } catch {}
    }
    for (const f of payload.fazendas ?? []) {
      try {
        await svc.upsertFazenda({ ...f, grupoId: input.grupoId })
        aplicados.fazendas++
      } catch {}
    }

    // incrementa contador de uso
    const db = getDb()
    await db
      .update(gfTemplateMarketplace)
      .set({ usoCount: (tpl.usoCount ?? 0) + 1 })
      .where(eq(gfTemplateMarketplace.id, tpl.id))

    return { aplicados }
  }

  async deletarTemplate(slug: string, consultorId?: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const tpl = await this.obterTemplate(slug)
    if (!tpl) return
    if (tpl.isOficial) throw new Error('Templates oficiais não podem ser deletados')
    if (consultorId && tpl.autorConsultorId && tpl.autorConsultorId !== consultorId) {
      throw new Error('Apenas o autor pode deletar este template')
    }
    await db.delete(gfTemplateMarketplace).where(eq(gfTemplateMarketplace.slug, slug))
  }
}

let _instance: MarketplaceService | null = null
export function getMarketplaceService(): MarketplaceService {
  if (!_instance) _instance = new MarketplaceService()
  return _instance
}

// ============================================================
// GestaoFinanceiraService — orquestra leitura/escrita das 8
// entidades GF + chama os calculators e persiste snapshots.
// ============================================================
import { eq, and, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb, isPgEnabled } from '../../db/client.js'
import {
  gfGrupo,
  gfMembro,
  gfCulturaSafra,
  gfCustoSafra,
  gfDemanda,
  gfContratoDivida,
  gfAtivoFazenda,
  gfSnapshotCalculo,
  type GfGrupo,
  type GfMembro,
  type GfCulturaSafra,
  type GfCustoSafra,
  type GfDemanda,
  type GfContratoDivida,
  type GfAtivoFazenda,
} from '../../db/schema.js'
import { consolidarSafra, type SafraConsolidado } from './calculo/safra-calculator.js'
import { getChangelogService } from './ChangelogService.js'
import {
  consolidarEndividamento,
  type EndividamentoConsolidado,
} from './calculo/endividamento-calculator.js'
import { computeRaioX, type RaioXOutput } from './calculo/raio-x-calculator.js'

function id(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

export class GestaoFinanceiraService {
  // ── GRUPOS ─────────────────────────────────────────────────
  async listarGrupos(): Promise<GfGrupo[]> {
    if (!isPgEnabled()) return []
    return getDb().select().from(gfGrupo).orderBy(desc(gfGrupo.atualizadoEm))
  }

  async listarGruposPorCliente(clienteId: string): Promise<GfGrupo[]> {
    if (!isPgEnabled()) return []
    return getDb()
      .select()
      .from(gfGrupo)
      .where(eq(gfGrupo.clienteId, clienteId))
      .orderBy(desc(gfGrupo.atualizadoEm))
  }

  async obterGrupo(grupoId: string): Promise<GfGrupo | null> {
    if (!isPgEnabled()) return null
    const rows = await getDb().select().from(gfGrupo).where(eq(gfGrupo.id, grupoId)).limit(1)
    return rows[0] ?? null
  }

  async criarGrupo(input: {
    clienteId: string
    nomeGrupo: string
    dataBase: Date | string
    historico?: string
    observacoes?: string
  }): Promise<GfGrupo> {
    const db = getDb()
    const dataBaseStr = input.dataBase instanceof Date ? input.dataBase.toISOString().slice(0, 10) : input.dataBase
    const novo = {
      id: id('gf'),
      clienteId: input.clienteId,
      nomeGrupo: input.nomeGrupo,
      dataBase: dataBaseStr,
      historico: input.historico ?? null,
      observacoes: input.observacoes ?? null,
    }
    await db.insert(gfGrupo).values(novo)
    return (await this.obterGrupo(novo.id))!
  }

  async atualizarGrupo(
    grupoId: string,
    patch: Partial<{
      nomeGrupo: string
      dataBase: Date | string
      historico: string | null
      observacoes: string | null
    }>,
  ): Promise<GfGrupo | null> {
    const db = getDb()
    const updateSet: any = { atualizadoEm: new Date() }
    if (patch.nomeGrupo !== undefined) updateSet.nomeGrupo = patch.nomeGrupo
    if (patch.dataBase !== undefined) {
      updateSet.dataBase = patch.dataBase instanceof Date ? patch.dataBase.toISOString().slice(0, 10) : patch.dataBase
    }
    if (patch.historico !== undefined) updateSet.historico = patch.historico
    if (patch.observacoes !== undefined) updateSet.observacoes = patch.observacoes
    await db
      .update(gfGrupo)
      .set(updateSet)
      .where(eq(gfGrupo.id, grupoId))
    return this.obterGrupo(grupoId)
  }

  async deletarGrupo(grupoId: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    await db.delete(gfMembro).where(eq(gfMembro.grupoId, grupoId))
    await db.delete(gfCulturaSafra).where(eq(gfCulturaSafra.grupoId, grupoId))
    await db.delete(gfCustoSafra).where(eq(gfCustoSafra.grupoId, grupoId))
    await db.delete(gfDemanda).where(eq(gfDemanda.grupoId, grupoId))
    await db.delete(gfContratoDivida).where(eq(gfContratoDivida.grupoId, grupoId))
    await db.delete(gfAtivoFazenda).where(eq(gfAtivoFazenda.grupoId, grupoId))
    await db.delete(gfSnapshotCalculo).where(eq(gfSnapshotCalculo.grupoId, grupoId))
    await db.delete(gfGrupo).where(eq(gfGrupo.id, grupoId))
  }

  // ── MEMBROS ────────────────────────────────────────────────
  async listarMembros(grupoId: string): Promise<GfMembro[]> {
    if (!isPgEnabled()) return []
    return getDb()
      .select()
      .from(gfMembro)
      .where(eq(gfMembro.grupoId, grupoId))
      .orderBy(gfMembro.ordem)
  }

  async upsertMembro(input: {
    id?: string
    grupoId: string
    nome: string
    cpfCnpj?: string
    tipoRelacao?: string
    atuaAtividade?: boolean
    ordem?: number
  }): Promise<GfMembro> {
    const db = getDb()
    const changelog = getChangelogService()
    if (input.id) {
      const antes = (await db.select().from(gfMembro).where(eq(gfMembro.id, input.id)).limit(1))[0]
      await db
        .update(gfMembro)
        .set({
          nome: input.nome,
          cpfCnpj: input.cpfCnpj ?? null,
          tipoRelacao: input.tipoRelacao ?? null,
          atuaAtividade: input.atuaAtividade ?? true,
          ordem: input.ordem ?? 0,
        })
        .where(eq(gfMembro.id, input.id))
      const rows = await db.select().from(gfMembro).where(eq(gfMembro.id, input.id)).limit(1)
      changelog.registrar({ grupoId: input.grupoId, entidade: 'membro', entidadeId: input.id, acao: 'update', antes: antes as any, depois: rows[0] as any }).catch(() => {})
      return rows[0]
    }
    const novo = {
      id: id('mem'),
      grupoId: input.grupoId,
      nome: input.nome,
      cpfCnpj: input.cpfCnpj ?? null,
      tipoRelacao: input.tipoRelacao ?? null,
      atuaAtividade: input.atuaAtividade ?? true,
      ordem: input.ordem ?? 0,
    }
    await db.insert(gfMembro).values(novo)
    const rows = await db.select().from(gfMembro).where(eq(gfMembro.id, novo.id)).limit(1)
    changelog.registrar({ grupoId: input.grupoId, entidade: 'membro', entidadeId: novo.id, acao: 'create', depois: rows[0] as any }).catch(() => {})
    return rows[0]
  }

  async deletarMembro(memId: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const antes = (await db.select().from(gfMembro).where(eq(gfMembro.id, memId)).limit(1))[0]
    await db.delete(gfMembro).where(eq(gfMembro.id, memId))
    if (antes) {
      getChangelogService().registrar({ grupoId: antes.grupoId, entidade: 'membro', entidadeId: memId, acao: 'delete', antes: antes as any }).catch(() => {})
    }
  }

  // ── CULTURAS / SAFRAS ──────────────────────────────────────
  async listarCulturas(grupoId: string): Promise<GfCulturaSafra[]> {
    if (!isPgEnabled()) return []
    return getDb()
      .select()
      .from(gfCulturaSafra)
      .where(eq(gfCulturaSafra.grupoId, grupoId))
      .orderBy(gfCulturaSafra.safra, gfCulturaSafra.ordem)
  }

  async upsertCultura(input: Partial<GfCulturaSafra> & { grupoId: string; cultura: string; safra: string }): Promise<GfCulturaSafra> {
    const db = getDb()
    const changelog = getChangelogService()
    if (input.id) {
      const antes = (await db.select().from(gfCulturaSafra).where(eq(gfCulturaSafra.id, input.id)).limit(1))[0]
      await db
        .update(gfCulturaSafra)
        .set({
          cultura: input.cultura,
          safra: input.safra,
          cenario: input.cenario ?? 'planejado',
          ordem: input.ordem ?? 0,
          areaPropriaHa: input.areaPropriaHa ?? null,
          areaArrendadaHa: input.areaArrendadaHa ?? null,
          rendimentoScHa: input.rendimentoScHa ?? null,
          precoMedioRs: input.precoMedioRs ?? null,
          custoUnitarioInsumosRs: input.custoUnitarioInsumosRs ?? null,
          arrendamentoBaseScHa: input.arrendamentoBaseScHa ?? null,
          unidade: input.unidade ?? 'sc',
          observacoes: input.observacoes ?? null,
          atualizadoEm: new Date(),
        })
        .where(eq(gfCulturaSafra.id, input.id))
      const rows = await db.select().from(gfCulturaSafra).where(eq(gfCulturaSafra.id, input.id)).limit(1)
      changelog.registrar({ grupoId: input.grupoId, entidade: 'cultura', entidadeId: input.id, acao: 'update', antes: antes as any, depois: rows[0] as any }).catch(() => {})
      return rows[0]
    }
    const novo = {
      id: id('cs'),
      grupoId: input.grupoId,
      cultura: input.cultura,
      safra: input.safra,
      cenario: input.cenario ?? 'planejado',
      ordem: input.ordem ?? 0,
      areaPropriaHa: input.areaPropriaHa ?? null,
      areaArrendadaHa: input.areaArrendadaHa ?? null,
      rendimentoScHa: input.rendimentoScHa ?? null,
      precoMedioRs: input.precoMedioRs ?? null,
      custoUnitarioInsumosRs: input.custoUnitarioInsumosRs ?? null,
      arrendamentoBaseScHa: input.arrendamentoBaseScHa ?? null,
      unidade: input.unidade ?? 'sc',
      observacoes: input.observacoes ?? null,
    }
    await db.insert(gfCulturaSafra).values(novo)
    const rows = await db.select().from(gfCulturaSafra).where(eq(gfCulturaSafra.id, novo.id)).limit(1)
    changelog.registrar({ grupoId: input.grupoId, entidade: 'cultura', entidadeId: novo.id, acao: 'create', depois: rows[0] as any }).catch(() => {})
    return rows[0]
  }

  async deletarCultura(csId: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const antes = (await db.select().from(gfCulturaSafra).where(eq(gfCulturaSafra.id, csId)).limit(1))[0]
    await db.delete(gfCulturaSafra).where(eq(gfCulturaSafra.id, csId))
    if (antes) {
      getChangelogService().registrar({ grupoId: antes.grupoId, entidade: 'cultura', entidadeId: csId, acao: 'delete', antes: antes as any }).catch(() => {})
    }
  }

  // ── CUSTOS ─────────────────────────────────────────────────
  async listarCustos(grupoId: string): Promise<GfCustoSafra[]> {
    if (!isPgEnabled()) return []
    return getDb()
      .select()
      .from(gfCustoSafra)
      .where(eq(gfCustoSafra.grupoId, grupoId))
      .orderBy(gfCustoSafra.tipo, gfCustoSafra.ordem)
  }

  async upsertCusto(input: Partial<GfCustoSafra> & { grupoId: string; safra: string; tipo: string; descricao: string }): Promise<GfCustoSafra> {
    const db = getDb()
    const changelog = getChangelogService()
    if (input.id) {
      const antes = (await db.select().from(gfCustoSafra).where(eq(gfCustoSafra.id, input.id)).limit(1))[0]
      await db
        .update(gfCustoSafra)
        .set({
          safra: input.safra,
          tipo: input.tipo,
          descricao: input.descricao,
          cultura: input.cultura ?? null,
          valorAnual: input.valorAnual ?? null,
          valorMensal: input.valorMensal ?? null,
          ordem: input.ordem ?? 0,
        })
        .where(eq(gfCustoSafra.id, input.id))
      const rows = await db.select().from(gfCustoSafra).where(eq(gfCustoSafra.id, input.id)).limit(1)
      changelog.registrar({ grupoId: input.grupoId, entidade: 'custo', entidadeId: input.id, acao: 'update', antes: antes as any, depois: rows[0] as any }).catch(() => {})
      return rows[0]
    }
    const novo = {
      id: id('cu'),
      grupoId: input.grupoId,
      safra: input.safra,
      tipo: input.tipo,
      descricao: input.descricao,
      cultura: input.cultura ?? null,
      valorAnual: input.valorAnual ?? null,
      valorMensal: input.valorMensal ?? null,
      ordem: input.ordem ?? 0,
    }
    await db.insert(gfCustoSafra).values(novo)
    const rows = await db.select().from(gfCustoSafra).where(eq(gfCustoSafra.id, novo.id)).limit(1)
    changelog.registrar({ grupoId: input.grupoId, entidade: 'custo', entidadeId: novo.id, acao: 'create', depois: rows[0] as any }).catch(() => {})
    return rows[0]
  }

  async deletarCusto(cuId: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const antes = (await db.select().from(gfCustoSafra).where(eq(gfCustoSafra.id, cuId)).limit(1))[0]
    await db.delete(gfCustoSafra).where(eq(gfCustoSafra.id, cuId))
    if (antes) {
      getChangelogService().registrar({ grupoId: antes.grupoId, entidade: 'custo', entidadeId: cuId, acao: 'delete', antes: antes as any }).catch(() => {})
    }
  }

  // ── DEMANDAS ───────────────────────────────────────────────
  async listarDemandas(grupoId: string): Promise<GfDemanda[]> {
    if (!isPgEnabled()) return []
    return getDb().select().from(gfDemanda).where(eq(gfDemanda.grupoId, grupoId))
  }

  async upsertDemanda(input: Partial<GfDemanda> & { grupoId: string }): Promise<GfDemanda> {
    const db = getDb()
    const changelog = getChangelogService()
    if (input.id) {
      const antes = (await db.select().from(gfDemanda).where(eq(gfDemanda.id, input.id)).limit(1))[0]
      const updateSet: Record<string, unknown> = { atualizadoEm: new Date() }
      const fields = [
        'numero', 'data', 'tomador', 'credor', 'finalidade', 'modalidade', 'valor',
        'garantias', 'prazo', 'parecerTex', 'estrategia', 'enviadoEm', 'retornoEm',
        'acoes', 'status', 'faturamentoObtido',
      ] as const
      for (const f of fields) {
        if ((input as any)[f] !== undefined) updateSet[f] = (input as any)[f]
      }
      await db.update(gfDemanda).set(updateSet).where(eq(gfDemanda.id, input.id))
      const rows = await db.select().from(gfDemanda).where(eq(gfDemanda.id, input.id)).limit(1)
      changelog.registrar({ grupoId: input.grupoId, entidade: 'demanda', entidadeId: input.id, acao: 'update', antes: antes as any, depois: rows[0] as any }).catch(() => {})
      return rows[0]
    }
    const novo = {
      id: id('dem'),
      grupoId: input.grupoId,
      numero: input.numero ?? null,
      data: input.data ?? null,
      tomador: input.tomador ?? null,
      credor: input.credor ?? null,
      finalidade: input.finalidade ?? null,
      modalidade: input.modalidade ?? null,
      valor: input.valor ?? null,
      garantias: input.garantias ?? null,
      prazo: input.prazo ?? null,
      parecerTex: input.parecerTex ?? null,
      estrategia: input.estrategia ?? null,
      enviadoEm: input.enviadoEm ?? null,
      retornoEm: input.retornoEm ?? null,
      acoes: input.acoes ?? null,
      status: input.status ?? 'em_analise',
      faturamentoObtido: input.faturamentoObtido ?? null,
    }
    await db.insert(gfDemanda).values(novo)
    const rows = await db.select().from(gfDemanda).where(eq(gfDemanda.id, novo.id)).limit(1)
    changelog.registrar({ grupoId: input.grupoId, entidade: 'demanda', entidadeId: novo.id, acao: 'create', depois: rows[0] as any }).catch(() => {})
    return rows[0]
  }

  async deletarDemanda(demId: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const antes = (await db.select().from(gfDemanda).where(eq(gfDemanda.id, demId)).limit(1))[0]
    await db.delete(gfDemanda).where(eq(gfDemanda.id, demId))
    if (antes) {
      getChangelogService().registrar({ grupoId: antes.grupoId, entidade: 'demanda', entidadeId: demId, acao: 'delete', antes: antes as any }).catch(() => {})
    }
  }

  // ── CONTRATOS DE DÍVIDA ────────────────────────────────────
  async listarContratos(grupoId: string): Promise<GfContratoDivida[]> {
    if (!isPgEnabled()) return []
    return getDb().select().from(gfContratoDivida).where(eq(gfContratoDivida.grupoId, grupoId))
  }

  async upsertContrato(input: Partial<GfContratoDivida> & { grupoId: string; credor: string }): Promise<GfContratoDivida> {
    const db = getDb()
    const changelog = getChangelogService()
    if (input.id) {
      const antes = (await db.select().from(gfContratoDivida).where(eq(gfContratoDivida.id, input.id)).limit(1))[0]
      const updateSet: Record<string, unknown> = { atualizadoEm: new Date() }
      const fields = [
        'credor', 'emitente', 'garantiaVinculada', 'outrasGarantias', 'contrato',
        'valorLiberado', 'valorFinanciado', 'parcelaCapitalAmortizar', 'valorParcelaFixa',
        'periodicidade', 'metodoCalculo', 'enquadramento', 'finalidade', 'prazoParcelas',
        'dataContratacao', 'primeiraParcela', 'ultimaParcela', 'parcelasPagas', 'inadimplente',
        'taxaNominalAa', 'cetAnual', 'indexador', 'pctIndexador', 'variacaoCambial',
        'origemInfo', 'ultimaAtualizacao', 'valorPresente', 'valorPresenteAtualizado', 'observacoes',
      ] as const
      for (const f of fields) {
        if ((input as any)[f] !== undefined) updateSet[f] = (input as any)[f]
      }
      await db.update(gfContratoDivida).set(updateSet).where(eq(gfContratoDivida.id, input.id))
      const rows = await db.select().from(gfContratoDivida).where(eq(gfContratoDivida.id, input.id)).limit(1)
      changelog.registrar({ grupoId: input.grupoId, entidade: 'contrato', entidadeId: input.id, acao: 'update', antes: antes as any, depois: rows[0] as any }).catch(() => {})
      return rows[0]
    }
    const novo = {
      id: id('cd'),
      grupoId: input.grupoId,
      credor: input.credor,
      emitente: input.emitente ?? null,
      garantiaVinculada: input.garantiaVinculada ?? null,
      outrasGarantias: input.outrasGarantias ?? null,
      contrato: input.contrato ?? null,
      valorLiberado: input.valorLiberado ?? null,
      valorFinanciado: input.valorFinanciado ?? null,
      parcelaCapitalAmortizar: input.parcelaCapitalAmortizar ?? null,
      valorParcelaFixa: input.valorParcelaFixa ?? null,
      periodicidade: input.periodicidade ?? null,
      metodoCalculo: input.metodoCalculo ?? 'PRICE',
      enquadramento: input.enquadramento ?? null,
      finalidade: input.finalidade ?? null,
      prazoParcelas: input.prazoParcelas ?? null,
      dataContratacao: input.dataContratacao ?? null,
      primeiraParcela: input.primeiraParcela ?? null,
      ultimaParcela: input.ultimaParcela ?? null,
      parcelasPagas: input.parcelasPagas ?? 0,
      inadimplente: input.inadimplente ?? false,
      taxaNominalAa: input.taxaNominalAa ?? null,
      cetAnual: input.cetAnual ?? null,
      indexador: input.indexador ?? null,
      pctIndexador: input.pctIndexador ?? null,
      variacaoCambial: input.variacaoCambial ?? false,
      origemInfo: input.origemInfo ?? null,
      ultimaAtualizacao: input.ultimaAtualizacao ?? null,
      valorPresente: input.valorPresente ?? null,
      valorPresenteAtualizado: input.valorPresenteAtualizado ?? null,
      observacoes: input.observacoes ?? null,
    }
    await db.insert(gfContratoDivida).values(novo)
    const rows = await db.select().from(gfContratoDivida).where(eq(gfContratoDivida.id, novo.id)).limit(1)
    changelog.registrar({ grupoId: input.grupoId, entidade: 'contrato', entidadeId: novo.id, acao: 'create', depois: rows[0] as any }).catch(() => {})
    return rows[0]
  }

  async deletarContrato(cId: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const antes = (await db.select().from(gfContratoDivida).where(eq(gfContratoDivida.id, cId)).limit(1))[0]
    await db.delete(gfContratoDivida).where(eq(gfContratoDivida.id, cId))
    if (antes) {
      getChangelogService().registrar({ grupoId: antes.grupoId, entidade: 'contrato', entidadeId: cId, acao: 'delete', antes: antes as any }).catch(() => {})
    }
  }

  // ── ATIVOS / FAZENDAS ──────────────────────────────────────
  async listarFazendas(grupoId: string): Promise<GfAtivoFazenda[]> {
    if (!isPgEnabled()) return []
    return getDb().select().from(gfAtivoFazenda).where(eq(gfAtivoFazenda.grupoId, grupoId))
  }

  async upsertFazenda(input: Partial<GfAtivoFazenda> & { grupoId: string; fazenda: string }): Promise<GfAtivoFazenda> {
    const db = getDb()
    const changelog = getChangelogService()
    if (input.id) {
      const antes = (await db.select().from(gfAtivoFazenda).where(eq(gfAtivoFazenda.id, input.id)).limit(1))[0]
      const updateSet: Record<string, unknown> = { atualizadoEm: new Date() }
      const fields = [
        'fazenda', 'proprietario', 'matricula', 'cidade', 'estado',
        'areaTotalHa', 'areaConsolidadaHa', 'areaPlantioHa', 'areaIrrigadaHa',
        'areaPastagemHa', 'areaReservaHa', 'outrosUsosHa', 'arrendadaTerceirosHa',
        'valorHaMercado', 'valorHaForcado', 'nrCcir', 'nrItr', 'inscricaoEstadual',
        'nrCar', 'possuiGeo', 'observacoes',
      ] as const
      for (const f of fields) {
        if ((input as any)[f] !== undefined) updateSet[f] = (input as any)[f]
      }
      await db.update(gfAtivoFazenda).set(updateSet).where(eq(gfAtivoFazenda.id, input.id))
      const rows = await db.select().from(gfAtivoFazenda).where(eq(gfAtivoFazenda.id, input.id)).limit(1)
      changelog.registrar({ grupoId: input.grupoId, entidade: 'fazenda', entidadeId: input.id, acao: 'update', antes: antes as any, depois: rows[0] as any }).catch(() => {})
      return rows[0]
    }
    const novo = {
      id: id('faz'),
      grupoId: input.grupoId,
      fazenda: input.fazenda,
      proprietario: input.proprietario ?? null,
      matricula: input.matricula ?? null,
      cidade: input.cidade ?? null,
      estado: input.estado ?? null,
      areaTotalHa: input.areaTotalHa ?? null,
      areaConsolidadaHa: input.areaConsolidadaHa ?? null,
      areaPlantioHa: input.areaPlantioHa ?? null,
      areaIrrigadaHa: input.areaIrrigadaHa ?? null,
      areaPastagemHa: input.areaPastagemHa ?? null,
      areaReservaHa: input.areaReservaHa ?? null,
      outrosUsosHa: input.outrosUsosHa ?? null,
      arrendadaTerceirosHa: input.arrendadaTerceirosHa ?? null,
      valorHaMercado: input.valorHaMercado ?? null,
      valorHaForcado: input.valorHaForcado ?? null,
      nrCcir: input.nrCcir ?? null,
      nrItr: input.nrItr ?? null,
      inscricaoEstadual: input.inscricaoEstadual ?? null,
      nrCar: input.nrCar ?? null,
      possuiGeo: input.possuiGeo ?? false,
      observacoes: input.observacoes ?? null,
    }
    await db.insert(gfAtivoFazenda).values(novo)
    const rows = await db.select().from(gfAtivoFazenda).where(eq(gfAtivoFazenda.id, novo.id)).limit(1)
    changelog.registrar({ grupoId: input.grupoId, entidade: 'fazenda', entidadeId: novo.id, acao: 'create', depois: rows[0] as any }).catch(() => {})
    return rows[0]
  }

  async deletarFazenda(fId: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const antes = (await db.select().from(gfAtivoFazenda).where(eq(gfAtivoFazenda.id, fId)).limit(1))[0]
    await db.delete(gfAtivoFazenda).where(eq(gfAtivoFazenda.id, fId))
    if (antes) {
      getChangelogService().registrar({ grupoId: antes.grupoId, entidade: 'fazenda', entidadeId: fId, acao: 'delete', antes: antes as any }).catch(() => {})
    }
  }

  // ── CÁLCULOS ──────────────────────────────────────────────
  async calcularSafraConsolidada(grupoId: string): Promise<SafraConsolidado[]> {
    const culturas = await this.listarCulturas(grupoId)
    return consolidarSafra(culturas)
  }

  async calcularEndividamento(grupoId: string): Promise<EndividamentoConsolidado> {
    const contratos = await this.listarContratos(grupoId)
    return consolidarEndividamento(contratos)
  }

  async calcularDashboardCompleto(grupoId: string, opts?: {
    taxaCustoFinanceiroAa?: number
    taxaPoupancaAa?: number
    anosProjecao?: number
    persistir?: boolean
  }): Promise<{
    grupo: GfGrupo
    safras: SafraConsolidado[]
    endividamento: EndividamentoConsolidado
    raioX: RaioXOutput
  }> {
    const grupo = await this.obterGrupo(grupoId)
    if (!grupo) throw new Error(`Grupo ${grupoId} não encontrado`)

    const [culturas, contratos, custos, ativos] = await Promise.all([
      this.listarCulturas(grupoId),
      this.listarContratos(grupoId),
      this.listarCustos(grupoId),
      this.listarFazendas(grupoId),
    ])

    const safras = consolidarSafra(culturas)
    const endividamento = consolidarEndividamento(contratos)
    const raioX = computeRaioX({
      dataBase: grupo.dataBase,
      taxaCustoFinanceiroAa: opts?.taxaCustoFinanceiroAa,
      taxaPoupancaAa: opts?.taxaPoupancaAa,
      anosProjecao: opts?.anosProjecao,
      safrasConsolidadas: safras,
      endividamento,
      custos,
      ativos,
    })

    if (opts?.persistir && isPgEnabled()) {
      const db = getDb()
      const now = new Date()
      try {
        await db.insert(gfSnapshotCalculo).values([
          { grupoId, tipo: 'safra', payload: safras as any, calculadoEm: now },
          { grupoId, tipo: 'endividamento', payload: endividamento as any, calculadoEm: now },
          { grupoId, tipo: 'raio_x', payload: raioX as any, calculadoEm: now },
        ])
      } catch {
        // best-effort
      }
    }

    return { grupo, safras, endividamento, raioX }
  }
}

let _instance: GestaoFinanceiraService | null = null
export function getGestaoFinanceiraService(): GestaoFinanceiraService {
  if (!_instance) _instance = new GestaoFinanceiraService()
  return _instance
}

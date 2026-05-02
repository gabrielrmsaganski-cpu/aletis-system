// ============================================================
// GestaoFinanceiraServiceV2 — extensões V2 (passivos, garantias,
// premissas, ativos extras, insights, dashboard 360°, bulk import,
// auto-import do CRM/dossiê).
// ============================================================
import { eq, and, desc, sql } from 'drizzle-orm'
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
  gfAtivoOutro,
  gfPassivoOutro,
  gfGarantia,
  gfPremissa,
  gfInsight,
  gfSnapshotCalculo,
  cliente,
  type GfAtivoOutro,
  type GfPassivoOutro,
  type GfGarantia,
  type GfPremissa,
  type GfInsight,
  type GfGrupo,
} from '../../db/schema.js'
import { getGestaoFinanceiraService } from './GestaoFinanceiraService.js'
import { getChangelogService } from './ChangelogService.js'
import { computeRateio } from './calculo/rateio-calculator.js'
import { computeEbitdaMensal } from './calculo/ebitda-mensal-calculator.js'
import { computePassivos } from './calculo/passivos-calculator.js'
import { computeGarantiasLtv } from './calculo/garantia-ltv-calculator.js'
import { computeDreFcl } from './calculo/dre-fcl-calculator.js'
import { gerarInsights } from './calculo/insights-engine.js'
import { consolidarEndividamento } from './calculo/endividamento-calculator.js'

function id(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

export class GestaoFinanceiraServiceV2 {
  // ── Ativos extras ───────────────────────────────────────────
  async listarAtivosOutros(grupoId: string): Promise<GfAtivoOutro[]> {
    if (!isPgEnabled()) return []
    return getDb().select().from(gfAtivoOutro).where(eq(gfAtivoOutro.grupoId, grupoId))
  }

  async upsertAtivoOutro(input: Partial<GfAtivoOutro> & { grupoId: string; tipo: string; descricao: string }): Promise<GfAtivoOutro> {
    const db = getDb()
    const changelog = getChangelogService()
    if (input.id) {
      const antes = (await db.select().from(gfAtivoOutro).where(eq(gfAtivoOutro.id, input.id)).limit(1))[0]
      const set: any = { atualizadoEm: new Date() }
      const fields = ['tipo', 'descricao', 'produto', 'estadoUf', 'safra', 'unidade', 'quantidade', 'precoUnitario', 'valorTotal', 'dataRecebimento', 'vaiParaFc', 'observacoes'] as const
      for (const f of fields) if ((input as any)[f] !== undefined) set[f] = (input as any)[f]
      await db.update(gfAtivoOutro).set(set).where(eq(gfAtivoOutro.id, input.id))
      const r = await db.select().from(gfAtivoOutro).where(eq(gfAtivoOutro.id, input.id)).limit(1)
      changelog.registrar({ grupoId: input.grupoId, entidade: 'ativo_outro', entidadeId: input.id, acao: 'update', antes: antes as any, depois: r[0] as any }).catch(() => {})
      return r[0]
    }
    const novo = {
      id: id('ao'),
      grupoId: input.grupoId,
      tipo: input.tipo,
      descricao: input.descricao,
      produto: input.produto ?? null,
      estadoUf: input.estadoUf ?? null,
      safra: input.safra ?? null,
      unidade: input.unidade ?? null,
      quantidade: input.quantidade ?? null,
      precoUnitario: input.precoUnitario ?? null,
      valorTotal: input.valorTotal ?? null,
      dataRecebimento: input.dataRecebimento ?? null,
      vaiParaFc: input.vaiParaFc ?? true,
      observacoes: input.observacoes ?? null,
    }
    await db.insert(gfAtivoOutro).values(novo)
    const r = await db.select().from(gfAtivoOutro).where(eq(gfAtivoOutro.id, novo.id)).limit(1)
    changelog.registrar({ grupoId: input.grupoId, entidade: 'ativo_outro', entidadeId: novo.id, acao: 'create', depois: r[0] as any }).catch(() => {})
    return r[0]
  }

  async deletarAtivoOutro(id: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const antes = (await db.select().from(gfAtivoOutro).where(eq(gfAtivoOutro.id, id)).limit(1))[0]
    await db.delete(gfAtivoOutro).where(eq(gfAtivoOutro.id, id))
    if (antes) {
      getChangelogService().registrar({ grupoId: antes.grupoId, entidade: 'ativo_outro', entidadeId: id, acao: 'delete', antes: antes as any }).catch(() => {})
    }
  }

  // ── Passivos extras ────────────────────────────────────────
  async listarPassivosOutros(grupoId: string): Promise<GfPassivoOutro[]> {
    if (!isPgEnabled()) return []
    return getDb().select().from(gfPassivoOutro).where(eq(gfPassivoOutro.grupoId, grupoId))
  }

  async upsertPassivoOutro(input: Partial<GfPassivoOutro> & { grupoId: string; tipo: string; descricao: string }): Promise<GfPassivoOutro> {
    const db = getDb()
    const changelog = getChangelogService()
    if (input.id) {
      const antes = (await db.select().from(gfPassivoOutro).where(eq(gfPassivoOutro.id, input.id)).limit(1))[0]
      const set: any = { atualizadoEm: new Date() }
      const fields = ['tipo', 'credor', 'descricao', 'finalidade', 'valor', 'vencimento', 'dataReferencia', 'status', 'taxaJurosAa', 'formaPagamento', 'variacaoCambial', 'observacoes'] as const
      for (const f of fields) if ((input as any)[f] !== undefined) set[f] = (input as any)[f]
      await db.update(gfPassivoOutro).set(set).where(eq(gfPassivoOutro.id, input.id))
      const r = await db.select().from(gfPassivoOutro).where(eq(gfPassivoOutro.id, input.id)).limit(1)
      changelog.registrar({ grupoId: input.grupoId, entidade: 'passivo_outro', entidadeId: input.id, acao: 'update', antes: antes as any, depois: r[0] as any }).catch(() => {})
      return r[0]
    }
    const novo = {
      id: id('po'),
      grupoId: input.grupoId,
      tipo: input.tipo,
      credor: input.credor ?? null,
      descricao: input.descricao,
      finalidade: input.finalidade ?? null,
      valor: input.valor ?? '0',
      vencimento: input.vencimento ?? null,
      dataReferencia: input.dataReferencia ?? null,
      status: input.status ?? 'a_vencer',
      taxaJurosAa: input.taxaJurosAa ?? null,
      formaPagamento: input.formaPagamento ?? null,
      variacaoCambial: input.variacaoCambial ?? false,
      observacoes: input.observacoes ?? null,
    }
    await db.insert(gfPassivoOutro).values(novo)
    const r = await db.select().from(gfPassivoOutro).where(eq(gfPassivoOutro.id, novo.id)).limit(1)
    changelog.registrar({ grupoId: input.grupoId, entidade: 'passivo_outro', entidadeId: novo.id, acao: 'create', depois: r[0] as any }).catch(() => {})
    return r[0]
  }

  async deletarPassivoOutro(id: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const antes = (await db.select().from(gfPassivoOutro).where(eq(gfPassivoOutro.id, id)).limit(1))[0]
    await db.delete(gfPassivoOutro).where(eq(gfPassivoOutro.id, id))
    if (antes) {
      getChangelogService().registrar({ grupoId: antes.grupoId, entidade: 'passivo_outro', entidadeId: id, acao: 'delete', antes: antes as any }).catch(() => {})
    }
  }

  // ── Garantias ──────────────────────────────────────────────
  async listarGarantias(grupoId: string): Promise<GfGarantia[]> {
    if (!isPgEnabled()) return []
    return getDb().select().from(gfGarantia).where(eq(gfGarantia.grupoId, grupoId))
  }

  async upsertGarantia(input: Partial<GfGarantia> & { grupoId: string; tipo: string; descricao: string }): Promise<GfGarantia> {
    const db = getDb()
    const changelog = getChangelogService()
    if (input.id) {
      const antes = (await db.select().from(gfGarantia).where(eq(gfGarantia.id, input.id)).limit(1))[0]
      const set: any = { atualizadoEm: new Date() }
      const fields = ['tipo', 'descricao', 'fazendaId', 'matricula', 'areaHa', 'valorMercado', 'valorForcado', 'contratoVinculado', 'baixasAditivos', 'registrosAverbacoes', 'observacoes'] as const
      for (const f of fields) if ((input as any)[f] !== undefined) set[f] = (input as any)[f]
      await db.update(gfGarantia).set(set).where(eq(gfGarantia.id, input.id))
      const r = await db.select().from(gfGarantia).where(eq(gfGarantia.id, input.id)).limit(1)
      changelog.registrar({ grupoId: input.grupoId, entidade: 'garantia', entidadeId: input.id, acao: 'update', antes: antes as any, depois: r[0] as any }).catch(() => {})
      return r[0]
    }
    const novo = {
      id: id('gar'),
      grupoId: input.grupoId,
      tipo: input.tipo,
      descricao: input.descricao,
      fazendaId: input.fazendaId ?? null,
      matricula: input.matricula ?? null,
      areaHa: input.areaHa ?? null,
      valorMercado: input.valorMercado ?? null,
      valorForcado: input.valorForcado ?? null,
      contratoVinculado: input.contratoVinculado ?? null,
      baixasAditivos: input.baixasAditivos ?? null,
      registrosAverbacoes: input.registrosAverbacoes ?? null,
      observacoes: input.observacoes ?? null,
    }
    await db.insert(gfGarantia).values(novo)
    const r = await db.select().from(gfGarantia).where(eq(gfGarantia.id, novo.id)).limit(1)
    changelog.registrar({ grupoId: input.grupoId, entidade: 'garantia', entidadeId: novo.id, acao: 'create', depois: r[0] as any }).catch(() => {})
    return r[0]
  }

  async deletarGarantia(id: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const antes = (await db.select().from(gfGarantia).where(eq(gfGarantia.id, id)).limit(1))[0]
    await db.delete(gfGarantia).where(eq(gfGarantia.id, id))
    if (antes) {
      getChangelogService().registrar({ grupoId: antes.grupoId, entidade: 'garantia', entidadeId: id, acao: 'delete', antes: antes as any }).catch(() => {})
    }
  }

  // ── Premissas ──────────────────────────────────────────────
  async listarPremissas(grupoId: string): Promise<GfPremissa[]> {
    if (!isPgEnabled()) return []
    return getDb().select().from(gfPremissa).where(eq(gfPremissa.grupoId, grupoId))
  }

  async upsertPremissa(input: Partial<GfPremissa> & { grupoId: string; chave: string; rotulo: string; valor: string }): Promise<GfPremissa> {
    const db = getDb()
    const changelog = getChangelogService()
    if (input.id) {
      const antes = (await db.select().from(gfPremissa).where(eq(gfPremissa.id, input.id)).limit(1))[0]
      const set: any = { atualizadoEm: new Date() }
      const fields = ['chave', 'rotulo', 'valor', 'unidade', 'vigencia', 'fonte', 'observacoes'] as const
      for (const f of fields) if ((input as any)[f] !== undefined) set[f] = (input as any)[f]
      await db.update(gfPremissa).set(set).where(eq(gfPremissa.id, input.id))
      const r = await db.select().from(gfPremissa).where(eq(gfPremissa.id, input.id)).limit(1)
      changelog.registrar({ grupoId: input.grupoId, entidade: 'premissa', entidadeId: input.id, acao: 'update', antes: antes as any, depois: r[0] as any }).catch(() => {})
      return r[0]
    }
    const novo = {
      id: id('prm'),
      grupoId: input.grupoId,
      chave: input.chave,
      rotulo: input.rotulo,
      valor: input.valor,
      unidade: input.unidade ?? null,
      vigencia: input.vigencia ?? null,
      fonte: input.fonte ?? null,
      observacoes: input.observacoes ?? null,
    }
    await db.insert(gfPremissa).values(novo)
    const r = await db.select().from(gfPremissa).where(eq(gfPremissa.id, novo.id)).limit(1)
    changelog.registrar({ grupoId: input.grupoId, entidade: 'premissa', entidadeId: novo.id, acao: 'create', depois: r[0] as any }).catch(() => {})
    return r[0]
  }

  async deletarPremissa(id: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    const antes = (await db.select().from(gfPremissa).where(eq(gfPremissa.id, id)).limit(1))[0]
    await db.delete(gfPremissa).where(eq(gfPremissa.id, id))
    if (antes) {
      getChangelogService().registrar({ grupoId: antes.grupoId, entidade: 'premissa', entidadeId: id, acao: 'delete', antes: antes as any }).catch(() => {})
    }
  }

  // ── Insights ───────────────────────────────────────────────
  async listarInsights(grupoId: string, limit = 50): Promise<GfInsight[]> {
    if (!isPgEnabled()) return []
    return getDb()
      .select()
      .from(gfInsight)
      .where(eq(gfInsight.grupoId, grupoId))
      .orderBy(desc(gfInsight.calculadoEm))
      .limit(limit)
  }

  async persistirInsights(grupoId: string, insights: Array<{ severidade: string; categoria: string; titulo: string; mensagem: string; metricas?: any; recomendacao?: string }>): Promise<void> {
    if (!isPgEnabled() || insights.length === 0) return
    const db = getDb()
    await db.insert(gfInsight).values(
      insights.map((i) => ({
        grupoId,
        severidade: i.severidade,
        categoria: i.categoria,
        titulo: i.titulo,
        mensagem: i.mensagem,
        metricas: (i.metricas ?? {}) as any,
        recomendacao: i.recomendacao ?? null,
      })),
    )
  }

  // ── BULK INSERT (paste do Excel) ───────────────────────────
  async bulkInsertCulturas(grupoId: string, rows: Array<Record<string, any>>): Promise<{ inserted: number; errors: string[] }> {
    const svc = getGestaoFinanceiraService()
    const errors: string[] = []
    let inserted = 0
    for (const [i, row] of rows.entries()) {
      try {
        if (!row.cultura || !row.safra) {
          errors.push(`Linha ${i + 1}: cultura e safra obrigatórios`)
          continue
        }
        await svc.upsertCultura({
          grupoId,
          cultura: row.cultura,
          safra: row.safra,
          cenario: row.cenario ?? 'planejado',
          areaPropriaHa: row.areaPropriaHa ?? null,
          areaArrendadaHa: row.areaArrendadaHa ?? null,
          rendimentoScHa: row.rendimentoScHa ?? null,
          precoMedioRs: row.precoMedioRs ?? null,
          custoUnitarioInsumosRs: row.custoUnitarioInsumosRs ?? null,
          arrendamentoBaseScHa: row.arrendamentoBaseScHa ?? null,
          unidade: row.unidade ?? 'sc',
          ordem: row.ordem ?? 0,
        })
        inserted += 1
      } catch (e: any) {
        errors.push(`Linha ${i + 1}: ${e?.message ?? 'erro desconhecido'}`)
      }
    }
    return { inserted, errors }
  }

  async bulkInsertContratos(grupoId: string, rows: Array<Record<string, any>>): Promise<{ inserted: number; errors: string[] }> {
    const svc = getGestaoFinanceiraService()
    const errors: string[] = []
    let inserted = 0
    for (const [i, row] of rows.entries()) {
      try {
        if (!row.credor) {
          errors.push(`Linha ${i + 1}: credor obrigatório`)
          continue
        }
        await svc.upsertContrato({ grupoId, credor: row.credor, ...row } as any)
        inserted += 1
      } catch (e: any) {
        errors.push(`Linha ${i + 1}: ${e?.message ?? 'erro'}`)
      }
    }
    return { inserted, errors }
  }

  async bulkInsertCustos(grupoId: string, rows: Array<Record<string, any>>): Promise<{ inserted: number; errors: string[] }> {
    const svc = getGestaoFinanceiraService()
    const errors: string[] = []
    let inserted = 0
    for (const [i, row] of rows.entries()) {
      try {
        await svc.upsertCusto({
          grupoId,
          safra: row.safra ?? '24/25',
          tipo: row.tipo ?? 'operacional',
          descricao: row.descricao ?? `Item ${i + 1}`,
          cultura: row.cultura ?? null,
          valorAnual: row.valorAnual ?? null,
          valorMensal: row.valorMensal ?? null,
          ordem: row.ordem ?? i,
        })
        inserted += 1
      } catch (e: any) {
        errors.push(`Linha ${i + 1}: ${e?.message ?? 'erro'}`)
      }
    }
    return { inserted, errors }
  }

  async bulkInsertFazendas(grupoId: string, rows: Array<Record<string, any>>): Promise<{ inserted: number; errors: string[] }> {
    const svc = getGestaoFinanceiraService()
    const errors: string[] = []
    let inserted = 0
    for (const [i, row] of rows.entries()) {
      try {
        if (!row.fazenda) {
          errors.push(`Linha ${i + 1}: fazenda obrigatório`)
          continue
        }
        await svc.upsertFazenda({ grupoId, fazenda: row.fazenda, ...row })
        inserted += 1
      } catch (e: any) {
        errors.push(`Linha ${i + 1}: ${e?.message ?? 'erro'}`)
      }
    }
    return { inserted, errors }
  }

  // ── AUTO-IMPORT do CRM ─────────────────────────────────────
  /**
   * Cria um grupo GF a partir do cliente do CRM. Pré-popula:
   *  - nome do grupo, data base
   *  - 1 membro com nome+CPF do cliente
   *  - culturas a partir de cliente.culturas[]
   *  - 1 contrato semente se cliente.valorTotalDivida > 0
   *  - 1 fazenda placeholder com cidade/UF
   *  - premissas default (taxa custo financeiro, taxa poupança, IPCA)
   *
   * Idempotente: se já existe grupo com mesmo clienteId, retorna ele.
   */
  async autoImportFromCRM(clienteId: string): Promise<{ grupo: GfGrupo; criado: boolean; estatisticas: { membros: number; culturas: number; contratos: number; fazendas: number; premissas: number } }> {
    const db = getDb()
    const svc = getGestaoFinanceiraService()
    // Já existe?
    const existentes = await svc.listarGruposPorCliente(clienteId)
    if (existentes.length > 0) {
      return {
        grupo: existentes[0],
        criado: false,
        estatisticas: { membros: 0, culturas: 0, contratos: 0, fazendas: 0, premissas: 0 },
      }
    }

    // Carrega cliente do CRM
    const cliRows = await db.select().from(cliente).where(eq(cliente.id, clienteId)).limit(1)
    if (cliRows.length === 0) throw new Error(`Cliente ${clienteId} não encontrado no CRM`)
    const cli = cliRows[0]

    // 1) Cria grupo
    const grupo = await svc.criarGrupo({
      clienteId,
      nomeGrupo: `Grupo ${cli.nome}`,
      dataBase: new Date().toISOString().slice(0, 10),
      historico: cli.payload && (cli.payload as any).historico ? String((cli.payload as any).historico) : undefined,
      observacoes: `Importado automaticamente do CRM em ${new Date().toLocaleDateString('pt-BR')}.`,
    })

    let membros = 0, culturas = 0, contratos = 0, fazendas = 0, premissas = 0

    // 2) Membro principal (cliente)
    if (cli.nome) {
      await svc.upsertMembro({
        grupoId: grupo.id,
        nome: cli.nome,
        cpfCnpj: cli.cpfCnpj,
        tipoRelacao: 'Titular',
        atuaAtividade: true,
        ordem: 0,
      })
      membros += 1
    }

    // 3) Culturas a partir de cliente.culturas[]
    const safraDefault = inferirSafraAtual()
    if (cli.culturas && cli.culturas.length > 0) {
      let ordem = 0
      for (const c of cli.culturas) {
        await svc.upsertCultura({
          grupoId: grupo.id,
          cultura: c,
          safra: safraDefault,
          cenario: 'planejado',
          areaPropriaHa: cli.areaTotalHa ? String(parseFloat(String(cli.areaTotalHa)) / cli.culturas.length) : null,
          areaArrendadaHa: '0',
          rendimentoScHa: String(rendimentoTipico(c)),
          precoMedioRs: String(precoTipico(c)),
          custoUnitarioInsumosRs: String(custoTipico(c)),
          arrendamentoBaseScHa: '18',
          ordem: ordem++,
        })
        culturas += 1
      }
    }

    // 4) Contrato semente (se há dívida total declarada)
    const valorDivida = cli.valorTotalDivida ? parseFloat(String(cli.valorTotalDivida)) : 0
    if (valorDivida > 0) {
      await svc.upsertContrato({
        grupoId: grupo.id,
        credor: cli.credor || 'A definir (importado do CRM)',
        contrato: 'IMPORTADO-CRM-001',
        valorFinanciado: String(valorDivida) as any,
        prazoParcelas: 60,
        taxaNominalAa: '12.5' as any,
        periodicidade: 'mensal',
        metodoCalculo: 'PRICE',
        dataContratacao: new Date().toISOString().slice(0, 10),
        primeiraParcela: new Date().toISOString().slice(0, 10),
        enquadramento: 'custeio',
        observacoes: 'Contrato gerado automaticamente a partir de cliente.valorTotalDivida. Substituir pelos contratos reais.',
      } as any)
      contratos += 1
    }

    // 5) Fazenda placeholder
    if (cli.cidade || cli.uf) {
      await svc.upsertFazenda({
        grupoId: grupo.id,
        fazenda: `Fazenda ${cli.cidade ?? cli.nome} (a confirmar)`,
        cidade: cli.cidade,
        estado: cli.uf,
        areaTotalHa: cli.areaTotalHa ? String(cli.areaTotalHa) as any : null,
        observacoes: 'Importado do CRM — confirmar matrícula, valor R$/ha e áreas detalhadas.',
      })
      fazendas += 1
    }

    // 6) Premissas default
    const premissasDefault = [
      { chave: 'taxa_custo_financeiro', rotulo: 'Taxa de custo financeiro (déficit)', valor: '0.20', unidade: '%a.a.', fonte: 'consultor' },
      { chave: 'taxa_poupanca', rotulo: 'Taxa de poupança (superávit)', valor: '0.12', unidade: '%a.a.', fonte: 'BCB' },
      { chave: 'ipca_proj', rotulo: 'IPCA projetado', valor: '0.045', unidade: '%a.a.', fonte: 'mercado' },
      { chave: 'selic_proj', rotulo: 'Selic projetada', valor: '0.105', unidade: '%a.a.', fonte: 'BCB' },
    ]
    for (const p of premissasDefault) {
      await this.upsertPremissa({ grupoId: grupo.id, ...p })
      premissas += 1
    }

    return {
      grupo,
      criado: true,
      estatisticas: { membros, culturas, contratos, fazendas, premissas },
    }
  }

  // ── DASHBOARD 360° ─────────────────────────────────────────
  /**
   * Calcula tudo: safras + endividamento + rateio + ebitda mensal +
   * passivos consolidado + garantias LTV + DRE FCL multi-cenário +
   * raio X + insights. Persiste insights no PG.
   */
  async calcularDashboard360(grupoId: string, opts?: {
    txCusto?: number
    txPoupanca?: number
    anos?: number
    persistir?: boolean
  }): Promise<any> {
    const svc = getGestaoFinanceiraService()
    const grupo = await svc.obterGrupo(grupoId)
    if (!grupo) throw new Error(`Grupo ${grupoId} não encontrado`)

    const [culturas, contratos, custos, ativos, ativosOutros, passivosOutros, garantias, premissas] = await Promise.all([
      svc.listarCulturas(grupoId),
      svc.listarContratos(grupoId),
      svc.listarCustos(grupoId),
      svc.listarFazendas(grupoId),
      this.listarAtivosOutros(grupoId),
      this.listarPassivosOutros(grupoId),
      this.listarGarantias(grupoId),
      this.listarPremissas(grupoId),
    ])

    // Resolve premissas (override do query param se vazio)
    const premMap = new Map(premissas.map((p) => [p.chave, parseFloat(String(p.valor))]))
    const txCusto = opts?.txCusto ?? premMap.get('taxa_custo_financeiro') ?? 0.20
    const txPoupanca = opts?.txPoupanca ?? premMap.get('taxa_poupanca') ?? 0.12

    const dashboardBase = await svc.calcularDashboardCompleto(grupoId, {
      taxaCustoFinanceiroAa: txCusto,
      taxaPoupancaAa: txPoupanca,
      anosProjecao: opts?.anos,
    })
    const safras = dashboardBase.safras
    const endividamento = dashboardBase.endividamento
    const raioX = dashboardBase.raioX

    const rateio = computeRateio(safras, custos)
    const ebitdaMensal = computeEbitdaMensal(safras)
    const passivos = computePassivos({ endividamento, passivosOutros, custos })
    const ltv = computeGarantiasLtv({ garantias, contratos, schedules: endividamento.contratos })
    const dre = computeDreFcl({ safras, endividamento, custos, anosProjecao: opts?.anos, taxaCustoFinanceiroAa: txCusto, taxaPoupancaAa: txPoupanca })
    const insights = gerarInsights({ endividamento, raioX, garantias: ltv, passivos, dre })

    if (opts?.persistir) {
      await this.persistirInsights(grupoId, insights)
    }

    return {
      grupo,
      premissas,
      safras,
      endividamento,
      raioX,
      rateio,
      ebitdaMensal,
      passivos,
      ltv,
      dre,
      insights,
      ativos: { fazendas: ativos, outros: ativosOutros },
      passivosOutros,
      garantias,
      contadores: {
        culturas: culturas.length,
        contratos: contratos.length,
        custos: custos.length,
        fazendas: ativos.length,
        ativosOutros: ativosOutros.length,
        passivosOutros: passivosOutros.length,
        garantias: garantias.length,
        premissas: premissas.length,
      },
    }
  }
}

// ── helpers de inferência (defaults inteligentes) ──────────
function inferirSafraAtual(): string {
  const now = new Date()
  const yy = now.getFullYear() % 100
  const mm = now.getMonth() + 1
  // Safra começa em julho/agosto. Se mês < 7, safra é (yy-1)/yy. Senão yy/yy+1.
  if (mm < 7) return `${String((yy - 1) % 100).padStart(2, '0')}/${String(yy).padStart(2, '0')}`
  return `${String(yy).padStart(2, '0')}/${String((yy + 1) % 100).padStart(2, '0')}`
}

function rendimentoTipico(cultura: string): number {
  const c = cultura.toLowerCase()
  if (c.includes('soja')) return 60
  if (c.includes('milho')) return 110
  if (c.includes('trigo')) return 50
  if (c.includes('cana')) return 80
  if (c.includes('cafe') || c.includes('café')) return 35
  if (c.includes('algodao') || c.includes('algodão')) return 280
  return 50
}

function precoTipico(cultura: string): number {
  const c = cultura.toLowerCase()
  if (c.includes('soja')) return 135
  if (c.includes('milho')) return 65
  if (c.includes('trigo')) return 75
  if (c.includes('cana')) return 110
  if (c.includes('cafe') || c.includes('café')) return 1100
  if (c.includes('algodao') || c.includes('algodão')) return 5
  return 100
}

function custoTipico(cultura: string): number {
  const c = cultura.toLowerCase()
  if (c.includes('soja')) return 85
  if (c.includes('milho')) return 35
  if (c.includes('trigo')) return 40
  if (c.includes('cana')) return 60
  if (c.includes('cafe') || c.includes('café')) return 700
  if (c.includes('algodao') || c.includes('algodão')) return 3
  return 60
}

let _instance: GestaoFinanceiraServiceV2 | null = null
export function getGestaoFinanceiraServiceV2(): GestaoFinanceiraServiceV2 {
  if (!_instance) _instance = new GestaoFinanceiraServiceV2()
  return _instance
}

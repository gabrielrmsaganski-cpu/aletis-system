/**
 * FinanceiroService — gestão financeira INTERNA do negócio ALETIS.
 *
 * Não confundir com apps/api/src/lib/financeiro.ts (motor de cálculos
 * financeiros PARA CLIENTES — dívidas, CET, amortização).
 *
 * Responsabilidades:
 *   - CRUD de receitas (honorários), despesas (operacional), impostos
 *     (DAS, INSS, DARF) e extratos bancários
 *   - Persistência JSON por competência (YYYY-MM) + anexos em disco
 *   - Cálculo do DRE mensal e anual
 *   - Cálculo do DAS do Simples Nacional com RBT12 (janela 12 meses)
 *   - Categorização automática de lançamentos bancários
 *   - Dashboard consolidado com KPIs, alertas e fluxo de caixa 12m
 *   - Checklist de fechamento pronto para o contador
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  Receita,
  Despesa,
  Imposto,
  LancamentoBancario,
  ConfiguracaoFinanceiro,
  DREMensal,
  DREAnual,
  DashboardFinanceiro,
  ChecklistFechamento,
  CategoriaDespesa,
  Anexo,
  StatusReceita,
  StatusDespesa,
} from './types.js'
import { CATEGORIAS_DESPESA } from './types.js'
import { calcularDAS, alertaLimiteSimples } from './simples-nacional.js'

const CATEGORIA_NOMES: Record<string, string> = Object.fromEntries(
  CATEGORIAS_DESPESA.map((c) => [c.id, c.nome])
)
const CATEGORIA_DEDUTIVEL: Record<string, boolean> = Object.fromEntries(
  CATEGORIAS_DESPESA.map((c) => [c.id, c.dedutivel])
)

const DEFAULT_CONFIG: ConfiguracaoFinanceiro = {
  empresa: {
    razaoSocial: 'ALETIS Consultoria Financeira e Agronegócio LTDA',
    nomeFantasia: 'ALETIS',
    cnpj: '',
  },
  regime: 'simples_nacional',
  anexoSimples: 'III',
  contador: {
    nome: '',
    email: '',
  },
  aliquotas: {
    iss: 3,
  },
  contasBancarias: [],
  criadoEm: new Date().toISOString(),
  atualizadoEm: new Date().toISOString(),
}

export class FinanceiroService {
  private root: string
  private dbFile: string
  private anexosDir: string

  private receitas = new Map<string, Receita>()
  private despesas = new Map<string, Despesa>()
  private impostos = new Map<string, Imposto>()
  private lancamentos = new Map<string, LancamentoBancario>()
  private config: ConfiguracaoFinanceiro = DEFAULT_CONFIG

  constructor(storageRoot: string) {
    this.root = storageRoot
    this.dbFile = join(storageRoot, 'db.json')
    this.anexosDir = join(storageRoot, 'anexos')
    mkdirSync(this.anexosDir, { recursive: true })
    this.load()
  }

  /* ────────────────── Persistência ────────────────── */

  private load(): void {
    if (!existsSync(this.dbFile)) {
      this.save()
      return
    }
    try {
      const raw = readFileSync(this.dbFile, 'utf-8')
      const data = JSON.parse(raw)
      this.receitas = new Map(Object.entries(data.receitas ?? {}))
      this.despesas = new Map(Object.entries(data.despesas ?? {}))
      this.impostos = new Map(Object.entries(data.impostos ?? {}))
      this.lancamentos = new Map(Object.entries(data.lancamentos ?? {}))
      this.config = { ...DEFAULT_CONFIG, ...(data.config ?? {}) }
    } catch (err) {
      console.error('[FinanceiroService] Erro ao carregar db:', err)
    }
  }

  private save(): void {
    const data = {
      receitas: Object.fromEntries(this.receitas),
      despesas: Object.fromEntries(this.despesas),
      impostos: Object.fromEntries(this.impostos),
      lancamentos: Object.fromEntries(this.lancamentos),
      config: this.config,
      salvoEm: new Date().toISOString(),
    }
    const tmp = `${this.dbFile}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, this.dbFile)
  }

  /* ────────────────── Anexos ────────────────── */

  saveAnexo(competencia: string, subpath: 'receitas' | 'despesas' | 'impostos' | 'extratos', nomeOriginal: string, buffer: Buffer): Anexo {
    const dir = join(this.anexosDir, competencia, subpath)
    mkdirSync(dir, { recursive: true })
    const safeName = nomeOriginal.replace(/[^a-zA-Z0-9._-]/g, '_')
    const id = randomUUID()
    const nomeArmazenado = `${competencia}/${subpath}/${id}_${safeName}`
    writeFileSync(join(this.anexosDir, nomeArmazenado), buffer)
    const ext = safeName.split('.').pop()?.toLowerCase() ?? ''
    const tipo: Anexo['tipo'] =
      ext === 'pdf' ? 'pdf'
      : ext === 'xml' ? 'xml'
      : ext === 'jpg' || ext === 'jpeg' ? 'jpg'
      : ext === 'png' ? 'png'
      : ext === 'ofx' ? 'ofx'
      : 'outro'
    return {
      id,
      nomeOriginal,
      nomeArmazenado,
      tipo,
      tamanho: buffer.length,
      uploadEm: new Date().toISOString(),
    }
  }

  lerAnexo(nomeArmazenado: string): Buffer | null {
    const full = join(this.anexosDir, nomeArmazenado)
    if (!existsSync(full)) return null
    return readFileSync(full)
  }

  caminhoAnexo(nomeArmazenado: string): string {
    return join(this.anexosDir, nomeArmazenado)
  }

  /* ────────────────── Receitas ────────────────── */

  criarReceita(dados: Omit<Receita, 'id' | 'criadoEm' | 'atualizadoEm' | 'valorLiquido' | 'status'> & { status?: StatusReceita }): Receita {
    const id = `rec-${randomUUID()}`
    const now = new Date().toISOString()
    const totalRet = dados.retencoes ? Object.values(dados.retencoes).reduce((s, v) => s + (v ?? 0), 0) : 0
    const status: StatusReceita = dados.status
      ?? (dados.dataRecebimento ? 'recebida'
        : this.isAtrasado(dados.dataPrevisaoRecebimento) ? 'atrasada'
        : 'emitida')
    const receita: Receita = {
      ...dados,
      id,
      valorLiquido: Number((dados.valorBruto - totalRet).toFixed(2)),
      status,
      anexos: dados.anexos ?? [],
      criadoEm: now,
      atualizadoEm: now,
    }
    this.receitas.set(id, receita)
    this.save()
    return receita
  }

  atualizarReceita(id: string, patch: Partial<Receita>): Receita | null {
    const r = this.receitas.get(id)
    if (!r) return null
    const merged: Receita = { ...r, ...patch, id, atualizadoEm: new Date().toISOString() }
    const totalRet = merged.retencoes ? Object.values(merged.retencoes).reduce((s, v) => s + (v ?? 0), 0) : 0
    merged.valorLiquido = Number((merged.valorBruto - totalRet).toFixed(2))
    // Recompute status automático se não foi forçado
    if (!patch.status) {
      merged.status = merged.dataRecebimento ? 'recebida'
        : this.isAtrasado(merged.dataPrevisaoRecebimento) ? 'atrasada'
        : merged.status
    }
    this.receitas.set(id, merged)
    this.save()
    return merged
  }

  deletarReceita(id: string): boolean {
    const ok = this.receitas.delete(id)
    if (ok) this.save()
    return ok
  }

  listarReceitas(filtro?: { competencia?: string; status?: StatusReceita; clienteBusca?: string }): Receita[] {
    let arr = Array.from(this.receitas.values())
    if (filtro?.competencia) arr = arr.filter((r) => r.competencia === filtro.competencia)
    if (filtro?.status) arr = arr.filter((r) => r.status === filtro.status)
    if (filtro?.clienteBusca) {
      const q = filtro.clienteBusca.toLowerCase()
      arr = arr.filter((r) => r.cliente?.nome.toLowerCase().includes(q))
    }
    return arr.sort((a, b) => b.dataEmissao.localeCompare(a.dataEmissao))
  }

  getReceita(id: string): Receita | null {
    return this.receitas.get(id) ?? null
  }

  /* ────────────────── Despesas ────────────────── */

  criarDespesa(dados: Omit<Despesa, 'id' | 'criadoEm' | 'atualizadoEm' | 'status'> & { status?: StatusDespesa }): Despesa {
    const id = `des-${randomUUID()}`
    const now = new Date().toISOString()
    const status: StatusDespesa = dados.status
      ?? (dados.dataPagamento ? 'paga'
        : this.isAtrasado(dados.dataVencimento) ? 'atrasada'
        : 'pendente')
    const despesa: Despesa = {
      ...dados,
      id,
      status,
      anexos: dados.anexos ?? [],
      criadoEm: now,
      atualizadoEm: now,
    }
    this.despesas.set(id, despesa)
    this.save()
    return despesa
  }

  atualizarDespesa(id: string, patch: Partial<Despesa>): Despesa | null {
    const d = this.despesas.get(id)
    if (!d) return null
    const merged: Despesa = { ...d, ...patch, id, atualizadoEm: new Date().toISOString() }
    if (!patch.status) {
      merged.status = merged.dataPagamento ? 'paga'
        : this.isAtrasado(merged.dataVencimento) ? 'atrasada'
        : merged.status
    }
    this.despesas.set(id, merged)
    this.save()
    return merged
  }

  deletarDespesa(id: string): boolean {
    const ok = this.despesas.delete(id)
    if (ok) this.save()
    return ok
  }

  listarDespesas(filtro?: { competencia?: string; categoria?: CategoriaDespesa; status?: StatusDespesa }): Despesa[] {
    let arr = Array.from(this.despesas.values())
    if (filtro?.competencia) arr = arr.filter((d) => d.competencia === filtro.competencia)
    if (filtro?.categoria) arr = arr.filter((d) => d.categoria === filtro.categoria)
    if (filtro?.status) arr = arr.filter((d) => d.status === filtro.status)
    return arr.sort((a, b) => b.dataVencimento.localeCompare(a.dataVencimento))
  }

  getDespesa(id: string): Despesa | null {
    return this.despesas.get(id) ?? null
  }

  /* ────────────────── Impostos ────────────────── */

  criarImposto(dados: Omit<Imposto, 'id' | 'criadoEm' | 'atualizadoEm' | 'status'> & { status?: Imposto['status'] }): Imposto {
    const id = `imp-${randomUUID()}`
    const now = new Date().toISOString()
    const status: Imposto['status'] = dados.status
      ?? (dados.dataPagamento ? 'pago'
        : this.isAtrasado(dados.dataVencimento) ? 'atrasado'
        : 'a_pagar')
    const imp: Imposto = {
      ...dados,
      id,
      status,
      anexos: dados.anexos ?? [],
      criadoEm: now,
      atualizadoEm: now,
    }
    this.impostos.set(id, imp)
    this.save()
    return imp
  }

  atualizarImposto(id: string, patch: Partial<Imposto>): Imposto | null {
    const i = this.impostos.get(id)
    if (!i) return null
    const merged: Imposto = { ...i, ...patch, id, atualizadoEm: new Date().toISOString() }
    if (!patch.status) {
      merged.status = merged.dataPagamento ? 'pago'
        : this.isAtrasado(merged.dataVencimento) ? 'atrasado'
        : merged.status
    }
    this.impostos.set(id, merged)
    this.save()
    return merged
  }

  deletarImposto(id: string): boolean {
    const ok = this.impostos.delete(id)
    if (ok) this.save()
    return ok
  }

  listarImpostos(filtro?: { competencia?: string; tipo?: Imposto['tipo'] }): Imposto[] {
    let arr = Array.from(this.impostos.values())
    if (filtro?.competencia) arr = arr.filter((i) => i.competencia === filtro.competencia)
    if (filtro?.tipo) arr = arr.filter((i) => i.tipo === filtro.tipo)
    return arr.sort((a, b) => b.dataVencimento.localeCompare(a.dataVencimento))
  }

  /* ────────────────── Lançamentos bancários ────────────────── */

  criarLancamento(dados: Omit<LancamentoBancario, 'id' | 'criadoEm'>): LancamentoBancario {
    const id = `lan-${randomUUID()}`
    const l: LancamentoBancario = {
      ...dados,
      id,
      criadoEm: new Date().toISOString(),
    }
    this.lancamentos.set(id, l)
    this.save()
    return l
  }

  atualizarLancamento(id: string, patch: Partial<LancamentoBancario>): LancamentoBancario | null {
    const l = this.lancamentos.get(id)
    if (!l) return null
    const merged = { ...l, ...patch, id }
    this.lancamentos.set(id, merged)
    this.save()
    return merged
  }

  deletarLancamento(id: string): boolean {
    const ok = this.lancamentos.delete(id)
    if (ok) this.save()
    return ok
  }

  listarLancamentos(filtro?: { contaId?: string; dataInicio?: string; dataFim?: string; naoClassificados?: boolean }): LancamentoBancario[] {
    let arr = Array.from(this.lancamentos.values())
    if (filtro?.contaId) arr = arr.filter((l) => l.contaId === filtro.contaId)
    if (filtro?.dataInicio) arr = arr.filter((l) => l.data >= filtro.dataInicio!)
    if (filtro?.dataFim) arr = arr.filter((l) => l.data <= filtro.dataFim!)
    if (filtro?.naoClassificados) arr = arr.filter((l) => !l.vinculadoA && (!l.categoria || l.categoria === 'nao_classificado'))
    return arr.sort((a, b) => b.data.localeCompare(a.data))
  }

  /* ────────────────── Configuração ────────────────── */

  getConfig(): ConfiguracaoFinanceiro {
    return this.config
  }

  atualizarConfig(patch: Partial<ConfiguracaoFinanceiro>): ConfiguracaoFinanceiro {
    this.config = { ...this.config, ...patch, atualizadoEm: new Date().toISOString() }
    this.save()
    return this.config
  }

  /* ────────────────── Cálculos ────────────────── */

  private isAtrasado(data?: string): boolean {
    if (!data) return false
    return data < new Date().toISOString().slice(0, 10)
  }

  /** Receita bruta do mês (YYYY-MM) — baseada em competência. */
  receitaBrutaMes(competencia: string): number {
    let total = 0
    for (const r of this.receitas.values()) {
      if (r.competencia === competencia && r.status !== 'cancelada') total += r.valorBruto
    }
    return Number(total.toFixed(2))
  }

  /** RBT12 — soma de receita bruta dos 12 meses anteriores (exclui o mês da competência dada, inclui os 12 antes). */
  calcularRBT12(competencia: string): number {
    const [ano, mes] = competencia.split('-').map(Number)
    let rbt = 0
    for (let i = 1; i <= 12; i++) {
      // Subtrair i meses de (ano, mes) — rolando ano
      let y = ano
      let m = mes - i
      while (m <= 0) {
        m += 12
        y -= 1
      }
      const comp = `${y}-${String(m).padStart(2, '0')}`
      rbt += this.receitaBrutaMes(comp)
    }
    return Number(rbt.toFixed(2))
  }

  /** DRE mensal completo. */
  calcularDREMensal(competencia: string): DREMensal {
    const receitas = this.listarReceitas({ competencia })
    const despesas = this.listarDespesas({ competencia })
    const impostos = this.listarImpostos({ competencia })
    const extratos = this.listarLancamentos({
      dataInicio: `${competencia}-01`,
      dataFim: `${competencia}-31`,
    })

    const receitaBruta = receitas.reduce((s, r) => s + (r.status !== 'cancelada' ? r.valorBruto : 0), 0)
    const retencoes = receitas.reduce((s, r) => {
      if (r.status === 'cancelada' || !r.retencoes) return s
      return s + Object.values(r.retencoes).reduce((a, v) => a + (v ?? 0), 0)
    }, 0)
    const receitaLiquida = receitaBruta - retencoes

    const despesasPorCategoria: Record<CategoriaDespesa, number> = {} as any
    for (const c of CATEGORIAS_DESPESA) despesasPorCategoria[c.id] = 0
    let totalDespesas = 0
    let despesasDedutiveis = 0
    let despesasNaoDedutiveis = 0
    for (const d of despesas) {
      if (d.status === 'cancelada') continue
      despesasPorCategoria[d.categoria] = (despesasPorCategoria[d.categoria] ?? 0) + d.valor
      totalDespesas += d.valor
      if (CATEGORIA_DEDUTIVEL[d.categoria]) despesasDedutiveis += d.valor
      else despesasNaoDedutiveis += d.valor
    }

    const impostosApurados = impostos.reduce((s, i) => s + i.valor, 0)
    const resultadoOperacional = receitaLiquida - despesasDedutiveis
    const resultadoLiquido = resultadoOperacional - despesasNaoDedutiveis - impostosApurados
    const margemLiquida = receitaBruta > 0 ? (resultadoLiquido / receitaBruta) * 100 : 0

    return {
      competencia,
      receitaBruta: Number(receitaBruta.toFixed(2)),
      retencoes: Number(retencoes.toFixed(2)),
      receitaLiquida: Number(receitaLiquida.toFixed(2)),
      despesasPorCategoria,
      totalDespesas: Number(totalDespesas.toFixed(2)),
      despesasDedutiveis: Number(despesasDedutiveis.toFixed(2)),
      despesasNaoDedutiveis: Number(despesasNaoDedutiveis.toFixed(2)),
      resultadoOperacional: Number(resultadoOperacional.toFixed(2)),
      impostosApurados: Number(impostosApurados.toFixed(2)),
      resultadoLiquido: Number(resultadoLiquido.toFixed(2)),
      margemLiquida: Number(margemLiquida.toFixed(2)),
      contagens: {
        receitas: receitas.length,
        despesas: despesas.length,
        impostos: impostos.length,
        extratos: extratos.length,
      },
    }
  }

  /** DRE anual consolidado com todos os meses. */
  calcularDREAnual(ano: number): DREAnual {
    const meses: DREMensal[] = []
    for (let m = 1; m <= 12; m++) {
      const comp = `${ano}-${String(m).padStart(2, '0')}`
      meses.push(this.calcularDREMensal(comp))
    }
    const totais = {
      receitaBruta: meses.reduce((s, m) => s + m.receitaBruta, 0),
      receitaLiquida: meses.reduce((s, m) => s + m.receitaLiquida, 0),
      totalDespesas: meses.reduce((s, m) => s + m.totalDespesas, 0),
      resultadoLiquido: meses.reduce((s, m) => s + m.resultadoLiquido, 0),
      impostosPagos: 0,
      das: 0,
      inss: 0,
      iss: 0,
      outros: 0,
    }
    for (const imp of this.impostos.values()) {
      if (imp.competencia.startsWith(`${ano}-`) && imp.status === 'pago') {
        totais.impostosPagos += imp.valor
        if (imp.tipo === 'das_simples') totais.das += imp.valor
        else if (imp.tipo === 'inss_pro_labore') totais.inss += imp.valor
        else if (imp.tipo === 'iss') totais.iss += imp.valor
        else totais.outros += imp.valor
      }
    }
    const ultimoMes = `${ano}-12`
    const rbt12 = this.calcularRBT12(ultimoMes)
    const compAtual = new Date().toISOString().slice(0, 7)
    const dasAtual = calcularDAS(this.receitaBrutaMes(compAtual), this.calcularRBT12(compAtual), this.config.anexoSimples, compAtual)

    return {
      ano,
      meses,
      totais: {
        receitaBruta: Number(totais.receitaBruta.toFixed(2)),
        receitaLiquida: Number(totais.receitaLiquida.toFixed(2)),
        totalDespesas: Number(totais.totalDespesas.toFixed(2)),
        resultadoLiquido: Number(totais.resultadoLiquido.toFixed(2)),
        impostosPagos: Number(totais.impostosPagos.toFixed(2)),
        das: Number(totais.das.toFixed(2)),
        inss: Number(totais.inss.toFixed(2)),
        iss: Number(totais.iss.toFixed(2)),
        outros: Number(totais.outros.toFixed(2)),
      },
      rbt12,
      aliquotaSimplesEfetiva: dasAtual.aliquotaEfetiva,
    }
  }

  /** Dashboard principal. */
  calcularDashboard(): DashboardFinanceiro {
    const hoje = new Date()
    const mesAtual = hoje.toISOString().slice(0, 7)
    const dreAtual = this.calcularDREMensal(mesAtual)
    const faturamento12m = this.calcularRBT12(mesAtual) + this.receitaBrutaMes(mesAtual)
    const rbt12 = this.calcularRBT12(mesAtual)

    const receitaMes = this.receitaBrutaMes(mesAtual)
    const dasProximo = receitaMes > 0
      ? calcularDAS(receitaMes, rbt12, this.config.anexoSimples, mesAtual)
      : undefined

    // Contas a receber
    const receitasAbertas = Array.from(this.receitas.values()).filter(
      (r) => r.status !== 'recebida' && r.status !== 'cancelada'
    )
    const contasReceber = {
      total: Number(receitasAbertas.reduce((s, r) => s + r.valorLiquido, 0).toFixed(2)),
      atrasadas: Number(
        receitasAbertas
          .filter((r) => r.status === 'atrasada')
          .reduce((s, r) => s + r.valorLiquido, 0)
          .toFixed(2)
      ),
      proximosVencimentos: receitasAbertas
        .filter((r) => r.dataPrevisaoRecebimento)
        .sort((a, b) => (a.dataPrevisaoRecebimento ?? '').localeCompare(b.dataPrevisaoRecebimento ?? ''))
        .slice(0, 10)
        .map((r) => ({
          id: r.id,
          cliente: r.cliente?.nome ?? r.descricao,
          valor: r.valorLiquido,
          vencimento: r.dataPrevisaoRecebimento ?? '',
          diasAtraso: this.diasAteHoje(r.dataPrevisaoRecebimento ?? ''),
        })),
    }

    // Contas a pagar
    const despesasAbertas = Array.from(this.despesas.values()).filter(
      (d) => d.status !== 'paga' && d.status !== 'cancelada'
    )
    const impostosAbertos = Array.from(this.impostos.values()).filter((i) => i.status !== 'pago')
    const contasPagar = {
      total: Number(
        (despesasAbertas.reduce((s, d) => s + d.valor, 0) + impostosAbertos.reduce((s, i) => s + i.valor, 0)).toFixed(2)
      ),
      atrasadas: Number(
        (
          despesasAbertas.filter((d) => d.status === 'atrasada').reduce((s, d) => s + d.valor, 0)
          + impostosAbertos.filter((i) => i.status === 'atrasado').reduce((s, i) => s + i.valor, 0)
        ).toFixed(2)
      ),
      proximosVencimentos: [
        ...despesasAbertas.map((d) => ({
          id: d.id,
          descricao: d.descricao,
          valor: d.valor,
          vencimento: d.dataVencimento,
          diasAtraso: this.diasAteHoje(d.dataVencimento),
        })),
        ...impostosAbertos.map((i) => ({
          id: i.id,
          descricao: `${i.tipo.toUpperCase()}: ${i.descricao}`,
          valor: i.valor,
          vencimento: i.dataVencimento,
          diasAtraso: this.diasAteHoje(i.dataVencimento),
        })),
      ]
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
        .slice(0, 10),
    }

    // Fluxo de caixa 12m (olhando para trás 11 meses + atual)
    const fluxoCaixa12m: DashboardFinanceiro['fluxoCaixa12m'] = []
    let acumulado = 0
    for (let i = 11; i >= 0; i--) {
      const [ano, mes] = mesAtual.split('-').map(Number)
      let y = ano
      let m = mes - i
      while (m <= 0) {
        m += 12
        y -= 1
      }
      const comp = `${y}-${String(m).padStart(2, '0')}`
      const dre = this.calcularDREMensal(comp)
      acumulado += dre.resultadoLiquido
      fluxoCaixa12m.push({
        mes: comp,
        receita: dre.receitaBruta,
        despesa: dre.totalDespesas + dre.impostosApurados,
        resultado: dre.resultadoLiquido,
        acumulado: Number(acumulado.toFixed(2)),
      })
    }

    // Top categorias despesa (últimos 3 meses)
    const cat: Record<string, number> = {}
    for (const d of this.despesas.values()) {
      if (d.status === 'cancelada') continue
      const diff = this.mesesDesdeHoje(d.competencia)
      if (diff <= 3) cat[d.categoria] = (cat[d.categoria] ?? 0) + d.valor
    }
    const totalCat = Object.values(cat).reduce((s, v) => s + v, 0)
    const topCategoriasDespesa = Object.entries(cat)
      .map(([categoria, valor]) => ({
        categoria: categoria as CategoriaDespesa,
        nome: CATEGORIA_NOMES[categoria] ?? categoria,
        valor: Number(valor.toFixed(2)),
        pct: totalCat > 0 ? Number(((valor / totalCat) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6)

    // Top clientes (ano corrente)
    const anoAtual = hoje.getFullYear()
    const cli: Record<string, number> = {}
    for (const r of this.receitas.values()) {
      if (r.status === 'cancelada') continue
      if (!r.competencia.startsWith(`${anoAtual}-`)) continue
      const nome = r.cliente?.nome ?? 'Sem identificação'
      cli[nome] = (cli[nome] ?? 0) + r.valorBruto
    }
    const totalCli = Object.values(cli).reduce((s, v) => s + v, 0)
    const topClientes = Object.entries(cli)
      .map(([cliente, valor]) => ({
        cliente,
        valor: Number(valor.toFixed(2)),
        pct: totalCli > 0 ? Number(((valor / totalCli) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6)

    // Alertas
    const alertas: DashboardFinanceiro['alertas'] = []
    const limite = alertaLimiteSimples(rbt12)
    if (limite.nivel !== 'ok') {
      alertas.push({
        tipo: 'limite_simples',
        severidade: limite.nivel === 'critico' ? 'critico' : 'atencao',
        titulo: `Limite do Simples: ${limite.pctLimite.toFixed(1)}% utilizado`,
        detalhe: limite.mensagem,
      })
    }
    if (contasReceber.atrasadas > 0) {
      alertas.push({
        tipo: 'inadimplencia',
        severidade: contasReceber.atrasadas > 20000 ? 'critico' : 'atencao',
        titulo: `${this.formatBRL(contasReceber.atrasadas)} em honorários atrasados`,
        detalhe: `${receitasAbertas.filter((r) => r.status === 'atrasada').length} recebimentos aguardando. Considere cobrança ou renegociação.`,
      })
    }
    if (contasPagar.atrasadas > 0) {
      alertas.push({
        tipo: 'vencimento',
        severidade: 'critico',
        titulo: `${this.formatBRL(contasPagar.atrasadas)} em pagamentos atrasados`,
        detalhe: 'Despesas e/ou impostos com vencimento ultrapassado.',
      })
    }
    if (dreAtual.resultadoLiquido < 0) {
      alertas.push({
        tipo: 'dre_negativo',
        severidade: 'atencao',
        titulo: `Resultado líquido negativo em ${mesAtual}`,
        detalhe: `Despesas (${this.formatBRL(dreAtual.totalDespesas + dreAtual.impostosApurados)}) superam a receita líquida (${this.formatBRL(dreAtual.receitaLiquida)}).`,
      })
    }
    const proximos7dias = contasPagar.proximosVencimentos.filter((v) => v.diasAtraso >= -7 && v.diasAtraso < 0)
    if (proximos7dias.length > 0) {
      alertas.push({
        tipo: 'vencimento',
        severidade: 'info',
        titulo: `${proximos7dias.length} conta(s) vencem nos próximos 7 dias`,
        detalhe: `Total: ${this.formatBRL(proximos7dias.reduce((s, v) => s + v.valor, 0))}`,
      })
    }

    return {
      mesAtual,
      dreAtual,
      faturamento12m: Number(faturamento12m.toFixed(2)),
      rbt12,
      dasProximo,
      contasReceber,
      contasPagar,
      fluxoCaixa12m,
      topCategoriasDespesa,
      topClientes,
      alertas,
    }
  }

  /** Checklist para fechar um mês (verificar pendências antes do pacote ao contador). */
  gerarChecklistFechamento(competencia: string): ChecklistFechamento {
    const receitas = this.listarReceitas({ competencia })
    const despesas = this.listarDespesas({ competencia })
    const impostos = this.listarImpostos({ competencia })
    const [ano, mes] = competencia.split('-').map(Number)
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const inicio = `${competencia}-01`
    const fim = `${competencia}-${String(ultimoDia).padStart(2, '0')}`
    const extratos = this.listarLancamentos({ dataInicio: inicio, dataFim: fim })

    const receitasSemAnexo = receitas.filter((r) => r.anexos.length === 0).length
    const despesasSemAnexo = despesas.filter((d) => d.anexos.length === 0).length
    const receitasAReceber = receitas.filter((r) => !r.dataRecebimento).length
    const despesasAPagar = despesas.filter((d) => !d.dataPagamento).length
    const temDAS = impostos.some((i) => i.tipo === 'das_simples')
    const temExtrato = extratos.length > 0
    const config = this.config
    const temConfigContador = config.contador.email.length > 0
    const temCnpj = config.empresa.cnpj.length > 0

    const itens = [
      {
        titulo: 'Receitas com NF anexada',
        ok: receitas.length > 0 && receitasSemAnexo === 0,
        detalhe: receitas.length === 0 ? 'Nenhuma receita cadastrada no mês.' : receitasSemAnexo === 0 ? `${receitas.length} receita(s) todas com NF.` : `${receitasSemAnexo} receita(s) sem NF anexada.`,
      },
      {
        titulo: 'Despesas com comprovante',
        ok: despesasSemAnexo === 0,
        detalhe: despesasSemAnexo === 0 ? `${despesas.length} despesa(s), todas com comprovante.` : `${despesasSemAnexo} despesa(s) sem comprovante.`,
      },
      {
        titulo: 'Recebimentos conciliados',
        ok: receitasAReceber === 0,
        detalhe: receitasAReceber === 0 ? 'Todos os recebimentos registrados.' : `${receitasAReceber} receita(s) sem data de recebimento.`,
      },
      {
        titulo: 'Pagamentos conciliados',
        ok: despesasAPagar === 0,
        detalhe: despesasAPagar === 0 ? 'Todas as despesas liquidadas.' : `${despesasAPagar} despesa(s) sem data de pagamento.`,
      },
      {
        titulo: 'DAS do mês apurado',
        ok: temDAS || receitas.length === 0,
        detalhe: temDAS ? 'DAS registrado.' : receitas.length === 0 ? 'Sem receita no mês — DAS dispensado.' : 'DAS não calculado/registrado.',
      },
      {
        titulo: 'Extrato bancário do mês importado',
        ok: temExtrato,
        detalhe: temExtrato ? `${extratos.length} lançamento(s) no período.` : 'Nenhum extrato importado — subir OFX ou lançar manualmente.',
      },
      {
        titulo: 'Configurações da empresa',
        ok: temCnpj,
        detalhe: temCnpj ? `CNPJ ${config.empresa.cnpj} cadastrado.` : 'CNPJ não preenchido em Configurações.',
      },
      {
        titulo: 'E-mail do contador',
        ok: temConfigContador,
        detalhe: temConfigContador ? `Contador: ${config.contador.email}.` : 'E-mail do contador não cadastrado.',
      },
    ]

    return {
      competencia,
      itens,
      pronto: itens.every((i) => i.ok),
    }
  }

  /* ────────────────── Auxiliares ────────────────── */

  private formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  }

  private diasAteHoje(data: string): number {
    if (!data) return 0
    const hoje = new Date().toISOString().slice(0, 10)
    const d1 = new Date(hoje + 'T00:00:00Z').getTime()
    const d2 = new Date(data + 'T00:00:00Z').getTime()
    return Math.round((d1 - d2) / 86400000)
  }

  private mesesDesdeHoje(comp: string): number {
    const hoje = new Date()
    const [ano, mes] = comp.split('-').map(Number)
    return (hoje.getFullYear() - ano) * 12 + (hoje.getMonth() + 1 - mes)
  }
}

let singleton: FinanceiroService | null = null

export function getFinanceiroService(): FinanceiroService {
  if (!singleton) {
    const storageRoot = join(process.cwd(), 'storage', 'financeiro')
    mkdirSync(storageRoot, { recursive: true })
    singleton = new FinanceiroService(storageRoot)
  }
  return singleton
}

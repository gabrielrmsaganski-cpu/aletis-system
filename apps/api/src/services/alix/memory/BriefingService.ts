// ============================================================
// ALETIS — Briefing Service (Wave 9 — MEMORY)
//
// Gera um briefing proativo e determinístico por cliente,
// agregando três fontes:
//   1. Memória da Alix          (AlixMemoryService)
//   2. Dossiê/analise do cliente (storage/clientes/{id}.json)
//   3. Último snapshot BSC       (storage/bsc/{id}.jsonl — última linha)
//
// NÃO invoca LLM — pura agregação para economizar tokens e
// permitir execução offline.
//
// Política de "primeira ação"
// ───────────────────────────
// • Preserva próximas ações registradas e alertas críticos.
// • Referências financeiras sem posição comprovada → acrescenta conferência
//   com extratos; esta é a primeira sugestão apenas sem ação ou alerta anterior.
// • Senão, sugere importar dados via dossiê (caminho vazio).
// ============================================================

import { promises as fs } from 'fs'
import { join } from 'path'
import { AlixMemoryService } from './AlixMemoryService.js'
import type {
  Briefing,
  BriefingDestaque,
  BriefingDivida,
  BriefingKpiBsc,
  BriefingReferenciaFinanceiraMemoria,
  BriefingResumoFinanceiro,
  MemoriaCliente,
  StatusPerspectivaBriefing,
} from './types.js'

const STORAGE_ROOT = join(process.cwd(), 'storage')

// ── Helpers seguros ─────────────────────────────────────────

function sanitizeClienteId(id: string): string {
  const limpo = id.replace(/[^a-zA-Z0-9._-]/g, '_').trim()
  if (!limpo) throw new Error('clienteId inválido')
  return limpo
}

async function lerJsonSeExistir<T = unknown>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function lerUltimaLinhaJsonl<T = unknown>(
  p: string,
): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, 'utf-8')
    const linhas = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (linhas.length === 0) return null
    const ultima = linhas[linhas.length - 1]
    return JSON.parse(ultima) as T
  } catch {
    return null
  }
}

function brl(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return 'saldo não informado'
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Nunca interpreta texto, valores originais ou totais do CRM como saldo. */
function saldoNumericoInformado(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null
}

// ── Mapeamentos do dossiê existente ─────────────────────────
// O formato atual `cli-xxx.analise.json` traz `saldoRecalculado.porDivida[]`
// + `alertasTop[]`. A fonte é uma análise, sem prova de posição bancária atual.
// Textos da memória permanecem referências separadas, sem conversão monetária.

interface AnaliseCliente {
  saldoRecalculado?: {
    porDivida?: Array<{
      credor?: string
      contrato?: string
      saldoRecalculado?: number | null
      diasDesdeVencimento?: number
    }>
  }
  alertasTop?: Array<{
    nivel?: string
    origem?: string
    mensagem?: string
  }>
  srai?: {
    classificacao?: string
    alertas?: string[]
    recomendacoes?: string[]
  }
}

interface BscSnapshot {
  clienteId?: string
  calculadoEm?: string
  resultado?: {
    scoreGeral?: number
    porPerspectiva?: Array<{
      perspectiva?: string
      score?: number
    }>
    observacoes?: string[]
    recomendacoes?: string[]
  }
}

function statusPerspectiva(score: number): StatusPerspectivaBriefing {
  if (score >= 80) return 'verde'
  if (score >= 50) return 'amarelo'
  return 'vermelho'
}

function severidadeDeAlerta(nivel?: string): BriefingDestaque['severidade'] {
  const n = (nivel || '').toLowerCase()
  if (n.includes('crit')) return 'critico'
  if (n.includes('mod') || n.includes('aten') || n.includes('warn'))
    return 'atencao'
  return 'info'
}

// ── Core ────────────────────────────────────────────────────

export class BriefingService {
  private static instance: BriefingService | null = null
  private readonly memoryService: Pick<AlixMemoryService, 'get'>

  constructor(
    memoryService?: Pick<AlixMemoryService, 'get'>,
    private readonly storageRoot: string = STORAGE_ROOT,
  ) {
    this.memoryService = memoryService ?? AlixMemoryService.getInstance()
  }

  static getInstance(): BriefingService {
    if (!this.instance) this.instance = new BriefingService()
    return this.instance
  }

  async gerar(clienteId: string): Promise<Briefing> {
    const safeId = sanitizeClienteId(clienteId)

    const [memoria, analise, bsc] = await Promise.all([
      this.memoryService.get(safeId),
      lerJsonSeExistir<AnaliseCliente>(
        join(this.storageRoot, 'clientes', `${safeId}.json`),
      ),
      lerUltimaLinhaJsonl<BscSnapshot>(
        join(this.storageRoot, 'bsc', `${safeId}.jsonl`),
      ),
    ])

    const clienteNome = memoria?.clienteNome || safeId

    // ── Referências financeiras e cobertura ──────────────────
    // O nome dividasAtivas é mantido por compatibilidade de API. Somente
    // registros estruturados entram nele, sempre com posição não verificada.
    const dividasAtivas: BriefingDivida[] = []
    const registrosDaAnalise = analise?.saldoRecalculado?.porDivida
    if (Array.isArray(registrosDaAnalise)) {
      for (const d of registrosDaAnalise) {
        if (!d || typeof d !== 'object') continue
        const atraso = saldoNumericoInformado(d.diasDesdeVencimento)
        const status =
          atraso === null
            ? 'situação de atraso não informada na análise'
            : atraso > 180
              ? `atraso indicado na análise: ${atraso}d (crítico)`
              : atraso > 0
                ? `atraso indicado na análise: ${atraso}d`
                : 'sem atraso indicado na análise'
        const saldoBRL = saldoNumericoInformado(d.saldoRecalculado)
        dividasAtivas.push({
          credor: (d.credor || d.contrato || 'desconhecido').toString(),
          saldoBRL,
          status,
          origem: 'analise.saldoRecalculado.porDivida',
          naturezaSaldo: saldoBRL === null ? 'nao_informado' : 'informado_na_analise',
          situacaoAtual: 'nao_verificada',
        })
      }
    }
    const referenciasFinanceirasMemoria: BriefingReferenciaFinanceiraMemoria[] =
      (memoria?.dividasAtivas ?? [])
        .filter((texto) => typeof texto === 'string' && texto.trim().length > 0)
        .map((texto) => ({
          texto,
          origem: 'memoria',
          memoriaAtualizadaEm: memoria!.atualizadoEm,
          saldoAtualBRL: null,
          situacaoAtual: 'nao_verificada',
        }))
    const registrosComSaldoInformado = dividasAtivas.filter((d) => d.saldoBRL !== null).length
    const registrosSemSaldoInformado = dividasAtivas.length - registrosComSaldoInformado
    const resumoFinanceiro: BriefingResumoFinanceiro = {
      registrosNaAnalise: dividasAtivas.length,
      registrosComSaldoInformado,
      registrosSemSaldoInformado,
      referenciasMemoriaNaoConciliadas: referenciasFinanceirasMemoria.length,
      coberturaSaldosNaAnalise: dividasAtivas.length === 0
        ? 'sem_registros'
        : registrosComSaldoInformado === 0
          ? 'nenhum_informado'
          : registrosSemSaldoInformado > 0 ? 'parcial' : 'todos_informados',
      saldoAtualTotalBRL: null,
      situacaoAtual: 'nao_verificada',
    }
    const temReferenciasFinanceiras = dividasAtivas.length > 0 || referenciasFinanceirasMemoria.length > 0
    const acaoConferenciaFinanceira =
      'Confirmar a posição atual com extratos, contratos e comprovantes de amortização, registrando a data de referência antes de consolidar saldos ou priorizar credores.'

    // ── Destaques ───────────────────────────────────────────
    const destaques: BriefingDestaque[] = []
    if (analise?.alertasTop?.length) {
      for (const a of analise.alertasTop) {
        destaques.push({
          titulo: (a.origem || 'alerta').toString().toUpperCase(),
          detalhe: (a.mensagem || '').toString(),
          severidade: severidadeDeAlerta(a.nivel),
        })
      }
    }
    if (memoria?.alertas?.length) {
      for (const a of memoria.alertas) {
        destaques.push({
          titulo: 'MEMÓRIA',
          detalhe: a,
          severidade: 'atencao',
        })
      }
    }

    // ── KPIs BSC ────────────────────────────────────────────
    let kpisBscResumo: BriefingKpiBsc[] | undefined
    if (bsc?.resultado?.porPerspectiva?.length) {
      kpisBscResumo = bsc.resultado.porPerspectiva.map((p) => ({
        perspectiva: p.perspectiva || 'desconhecida',
        status: statusPerspectiva(Number(p.score || 0)),
        nota: `score ${Math.round(Number(p.score || 0))}/100`,
      }))
    }

    // ── Próximas ações ─────────────────────────────────────
    const proximasAcoes: string[] = []
    if (memoria?.proximasAcoes?.length)
      proximasAcoes.push(...memoria.proximasAcoes)
    if (proximasAcoes.length === 0 && analise?.srai?.recomendacoes?.length) {
      proximasAcoes.push(...analise.srai.recomendacoes)
    }
    const primeiraAcaoRegistrada = proximasAcoes[0]
    if (temReferenciasFinanceiras && !proximasAcoes.includes(acaoConferenciaFinanceira)) {
      proximasAcoes.push(acaoConferenciaFinanceira)
    }

    // ── Resumo executivo ────────────────────────────────────
    const nCritico = destaques.filter((d) => d.severidade === 'critico').length
    const resumoParts: string[] = []
    resumoParts.push(`Cliente ${clienteNome}.`)
    if (dividasAtivas.length > 0) {
      const rotulo = dividasAtivas.length === 1 ? 'obrigação relacionada' : 'obrigações relacionadas'
      resumoParts.push(
        `${dividasAtivas.length} ${rotulo} na análise; ` +
        `${registrosComSaldoInformado} com saldo numérico informado e ${registrosSemSaldoInformado} sem saldo informado.`,
      )
    }
    if (referenciasFinanceirasMemoria.length > 0) {
      const rotulo = referenciasFinanceirasMemoria.length === 1
        ? 'referência financeira textual na memória, ainda não conciliada'
        : 'referências financeiras textuais na memória, ainda não conciliadas'
      resumoParts.push(`${referenciasFinanceirasMemoria.length} ${rotulo} com documentos.`)
    }
    if (temReferenciasFinanceiras) {
      resumoParts.push('Saldo atual total e situação dos contratos não verificados. Valores históricos ou calculados não comprovam a posição atual.')
      if (dividasAtivas.some((d) => d.saldoBRL === 0)) {
        resumoParts.push('Zero informado na análise não comprova quitação.')
      }
    }
    if (nCritico > 0) {
      resumoParts.push(`${nCritico} alerta(s) crítico(s).`)
    }
    if (kpisBscResumo) {
      const verdes = kpisBscResumo.filter((k) => k.status === 'verde').length
      const vermelhos = kpisBscResumo.filter(
        (k) => k.status === 'vermelho',
      ).length
      resumoParts.push(
        `BSC: ${verdes} verde(s), ${vermelhos} vermelho(s).`,
      )
    }
    if (resumoParts.length === 1) {
      resumoParts.push(
        'Sem dados consolidados ainda — importar dossiê ou preencher memória.',
      )
    }
    const resumoExecutivo = resumoParts.join(' ')

    // ── Sugestão de primeira ação ──────────────────────────
    let sugestaoPrimeiraAcao = ''
    const dadosVazios =
      !memoria && !analise && !bsc && dividasAtivas.length === 0
    if (dadosVazios) {
      sugestaoPrimeiraAcao = 'Importar dados do cliente via dossiê'
    } else if (primeiraAcaoRegistrada) {
      sugestaoPrimeiraAcao = `Hoje faça: ${primeiraAcaoRegistrada}`
    } else if (nCritico > 0) {
      const critico = destaques.find((d) => d.severidade === 'critico')!
      sugestaoPrimeiraAcao = `Endereçar alerta crítico: ${critico.detalhe}`
    } else if (temReferenciasFinanceiras) {
      sugestaoPrimeiraAcao = acaoConferenciaFinanceira
    } else {
      sugestaoPrimeiraAcao = 'Atualizar memória do cliente com próxima ação'
    }

    const geradoEm = new Date().toISOString()

    const briefing: Briefing = {
      clienteId: safeId,
      clienteNome,
      geradoEm,
      resumoExecutivo,
      destaques,
      proximasAcoes,
      kpisBscResumo,
      dividasAtivas,
      referenciasFinanceirasMemoria,
      resumoFinanceiro,
      sugestaoPrimeiraAcao,
      markdown: '', // preenchido abaixo
    }

    briefing.markdown = this.renderMarkdown(briefing, memoria)
    return briefing
  }

  /** Render Markdown humano para consumo direto no dashboard / WA. */
  private renderMarkdown(
    b: Briefing,
    memoria: MemoriaCliente | null,
  ): string {
    const lines: string[] = []
    lines.push(`# Briefing — ${b.clienteNome}`)
    lines.push('')
    lines.push(`_Gerado em ${b.geradoEm}_`)
    lines.push('')
    lines.push('## Resumo executivo')
    lines.push(b.resumoExecutivo)
    lines.push('')
    lines.push('## Primeira ação sugerida')
    lines.push(`> ${b.sugestaoPrimeiraAcao}`)
    lines.push('')

    if (b.destaques.length > 0) {
      lines.push('## Destaques')
      for (const d of b.destaques) {
        const ic =
          d.severidade === 'critico'
            ? '[CRÍTICO]'
            : d.severidade === 'atencao'
              ? '[ATENÇÃO]'
              : '[INFO]'
        lines.push(`- ${ic} **${d.titulo}** — ${d.detalhe}`)
      }
      lines.push('')
    }

    if (b.dividasAtivas.length > 0) {
      lines.push('## Obrigações relacionadas na análise')
      lines.push('Valores do campo saldoRecalculado da análise; cálculo, data-base, amortizações e posição atual precisam de conferência. Não há totalização nem ordem de exposição comprovada.')
      lines.push('')
      for (const d of b.dividasAtivas) {
        const saldo = d.saldoBRL === null
          ? 'saldo não informado'
          : `${brl(d.saldoBRL)} informado na análise`
        lines.push(`- ${d.credor} — ${saldo} (${d.status}; situação atual não verificada)`)
      }
      lines.push('')
    }

    if (b.referenciasFinanceirasMemoria.length > 0) {
      lines.push('## Referências financeiras da memória (a confirmar)')
      lines.push('Texto histórico ou declarativo, sem comprovação de dívida ativa, saldo atual ou titularidade. A atualização da memória não é a data-base financeira. Não somar nem ordenar credores por estes textos.')
      lines.push('')
      for (const referencia of b.referenciasFinanceirasMemoria) {
        lines.push(`- Referência não verificada: ${referencia.texto}`)
      }
      lines.push('')
    }

    if (b.kpisBscResumo && b.kpisBscResumo.length > 0) {
      lines.push('## BSC — perspectivas')
      for (const k of b.kpisBscResumo) {
        const ic =
          k.status === 'verde'
            ? '[OK]'
            : k.status === 'amarelo'
              ? '[!]'
              : '[X]'
        lines.push(`- ${ic} ${k.perspectiva}: ${k.nota}`)
      }
      lines.push('')
    }

    if (b.proximasAcoes.length > 0) {
      lines.push('## Próximas ações')
      for (const a of b.proximasAcoes) lines.push(`- ${a}`)
      lines.push('')
    }

    if (memoria && memoria.perfil.length > 0) {
      lines.push('## Perfil (da memória)')
      for (const p of memoria.perfil.slice(0, 5)) lines.push(`- ${p}`)
      lines.push('')
    }

    return lines.join('\n')
  }
}

export function getBriefingService(): BriefingService {
  return BriefingService.getInstance()
}

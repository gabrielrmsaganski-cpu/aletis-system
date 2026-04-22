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
// • Se há proximasAcoes na memória → usa a primeira.
// • Senão, se há dívida crítica (>180d atraso, alerta crítico) → sugere
//   alongar / falar com credor principal.
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

function brl(v: number): string {
  if (!Number.isFinite(v)) return 'R$ —'
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

// ── Mapeamentos do dossiê existente ─────────────────────────
// O formato atual `cli-xxx.analise.json` traz `saldoRecalculado.porDivida[]`
// + `alertasTop[]`. Tratamos como "best effort": se não existir,
// caímos para memória.

interface AnaliseCliente {
  saldoRecalculado?: {
    porDivida?: Array<{
      credor?: string
      contrato?: string
      saldoRecalculado?: number
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
  private readonly memoryService: AlixMemoryService

  constructor(memoryService?: AlixMemoryService) {
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
        join(STORAGE_ROOT, 'clientes', `${safeId}.json`),
      ),
      lerUltimaLinhaJsonl<BscSnapshot>(
        join(STORAGE_ROOT, 'bsc', `${safeId}.jsonl`),
      ),
    ])

    const clienteNome = memoria?.clienteNome || safeId

    // ── Dívidas ─────────────────────────────────────────────
    const dividasAtivas: BriefingDivida[] = []
    if (analise?.saldoRecalculado?.porDivida?.length) {
      for (const d of analise.saldoRecalculado.porDivida) {
        const atraso = d.diasDesdeVencimento ?? 0
        const status =
          atraso > 180
            ? `atraso ${atraso}d (crítico)`
            : atraso > 0
              ? `atraso ${atraso}d`
              : 'em dia'
        dividasAtivas.push({
          credor: (d.credor || d.contrato || 'desconhecido').toString(),
          saldoBRL: Number(d.saldoRecalculado || 0),
          status,
        })
      }
    } else if (memoria?.dividasAtivas?.length) {
      for (const linha of memoria.dividasAtivas) {
        dividasAtivas.push({
          credor: linha,
          saldoBRL: 0,
          status: 'memória',
        })
      }
    }

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

    // ── Resumo executivo ────────────────────────────────────
    const totalSaldo = dividasAtivas.reduce((acc, d) => acc + d.saldoBRL, 0)
    const nCritico = destaques.filter((d) => d.severidade === 'critico').length
    const resumoParts: string[] = []
    resumoParts.push(`Cliente ${clienteNome}.`)
    if (dividasAtivas.length > 0) {
      resumoParts.push(
        `${dividasAtivas.length} dívida${
          dividasAtivas.length > 1 ? 's' : ''
        } ativa${dividasAtivas.length > 1 ? 's' : ''} — saldo total ${brl(totalSaldo)}.`,
      )
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
    } else if (proximasAcoes.length > 0) {
      sugestaoPrimeiraAcao = `Hoje faça: ${proximasAcoes[0]}`
    } else if (nCritico > 0) {
      const critico = destaques.find((d) => d.severidade === 'critico')!
      sugestaoPrimeiraAcao = `Endereçar alerta crítico: ${critico.detalhe}`
    } else if (dividasAtivas.length > 0) {
      const maior = [...dividasAtivas].sort(
        (a, b) => b.saldoBRL - a.saldoBRL,
      )[0]
      sugestaoPrimeiraAcao = `Contactar ${maior.credor} (maior exposição — ${brl(maior.saldoBRL)})`
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
      lines.push('## Dívidas ativas')
      for (const d of b.dividasAtivas) {
        lines.push(`- ${d.credor} — ${brl(d.saldoBRL)} (${d.status})`)
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

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

/**
 * Fila persistente de enriquecimento.
 *
 * O modelo antigo (`enriquecerLote`) rodava puro em memória — se a API
 * reiniciasse no meio, o trabalho ficava órfão. Esta fila:
 *
 *  - Persiste cada job individualmente em `storage/prospeccao/queue.json`
 *    (write-tmp + rename) para sobreviver a reinícios.
 *  - Aplica backoff exponencial em falhas transitórias (SICAR_CAPTCHA_TIMEOUT,
 *    502 da BrasilAPI, etc) até o limite de tentativas.
 *  - Prioriza jobs marcados como `prioridade: 'alta'` (hot-leads auto-enfileirados).
 *  - Purga jobs finalizados (done/failed permanente) mais velhos que 24h.
 *
 * O runner é injetado (não importa `ProspeccaoService` diretamente, evitando
 * acoplamento circular). Qualquer função `(cpfCnpj) => Promise<void>` serve.
 */

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
export type JobPrioridade = 'alta' | 'normal' | 'baixa'

export interface EnrichmentJob {
  id: string
  cpfCnpj: string
  prioridade: JobPrioridade
  motivo: string
  status: JobStatus
  attempts: number
  /** Timestamp (ms) — só drena quando `Date.now() >= nextAttemptAt`. */
  nextAttemptAt: number
  lastError?: string
  /** Correlacional — permite agrupar jobs em um "batch" lógico. */
  batchId?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}

interface QueueFile {
  version: 1
  jobs: EnrichmentJob[]
}

const MAX_ATTEMPTS = 5
/** Backoff em segundos por tentativa (cumulativo). */
const BACKOFF_SECS = [10, 60, 300, 1800]

const PRIORIDADE_ORDEM: Record<JobPrioridade, number> = { alta: 0, normal: 1, baixa: 2 }

export type JobRunner = (cpfCnpj: string, job: EnrichmentJob) => Promise<void>

export class EnrichmentQueue {
  private readonly file: string
  private jobs = new Map<string, EnrichmentJob>()
  private runner: JobRunner | null = null
  private drainTimer: NodeJS.Timeout | null = null
  /** Jobs em execução agora (evita processar duas vezes). */
  private running = new Set<string>()
  private concurrency = 3

  constructor(storageDir: string) {
    this.file = join(storageDir, 'queue.json')
    this.load()
  }

  /**
   * Registra a função que executa o enriquecimento (tipicamente
   * `ProspeccaoService.enrichLead`). Precisa ser chamado antes de `start()`.
   */
  setRunner(runner: JobRunner): void {
    this.runner = runner
  }

  setConcurrency(n: number): void {
    this.concurrency = Math.min(8, Math.max(1, n))
  }

  /** Inicia o drainer — chamado no boot. Idempotente. */
  start(): void {
    if (this.drainTimer) return
    // Drena a cada 1s. `.unref()` para não manter o processo vivo em shutdown.
    this.drainTimer = setInterval(() => this.drain(), 1000)
    this.drainTimer.unref()
  }

  stop(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer)
      this.drainTimer = null
    }
  }

  /**
   * Enfileira um CPF/CNPJ para enriquecimento. Se já existe job pendente
   * com o mesmo cpfCnpj, devolve o existente (dedup) — exceto quando a
   * nova prioridade é maior, caso em que eleva o job existente.
   */
  enqueue(params: {
    cpfCnpj: string
    prioridade?: JobPrioridade
    motivo: string
    batchId?: string
  }): EnrichmentJob {
    const { cpfCnpj, motivo, batchId } = params
    const prioridade = params.prioridade ?? 'normal'
    const existente = Array.from(this.jobs.values()).find(
      (j) => j.cpfCnpj === cpfCnpj && (j.status === 'pending' || j.status === 'running'),
    )
    if (existente) {
      if (PRIORIDADE_ORDEM[prioridade] < PRIORIDADE_ORDEM[existente.prioridade]) {
        existente.prioridade = prioridade
        this.save()
      }
      return existente
    }
    const job: EnrichmentJob = {
      id: `job-${randomUUID()}`,
      cpfCnpj,
      prioridade,
      motivo,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: Date.now(),
      batchId,
      createdAt: new Date().toISOString(),
    }
    this.jobs.set(job.id, job)
    this.save()
    return job
  }

  /** Enfileira um lote de cpfCnpjs em uma operação atômica. */
  enqueueBatch(params: {
    cpfCnpjs: string[]
    prioridade?: JobPrioridade
    motivo: string
  }): { batchId: string; enfileirados: number; jaNaFila: number } {
    const batchId = `batch-${randomUUID()}`
    let enfileirados = 0
    let jaNaFila = 0
    for (const cpfCnpj of params.cpfCnpjs) {
      const job = this.enqueue({
        cpfCnpj,
        prioridade: params.prioridade,
        motivo: params.motivo,
        batchId,
      })
      if (job.batchId === batchId) enfileirados++
      else jaNaFila++
    }
    return { batchId, enfileirados, jaNaFila }
  }

  /** Retry manual — reseta para `pending` com `nextAttemptAt = now`. */
  retry(id: string): EnrichmentJob | null {
    const job = this.jobs.get(id)
    if (!job) return null
    if (job.status === 'running') return job
    job.status = 'pending'
    job.nextAttemptAt = Date.now()
    this.save()
    return job
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id)
    if (!job) return false
    if (job.status === 'running' || job.status === 'done') return false
    job.status = 'cancelled'
    job.completedAt = new Date().toISOString()
    this.save()
    return true
  }

  getJob(id: string): EnrichmentJob | null {
    return this.jobs.get(id) ?? null
  }

  /** Visão consolidada — UI usa para mostrar o painel. */
  stats(): {
    pending: number
    running: number
    done: number
    failed: number
    cancelled: number
    ultimasFalhas: EnrichmentJob[]
    emVoo: EnrichmentJob[]
    proximos: EnrichmentJob[]
  } {
    const all = Array.from(this.jobs.values())
    const by = (s: JobStatus) => all.filter((j) => j.status === s)
    return {
      pending: by('pending').length,
      running: by('running').length,
      done: by('done').length,
      failed: by('failed').length,
      cancelled: by('cancelled').length,
      ultimasFalhas: by('failed')
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
        .slice(0, 10),
      emVoo: by('running'),
      proximos: by('pending')
        .sort(this.priorityCompare.bind(this))
        .slice(0, 10),
    }
  }

  listarJobs(filtro?: { status?: JobStatus; batchId?: string; limite?: number }): EnrichmentJob[] {
    let arr = Array.from(this.jobs.values())
    if (filtro?.status) arr = arr.filter((j) => j.status === filtro.status)
    if (filtro?.batchId) arr = arr.filter((j) => j.batchId === filtro.batchId)
    arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return arr.slice(0, filtro?.limite ?? 200)
  }

  /* ============================== INTERNO ============================== */

  private priorityCompare(a: EnrichmentJob, b: EnrichmentJob): number {
    const p = PRIORIDADE_ORDEM[a.prioridade] - PRIORIDADE_ORDEM[b.prioridade]
    if (p !== 0) return p
    return a.nextAttemptAt - b.nextAttemptAt
  }

  private async drain(): Promise<void> {
    if (!this.runner) return
    this.purgarAntigos()

    const capacidadeLivre = this.concurrency - this.running.size
    if (capacidadeLivre <= 0) return

    const agora = Date.now()
    const candidatos = Array.from(this.jobs.values())
      .filter((j) => j.status === 'pending' && j.nextAttemptAt <= agora && !this.running.has(j.id))
      .sort(this.priorityCompare.bind(this))
      .slice(0, capacidadeLivre)

    for (const job of candidatos) {
      this.executarJob(job).catch(() => {
        // erros já são tratados dentro de executarJob
      })
    }
  }

  private async executarJob(job: EnrichmentJob): Promise<void> {
    if (!this.runner) return
    this.running.add(job.id)
    job.status = 'running'
    job.attempts += 1
    job.startedAt = new Date().toISOString()
    this.save()

    try {
      await this.runner(job.cpfCnpj, job)
      job.status = 'done'
      job.completedAt = new Date().toISOString()
      job.lastError = undefined
    } catch (err: any) {
      const msg = err?.message || String(err)
      job.lastError = msg
      if (job.attempts >= MAX_ATTEMPTS) {
        job.status = 'failed'
        job.completedAt = new Date().toISOString()
      } else {
        job.status = 'pending'
        const backoffSec = BACKOFF_SECS[job.attempts - 1] ?? BACKOFF_SECS[BACKOFF_SECS.length - 1]
        job.nextAttemptAt = Date.now() + backoffSec * 1000
      }
    } finally {
      this.running.delete(job.id)
      this.save()
    }
  }

  /** Remove jobs done/failed/cancelled mais velhos que 24h. */
  private purgarAntigos(): void {
    const limite = Date.now() - 24 * 60 * 60 * 1000
    let mudou = false
    for (const [id, job] of this.jobs) {
      if (job.status !== 'done' && job.status !== 'failed' && job.status !== 'cancelled') continue
      const t = Date.parse(job.completedAt ?? job.createdAt)
      if (Number.isFinite(t) && t < limite) {
        this.jobs.delete(id)
        mudou = true
      }
    }
    if (mudou) this.save()
  }

  private load(): void {
    if (!existsSync(this.file)) return
    try {
      const raw = readFileSync(this.file, 'utf8')
      const parsed = JSON.parse(raw) as QueueFile
      if (parsed.version !== 1 || !Array.isArray(parsed.jobs)) return
      // Qualquer job que estava `running` quando a API morreu volta para
      // `pending` — sem retry extra, apenas reentra na fila.
      for (const j of parsed.jobs) {
        if (j.status === 'running') {
          j.status = 'pending'
          j.nextAttemptAt = Date.now()
        }
        this.jobs.set(j.id, j)
      }
    } catch (err) {
      console.warn('[EnrichmentQueue] falha lendo fila, iniciando vazia', err)
    }
  }

  private save(): void {
    const payload: QueueFile = {
      version: 1,
      jobs: Array.from(this.jobs.values()),
    }
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(payload))
    renameSync(tmp, this.file)
  }
}

// ============================================================
// ALETIS — Alix Confirmation Store (HITL)
// Intenções de execução e recibos de resultado compartilhados
// entre a conversa e o painel de ações.
//
// Design notes
// ────────────
// Every mutation-capable tool Alix exposes to the model must NOT
// mutate state directly. Instead it registers a "pending
// confirmation" here (TTL 10 min) and returns a payload that the
// LLM surfaces to the user. A second HTTP round-trip
// (`POST /api/alix/confirmations/:id/approve`) runs the real
// executor. This guarantees the human sees exactly what will be
// written before it's written.
//
// O snapshot atômico preserva pendências válidas e recibos entre
// reinícios, com espelhamento no PostgreSQL quando habilitado.
// Um recibo em execução no reinício passa a resultado desconhecido;
// repetir seu ID nunca repete automaticamente o efeito.
// ============================================================

import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { getAlixTurnContext } from './AlixTurnContext.js';
import { toolFailure, toolOutcome, type ToolOutcome } from './tools/ToolOutcome.js';
import { z } from 'zod';

export interface PendingConfirmation {
  id: string;
  toolName: string;
  description: string;
  payload: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
  sessionId?: string;
  /** Cliente do contexto que preparou a ação, independente do alvo do payload. */
  contextClienteId?: string | null;
  riskLevel: ConfirmationRiskLevel;
  approvalsRequired: 1 | 2;
  approvalStep: 0 | 1;
  firstApprovedAt?: number;
  firstApprovedBy?: string;
  secondApprovalChallenge?: string;
}

export type ConfirmationRiskLevel = 'standard' | 'high' | 'critical';

export interface ConfirmationExecution {
  confirmation: PendingConfirmation;
  status: 'running' | 'completed' | 'failed' | 'unknown';
  startedAt: string;
  finishedAt?: string;
  outcome?: ToolOutcome;
  result?: unknown;
  error?: string;
}

export type ConfirmationAuthorization =
  | { status: 'ready'; confirmation: PendingConfirmation }
  | { status: 'awaiting_second_approval'; confirmation: PendingConfirmation; challenge: string }
  | { status: 'invalid_challenge'; confirmation: PendingConfirmation }
  | { status: 'not_found' };

// ── Alix Insano F4 — batch types ─────────────────────────────
export interface PendingConfirmationWithDeps extends PendingConfirmation {
  batchId?: string;
  dependsOn?: string[];
}

export type BatchStatus = 'pending' | 'applying' | 'partial_applied' | 'all_applied' | 'cancelled' | 'failed';

export interface ConfirmationBatch {
  batchId: string;
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: BatchStatus;
  pendings: PendingConfirmationWithDeps[];
  approvalStep?: 0 | 1;
  firstApprovedAt?: number;
  firstApprovedBy?: string;
  secondApprovalChallenge?: string;
  results?: {
    applied: Array<{ confirmationId: string; toolName: string; result: unknown }>;
    failed: Array<{ confirmationId: string; toolName: string; error: string }>;
    skipped: Array<{ confirmationId: string; toolName: string; reason: string }>;
  };
}

export interface BatchInputItem {
  toolName: string;
  description: string;
  payload: Record<string, unknown>;
  /** Index de item(s) no MESMO batch que devem completar antes (topological). */
  dependsOn?: number | number[];
}

export type StoreEvent =
  | { type: 'pending:created'; confirmation: PendingConfirmation }
  | { type: 'batch:created'; batch: ConfirmationBatch }
  | { type: 'batch:progress'; batchId: string; confirmationId: string; status: 'applying' | 'applied' | 'failed' | 'skipped'; detail?: unknown }
  | { type: 'batch:done'; batch: ConfirmationBatch };

export type StoreListener = (ev: StoreEvent) => void;

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutos
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60s

const HIGH_IMPACT_TOOL = /(?:^|_)(?:criar_cliente|promover_lead|onboarding_cliente|atualizar_cliente_completo|atualizar_dossie_dividas|excluir|deletar|remover|enviar_mensagem|whatsapp|email|agendar_reuniao|gerar_proposta_renegociacao)/i;
const CRITICAL_TOOL = /(?:^|_)(?:excluir|deletar|remover_cliente|cancelar_contrato|efetivar_pagamento|transferir|desembolsar)/i;

export function classifyConfirmationRisk(toolName: string): { riskLevel: ConfirmationRiskLevel; approvalsRequired: 1 | 2 } {
  if (CRITICAL_TOOL.test(toolName)) return { riskLevel: 'critical', approvalsRequired: 2 };
  if (HIGH_IMPACT_TOOL.test(toolName)) return { riskLevel: 'high', approvalsRequired: 2 };
  return { riskLevel: 'standard', approvalsRequired: 1 };
}

export class AlixConfirmationStore {
  private static instance: AlixConfirmationStore | null = null;
  private readonly store: Map<string, PendingConfirmation> = new Map();
  private readonly batches: Map<string, ConfirmationBatch> = new Map();
  private readonly executions = new Map<string, ConfirmationExecution>();
  private pgWriteTail: Promise<void> = Promise.resolve();
  private readonly listeners: Set<StoreListener> = new Set();
  private readonly ttlMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly storageRoot: string;
  private disposed = false;

  on(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(ev: StoreEvent): void {
    for (const l of this.listeners) {
      try { l(ev); } catch (err) { console.warn('[AlixConfirmationStore] listener erro:', (err as Error).message); }
    }
    // Snapshot em eventos que alteram o estado persistível.
    // Usa setImmediate para não bloquear o caminho crítico.
    if (
      ev.type === 'pending:created' ||
      ev.type === 'batch:created' ||
      ev.type === 'batch:progress' ||
      ev.type === 'batch:done'
    ) {
      setImmediate(() => {
        if (this.disposed) return
        try { this.persistSnapshot() } catch { /* best-effort */ }
      })
    }
  }

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.storageRoot = process.env.ALIX_STORAGE_DIR || `${process.cwd()}/storage`;
    // Agenda limpeza periódica (best-effort — não trava o processo).
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanupExpired();
        this.persistSnapshot();
      } catch (err) {
        console.warn('[AlixConfirmationStore] cleanup failed:', (err as Error).message);
      }
    }, CLEANUP_INTERVAL_MS);
    // Permitir que o Node encerre mesmo com o timer ativo (dev + tests).
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
    // Recovery: tenta recarregar snapshot prévio (sobrevive restart)
    try { this.loadSnapshot(); } catch (err) {
      console.warn('[AlixConfirmationStore] load snapshot falhou:', (err as Error).message);
    }
  }

  // ── Persistência (B.4) ────────────────────────────────────────
  // Snapshot completo do store em disco. Simples e seguro — não
  // persistimos o listener (ephemeral) nem o cleanupTimer.

  private snapshotFile(): string {
    const dir = this.storageRoot
    const target = `${dir}/alix-confirmations`
    try { mkdirSync(target, { recursive: true }) } catch {}
    return `${target}/snapshot.json`
  }

  /** Persiste pendings + batches + results em JSON. Idempotente. */
  private persistSnapshot(strict = false): void {
    try {
      const pendings = Array.from(this.store.values())
      const batches = Array.from(this.batches.values())
      const data = { v: 2, savedAt: Date.now(), pendings, batches, executions: Array.from(this.executions.values()) }
      const file = this.snapshotFile()
      const temporary = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
      writeFileSync(temporary, JSON.stringify(data))
      renameSync(temporary, file)

      // Espelha também recibos no mesmo registro PG; uma fila preserva a ordem.
      const mirrored = JSON.parse(JSON.stringify([
        ...pendings,
        ...data.executions.map((item) => ({ ...item.confirmation, status: item.status, execution: item })),
      ])) as unknown[]
      const checked = mirrored.map((item) => z.record(z.unknown()).parse(item))
      const batchCopy = JSON.parse(JSON.stringify(batches)) as Record<string, unknown>[]
      this.pgWriteTail = this.pgWriteTail.catch(() => undefined).then(async () => {
        try {
          const repo = await import('../../db/AlixConfirmationFeedbackRepository.js')
          await repo.dumpConfirmations({
            pendings: checked,
            batches: batchCopy,
          })
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[AlixConfirmationStore.persistSnapshot] dual-write PG falhou:', (err as Error).message)
        }
      })
    } catch (error) {
      if (strict) throw error
    }
  }

  /** Carrega snapshot no boot — descarta entradas já expiradas. */
  private loadSnapshot(): void {
    const file = this.snapshotFile()
    if (!existsSync(file)) return
    const raw = readFileSync(file, 'utf-8')
    if (!raw.trim()) return
    const data = JSON.parse(raw) as { pendings?: PendingConfirmation[]; batches?: ConfirmationBatch[]; executions?: ConfirmationExecution[] }
    const now = Date.now()
    let restoredP = 0, restoredB = 0
    for (const p of data.pendings || []) {
      if (!p?.id || !p.expiresAt) continue
      if (p.expiresAt <= now) continue
      const governance = classifyConfirmationRisk(p.toolName)
      this.store.set(p.id, {
        ...p,
        riskLevel: p.riskLevel || governance.riskLevel,
        approvalsRequired: p.approvalsRequired || governance.approvalsRequired,
        approvalStep: p.approvalStep === 1 ? 1 : 0,
      })
      restoredP++
    }
    for (const b of data.batches || []) {
      if (!b?.batchId) continue
      const pendings = (b.pendings || []).map((p) => {
        const governance = classifyConfirmationRisk(p.toolName)
        return {
          ...p,
          riskLevel: p.riskLevel || governance.riskLevel,
          approvalsRequired: p.approvalsRequired || governance.approvalsRequired,
          approvalStep: p.approvalStep === 1 ? 1 as const : 0 as const,
        }
      })
      this.batches.set(b.batchId, { ...b, status: b.status === 'applying' ? 'partial_applied' : b.status, pendings })
      restoredB++
    }
    for (const execution of data.executions || []) {
      if (!execution.confirmation?.id || !execution.startedAt) continue
      if (execution.status === 'running') {
        execution.status = 'unknown'
        execution.error = 'A API reiniciou durante a execução. Confira o registro antes de preparar outra ação.'
      }
      this.executions.set(execution.confirmation.id, execution)
      this.store.delete(execution.confirmation.id)
    }
  }

  static getInstance(): AlixConfirmationStore {
    if (!this.instance) this.instance = new AlixConfirmationStore();
    return this.instance;
  }

  private genId(): string {
    return 'conf_' + randomBytes(8).toString('hex');
  }

  create(
    toolName: string,
    description: string,
    payload: Record<string, unknown>,
    sessionId?: string,
  ): PendingConfirmation {
    const now = Date.now();
    const governance = classifyConfirmationRisk(toolName);
    const entry: PendingConfirmation = {
      id: this.genId(),
      toolName,
      description,
      payload,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      sessionId: sessionId || getAlixTurnContext()?.sessionId,
      contextClienteId: getAlixTurnContext() ? getAlixTurnContext()!.clienteId || null : undefined,
      ...governance,
      approvalStep: 0,
    };
    this.store.set(entry.id, entry);
    this.emit({ type: 'pending:created', confirmation: entry });
    return entry;
  }

  get(id: string): PendingConfirmation | null {
    const entry = this.store.get(id);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(id);
      return null;
    }
    return entry;
  }

  /**
   * Remove e retorna o intent — usar dentro dos handlers de
   * aprovação/rejeição pra garantir que o intent não seja executado
   * duas vezes (defesa contra replay).
   */
  consume(id: string): PendingConfirmation | null {
    const entry = this.get(id);
    if (!entry) return null;
    this.store.delete(id);
    this.persistSnapshot();
    return entry;
  }

  getExecution(id: string): ConfirmationExecution | undefined {
    return this.executions.get(id);
  }

  /** O recibo é gravado antes do efeito. Repetições consultam o mesmo resultado. */
  async executeOnce(confirmation: PendingConfirmation, executor: (payload: unknown) => Promise<unknown>): Promise<ConfirmationExecution> {
    const previous = this.executions.get(confirmation.id)
    if (previous) return previous
    const execution: ConfirmationExecution = { confirmation, status: 'running', startedAt: new Date().toISOString() }
    this.executions.set(confirmation.id, execution)
    this.store.delete(confirmation.id)
    try {
      this.persistSnapshot(true)
    } catch (error) {
      this.executions.delete(confirmation.id)
      this.store.set(confirmation.id, confirmation)
      throw new Error('Não foi possível registrar o início da ação. Nenhuma execução foi iniciada.', { cause: error })
    }
    try {
      const result = await executor(confirmation.payload)
      execution.result = result
      execution.error = toolFailure(result)
      execution.status = execution.error ? 'failed' : 'completed'
      execution.outcome = execution.error ? 'failed' : toolOutcome(confirmation.toolName, result)
      // O executor terminou, mas um enfileiramento/prévia continua sendo preparo.
      if (execution.outcome === 'unknown' && result !== null && result !== undefined) execution.outcome = 'executed'
    } catch (error) {
      execution.status = 'unknown'
      execution.outcome = 'unknown'
      execution.error = `${error instanceof Error ? error.message : 'Falha na execução'}. Confira o estado antes de repetir: o executor pode ter aplicado parte da ação.`
    }
    execution.finishedAt = new Date().toISOString()
    try { this.persistSnapshot(true) } catch {
      execution.status = 'unknown'
      execution.outcome = 'unknown'
      execution.error = 'O executor retornou, mas o recibo final não foi persistido. Confira o registro; não repita automaticamente.'
    }
    return execution
  }

  /**
   * Autoriza uma execução sem permitir que caminhos alternativos ignorem a
   * confirmação dupla. O challenge é de uso único e só nasce após a primeira
   * aprovação explícita.
   */
  authorize(id: string, input: { actorId: string; challenge?: string; deferConsumption?: boolean }): ConfirmationAuthorization {
    const entry = this.get(id);
    if (!entry) return { status: 'not_found' };
    if (entry.approvalsRequired === 1) {
      if (input.deferConsumption) return { status: 'ready', confirmation: entry };
      const consumed = this.consume(id);
      return consumed ? { status: 'ready', confirmation: consumed } : { status: 'not_found' };
    }
    if (entry.approvalStep === 0) {
      entry.approvalStep = 1;
      entry.firstApprovedAt = Date.now();
      entry.firstApprovedBy = input.actorId;
      entry.secondApprovalChallenge = randomBytes(16).toString('hex');
      setImmediate(() => this.persistSnapshot());
      return { status: 'awaiting_second_approval', confirmation: entry, challenge: entry.secondApprovalChallenge };
    }
    if (!input.challenge || input.challenge !== entry.secondApprovalChallenge) {
      return { status: 'invalid_challenge', confirmation: entry };
    }
    if (input.deferConsumption) return { status: 'ready', confirmation: entry };
    entry.secondApprovalChallenge = undefined;
    const consumed = this.consume(id);
    return consumed ? { status: 'ready', confirmation: consumed } : { status: 'not_found' };
  }

  authorizeBatch(batchId: string, input: { actorId: string; challenge?: string }):
    | { status: 'ready'; batch: ConfirmationBatch }
    | { status: 'awaiting_second_approval'; batch: ConfirmationBatch; challenge: string }
    | { status: 'invalid_challenge'; batch: ConfirmationBatch }
    | { status: 'not_found' } {
    const batch = this.getBatch(batchId);
    if (!batch) return { status: 'not_found' };
    const needsDouble = batch.pendings.some((pending) => pending.approvalsRequired === 2);
    if (!needsDouble) return { status: 'ready', batch };
    if ((batch.approvalStep ?? 0) === 0) {
      batch.approvalStep = 1;
      batch.firstApprovedAt = Date.now();
      batch.firstApprovedBy = input.actorId;
      batch.secondApprovalChallenge = randomBytes(16).toString('hex');
      batch.updatedAt = Date.now();
      setImmediate(() => this.persistSnapshot());
      return { status: 'awaiting_second_approval', batch, challenge: batch.secondApprovalChallenge };
    }
    if (!input.challenge || input.challenge !== batch.secondApprovalChallenge) {
      return { status: 'invalid_challenge', batch };
    }
    batch.secondApprovalChallenge = undefined;
    return { status: 'ready', batch };
  }

  /** Descarta todas as entradas expiradas e retorna o número removido. */
  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(id);
        removed++;
      }
    }
    return removed;
  }

  listActive(): PendingConfirmation[] {
    this.cleanupExpired();
    return Array.from(this.store.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Lista confirmações ativas de uma sessão específica (mais recentes primeiro). */
  listActiveBySessionId(sessionId: string): PendingConfirmation[] {
    this.cleanupExpired();
    return Array.from(this.store.values())
      .filter((p) => p.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Teste/manutenção — libera todos os intents (sem notificação). */
  clear(): void {
    this.store.clear();
    this.batches.clear();
    this.executions.clear();
  }

  dispose(): void {
    this.disposed = true;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  // ── Alix Insano F4 — batch methods ──────────────────────────

  createBatch(sessionId: string, title: string, items: BatchInputItem[]): ConfirmationBatch {
    const now = Date.now();
    const batchId = 'batch_' + randomBytes(8).toString('hex');
    const pendings: PendingConfirmationWithDeps[] = [];

    for (const it of items) {
      const base = this.create(it.toolName, it.description, it.payload, sessionId);
      const stored = this.store.get(base.id) as PendingConfirmationWithDeps;
      stored.batchId = batchId;
      pendings.push(stored);
    }
    for (let i = 0; i < items.length; i++) {
      const raw = items[i].dependsOn;
      if (raw === undefined) continue;
      const indices = Array.isArray(raw) ? raw : [raw];
      const depIds = indices
        .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < pendings.length && idx !== i)
        .map(idx => pendings[idx].id);
      pendings[i].dependsOn = depIds;
    }

    const batch: ConfirmationBatch = {
      batchId, sessionId, title,
      createdAt: now, updatedAt: now,
      status: 'pending',
      pendings,
    };
    this.batches.set(batchId, batch);
    this.emit({ type: 'batch:created', batch });
    return batch;
  }

  getBatch(batchId: string): ConfirmationBatch | null {
    return this.batches.get(batchId) ?? null;
  }

  listBatches(): ConfirmationBatch[] {
    return Array.from(this.batches.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async applyBatch(
    batchId: string,
    runner: (p: PendingConfirmationWithDeps) => Promise<unknown>,
    opts: { only?: string[] } = {},
  ): Promise<{
    applied: Array<{ confirmationId: string; toolName: string; result: unknown }>;
    failed: Array<{ confirmationId: string; toolName: string; error: string }>;
    skipped: Array<{ confirmationId: string; toolName: string; reason: string }>;
  }> {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error('Batch não encontrado');
    if (batch.status === 'all_applied' || batch.status === 'cancelled') {
      throw new Error(`Batch em estado terminal: ${batch.status}`);
    }
    if (batch.status === 'applying') throw new Error('O lote já está em execução. Consulte seu progresso.');
    batch.status = 'applying';
    batch.updatedAt = Date.now();

    const applied: Array<{ confirmationId: string; toolName: string; result: unknown }> = [...(batch.results?.applied || [])];
    const failed: Array<{ confirmationId: string; toolName: string; error: string }> = [];
    const skipped: Array<{ confirmationId: string; toolName: string; reason: string }> = [];
    const successIds = new Set<string>(applied.map((item) => item.confirmationId));
    const failedIds = new Set<string>();
    const restrict = opts.only ? new Set(opts.only) : null;
    const remaining = batch.pendings.filter((item) => !successIds.has(item.id));

    while (remaining.length > 0) {
      const idx = remaining.findIndex(p => {
        if (restrict && !restrict.has(p.id)) return false;
        if (!p.dependsOn || p.dependsOn.length === 0) return true;
        return p.dependsOn.every(dep => successIds.has(dep));
      });
      if (idx === -1) {
        for (const p of remaining) {
          const reason = p.dependsOn?.some(dep => failedIds.has(dep)) ? 'dependência falhou' : 'bloqueado';
          skipped.push({ confirmationId: p.id, toolName: p.toolName, reason });
          this.emit({ type: 'batch:progress', batchId, confirmationId: p.id, status: 'skipped', detail: reason });
        }
        break;
      }
      const [current] = remaining.splice(idx, 1);
      this.emit({ type: 'batch:progress', batchId, confirmationId: current.id, status: 'applying' });
      try {
        const execution = await this.executeOnce(current, async () => runner(current));
        if (execution.status !== 'completed') throw new Error(execution.error || 'Execução em andamento; confira seu recibo.');
        const result = execution.result;
        applied.push({ confirmationId: current.id, toolName: current.toolName, result });
        successIds.add(current.id);
        this.store.delete(current.id);
        this.emit({ type: 'batch:progress', batchId, confirmationId: current.id, status: 'applied', detail: result });
      } catch (err) {
        const errorMsg = (err as Error).message;
        failed.push({ confirmationId: current.id, toolName: current.toolName, error: errorMsg });
        failedIds.add(current.id);
        this.store.delete(current.id);
        this.emit({ type: 'batch:progress', batchId, confirmationId: current.id, status: 'failed', detail: errorMsg });
      }
    }

    batch.results = { applied, failed, skipped };
    if (failed.length === 0 && skipped.length === 0) batch.status = 'all_applied';
    else if (applied.length > 0) batch.status = 'partial_applied';
    else batch.status = 'failed';
    batch.updatedAt = Date.now();
    this.emit({ type: 'batch:done', batch });
    return { applied, failed, skipped };
  }

  cancelBatch(batchId: string): ConfirmationBatch | null {
    const batch = this.batches.get(batchId);
    if (!batch) return null;
    if (batch.status !== 'pending') return batch;
    for (const p of batch.pendings) this.store.delete(p.id);
    batch.status = 'cancelled';
    batch.updatedAt = Date.now();
    this.emit({ type: 'batch:done', batch });
    return batch;
  }
}

export function getAlixConfirmationStore(): AlixConfirmationStore {
  return AlixConfirmationStore.getInstance();
}

// ============================================================
// ALETIS — Alix Confirmation Store (HITL)
// In-memory store for executor-tool intents awaiting human
// approval. Wave 6 — Agente Executor.
//
// Design notes
// ────────────
// Every mutation-capable tool Alix exposes to Claude must NOT
// mutate state directly. Instead it registers a "pending
// confirmation" here (TTL 10 min) and returns a payload that the
// LLM surfaces to the user. A second HTTP round-trip
// (`POST /api/alix/confirmations/:id/approve`) runs the real
// executor. This guarantees the human sees exactly what will be
// written before it's written.
//
// Security boundary: this store is process-local, in-memory only.
// If the API restarts, pending confirmations are dropped — that's
// intentional (safer to re-confirm than to execute stale intents).
// ============================================================

import { randomBytes } from 'crypto';

export interface PendingConfirmation {
  id: string;
  toolName: string;
  description: string;
  payload: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
  sessionId?: string;
}

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

export class AlixConfirmationStore {
  private static instance: AlixConfirmationStore | null = null;
  private readonly store: Map<string, PendingConfirmation> = new Map();
  private readonly batches: Map<string, ConfirmationBatch> = new Map();
  private readonly listeners: Set<StoreListener> = new Set();
  private readonly ttlMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  on(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(ev: StoreEvent): void {
    for (const l of this.listeners) {
      try { l(ev); } catch (err) { console.warn('[AlixConfirmationStore] listener erro:', (err as Error).message); }
    }
  }

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    // Agenda limpeza periódica (best-effort — não trava o processo).
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanupExpired();
      } catch (err) {
        console.warn('[AlixConfirmationStore] cleanup failed:', (err as Error).message);
      }
    }, CLEANUP_INTERVAL_MS);
    // Permitir que o Node encerre mesmo com o timer ativo (dev + tests).
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
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
    const entry: PendingConfirmation = {
      id: this.genId(),
      toolName,
      description,
      payload,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      sessionId,
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
    return entry;
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

  /** Teste/manutenção — libera todos os intents (sem notificação). */
  clear(): void {
    this.store.clear();
    this.batches.clear();
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
    batch.status = 'applying';
    batch.updatedAt = Date.now();

    const applied: Array<{ confirmationId: string; toolName: string; result: unknown }> = [];
    const failed: Array<{ confirmationId: string; toolName: string; error: string }> = [];
    const skipped: Array<{ confirmationId: string; toolName: string; reason: string }> = [];
    const successIds = new Set<string>();
    const failedIds = new Set<string>();
    const restrict = opts.only ? new Set(opts.only) : null;
    const remaining = [...batch.pendings];

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
        const result = await runner(current);
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

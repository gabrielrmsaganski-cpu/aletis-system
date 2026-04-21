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

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutos
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60s

export class AlixConfirmationStore {
  private static instance: AlixConfirmationStore | null = null;
  private readonly store: Map<string, PendingConfirmation> = new Map();
  private readonly ttlMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

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
  }
}

export function getAlixConfirmationStore(): AlixConfirmationStore {
  return AlixConfirmationStore.getInstance();
}

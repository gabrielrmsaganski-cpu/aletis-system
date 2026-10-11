/**
 * useAlixSessions — Hook para CRUD de sessões ALIX
 */

import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../useApi';

export interface AlixSession {
  id: string;
  title: string;
  clienteId?: string;
  archivedAt?: number;
  pinnedAt?: number;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
}

export function useAlixSessions() {
  const [sessions, setSessions] = useState<AlixSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiFetch<AlixSession[]>('/alix/sessions');
      setSessions(list || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (title?: string): Promise<AlixSession | null> => {
    try {
      const created = await apiFetch<AlixSession>('/alix/session', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      setSessions((prev) => [{ ...created, messageCount: created.messageCount ?? 0 }, ...prev]);
      return created;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (!window.confirm('Apagar essa conversa? Não dá pra recuperar.')) return false;
    try {
      await apiFetch(`/alix/session/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { sessions, loading, error, load, create, remove };
}

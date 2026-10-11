/**
 * useAlixStreaming — Hook para streaming SSE do ALIX v2
 * Abstrai conexão, parsing de eventos, retry e cleanup.
 */

import { useCallback, useRef } from 'react';
import type { AlixMission, AlixWorkMode } from '../../components/alix/AlixTaskCenter';
import { readAlixRouting, type AlixRoutingDecision, type AlixToolProgress } from '../../components/alix/alixWorkspacePresentation';

export interface StreamHandlers {
  onRouting?: (routing: AlixRoutingDecision) => void;
  onProgress?: (progress: AlixToolProgress) => void;
  onToken?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onTool?: (name: string) => void;
  onMission?: (mission: AlixMission) => void;
  onDone?: (payload: {
    reply: { role: string; content: string; toolsUsed?: string[]; timestamp: number; metadata?: Record<string, unknown> };
    sessionId: string;
    toolsUsed?: string[];
    mission?: AlixMission;
  }) => void;
  onError?: (err: string) => void;
}

export interface StreamingMessage {
  sessionId?: string;
  message: string;
  attachments?: string[];
  clienteId?: string;
  analysisMode?: 'standard' | 'deep';
  workMode?: AlixWorkMode;
  missionId?: string;
  modelPreference?: string;
  pureStream?: boolean;
  showReasoning?: boolean;
}

const STREAM_URL = '/api/alix/chat/stream-v2';
const STREAM_IDLE_TIMEOUT_MS = 5 * 60_000;
const STREAM_STANDARD_LIMIT_MS = 10 * 60_000;
const STREAM_DEEP_LIMIT_MS = 20 * 60_000;

export function useAlixStreaming() {
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const stream = useCallback(
    async (msg: StreamingMessage, handlers: StreamHandlers, externalSignal?: AbortSignal) => {
      cancel(); // Cancela stream anterior

      const internalCtl = new AbortController();
      const finalSignal = internalCtl.signal;
      const forwardAbort = () => internalCtl.abort(externalSignal?.reason);
      if (externalSignal?.aborted) forwardAbort();
      else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
      abortRef.current = internalCtl;

      let gotAnyEvent = false;
      let gotTerminalEvent = false;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let missionProgress = '';
      let idleTimeout: ReturnType<typeof setTimeout> | undefined;
      const totalTimeout = setTimeout(
        () => internalCtl.abort(new Error('stream-total-timeout')),
        msg.analysisMode === 'deep' ? STREAM_DEEP_LIMIT_MS : STREAM_STANDARD_LIMIT_MS,
      );
      // Pings mantêm o transporte aberto, mas não comprovam avanço da análise.
      const recordActivity = () => {
        clearTimeout(idleTimeout);
        if (!gotTerminalEvent && !finalSignal.aborted) {
          idleTimeout = setTimeout(() => internalCtl.abort(new Error('stream-idle-timeout')), STREAM_IDLE_TIMEOUT_MS);
        }
      };
      recordActivity();

      try {
        if (finalSignal.aborted) return;
        const res = await fetch(STREAM_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg),
          signal: finalSignal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status} ao iniciar stream`);
        if (!res.body) throw new Error('Resposta sem body');

        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (finalSignal.aborted) throw finalSignal.reason;
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            let event = 'message';
            let data = '';
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (!data) continue;
            try {
              const payload = JSON.parse(data);
              gotAnyEvent = true;
              if (event === 'token' && typeof payload?.text === 'string') {
                if (payload.text.trim()) recordActivity();
                handlers.onToken?.(payload.text);
              }
              else if (event === 'routing') {
                const routing = readAlixRouting({ routing: payload });
                if (routing) { recordActivity(); handlers.onRouting?.(routing); }
              }
              else if (event === 'progress' && typeof payload?.id === 'string' && payload.id.trim() && typeof payload.tool === 'string' && payload.tool.trim() && ['started', 'completed', 'failed'].includes(payload.phase)) {
                recordActivity();
                handlers.onProgress?.({
                  id: payload.id,
                  tool: payload.tool,
                  phase: payload.phase,
                  agent: typeof payload.agent === 'string' ? payload.agent : undefined,
                  durationMs: typeof payload.durationMs === 'number' && Number.isFinite(payload.durationMs) ? payload.durationMs : undefined,
                  outcome: ['read', 'prepared', 'executed', 'failed', 'unknown'].includes(payload.outcome) ? payload.outcome : undefined,
                });
              }
              else if (event === 'reasoning' && typeof payload?.text === 'string') {
                if (payload.text.trim()) recordActivity();
                handlers.onReasoning?.(payload.text);
              }
              else if (event === 'tool' && typeof payload?.name === 'string' && payload.name.trim()) { recordActivity(); handlers.onTool?.(payload.name); }
              else if (event === 'mission' && typeof payload?.id === 'string' && payload.id.trim() && typeof payload.status === 'string') {
                const progress = JSON.stringify([payload.id, payload.status, payload.currentStep, payload.progress]);
                if (progress !== missionProgress) { missionProgress = progress; recordActivity(); }
                handlers.onMission?.(payload as AlixMission);
              }
              else if (event === 'done') { gotTerminalEvent = true; handlers.onDone?.(payload); }
              else if (event === 'error') { gotTerminalEvent = true; handlers.onError?.(payload?.error || 'erro'); }
            } catch {
              // ignore malformed frame
            }
            if (gotTerminalEvent) return;
          }
        }

        if (!gotTerminalEvent && !finalSignal.aborted) {
          handlers.onError?.(gotAnyEvent ? 'A conexão foi interrompida antes da conclusão. Consulte a execução antes de tentar novamente.' : 'Conexão fechou sem resposta');
        }
      } catch (err) {
        const reason = finalSignal.aborted ? finalSignal.reason : err;
        const errorMessage = reason instanceof Error ? reason.message : (err as Error)?.message || 'falha no stream';
        if (gotTerminalEvent) return;
        if (errorMessage === 'stream-idle-timeout') {
          handlers.onError?.('A análise ficou cinco minutos sem novo progresso. Consulte o trabalho salvo antes de retomá-la.');
        } else if (errorMessage === 'stream-total-timeout') {
          handlers.onError?.('A análise atingiu o limite desta execução. Consulte o trabalho salvo e retome a etapa pendente.');
        } else if (finalSignal.aborted) {
          // cancelamento manual — silencioso
        } else {
          handlers.onError?.(errorMessage);
        }
      } finally {
        clearTimeout(idleTimeout);
        clearTimeout(totalTimeout);
        externalSignal?.removeEventListener('abort', forwardAbort);
        try { await reader?.cancel(); } catch { /* transporte já encerrado */ }
        reader?.releaseLock();
        if (abortRef.current === internalCtl) abortRef.current = null;
      }
    },
    [cancel],
  );

  return { stream, cancel, isStreaming: () => abortRef.current !== null };
}

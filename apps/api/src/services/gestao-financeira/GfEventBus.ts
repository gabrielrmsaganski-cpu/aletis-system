// ============================================================
// GfEventBus — broadcast em tempo real de mudanças (SSE)
// ============================================================
import { EventEmitter } from 'node:events'

export interface GfEvent {
  type: 'changelog' | 'comentario' | 'snapshot' | 'cron' | 'insight' | 'nfe'
  grupoId: string
  payload: any
  ts: string
}

class GfEventBus extends EventEmitter {
  emit(event: 'gf-event', payload: GfEvent): boolean {
    return super.emit(event, payload)
  }
  on(event: 'gf-event', listener: (payload: GfEvent) => void): this {
    return super.on(event, listener)
  }
  off(event: 'gf-event', listener: (payload: GfEvent) => void): this {
    return super.off(event, listener)
  }
}

let _bus: GfEventBus | null = null
export function getGfEventBus(): GfEventBus {
  if (!_bus) {
    _bus = new GfEventBus()
    _bus.setMaxListeners(50)
  }
  return _bus
}

export function publish(type: GfEvent['type'], grupoId: string, payload: any): void {
  const bus = getGfEventBus()
  bus.emit('gf-event', {
    type,
    grupoId,
    payload,
    ts: new Date().toISOString(),
  })
}

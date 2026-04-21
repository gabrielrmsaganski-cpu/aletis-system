import { EventEmitter } from 'events'
import type { AnaliseCliente } from './types.js'

/**
 * Bus interno para invalidação e notificação das análises por cliente.
 *
 * Qualquer módulo que mutar dados que alimentam o snapshot (hoje: Financeiro
 * via `clienteVinculo`; amanhã: commodities, clima, dívidas externas) pode
 * chamar `emit('invalidar', { cpfCnpj, motivo })` sem precisar conhecer o
 * roteador de clientes. O subscriber no `routes/clientes.ts` localiza o
 * cliente correspondente e reagenda o orquestrador.
 *
 * Eventos emitidos após execução do orquestrador (`atualizada`) permitem que
 * futuros consumidores (SSE, WebSocket, webhook) reajam em tempo real.
 */
export interface AnalisesEvents {
  invalidar: { cpfCnpj?: string; clienteId?: string; motivo: string }
  atualizada: { clienteId: string; analise: AnaliseCliente }
}

class AnalisesBus extends EventEmitter {
  emitInvalidar(payload: AnalisesEvents['invalidar']): void {
    this.emit('invalidar', payload)
  }

  emitAtualizada(payload: AnalisesEvents['atualizada']): void {
    this.emit('atualizada', payload)
  }

  onInvalidar(cb: (payload: AnalisesEvents['invalidar']) => void): void {
    this.on('invalidar', cb)
  }

  onAtualizada(cb: (payload: AnalisesEvents['atualizada']) => void): void {
    this.on('atualizada', cb)
  }
}

let _bus: AnalisesBus | null = null

export function getAnalisesBus(): AnalisesBus {
  if (!_bus) {
    _bus = new AnalisesBus()
    // Garante que não estouramos o limite default de 10 listeners em
    // processos com muitos subscribers futuros.
    _bus.setMaxListeners(50)
  }
  return _bus
}

type PendingRead<T> = { controller: AbortController; promise: Promise<T>; readers: number; settled: boolean }

/** Compartilha apenas leituras em andamento; resultados concluídos não ficam em cache. */
export class SharedReadPool<T> {
  private pending = new Map<string, PendingRead<T>>()

  invalidate(): void {
    // Leituras anteriores continuam para seus consumidores, mas novas leituras
    // após uma gravação precisam consultar o servidor novamente.
    this.pending.clear()
  }

  read(key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal | null): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Solicitação cancelada.', 'AbortError'))
    let entry = this.pending.get(key)
    if (!entry) {
      const controller = new AbortController()
      entry = { controller, promise: load(controller.signal), readers: 0, settled: false }
      this.pending.set(key, entry)
      const current = entry
      const complete = () => {
        current.settled = true
        if (this.pending.get(key) === current) this.pending.delete(key)
      }
      current.promise.then(complete, complete)
    }
    const current = entry
    current.readers += 1
    return new Promise<T>((resolve, reject) => {
      let finished = false
      const cleanup = () => {
        finished = true
        signal?.removeEventListener('abort', cancel)
        current.readers -= 1
        if (!current.readers && !current.settled) {
          if (this.pending.get(key) === current) this.pending.delete(key)
          current.controller.abort()
        }
      }
      const cancel = () => {
        if (finished) return
        cleanup()
        reject(new DOMException('Solicitação cancelada.', 'AbortError'))
      }
      signal?.addEventListener('abort', cancel, { once: true })
      current.promise.then(value => {
        if (finished) return
        cleanup()
        // Cada consumidor pode ordenar ou adaptar os dados sem modificar a
        // leitura recebida pelos demais componentes.
        try { resolve(structuredClone(value)) } catch (error) { reject(error) }
      }, error => {
        if (finished) return
        cleanup()
        reject(error)
      })
    })
  }
}

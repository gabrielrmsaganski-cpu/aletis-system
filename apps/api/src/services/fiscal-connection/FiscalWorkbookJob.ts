import { Worker } from 'node:worker_threads'
import type { FiscalWorkbookInput } from './FiscalWorkbookData.js'

/** Geração isolada para não bloquear requisições do CRM durante o processamento do Excel. */
export function runFiscalWorkbook(input: FiscalWorkbookInput): Promise<Buffer> {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const moduleUrl = new URL(`./FiscalWorkbookService.${extension}`, import.meta.url).href
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        const module = workerData.moduleUrl.endsWith('.ts')
          ? await require('tsx/esm/api').tsImport(workerData.moduleUrl, workerData.moduleUrl)
          : await import(workerData.moduleUrl);
        const result = await module.buildFiscalWorkbook(workerData.input);
        const bytes = Uint8Array.from(result);
        parentPort.postMessage({ bytes }, [bytes.buffer]);
      })().catch(error => parentPort.postMessage({ error: error.name === 'FiscalWorkbookLimitError' || error.constructor.name === 'FiscalWorkbookLimitError' ? error.message : 'Não foi possível gerar o Excel. Tente um período menor ou tente novamente.', limit: error.constructor.name === 'FiscalWorkbookLimitError' }));
    `, { eval: true, workerData: { moduleUrl, input }, resourceLimits: { maxOldGenerationSizeMb: 1024 } })
    let settled = false
    const finish = (error?: Error, bytes?: Uint8Array) => { if (settled) return; settled = true; clearTimeout(timer); void worker.terminate(); if (error) reject(error); else resolve(Buffer.from(bytes!)) }
    const timer = setTimeout(() => finish(new Error('A preparação do Excel excedeu o tempo disponível. Restrinja o período e tente novamente.')), 120000)
    worker.once('message', (message: { bytes?: Uint8Array; error?: string; limit?: boolean }) => { if (message.error) { const error = new Error(message.error); error.name = message.limit ? 'FiscalWorkbookLimitError' : 'Error'; finish(error) } else finish(undefined, message.bytes) })
    worker.once('error', () => finish(new Error('Não foi possível preparar este volume de dados em Excel. Restrinja o período e tente novamente.')))
    worker.once('exit', code => { if (!settled) finish(new Error(`A preparação do Excel foi interrompida (${code}). Tente novamente com um período menor.`)) })
  })
}

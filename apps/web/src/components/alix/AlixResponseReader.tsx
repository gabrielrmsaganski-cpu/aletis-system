import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, Copy, Download, Minus, Plus, X } from 'lucide-react'
import { renderAlixContent } from './AlixMessageContent'

export default function AlixResponseReader({ content, onClose }: { content: string; onClose: () => void }) {
  const [fontSize, setFontSize] = useState(17)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  async function copy() {
    try { await navigator.clipboard.writeText(content); setCopied(true); setError('') }
    catch { setError('Não foi possível copiar. Selecione o texto para copiar manualmente.') }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'alix-resposta.md'; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
      <Dialog.Content className="fixed inset-0 z-[101] flex min-h-0 flex-col overflow-hidden bg-card text-foreground shadow-2xl outline-none dark:bg-[#17251b] dark:text-stone-100 sm:inset-3 sm:rounded-2xl">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-aletis-borda px-4 py-3 sm:px-6">
          <div><Dialog.Title className="font-display text-lg font-semibold">Resposta da ALIX</Dialog.Title><Dialog.Description className="text-xs text-[var(--text-soft)] dark:text-stone-300">Leitura ampliada · sua conversa continua aberta</Dialog.Description></div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Diminuir texto" disabled={fontSize <= 15} onClick={() => setFontSize(size => size - 1)} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-aletis-bege disabled:opacity-30"><Minus size={16} /></button>
            <span aria-live="polite" className="w-10 text-center text-xs">{fontSize} px</span>
            <button type="button" aria-label="Aumentar texto" disabled={fontSize >= 22} onClick={() => setFontSize(size => size + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-aletis-bege disabled:opacity-30"><Plus size={16} /></button>
            <button type="button" onClick={() => void copy()} aria-label="Copiar resposta ampliada" title="Copiar resposta" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-aletis-bege">{copied ? <Check size={17} /> : <Copy size={17} />}</button>
            <button type="button" onClick={download} aria-label="Baixar texto da resposta" title="Baixar texto em Markdown" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-aletis-bege"><Download size={17} /></button>
            <Dialog.Close aria-label="Fechar leitura ampliada" className="flex h-10 w-10 items-center justify-center rounded-lg bg-aletis-bege text-foreground"><X size={19} /></Dialog.Close>
          </div>
        </header>
        {error && <p role="alert" className="px-4 py-2 text-sm text-amber-800">{error}</p>}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-10 sm:py-10" data-alix-reader>
          <article className="mx-auto max-w-[1080px] break-words leading-relaxed [overflow-wrap:anywhere] [&_p]:leading-[1.8] [&_li]:leading-[1.8]" style={{ fontSize }}>
            {renderAlixContent(content)}
          </article>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

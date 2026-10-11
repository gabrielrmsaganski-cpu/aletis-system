import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface BoardSection { id: string; label: string; count: number }

/** Controle superior acessível sincronizado à rolagem nativa; não filtra nem move registros. */
export default function BoardScroller({ label, sections, children, itemLabels = { one: 'cliente', many: 'clientes' } }: { label: string; sections: BoardSection[]; children: ReactNode; itemLabels?: { one: string; many: string } }) {
  const id = useId()
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, max: 0, left: 0 })

  useLayoutEffect(() => {
    const body = viewport.current!, row = content.current!
    const measure = () => {
      const max = Math.max(0, body.scrollWidth - body.clientWidth)
      const left = Math.min(body.scrollLeft, max)
      body.scrollLeft = left
      setSize(previous => previous.width === body.scrollWidth && previous.max === max && previous.left === left
        ? previous : { width: body.scrollWidth, max, left })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(body)
    observer?.observe(row)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [sections.length])

  function sync(left: number) {
    if (viewport.current && Math.abs(viewport.current.scrollLeft - left) > .5) viewport.current.scrollLeft = left
    setSize(previous => previous.left === left ? previous : { ...previous, left })
  }

  function move(left: number) {
    viewport.current?.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  function locate(section: string) {
    const body = viewport.current
    const column = [...(content.current?.querySelectorAll<HTMLElement>('[data-board-section]') ?? [])].find(node => node.dataset.boardSection === section)
    if (body && column) move(body.scrollLeft + column.getBoundingClientRect().left - body.getBoundingClientRect().left)
  }

  return <div className="board-scroller">
    <div className="board-toolbar">
      <div><p className="font-semibold text-foreground">{label}</p><p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">Localize uma etapa ou use a barra para percorrer o funil.</p></div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label="Rolar funil para a esquerda" aria-controls={id} disabled={size.left <= 1} onClick={() => move(size.left - (viewport.current?.clientWidth ?? 300) * .8)} className="ui-icon-button"><ChevronLeft size={19} /></button>
        <button type="button" aria-label="Rolar funil para a direita" aria-controls={id} disabled={size.left >= size.max - 1} onClick={() => move(size.left + (viewport.current?.clientWidth ?? 300) * .8)} className="ui-icon-button"><ChevronRight size={19} /></button>
      </div>
    </div>
    <nav className="board-stage-links" aria-label="Localizar etapa no funil">
      {sections.map(section => <button key={section.id} type="button" aria-controls={id} aria-label={`Localizar etapa ${section.label}: ${section.count} ${section.count === 1 ? itemLabels.one : itemLabels.many}`} onClick={() => locate(section.id)}>{section.label}<span>{section.count}</span></button>)}
    </nav>
    <div className="board-top-scroll" hidden={size.max <= 1}>
      <input type="range" min={0} max={Math.max(1, size.max)} step={1} value={size.left} aria-label="Rolagem superior do funil" aria-controls={id} aria-describedby={`${id}-hint`} aria-valuetext={`${Math.round(size.left / Math.max(1, size.max) * 100)}% do funil`} onChange={event => sync(Number(event.target.value))}
        onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); sync(Math.max(0, Math.min(size.max, size.left + (event.key === 'ArrowRight' ? 80 : -80)))) } }}
        style={{ '--board-thumb-width': `${Math.max(40, Math.round((size.width - size.max) ** 2 / Math.max(1, size.width)))}px` } as CSSProperties} />
    </div>
    <div ref={viewport} id={id} role="region" aria-label={label} tabIndex={0} className="board-viewport" onScroll={event => sync(event.currentTarget.scrollLeft)}>
      <div ref={content} className="board-columns">{children}</div>
    </div>
  </div>
}

import { useId, useState, type ElementType, type ReactNode } from 'react'

export interface SectionItem<T extends string = string> { id: T; label: string; icon?: ElementType; detail?: string }

/** Navegação por tarefa, sem alterar o estado ou os contratos do módulo consumidor. */
export function SectionNav<T extends string>({ items, active, onChange, label, vertical = false }: {
  items: SectionItem<T>[]; active: T; onChange: (id: T) => void; label: string; vertical?: boolean
}) {
  return <nav aria-label={label} className={`section-nav${vertical ? ' section-nav--vertical' : ''}`}>
    {items.map(({ id, label: title, icon: Icon, detail }) => <button type="button" key={id} aria-current={active === id ? 'page' : undefined} onClick={() => onChange(id)}>
      {Icon && <Icon size={16} strokeWidth={1.7} aria-hidden="true" />}
      <span><span>{title}</span>{detail && <small>{detail}</small>}</span>
    </button>)}
  </nav>
}

/** Carrega a ferramenta ao primeiro uso e preserva os dados digitados ao alternar. */
export function WorkspaceDeck({ items, label }: { items: (SectionItem & { content: ReactNode })[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id ?? '')
  const [visited, setVisited] = useState(() => new Set([items[0]?.id]))
  const regionId = useId()
  return <div className="task-workspace">
    <SectionNav items={items} active={active} label={label} vertical onChange={id => { setVisited(current => new Set([...current, id])); setActive(id) }} />
    <div className="min-w-0">{items.map(item => visited.has(item.id) && <section key={item.id} hidden={active !== item.id} aria-label={item.label} id={`${regionId}-${item.id}`}>
      {item.detail && <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>}
      {item.content}
    </section>)}</div>
  </div>
}

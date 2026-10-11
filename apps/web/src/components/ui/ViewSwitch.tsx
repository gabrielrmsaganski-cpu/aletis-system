import type { ElementType } from 'react'

/** Alternância de apresentação; não filtra dados nem modifica a seleção. */
export default function ViewSwitch<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string; icon?: ElementType }[]; onChange: (value: T) => void
}) {
  return <div role="group" aria-label={label} className="ui-view-switch">
    {options.map(({ value: id, label: title, icon: Icon }) => <button type="button" key={id} aria-pressed={value === id} onClick={() => onChange(id)}>
      {Icon && <Icon size={16} aria-hidden="true" />}<span>{title}</span>
    </button>)}
  </div>
}

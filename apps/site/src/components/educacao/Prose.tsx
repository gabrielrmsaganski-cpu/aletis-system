/**
 * Primitivos editoriais para a seção /educacao — substitui o plugin
 * @tailwindcss/typography (que não está nas deps) com classes utilitárias
 * Tailwind diretas, alinhadas com a paleta ALETIS.
 */

import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'
import { AlertTriangle, Info, CheckCircle2, AlertOctagon, Lightbulb } from 'lucide-react'

export function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mb-8 text-[17px] leading-relaxed text-aletis-verde/85 md:text-[19px] md:leading-[1.7]">
      {children}
    </p>
  )
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-14 mb-5 scroll-mt-28 font-display text-[26px] font-semibold tracking-tight text-aletis-verde md:text-[32px]"
    >
      {children}
    </h2>
  )
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="mt-10 mb-3 scroll-mt-28 font-display text-[20px] font-semibold text-aletis-verde md:text-[22px]"
    >
      {children}
    </h3>
  )
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="mb-5 text-[15.5px] leading-relaxed text-aletis-verde/85 md:text-[16px] md:leading-[1.75]">
      {children}
    </p>
  )
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mb-6 list-disc space-y-2 pl-6 text-[15.5px] leading-relaxed text-aletis-verde/85 marker:text-aletis-gold">
      {children}
    </ul>
  )
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol className="mb-6 list-decimal space-y-2 pl-6 text-[15.5px] leading-relaxed text-aletis-verde/85 marker:font-display marker:text-aletis-gold">
      {children}
    </ol>
  )
}

export function LI({ children }: { children: ReactNode }) {
  return <li className="leading-relaxed">{children}</li>
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-aletis-verde">{children}</strong>
}

export function Em({ children }: { children: ReactNode }) {
  return <em className="italic text-aletis-verde/90">{children}</em>
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-aletis-cream-papel px-1.5 py-0.5 font-mono text-[0.88em] text-aletis-verde">
      {children}
    </code>
  )
}

type CalloutTone = 'info' | 'warn' | 'danger' | 'tip' | 'ok'

const calloutMap: Record<
  CalloutTone,
  { icon: typeof Info; bg: string; border: string; iconColor: string; label: string }
> = {
  info: {
    icon: Info,
    bg: 'bg-aletis-sage/10',
    border: 'border-aletis-sage/40',
    iconColor: 'text-aletis-verde-medio',
    label: 'Importante',
  },
  warn: {
    icon: AlertTriangle,
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    iconColor: 'text-amber-700',
    label: 'Atenção',
  },
  danger: {
    icon: AlertOctagon,
    bg: 'bg-red-50',
    border: 'border-red-300',
    iconColor: 'text-red-700',
    label: 'Risco',
  },
  tip: {
    icon: Lightbulb,
    bg: 'bg-aletis-gold/10',
    border: 'border-aletis-gold/50',
    iconColor: 'text-aletis-gold-escuro',
    label: 'Dica ALETIS',
  },
  ok: {
    icon: CheckCircle2,
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    iconColor: 'text-emerald-700',
    label: 'OK',
  },
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: CalloutTone
  title?: string
  children: ReactNode
}) {
  const cfg = calloutMap[tone]
  const Icon = cfg.icon
  return (
    <aside className={cn('my-8 rounded-lg border-l-4 p-5', cfg.bg, cfg.border)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', cfg.iconColor)} />
        <div className="flex-1 text-[15px] leading-relaxed text-aletis-verde">
          <p className={cn('mb-1 font-display text-[12px] font-semibold uppercase tracking-wider2', cfg.iconColor)}>
            {title || cfg.label}
          </p>
          <div>{children}</div>
        </div>
      </div>
    </aside>
  )
}

export function Table({
  caption,
  headers,
  rows,
}: {
  caption?: string
  headers: string[]
  rows: (string | ReactNode)[][]
}) {
  return (
    <div className="my-8 overflow-x-auto rounded-lg border border-aletis-verde/15">
      <table className="w-full text-left text-[14px]">
        {caption && (
          <caption className="border-b border-aletis-verde/15 bg-aletis-cream-papel px-4 py-3 text-left font-display text-[12px] font-semibold uppercase tracking-wider2 text-aletis-verde/70">
            {caption}
          </caption>
        )}
        <thead className="bg-aletis-verde text-aletis-cream">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wider2"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-aletis-verde/10 bg-white">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-aletis-cream-marfim">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-top text-aletis-verde/85">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function FAQ({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="my-8 space-y-2">
      {items.map((item, i) => (
        <details
          key={i}
          className="group rounded-lg border border-aletis-verde/15 bg-white p-5 open:border-aletis-gold open:bg-aletis-cream-papel"
        >
          <summary className="cursor-pointer list-none font-display text-[15px] font-semibold text-aletis-verde marker:hidden flex items-start justify-between gap-3">
            <span>{item.q}</span>
            <span className="mt-0.5 flex-shrink-0 text-aletis-gold transition group-open:rotate-45">+</span>
          </summary>
          <div className="mt-4 text-[15px] leading-relaxed text-aletis-verde/85">{item.a}</div>
        </details>
      ))}
    </div>
  )
}

export function KV({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="my-6 grid gap-x-6 gap-y-3 rounded-lg border border-aletis-verde/15 bg-aletis-cream-marfim p-5 sm:grid-cols-[max-content_1fr]">
      {items.map((item, i) => (
        <div key={i} className="contents">
          <dt className="font-display text-[12px] font-semibold uppercase tracking-wider2 text-aletis-verde/60">
            {item.k}
          </dt>
          <dd className="text-[15px] text-aletis-verde">{item.v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="relative my-6 rounded-lg border border-aletis-verde/15 bg-white p-6 pl-16">
      <div className="absolute left-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-aletis-verde font-display text-[14px] font-bold text-aletis-cream">
        {n}
      </div>
      <p className="mb-2 font-display text-[16px] font-semibold text-aletis-verde">{title}</p>
      <div className="text-[15px] leading-relaxed text-aletis-verde/85">{children}</div>
    </div>
  )
}

export function Quote({ children, source }: { children: ReactNode; source?: string }) {
  return (
    <blockquote className="my-8 border-l-4 border-aletis-gold bg-aletis-cream-papel p-6 italic text-aletis-verde">
      <p className="text-[16px] leading-relaxed">{children}</p>
      {source && (
        <cite className="mt-3 block not-italic font-display text-[11px] font-semibold uppercase tracking-wider2 text-aletis-verde/60">
          — {source}
        </cite>
      )}
    </blockquote>
  )
}

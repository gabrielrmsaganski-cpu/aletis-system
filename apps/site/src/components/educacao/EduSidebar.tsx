'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { eduTree, type EduNode } from './eduTree'

export function EduSidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden lg:block lg:w-72 lg:flex-shrink-0">
      <div className="sticky top-[100px] max-h-[calc(100vh-120px)] overflow-y-auto pr-4">
        <nav aria-label="Educação ALETIS" className="text-sm">
          <Link
            href="/educacao"
            className={cn(
              'mb-4 inline-block font-display text-[11px] font-semibold uppercase tracking-wider2 text-aletis-verde/70 hover:text-aletis-gold',
              pathname === '/educacao' && 'text-aletis-gold',
            )}
          >
            ← Mapa completo
          </Link>
          <ul className="space-y-1">
            {eduTree.map((section) => (
              <SidebarSection key={section.href} node={section} pathname={pathname} />
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  )
}

function SidebarSection({ node, pathname }: { node: EduNode; pathname: string }) {
  const isActiveRoot = pathname === node.href || pathname.startsWith(node.href + '/')
  const [open, setOpen] = useState(isActiveRoot)
  const hasChildren = !!node.children?.length
  return (
    <li>
      <div className="flex items-center justify-between">
        <Link
          href={node.href}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 font-display text-[13px] font-semibold transition-colors',
            isActiveRoot
              ? 'bg-aletis-verde/10 text-aletis-verde'
              : 'text-aletis-verde/80 hover:bg-aletis-verde/5 hover:text-aletis-verde',
          )}
        >
          {node.label}
        </Link>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Recolher' : 'Expandir'}
            className="ml-1 rounded p-1 text-aletis-verde/40 hover:bg-aletis-verde/5 hover:text-aletis-verde"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>
      {hasChildren && open && (
        <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-aletis-verde/10 pl-3">
          {node.children!.map((child) => {
            const active = pathname === child.href
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  className={cn(
                    'block rounded-md px-2.5 py-1 text-[12.5px] transition-colors',
                    active
                      ? 'bg-aletis-gold/15 text-aletis-verde'
                      : 'text-aletis-verde/70 hover:bg-aletis-verde/5 hover:text-aletis-verde',
                  )}
                >
                  {child.label}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

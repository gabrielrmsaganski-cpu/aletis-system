import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, CalendarPlus, ChevronLeft, ChevronRight, PhoneCall, Users, X } from 'lucide-react'

export interface CrmDirectoryRow {
  id: string
  name: string
  initials: string
  location: string
  office: string
  consultant: string
  stage: ReactNode
  priority: ReactNode
  priorityReasons: string[]
  health: ReactNode
  financialValue: string
  financialLabel: string
  financialContext: string
  financialDescription?: string
  nextAction?: string
  dueLabel: string
  overdue: boolean
  inactivity?: string
  suggestedAction?: string
  insights: string[]
  canAdvance: boolean
}

interface Props {
  rows: CrmDirectoryRow[]
  onSchedule: (id: string) => void
  onContact: (id: string) => void
  onSuggestedAction: (id: string) => void
  onAdvance: (id: string) => void
  onClearFilters: () => void
  hasFilters: boolean
}

/** Uma linha por cliente; contexto completo e ações rápidas em uma ficha lateral. */
export default function CrmClientList({ rows, onSchedule, onContact, onSuggestedAction, onAdvance, onClearFilters, hasFilters }: Props) {
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const pendingAction = useRef<(() => void) | null>(null)
  const selected = rows.find(row => row.id === selectedId)
  const selectedInsights = [...new Set(selected?.insights ?? [])]
  const pageSize = 25
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const visiblePage = Math.min(page, pageCount - 1)
  useEffect(() => { setPage(0) }, [rows])

  function runAfterClose(action: () => void) {
    pendingAction.current = action
    setSelectedId(null)
  }

  if (!rows.length) return <div className="crm-empty">
    <Users size={28} strokeWidth={1.4} aria-hidden="true" />
    <h3>{hasFilters ? 'Nenhum cliente com estes filtros' : 'Sua carteira começa aqui'}</h3>
    <p>{hasFilters ? 'Tente outro nome ou limpe os filtros para ver a carteira completa.' : 'Use “Novo cliente” para começar um atendimento.'}</p>
    {hasFilters && <button type="button" onClick={onClearFilters} className="ui-button ui-button--secondary">Limpar filtros</button>}
  </div>

  return <>
    <div className="crm-directory-head" aria-hidden="true"><span>Cliente / etapa</span><span>Próximo passo</span><span>Posição financeira</span><span>Ações</span></div>
    <ul className="crm-directory" aria-label="Clientes da carteira">
      {rows.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map(row => <li key={row.id} className="crm-directory-row">
        <div className="crm-directory-identity">
          <span className="crm-client-avatar" aria-hidden="true">{row.initials}</span>
          <div className="min-w-0"><Link to={`/clientes/${row.id}`} className="crm-client-name">{row.name}</Link><p className="crm-client-caption">{row.location} · {row.office}</p><div className="mt-2">{row.stage}</div></div>
        </div>
        <div className="crm-directory-next">
          <span className={`crm-due-label ${row.overdue ? 'crm-due-label--late' : ''}`}>{row.dueLabel}</span>
          <p className="crm-next-description">{row.nextAction || 'Combine o próximo contato com o cliente.'}</p>
          {!row.nextAction && <button type="button" onClick={() => onSchedule(row.id)} className="crm-text-action">Definir próxima ação</button>}
        </div>
        <div className="crm-directory-finance"><span className="crm-mobile-label">Posição financeira</span><strong>{row.financialValue}</strong><p className="crm-client-caption">{row.financialLabel}</p></div>
        <div className="crm-directory-actions">
          <Link to={`/clientes/${row.id}`} className="ui-button ui-button--secondary" aria-label={`Abrir cliente ${row.name}`}>Abrir <ArrowRight size={14} /></Link>
          <button type="button" className="ui-button ui-button--ghost" aria-label={`Ações e detalhes de ${row.name}`} onClick={event => { opener.current = event.currentTarget; setSelectedId(row.id) }}>Detalhes</button>
        </div>
      </li>)}
    </ul>
    <div className="crm-directory-footer"><span>{visiblePage * pageSize + 1}–{Math.min((visiblePage + 1) * pageSize, rows.length)} de {rows.length} clientes</span>{pageCount > 1 && <nav aria-label="Páginas da carteira" className="flex items-center gap-2"><button type="button" className="ui-icon-button" disabled={!visiblePage} onClick={() => setPage(visiblePage - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button><span>{visiblePage + 1} / {pageCount}</span><button type="button" className="ui-icon-button" disabled={visiblePage === pageCount - 1} onClick={() => setPage(visiblePage + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button></nav>}</div>
    <Dialog.Root open={Boolean(selected)} onOpenChange={open => { if (!open) setSelectedId(null) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="crm-drawer-overlay" />
        <Dialog.Content className="crm-drawer" onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); const action = pendingAction.current; pendingAction.current = null; if (action) queueMicrotask(action) }}>
          {selected && <>
            <header className="crm-drawer-header"><div><p className="ui-page-eyebrow">Ficha rápida</p><Dialog.Title className="text-xl font-semibold leading-snug">{selected.name}</Dialog.Title><Dialog.Description className="mt-2 text-sm text-muted-foreground">Consulte o contexto ou registre o próximo passo sem sair da carteira.</Dialog.Description></div><Dialog.Close className="ui-icon-button" aria-label="Fechar ficha rápida"><X size={20} /></Dialog.Close></header>
            <div className="crm-drawer-body">
              <div className="flex flex-wrap gap-2">{selected.stage}{selected.priority}</div>
              <section className="crm-detail-section"><h3>Próximo passo</h3><p className={selected.overdue ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}>{selected.dueLabel}</p><p>{selected.nextAction || 'Nenhuma ação definida.'}</p>{selected.inactivity && <p className="text-xs text-muted-foreground">{selected.inactivity}</p>}<div className="flex flex-wrap gap-2 pt-2"><button type="button" className="ui-button ui-button--primary" onClick={() => runAfterClose(() => onSchedule(selected.id))}><CalendarPlus size={16} /> Agendar ação</button><button type="button" className="ui-button ui-button--secondary" onClick={() => runAfterClose(() => onContact(selected.id))}><PhoneCall size={16} /> Registrar contato</button></div></section>
              <section className="crm-detail-section"><h3>Contexto do cliente</h3><dl className="crm-detail-grid"><div><dt>Localização</dt><dd>{selected.location}</dd></div><div><dt>Escritório</dt><dd>{selected.office}</dd></div><div><dt>Consultor</dt><dd>{selected.consultant || 'Não atribuído'}</dd></div><div><dt>Saúde financeira</dt><dd>{selected.health}</dd></div></dl></section>
              <section className="crm-detail-section"><h3>{selected.financialLabel}</h3><strong className="text-xl tabular-nums">{selected.financialValue}</strong><p>{selected.financialContext}</p>{selected.financialDescription && <p className="text-muted-foreground">{selected.financialDescription}</p>}</section>
              {(selected.priorityReasons.length > 0 || selectedInsights.length > 0 || selected.suggestedAction) && <section className="crm-detail-section"><h3>Prioridade e recomendações</h3><ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">{selected.priorityReasons.map((reason, i) => <li key={`reason-${i}`}>{reason}</li>)}{selectedInsights.map((insight, i) => <li key={`insight-${i}`}>{insight}</li>)}</ul>{selected.suggestedAction && <button type="button" className="crm-text-action text-left" onClick={() => runAfterClose(() => onSuggestedAction(selected.id))}>{selected.suggestedAction}<ArrowRight size={14} /></button>}</section>}
              {selected.canAdvance && <button type="button" className="ui-button ui-button--secondary" onClick={() => runAfterClose(() => onAdvance(selected.id))}>Avançar etapa <ArrowRight size={15} /></button>}
            </div>
            <footer className="crm-drawer-footer"><Link to={`/clientes/${selected.id}`} className="ui-button ui-button--primary w-full">Abrir atendimento completo <ArrowRight size={16} /></Link></footer>
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>
}

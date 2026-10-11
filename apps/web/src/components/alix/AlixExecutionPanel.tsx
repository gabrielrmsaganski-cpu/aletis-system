import React from 'react'
import { ArrowUpRight, Check, Circle, Clock3, Loader2, Workflow } from 'lucide-react'
import { describeAlixTool, type AlixExecution } from './alixWorkspacePresentation'

const outcomeLabel = { read: 'Consulta concluída', prepared: 'Preparado', executed: 'Ação concluída', failed: 'Não concluído', unknown: 'Ferramenta concluída' }

export default function AlixExecutionPanel({ execution, compact = false, onExpand }: { execution: AlixExecution | null; compact?: boolean; onExpand?: () => void }) {
  if (!execution) return null
  const running = execution.status === 'running'
  const activeTool = [...execution.tools].reverse().find(tool => tool.phase === 'started')
  const completed = execution.tools.filter(tool => tool.phase === 'completed').length
  const failed = execution.tools.filter(tool => tool.phase === 'failed').length
  const lastCompleted = [...execution.tools].reverse().find(tool => tool.phase === 'completed')
  const completedLabel = `${completed} consulta${completed === 1 ? '' : 's'} concluída${completed === 1 ? '' : 's'}`
  const status = running ? 'Trabalho em andamento' : execution.status === 'completed' ? 'Resposta concluída' : execution.status === 'failed' ? 'Trabalho não concluído' : 'Conversa interrompida'
  const seconds = execution.finishedAt ? Math.max(0, Math.round((execution.finishedAt - execution.startedAt) / 1000)) : null
  return (
    <section aria-label="Execução da ALIX" className={`rounded-xl border border-aletis-borda bg-card dark:border-white/10 dark:bg-white/5 ${compact ? 'px-3 py-2.5' : 'p-4'}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 shrink-0 ${running ? 'text-foreground' : execution.status === 'completed' ? 'text-emerald-700' : 'text-amber-700'}`}>{running ? <Loader2 size={16} className="animate-spin" /> : execution.status === 'completed' ? <Check size={16} /> : <Clock3 size={16} />}</span>
        <div className="min-w-0 flex-1">
          <p role={running ? 'status' : undefined} className="text-xs font-semibold text-foreground dark:text-white">{status}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--text-soft)] dark:text-stone-300">{activeTool ? describeAlixTool(activeTool.tool) : running ? 'Organizando a resposta e as fontes disponíveis.' : `${completed} ferramenta${completed === 1 ? '' : 's'} concluída${completed === 1 ? '' : 's'}${seconds !== null ? ` · ${seconds}s` : ''}`}</p>
          {running && execution.tools.length > 0 && <p className="mt-1 text-xs text-[var(--text-soft)] dark:text-stone-300">{completedLabel}{failed > 0 ? ` · ${failed} consulta${failed === 1 ? '' : 's'} sem conclusão` : ''}{lastCompleted && !activeTool ? ` · Última: ${describeAlixTool(lastCompleted.tool)}` : ''}</p>}
        </div>
        {compact && onExpand && <button type="button" onClick={onExpand} aria-label="Ver execução e entregas" className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-foreground hover:bg-aletis-bege">Detalhes <ArrowUpRight size={14} /></button>}
      </div>
      {!compact && (
        <>
          {execution.routing && <div className="mt-3 rounded-lg bg-aletis-bege/60 p-3 text-xs dark:bg-white/5"><p className="font-semibold text-foreground dark:text-white">{execution.routing.modelLabel || execution.routing.model} <span className="font-normal text-[var(--text-soft)]">· {execution.routing.mode === 'auto' ? 'escolha automática' : 'escolha manual'}</span></p>{execution.routing.reason && <p className="mt-1 leading-relaxed text-[var(--text-soft)] dark:text-stone-300">{execution.routing.reason}</p>}{execution.routing.fallback && <p className="mt-1 font-medium text-amber-700">Foi usado um modelo alternativo disponível.</p>}</div>}
          {execution.tools.length > 0 ? <ol className="mt-4 space-y-3">{execution.tools.map(tool => <li key={tool.id} className="flex gap-2.5 text-xs"><span className="mt-0.5 shrink-0 text-foreground">{tool.phase === 'started' && running ? <Loader2 size={14} className="animate-spin" /> : tool.phase === 'completed' ? <Check size={14} /> : <Circle size={14} />}</span><div className="min-w-0"><p className="font-medium text-foreground dark:text-white">{describeAlixTool(tool.tool)}</p><p className="mt-0.5 text-[var(--text-soft)] dark:text-stone-300">{tool.phase === 'started' ? (running ? 'Em andamento' : 'Sem confirmação de conclusão') : tool.phase === 'failed' ? 'Não concluído' : outcomeLabel[tool.outcome || 'unknown']}{typeof tool.durationMs === 'number' && ` · ${(tool.durationMs / 1000).toFixed(1)}s`}</p><details className="mt-1 text-[11px] text-muted-foreground"><summary className="cursor-pointer">Identificar consulta</summary><p className="mt-1 break-all font-mono">{tool.tool}</p></details></div></li>)}</ol> : <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-[var(--text-soft)]"><Workflow size={15} className="mt-0.5 shrink-0" />{running ? 'As etapas aparecem conforme a ALIX executa as ferramentas.' : 'Esta resposta não informou etapas de ferramentas.'}</p>}
        </>
      )}
    </section>
  )
}

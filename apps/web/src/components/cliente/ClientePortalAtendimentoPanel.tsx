import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Headphones, Loader2, RefreshCw, Send, X } from 'lucide-react'
import { apiFetch } from '../../hooks/useApi'

interface Request {
  id: string; tipo: 'atualizacao_cadastral' | 'duvida' | 'contato'; assunto: string; mensagem: string
  alteracoes: Record<string,string>; status: 'aberta' | 'em_atendimento' | 'concluida' | 'cancelada'
  resposta?: string; criadoEm: string; updatedAt: string; cadastroAtualizado: boolean; respondidoEm?: string
}
const statusLabel = { aberta:'Aguardando a equipe',em_atendimento:'Em atendimento',concluida:'Concluída',cancelada:'Encerrada' }
const typeLabel = { atualizacao_cadastral:'Correção cadastral',duvida:'Dúvida do cliente',contato:'Pedido de contato' }
const fieldLabel: Record<string,string> = {email:'E-mail',telefone:'Telefone',cidade:'Cidade',uf:'UF'}
const inputClass = 'w-full rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-aletis-gold dark:border-white/20 dark:bg-black/10 dark:text-white'
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-aletis-borda px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50 dark:border-white/20 dark:text-white'
const date = (value: string) => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))

export default function ClientePortalAtendimentoPanel({clienteId}:{clienteId:string}) {
  return <Requests key={clienteId} clienteId={clienteId} />
}
function Requests({clienteId}:{clienteId:string}) {
  const [items,setItems] = useState<Request[]>([])
  const [filter,setFilter] = useState<'ativos'|'todos'>('ativos')
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState<string|null>(null)
  const [notice,setNotice] = useState<string|null>(null)
  const [selected,setSelected] = useState<string|null>(null)
  const [visible,setVisible] = useState(10)
  const controller = useRef<AbortController|null>(null)
  const mounted = useRef(true)
  const version = useRef(0)
  const base = `/clientes/${encodeURIComponent(clienteId)}/portal/solicitacoes`
  const load = useCallback(async()=>{
    const sequence=++version.current;controller.current?.abort();const current=new AbortController();controller.current=current
    try {
      const next=await apiFetch<Request[]>(base,{signal:current.signal})
      if(mounted.current&&!current.signal.aborted&&sequence===version.current){setItems(next);setError(null)}
    } catch(error) {if(mounted.current&&!current.signal.aborted&&sequence===version.current)setError(error instanceof Error?error.message:'Não foi possível carregar os pedidos.')}
    finally {if(mounted.current&&sequence===version.current)setLoading(false)}
  },[base])
  useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;controller.current?.abort()}},[load])
  useEffect(()=>{const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&!selected)void load()},30000);return()=>window.clearInterval(timer)},[load,selected])
  const active = items.filter(item=>item.status==='aberta'||item.status==='em_atendimento')
  const shown = filter==='ativos'?active:items
  return <section aria-label="Atendimentos solicitados pelo cliente" className="rounded-lg border border-aletis-borda bg-card p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-white/5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground dark:text-white"><Headphones size={20}/>Pedidos de ajuda e cadastro</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/60">Dúvidas, pedidos de contato e correções enviados pelo próprio cliente. Sua resposta aparecerá no portal.</p></div><button type="button" disabled={loading} onClick={()=>void load()} className={buttonClass} aria-label="Atualizar atendimentos do portal"><RefreshCw size={15}/></button></div>
    {error&&<p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="my-4 flex gap-2" role="group" aria-label="Filtrar atendimentos"><button type="button" aria-pressed={filter==='ativos'} onClick={()=>{setFilter('ativos');setVisible(10)}} className={buttonClass}>Em aberto ({active.length})</button><button type="button" aria-pressed={filter==='todos'} onClick={()=>{setFilter('todos');setVisible(10)}} className={buttonClass}>Histórico ({items.length})</button></div>
    {loading?<p role="status" className="text-sm text-[var(--text-soft)]">Carregando atendimentos…</p>:!shown.length?<p className="rounded-xl border border-dashed border-aletis-borda p-5 text-sm text-[var(--text-soft)] dark:text-white/60">Nenhum pedido nesta lista. O cliente pode enviar dúvidas e correções pela área Meus dados e ajuda.</p>:<ul className="space-y-3">{shown.slice(0,visible).map(item=><li key={item.id} className="min-w-0 rounded-xl border border-aletis-borda p-4 dark:border-white/10">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--text-soft)] dark:text-white/60"><span>{typeLabel[item.tipo]} · {date(item.criadoEm)}</span><span className="font-semibold">{statusLabel[item.status]}</span></div>
      <h3 className="mt-2 break-words text-sm font-semibold text-foreground dark:text-white">{item.assunto}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--text-soft)] dark:text-white/70">{item.mensagem}</p>
      {Object.keys(item.alteracoes).length>0&&<dl className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-muted p-3 sm:grid-cols-2 dark:bg-black/10">{Object.entries(item.alteracoes).map(([key,value])=><div key={key} className="min-w-0"><dt className="text-[11px] font-semibold text-[var(--text-soft)] dark:text-white/60">{fieldLabel[key]||key} solicitado</dt><dd className="break-words text-sm text-foreground dark:text-white">{value}</dd></div>)}</dl>}
      {item.resposta&&<div className="mt-3 border-l-2 border-aletis-gold pl-3"><p className="text-xs font-semibold text-foreground dark:text-white">Resposta da equipe {item.respondidoEm&&`· ${date(item.respondidoEm)}`}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text-soft)] dark:text-white/70">{item.resposta}</p>{item.cadastroAtualizado&&<p className="mt-2 flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={13}/>Dados aplicados ao cadastro</p>}</div>}
      {['aberta','em_atendimento'].includes(item.status)&&(selected===item.id?<Reply key={`${item.id}:${item.updatedAt}`} base={base} item={item} onClose={()=>setSelected(null)} onSaved={()=>{setNotice('Resposta registrada e disponível ao cliente.');setSelected(null);void load()}} onRefresh={()=>void load()}/>:<button type="button" className={`${buttonClass} mt-3`} onClick={()=>{setSelected(item.id);setNotice(null)}}><Send size={14}/>Atender pedido</button>)}
    </li>)}</ul>}
    {shown.length>visible&&<button type="button" className={`${buttonClass} mt-4 w-full`} onClick={()=>setVisible(value=>value+10)}>Mostrar mais atendimentos</button>}
  </section>
}
function Reply({base,item,onClose,onSaved,onRefresh}:{base:string;item:Request;onClose:()=>void;onSaved:()=>void;onRefresh:()=>void}) {
  const [status,setStatus]=useState<'em_atendimento'|'concluida'|'cancelada'>('em_atendimento')
  const [resposta,setResposta]=useState(item.resposta||'')
  const [apply,setApply]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const guard=useRef(false);const controller=useRef(new AbortController())
  useEffect(()=>{const current=new AbortController();controller.current=current;return()=>current.abort()},[])
  async function submit(event:React.FormEvent){
    event.preventDefault();if(guard.current)return;guard.current=true;setBusy(true);setError(null)
    try{await apiFetch(`${base}/${encodeURIComponent(item.id)}`,{method:'PATCH',signal:controller.current.signal,body:JSON.stringify({expectedUpdatedAt:item.updatedAt,status,resposta:resposta.trim(),aplicarAlteracoes:status==='concluida'&&apply})});if(!controller.current.signal.aborted)onSaved()}
    catch(error){if(!controller.current.signal.aborted)setError(error instanceof Error?error.message:'Não foi possível registrar a resposta.')}
    finally{guard.current=false;if(!controller.current.signal.aborted)setBusy(false)}
  }
  return <form className="mt-4 space-y-3 border-t border-aletis-borda pt-4 dark:border-white/10" onSubmit={event=>void submit(event)}>
    <label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/65">Situação<select value={status} onChange={event=>{setStatus(event.target.value as typeof status);setApply(false)}} className={`${inputClass} mt-1`}><option value="em_atendimento">Em atendimento</option><option value="concluida">Concluir com resposta</option><option value="cancelada">Encerrar sem executar</option></select></label>
    <label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/65">Resposta que o cliente verá<textarea required={status!=='em_atendimento'} maxLength={3000} rows={3} value={resposta} onChange={event=>setResposta(event.target.value)} className={`${inputClass} mt-1`} placeholder="Explique o que foi conferido e o próximo passo."/></label>
    {item.tipo==='atualizacao_cadastral'&&status==='concluida'&&<label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={apply} onChange={event=>setApply(event.target.checked)} className="mt-1"/>Conferi os dados solicitados e quero aplicá-los ao cadastro do cliente.</label>}
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" className="ml-2 underline" onClick={onRefresh}>Recarregar pedido</button></div>}
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy||(status!=='em_atendimento'&&!resposta.trim())} className={`${buttonClass} border-aletis-verde bg-aletis-verde text-white`}>{busy?<Loader2 className="animate-spin" size={14}/>:<Send size={14}/>}Registrar resposta</button><button type="button" disabled={busy} onClick={onClose} className={buttonClass}><X size={14}/>Fechar</button></div>
  </form>
}

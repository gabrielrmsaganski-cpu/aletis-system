import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, HelpCircle, Loader2, MessageCircle, Phone, RotateCcw, Send, UserRound } from 'lucide-react'
import type { ClienteMe } from './types'
import { apiCall, formatDateTime } from './utils'

export interface PortalSupportRequest {
  id: string
  tipo: 'atualizacao_cadastral' | 'duvida' | 'contato'
  assunto: string
  mensagem: string
  alteracoes?: Partial<Pick<ClienteMe, 'email' | 'telefone' | 'cidade' | 'uf'>>
  status: 'aberta' | 'em_atendimento' | 'concluida' | 'cancelada'
  criadoEm: string
  updatedAt: string
  resposta?: string
  respondidoEm?: string
  cadastroAtualizado?: boolean
}
const statusLabel = { aberta: 'Recebida pela equipe', em_atendimento: 'Em atendimento', concluida: 'Concluída', cancelada: 'Cancelada' }
const typeLabel = { atualizacao_cadastral: 'Atualizar meus dados', duvida: 'Tirar uma dúvida', contato: 'Pedir contato da equipe' }
const fieldClass = 'mt-1 min-h-11 w-full rounded-xl border border-aletis-cream-escuro bg-card px-3 py-2 text-base text-foreground focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-gold/50'
const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aletis-gold focus-visible:ring-offset-2 disabled:opacity-50'

export function changedPortalProfile(original: Pick<ClienteMe, 'email' | 'telefone' | 'cidade' | 'uf'>, proposed: Pick<ClienteMe, 'email' | 'telefone' | 'cidade' | 'uf'>): PortalSupportRequest['alteracoes'] {
  const changed: PortalSupportRequest['alteracoes'] = {}
  for (const field of ['email', 'telefone', 'cidade', 'uf'] as const) {
    const next = proposed[field].trim()
    if (next !== (original[field] || '').trim()) changed[field] = next
  }
  return changed
}

export function PortalSupport({ cliente, token, active, onContact, onProfileRefresh }: { cliente: ClienteMe; token: string; active: boolean; onContact: (draft?: string) => void; onProfileRefresh: () => Promise<void> }) {
  const [requests, setRequests] = useState<PortalSupportRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<PortalSupportRequest | null>(null)
  const [type, setType] = useState<PortalSupportRequest['tipo']>('atualizacao_cadastral')
  const [subject, setSubject] = useState('Atualização dos meus dados de contato')
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState(() => ({ email: cliente.email || '', telefone: cliente.telefone || '', cidade: cliente.cidade || '', uf: cliente.uf || '' }))
  const previousProfile = useRef({ email: cliente.email || '', telefone: cliente.telefone || '', cidade: cliente.cidade || '', uf: cliente.uf || '' })
  useEffect(() => {
    const incoming = { email: cliente.email || '', telefone: cliente.telefone || '', cidade: cliente.cidade || '', uf: cliente.uf || '' }
    const before = previousProfile.current
    setProfile(draft => Object.fromEntries(Object.keys(incoming).map(field => { const key = field as keyof typeof incoming; return [key, draft[key] === before[key] ? incoming[key] : draft[key]] })) as typeof incoming)
    previousProfile.current = incoming
  }, [cliente.email, cliente.telefone, cliente.cidade, cliente.uf])
  const [sending, setSending] = useState(false)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [filter, setFilter] = useState<'todos' | 'abertos' | 'concluidos'>('todos')
  const [visible, setVisible] = useState(10)
  const mounted = useRef(true)
  const submitLock = useRef(false)
  const cancelLock = useRef(false)
  const idempotency = useRef<{ body: string; key: string } | null>(null)
  const profileRefreshed = useRef(new Set<string>())
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const response = await apiCall<PortalSupportRequest[]>('/api/portal/solicitacoes', { token, signal })
    if (!mounted.current || signal?.aborted) return
    setLoading(false)
    if (!response.ok) { setListError('Não foi possível consultar suas solicitações. Tente novamente.'); return }
    setRequests(response.data); setListError(null)
    const updated = response.data.filter(request => request.cadastroAtualizado && !profileRefreshed.current.has(request.id))
    if (updated.length) { updated.forEach(request => profileRefreshed.current.add(request.id)); void onProfileRefresh() }
  }, [token, onProfileRefresh])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    void refresh(controller.signal)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(controller.signal) }, 20_000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [active, refresh])
  useEffect(() => setVisible(10), [filter])
  const chooseType = (next: PortalSupportRequest['tipo']) => {
    setType(next); setReceipt(null); setError(null)
    if (!subject || Object.values(typeLabel).includes(subject) || subject === 'Atualização dos meus dados de contato') setSubject(next === 'atualizacao_cadastral' ? 'Atualização dos meus dados de contato' : typeLabel[next])
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitLock.current) return
    setError(null); setReceipt(null)
    const changes = type === 'atualizacao_cadastral' ? changedPortalProfile(cliente, profile) : undefined
    if (changes && !Object.keys(changes).length) { setError('Altere pelo menos um dado para solicitar a atualização. Para outra necessidade, escolha “Tirar uma dúvida”.'); return }
    if (changes && Object.values(changes).some(value => !value)) { setError('Preencha os dados que deseja atualizar. Se precisar remover uma informação, explique na opção “Tirar uma dúvida”.'); return }
    if (subject.trim().length < 3 || message.trim().length < 3) { setError('Informe o assunto e uma mensagem com pelo menos 3 caracteres.'); return }
    const body = JSON.stringify({ tipo: type, assunto: subject.trim(), mensagem: message.trim(), ...(changes ? { alteracoes: changes } : {}) })
    if (!idempotency.current || idempotency.current.body !== body) idempotency.current = { body, key: crypto.randomUUID() }
    submitLock.current = true; setSending(true)
    try {
      const response = await apiCall<PortalSupportRequest>('/api/portal/solicitacoes', { method: 'POST', token, headers: { 'Idempotency-Key': idempotency.current.key }, body })
      if (!mounted.current) return
      if (!response.ok) { setError(response.status === 0 ? 'Conexão interrompida. Tente novamente para confirmar o recebimento; sua solicitação não será duplicada.' : response.error || 'Não foi possível confirmar o recebimento. Tente novamente.'); return }
      setReceipt(response.data); setRequests(previous => [response.data, ...previous.filter(request => request.id !== response.data.id)])
      idempotency.current = null; setMessage(''); setFilter('todos')
    } finally { submitLock.current = false; if (mounted.current) setSending(false) }
  }
  const cancel = async (request: PortalSupportRequest) => {
    if (cancelLock.current) return
    cancelLock.current = true; setCancelling(true); setListError(null)
    try {
      const response = await apiCall<PortalSupportRequest>(`/api/portal/solicitacoes/${encodeURIComponent(request.id)}/cancelar`, { method: 'PATCH', token, body: JSON.stringify({ expectedUpdatedAt: request.updatedAt }) })
      if (!mounted.current) return
      if (!response.ok) { await refresh(); if (mounted.current) setListError(response.error || 'O pedido pode ter sido atualizado pela equipe. Confira o estado atual na lista.'); return }
      setRequests(previous => previous.map(item => item.id === request.id ? response.data : item)); setCancelId(null)
    } finally { cancelLock.current = false; if (mounted.current) setCancelling(false) }
  }
  const shown = requests.filter(request => filter === 'todos' || (filter === 'abertos' ? ['aberta', 'em_atendimento'].includes(request.status) : ['concluida', 'cancelada'].includes(request.status)))
  return <section className="space-y-5" aria-labelledby="portal-support-title">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-aletis-gold-escuro">Sua conta e atendimento</p><h1 id="portal-support-title" className="mt-2 font-display text-2xl font-bold text-foreground">Meus dados e ajuda</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">Peça uma atualização dos seus dados, registre uma dúvida ou solicite contato. Você acompanha o recebimento e a resposta da equipe por aqui.</p></div>
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={event => void submit(event)} className="rounded-3xl border border-aletis-cream-escuro bg-card p-5 sm:p-6" aria-label="Nova solicitação à equipe">
        <h2 className="font-display text-lg font-bold text-foreground">Como podemos ajudar?</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-3" role="group" aria-label="Tipo de solicitação">{(['atualizacao_cadastral', 'duvida', 'contato'] as const).map(value => { const Icon = value === 'atualizacao_cadastral' ? UserRound : value === 'duvida' ? HelpCircle : Phone; return <button key={value} type="button" aria-pressed={type === value} disabled={sending} onClick={() => chooseType(value)} className={`flex min-h-14 items-center gap-2 rounded-xl border p-3 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-aletis-gold ${type === value ? 'border-aletis-verde bg-aletis-verde text-white' : 'border-aletis-cream-escuro text-foreground'}`}><Icon size={18} className="shrink-0" />{typeLabel[value]}</button> })}</div>
        {type === 'atualizacao_cadastral' && <fieldset disabled={sending} className="mt-5"><legend className="text-sm font-semibold text-foreground">Confira e altere o que precisa atualizar</legend><p className="mt-1 text-xs leading-relaxed text-muted-foreground">A equipe confere sua solicitação antes de atualizar o cadastro. Nome e CPF/CNPJ podem ser tratados pela opção “Tirar uma dúvida”.</p><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-foreground">E-mail<input type="email" autoComplete="email" maxLength={254} value={profile.email} onChange={event => setProfile(previous => ({ ...previous, email: event.target.value }))} className={fieldClass} /></label><label className="text-sm font-semibold text-foreground">Telefone<input type="tel" autoComplete="tel" maxLength={30} value={profile.telefone} onChange={event => setProfile(previous => ({ ...previous, telefone: event.target.value }))} className={fieldClass} /></label><label className="text-sm font-semibold text-foreground">Cidade<input autoComplete="address-level2" maxLength={150} value={profile.cidade} onChange={event => setProfile(previous => ({ ...previous, cidade: event.target.value }))} className={fieldClass} /></label><label className="text-sm font-semibold text-foreground">Estado<select autoComplete="address-level1" value={profile.uf} onChange={event => setProfile(previous => ({ ...previous, uf: event.target.value }))} className={fieldClass}><option value="">Selecione</option>{states.map(uf => <option key={uf} value={uf}>{uf}</option>)}</select></label></div></fieldset>}
        <label className="mt-5 block text-sm font-semibold text-foreground">Assunto<input required minLength={3} maxLength={160} value={subject} onChange={event => setSubject(event.target.value)} disabled={sending} className={fieldClass} /></label>
        <label className="mt-4 block text-sm font-semibold text-foreground">{type === 'contato' ? 'Como e quando prefere ser contatado?' : 'Mensagem para a equipe'}<textarea required minLength={3} maxLength={3000} rows={4} value={message} onChange={event => setMessage(event.target.value)} disabled={sending} aria-describedby="support-message-help" className={`${fieldClass} resize-y`} /></label><p id="support-message-help" className="mt-1 text-xs text-muted-foreground">{type === 'contato' ? 'Informe o canal e sua disponibilidade. A equipe confirmará o contato, sem agendamento automático.' : 'Explique o que precisa. Evite enviar senhas ou dados de acesso.'} <span>{message.length}/3000</span></p>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-800">{error}</p>}
        {receipt && <div role="status" className="mt-4 rounded-xl border border-aletis-sage/50 bg-aletis-sage/15 p-4 text-sm text-foreground"><p className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} />Sua solicitação foi recebida</p><p className="mt-2">A equipe acompanhará o pedido. A resposta aparecerá no histórico abaixo.</p><p className="mt-2 break-all text-xs">Protocolo: {receipt.id}</p></div>}
        <button type="submit" disabled={sending} className={`${buttonClass} mt-5 w-full bg-aletis-verde text-white hover:bg-aletis-verde-medio sm:w-auto`}>{sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}{sending ? 'Confirmando recebimento…' : 'Enviar solicitação'}</button>
      </form>
      <aside className="space-y-4"><div className="rounded-3xl border border-aletis-cream-escuro bg-card p-5"><h2 className="font-display text-lg font-bold text-foreground">Dados atuais do cadastro</h2><dl className="mt-4 space-y-3">{([['Nome', cliente.nome], ['E-mail', cliente.email], ['Telefone', cliente.telefone], ['Cidade/estado', [cliente.cidade, cliente.uf].filter(Boolean).join(' / ')]]).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-foreground">{value || 'Não informado'}</dd></div>)}</dl></div><div className="rounded-3xl border border-aletis-sage/40 bg-aletis-sage/10 p-5"><h2 className="font-display text-base font-bold text-foreground">Prefere conversar?</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Use a conversa com o consultor para falar sobre um pedido ou documento específico.</p><button type="button" onClick={() => onContact()} className={`${buttonClass} mt-4 border border-aletis-cream-escuro bg-card text-foreground`}><MessageCircle size={17} />Abrir conversa</button></div></aside>
    </div>
    <section aria-labelledby="support-history-title" className="rounded-3xl border border-aletis-cream-escuro bg-card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="support-history-title" className="font-display text-lg font-bold text-foreground">Minhas solicitações</h2><button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Atualizar minhas solicitações" className={`${buttonClass} border border-aletis-cream-escuro text-foreground`}><RotateCcw size={16} className={loading ? 'animate-spin' : ''} />Atualizar</button></div><div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar minhas solicitações">{([['todos', 'Todas'], ['abertos', 'Em aberto'], ['concluidos', 'Finalizadas']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`${buttonClass} ${filter === value ? 'bg-aletis-verde text-white' : 'border border-aletis-cream-escuro text-foreground'}`}>{label}</button>)}</div>
      {listError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{listError}</p>}
      {loading && !requests.length ? <p role="status" className="py-6 text-sm text-muted-foreground">Consultando suas solicitações…</p> : !shown.length ? <p className="py-6 text-sm text-muted-foreground">{requests.length ? 'Nenhuma solicitação neste filtro.' : 'Seus pedidos de ajuda e atualização aparecerão aqui depois do envio.'}</p> : <ul className="mt-4 space-y-3">{shown.slice(0, visible).map(request => <li key={request.id} className="rounded-2xl border border-aletis-cream-escuro p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-aletis-cream px-2.5 py-1 text-xs font-semibold text-foreground">{statusLabel[request.status]}</span><time className="text-xs text-muted-foreground">{formatDateTime(request.criadoEm)}</time></div><h3 className="mt-3 break-words font-semibold text-foreground">{request.assunto}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{request.mensagem}</p>{request.alteracoes && Object.keys(request.alteracoes).length > 0 && <details className="mt-3 text-sm text-foreground"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Dados que você pediu para alterar</summary><dl className="space-y-1">{Object.entries(request.alteracoes).map(([field, value]) => <div key={field} className="break-words"><dt className="inline font-semibold">{({ email: 'E-mail', telefone: 'Telefone', cidade: 'Cidade', uf: 'Estado' } as Record<string, string>)[field]}: </dt><dd className="inline">{value}</dd></div>)}</dl></details>}{request.resposta && <div className="mt-3 rounded-xl bg-aletis-sage/15 p-3 text-sm leading-relaxed text-foreground"><p className="font-bold">Resposta da equipe{request.respondidoEm ? ` · ${formatDateTime(request.respondidoEm)}` : ''}</p><p className="mt-1 whitespace-pre-wrap break-words">{request.resposta}</p>{request.cadastroAtualizado && <p className="mt-2 flex items-center gap-1.5 font-semibold"><CheckCircle2 size={15} />Cadastro atualizado pela equipe</p>}</div>}<p className="mt-3 break-all text-[11px] text-muted-foreground">Protocolo: {request.id}</p>{request.status === 'aberta' && (cancelId === request.id ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm text-amber-900">Cancelar esta solicitação? O registro continuará no seu histórico.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void cancel(request)} disabled={cancelling} className={`${buttonClass} bg-aletis-verde text-white`}>{cancelling ? 'Cancelando…' : 'Confirmar cancelamento'}</button><button type="button" onClick={() => setCancelId(null)} disabled={cancelling} className={`${buttonClass} text-foreground`}>Manter solicitação</button></div></div> : <button type="button" onClick={() => setCancelId(request.id)} className={`${buttonClass} mt-2 border border-aletis-cream-escuro text-foreground`}>Cancelar solicitação</button>)}</li>)}</ul>}
      {shown.length > visible && <button type="button" onClick={() => setVisible(value => value + 10)} className={`${buttonClass} mt-4 border border-aletis-cream-escuro text-foreground`}>Mostrar mais solicitações</button>}
    </section>
  </section>
}

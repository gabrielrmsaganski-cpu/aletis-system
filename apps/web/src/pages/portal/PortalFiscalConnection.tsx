import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, FileKey2, FileText, Landmark, Loader2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react'
import { FISCAL_UFS, type FiscalConnectionData, type FiscalCredentialDTO, type FiscalUF } from '@aletis/shared-types'
import { ApiError, apiFetch } from '../../hooks/useApi'
import { apiCall } from './utils'
import { FiscalArchive, FiscalHistory } from './FiscalArchive'

const input = 'min-h-11 w-full min-w-0 rounded-xl border border-aletis-cream-escuro bg-card px-3 py-2 text-base text-foreground focus-visible:ring-2 focus-visible:ring-aletis-gold'
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-aletis-cream-escuro px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-aletis-gold'
const card = 'min-w-0 rounded-2xl border border-aletis-cream-escuro bg-card p-5 sm:p-6'
const smallLabel = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'
const dateTime = (value?: string) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : 'Ainda não realizada'
const dateOnly = (value: string) => Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value))
  : 'Não informada'

type Call = <T>(path: string, init?: RequestInit) => Promise<T>
type Props = { token?: string; clienteId?: string }


/** A chave força o descarte de senha, arquivos e respostas ao mudar o cliente autenticado. */
export function PortalFiscalConnection(props: Props) {
  return <FiscalConnectionWorkspace key={props.clienteId ? `staff:${props.clienteId}` : `portal:${props.token}`} {...props} />
}

function FiscalConnectionWorkspace({ token, clienteId }: Props) {
  const staff = Boolean(clienteId)
  const base = staff ? `/api/clientes/${encodeURIComponent(clienteId!)}/portal/fiscal/conexao` : '/api/portal/fiscal/conexao'
  const [data, setData] = useState<FiscalConnectionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [suspending, setSuspending] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [view,setView]=useState<'acervo'|'consultas'|'certificado'|'cobertura'>(staff?'acervo':'certificado')
  const [lookupType,setLookupType]=useState<'chave'|'nsu'>('chave')
  const [lookup,setLookup]=useState('')
  const [state, setState] = useState<FiscalUF>('MT')
  const lifecycle = useRef(new AbortController())
  const sequence = useRef(0)
  const actionGuard = useRef(false)
  const call: Call = useCallback(async <T,>(path: string, init?: RequestInit) => {
    if (staff) return apiFetch<T>(path.replace(/^\/api(?=\/)/, ''), init)
    const response = await apiCall<T>(path, { ...init, token })
    if (!response.ok) throw new ApiError(response.error, response.status)
    return response.data
  }, [staff, token])
  const load = useCallback(async () => {
    const current = ++sequence.current
    setLoading(true)
    try {
      const response = await call<FiscalConnectionData>(base, { signal: lifecycle.current.signal })
      if (!lifecycle.current.signal.aborted && sequence.current === current) {
        setData(response)
        setError('')
      }
    } catch (cause) {
      if (!lifecycle.current.signal.aborted && sequence.current === current) {
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) setData(null)
        setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a conexão fiscal.')
      }
    } finally {
      if (!lifecycle.current.signal.aborted && sequence.current === current) setLoading(false)
    }
  }, [base, call])
  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    void load()
    return () => { sequence.current++; controller.abort() }
  }, [load])

  async function changeCredential(credential: FiscalCredentialDTO, action: 'consultar' | 'suspender' | 'automacao') {
    if (actionGuard.current || lifecycle.current.signal.aborted) return
    actionGuard.current = true
    setBusy(credential.id)
    setNotice('')
    setError('')
    try {
      const path = action === 'consultar' ? `${base}/consultar` : `${base}/credenciais/${encodeURIComponent(credential.id)}/${action}`
      await call(path, {
        method: action === 'automacao' ? 'PATCH' : 'POST',
        signal: lifecycle.current.signal,
        ...(action === 'consultar' ? { headers: { 'Idempotency-Key': crypto.randomUUID() } } : {}),
        body: JSON.stringify(action === 'consultar' ? { credencialId: credential.id, completa:true } : {
          expectedUpdatedAt: credential.atualizadoEm,
          ...(action === 'automacao' ? { ativa: !credential.automacaoAtiva } : {}),
        }),
      })
      if (lifecycle.current.signal.aborted) return
      setSuspending(null)
      setNotice(action === 'suspender'
        ? 'Uso do certificado suspenso no ALETIS. A revogação do certificado, se necessária, deve ser feita na certificadora.'
        : action === 'automacao'
          ? credential.automacaoAtiva ? 'Acompanhamento automático pausado.' : 'Acompanhamento automático ativado. As próximas consultas respeitarão o intervalo permitido pelo serviço fiscal.'
          : 'Consulta processada. Confira o resultado no histórico abaixo.')
      await load()
    } catch (cause) {
      if (!lifecycle.current.signal.aborted) {
        const message = cause instanceof Error ? cause.message : 'Não foi possível concluir a solicitação.'
        // A SEFAZ pode ter imposto uma espera; recarregar mostra a próxima consulta permitida.
        await load()
        if (!lifecycle.current.signal.aborted) setError(message)
      }
    } finally {
      actionGuard.current = false
      if (!lifecycle.current.signal.aborted) setBusy(null)
    }
  }

  async function consultTarget() {
    if(actionGuard.current||!active||lifecycle.current.signal.aborted)return
    actionGuard.current=true;setBusy('pontual');setError('');setNotice('')
    try {const result=await call<{status:string;mensagem:string}>(`${base}/consultar`,{method:'POST',signal:lifecycle.current.signal,headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({credencialId:active.id,modalidade:lookupType,alvo:lookup})});if(!lifecycle.current.signal.aborted){setNotice(result.mensagem);await load()}}
    catch(e){if(!lifecycle.current.signal.aborted){await load();setError(e instanceof Error?e.message:'Não foi possível consultar a SEFAZ.')}}
    finally{actionGuard.current=false;if(!lifecycle.current.signal.aborted)setBusy(null)}
  }
  useEffect(()=>{const timer=setInterval(()=>{if(!actionGuard.current&&document.visibilityState==='visible')void load()},30000);return()=>clearInterval(timer)},[load])

  const active = data?.credenciais.find(credential => credential.status === 'ativa' && Date.parse(credential.validadeFim) > Date.now())
  const connected = Boolean(active?.verificadaNoOrgao)
  const coverage = data?.cobertura.find(item => item.uf === state)

  return <section id="conexao-fiscal" aria-label="Conexão fiscal e certificado digital" className="min-w-0 space-y-5 text-foreground">
    <div className="rounded-2xl border border-aletis-sage/40 bg-aletis-sage/10 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-aletis-gold-escuro">Ambiente Nacional da NF-e</p><h2 className="mt-2 flex items-center gap-2 font-display text-xl font-bold"><Landmark size={22}/>Notas fiscais conectadas</h2><p className="mt-2 text-sm">{connected?'Certificado aceito pela SEFAZ':active?'Certificado validado; aguardando consulta':'Envie o certificado A1 pelo portal para iniciar'}{active?.automacaoAtiva?' · Acompanhamento automático ativo':''}</p></div><button type="button" className={`${button} bg-card`} disabled={loading||Boolean(busy)} onClick={()=>void load()} aria-label="Atualizar conexão fiscal"><RefreshCw size={16} className={loading?'animate-spin':''}/>Atualizar</button></div>{data?.sincronizacao&&<p className="mt-3 text-xs leading-relaxed text-muted-foreground">{data.totalDocumentos??data.documentos.length} registros no acervo · {data.sincronizacao.emDia?'Distribuição alcançou o último NSU informado pelo órgão':data.sincronizacao.emAndamento||active?.automacaoAtiva?'Busca de novos lotes em andamento':'Há novos lotes disponíveis para buscar'} · Último sucesso: {dateTime(active?.ultimoSucessoEm)}</p>}</div>
    <nav aria-label="Áreas fiscais" className="flex flex-wrap gap-2">{([['acervo','Acervo e análise'],['consultas','Consultar SEFAZ'],['certificado','Certificado e automação'],['cobertura','Cobertura por estado']] as const).map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)} className={`${button} ${view===id?'border-aletis-verde bg-aletis-verde text-white':'bg-card'}`}>{label}</button>)}</nav>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {loading && !data ? <p role="status" className="p-4 text-sm">Carregando conexão fiscal…</p> : data && <>
      {view==='certificado'&&<>
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Resumo da conexão fiscal">
        <div className="rounded-xl border border-aletis-cream-escuro bg-card p-4"><p className={smallLabel}>Conexão NF-e</p><p className="mt-2 font-semibold">{!data.configurado ? 'Preparação necessária' : connected ? 'Acesso confirmado pelo serviço' : active ? 'Aguardando primeira consulta' : 'Certificado necessário'}</p></div>
        <div className="rounded-xl border border-aletis-cream-escuro bg-card p-4"><p className={smallLabel}>Última consulta bem-sucedida</p><p className="mt-2 font-semibold">{dateTime(active?.ultimoSucessoEm)}</p></div>
        <div className="rounded-xl border border-aletis-cream-escuro bg-card p-4"><p className={smallLabel}>Documentos no acervo completo</p><p className="mt-2 text-2xl font-semibold">{data.totalDocumentos??data.documentos.length}</p><p className="mt-1 text-xs text-muted-foreground">Notas completas, resumos e eventos recebidos.</p></div>
      </div>
      {!data.configurado && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">A conexão fiscal precisa ser preparada pela administração do sistema antes de receber certificados ou fazer consultas. Os pedidos de procuração continuam disponíveis abaixo.</p>}
      {data.avisos.length > 0 && <ul aria-label="Orientações da conexão" className="space-y-2 rounded-xl bg-aletis-cream/60 p-4 text-sm leading-relaxed">{data.avisos.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}</ul>}
      {data.credenciais.length > 0 && <section className={card} aria-label="Certificados fiscais cadastrados">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-display text-lg font-bold">Certificado e acompanhamento</h3>{!staff && data.configurado && <button type="button" className={button} disabled={Boolean(busy)} onClick={() => setShowUpload(value => !value)}>{showUpload ? 'Fechar envio' : 'Renovar ou substituir certificado'}</button>}</div>
        <ul className="mt-4 space-y-4">{data.credenciais.map(credential => {
          const expired = credential.status === 'expirada' || Date.parse(credential.validadeFim) <= Date.now()
          const available = credential.status === 'ativa' && !expired
          const renewal = available && Date.parse(credential.validadeFim) - Date.now() < 30 * 86400_000
          const cooldown = credential.proximaConsultaEm && Date.parse(credential.proximaConsultaEm) > Date.now()
          const running = data.consultas.some(query => query.credencialId === credential.id && query.status === 'executando')
          return <li key={credential.id} className="min-w-0 rounded-xl border border-aletis-cream-escuro p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{credential.titular}</p><p className="mt-1 break-all text-sm text-muted-foreground">{credential.documentoMascarado} · UF do titular: {credential.uf}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${available ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{credential.status === 'suspensa' ? 'Uso suspenso' : expired ? 'Certificado vencido' : credential.verificadaNoOrgao ? 'Acesso confirmado' : 'Certificado validado'}</span></div>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4"><div><dt className={smallLabel}>Validade</dt><dd className="mt-1">Até {dateOnly(credential.validadeFim)}</dd></div><div><dt className={smallLabel}>Última tentativa</dt><dd className="mt-1">{dateTime(credential.ultimaConsultaEm)}</dd></div><div><dt className={smallLabel}>Próxima consulta</dt><dd className="mt-1">{available ? cooldown ? dateTime(credential.proximaConsultaEm) : running ? 'Consulta em andamento' : 'Disponível agora' : 'Certificado indisponível'}</dd></div><div><dt className={smallLabel}>Acompanhamento automático</dt><dd className="mt-1">{available && credential.automacaoAtiva ? 'Ativado' : 'Pausado'}</dd></div></dl>
            {renewal && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Renovação próxima: o certificado vence em até 30 dias. Envie o certificado renovado para manter as consultas.</p>}
            {available && !credential.verificadaNoOrgao && <p className="mt-3 text-sm text-muted-foreground">Certificado validado. Faça a primeira consulta para verificar o acesso no serviço fiscal.</p>}
            {available && <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={`${button} border-aletis-verde bg-aletis-verde text-white`} disabled={!data.configurado || Boolean(busy) || Boolean(cooldown) || running} onClick={() => void changeCredential(credential, 'consultar')}>{busy === credential.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}Consultar NF-e agora</button><button type="button" className={button} disabled={!data.configurado || Boolean(busy)} onClick={() => void changeCredential(credential, 'automacao')}>{credential.automacaoAtiva ? 'Pausar acompanhamento automático' : 'Ativar acompanhamento automático'}</button><button type="button" className={button} disabled={Boolean(busy)} onClick={() => setSuspending(credential.id)}>Suspender certificado</button></div>}
            {suspending === credential.id && <div role="group" aria-label="Confirmar suspensão do certificado" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>Suspender o uso deste certificado no ALETIS? As próximas consultas e o acompanhamento automático serão interrompidos. Os documentos já recebidos permanecerão no histórico. Esta ação não revoga o certificado na certificadora.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={Boolean(busy)} onClick={() => void changeCredential(credential, 'suspender')}>Confirmar suspensão do certificado</button><button type="button" className={button} disabled={Boolean(busy)} onClick={() => setSuspending(null)}>Manter certificado</button></div></div>}
          </li>
        })}</ul>
      </section>}
      {!staff && data.configurado && (!active || showUpload) && <CertificateForm key={`${token}:certificate`} token={token!} states={data.cobertura} hasActive={Boolean(active)} onSaved={() => { setShowUpload(false); setNotice('Certificado recebido e validado. Faça a primeira consulta para confirmar o acesso aos documentos NF-e.'); void load() }} />}
      {staff && !active && <p className="rounded-xl border border-dashed border-aletis-cream-escuro bg-card p-5 text-sm leading-relaxed">O cliente precisa enviar o certificado A1 pela área <strong>SEFAZ</strong> do próprio portal e autorizar seu uso. Após a validação, a equipe poderá consultar os documentos NF-e e acompanhar os resultados nesta tela.</p>}

      </>}
      {view==='acervo'&&<FiscalArchive call={call} base={base} token={token} staff={staff} revision={data.atualizadoEm} defaultFromYear={clienteId==='cli-002'?2021:undefined}/>}
      {view==='consultas'&&<>
        <section className={card}><h3 className="font-display text-lg font-bold">Buscar documentos na SEFAZ</h3><p className="mt-2 text-sm leading-relaxed">A busca completa percorre os lotes disponíveis e continua em segundo plano, mesmo após fechar esta tela. O período oferecido pelo órgão é de até 90 dias; novas conexões podem ter alcance menor.</p><div className="mt-4 flex flex-wrap items-center gap-3"><button className={`${button} bg-aletis-verde text-white`} disabled={!active||!data.configurado||Boolean(busy)||Boolean(active?.proximaConsultaEm&&Date.parse(active.proximaConsultaEm)>Date.now())} onClick={()=>active&&void changeCredential(active,'consultar')}><RefreshCw size={16}/>Buscar todos os documentos disponíveis</button><p className="text-xs text-muted-foreground">{active?.proximaConsultaEm&&Date.parse(active.proximaConsultaEm)>Date.now()?`Próximo lote permitido: ${dateTime(active.proximaConsultaEm)}`:'Consulta sequencial disponível'}</p></div>
        {data.sincronizacao&&<dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2"><div><dt className={smallLabel}>Último NSU armazenado</dt><dd className="mt-1 font-mono">{data.sincronizacao.ultimoNsu}</dd></div><div><dt className={smallLabel}>Maior NSU informado pela SEFAZ</dt><dd className="mt-1 font-mono">{data.sincronizacao.maiorNsu}</dd></div></dl>}
        <form className="mt-6 border-t border-aletis-cream-escuro pt-5" onSubmit={e=>{e.preventDefault();void consultTarget()}}><h4 className="font-semibold">Consulta pontual por chave ou NSU</h4><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Procure uma nota específica ou recupere um NSU ausente. Limite compartilhado de 20 consultas pontuais por hora. A SEFAZ verifica o vínculo do titular e pode não disponibilizar o XML. Nenhuma manifestação é enviada.</p><div className="mt-4 grid gap-3 sm:grid-cols-[12rem_1fr]"><label className="text-sm font-semibold">Consultar por<select className={`${input} mt-1`} value={lookupType} onChange={e=>{setLookupType(e.target.value as 'chave'|'nsu');setLookup('')}}><option value="chave">Chave da NF-e</option><option value="nsu">NSU específico</option></select></label><label className="text-sm font-semibold">{lookupType==='chave'?'Chave de acesso (44 caracteres)':'NSU (até 15 dígitos)'}<input className={`${input} mt-1 font-mono`} required maxLength={lookupType==='chave'?44:15} value={lookup} onChange={e=>setLookup(e.target.value.replace(/\s/g,'').toUpperCase())} pattern={lookupType==='chave'?'[0-9]{6}[A-Z0-9]{12}[0-9]{26}':'[0-9]{1,15}'}/></label></div><button type="submit" className={`${button} mt-3`} disabled={!active||!data.configurado||Boolean(busy)||!lookup||Boolean(active?.proximaConsultaPontualEm&&Date.parse(active.proximaConsultaPontualEm)>Date.now())}>Consultar {lookupType==='chave'?'chave na SEFAZ':'NSU na SEFAZ'}</button>{active?.proximaConsultaPontualEm&&Date.parse(active.proximaConsultaPontualEm)>Date.now()&&<p className="mt-2 text-xs">Consulta pontual permitida a partir de {dateTime(active.proximaConsultaPontualEm)}.</p>}</form></section>
        <FiscalHistory call={call} base={base} revision={data.atualizadoEm}/>
      </>}
      {view==='cobertura'&&
      <section className={card} aria-labelledby="fiscal-coverage-heading"><h3 id="fiscal-coverage-heading" className="font-display text-lg font-bold">O que está disponível em cada estado</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">A distribuição nacional de NF-e atende titulares de todas as UFs. Débitos, certidões, inscrições, declarações, parcelamentos e processos usam serviços próprios de cada estado e podem exigir procuração específica.</p><label className="mt-4 block max-w-md text-sm font-semibold">Consultar cobertura por estado<select className={`${input} mt-1`} value={state} onChange={event => setState(event.target.value as FiscalUF)}>{data.cobertura.map(item => <option key={item.uf} value={item.uf}>{item.uf} · {item.nome}</option>)}</select></label>{coverage && <><a className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline" href={coverage.portalUrl} target="_blank" rel="noreferrer">Abrir portal oficial de {coverage.uf}<ExternalLink size={14} /></a><ul className="mt-3 grid gap-3 md:grid-cols-2">{coverage.servicos.map(service => <li key={service.id} className="rounded-xl border border-aletis-cream-escuro p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h4 className="text-sm font-semibold">{service.nome}</h4><span className={`rounded-full px-2 py-1 text-xs font-semibold ${service.status === 'portal_oficial' ? 'bg-aletis-cream text-foreground' : 'bg-aletis-sage/10 text-foreground'}`}>{service.status === 'portal_oficial' ? 'Acesso pelo portal oficial' : connected ? 'Conexão NF-e confirmada' : 'Disponível para conectar'}</span></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{service.descricao}</p></li>)}</ul></>}<p className="mt-4 rounded-xl bg-aletis-cream/60 p-3 text-xs leading-relaxed text-muted-foreground">Para os demais serviços, registre a procuração e os poderes abaixo. Ter um certificado não garante acesso irrestrito a todos os sistemas fiscais. A conexão NF-e faz consultas de distribuição; não manifesta notas, transmite declarações, efetua pagamentos ou dá ciência de intimações.</p></section>
      }
    </>}
  </section>
}

function CertificateForm({ token, states, hasActive, onSaved }: { token: string; states: FiscalConnectionData['cobertura']; hasActive: boolean; onSaved: () => void }) {
  const [document, setDocument] = useState('')
  const [uf, setUf] = useState<FiscalUF | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileVersion, setFileVersion] = useState(0)
  const idempotency = useRef(crypto.randomUUID())
  const controller = useRef(new AbortController())
  const guard = useRef(false)
  useEffect(() => {
    const current = new AbortController()
    controller.current = current
    return () => current.abort()
  }, [])
  const changed = () => { idempotency.current = crypto.randomUUID(); setConsent(false); setError('') }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guard.current || controller.current.signal.aborted) return
    if (!file || !/\.(pfx|p12)$/i.test(file.name) || file.size > 256 * 1024 || file.size === 0) { setError('Escolha um certificado A1 .pfx ou .p12 válido, com até 256 KB.'); return }
    if (!uf || !document.trim() || !password || !consent) { setError('Informe o titular, o estado, a senha do certificado e confirme a autorização de uso.'); return }
    if (!event.currentTarget.reportValidity()) return
    guard.current = true
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('senha', password)
      form.append('uf', uf)
      form.append('documento', document.replace(/[.\s/-]/g, '').toUpperCase())
      form.append('consentimento', 'true')
      const response = await fetch('/api/portal/fiscal/conexao/certificado', {
        method: 'POST', credentials: 'same-origin', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': idempotency.current }, body: form, signal: controller.current.signal,
      })
      const result = await response.json().catch(() => ({}))
      if (controller.current.signal.aborted) return
      if (!response.ok || result.success !== true) throw new Error(typeof result.error === 'string' ? result.error : 'Não foi possível confirmar o recebimento do certificado.')
      setPassword('')
      setFile(null)
      setFileVersion(value => value + 1)
      setConsent(false)
      idempotency.current = crypto.randomUUID()
      onSaved()
    } catch (cause) {
      if (!controller.current.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o certificado.')
    } finally {
      guard.current = false
      if (!controller.current.signal.aborted) setBusy(false)
    }
  }
  return <form className={card} aria-label="Conectar certificado A1" onSubmit={event => void submit(event)} autoComplete="off">
    <h3 className="flex items-center gap-2 font-display text-lg font-bold"><FileKey2 size={22} className="shrink-0 text-aletis-gold-escuro" />{hasActive ? 'Enviar certificado renovado' : 'Conectar meu certificado A1'}</h3>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">O arquivo de assinatura usado nesta conexão é o <strong>certificado digital A1 (.pfx ou .p12)</strong>. Ele deve pertencer ao CPF ou CNPJ deste cadastro. PDF assinado, token A3 e certificado em nuvem seguem o fluxo de procuração ou orientação da equipe.</p>
    <div className="mt-4 flex items-start gap-2 rounded-xl bg-aletis-sage/10 p-3 text-sm leading-relaxed"><LockKeyhole size={18} className="mt-0.5 shrink-0" /><p>Certificado e senha ficam protegidos por criptografia na área de credenciais. Não são enviados ao Drive, aos documentos comuns ou à ALIX. O certificado permite representar seu titular; aqui o uso autorizado é limitado às consultas NF-e descritas abaixo.</p></div>
    {hasActive && <p className="mt-3 text-sm text-amber-900">O novo certificado substituirá o anterior para as próximas consultas. O histórico de documentos será preservado.</p>}
    <fieldset disabled={busy} className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">CPF ou CNPJ do titular<input required maxLength={20} className={`${input} mt-1`} autoCapitalize="characters" spellCheck={false} value={document} onChange={event => { setDocument(event.target.value.toUpperCase()); changed() }} placeholder="Conforme o cadastro no ALETIS" /></label><label className="text-sm font-semibold">Estado do titular do certificado<select required className={`${input} mt-1`} value={uf} onChange={event => { setUf(event.target.value as FiscalUF); changed() }}><option value="">Escolha o estado</option>{(states.length ? states : FISCAL_UFS.map(value => ({ uf: value, nome: value }))).map(item => <option key={item.uf} value={item.uf}>{item.uf} · {item.nome}</option>)}</select></label></div>
      <p className="text-xs leading-relaxed text-muted-foreground">O estado identifica o titular na solicitação. A consulta nacional pode disponibilizar NF-e vinculadas a ele em qualquer UF.</p>
      <label className="block text-sm font-semibold">Arquivo do certificado A1 (.pfx ou .p12, até 256 KB)<input key={fileVersion} required type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={event => { setFile(event.target.files?.[0] || null); changed() }} className="mt-2 min-h-11 w-full max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-aletis-cream file:px-3 file:py-3 file:text-aletis-verde" />{file && <span className="mt-2 block break-all text-xs font-normal">Selecionado: {file.name}</span>}</label>
      <label className="block text-sm font-semibold">Senha do certificado<input type="password" autoComplete="new-password" required maxLength={256} className={`${input} mt-1`} value={password} onChange={event => { setPassword(event.target.value); changed() }} /></label>
      <label className="flex items-start gap-2 rounded-xl border border-aletis-cream-escuro p-4 text-sm leading-relaxed"><input type="checkbox" required className="mt-1 shrink-0" checked={consent} onChange={event => { setConsent(event.target.checked); setError('') }} /><span>Sou o titular ou responsável autorizado e autorizo o ALETIS a guardar este certificado e a senha de forma criptografada para consultar e receber documentos pelo serviço nacional de distribuição de NF-e. Este consentimento cobre somente consultas, sem manifestação de notas, assinatura ou transmissão de declarações, pagamentos ou ciência de intimações. Posso suspender o uso no ALETIS a qualquer momento.</span></label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button type="submit" className={`${button} border-aletis-verde bg-aletis-verde text-white`} disabled={busy || !file || !password || !uf || !document.trim() || !consent}>{busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}Validar e conectar certificado</button>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />Após validar o certificado, você poderá fazer a primeira consulta e optar pelo acompanhamento automático.</p>
    </fieldset>
  </form>
}

import { useState } from 'react'
import { apiFetch } from '../../hooks/useApi'

interface Attempt { attemptId: string; authorizationUrl: string; expiresAt: string; account: string }

export function GoogleDriveAuthorizationPanel({ onComplete }: { onComplete: () => Promise<void> }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function start() {
    setBusy(true); setError(null); setDone(false)
    try {
      const next = await apiFetch<Attempt>('/integrations/google/drive/authorization/start', { method: 'POST', body: '{}' })
      if (new URL(next.authorizationUrl).origin !== 'https://accounts.google.com') throw new Error('Endereço de autorização inválido.')
      setAttempt(next)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  async function complete() {
    if (!attempt) return
    setBusy(true); setError(null)
    const submittedCode = code
    setCode('')
    try {
      const result = await apiFetch<{ status: { status: string; diagnostic?: { message: string } } }>('/integrations/google/drive/authorization/complete', {
        method: 'POST', body: JSON.stringify({ attemptId: attempt.attemptId, code: submittedCode }),
      })
      setAttempt(null)
      if (result.status.status === 'connected') setDone(true)
      else setError(result.status.diagnostic?.message || 'A autorização foi recebida, mas o acesso ao Drive ainda precisa ser verificado.')
      await onComplete()
    } catch (err) {
      setAttempt(null)
      setError(`${(err as Error).message} Inicie uma nova tentativa se necessário.`)
    } finally { setBusy(false) }
  }

  async function cancel() {
    if (!attempt) return
    setBusy(true); setCode('')
    try { await apiFetch('/integrations/google/drive/authorization/cancel', { method: 'POST', body: JSON.stringify({ attemptId: attempt.attemptId }) }) }
    catch (err) { setError((err as Error).message) }
    finally { setAttempt(null); setBusy(false) }
  }

  return <section className="mt-4 rounded-xl border border-aletis-verde/25 bg-aletis-verde/5 p-4" aria-label="Renovar autorização do Drive">
    <h3 className="font-semibold text-foreground">Reconectar Google Drive</h3>
    {done && <p role="status" className="mt-2 text-sm text-foreground">Conta autorizada e acesso ao Drive confirmado.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-alerta">{error}</p>}
    {!attempt ? <>
      <p className="mt-1 text-sm text-[var(--text-soft)]">Confirme a conta corporativa no Google para retomar os arquivos e documentos do CRM.</p>
      <button type="button" onClick={start} disabled={busy} className="btn-primary mt-3 rounded-xl px-4 py-2 text-sm disabled:opacity-60">{busy ? 'Preparando autorização…' : 'Iniciar autorização Google'}</button>
    </> : <div className="mt-3 space-y-3 text-sm">
      <p>Abra o Google e entre com <strong>{attempt.account}</strong>. A tela identifica a conexão como Google Cloud SDK, usada pela conta corporativa do ALETIS.</p>
      <a href={attempt.authorizationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex btn-primary rounded-xl px-4 py-2">Autorizar no Google ↗</a>
      <form onSubmit={event => { event.preventDefault(); void complete() }} className="space-y-2">
        <label htmlFor="drive-authorization-code" className="block font-semibold">Código exibido pelo Google</label>
        <input id="drive-authorization-code" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} disabled={busy} required maxLength={4096} className="w-full rounded-lg border border-aletis-borda bg-card px-3 py-2" />
        <p className="text-xs text-[var(--text-soft)]">Cole o código somente neste campo. A tentativa expira em {new Date(attempt.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p>
        <div className="flex gap-2">
          <button type="submit" disabled={busy || !code.trim()} className="btn-primary rounded-xl px-4 py-2 disabled:opacity-60">{busy ? 'Verificando…' : 'Concluir conexão'}</button>
          <button type="button" onClick={cancel} disabled={busy} className="rounded-xl border border-aletis-borda px-4 py-2 disabled:opacity-60">Cancelar</button>
        </div>
      </form>
    </div>}
  </section>
}

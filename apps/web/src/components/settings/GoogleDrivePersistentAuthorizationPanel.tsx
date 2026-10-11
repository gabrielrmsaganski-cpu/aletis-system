import { useState } from 'react'
import { apiFetch, useApi } from '../../hooks/useApi'

interface Configuration {
  oauthConfigured: boolean
  selected: boolean
  ready: boolean
  missingEnv: string[]
  setup: { redirectUri: string | null; clientsUrl: string; consentRequirement: string }
}

export function GoogleDrivePersistentAuthorizationPanel({ active }: { active: boolean }) {
  const configuration = useApi<Configuration | null>('/integrations/google/drive/corporate/status', null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function connect() {
    setBusy(true); setError(null)
    try {
      const result = await apiFetch<{ authorizationUrl: string }>('/integrations/google/drive/corporate/authorization/start', { method: 'POST', body: '{}' })
      const url = new URL(result.authorizationUrl)
      if (url.origin !== 'https://accounts.google.com') throw new Error('Endereço de autorização inválido.')
      window.location.assign(url.href)
    } catch (err) { setError((err as Error).message); setBusy(false) }
  }
  return <section aria-label="Renovação automática do Drive" className="mt-4 rounded-xl border border-aletis-verde/25 bg-aletis-verde/5 p-4">
    <h3 className="font-semibold text-foreground">Conexão com renovação automática</h3>
    <p className="mt-1 text-sm text-[var(--text-soft)]">{active
      ? 'A integração própria do ALETIS está ativa. O sistema renova o acesso ao Drive em segundo plano.'
      : 'Use a integração própria do ALETIS para manter os arquivos, a leitura e as atualizações automáticas do Drive conectados.'}</p>
    {(error || configuration.error) && <p role="alert" className="mt-2 text-sm text-alerta">{error || configuration.error}</p>}
    {configuration.loading && !configuration.data && <p role="status" className="mt-2 text-sm">Conferindo configuração…</p>}
    {configuration.data && !configuration.data.oauthConfigured && <div className="mt-3 rounded-lg bg-white/70 p-3 text-sm">
      <p className="font-semibold">Falta concluir a configuração inicial no Google.</p>
      <p className="mt-1 text-[var(--text-soft)]">O administrador precisa cadastrar o aplicativo ALETIS. Depois, uma autorização da conta corporativa ativa esta conexão.</p>
      <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">Configuração para o administrador</summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>Crie um cliente OAuth do tipo Aplicativo da Web no <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud</a> e habilite as APIs Drive e Docs.</li>
          <li>Cadastre este endereço de retorno: <code className="break-all">{configuration.data.setup.redirectUri || 'Defina GOOGLE_REDIRECT_URI no servidor ALETIS.'}</code></li>
          <li>{configuration.data.setup.consentRequirement}</li>
          <li>Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor ALETIS. Guarde o segredo na configuração protegida do servidor.</li>
        </ol>
      </details>
    </div>}
    {configuration.data?.oauthConfigured && !active && <button type="button" disabled={busy} onClick={() => void connect()} className="btn-primary mt-3 rounded-xl px-4 py-2 text-sm disabled:opacity-60">{busy ? 'Preparando conexão…' : configuration.data.selected ? 'Renovar conexão automática' : 'Ativar renovação automática'}</button>}
    {active && <p role="status" className="mt-3 text-sm font-semibold text-foreground">Renovação automática ativa.</p>}
  </section>
}

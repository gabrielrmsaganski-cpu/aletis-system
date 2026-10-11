export interface GoogleConnectionState {
  status: 'unconfigured' | 'disconnected' | 'connected' | 'expired' | 'revoked' | 'error'
  configured: boolean
  oauthConfigured?: boolean
  connectionMode?: 'oauth' | 'gcloud_drive' | 'corporate_oauth'
}

/** A existência da conta no servidor não confirma que sua autorização funciona. */
export function googleConnectionGuidance(state: GoogleConnectionState | null) {
  if (!state) return { description: 'Consulte a conexão para saber quais serviços Google estão disponíveis.', canAuthorize: false, authorizationLabel: 'Conectar Google Workspace', needsServerAuthorization: false }
  const corporate = state.connectionMode === 'gcloud_drive'
  const connected = state.status === 'connected'
  const canAuthorize = state.oauthConfigured ?? (!corporate && state.configured)
  const needsServerAuthorization = corporate && !connected
  const description = state.connectionMode === 'corporate_oauth'
    ? connected ? 'A integração própria do ALETIS está conectada ao Drive, com renovação automática de acesso.' : 'Confira a integração própria do ALETIS e use a opção de conexão com renovação automática abaixo.'
    : corporate
    ? connected
      ? 'A autorização corporativa do Drive está disponível no servidor. Consulte abaixo os serviços habilitados para esta conta.'
      : state.status === 'expired' || state.status === 'revoked'
        ? 'A autorização do Drive corporativo expirou ou foi revogada. Renove a conexão no servidor ALETIS e atualize o status para retomar os arquivos do CRM.'
        : 'Não foi possível validar a autorização do Drive corporativo. Revise ou renove a conexão no servidor ALETIS e atualize o status para retomar os arquivos do CRM.'
    : state.status === 'unconfigured' || !canAuthorize
      ? 'A conexão Google ainda precisa ser configurada no servidor antes de autorizar uma conta.'
      : connected
        ? 'Conta Google conectada. Os serviços disponíveis abaixo refletem as permissões concedidas.'
        : state.status === 'expired' || state.status === 'revoked'
          ? 'A autorização desta conta precisa ser renovada. Reautorize o Google Workspace para retomar os serviços vinculados.'
          : 'Conecte uma conta Google para vincular arquivos, documentos e agenda ao atendimento dos clientes.'
  return { description, canAuthorize, authorizationLabel: !corporate && ['expired', 'revoked', 'error'].includes(state.status) ? 'Reautorizar Google Workspace' : 'Conectar Google Workspace', needsServerAuthorization }
}

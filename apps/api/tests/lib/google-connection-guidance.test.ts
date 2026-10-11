import { expect, it } from 'vitest'
import { googleConnectionGuidance } from '../../../web/src/components/settings/googleConnectionGuidance'

it('uma conta corporativa configurada com autorização vencida não é apresentada como conectada', () => {
  const view = googleConnectionGuidance({ status: 'expired', connectionMode: 'gcloud_drive', configured: true, oauthConfigured: false })
  expect(view.description).toContain('expirou ou foi revogada')
  expect(view.canAuthorize).toBe(false)
  expect(view.needsServerAuthorization).toBe(true)
})

it('oferece OAuth com configuração explícita sem esconder a necessidade de reparar o Drive corporativo', () => {
  const view = googleConnectionGuidance({ status: 'error', connectionMode: 'gcloud_drive', configured: true, oauthConfigured: true })
  expect(view.canAuthorize).toBe(true)
  expect(view.needsServerAuthorization).toBe(true)
  expect(view.description).toContain('Não foi possível validar')
})

it('não interpreta configured corporativo como OAuth disponível em respostas antigas', () => {
  expect(googleConnectionGuidance({ status: 'error', connectionMode: 'gcloud_drive', configured: true }).canAuthorize).toBe(false)
})

it('orienta reautorização para conta OAuth expirada e configuração para instalação incompleta', () => {
  expect(googleConnectionGuidance({ status: 'expired', configured: true, oauthConfigured: true }).authorizationLabel).toBe('Reautorizar Google Workspace')
  expect(googleConnectionGuidance({ status: 'unconfigured', configured: false }).description).toContain('configurada no servidor')
  expect(googleConnectionGuidance(null).canAuthorize).toBe(false)
})

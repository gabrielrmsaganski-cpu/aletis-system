/**
 * PortalNotificationService
 *
 * Centraliza o envio de avisos para o cliente final pelos canais
 * disponíveis (WhatsApp via integração Meta + e-mail SMTP). Cada
 * função aceita falha silenciosa: se o canal estiver desconfigurado,
 * apenas loga e segue — o portal nunca trava por falha de canal.
 *
 * Hoje:
 *   - WhatsApp via /api/whatsapp/send-text já registrado em
 *     routes/whatsapp.ts (usa WhatsAppCloudService).
 *   - E-mail: provider stubado. Quando SMTP_* estiver configurado,
 *     o envio real é plugado aqui sem alterar callers.
 */

interface NotificacaoCanais {
  whatsapp?: string // E.164 ou só dígitos
  email?: string
  ddi?: string
}

interface NotificacaoResultado {
  whatsapp?: { ok: boolean; erro?: string }
  email?: { ok: boolean; erro?: string }
}

/**
 * Envia magic-link de primeiro acesso ao cliente.
 * URL deve ser absoluta (https://app.aletis.com.br/portal-cliente?magic=...)
 */
export async function enviarMagicLink(params: {
  destinatario: NotificacaoCanais
  nome: string
  url: string
  consultor?: string
}): Promise<NotificacaoResultado> {
  const out: NotificacaoResultado = {}

  if (params.destinatario.whatsapp) {
    out.whatsapp = await enviarWhatsApp(
      params.destinatario.whatsapp,
      [
        `Olá, ${params.nome}! 👋`,
        '',
        'Seu acesso ao Portal ALETIS está pronto. Toque no link abaixo para entrar — sem precisar de senha:',
        '',
        params.url,
        '',
        '🔒 Link válido por 15 minutos. Use só você.',
        params.consultor ? `\n— ${params.consultor}, sua mesa ALETIS` : '',
      ].join('\n')
    )
  }

  if (params.destinatario.email) {
    out.email = await enviarEmail({
      para: params.destinatario.email,
      assunto: 'Seu acesso ao Portal ALETIS',
      corpo: emailMagicTemplate({ nome: params.nome, url: params.url, consultor: params.consultor }),
    })
  }

  return out
}

export async function enviarResetSenha(params: {
  destinatario: NotificacaoCanais
  nome: string
  url: string
}): Promise<NotificacaoResultado> {
  const out: NotificacaoResultado = {}
  if (params.destinatario.whatsapp) {
    out.whatsapp = await enviarWhatsApp(
      params.destinatario.whatsapp,
      [
        `Olá, ${params.nome}!`,
        '',
        'Recebemos seu pedido para redefinir a senha do Portal ALETIS.',
        'Toque no link abaixo para criar uma nova senha (válido por 30min):',
        '',
        params.url,
        '',
        'Se você não pediu isso, ignore esta mensagem — sua conta está segura.',
      ].join('\n')
    )
  }
  if (params.destinatario.email) {
    out.email = await enviarEmail({
      para: params.destinatario.email,
      assunto: 'Redefinição de senha — Portal ALETIS',
      corpo: emailResetTemplate({ nome: params.nome, url: params.url }),
    })
  }
  return out
}

export async function enviarBoasVindas(params: {
  destinatario: NotificacaoCanais
  nome: string
  url: string
  consultor?: string
}): Promise<NotificacaoResultado> {
  return enviarMagicLink(params)
}

export async function notificarMensagemConsultor(params: {
  destinatario: NotificacaoCanais
  nomeCliente: string
  preview: string
  consultor: string
  urlPortal: string
}): Promise<NotificacaoResultado> {
  const out: NotificacaoResultado = {}
  if (params.destinatario.whatsapp) {
    out.whatsapp = await enviarWhatsApp(
      params.destinatario.whatsapp,
      [
        `Olá, ${params.nomeCliente}!`,
        '',
        `${params.consultor} respondeu no Portal ALETIS:`,
        `"${params.preview.slice(0, 140)}${params.preview.length > 140 ? '…' : ''}"`,
        '',
        `Veja a conversa completa: ${params.urlPortal}`,
      ].join('\n')
    )
  }
  return out
}

/* ─── adapters internos ───────────────────────────────────────── */

/**
 * Envia WhatsApp via WhatsApp Cloud API (já configurada em
 * services/whatsapp/WhatsAppCloudService). Retorna falha silenciosa
 * se credenciais Meta não estiverem presentes.
 */
async function enviarWhatsApp(
  destinatario: string,
  texto: string
): Promise<{ ok: boolean; erro?: string }> {
  try {
    const mod = await import('./whatsapp/WhatsAppService.js').catch(() => null)
    if (!mod?.getWhatsAppService) {
      return { ok: false, erro: 'whatsapp_service_indisponivel' }
    }
    const svc = mod.getWhatsAppService()
    if (!svc?.isConfigured?.()) {
      // Modo "dev/staging": loga em vez de falhar.
      // eslint-disable-next-line no-console
      console.log('[Portal] [DRY-RUN WhatsApp]', destinatario, '\n', texto)
      return { ok: true, erro: 'dry_run' }
    }
    await svc.sendText(normalizarTelefone(destinatario), texto)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: e?.message || 'erro_desconhecido' }
  }
}

/**
 * Envia e-mail via SMTP. Hoje em dry-run — assim que SMTP_HOST estiver
 * configurado, basta plugar nodemailer aqui e chamadores não mudam.
 */
async function enviarEmail(params: {
  para: string
  assunto: string
  corpo: string
}): Promise<{ ok: boolean; erro?: string }> {
  if (!process.env.SMTP_HOST) {
    // eslint-disable-next-line no-console
    console.log('[Portal] [DRY-RUN E-mail]', params.para, '|', params.assunto)
    return { ok: true, erro: 'dry_run' }
  }
  // Espaço reservado para plugin SMTP real (nodemailer/etc).
  // eslint-disable-next-line no-console
  console.log('[Portal] SMTP configurado mas adapter ainda não foi plugado.')
  return { ok: false, erro: 'smtp_adapter_nao_plugado' }
}

function normalizarTelefone(input: string): string {
  const d = input.replace(/\D/g, '')
  if (d.startsWith('55')) return d
  if (d.length === 11 || d.length === 10) return `55${d}`
  return d
}

/* ─── templates HTML simples ─────────────────────────────────── */

function emailMagicTemplate(p: { nome: string; url: string; consultor?: string }): string {
  return `<!doctype html><html><body style="font-family:Verdana,sans-serif;background:#ede9d9;padding:40px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d9d3bc">
    <div style="background:#17251b;padding:24px;text-align:center;color:#ede9d9">
      <h1 style="margin:0;font-size:22px;letter-spacing:2px">ALETIS</h1>
      <p style="margin:6px 0 0;font-size:11px;opacity:0.7;letter-spacing:1px">FINANÇAS ESTRATÉGICAS &amp; AGROBUSINESS</p>
    </div>
    <div style="padding:32px">
      <h2 style="color:#17251b;margin:0 0 16px">Olá, ${escape(p.nome)}!</h2>
      <p style="color:#465b4a;line-height:1.6">Seu acesso ao Portal ALETIS está pronto. Toque no botão abaixo para entrar — sem precisar de senha.</p>
      <div style="text-align:center;margin:28px 0">
        <a href="${p.url}" style="display:inline-block;background:#cb9d52;color:#17251b;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold;letter-spacing:1px">ENTRAR NO PORTAL</a>
      </div>
      <p style="color:#6b7d6f;font-size:13px">🔒 Link válido por 15 minutos. Se não foi você, ignore este e-mail.</p>
      ${p.consultor ? `<p style="color:#6b7d6f;font-size:13px;margin-top:24px">— ${escape(p.consultor)}, sua mesa ALETIS</p>` : ''}
    </div>
  </div>
  </body></html>`
}

function emailResetTemplate(p: { nome: string; url: string }): string {
  return `<!doctype html><html><body style="font-family:Verdana,sans-serif;background:#ede9d9;padding:40px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d9d3bc">
    <div style="background:#17251b;padding:24px;text-align:center;color:#ede9d9">
      <h1 style="margin:0;font-size:22px;letter-spacing:2px">ALETIS</h1>
    </div>
    <div style="padding:32px">
      <h2 style="color:#17251b;margin:0 0 16px">Redefinir senha</h2>
      <p style="color:#465b4a;line-height:1.6">Olá, ${escape(p.nome)}. Recebemos seu pedido para redefinir a senha do Portal ALETIS. Toque no botão abaixo para criar uma nova senha:</p>
      <div style="text-align:center;margin:28px 0">
        <a href="${p.url}" style="display:inline-block;background:#cb9d52;color:#17251b;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold;letter-spacing:1px">REDEFINIR SENHA</a>
      </div>
      <p style="color:#6b7d6f;font-size:13px">Link válido por 30 minutos. Se você não pediu isso, ignore — sua conta segue intacta.</p>
    </div>
  </div>
  </body></html>`
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
}

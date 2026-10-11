import { NextResponse } from 'next/server'
import { appendFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

type Payload = {
  nome?: string
  email?: string
  telefone?: string
  segmento?: string
  interesse?: string
  cidade?: string
  uf?: string
  tamanho?: string
  mensagem?: string
  consent?: boolean
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Storage local de leads — fallback de produção quando não há
 * webhook/CRM configurado. Append-only em JSONL para fácil parsing.
 * Em produção (Vercel/edge), substituir por Resend/Postmark/webhook
 * via env LEAD_WEBHOOK_URL ou LEAD_EMAIL_TO.
 */
const LEAD_DIR = process.env.LEAD_STORAGE_DIR || join(process.cwd(), 'storage', 'leads')

async function persistLead(lead: Record<string, unknown>): Promise<{ ok: boolean; mode: string }> {
  // 1. Webhook externo (CRM, Slack, etc.)
  const webhook = process.env.LEAD_WEBHOOK_URL?.trim()
  if (webhook) {
    try {
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
        signal: AbortSignal.timeout(10_000),
      })
      if (r.ok) return { ok: true, mode: 'webhook' }
    } catch (e) {
      console.warn('[contato] webhook falhou, caindo para storage local:', e)
    }
  }

  // 2. Resend (e-mail transacional via REST API simples)
  const resendKey = process.env.RESEND_API_KEY?.trim()
  const leadEmail = process.env.LEAD_EMAIL_TO?.trim()
  if (resendKey && leadEmail) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: process.env.LEAD_EMAIL_FROM || 'leads@aletis.com.br',
          to: leadEmail,
          subject: `Novo lead — ${lead.nome ?? 'sem nome'} (${lead.segmento ?? 'sem segmento'})`,
          html: `<pre style="font-family:monospace">${JSON.stringify(lead, null, 2)}</pre>`,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (r.ok) return { ok: true, mode: 'resend' }
    } catch (e) {
      console.warn('[contato] resend falhou, caindo para storage local:', e)
    }
  }

  // 3. Registro local; o contato só é confirmado depois da gravação.
  try {
    if (!existsSync(LEAD_DIR)) await mkdir(LEAD_DIR, { recursive: true })
    const file = join(LEAD_DIR, `${new Date().toISOString().slice(0, 7)}.jsonl`)
    await appendFile(file, JSON.stringify(lead) + '\n', 'utf-8')
    return { ok: true, mode: 'jsonl' }
  } catch (e) {
    console.error('[contato] storage local falhou:', e)
    return { ok: false, mode: 'none' }
  }
}

export async function POST(req: Request) {
  let body: Payload
  try {
    body = (await req.json()) as Payload
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const nome = (body.nome ?? '').trim()
  const email = (body.email ?? '').trim()
  const telefone = (body.telefone ?? '').trim()
  const consent = Boolean(body.consent)

  if (nome.length < 2) {
    return NextResponse.json({ error: 'Nome inválido' }, { status: 422 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 422 })
  }
  if (telefone.length < 8) {
    return NextResponse.json({ error: 'Telefone inválido' }, { status: 422 })
  }
  if (!consent) {
    return NextResponse.json({ error: 'Consentimento LGPD obrigatório' }, { status: 422 })
  }

  const receivedAt = new Date().toISOString()
  const lead = {
    nome,
    email,
    telefone,
    segmento: body.segmento,
    interesse: body.interesse,
    cidade: body.cidade,
    uf: body.uf,
    tamanho: body.tamanho,
    mensagem: body.mensagem?.slice(0, 2000),
    consent,
    receivedAt,
    userAgent: req.headers.get('user-agent') || undefined,
    referer: req.headers.get('referer') || undefined,
  }

  const out = await persistLead(lead)
  if (!out.ok) {
    return NextResponse.json({
      success: false,
      error: 'Não foi possível registrar seu contato. Tente novamente.',
    }, { status: 503 })
  }
  console.info('[contato] novo lead persistido', {
    nome, email, segmento: body.segmento, interesse: body.interesse,
    receivedAt, persistido: out.mode,
  })

  return NextResponse.json({
    success: true,
    receivedAt,
    persistido: out.mode,
  }, { status: 200 })
}

export const dynamic = 'force-dynamic'

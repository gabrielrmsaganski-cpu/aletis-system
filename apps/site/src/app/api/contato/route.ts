import { NextResponse } from 'next/server'

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

  // Intencionalmente sem persistência: endpoint pronto para integração
  // futura com CRM interno da ALETIS ou serviço de e-mail transacional.
  console.info('[contato] novo lead recebido', {
    nome,
    email,
    segmento: body.segmento,
    interesse: body.interesse,
    cidade: body.cidade,
    uf: body.uf,
    receivedAt,
  })

  return NextResponse.json({ success: true, receivedAt }, { status: 200 })
}

export const dynamic = 'force-dynamic'

// ============================================================
// ALETIS — Wave 9 INTEGRATE smoke test
// End-to-end: upload de documento -> chat com attachment ->
// briefing + memory tools -> geração real de PDF.
// ============================================================

const BASE = process.env.ALETIS_API_URL ?? 'http://localhost:3001'

function log(title: string, payload: unknown) {
  console.log(`\n=== ${title} ===`)
  console.log(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2))
}

function buildSmokeTxt(): { buf: Buffer; mime: string; name: string } {
  const txt = [
    'Extrato bancário — Paulo Luciano / Fertiflora',
    '',
    'Credor: Sicoob Credialto',
    'Saldo devedor: R$ 1.850.000,00',
    'Vencimento: 2026-06-30',
    'Linha: Pronamp Custeio 2024/25',
    'Data de referência: 2026-04-22',
  ].join('\n')
  return { buf: Buffer.from(txt, 'utf8'), mime: 'text/plain', name: 'extrato-sicoob.txt' }
}

async function main() {
  // 1. Cria sessão para a smoke
  const sessRes = await fetch(`${BASE}/api/alix/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'smoke-wave9-integrate' }),
  })
  const sessJson = await sessRes.json() as any
  const sessionId: string = sessJson?.data?.id
  if (!sessionId) throw new Error('Falha ao criar sessão')
  log('Sessão criada', { sessionId })

  // 2. Upload de documento (texto plano — evita dependência de pdf-parse no smoke)
  const { buf, mime, name } = buildSmokeTxt()
  const form = new FormData()
  form.append('file', new Blob([buf], { type: mime }), name)
  const upRes = await fetch(`${BASE}/api/alix/documents/upload?sessionId=${sessionId}`, {
    method: 'POST',
    body: form,
  })
  const upJson = await upRes.json() as any
  const docId: string | undefined = upJson?.data?.id ?? upJson?.id ?? upJson?.document?.id
  log('Upload', upJson)
  if (!docId) throw new Error('Upload não retornou docId')

  // 3. Chat com attachment (exercita multimodal path)
  const chatRes = await fetch(`${BASE}/api/alix/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      clienteId: 'paulo-luciano',
      attachments: [docId],
      message: 'Use a tool listar_documentos_sessao para confirmar que você recebeu o anexo; depois a tool ler_documento_sessao para ler o conteúdo dele. Responda em 3 linhas: (1) nome do arquivo, (2) saldo devedor se aparecer, (3) vencimento.',
    }),
  })
  const chatJson = await chatRes.json() as any
  log('Chat com anexo', chatJson?.data)

  // 4. Briefing cliente via API direta
  const briefRes = await fetch(`${BASE}/api/alix/briefing/paulo-luciano`)
  const briefJson = await briefRes.json() as any
  log('Briefing via rota', briefJson?.data?.sugestaoPrimeiraAcao ?? briefJson)

  // 5. Chat pedindo geração de proposta REAL
  const genRes = await fetch(`${BASE}/api/alix/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      clienteId: 'paulo-luciano',
      message: 'Gere uma proposta de reestruturação: cliente Paulo Luciano (clienteId paulo-luciano), credor Sicoob, saldo devedor R$ 1.850.000, 48 parcelas, taxa 0.85% ao mês, 6 meses de carência. Use a tool gerar_proposta_reestruturacao e me diga o downloadUrl.',
    }),
  })
  const genJson = await genRes.json() as any
  log('Chat geração de proposta', genJson?.data?.reply)

  // 6. Lê memória do cliente
  const memRes = await fetch(`${BASE}/api/alix/memory/paulo-luciano`)
  const memJson = await memRes.json() as any
  log('Memória paulo-luciano (existe após smoke prévia)', typeof memJson?.data === 'string' ? memJson.data.slice(0, 300) : memJson)

  console.log('\n[smoke-wave9-integrate] OK.')
}

main().catch((err) => {
  console.error('[smoke-wave9-integrate] FALHOU:', err)
  process.exit(1)
})

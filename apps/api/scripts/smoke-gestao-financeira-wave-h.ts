// ============================================================
// Smoke E2E Wave H — Carteira + Backup/Restore + Comentarios +
// Changelog + Marketplace + SSE
//
// Pre-requisito: API rodando (PORT=3011 por padrao)
// Uso: pnpm tsx scripts/smoke-gestao-financeira-wave-h.ts
// ============================================================

import { setTimeout as sleep } from 'node:timers/promises'
// EventSource em Node ≥22.10 está global atrás do flag --experimental-eventsource.
// Para o smoke pegar SSE de verdade, rode com:
//   node --experimental-eventsource ... ou exporte NODE_OPTIONS='--experimental-eventsource'.
// Sem flag, pulamos o subteste SSE (mas o endpoint é exercitado pelo POST seguinte).
declare const EventSource: any
const ES: any = (globalThis as any).EventSource

const BASE = process.env.ALETIS_API_URL ?? 'http://localhost:3011'
const TS = Date.now().toString().slice(-6)

interface Envelope<T> { success: boolean; data?: T; error?: any }

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as any ?? {}) }
  if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const r = await fetch(`${BASE}${path}`, { ...init, headers })
  const txt = await r.text()
  if (!txt) {
    if (!r.ok) throw new Error(`HTTP ${r.status} (empty body)`)
    return undefined as any
  }
  let env: Envelope<T>
  try { env = JSON.parse(txt) } catch { throw new Error(`HTTP ${r.status} non-json: ${txt.slice(0, 200)}`) }
  if (!env.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(env.error ?? env)}`)
  return env.data as T
}

function ok(label: string, detail = '') {
  console.log(`  ${'\x1b[32m✓\x1b[0m'} ${label}${detail ? ' — ' + detail : ''}`)
}
function fail(label: string, e: unknown): never {
  console.error(`  ${'\x1b[31m✗\x1b[0m'} ${label}: ${(e as Error).message ?? e}`)
  process.exit(1)
}

async function main() {
  console.log('\n\x1b[1mSMOKE Wave H — Gestao Financeira ALETIS\x1b[0m')
  console.log(`Base: ${BASE}\n`)

  // ── 1. Carteira do consultor ──────────────────────────────
  console.log('\x1b[36m◆ Carteira do consultor\x1b[0m')
  const cart = await api<any>('/api/gestao-financeira/carteira').catch((e) => fail('GET /carteira', e))
  ok('GET /carteira', `${cart.totalGrupos} grupos | EBITDA total R$ ${Number(cart.agregado.ebitdaTotal).toFixed(0)}`)
  if (!cart.distribuicao || typeof cart.distribuicao.saudavel !== 'number') fail('distribuicao mal-formada', new Error('schema'))
  ok('distribuicao saudavel/atencao/critico', `${cart.distribuicao.saudavel}/${cart.distribuicao.atencao}/${cart.distribuicao.critico}`)
  ok('rankings', `melhor margem: ${cart.rankings.melhorMargem?.nomeGrupo ?? '—'}`)

  if (cart.totalGrupos === 0) {
    console.log('\n\x1b[33mAVISO: nenhum grupo na base. Crie pelo menos um grupo para testes completos.\x1b[0m')
    process.exit(0)
  }
  const grupoId: string = cart.grupos[0].grupoId
  console.log(`  uso grupo: ${grupoId}\n`)

  // ── 2. Comentarios ────────────────────────────────────────
  console.log('\x1b[36m◆ Comentarios colaborativos\x1b[0m')
  const r1 = await api<{ comentario: any }>(`/api/gestao-financeira/grupos/${grupoId}/comentarios`, {
    method: 'POST',
    body: JSON.stringify({ entidade: 'grupo', conteudo: `smoke-h ${TS} - thread`, autor: 'smoke', autorNome: 'Smoke Bot' }),
  }).catch((e) => fail('POST comentario', e))
  ok('POST comentario raiz', `id=${r1.comentario.id}`)

  const r2 = await api<{ comentario: any }>(`/api/gestao-financeira/grupos/${grupoId}/comentarios`, {
    method: 'POST',
    body: JSON.stringify({ entidade: 'grupo', conteudo: 'smoke reply', parentId: r1.comentario.id, autor: 'smoke', autorNome: 'Smoke Bot' }),
  }).catch((e) => fail('POST reply', e))
  ok('POST reply', `parentId=${r2.comentario.parentId}`)

  const threads = await api<{ threads: any[] }>(`/api/gestao-financeira/grupos/${grupoId}/comentarios`).catch((e) => fail('GET threads', e))
  const thread = threads.threads.find((t) => t.id === r1.comentario.id)
  if (!thread) fail('thread nao encontrada', new Error('not found'))
  if (thread.respostas.length < 1) fail('respostas vazias', new Error('reply missing'))
  ok('GET threads', `${threads.threads.length} threads, reply OK`)

  await api(`/api/gestao-financeira/comentarios/${r1.comentario.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ resolvido: true }),
  })
  ok('PATCH resolver thread')

  await api(`/api/gestao-financeira/comentarios/${r1.comentario.id}`, { method: 'DELETE' })
  ok('DELETE thread (cascata em respostas)')

  // ── 3. Changelog ──────────────────────────────────────────
  console.log('\n\x1b[36m◆ Changelog\x1b[0m')
  const cl = await api<{ mudancas: any[] }>(`/api/gestao-financeira/grupos/${grupoId}/changelog`).catch((e) => fail('GET changelog', e))
  ok('GET /changelog', `${cl.mudancas.length} mudancas`)
  const stats = await api<any>(`/api/gestao-financeira/grupos/${grupoId}/changelog/stats`).catch((e) => fail('GET changelog stats', e))
  ok('GET /changelog/stats', `total=${stats.total} entidades=${Object.keys(stats.porEntidade ?? {}).length}`)

  // ── 4. SSE tempo real ─────────────────────────────────────
  console.log('\n\x1b[36m◆ SSE tempo real\x1b[0m')
  let sseChangelog = 0
  let sseComentario = 0
  if (!ES) {
    console.log('  \x1b[33m⊘ EventSource indisponível neste runtime — pulando subteste SSE\x1b[0m')
  }
  const es: any = ES ? new ES(`${BASE}/api/gestao-financeira/grupos/${grupoId}/events/stream`) : null
  if (es) {
    es.addEventListener('changelog', () => sseChangelog++)
    es.addEventListener('comentario', () => sseComentario++)
    es.addEventListener('open', () => ok('SSE conectado'))
    await new Promise((r) => setTimeout(r, 500))
  }

  // dispara um evento para validar
  const r3 = await api<{ comentario: any }>(`/api/gestao-financeira/grupos/${grupoId}/comentarios`, {
    method: 'POST',
    body: JSON.stringify({ entidade: 'grupo', conteudo: `sse-test ${TS}`, autor: 'smoke' }),
  })
  if (es) {
    await sleep(1200)
    if (sseComentario < 1) fail('SSE nao recebeu evento comentario', new Error('no event'))
    ok('SSE comentario received', `${sseComentario}×`)
    es.close()
  }
  // cleanup
  await api(`/api/gestao-financeira/comentarios/${r3.comentario.id}`, { method: 'DELETE' })
  void sseChangelog

  // ── 5. Backup / Restore ───────────────────────────────────
  console.log('\n\x1b[36m◆ Backup / Restore\x1b[0m')
  // /backup retorna bundle direto (sem envelope) — attachment download
  const bResp = await fetch(`${BASE}/api/gestao-financeira/grupos/${grupoId}/backup`)
  if (!bResp.ok) fail('GET backup', new Error(`HTTP ${bResp.status}`))
  const bundle: any = await bResp.json()
  if (!bundle.grupo || !Array.isArray(bundle.culturas)) fail('backup incompleto', new Error('schema'))
  ok('GET /backup', `culturas=${bundle.culturas.length} contratos=${bundle.contratos?.length ?? 0} fazendas=${bundle.fazendas?.length ?? 0}`)

  // Restore como NOVO grupo no mesmo cliente (não toca no original)
  const restored = await api<any>(`/api/gestao-financeira/restore`, {
    method: 'POST',
    body: JSON.stringify({
      bundle,
      clienteId: bundle.grupo.clienteId,
      novoNomeGrupo: `${bundle.grupo.nomeGrupo} — smoke restore ${TS}`,
    }),
  }).catch((e) => fail('POST restore', e))
  const novoId = restored.grupoId
  ok('POST /restore (novo grupo)', `id=${novoId} contadores=${JSON.stringify(restored.contadores ?? {})}`)
  // cleanup do grupo restaurado para não poluir
  if (novoId) {
    await api(`/api/gestao-financeira/grupos/${novoId}`, { method: 'DELETE' }).catch(() => {})
    ok('DELETE grupo restore (cleanup)')
  }

  // ── 6. Marketplace ────────────────────────────────────────
  console.log('\n\x1b[36m◆ Marketplace\x1b[0m')
  const mp = await api<{ templates: any[] }>(`/api/gestao-financeira/marketplace/templates`).catch((e) => fail('GET marketplace', e))
  ok('GET /marketplace/templates', `${mp.templates.length} templates`)

  const slug = `smoke-h-${TS}`
  await api(`/api/gestao-financeira/grupos/${grupoId}/marketplace/capturar`, {
    method: 'POST',
    body: JSON.stringify({
      slug,
      rotulo: `Smoke H ${TS}`,
      descricao: 'template criado pelo smoke E2E',
      categoria: 'misto',
      emoji: '🧪',
      visibilidade: 'private',
      consultorId: 'smoke-consultor',
    }),
  })
  ok('POST capturar template', `slug=${slug}`)

  await api(`/api/gestao-financeira/marketplace/templates/${slug}?consultorId=smoke-consultor`, { method: 'DELETE' })
  ok('DELETE template')

  console.log('\n\x1b[1;32m✓ SMOKE Wave H — OK \x1b[0m\n')
}

main().catch((e) => {
  console.error('\n\x1b[31mFATAL:\x1b[0m', e)
  process.exit(1)
})

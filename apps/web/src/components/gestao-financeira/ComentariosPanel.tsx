// ============================================================
// ComentariosPanel — threads colaborativas no grupo
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { MessageSquare, Send, CheckCircle2, Trash2, RotateCw, Reply } from 'lucide-react'
import { Skeleton as UISkeleton, SkeletonList } from '../ui'

interface Comentario {
  id: string
  grupoId: string
  entidade: string
  entidadeId?: string | null
  conteudo: string
  autor?: string | null
  autorNome?: string | null
  parentId?: string | null
  resolvido: boolean
  criadoEm: string
}

interface Thread extends Comentario {
  respostas: Comentario[]
}

interface Props {
  grupoId: string
}

export default function ComentariosPanel({ grupoId }: Props) {
  const [threads, setThreads] = useState<Thread[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [novoConteudo, setNovoConteudo] = useState('')
  const [novoEntidade, setNovoEntidade] = useState('grupo')
  const [respondendoA, setRespondendoA] = useState<string | null>(null)
  const [respostaTexto, setRespostaTexto] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch<{ threads: Thread[] }>(`/gestao-financeira/grupos/${grupoId}/comentarios`)
      setThreads(r.threads)
    } finally {
      setLoading(false)
    }
  }, [grupoId])

  useEffect(() => { load() }, [load])

  // SSE
  useEffect(() => {
    const es = new EventSource(`/api/gestao-financeira/grupos/${grupoId}/events/stream`)
    es.addEventListener('comentario', () => load())
    return () => es.close()
  }, [grupoId, load])

  async function criar(parentId?: string, conteudo?: string) {
    const c = conteudo ?? novoConteudo
    if (!c.trim()) return
    await apiFetch(`/gestao-financeira/grupos/${grupoId}/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entidade: novoEntidade,
        conteudo: c,
        parentId: parentId ?? null,
        autor: 'consultor-001',
        autorNome: 'Christian',
      }),
    })
    if (parentId) {
      setRespondendoA(null)
      setRespostaTexto('')
    } else {
      setNovoConteudo('')
    }
    await load()
  }

  async function resolver(id: string, resolvido: boolean) {
    await apiFetch(`/gestao-financeira/comentarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolvido }),
    })
    await load()
  }

  async function deletar(id: string) {
    if (!confirm('Excluir este comentário e suas respostas?')) return
    await apiFetch(`/gestao-financeira/comentarios/${id}`, { method: 'DELETE' })
    await load()
  }

  if (!threads) return <Skeleton />

  return (
    <div className="space-y-4">
      <div className="card-premium p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-foreground" />
            <div>
              <h3 className="text-sm font-display font-semibold text-foreground">Comentários colaborativos</h3>
              <p className="text-[11px] text-muted-foreground">
                {threads.length} threads · {threads.reduce((a, t) => a + 1 + t.respostas.length, 0)} mensagens · {threads.filter((t) => !t.resolvido).length} não-resolvidas
              </p>
            </div>
          </div>
          <button onClick={load} disabled={loading} className="px-2 py-1 rounded-lg text-muted-foreground hover:bg-aletis-grafite-escuro/5">
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="rounded-lg bg-aletis-cream/40 border border-aletis-grafite-claro/15 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={novoEntidade}
              onChange={(e) => setNovoEntidade(e.target.value)}
              className="px-2 py-1 text-[11px] rounded border border-aletis-grafite-claro/20"
            >
              <option value="grupo">📌 Grupo (geral)</option>
              <option value="cultura">🌾 Cultura</option>
              <option value="contrato">📋 Contrato</option>
              <option value="fazenda">🏞️ Fazenda</option>
              <option value="garantia">🛡️ Garantia</option>
              <option value="demanda">📨 Demanda</option>
              <option value="custo">💰 Custo</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={novoConteudo}
              onChange={(e) => setNovoConteudo(e.target.value)}
              rows={2}
              placeholder="Escreva um comentário..."
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-aletis-grafite-claro/20 resize-none"
            />
            <button
              onClick={() => criar()}
              disabled={!novoConteudo.trim()}
              className="px-3 py-2 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde-escuro disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {threads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-aletis-grafite-claro/30 p-8 text-center bg-aletis-cream/20">
            <MessageSquare className="w-6 h-6 text-aletis-grafite-claro/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Nenhum comentário ainda. Comece a colaboração acima.</p>
          </div>
        ) : (
          threads.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              respondendoA={respondendoA}
              respostaTexto={respostaTexto}
              setRespondendoA={setRespondendoA}
              setRespostaTexto={setRespostaTexto}
              onReply={(id, txt) => criar(id, txt)}
              onResolve={resolver}
              onDelete={deletar}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ThreadCard({
  thread, respondendoA, respostaTexto, setRespondendoA, setRespostaTexto, onReply, onResolve, onDelete,
}: {
  thread: Thread
  respondendoA: string | null
  respostaTexto: string
  setRespondendoA: (s: string | null) => void
  setRespostaTexto: (s: string) => void
  onReply: (id: string, txt: string) => void
  onResolve: (id: string, r: boolean) => void
  onDelete: (id: string) => void
}) {
  const isReplying = respondendoA === thread.id

  return (
    <div className={`card-premium p-3 ${thread.resolvido ? 'opacity-60' : ''}`}>
      <CommentRow c={thread} onResolve={onResolve} onDelete={onDelete} />

      {thread.respostas.length > 0 && (
        <div className="ml-8 mt-2 space-y-2 border-l-2 border-aletis-grafite-claro/10 pl-3">
          {thread.respostas.map((r) => (
            <CommentRow key={r.id} c={r} onResolve={onResolve} onDelete={onDelete} />
          ))}
        </div>
      )}

      <div className="ml-8 mt-2">
        {isReplying ? (
          <div className="flex items-end gap-2">
            <textarea
              value={respostaTexto}
              onChange={(e) => setRespostaTexto(e.target.value)}
              rows={2}
              placeholder="Responder..."
              className="flex-1 px-2 py-1.5 text-xs rounded border border-aletis-grafite-claro/20 resize-none"
              autoFocus
            />
            <button
              onClick={() => { onReply(thread.id, respostaTexto); }}
              disabled={!respostaTexto.trim()}
              className="px-2 py-1.5 rounded bg-aletis-verde text-white text-[11px] font-semibold disabled:opacity-50"
            >
              <Send className="w-3 h-3" />
            </button>
            <button
              onClick={() => { setRespondendoA(null); setRespostaTexto('') }}
              className="px-2 py-1.5 rounded text-[11px] text-muted-foreground hover:bg-aletis-grafite-escuro/5"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setRespondendoA(thread.id)}
            className="text-[11px] text-foreground hover:underline inline-flex items-center gap-1"
          >
            <Reply className="w-3 h-3" /> Responder
          </button>
        )}
      </div>
    </div>
  )
}

function CommentRow({ c, onResolve, onDelete }: { c: Comentario; onResolve: (id: string, r: boolean) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-full bg-aletis-verde/10 text-foreground flex items-center justify-center text-[11px] font-bold flex-shrink-0">
        {(c.autorNome ?? c.autor ?? '?').slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-body font-semibold">{c.autorNome ?? c.autor ?? 'Anônimo'}</span>
          <span className="text-[11px] font-mono text-muted-foreground">📌 {c.entidade}</span>
          {c.resolvido && <span className="text-[11px] text-foreground font-semibold">✓ resolvido</span>}
          <span className="text-[11px] text-muted-foreground ml-auto">{new Date(c.criadoEm).toLocaleString('pt-BR')}</span>
        </div>
        <p className="text-xs font-body text-foreground mt-0.5 whitespace-pre-wrap">{c.conteudo}</p>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => onResolve(c.id, !c.resolvido)}
            className="text-[11px] text-muted-foreground hover:text-aletis-verde inline-flex items-center gap-0.5"
          >
            <CheckCircle2 className="w-3 h-3" /> {c.resolvido ? 'Reabrir' : 'Resolver'}
          </button>
          <button
            onClick={() => onDelete(c.id)}
            className="text-[11px] text-muted-foreground hover:text-red-600 inline-flex items-center gap-0.5"
          >
            <Trash2 className="w-3 h-3" /> Excluir
          </button>
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <UISkeleton className="h-32 rounded-xl" />
      <SkeletonList count={3} itemHeight="h-20" />
    </div>
  )
}

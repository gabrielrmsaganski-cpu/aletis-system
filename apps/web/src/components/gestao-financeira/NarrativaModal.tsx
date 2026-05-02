// ============================================================
// NarrativaModal — invoca o gerador LLM de narrativa do
// diagnóstico (Claude Foundry) e exibe texto pronto para copiar.
// ============================================================
import { useState } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { X, Sparkles, Copy, Check, Loader2 } from 'lucide-react'

interface NarrativaResult {
  texto: string
  secoes: Record<string, string>
  modelo: string
  tokensIn: number
  tokensOut: number
  geradoEm: string
}

interface Props {
  grupoId: string
  onClose: () => void
}

const ESTILOS = [
  { id: 'tecnico', rotulo: '🔬 Técnico', desc: 'Linguagem de finanças/agro, indicadores precisos' },
  { id: 'comercial', rotulo: '💼 Comercial', desc: 'Persuasivo, foco em diferencial competitivo' },
  { id: 'banco', rotulo: '🏦 Banco', desc: '5 Cs do Crédito, factual, mesa de crédito' },
  { id: 'cliente', rotulo: '💬 Cliente', desc: 'Didático, amigável, explica cada número' },
]

export default function NarrativaModal({ grupoId, onClose }: Props) {
  const [estilo, setEstilo] = useState('tecnico')
  const [result, setResult] = useState<NarrativaResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function gerar() {
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch<NarrativaResult>(`/gestao-financeira/grupos/${grupoId}/narrativa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estilo }),
      })
      setResult(r)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  async function copiar(texto: string, tag: string) {
    await navigator.clipboard.writeText(texto)
    setCopied(tag)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-aletis-verde" />
            <div>
              <p className="text-[10px] font-mono text-aletis-verde uppercase font-semibold">🤖 ALETÉIA · Narrativa LLM</p>
              <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">Análise textual do diagnóstico</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center">
            <X className="w-5 h-5 text-aletis-grafite-claro" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!result && (
            <>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-aletis-grafite-claro font-semibold mb-2">Escolha o estilo de escrita:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {ESTILOS.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setEstilo(e.id)}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${
                        estilo === e.id
                          ? 'border-aletis-verde bg-aletis-verde/5'
                          : 'border-aletis-grafite-claro/15 hover:border-aletis-verde/40'
                      }`}
                    >
                      <p className="text-sm font-display font-semibold">{e.rotulo}</p>
                      <p className="text-[11px] text-aletis-grafite-claro mt-0.5">{e.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>}

              <div className="text-[11px] text-aletis-grafite-claro bg-aletis-cream/30 rounded-lg p-3">
                ⏱ Geração leva ~10-15 segundos. Custo aproximado: $0.02 por requisição (Sonnet 4.6).
              </div>
            </>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-aletis-grafite-claro">
                  Modelo: <strong>{result.modelo}</strong> · Tokens: in {result.tokensIn} / out {result.tokensOut}
                </p>
                <button
                  type="button"
                  onClick={() => copiar(result.texto, 'all')}
                  className="px-2 py-1 rounded-lg text-[10px] font-body bg-aletis-verde/10 text-aletis-verde hover:bg-aletis-verde/20 inline-flex items-center gap-1"
                >
                  {copied === 'all' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  Copiar tudo
                </button>
              </div>

              {Object.keys(result.secoes).length > 0 ? (
                Object.entries(result.secoes).map(([sec, texto]) => (
                  <section key={sec} className="card-premium p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-mono uppercase tracking-wider text-aletis-verde font-semibold">
                        {sec.toUpperCase()}
                      </h3>
                      <button
                        type="button"
                        onClick={() => copiar(texto, sec)}
                        className="px-2 py-0.5 rounded text-[10px] hover:bg-aletis-grafite-escuro/5 inline-flex items-center gap-1"
                      >
                        {copied === sec ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                    <p className="text-xs font-body text-aletis-grafite-escuro leading-relaxed whitespace-pre-wrap">{texto}</p>
                  </section>
                ))
              ) : (
                <pre className="text-xs font-body text-aletis-grafite-escuro whitespace-pre-wrap leading-relaxed bg-aletis-cream/30 rounded-lg p-4">
                  {result.texto}
                </pre>
              )}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-aletis-grafite-claro/15 bg-aletis-cream/20 flex items-center justify-end gap-2">
          {result ? (
            <>
              <button onClick={() => setResult(null)} className="px-3 py-1.5 rounded-lg text-xs border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5">
                Gerar com outro estilo
              </button>
              <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs bg-aletis-verde text-white font-semibold hover:bg-aletis-verde-escuro">
                Fechar
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5">
                Cancelar
              </button>
              <button
                onClick={gerar}
                disabled={loading}
                className="px-4 py-1.5 rounded-lg text-xs bg-aletis-verde text-white font-semibold hover:bg-aletis-verde-escuro inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {loading ? 'Gerando…' : 'Gerar narrativa'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

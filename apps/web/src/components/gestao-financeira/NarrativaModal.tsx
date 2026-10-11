// ============================================================
// NarrativaModal — invoca o gerador LLM de narrativa do
// diagnóstico por IA e exibe texto pronto para copiar.
// ============================================================
import { useState } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { Sparkles, Copy, Check, Loader2 } from 'lucide-react'
import AppDialog from '../ui/AppDialog'

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

  const footer = result ? (
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
  )

  return (
    <AppDialog
      title="Análise textual do diagnóstico"
      eyebrow="ALIX · Narrativa"
      icon={<Sparkles className="h-5 w-5" />}
      onClose={onClose}
      size="xl"
      bodyClassName="space-y-4"
      footer={<div className="flex items-center justify-end gap-2">{footer}</div>}
    >
          {!result && (
            <>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Escolha o estilo de escrita:</p>
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
                      <p className="text-[11px] text-muted-foreground mt-0.5">{e.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>}

              <div className="text-[11px] text-muted-foreground bg-aletis-cream/30 rounded-lg p-3">
                Geração leva aproximadamente 10-15 segundos.
              </div>
            </>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Processamento concluído · Tokens: in {result.tokensIn} / out {result.tokensOut}
                </p>
                <button
                  type="button"
                  onClick={() => copiar(result.texto, 'all')}
                  className="px-2 py-1 rounded-lg text-[11px] font-body bg-aletis-verde/10 text-foreground hover:bg-aletis-verde/20 inline-flex items-center gap-1"
                >
                  {copied === 'all' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  Copiar tudo
                </button>
              </div>

              {Object.keys(result.secoes).length > 0 ? (
                Object.entries(result.secoes).map(([sec, texto]) => (
                  <section key={sec} className="card-premium p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-mono uppercase tracking-wider text-foreground font-semibold">
                        {sec.toUpperCase()}
                      </h3>
                      <button
                        type="button"
                        onClick={() => copiar(texto, sec)}
                        className="px-2 py-0.5 rounded text-[11px] hover:bg-aletis-grafite-escuro/5 inline-flex items-center gap-1"
                      >
                        {copied === sec ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                    <p className="text-xs font-body text-foreground leading-relaxed whitespace-pre-wrap">{texto}</p>
                  </section>
                ))
              ) : (
                <pre className="text-xs font-body text-foreground whitespace-pre-wrap leading-relaxed bg-aletis-cream/30 rounded-lg p-4">
                  {result.texto}
                </pre>
              )}
            </div>
          )}
    </AppDialog>
  )
}

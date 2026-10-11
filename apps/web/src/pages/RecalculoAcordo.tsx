import PageHeader from '../components/ui/PageHeader'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../hooks/useApi'

type IndexInfo = { code: string; name: string; provider: string; ultimoPeriodo: string | null; status: string; lastSuccess?: string; lastAttempt?: string; error?: string; running?: boolean }
type Parcel = { id: string; vencimento: string; valorOriginal: string }
type Result = { principalOriginal: string; correcaoMonetaria: string; mora: string; acrescimoTotal: string; totalAtualizado: string; linhas: Array<Record<string, string | number>> }
type Saved = { id: string; codigo: string; titulo: string; indiceCode: string; corrigirAte: string; criadoEm: string; resultado: Result }
type SavedDetail = Saved & { moraMensalPct: string; inputs: { parcelas: Parcel[] } }

const brl = (value: string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const initialParcels = (): Parcel[] => [{ id: crypto.randomUUID(), vencimento: new Date().toISOString().slice(0, 10), valorOriginal: '' }]

export default function RecalculoAcordo() {
  const [indices, setIndices] = useState<IndexInfo[]>([])
  const [indiceCode, setIndiceCode] = useState('INPC')
  const [titulo, setTitulo] = useState('Recálculo de proposta de acordo')
  const [corrigirAte, setCorrigirAte] = useState(new Date().toISOString().slice(0, 10))
  const [moraMensalPct, setMoraMensalPct] = useState('1')
  const [parcelas, setParcelas] = useState<Parcel[]>(initialParcels)
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [history, setHistory] = useState<Saved[]>([])

  useEffect(() => { const refresh = () => apiFetch<IndexInfo[]>('/recalculos-acordo/indices').then(setIndices).catch((e) => setMessage(e.message)); refresh(); apiFetch<Saved[]>('/recalculos-acordo').then(setHistory).catch(() => undefined); const timer = window.setInterval(refresh, 60_000); return () => window.clearInterval(timer) }, [])
  const selected = useMemo(() => indices.find((item) => item.code === indiceCode), [indices, indiceCode])
  const updateParcel = (id: string, patch: Partial<Parcel>) => setParcelas((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  const calculate = async () => {
    setLoading(true); setMessage('')
    try { setResult(await apiFetch<Result>('/recalculos-acordo/calcular', { method: 'POST', body: JSON.stringify({ titulo, indiceCode, corrigirAte, moraMensalPct, parcelas }) })) } catch (e) { setMessage((e as Error).message) } finally { setLoading(false) }
  }
  const save = async () => {
    setSaving(true); setMessage('')
    try { const saved = await apiFetch<Saved>('/recalculos-acordo', { method: 'POST', body: JSON.stringify({ titulo, indiceCode, corrigirAte, moraMensalPct, parcelas }) }); setSavedId(saved.id); setHistory((items) => [saved, ...items]); setMessage(`Cálculo ${saved.codigo} salvo com snapshot imutável.`) } catch (e) { setMessage((e as Error).message) } finally { setSaving(false) }
  }
  const sync = async () => { setSyncing(true); try { await apiFetch('/recalculos-acordo/indices/sync', { method: 'POST', body: JSON.stringify({ codes: [indiceCode] }) }); const updated = await apiFetch<IndexInfo[]>('/recalculos-acordo/indices'); setIndices(updated); setMessage('Índice atualizado a partir da fonte oficial.') } catch (e) { setMessage((e as Error).message) } finally { setSyncing(false) } }
  const loadSaved = async (id: string) => { try { const item = await apiFetch<SavedDetail>(`/recalculos-acordo/${id}`); setSavedId(item.id); setTitulo(item.titulo); setIndiceCode(item.indiceCode); setCorrigirAte(item.corrigirAte); setMoraMensalPct(item.moraMensalPct); setParcelas(item.inputs.parcelas); setResult(item.resultado); setMessage(`Cálculo ${item.codigo} carregado do snapshot salvo.`) } catch (e) { setMessage((e as Error).message) } }
  return <main className="mx-auto max-w-[1500px] space-y-6 p-6">
    <PageHeader className="!mb-0" title={<>Recálculo de proposta de acordo</>} eyebrow={<> <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aletis-verde-profundo">Financeiro</p> </>} description={<> <p className="mt-1 text-sm text-slate-500">Revise o acordo e consulte a memória de cálculo com os índices disponíveis.</p> </>} />
    <section className="grid gap-4 rounded-lg border border-slate-200 bg-card p-5 shadow-sm md:grid-cols-4">
      <label className="md:col-span-2">Título<input className="mt-1 w-full rounded-lg border p-2" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
      <label>Índice<select className="mt-1 w-full rounded-lg border p-2" value={indiceCode} onChange={(e) => setIndiceCode(e.target.value)}>{indices.map((item) => <option key={item.code} value={item.code}>{item.name} — {item.provider}</option>)}</select></label>
      <label>Corrigir até<input type="date" className="mt-1 w-full rounded-lg border p-2" value={corrigirAte} onChange={(e) => setCorrigirAte(e.target.value)} /></label>
      <label>Mora (% a.m.)<input inputMode="decimal" className="mt-1 w-full rounded-lg border p-2" value={moraMensalPct} onChange={(e) => setMoraMensalPct(e.target.value)} /></label>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 md:col-span-3"><strong>{selected?.name ?? indiceCode}</strong> · Fonte: {selected?.provider ?? '—'} · Último período local: {selected?.ultimoPeriodo ?? 'não sincronizado'} <button className="ml-2 rounded border border-slate-300 px-2 py-1 font-semibold" disabled={syncing || selected?.running} onClick={sync}>{syncing || selected?.running ? 'Atualizando…' : 'Atualizar índices'}</button><br /><span className={selected?.error ? 'text-red-700' : 'text-emerald-700'}>{selected?.error ? `Falha: ${selected.error}` : selected?.status === 'CACHE_DESATUALIZADO' ? 'Cache local desatualizado; sincronização em segundo plano iniciada.' : selected?.status === 'SINCRONIZANDO' ? 'Sincronização em andamento…' : selected?.lastSuccess ? `Atualizado em ${new Date(selected.lastSuccess).toLocaleString('pt-BR')}. Dados locais preservados para auditoria.` : 'Sincronização automática será iniciada.'}</span></div>
    </section>
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-card shadow-sm"><div className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">Parcelas</h2><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setParcelas((items) => [...items, { id: crypto.randomUUID(), vencimento: corrigirAte, valorOriginal: '' }])}>+ Adicionar parcela</button></div><div className="overflow-x-auto"><table className="ui-table min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Vencimento</th><th className="p-3">Valor original</th><th className="p-3">Prazo</th><th className="p-3">Correção</th><th className="p-3">Mora</th><th className="p-3">Total</th><th /></tr></thead><tbody>{parcelas.map((parcel, index) => { const line = result?.linhas[index]; return <tr key={parcel.id} className="border-t"><td className="p-3"><input type="date" className="rounded border p-2" value={parcel.vencimento} onChange={(e) => updateParcel(parcel.id, { vencimento: e.target.value })} /></td><td className="p-3"><input className="w-40 rounded border p-2" placeholder="0,00" value={parcel.valorOriginal} onChange={(e) => updateParcel(parcel.id, { valorOriginal: e.target.value.replace(',', '.') })} /></td><td className="p-3">{line?.prazoDias ?? '—'} dias</td><td className="p-3">{line ? brl(String(line.valorCorrecao)) : '—'}</td><td className="p-3">{line ? brl(String(line.valorMora)) : '—'}</td><td className="p-3 font-semibold">{line ? brl(String(line.totalAtualizado)) : '—'}</td><td className="p-3"><button className="text-red-600 disabled:opacity-30" disabled={parcelas.length === 1} onClick={() => setParcelas((items) => items.filter((item) => item.id !== parcel.id))}>Remover</button></td></tr> })}</tbody></table></div></section>
    {result && <details className="rounded-xl border border-slate-200 bg-card p-4 text-sm"><summary className="cursor-pointer font-semibold">Ver memória de cálculo</summary><div className="mt-3 grid gap-2 md:grid-cols-3">{result.linhas.map((line) => <div key={String(line.id)} className="rounded-lg bg-slate-50 p-3"><strong>Parcela {String(line.id)}</strong><div>Base: {String(line.periodoBase)} · Fator-base: {String(line.fatorBase)}</div><div>Fator final: {String(line.fatorFinal)} · Fator correção: {String(line.fatorCorrecao)}</div><div>Correção: {String(line.percentualCorrecao)}% · Mora: {String(line.percentualMora)}%</div></div>)}</div></details>}
    <section className="grid gap-3 md:grid-cols-5">{[['Principal', result?.principalOriginal], ['Correção monetária', result?.correcaoMonetaria], ['Mora', result?.mora], ['Acréscimo total', result?.acrescimoTotal], ['Total atualizado', result?.totalAtualizado]].map(([label, value]) => <div key={label} className={`rounded-lg border bg-card p-4 shadow-sm ${label === 'Total atualizado' ? 'border-aletis-verde-profundo ring-1 ring-aletis-verde-profundo' : 'border-slate-200'}`}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-aletis-grafite">{value ? brl(String(value)) : '—'}</p></div>)}</section>
    <section className="rounded-lg border border-slate-200 bg-card p-5 shadow-sm"><h2 className="mb-3 font-semibold">Recálculos salvos</h2>{history.length === 0 ? <p className="text-sm text-slate-500">Nenhum cálculo salvo nesta organização.</p> : <div className="overflow-x-auto"><table className="ui-table min-w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Código</th><th className="p-2">Título</th><th className="p-2">Índice</th><th className="p-2">Total</th><th className="p-2">Data</th><th /></tr></thead><tbody>{history.slice(0, 20).map((item) => <tr className="border-t" key={item.id}><td className="p-2 font-mono">{item.codigo}</td><td className="p-2">{item.titulo}</td><td className="p-2">{item.indiceCode}</td><td className="p-2 font-semibold">{brl(item.resultado.totalAtualizado)}</td><td className="p-2">{new Date(item.criadoEm).toLocaleDateString('pt-BR')}</td><td className="flex gap-2 p-2"><button className="text-aletis-verde-profundo underline" onClick={() => loadSaved(item.id)}>Carregar</button><a className="text-aletis-verde-profundo underline" href={`/api/recalculos-acordo/${item.id}/pdf`} target="_blank" rel="noreferrer">PDF</a></td></tr>)}</tbody></table></div>}</section>
    {message && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</div>}
    <div className="flex flex-wrap justify-end gap-3"><button className="rounded-lg bg-aletis-verde-profundo px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={loading} onClick={calculate}>{loading ? 'Calculando…' : 'Calcular'}</button><button className="rounded-lg border border-aletis-verde-profundo px-5 py-3 font-semibold text-aletis-verde-profundo disabled:opacity-50" disabled={!result || saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar cálculo'}</button>{savedId && <a className="rounded-lg border px-5 py-3 font-semibold text-slate-700" href={`/api/recalculos-acordo/${savedId}/pdf`} target="_blank" rel="noreferrer">Baixar PDF</a>}</div>
  </main>
}

import PageHeader from '../components/ui/PageHeader'
import { SectionNav } from '../components/ui/SectionNav'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Leaf,
  AlertTriangle,
  Search,
} from 'lucide-react'

const modules = [
  {
    title: 'Simulador v16',
    eyebrow: 'Operação financeira',
    description: 'PRICE, SAC, SACRE, IOF, seguros, despesas, CET, recálculo e PDF técnico.',
    route: '/simulador-operacao',
    icon: Calculator,
    status: 'Simulação e conferência',
    metrics: ['PRICE / SAC / SACRE', 'Rascunhos e versões por cliente', 'CET e capacidade de pagamento'],
  },
  {
    title: 'FARMS v6',
    eyebrow: 'Viabilidade agrícola',
    description: 'Soja, arroz, milho e trigo com custos variáveis, fixos, cenários e sensibilidade.',
    route: '/ferramentas/calculadoras-agro?tab=farms',
    icon: Leaf,
    status: 'Cenários por cultura',
    metrics: ['4 culturas', '4 cenários', 'Margem e ponto de equilíbrio'],
  },
  {
    title: 'Fechamento por Embarque',
    eyebrow: 'Resultado da pecuária',
    description: 'Baias, animais, arrobas produzidas, custo operacional, lucro por cabeça e rentabilidade.',
    route: '/ferramentas/calculadoras-agro?tab=fechamento',
    icon: ClipboardList,
    status: 'Análise por embarque',
    metrics: ['Quantidade e peso dos animais', 'Margem com custos informados', 'Comparação por baia'],
  },
]

const validations = [
  'Cenários financeiros separados por cliente',
  'Cálculos com premissas e convenções identificadas',
  'Arquivos agrupados por conteúdo para evitar duplicidade',
  'Inspeção estrutural com pendências por arquivo',
]

interface SpreadsheetCatalog {
  generatedAt: string
  totals: { files: number; physicalFiles: number; duplicateCopies: number; sheets: number; formulas: number; reviewRequired: number; legacyFiles: number }
  workbooks: Array<{
    sha256: string; filename: string; module: string; sourceCount: number; sheets: number; formulas: number; priority: string; replacement: string
    gaps: string[]; nextActions: string[]
    quality: {
      status: 'review-required' | 'inspected' | 'conversion-required' | 'unreadable'; inspected: boolean
      cachedFormulaErrors: number; brokenFormulaReferences: number; brokenDefinedNames: number; missingFormulaCaches: number
      externalLinks: number; hiddenSheets: number; macrosPresent: boolean | null; limitations: string[]
      samples: Array<{ sheet?: string; cell?: string; name?: string; code: string }>
    }
    sheetProfiles: Array<{ name: string; visibility?: string; formulas: number }>
  }>
}

const qualityLabels = {
  'review-required': 'Revisar estrutura e fórmulas', inspected: 'Estrutura inspecionada',
  'conversion-required': 'Formato legado: requer conversão', unreadable: 'Leitura não concluída',
}

export default function PlanilhasAletis() {
  const { data: catalog, loading, error, refetch } = useApi<SpreadsheetCatalog | null>('/processo-assessoria/planilhas/sistema', null)
  const [workspace, setWorkspace] = useState<'ferramentas' | 'acervo'>('ferramentas')
  const [query, setQuery] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const workbooks = useMemo(() => (catalog?.workbooks || []).filter(workbook => (
    (!onlyPending || workbook.quality.status !== 'inspected') && `${workbook.filename} ${workbook.module}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))
  )), [catalog, onlyPending, query])
  return (
    <div className="space-y-6">
      <PageHeader title="Planilhas Aletis" description="Simule operações, avalie a produção e consulte o acervo de planilhas." />
      <SectionNav label="Áreas de planilhas" active={workspace} onChange={setWorkspace} items={[
        { id: 'ferramentas', label: 'Simular e analisar', icon: Calculator },
        { id: 'acervo', label: 'Acervo e conferência', icon: FileSpreadsheet },
      ]} />
      <div hidden={workspace !== 'ferramentas'}>
      <section className="divide-y divide-aletis-borda rounded-lg border border-aletis-borda bg-card">
        {modules.map((module) => {
          const Icon = module.icon
          return (
            <Link
              key={module.title}
              to={module.route}
              className="group grid min-w-0 gap-4 p-5 transition-colors hover:bg-muted/50 sm:grid-cols-[180px_minmax(0,1fr)_auto]"
            >
              <div className="flex flex-col items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-aletis-borda bg-muted text-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-positivo/20 bg-positivo/10 px-2.5 py-1 text-[11px] font-semibold text-positivo dark:text-emerald-300">
                  {module.status}
                </span>
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                  {module.eyebrow}
                </p>
                <h2 className="mt-1 font-display text-base font-semibold text-foreground">{module.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">{module.description}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{module.metrics.join(' · ')}</p>
              </div>

              <div className="self-center">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  Abrir
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          )
        })}
      </section>

      </div>
      <div hidden={workspace !== 'acervo'} className="space-y-4">
      <details className="rounded-lg border border-aletis-borda bg-card px-5 py-3">
        <summary className="cursor-pointer text-sm font-medium">Como o acervo é organizado</summary>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{validations.map(item => <li key={item} className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />{item}</li>)}</ul>
      </details>
      <section className="space-y-4 rounded-lg border border-aletis-borda bg-card p-5 shadow-none">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Acervo e qualidade das planilhas</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">A inspeção identifica abas, fórmulas, vínculos externos e referências com problemas. A validação financeira exige conferir as premissas e os resultados de cada cenário.</p>
        </div>
        {loading && <p role="status" className="rounded-xl bg-muted p-3 text-sm">Inspecionando o acervo. A primeira leitura pode levar alguns segundos…</p>}
        {error && <div role="alert" className="rounded-xl border border-alerta/30 bg-alerta/5 p-3 text-sm"><p>Não foi possível consultar o catálogo: {error}</p><button type="button" onClick={refetch} className="mt-2 rounded-lg border border-aletis-borda bg-card px-3 py-2">Tentar novamente</button></div>}
        {catalog && <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Conteúdos únicos', catalog.totals.files], ['Arquivos no acervo', catalog.totals.physicalFiles],
              ['Cópias repetidas', catalog.totals.duplicateCopies], ['Revisão ou conversão', catalog.totals.reviewRequired],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-muted p-3"><p className="text-xs text-[var(--text-soft)]">{label}</p><p className="mt-1 font-mono text-xl font-bold text-foreground">{Number(value).toLocaleString('pt-BR')}</p></div>)}
          </div>
          <p className="text-xs text-[var(--text-soft)]">Inspeção de {new Date(catalog.generatedAt).toLocaleString('pt-BR')}: {catalog.totals.sheets.toLocaleString('pt-BR')} abas e {catalog.totals.formulas.toLocaleString('pt-BR')} fórmulas nos formatos inspecionados. {catalog.totals.legacyFiles > 0 ? `${catalog.totals.legacyFiles} arquivo(s) legado(s) precisam de conversão antes da contagem completa.` : ''}</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-aletis-borda px-3 py-2"><Search className="h-4 w-4 shrink-0 text-[var(--text-soft)]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar arquivo ou módulo" aria-label="Buscar planilha" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyPending} onChange={event => setOnlyPending(event.target.checked)} className="accent-aletis-verde" /> Somente pendências</label>
          </div>
          <p className="text-xs text-[var(--text-soft)]">{workbooks.length} de {catalog.workbooks.length} conteúdos</p>
          <div className="space-y-2">
            {workbooks.map(workbook => <details key={workbook.sha256} className="rounded-xl border border-aletis-borda p-3">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-foreground">{workbook.filename}</p><p className="mt-1 text-xs text-[var(--text-soft)]">{workbook.quality.inspected ? `${workbook.sheets} abas · ${workbook.formulas.toLocaleString('pt-BR')} fórmulas` : 'Abas e fórmulas ainda não contadas'} · {workbook.sourceCount} cópia(s)</p></div>
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${workbook.quality.status === 'inspected' ? 'bg-aletis-verde/10 text-foreground' : 'bg-aletis-dourado/10 text-aletis-dourado-escuro'}`}><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{qualityLabels[workbook.quality.status]}</span>
                </div>
              </summary>
              <div className="mt-3 space-y-3 border-t border-aletis-borda pt-3 text-xs text-[var(--text-soft)]">
                <p>{workbook.replacement}</p>
                {workbook.quality.inspected && <div className="flex flex-wrap gap-2">{[
                  `${workbook.quality.cachedFormulaErrors} resultados armazenados com erro`, `${workbook.quality.brokenFormulaReferences + workbook.quality.brokenDefinedNames} referências quebradas`,
                  `${workbook.quality.missingFormulaCaches} fórmulas sem resultado armazenado`, `${workbook.quality.externalLinks} vínculos externos`, `${workbook.quality.hiddenSheets} abas ocultas`,
                  workbook.quality.macrosPresent ? 'Contém macros' : 'Macros não detectadas',
                ].map(label => <span key={label} className="rounded-lg bg-muted px-2 py-1">{label}</span>)}</div>}
                {workbook.quality.samples.length > 0 && <p>Locais para conferência: {workbook.quality.samples.slice(0, 8).map(sample => [sample.sheet, sample.cell || sample.name, sample.code].filter(Boolean).join(' · ')).join('; ')}.</p>}
                <div><p className="font-semibold text-foreground">Próximos passos</p><ul className="mt-1 list-disc space-y-1 pl-4">{[...workbook.nextActions, ...workbook.quality.limitations].map((item, index) => <li key={index}>{item}</li>)}</ul></div>
                {workbook.sheetProfiles.length > 0 && <p>Abas: {workbook.sheetProfiles.map(sheet => `${sheet.name}${sheet.visibility && sheet.visibility !== 'visible' ? ' (oculta)' : ''}`).join(' · ')}.</p>}
              </div>
            </details>)}
            {!workbooks.length && <p className="py-5 text-center text-sm text-[var(--text-soft)]">Nenhuma planilha corresponde ao filtro.</p>}
          </div>
        </>}
      </section>
      </div>
    </div>
  )
}

/**
 * Manual de Marca interativo — visualização viva da identidade ALETIS
 * conforme `/home/aisaganski/aletis-audit/SUPERPOWER-BRAND-TOKENS.json`
 * extraído do PDF oficial Bulbo Agência (abr/2026, 34 páginas).
 *
 * Acessível em /configuracoes/marca. Útil para o time conferir aplicações
 * permitidas, pegar assets oficiais e testar combinações sobre o pattern.
 */
import { useMemo, useState } from 'react'
import {
  ALETIS_COLORS,
  ALETIS_COLORS_META,
  ALETIS_DO_NOTS,
  ALETIS_FONTS,
  ALETIS_ICONS,
  ALETIS_LEGAL,
  ALETIS_LOGOS,
  ALETIS_PATTERN,
  ALETIS_TAGLINES,
  ALETIS_VOICE,
  type LogoLine,
} from '../brand/manifest'
import BrandMark from '../components/ui/BrandMark'

type Tab = 'cores' | 'logos' | 'icones' | 'tipografia' | 'voz' | 'legal' | 'donts'

const TABS: { id: Tab; label: string }[] = [
  { id: 'cores', label: 'Paleta' },
  { id: 'logos', label: 'Logotipos' },
  { id: 'icones', label: 'Ícones' },
  { id: 'tipografia', label: 'Tipografia' },
  { id: 'voz', label: 'Voz da marca' },
  { id: 'legal', label: 'Identificação legal' },
  { id: 'donts', label: 'O que não fazer' },
]

export default function ManualMarca() {
  const [tab, setTab] = useState<Tab>('cores')
  const [logoBg, setLogoBg] = useState<'cream' | 'verde' | 'pattern'>('cream')

  return (
    <div className="min-h-screen bg-aletis-cream-papel">
      <header className="border-b border-aletis-cinza bg-aletis-cream">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-aletis-verde-medio/80">
                Identidade Visual ALETIS
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold text-aletis-verde">
                Manual de marca
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-aletis-verde-medio">
                Guia rápido vivo: cores, logotipos, ícones, tipografia e tom de voz.
                Fonte canônica: Manual Bulbo Agência (abr/2026), espelhada em
                <code className="ml-1 rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                  apps/web/src/brand/manifest.ts
                </code>.
              </p>
            </div>
            <BrandMark variant="stacked" tone="verde" size={56} />
          </div>
          <nav className="mt-6 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  'rounded-full px-4 py-1.5 text-sm font-medium transition',
                  tab === t.id
                    ? 'bg-aletis-verde text-aletis-cream shadow-brand'
                    : 'bg-white text-aletis-verde-medio hover:bg-aletis-cream',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        {tab === 'cores' && <PaletaSection />}
        {tab === 'logos' && (
          <LogosSection logoBg={logoBg} setLogoBg={setLogoBg} />
        )}
        {tab === 'icones' && <IconesSection />}
        {tab === 'tipografia' && <TipografiaSection />}
        {tab === 'voz' && <VozSection />}
        {tab === 'legal' && <LegalSection />}
        {tab === 'donts' && <DontsSection />}
      </main>
    </div>
  )
}

function PaletaSection() {
  const entries = Object.entries(ALETIS_COLORS) as [keyof typeof ALETIS_COLORS, string][]
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-aletis-verde">Paleta oficial</h2>
      <p className="mt-1 text-sm text-aletis-verde-medio">
        Hex / RGB / CMYK conforme manual Bulbo. Toque em qualquer cor para copiar o hex.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {entries.map(([name, hex]) => {
          const meta = ALETIS_COLORS_META[name]
          return (
            <button
              key={name}
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(hex)
              }}
              className="group overflow-hidden rounded-2xl bg-white text-left shadow-brand-sm ring-1 ring-aletis-cinza transition hover:shadow-brand"
            >
              <div className="h-28" style={{ backgroundColor: hex }} />
              <div className="space-y-1 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold uppercase tracking-wider text-aletis-verde">
                    {name}
                  </span>
                  <code className="rounded bg-aletis-cream px-2 py-0.5 font-mono text-xs text-aletis-verde-medio">
                    {hex}
                  </code>
                </div>
                <p className="text-xs text-aletis-verde-medio">{meta.role}</p>
                <div className="grid grid-cols-2 gap-1 pt-2 text-[10px] uppercase tracking-wider text-aletis-verde-medio/70">
                  <span>RGB {meta.rgb}</span>
                  <span>CMYK {meta.cmyk}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function LogosSection({
  logoBg,
  setLogoBg,
}: {
  logoBg: 'cream' | 'verde' | 'pattern'
  setLogoBg: (b: 'cream' | 'verde' | 'pattern') => void
}) {
  const lines = Object.entries(ALETIS_LOGOS) as [LogoLine, (typeof ALETIS_LOGOS)[LogoLine]][]
  const bgStyle = useMemo(() => {
    if (logoBg === 'verde') return { backgroundColor: ALETIS_COLORS.primary }
    if (logoBg === 'pattern')
      return {
        backgroundImage: `url(${ALETIS_PATTERN})`,
        backgroundColor: ALETIS_COLORS.primary,
      }
    return { backgroundColor: ALETIS_COLORS.background }
  }, [logoBg])

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-aletis-verde">Logotipos</h2>
          <p className="mt-1 text-sm text-aletis-verde-medio">
            8 famílias × 4 variantes oficiais. Use a linha temática que casa com o
            público (Agro / Corporate / Fomento / Gestão).
          </p>
        </div>
        <div className="flex gap-2 rounded-full bg-white p-1 shadow-brand-sm">
          {(['cream', 'verde', 'pattern'] as const).map((b) => (
            <button
              key={b}
              onClick={() => setLogoBg(b)}
              type="button"
              className={[
                'rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide transition',
                logoBg === b ? 'bg-aletis-verde text-aletis-cream' : 'text-aletis-verde-medio',
              ].join(' ')}
            >
              {b === 'pattern' ? 'Padrão' : b === 'verde' ? 'Verde' : 'Cream'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {lines.map(([line, info]) => (
          <article key={line} className="overflow-hidden rounded-2xl bg-white shadow-brand-sm ring-1 ring-aletis-cinza">
            <header className="flex items-center justify-between gap-3 border-b border-aletis-cinza px-5 py-3">
              <div>
                <h3 className="font-display text-base font-bold text-aletis-verde">{info.label}</h3>
                <p className="text-xs text-aletis-verde-medio">{info.description}</p>
              </div>
              <code className="font-mono text-[10px] uppercase tracking-wider text-aletis-verde-medio/70">
                {info.variants.length} variantes
              </code>
            </header>
            <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4" style={bgStyle}>
              {info.variants.map((src) => (
                <div
                  key={src}
                  className="flex aspect-[4/3] items-center justify-center rounded-md bg-white/0 p-3"
                >
                  <img
                    src={src}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function IconesSection() {
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-aletis-verde">Ícones</h2>
      <p className="mt-1 text-sm text-aletis-verde-medio">
        25 ícones oficiais derivados do bracket-A. Use somente os do conjunto.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
        {ALETIS_ICONS.map((ic) => (
          <div
            key={ic.id}
            className="flex aspect-square items-center justify-center rounded-xl bg-white p-3 shadow-brand-sm ring-1 ring-aletis-cinza"
          >
            <img src={ic.src} alt={`Ícone ALETIS ${ic.id}`} className="max-h-full max-w-full" loading="lazy" />
          </div>
        ))}
      </div>
    </section>
  )
}

function TipografiaSection() {
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <article className="rounded-2xl bg-white p-6 shadow-brand-sm ring-1 ring-aletis-cinza">
        <p className="text-xs uppercase tracking-wider text-aletis-verde-medio">Display</p>
        <h2 className="font-display text-3xl font-bold text-aletis-verde">{ALETIS_FONTS.display}</h2>
        <p className="mt-2 text-sm text-aletis-verde-medio">
          Tipografia principal — nome ALETIS e títulos. Estilo imponente, transmite
          convicção, credibilidade e segurança.
        </p>
        <div className="mt-5 space-y-2 font-display text-aletis-verde">
          <p style={{ fontWeight: 300 }}>Light · 300 — Verdade nos números.</p>
          <p style={{ fontWeight: 400 }}>Regular · 400 — Verdade nos números.</p>
          <p style={{ fontWeight: 500 }}>Medium · 500 — Verdade nos números.</p>
          <p style={{ fontWeight: 600 }}>SemiBold · 600 — Verdade nos números.</p>
          <p style={{ fontWeight: 700 }}>Bold · 700 — Verdade nos números.</p>
        </div>
      </article>
      <article className="rounded-2xl bg-white p-6 shadow-brand-sm ring-1 ring-aletis-cinza">
        <p className="text-xs uppercase tracking-wider text-aletis-verde-medio">Body</p>
        <h2 className="font-body text-3xl font-bold text-aletis-verde">{ALETIS_FONTS.body}</h2>
        <p className="mt-2 font-body text-sm text-aletis-verde-medio">
          Tipografia de apoio — corpo de texto, subtítulos e contratos (todos os Anexos
          foram diagramados em Verdana 9pt).
        </p>
        <div className="mt-5 space-y-3 font-body text-aletis-verde">
          <p style={{ fontWeight: 400 }}>
            Regular · 400 — A ALETIS atua na reestruturação de dívidas rurais com base em
            MCR, Súmulas STJ e Plano Safra vigente.
          </p>
          <p style={{ fontWeight: 700 }}>
            Bold · 700 — Estruturas claras, números honestos, decisões fundamentadas.
          </p>
        </div>
      </article>
    </section>
  )
}

function VozSection() {
  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <article className="rounded-2xl bg-white p-6 shadow-brand-sm ring-1 ring-aletis-cinza lg:col-span-2">
        <h2 className="font-display text-xl font-bold text-aletis-verde">Tom de voz</h2>
        <p className="mt-2 text-sm leading-relaxed text-aletis-verde-medio">{ALETIS_VOICE.tone}</p>
        <h3 className="mt-6 font-display text-base font-bold text-aletis-verde">Etimologia</h3>
        <p className="mt-1 text-sm leading-relaxed text-aletis-verde-medio">{ALETIS_VOICE.etymology}</p>
        <h3 className="mt-6 font-display text-base font-bold text-aletis-verde">Origem do símbolo</h3>
        <p className="mt-1 text-sm leading-relaxed text-aletis-verde-medio">{ALETIS_VOICE.symbol}</p>
      </article>
      <article className="rounded-2xl bg-aletis-verde p-6 text-aletis-cream shadow-brand">
        <h3 className="font-display text-base font-bold uppercase tracking-wider text-aletis-gold">
          Taglines oficiais
        </h3>
        <ul className="mt-4 space-y-3">
          {ALETIS_TAGLINES.map((t) => (
            <li
              key={t}
              className="rounded-lg bg-aletis-verde-escuro/40 p-3 font-display text-sm leading-snug"
            >
              {t}
            </li>
          ))}
        </ul>
      </article>
    </section>
  )
}

function LegalSection() {
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-aletis-verde">Identificação legal</h2>
      <div className="mt-4 grid gap-2 rounded-2xl bg-white p-6 shadow-brand-sm ring-1 ring-aletis-cinza">
        {Object.entries(ALETIS_LEGAL).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[160px_1fr] items-baseline gap-3 border-b border-aletis-cinza/60 py-2 last:border-0">
            <span className="text-xs uppercase tracking-wider text-aletis-verde-medio/80">
              {k.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            <span className="font-mono text-sm text-aletis-verde">{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-aletis-verde-medio">
        Esta identificação é injetada automaticamente em todos os contratos gerados pelo módulo
        Contratos Oficiais — não edite manualmente.
      </p>
    </section>
  )
}

function DontsSection() {
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-aletis-verde">O que não fazer</h2>
      <p className="mt-1 text-sm text-aletis-verde-medio">
        Regras explícitas do manual. Quem aprovar publicação fora destas regras descumpre o
        guia e expõe a marca.
      </p>
      <ul className="mt-6 grid gap-3 md:grid-cols-2">
        {ALETIS_DO_NOTS.map((rule, idx) => (
          <li
            key={rule}
            className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-brand-sm ring-1 ring-aletis-cinza"
          >
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-alerta/10 font-display text-xs font-bold text-alerta">
              {idx + 1}
            </span>
            <span className="text-sm leading-snug text-aletis-verde">{rule}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ============================================================
// templateResolver — fuzzy match de identificador → slug canônico
// ============================================================
// Aceita: slug exato, título completo ("Anexo I — Consultoria"),
// fragmentos ("anexo I", "consultoria", "NDA", "procuração",
// "termo de aceite", "contrato base completo", "anexo iv erp", etc.)
//
// Usado tanto pelas tools ALIX quanto pelas rotas REST — assim o
// frontend e o LLM podem passar nomes naturais.
// ============================================================
import { CONTRACT_TEMPLATES } from './manifest.js'

export type TemplateResolveOk = {
  ok: true
  slug: string
  matched: string
  score: number
}

export type TemplateResolveError = {
  ok: false
  ambiguous?: Array<{ slug: string; title: string; score: number }>
  error: string
}

export type TemplateResolveResult = TemplateResolveOk | TemplateResolveError

const KEYWORD_BOOSTS: Array<{ test: (n: string) => boolean; slug: string; weight: number }> = [
  { test: (n) => /\bnda\b/.test(n), slug: 'anexo-vi-nda', weight: 50 },
  { test: (n) => /procura(c|ç)/.test(n), slug: 'anexo-vii-procuracao', weight: 50 },
  { test: (n) => /\btermo\b/.test(n), slug: 'anexo-viii-termo-aceite', weight: 50 },
  { test: (n) => /\baceite\b/.test(n), slug: 'anexo-viii-termo-aceite', weight: 50 },
  { test: (n) => /\bconsultoria\b/.test(n), slug: 'anexo-i-consultoria', weight: 50 },
  { test: (n) => /\bdiagn(o|ó)stico\b/.test(n), slug: 'anexo-ii-diagnostico', weight: 50 },
  { test: (n) => /\berp\b/.test(n), slug: 'anexo-iv-assessoria-erp', weight: 50 },
  { test: (n) => /\boutros\b/.test(n), slug: 'anexo-v-outros-servicos', weight: 50 },
  { test: (n) => /\bcompleto\b/.test(n), slug: 'contrato-base-completo', weight: 50 },
  { test: (n) => /\bresumido\b/.test(n), slug: 'contrato-base-resumido', weight: 50 },
  // ANEXO III só dispara em "assessoria gerencial" SEM "erp"
  {
    test: (n) => /\bassessoria gerencial\b/.test(n) && !/\berp\b/.test(n),
    slug: 'anexo-iii-assessoria-gerencial',
    weight: 50,
  },
]

export function resolveTemplateSlug(input: string): TemplateResolveResult {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, error: 'identificador vazio' }

  const norm = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[—–-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // 1) match exato por slug
  const exact = CONTRACT_TEMPLATES.find(
    (t) => t.slug.toLowerCase() === norm.replace(/\s+/g, '-'),
  )
  if (exact) return { ok: true, slug: exact.slug, matched: exact.title, score: 100 }

  // 2) score por overlap de tokens
  const inputTokens = norm.split(' ').filter((t) => t.length >= 2)
  const candidates = CONTRACT_TEMPLATES.map((t) => {
    const haystack = [
      t.slug.replace(/-/g, ' '),
      t.title,
      t.subtitle ?? '',
      t.originalFile.replace(/_/g, ' ').replace(/\.docx$/i, ''),
      t.category.replace(/-/g, ' '),
    ]
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')

    let score = 0
    for (const tok of inputTokens) {
      if (haystack.includes(tok)) score += 10
      // bônus para roman numerals (anexo i, ii, iii, iv, v, vi, vii, viii)
      if (/^(i{1,3}|iv|v|vi{0,3}|viii)$/i.test(tok) && haystack.includes(` ${tok} `)) score += 25
    }

    // boosts por keyword única e distinta
    for (const b of KEYWORD_BOOSTS) {
      if (b.slug === t.slug && b.test(norm)) score += b.weight
    }

    return { slug: t.slug, title: t.title, score }
  })

  candidates.sort((a, b) => b.score - a.score)
  const top = candidates[0]
  if (!top || top.score === 0) {
    return {
      ok: false,
      error:
        `Não consegui identificar o contrato "${raw}". Tente um nome mais específico ` +
        `(ex.: "anexo i consultoria", "NDA", "procuração", "termo de aceite", "contrato base completo").`,
    }
  }
  // ambiguidade: top e segundo muito próximos
  if (candidates[1] && top.score - candidates[1].score < 15) {
    return {
      ok: false,
      ambiguous: candidates.slice(0, 4).filter((c) => c.score > 0),
      error: `"${raw}" pode ser mais de um template. Especifique melhor.`,
    }
  }
  return { ok: true, slug: top.slug, matched: top.title, score: top.score }
}

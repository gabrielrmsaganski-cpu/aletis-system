/**
 * ALETIS - Knowledge Base / RAG
 * Tokenizacao simples e chunking por janela deslizante.
 *
 * Estrategia: tokens = split por espacos em branco (whitespace). Os chunks
 * armazenam o texto original reconstruido pelo join(' '), o que e suficiente
 * para BM25 e para retornar trechos legiveis ao modelo.
 */

/** Stopwords PT-BR minimas; complementadas por stopwords EN que aparecem em mat. academico. */
const STOPWORDS_PT = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'da', 'do', 'das', 'dos',
  'e', 'ou', 'nem', 'mas', 'porem',
  'em', 'no', 'na', 'nos', 'nas',
  'para', 'por', 'pelo', 'pela', 'pelos', 'pelas',
  'que', 'se', 'sua', 'seu', 'suas', 'seus',
  'com', 'sem', 'sob', 'sobre',
  'ao', 'aos',
  'ser', 'sao', 'foi', 'era', 'este', 'esta', 'esse', 'essa', 'isto', 'isso',
  'mais', 'menos', 'muito', 'pouco',
  'como', 'quando', 'onde',
  // EN vestigiais
  'the', 'an', 'of', 'to', 'in', 'is', 'and', 'or', 'for', 'on', 'at', 'by', 'with',
])

/** Regex de marcas combinantes (U+0300-U+036F) escrito em forma de escape. */
const COMBINING_MARKS_RE = /[̀-ͯ]/g
const NON_ALNUM_RE = /[^a-z0-9]+/g

/**
 * Tokeniza um texto para BM25:
 * - lowercase
 * - remove acentos (NFD)
 * - split por caracteres nao-alfanumericos
 * - descarta tokens vazios, tamanho < 2 e stopwords
 */
export function tokenize(text: string): string[] {
  const lowered = text.toLowerCase()
  const deaccented = lowered.normalize('NFD').replace(COMBINING_MARKS_RE, '')
  const pieces = deaccented.split(NON_ALNUM_RE)
  const out: string[] = []
  for (const p of pieces) {
    if (!p) continue
    if (p.length < 2) continue
    if (STOPWORDS_PT.has(p)) continue
    out.push(p)
  }
  return out
}

/**
 * Conta tokens por whitespace (aproxima contagem sem remover stopwords).
 * Usado para dimensionar janelas.
 */
export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/g).length
}

export interface ChunkInput {
  text: string
  page: number | null
}

export interface ChunkOutput {
  text: string
  page: number | null
  chunkIndex: number
  tokens: number
}

export interface ChunkOptions {
  /** Tamanho alvo em tokens por chunk. Default 800. */
  targetTokens?: number
  /** Overlap em tokens entre chunks consecutivos. Default 120. */
  overlapTokens?: number
}

/**
 * Gera chunks com janela deslizante em nivel de palavras (whitespace tokens).
 * Trabalha por pagina quando ha varias paginas para preservar metadado de pagina.
 */
export function chunkPages(pages: ChunkInput[], opts: ChunkOptions = {}): ChunkOutput[] {
  const target = Math.max(100, Math.floor(opts.targetTokens ?? 800))
  const overlap = Math.min(target - 1, Math.max(0, Math.floor(opts.overlapTokens ?? 120)))
  const step = Math.max(1, target - overlap)

  const out: ChunkOutput[] = []
  let globalIndex = 0

  for (const p of pages) {
    const cleaned = (p.text || '').replace(/\r/g, '').replace(/\s+\n/g, '\n').trim()
    if (!cleaned) continue
    const words = cleaned.split(/\s+/g).filter(w => w.length > 0)
    if (words.length === 0) continue

    if (words.length <= target) {
      out.push({
        text: words.join(' '),
        page: p.page,
        chunkIndex: globalIndex++,
        tokens: words.length,
      })
      continue
    }

    for (let start = 0; start < words.length; start += step) {
      const end = Math.min(words.length, start + target)
      const slice = words.slice(start, end)
      if (slice.length === 0) break
      out.push({
        text: slice.join(' '),
        page: p.page,
        chunkIndex: globalIndex++,
        tokens: slice.length,
      })
      if (end >= words.length) break
    }
  }

  return out
}

import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import type { CarConsultaResult } from './types'

/**
 * Índice offline de imóveis SICAR construído a partir dos shapefiles públicos
 * (scripts/ingest-sicar.ts → sicar-imoveis.json).
 *
 * Evita o scraping live (e o gasto de 2captcha) para todos os leads cujos
 * imóveis já estão ingeridos. Match duplo:
 *  1. por CPF/CNPJ (quando o dump traz — cerca de 30-70% dos casos)
 *  2. por nome normalizado (fallback — funciona muito bem para razões sociais
 *     tipo "AGROPECUARIA XYZ LTDA" que o SICAR também registra)
 *
 * A aggregação retorna o imóvel principal (maior área) + soma total do
 * proprietário quando há múltiplas matrículas.
 */

interface SicarImovelRaw {
  codImovel: string
  areaImovel: number
  municipio: string
  uf: string
  nome: string | null
  cpfCnpj: string | null
  condicao: string | null
  statusAnalise: string | null
  tipo: string | null
  modulosFiscais: number | null
  areaReservaLegal: number | null
  areaPreservacaoPermanente: number | null
  areaVegetacao: number | null
  areaAntropizada: number | null
}

interface SicarDump {
  manifest: {
    generatedAt: string
    source: string
    stats: Record<string, unknown>
  }
  byCpfCnpj: Record<string, SicarImovelRaw[]>
  byNameKey: Record<string, SicarImovelRaw[]>
}

export interface SicarIndexStats {
  loaded: boolean
  generatedAt: string | null
  totalImoveis: number
  comCpfCnpj: number
  comNome: number
  byUf: Record<string, number>
  indexFile: string
  sizeMb: number | null
}

/**
 * Consulta ao índice offline — tipo inclui `multi` = soma de múltiplas matrículas
 * e `fonte` para o UI saber que veio do índice (não do scraping).
 */
export interface SicarIndexHit {
  principal: CarConsultaResult
  totalHectares: number
  qtdImoveis: number
  imoveis: CarConsultaResult[]
  matchBy: 'cpfCnpj' | 'nome' | 'nome-uf' | 'tokens-uf'
  /** 0-100 — quão confiante é o match. CPF/CNPJ = 100, nome+UF = 80, tokens = 60. */
  confidence: number
  /** Texto legível para UI explicar o caminho usado. */
  estrategia: string
}

/** Contexto adicional para desambiguação do match. */
export interface SicarLookupContext {
  uf?: string | null
  municipio?: string | null
}

export class SICARIndex {
  private dump: SicarDump | null = null
  private loaded = false
  private loadedAt: number | null = null
  private readonly indexFile: string

  constructor(storageDir: string) {
    this.indexFile = join(storageDir, 'sicar-imoveis.json')
  }

  /** Lazy-load — só bate no disco na primeira query. */
  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true // setamos antes pra evitar reentrada
    if (!existsSync(this.indexFile)) return
    try {
      const buf = readFileSync(this.indexFile, 'utf8')
      this.dump = JSON.parse(buf) as SicarDump
      this.loadedAt = Date.now()
    } catch (err) {
      console.warn('[SICARIndex] falha ao ler', this.indexFile, err)
      this.dump = null
    }
  }

  /**
   * Re-lê o arquivo de índice do disco. Usado pelo endpoint de reload após
   * o cron de refresh rodar o ingest — evita restart da API.
   */
  reload(): SicarIndexStats {
    this.dump = null
    this.loaded = false
    this.loadedAt = null
    this.ensureLoaded()
    return this.stats()
  }

  isAvailable(): boolean {
    this.ensureLoaded()
    return this.dump !== null
  }

  findByCpfCnpj(cpfCnpj: string): SicarIndexHit | null {
    this.ensureLoaded()
    if (!this.dump) return null
    const key = (cpfCnpj || '').replace(/\D/g, '')
    const arr = this.dump.byCpfCnpj[key]
    if (!arr || arr.length === 0) return null
    return this.aggregate(arr, 'cpfCnpj', 100, `match exato por ${cpfCnpj.length <= 11 ? 'CPF' : 'CNPJ'} no shapefile`)
  }

  findByName(nome: string): SicarIndexHit | null {
    this.ensureLoaded()
    if (!this.dump) return null
    const key = nameKey(nome)
    if (key.length < 4) return null
    const arr = this.dump.byNameKey[key]
    if (!arr || arr.length === 0) return null
    return this.aggregate(arr, 'nome', 75, `match por razão social normalizada`)
  }

  /**
   * Busca aprofundada — tenta múltiplas estratégias em cascata:
   *   1. CPF/CNPJ exato                                    (confiança 100)
   *   2. Nome completo normalizado                         (confiança 75)
   *   3. Nome completo + UF confirmada (pelo endereço RFB) (confiança 85)
   *   4. Tokens significativos do nome + UF                (confiança 55-70)
   *
   * Parâmetro `ctx` vem opcionalmente do enrichment (BrasilAPI → UF/município).
   * Quanto mais contexto, mais confiável.
   */
  deepLookup(cpfCnpj: string, nome: string, ctx: SicarLookupContext = {}): SicarIndexHit | null {
    this.ensureLoaded()
    if (!this.dump) return null

    // 1. CPF/CNPJ exato — prioridade absoluta
    const byId = this.findByCpfCnpj(cpfCnpj)
    if (byId) return this.applyUfFilter(byId, ctx)

    // 2. Nome completo normalizado
    const byName = this.findByName(nome)
    if (byName) {
      const filtered = this.applyUfFilter(byName, ctx)
      if (filtered) {
        // Se UF confere, promovemos a confiança
        if (ctx.uf && filtered.principal.uf.toUpperCase() === ctx.uf.toUpperCase()) {
          return {
            ...filtered,
            matchBy: 'nome-uf',
            confidence: 85,
            estrategia: `match por razão social + UF confirmada (${ctx.uf})`,
          }
        }
        return filtered
      }
    }

    // 3. Fallback por tokens — exige UF no contexto, senão é ruído demais
    if (ctx.uf) {
      const tokens = significantTokens(nome)
      if (tokens.length >= 2) {
        // Procura todos os candidatos do índice que tenham a UF
        // e cujo nome contenha pelo menos 2 tokens significativos
        const ufUpper = ctx.uf.toUpperCase()
        const candidatesByName = Object.values(this.dump.byNameKey).flat()
        const matches = candidatesByName.filter((im) => {
          if (im.uf?.toUpperCase() !== ufUpper) return false
          if (!im.nome) return false
          const n = nameKey(im.nome)
          return tokens.filter((t) => n.includes(t)).length >= 2
        })
        if (matches.length > 0) {
          const hit = this.aggregate(matches, 'tokens-uf', 60, `match por tokens + UF (${tokens.join(', ')})`)
          // Se encontrou município específico, ganha confiança
          if (ctx.municipio) {
            const munUpper = ctx.municipio.toUpperCase()
            const sameMun = matches.filter((m) => (m.municipio || '').toUpperCase().includes(munUpper))
            if (sameMun.length > 0) {
              return this.aggregate(sameMun, 'tokens-uf', 70, `match por tokens + município (${ctx.municipio})`)
            }
          }
          return hit
        }
      }
    }

    return null
  }

  /** Primeiro CPF/CNPJ, senão tenta por nome (mais ruidoso). */
  lookup(cpfCnpj: string, nome: string, ctx?: SicarLookupContext): SicarIndexHit | null {
    if (ctx) return this.deepLookup(cpfCnpj, nome, ctx)
    return this.findByCpfCnpj(cpfCnpj) || this.findByName(nome)
  }

  /**
   * Se há UF no contexto, tenta filtrar imóveis do hit pela UF. Se nenhum
   * sobrar, descarta o match (provavelmente homônimo em outra UF).
   */
  private applyUfFilter(hit: SicarIndexHit, ctx: SicarLookupContext): SicarIndexHit | null {
    if (!ctx.uf) return hit
    const ufUpper = ctx.uf.toUpperCase()
    const filtered = hit.imoveis.filter((im) => im.uf.toUpperCase() === ufUpper)
    if (filtered.length === 0) {
      // Nenhum imóvel na UF esperada — provavelmente false match
      return null
    }
    if (filtered.length === hit.imoveis.length) return hit
    const principal = filtered.reduce((a, b) => (a.areaImovel >= b.areaImovel ? a : b))
    const totalHectares = filtered.reduce((s, im) => s + im.areaImovel, 0)
    return {
      ...hit,
      principal,
      totalHectares,
      qtdImoveis: filtered.length,
      imoveis: filtered,
    }
  }

  stats(): SicarIndexStats {
    this.ensureLoaded()
    if (!existsSync(this.indexFile)) {
      return {
        loaded: false,
        generatedAt: null,
        totalImoveis: 0,
        comCpfCnpj: 0,
        comNome: 0,
        byUf: {},
        indexFile: this.indexFile,
        sizeMb: null,
      }
    }
    const size = statSync(this.indexFile).size / 1_048_576
    const d = this.dump
    if (!d) {
      return {
        loaded: false,
        generatedAt: null,
        totalImoveis: 0,
        comCpfCnpj: 0,
        comNome: 0,
        byUf: {},
        indexFile: this.indexFile,
        sizeMb: Number(size.toFixed(1)),
      }
    }
    const allImoveis = [
      ...Object.values(d.byCpfCnpj).flat(),
      ...Object.values(d.byNameKey).flat(),
    ]
    // Deduplicação por codImovel — mesmo imóvel pode estar em ambos os mapas.
    const unique = new Map<string, SicarImovelRaw>()
    for (const im of allImoveis) {
      if (!unique.has(im.codImovel)) unique.set(im.codImovel, im)
    }
    const total = unique.size
    const byUf: Record<string, number> = {}
    let comCpfCnpj = 0
    let comNome = 0
    for (const im of unique.values()) {
      byUf[im.uf] = (byUf[im.uf] || 0) + 1
      if (im.cpfCnpj) comCpfCnpj++
      if (im.nome) comNome++
    }
    return {
      loaded: true,
      generatedAt: d.manifest.generatedAt,
      totalImoveis: total,
      comCpfCnpj,
      comNome,
      byUf,
      indexFile: this.indexFile,
      sizeMb: Number(size.toFixed(1)),
    }
  }

  private aggregate(
    arr: SicarImovelRaw[],
    matchBy: SicarIndexHit['matchBy'],
    confidence = 75,
    estrategia = ''
  ): SicarIndexHit {
    const imoveis = arr.map((im) => this.toCarResult(im))
    const principal = imoveis.reduce((a, b) => (a.areaImovel >= b.areaImovel ? a : b))
    const totalHectares = imoveis.reduce((s, im) => s + im.areaImovel, 0)
    return { principal, totalHectares, qtdImoveis: imoveis.length, imoveis, matchBy, confidence, estrategia }
  }

  private toCarResult(im: SicarImovelRaw): CarConsultaResult {
    return {
      codImovel: im.codImovel,
      areaImovel: im.areaImovel,
      municipio: im.municipio,
      uf: im.uf,
      modulosFiscais: im.modulosFiscais ?? undefined,
      areaAntropizada: im.areaAntropizada ?? undefined,
      areaReservaLegal: im.areaReservaLegal ?? undefined,
      areaPreservacaoPermanente: im.areaPreservacaoPermanente ?? undefined,
      areaVegetacaoNativa: im.areaVegetacao ?? undefined,
      condicaoCadastro: im.condicao ?? 'desconhecida',
      statusAnalise: im.statusAnalise ?? undefined,
      tipoImovel: (im.tipo as any) ?? undefined,
      consultadoEm: this.loadedAt ? new Date(this.loadedAt).toISOString() : new Date().toISOString(),
    }
  }
}

/** Mesma normalização usada pelo script de ingestão — evita drift. */
export function nameKey(nome: string): string {
  return (nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(LTDA|SA|EIRELI|EPP|ME)\s*$/i, '')
    .replace(/\s+/g, '_')
}

/** Palavras descartáveis (stopwords jurídicas/agro) — não usar como token. */
const STOPWORDS = new Set([
  'LTDA', 'SA', 'S/A', 'EIRELI', 'EPP', 'ME', 'CIA', 'COMPANHIA',
  'DA', 'DE', 'DO', 'DAS', 'DOS', 'E', 'OU',
  'FAZENDA', 'SITIO', 'CHACARA', 'RURAL', 'RECANTO',
  'AGROPECUARIA', 'AGRICOLA', 'PECUARIA', 'AGRO',
  'COMERCIO', 'COMERCIAL', 'INDUSTRIA', 'INDUSTRIAL',
])

/**
 * Extrai tokens significativos do nome para fallback de match por UF.
 * Remove stopwords e preserva tokens ≥ 4 chars — reduz ruído de match genérico.
 */
export function significantTokens(nome: string): string[] {
  const base = nameKey(nome).replace(/_/g, ' ').split(/\s+/)
  return base.filter((t) => t.length >= 4 && !STOPWORDS.has(t))
}

// ============================================================
// similaridade — casos_similares sem vetordb
// ============================================================
// Estratégia simples e efetiva: feature-hash de lead/cliente em 6
// eixos (uf, faixa dívida, tipo pessoa, agro provável, judicial, ajuizamento)
// e encontra os N mais próximos via Jaccard sobre os buckets.
// Sem dependência externa — roda in-memory sobre a lista atual.
// Quando houver cliente com desfecho (aceitou/rejeitou/em-negociação),
// devolve o desfecho como precedente.
// ============================================================
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js'
import { getProspeccaoService } from '../../prospeccao/ProspeccaoService.js'
import { alixGetClientes } from '../../AlixService.js'

function digits(s: string): string {
  return (s || '').replace(/\D/g, '')
}

/** Bucket de dívida em faixas log-like. */
function faixaDivida(d: number): string {
  if (!d || d < 100_000) return 'divida:<100k'
  if (d < 500_000) return 'divida:100k-500k'
  if (d < 2_000_000) return 'divida:500k-2M'
  if (d < 10_000_000) return 'divida:2M-10M'
  if (d < 50_000_000) return 'divida:10M-50M'
  return 'divida:>50M'
}

function features(entity: any): Set<string> {
  const f = new Set<string>()
  const uf = entity.uf || entity.endereco?.uf
  if (uf) f.add(`uf:${String(uf).toUpperCase()}`)
  const tipo = entity.tipoPessoa
  if (tipo) f.add(`pessoa:${tipo}`)
  const divida = Number(entity.totalDivida ?? entity.valorDivida ?? 0)
  f.add(faixaDivida(divida))
  if (entity.temAjuizada) f.add('ajuizada:sim')
  else f.add('ajuizada:nao')
  const agro = entity.agroProfile?.nivel || entity.agroProfile?.provavel
  if (agro === 'forte' || agro === true) f.add('agro:forte')
  else if (agro === 'medio') f.add('agro:medio')
  else f.add('agro:fraco')
  const jud = entity.judicialProfile?.ativo
  if (jud) f.add('judicial:ativo')
  if (entity.cnpj?.cnaeFiscal) {
    const prefix = String(entity.cnpj.cnaeFiscal).slice(0, 2)
    f.add(`cnae-prefix:${prefix}`)
  }
  // signals DOU como features extras
  for (const s of entity.agroSignals || []) {
    if (s.startsWith('DOU:')) f.add(s)
  }
  return f
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union > 0 ? inter / union : 0
}

export function buildSimilaridadeTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = []
  const registry: ClaudeToolRegistry = {}

  tools.push({
    name: 'casos_similares',
    description:
      'Encontra leads/clientes com perfil similar ao alvo (UF, faixa de dívida, tipo pessoa, agro/judicial, CNAE, sinais DOU). Retorna top N com score de similaridade Jaccard e, quando cliente tem estágio registrado, o desfecho. Use para apoiar decisão com precedentes.',
    input_schema: {
      type: 'object',
      properties: {
        leadCpfCnpj: { type: 'string', description: 'CPF/CNPJ do alvo (lead ou cliente)' },
        topN: { type: 'number', description: 'quantos similares retornar (default 5)' },
        incluirLeads: { type: 'boolean', description: 'inclui leads da Prospecção além de clientes (default true)' },
      },
      required: ['leadCpfCnpj'],
    },
  })
  registry['casos_similares'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const clean = digits(String(input.leadCpfCnpj))
      const topN = Number(input.topN) || 5
      const incluirLeads = input.incluirLeads !== false

      // 1. Descobre o alvo (lead ou cliente)
      const prospec = getProspeccaoService()
      const leadAlvo = prospec.getLead(clean)
      const clientes = alixGetClientes()
      const clienteAlvo = clientes.find((c: any) => digits(String(c.cpfCnpj || c.cpfcnpj || '')) === clean)
      const alvo = clienteAlvo || leadAlvo
      if (!alvo) return { error: `alvo não encontrado: ${clean}` }

      const featsAlvo = features(alvo)

      // 2. Monta pool de candidatos (clientes + leads)
      const pool: Array<{ kind: 'cliente' | 'lead'; entity: any }> = []
      for (const c of clientes) {
        if (c === clienteAlvo) continue
        pool.push({ kind: 'cliente', entity: c })
      }
      if (incluirLeads) {
        const leads = prospec.buscar({ pageSize: 200, sortBy: 'score' as any }).leads
        for (const l of leads) {
          if (l === leadAlvo) continue
          pool.push({ kind: 'lead', entity: l })
        }
      }

      // 3. Calcula similaridade e ranqueia
      const ranked = pool
        .map((p) => ({
          ...p,
          score: jaccard(featsAlvo, features(p.entity)),
        }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)

      return {
        alvo: {
          cpfCnpj: alvo.cpfCnpj,
          nome: alvo.nome,
          tipo: clienteAlvo ? 'cliente' : 'lead',
          features: Array.from(featsAlvo),
        },
        totalCandidatos: pool.length,
        similares: ranked.map((r) => {
          const e = r.entity
          return {
            kind: r.kind,
            scoreSimilaridade: Number(r.score.toFixed(3)),
            id: e.id || e.cpfCnpjClean,
            nome: e.nome,
            uf: e.uf,
            tipoPessoa: e.tipoPessoa,
            divida: e.totalDivida ?? e.valorDivida,
            // se for cliente, traz estágio como "desfecho"
            desfecho: r.kind === 'cliente' ? (e.estagio || 'sem-estagio') : 'lead-ainda-nao-convertido',
            featuresComunsCount: Array.from(features(e)).filter((f) => featsAlvo.has(f)).length,
          }
        }),
        interpretacao:
          ranked.length === 0
            ? 'Nenhum caso comparável no portfólio atual — alvo tem perfil único.'
            : 'Casos similares ordenados por semelhança. Use estágio/desfecho como precedente para calibrar abordagem.',
      }
    },
  }

  return { tools, registry }
}

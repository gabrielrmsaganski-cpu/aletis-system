// ============================================================
// tj-processos — consulta pública de processos judiciais (Fase D.3)
// ============================================================
// Estratégia: não existe API REST pública unificada dos TJs brasileiros.
// O DataJud CNJ tem API oficial (API Pública do Poder Judiciário) mas
// exige autenticação por API_PUBLICA_KEY. Sem essa key, caímos num
// "search generator" que monta URLs das consultas web estaduais dos
// TJs mais relevantes ao agronegócio.
//
// TJs cobertos (consulta pública de nome/CPF/CNPJ):
//   - TJMT (Mato Grosso)     https://pje.tjmt.jus.br/pje/ConsultaPublica/
//   - TJGO (Goiás)           https://www.tjgo.jus.br/bnmp/consulta
//   - TJPR (Paraná)          https://pje.tjpr.jus.br/consulta-publica
//   - TJSP (São Paulo)       https://esaj.tjsp.jus.br/cpopg/open.do
//   - TJMS, TJMG, TJRS       via buscador gov.br
//
// Quando DATAJUD_API_KEY está presente, usamos a API oficial.
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'

type PortalTJ = {
  uf: string
  nome: string
  urlConsulta: string
  observacao?: string
}

const PORTAIS_TJ: PortalTJ[] = [
  { uf: 'MT', nome: 'TJMT', urlConsulta: 'https://pje.tjmt.jus.br/pje/ConsultaPublica/listView.seam' },
  { uf: 'GO', nome: 'TJGO', urlConsulta: 'https://www.tjgo.jus.br/index.php/consultaprocesso' },
  { uf: 'PR', nome: 'TJPR', urlConsulta: 'https://consulta.tjpr.jus.br/consulta-processual/' },
  { uf: 'SP', nome: 'TJSP', urlConsulta: 'https://esaj.tjsp.jus.br/cpopg/open.do' },
  { uf: 'MS', nome: 'TJMS', urlConsulta: 'https://esaj.tjms.jus.br/cpopg/open.do' },
  { uf: 'MG', nome: 'TJMG', urlConsulta: 'https://pje-consulta-publica.tjmg.jus.br/' },
  { uf: 'RS', nome: 'TJRS', urlConsulta: 'https://www.tjrs.jus.br/novo/busca/?tb=proc' },
  { uf: 'BA', nome: 'TJBA', urlConsulta: 'https://pje.tjba.jus.br/pje/ConsultaPublica/listView.seam' },
]

const CLASSES_RELEVANTES = [
  { codigo: 7, nome: 'Execução Fiscal — crédito tributário' },
  { codigo: 14714, nome: 'Recuperação Judicial — Lei 11.101/2005' },
  { codigo: 14715, nome: 'Recuperação Extrajudicial' },
  { codigo: 14716, nome: 'Falência' },
  { codigo: 159, nome: 'Execução de Título Extrajudicial' },
  { codigo: 12089, nome: 'Busca e Apreensão — Alienação Fiduciária' },
  { codigo: 182, nome: 'Embargos à Execução Fiscal' },
]

function hasDatajudKey(): boolean {
  return !!(process.env.DATAJUD_API_KEY && process.env.DATAJUD_API_KEY.trim())
}

async function datajudPorCPF(cpfCnpj: string): Promise<unknown> {
  const key = process.env.DATAJUD_API_KEY!.trim()
  // Endpoint DataJud CNJ público (Elasticsearch)
  // https://datajud-wiki.cnj.jus.br/api-publica/acesso
  const docSize = 20
  const tribunais = ['tjmt', 'tjgo', 'tjpr', 'tjsp', 'tjms', 'tjmg', 'tjrs', 'tjba']
  const out: Record<string, unknown> = {}
  for (const trib of tribunais) {
    const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${trib}/_search`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `APIKey ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          size: docSize,
          query: { match: { 'partes.parte.nome': cpfCnpj } },
          sort: [{ dataAjuizamento: { order: 'desc' } }],
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) {
        const j: any = await res.json()
        const hits = j?.hits?.hits?.map((h: any) => h._source).slice(0, 10)
        if (hits?.length) out[trib.toUpperCase()] = { total: j.hits.total?.value ?? hits.length, processos: hits }
      }
    } catch {
      /* tribunal specific fail, skip */
    }
  }
  return out
}

export function buildTjProcessosTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'consultar_processos_tj',
    description:
      'Busca processos judiciais por CPF/CNPJ nos TJs estaduais relevantes ao agro. Se DATAJUD_API_KEY estiver configurado, usa a API Pública do CNJ (Elasticsearch) para buscar em 8 tribunais simultaneamente. Sem a key, retorna URLs prontas para consulta manual + tipos de classe processual relevantes.',
    input_schema: {
      type: 'object',
      properties: {
        cpfCnpj: { type: 'string', description: 'CPF/CNPJ da parte' },
        nome: { type: 'string', description: 'alternativo ao CPF — nome completo' },
        ufs: {
          type: 'array',
          items: { type: 'string' },
          description: 'lista de UFs para filtrar (default: todas cobertas)',
        },
      },
    },
  })
  registry['consultar_processos_tj'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const cpfCnpj = String(input.cpfCnpj || '').trim()
      const nome = String(input.nome || '').trim()
      const ufsFiltro = Array.isArray(input.ufs) ? (input.ufs as string[]).map((u) => u.toUpperCase()) : null

      if (!cpfCnpj && !nome) return { error: 'cpfCnpj ou nome obrigatório' }

      if (hasDatajudKey()) {
        try {
          const result = await datajudPorCPF(cpfCnpj || nome)
          return {
            fonte: 'DataJud CNJ (api-publica.datajud.cnj.jus.br)',
            query: { cpfCnpj: cpfCnpj || null, nome: nome || null },
            resultadosPorTribunal: result,
            observacao: 'Dados oficiais via Elasticsearch. Cite o número do processo + tribunal quando usar.',
          }
        } catch (err) {
          return { error: `DataJud falhou: ${(err as Error).message}` }
        }
      }

      // Fallback: query generator
      const portais = ufsFiltro
        ? PORTAIS_TJ.filter((p) => ufsFiltro.includes(p.uf))
        : PORTAIS_TJ
      return {
        fonte: 'query-generator (DATAJUD_API_KEY não configurada)',
        query: { cpfCnpj, nome },
        portais: portais.map((p) => ({
          uf: p.uf,
          nome: p.nome,
          urlConsulta: p.urlConsulta,
          instrucao: `Abrir URL e pesquisar pelo ${cpfCnpj ? 'CPF/CNPJ' : 'nome'} na aba "Consulta Pública"`,
        })),
        classesProcessuaisRelevantes: CLASSES_RELEVANTES,
        observacao:
          'Para busca automatizada em massa, cadastre DATAJUD_API_KEY (gratuito via portal CNJ: https://datajud-wiki.cnj.jus.br/api-publica/acesso).',
      }
    },
  }

  return { tools, registry }
}

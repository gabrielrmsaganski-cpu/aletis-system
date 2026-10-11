// ============================================================
// incra-sigef — Consulta INCRA/SIGEF (Fase D.4)
// ============================================================
// SIGEF = Sistema de Gestão Fundiária do INCRA. Expõe:
//   - Parcelas certificadas (georreferenciamento + matrícula)
//   - Denominação do imóvel, município, área, proprietário
//
// Endpoint público: https://sigef.incra.gov.br/geo/parcela/
// A consulta por nome proprietário exige WFS (GeoServer):
//   https://certificacao.incra.gov.br/csv_shp/export/parcela/parcelas.wfs
//
// Estratégia: fetch HTTP direto (sem autenticação) quando possível,
// senão retorna instruções para consulta manual no portal.
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'

const SIGEF_BASE = 'https://sigef.incra.gov.br'
const SIGEF_WFS = 'https://certificacao.incra.gov.br/geoserver/wfs'

export function buildIncraSigefTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'consultar_sigef_por_proprietario',
    description:
      'Consulta parcelas certificadas no SIGEF/INCRA por nome do proprietário. Retorna lista de imóveis georreferenciados oficialmente (matrícula INCRA) com UF, município, área e denominação. Útil para validar patrimônio fundiário real de um lead agro.',
    input_schema: {
      type: 'object',
      properties: {
        nomeProprietario: { type: 'string', description: 'nome completo (case-insensitive)' },
        uf: { type: 'string', description: 'sigla UF para filtrar' },
      },
      required: ['nomeProprietario'],
    },
  })
  registry['consultar_sigef_por_proprietario'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const nome = String(input.nomeProprietario || '').trim()
      const uf = input.uf ? String(input.uf).toUpperCase() : null
      if (!nome) return { error: 'nomeProprietario obrigatório' }

      // WFS do INCRA — expõe layer "parcelas" filtrável por CQL
      // camada real: SIGEF-BRASIL:PARCELAS (pode variar)
      const cqlFilter = uf
        ? `denominacao ILIKE '%${nome}%' AND uf='${uf}'`
        : `denominacao ILIKE '%${nome}%'`

      const wfsUrl = new URL(SIGEF_WFS)
      wfsUrl.searchParams.set('service', 'WFS')
      wfsUrl.searchParams.set('version', '1.0.0')
      wfsUrl.searchParams.set('request', 'GetFeature')
      wfsUrl.searchParams.set('typeName', 'SIGEF-BRASIL:PARCELAS')
      wfsUrl.searchParams.set('outputFormat', 'application/json')
      wfsUrl.searchParams.set('maxFeatures', '20')
      wfsUrl.searchParams.set('CQL_FILTER', cqlFilter)

      try {
        const res = await fetch(wfsUrl.toString(), {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(20_000),
        })
        if (!res.ok) {
          return {
            error: `SIGEF WFS HTTP ${res.status}`,
            urlManual: `${SIGEF_BASE}/geo/parcela/`,
            observacao: 'Use a consulta manual via portal — SIGEF WFS pode ter mudado o nome da camada.',
          }
        }
        const geoJson: any = await res.json()
        const features = Array.isArray(geoJson?.features) ? geoJson.features : []
        return {
          fonte: 'INCRA/SIGEF WFS',
          query: { nome, uf },
          total: features.length,
          parcelas: features.slice(0, 20).map((f: any) => ({
            codigoParcela: f.properties?.codigo,
            denominacao: f.properties?.denominacao,
            area_ha: f.properties?.area_ha ?? f.properties?.area,
            municipio: f.properties?.municipio,
            uf: f.properties?.uf,
            statusCertificacao: f.properties?.situacao ?? f.properties?.status,
            dataRegistro: f.properties?.data_registro,
          })),
          observacao:
            'Parcelas SIGEF são imóveis georreferenciados CERTIFICADOS pelo INCRA — evidência forte de patrimônio fundiário real.',
        }
      } catch (err) {
        return {
          error: `SIGEF falhou: ${(err as Error).message}`,
          urlManual: `${SIGEF_BASE}/geo/parcela/`,
          hintQuery: `buscar "${nome}" no campo "Denominação do Imóvel"`,
        }
      }
    },
  }

  tools.push({
    name: 'consultar_sigef_por_codigo',
    description:
      'Consulta parcela SIGEF específica pelo código (quando já tiver). Retorna geometry + metadados completos.',
    input_schema: {
      type: 'object',
      properties: {
        codigoParcela: { type: 'string' },
      },
      required: ['codigoParcela'],
    },
  })
  registry['consultar_sigef_por_codigo'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const codigo = String(input.codigoParcela || '').trim()
      if (!codigo) return { error: 'codigoParcela obrigatório' }
      const wfsUrl = new URL(SIGEF_WFS)
      wfsUrl.searchParams.set('service', 'WFS')
      wfsUrl.searchParams.set('version', '1.0.0')
      wfsUrl.searchParams.set('request', 'GetFeature')
      wfsUrl.searchParams.set('typeName', 'SIGEF-BRASIL:PARCELAS')
      wfsUrl.searchParams.set('outputFormat', 'application/json')
      wfsUrl.searchParams.set('CQL_FILTER', `codigo='${codigo}'`)
      try {
        const res = await fetch(wfsUrl.toString(), {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) return { error: `SIGEF HTTP ${res.status}` }
        const j = await res.json()
        return { fonte: 'INCRA/SIGEF WFS', geoJson: j }
      } catch (err) {
        return { error: `SIGEF falhou: ${(err as Error).message}` }
      }
    },
  }

  return { tools, registry }
}

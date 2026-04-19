import axios from 'axios'
import type { GeoEnrichment } from './types'

/**
 * Enriquecimento geográfico — valida endereço e geocodifica coordenadas.
 *
 * Duas fontes públicas e gratuitas:
 *  1. ViaCEP (api.viacep.com.br) — dados Correios oficiais a partir do CEP.
 *     Retorna logradouro canônico, bairro, cidade, UF, DDD, código IBGE.
 *  2. Nominatim (openstreetmap.org) — geocoder OSM. Free, mas rate-limited
 *     (1 req/s por UA). Sempre enviamos User-Agent identificando ALETIS.
 *
 * Cache em memória (TTL 7 dias) — endereço de propriedade rural muda raramente
 * e a API ViaCEP tem política de cache pesado. Nominatim também aprecia o cache.
 */

interface ViaCepResponse {
  cep?: string
  logradouro?: string
  complemento?: string
  bairro?: string
  localidade?: string
  uf?: string
  estado?: string
  regiao?: string
  ibge?: string
  ddd?: string
  erro?: boolean
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  type?: string
  class?: string
}

const CACHE = new Map<string, { data: GeoEnrichment; at: number }>()
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const UA = 'ALETIS-CRM/1.0 (contato@aletis.com.br)'

export class GeoEnrichmentSource {
  /**
   * Dado um CEP (somente dígitos ou com hífen), retorna endereço completo
   * + lat/lng. Se `enderecoFallback` for passado, usado para geocoding quando
   * ViaCEP retorna dados vazios (ex.: CEP rural genérico da cidade).
   */
  async enrich(
    cepRaw: string,
    fallback?: { logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string },
  ): Promise<GeoEnrichment | null> {
    const cep = (cepRaw || '').replace(/\D/g, '')
    if (cep.length !== 8) {
      // Sem CEP, tenta só geocoding por cidade+UF se disponível
      if (fallback?.cidade && fallback?.uf) {
        return this.geocodeCityOnly(fallback.cidade, fallback.uf)
      }
      return null
    }

    const cacheKey = cep + '|' + (fallback?.logradouro || '') + '|' + (fallback?.numero || '')
    const cached = CACHE.get(cacheKey)
    if (cached && Date.now() - cached.at < TTL_MS) return cached.data

    // 1. ViaCEP — autoritativo p/ dados textuais
    let via: ViaCepResponse | null = null
    try {
      const res = await axios.get<ViaCepResponse>(`https://viacep.com.br/ws/${cep}/json/`, {
        timeout: 8000,
        headers: { 'User-Agent': UA },
      })
      if (res.data && !res.data.erro) via = res.data
    } catch {
      /* ViaCEP caiu → seguimos só com fallback */
    }

    const logradouro = via?.logradouro || fallback?.logradouro
    const complemento = via?.complemento || undefined
    const bairro = via?.bairro || fallback?.bairro
    const cidade = via?.localidade || fallback?.cidade || ''
    const uf = via?.uf || fallback?.uf || ''

    if (!cidade || !uf) {
      return null
    }

    // 2. Nominatim — geocoding (best effort; sem bloquear o retorno se falhar)
    const coords = await this.geocode({
      logradouro,
      numero: fallback?.numero,
      bairro,
      cidade,
      uf,
      cep,
    })

    const enderecoFormatado = [
      logradouro && fallback?.numero ? `${logradouro}, ${fallback.numero}` : logradouro,
      complemento,
      bairro,
      cidade && uf ? `${cidade}/${uf}` : cidade || uf,
      cep ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    const out: GeoEnrichment = {
      cep,
      logradouro: logradouro || undefined,
      complemento: complemento || undefined,
      bairro: bairro || undefined,
      cidade,
      uf: uf.toUpperCase(),
      codigoIbge: via?.ibge ? Number(via.ibge) : undefined,
      regiao: via?.regiao || undefined,
      ddd: via?.ddd || undefined,
      coordenadas: coords,
      enderecoFormatado: enderecoFormatado || undefined,
      enriquecidoEm: new Date().toISOString(),
    }

    CACHE.set(cacheKey, { data: out, at: Date.now() })
    return out
  }

  /**
   * Geocoding só por cidade+UF — fallback quando não temos CEP.
   * Retorna coord. aproximada do centroide urbano.
   */
  private async geocodeCityOnly(cidade: string, uf: string): Promise<GeoEnrichment | null> {
    const coords = await this.geocode({ cidade, uf })
    return {
      cep: '',
      cidade,
      uf: uf.toUpperCase(),
      coordenadas: coords,
      enderecoFormatado: `${cidade}/${uf.toUpperCase()}`,
      enriquecidoEm: new Date().toISOString(),
    }
  }

  private async geocode(params: {
    logradouro?: string
    numero?: string
    bairro?: string
    cidade: string
    uf: string
    cep?: string
  }): Promise<GeoEnrichment['coordenadas']> {
    // Query mais específica primeiro; se falhar, relaxa.
    const queries: string[] = []
    if (params.logradouro && params.numero) {
      queries.push(`${params.logradouro}, ${params.numero}, ${params.cidade}, ${params.uf}, Brasil`)
    }
    if (params.logradouro) {
      queries.push(`${params.logradouro}, ${params.cidade}, ${params.uf}, Brasil`)
    }
    if (params.cep) queries.push(`${params.cep}, Brasil`)
    queries.push(`${params.cidade}, ${params.uf}, Brasil`)

    for (const q of queries) {
      try {
        const res = await axios.get<NominatimResult[]>(
          'https://nominatim.openstreetmap.org/search',
          {
            params: { q, format: 'json', limit: 1, countrycodes: 'br' },
            headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' },
            timeout: 10_000,
          },
        )
        if (res.data && res.data.length > 0) {
          const r = res.data[0]
          const lat = Number(r.lat)
          const lng = Number(r.lon)
          if (isFinite(lat) && isFinite(lng)) {
            return { lat, lng, source: 'nominatim' }
          }
        }
      } catch {
        /* tenta a próxima query */
      }
    }
    return null
  }
}

let _instance: GeoEnrichmentSource | null = null
export function getGeoEnrichmentSource(): GeoEnrichmentSource {
  if (!_instance) _instance = new GeoEnrichmentSource()
  return _instance
}

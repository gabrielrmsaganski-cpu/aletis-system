import axios from 'axios'
import type { CnpjEnrichment } from './types'

const CACHE = new Map<string, { data: CnpjEnrichment; at: number }>()
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

/**
 * Enriquece CNPJ via BrasilAPI — retorna QSA, CNAE, endereço, capital social.
 * Fonte primária: https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 *
 * A BrasilAPI é um proxy cacheado para a base oficial RFB + Receitaws.
 * Não há chave; usa rate limit suave. CPF não é enriquecido aqui.
 */
export class BrasilAPISource {
  async enrichCnpj(cnpjRaw: string): Promise<CnpjEnrichment | null> {
    const cnpj = cnpjRaw.replace(/[^\d]/g, '')
    if (cnpj.length !== 14) return null

    const cached = CACHE.get(cnpj)
    if (cached && Date.now() - cached.at < TTL_MS) return cached.data

    try {
      const { data } = await axios.get(
        `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
        { timeout: 15_000 }
      )

      const cnaesSecundarios = Array.isArray(data.cnaes_secundarios)
        ? data.cnaes_secundarios.map((c: any) => ({
            codigo: String(c.codigo ?? ''),
            descricao: c.descricao ?? '',
          }))
        : []

      const socios = Array.isArray(data.qsa)
        ? data.qsa.map((s: any) => ({
            nome: s.nome_socio ?? s.nome ?? '',
            qualificacao: s.qualificacao_socio ?? s.qualificacao ?? '',
            dataEntrada: s.data_entrada_sociedade ?? s.data_entrada,
            faixaEtaria: s.faixa_etaria,
          }))
        : []

      const result: CnpjEnrichment = {
        razaoSocial: data.razao_social ?? '',
        nomeFantasia: data.nome_fantasia || undefined,
        cnaeFiscal: String(data.cnae_fiscal ?? ''),
        cnaeFiscalDescricao: data.cnae_fiscal_descricao ?? '',
        cnaesSecundarios,
        situacaoCadastral: data.descricao_situacao_cadastral ?? '',
        dataAbertura: data.data_inicio_atividade ?? '',
        capitalSocial: Number(data.capital_social ?? 0),
        porte: data.porte ?? data.descricao_porte,
        naturezaJuridica: data.natureza_juridica,
        endereco: {
          logradouro: data.logradouro ?? '',
          numero: data.numero ?? '',
          bairro: data.bairro ?? '',
          municipio: data.municipio ?? '',
          uf: data.uf ?? '',
          cep: data.cep ?? '',
        },
        socios,
        enriquecidoEm: new Date().toISOString(),
      }

      CACHE.set(cnpj, { data: result, at: Date.now() })
      return result
    } catch (err: any) {
      // BrasilAPI responde 404 quando o CNPJ não está na base ou é inválido
      if (err.response?.status === 404) return null
      console.warn(`[BrasilAPI] Falha ao enriquecer ${cnpj}:`, err.message)
      return null
    }
  }
}

/**
 * CNAEs de produção rural primária — 01.xx
 * Usados para confirmar que um CNPJ é realmente um produtor agro.
 */
export const CNAE_AGRO_PREFIXES = [
  '0111', '0112', '0113', '0114', '0115', '0116', '0119', // Lavouras temporárias
  '0121', '0122', '0131', '0133', '0134', '0139', // Lavouras permanentes
  '0141', '0142', // Sementes
  '0151', '0152', '0153', '0154', '0155', '0159', // Pecuária
  '0161', '0162', '0163', // Serviços agropecuários
  '0170', // Caça
]

export function isAgroCnae(cnae: string): boolean {
  const prefix = (cnae || '').replace(/[^\d]/g, '').slice(0, 4)
  return CNAE_AGRO_PREFIXES.includes(prefix)
}

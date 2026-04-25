// ============================================================
// clima — tools meteorológicas/ambientais para ALIX (Fase D.1)
// ============================================================
// Integra via DataSourceManager:
//   - ClimaService (INMET estações + CPTEC/INPE + NASA POWER)
//   - NasaFirmsService (focos de incêndio)
//   - DeterService (alertas de desmatamento INPE/TerraBrasilis)
//
// Expõe 3 tools:
//   1. alertas_climaticos_agro(uf) — resumo cruzado para tomada de decisão
//   2. queimadas_regiao(lat, lon, raioKm) — focos próximos (FIRMS)
//   3. alertas_desmatamento_municipio(codigoIbge) — DETER por município
// ============================================================
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js'
import { DataSourceManager } from '../../DataSourceManager.js'

export function buildClimaTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = []
  const registry: ClaudeToolRegistry = {}

  tools.push({
    name: 'alertas_climaticos_agro',
    description:
      'Retorna panorama climático/ambiental AGRO cruzado para uma UF: alertas meteorológicos (INMET/CPTEC), focos de incêndio recentes (NASA FIRMS) e desmatamento (INPE DETER). Use para avaliar risco operacional/crédito rural ou para contextualizar proposta.',
    input_schema: {
      type: 'object',
      properties: {
        uf: { type: 'string', description: 'sigla UF (ex.: MT, GO, PR)' },
      },
      required: ['uf'],
    },
  })
  registry['alertas_climaticos_agro'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const uf = String(input.uf || '').toUpperCase()
      if (!uf) return { error: 'UF obrigatória' }
      const dsm = DataSourceManager.getInstance()
      const [alertas, incendios] = await Promise.allSettled([
        dsm.clima.getAlertasRegiao(uf),
        dsm.nasaFirms.getIncendiosBrasil(),
      ])
      const alertasOk = alertas.status === 'fulfilled' ? alertas.value : []
      const incendiosOk = incendios.status === 'fulfilled' ? incendios.value : null
      // Filtra focos por UF se estrutura expuser
      const focosUf = (incendiosOk as any)?.porEstado?.[uf] ?? (incendiosOk as any)?.[uf] ?? null
      return {
        uf,
        hoje: new Date().toISOString().slice(0, 10),
        alertasMeteorologicos: alertasOk.slice(0, 10),
        totalAlertas: alertasOk.length,
        incendiosNacional: incendiosOk
          ? {
              totalFocos: (incendiosOk as any).total ?? (incendiosOk as any).totalFocos ?? null,
              focosUf: focosUf,
              ultimaAtualizacao: (incendiosOk as any).ultimaAtualizacao ?? null,
            }
          : null,
        observacao:
          'Use para: (a) contextualizar impacto em safra; (b) justificar prazos estendidos em reestruturação; (c) alertar sobre risco de Proagro/seguro rural.',
      }
    },
  }

  tools.push({
    name: 'queimadas_regiao',
    description:
      'Focos de incêndio nas últimas 24h dentro de um raio (km) a partir de lat/lon. Útil para leads com coordenadas CAR ou fazendas com endereço geocodificado.',
    input_schema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'latitude (ex.: -13.5 para MT)' },
        lon: { type: 'number', description: 'longitude' },
        raioKm: { type: 'number', description: 'raio em km (default 50)' },
      },
      required: ['lat', 'lon'],
    },
  })
  registry['queimadas_regiao'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const lat = Number(input.lat)
      const lon = Number(input.lon)
      const raio = Number(input.raioKm) || 50
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: 'lat/lon inválidos' }
      try {
        const r = await DataSourceManager.getInstance().nasaFirms.getIncendiosProximos(lat, lon, raio)
        return {
          origem: lat.toFixed(4) + ',' + lon.toFixed(4),
          raioKm: raio,
          resultado: r,
        }
      } catch (err) {
        return { error: `FIRMS falhou: ${(err as Error).message}` }
      }
    },
  }

  tools.push({
    name: 'alertas_desmatamento_municipio',
    description:
      'Busca alertas de desmatamento DETER/INPE por município (código IBGE de 7 dígitos). Importante para compliance de crédito rural (CMN 5.081/2023) — município com alerta pode ter crédito bloqueado.',
    input_schema: {
      type: 'object',
      properties: {
        codigoIbge: { type: 'string', description: 'código IBGE 7 dígitos' },
        diasRetroativos: { type: 'number', description: 'dias para olhar para trás (default 90)' },
      },
      required: ['codigoIbge'],
    },
  })
  registry['alertas_desmatamento_municipio'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const codigo = String(input.codigoIbge || '').replace(/\D/g, '')
      const dias = Number(input.diasRetroativos) || 90
      if (codigo.length !== 7) return { error: 'codigoIbge precisa ter 7 dígitos' }
      try {
        const r = await DataSourceManager.getInstance().deter.buscarAlertasPorMunicipio(codigo, { diasRetroativos: dias } as any)
        return r
      } catch (err) {
        return { error: `DETER falhou: ${(err as Error).message}` }
      }
    },
  }

  tools.push({
    name: 'previsao_clima_municipio',
    description:
      'Previsão do tempo 4-7 dias para um município (código CPTEC/INMET). Traz temperatura, chuva, umidade.',
    input_schema: {
      type: 'object',
      properties: {
        codigoCidade: { type: 'string', description: 'código CPTEC da cidade' },
        dias: { type: 'number', description: 'default 4, max 7' },
      },
      required: ['codigoCidade'],
    },
  })
  registry['previsao_clima_municipio'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      try {
        const r = await DataSourceManager.getInstance().clima.getPrevisao(
          String(input.codigoCidade),
          Number(input.dias) || 4,
        )
        return r
      } catch (err) {
        return { error: `previsão falhou: ${(err as Error).message}` }
      }
    },
  }

  return { tools, registry }
}

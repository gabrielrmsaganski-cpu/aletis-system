// ============================================================
// sicar-live — consulta SICAR individual via captcha (Fase D.2)
// ============================================================
// Wrapper do SICARClient já existente que resolve reCAPTCHA v2 via 2captcha
// e busca dados reais de um imóvel pelo COD_IMOVEL.
//
// Custo: cada chamada consome ~US$ 0.003 do saldo 2captcha.
// Status: degrada com graça quando portal offline (aviso Dataprev).
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { getSICARClient } from '../../prospeccao/SICARClient.js'

export function buildSicarLiveTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'sicar_status_live',
    description:
      'Verifica status do portal SICAR oficial (sem consumir captcha). Retorna online/offline + motivo. Use antes de consultar CAR individual para evitar desperdício.',
    input_schema: { type: 'object', properties: {} },
  })
  registry['sicar_status_live'] = {
    spec: tools[tools.length - 1],
    handler: async () => {
      try {
        const status = await getSICARClient().checkStatus()
        return {
          online: status.online,
          motivo: status.reason,
          sitekeyPreview: status.sitekey?.slice(0, 12),
          observacao: status.online
            ? 'Consulta individual habilitada — use consultar_car_individual.'
            : 'Portal indisponível. Alix retomará automaticamente via cron quando voltar.',
        }
      } catch (err) {
        return { error: `status check falhou: ${(err as Error).message}` }
      }
    },
  }

  tools.push({
    name: 'consultar_car_individual',
    description:
      'Consulta dados oficiais de um imóvel rural no SICAR pelo COD_IMOVEL (formato: "UF-XXXXXXX-YYYYY...-Z"). Usa 2captcha para resolver reCAPTCHA v2 (~US$0.003 por chamada, ~30s). Retorna área total, área de preservação, reserva legal, antropizada, status de análise, município e UF. Degrada quando portal offline.',
    input_schema: {
      type: 'object',
      properties: {
        codImovel: { type: 'string', description: 'Código CAR do imóvel (ex.: "MT-5103403-F4CA5B...")' },
      },
      required: ['codImovel'],
    },
  })
  registry['consultar_car_individual'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const codImovel = String(input.codImovel || '').trim()
      if (!codImovel || codImovel.length < 10) {
        return { error: 'codImovel inválido (deve seguir formato UF-IBGE-HASH...)' }
      }
      // Pre-check de status — evita gastar captcha se portal offline
      try {
        const status = await getSICARClient().checkStatus()
        if (!status.online) {
          return {
            error: 'SICAR offline',
            motivo: status.reason,
            observacao: 'Cron tenta 2×/dia; quando voltar, re-execute.',
          }
        }
      } catch {
        return { error: 'não foi possível verificar status SICAR' }
      }

      try {
        const t0 = Date.now()
        const result = await getSICARClient().consultarPorCodigo(codImovel)
        const latencyMs = Date.now() - t0
        return {
          ...result,
          meta: {
            latencyMs,
            captchaConsumido: true,
            observacao: 'Dados oficiais SICAR — auditável e defensável em propostas/pareceres.',
          },
        }
      } catch (err: any) {
        return {
          error: err?.message || 'consulta falhou',
          codigo: err?.code,
          observacao: 'Verifique formato do codImovel e saldo 2captcha.',
        }
      }
    },
  }

  return { tools, registry }
}

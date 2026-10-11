import type { LLMToolRegistry } from '../../llm/types.js'
import { safeWrapRegistry } from './safe-handler.js'

/** Prazo de cada ferramenta; uma geração documental pode levar mais que uma consulta. */
export function wrapOrchestratorTools(registry: LLMToolRegistry): LLMToolRegistry {
  return safeWrapRegistry(registry, {
    defaultTimeoutMs: 25_000,
    overrides: {
      consultar_car_individual: 60_000,
      delegate_deal_analyzer: 120_000,
      delegate_web_researcher: 90_000,
      delegate_crm_writer: 45_000,
      delegate_doc_generator: 180_000,
      gerar_documento_notebook: 90_000,
      analisar_documento_profundo: 90_000,
      enriquecer_lead: 45_000,
      onboarding_lead_blueprint: 60_000,
      noticias_agro_hoje: 45_000,
      cotacoes_hoje: 20_000,
      alertas_climaticos_agro: 25_000,
      consultar_processos_tj: 45_000,
      consultar_sigef_por_proprietario: 30_000,
      buscar_arquivos_drive_cliente: 45_000,
      consultar_cobertura_drive_cliente: 45_000,
      importar_documento_drive_para_alix: 60_000,
    },
  })
}

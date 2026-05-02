// ============================================================
// BackupService — export/import JSON completo do grupo
// ============================================================
import { getGestaoFinanceiraService } from './GestaoFinanceiraService.js'
import { getGestaoFinanceiraServiceV2 } from './GestaoFinanceiraServiceV2.js'

export interface BackupBundle {
  versao: string
  geradoEm: string
  grupo: any
  membros: any[]
  culturas: any[]
  custos: any[]
  demandas: any[]
  contratos: any[]
  fazendas: any[]
  ativosOutros: any[]
  passivosOutros: any[]
  garantias: any[]
  premissas: any[]
  metadata: {
    consultorId?: string | null
    dataBase: string
  }
}

export class BackupService {
  async exportar(grupoId: string): Promise<BackupBundle> {
    const svc = getGestaoFinanceiraService()
    const svcV2 = getGestaoFinanceiraServiceV2()
    const grupo = await svc.obterGrupo(grupoId)
    if (!grupo) throw new Error(`Grupo ${grupoId} não encontrado`)

    const [membros, culturas, custos, demandas, contratos, fazendas, ativosOutros, passivosOutros, garantias, premissas] = await Promise.all([
      svc.listarMembros(grupoId),
      svc.listarCulturas(grupoId),
      svc.listarCustos(grupoId),
      svc.listarDemandas(grupoId),
      svc.listarContratos(grupoId),
      svc.listarFazendas(grupoId),
      svcV2.listarAtivosOutros(grupoId),
      svcV2.listarPassivosOutros(grupoId),
      svcV2.listarGarantias(grupoId),
      svcV2.listarPremissas(grupoId),
    ])

    return {
      versao: '1.0',
      geradoEm: new Date().toISOString(),
      grupo,
      membros,
      culturas,
      custos,
      demandas,
      contratos,
      fazendas,
      ativosOutros,
      passivosOutros,
      garantias,
      premissas,
      metadata: {
        consultorId: (grupo as any).consultorId ?? null,
        dataBase: grupo.dataBase,
      },
    }
  }

  /** Importa em um grupo NOVO (cria) ou alvo existente. Não duplica IDs. */
  async importar(bundle: BackupBundle, opts: { clienteId: string; novoNomeGrupo?: string; aplicarEm?: string } = { clienteId: '' }): Promise<{ grupoId: string; contadores: any }> {
    const svc = getGestaoFinanceiraService()
    const svcV2 = getGestaoFinanceiraServiceV2()

    let grupoId: string
    if (opts.aplicarEm) {
      grupoId = opts.aplicarEm
    } else {
      // cria novo grupo
      const novo = await svc.criarGrupo({
        clienteId: opts.clienteId || (bundle.grupo as any).clienteId,
        nomeGrupo: opts.novoNomeGrupo ?? `${bundle.grupo.nomeGrupo} (importado)`,
        dataBase: bundle.grupo.dataBase,
        historico: bundle.grupo.historico ?? undefined,
        observacoes: bundle.grupo.observacoes ?? undefined,
      })
      grupoId = novo.id
    }

    const contadores = { membros: 0, culturas: 0, custos: 0, contratos: 0, fazendas: 0, demandas: 0, ativosOutros: 0, passivosOutros: 0, garantias: 0, premissas: 0 }

    for (const m of bundle.membros ?? []) {
      try {
        await svc.upsertMembro({ ...m, id: undefined, grupoId })
        contadores.membros++
      } catch {}
    }
    for (const c of bundle.culturas ?? []) {
      try {
        await svc.upsertCultura({ ...c, id: undefined, grupoId })
        contadores.culturas++
      } catch {}
    }
    for (const c of bundle.custos ?? []) {
      try {
        await svc.upsertCusto({ ...c, id: undefined, grupoId })
        contadores.custos++
      } catch {}
    }
    for (const c of bundle.contratos ?? []) {
      try {
        await svc.upsertContrato({ ...c, id: undefined, grupoId })
        contadores.contratos++
      } catch {}
    }
    for (const f of bundle.fazendas ?? []) {
      try {
        await svc.upsertFazenda({ ...f, id: undefined, grupoId })
        contadores.fazendas++
      } catch {}
    }
    for (const d of bundle.demandas ?? []) {
      try {
        await svc.upsertDemanda({ ...d, id: undefined, grupoId })
        contadores.demandas++
      } catch {}
    }
    for (const a of bundle.ativosOutros ?? []) {
      try {
        await svcV2.upsertAtivoOutro({ ...a, id: undefined, grupoId })
        contadores.ativosOutros++
      } catch {}
    }
    for (const p of bundle.passivosOutros ?? []) {
      try {
        await svcV2.upsertPassivoOutro({ ...p, id: undefined, grupoId })
        contadores.passivosOutros++
      } catch {}
    }
    for (const g of bundle.garantias ?? []) {
      try {
        await svcV2.upsertGarantia({ ...g, id: undefined, grupoId })
        contadores.garantias++
      } catch {}
    }
    for (const p of bundle.premissas ?? []) {
      try {
        await svcV2.upsertPremissa({ ...p, id: undefined, grupoId })
        contadores.premissas++
      } catch {}
    }

    return { grupoId, contadores }
  }
}

let _instance: BackupService | null = null
export function getBackupService(): BackupService {
  if (!_instance) _instance = new BackupService()
  return _instance
}

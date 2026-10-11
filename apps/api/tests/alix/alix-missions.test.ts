import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AlixMissionService,
  ALIX_WORK_MODES,
  normalizeWorkMode,
  structureMissionResponse,
  workModePrompt,
} from '../../src/services/alix/workspace/AlixMissionService.js'

describe('ALIX Workspace por missões', () => {
  it('expõe os seis modos de trabalho definidos', () => {
    expect(ALIX_WORK_MODES).toEqual([
      'client_analysis', 'documentary', 'negotiation', 'research', 'document_generation', 'due_diligence',
    ])
    for (const mode of ALIX_WORK_MODES) expect(workModePrompt(mode).length).toBeGreaterThan(40)
    expect(normalizeWorkMode('desconhecido')).toBe('client_analysis')
  })

  it('estrutura conclusão, fatos, riscos, lacunas e próxima ação', () => {
    const result = structureMissionResponse(`
## Conclusão
O contrato precisa de revisão antes da negociação.

## Fatos
- Saldo confirmado no contrato.
- Vencimento em 2027.

## Riscos
- Garantia com descrição incompleta.

## Lacunas
- Falta o extrato atualizado.

## Próxima ação
Solicitar o extrato e validar a garantia com o consultor.
    `)
    expect(result.conclusion).toContain('precisa de revisão')
    expect(result.facts).toHaveLength(2)
    expect(result.risks).toEqual(['Garantia com descrição incompleta.'])
    expect(result.gaps).toEqual(['Falta o extrato atualizado.'])
    expect(result.nextAction).toContain('Solicitar o extrato')
  })

  it('mantém resposta bruta e fornece fallback seguro sem headings', () => {
    const result = structureMissionResponse('Análise ainda inconclusiva por falta de documentos.')
    expect(result.conclusion).toBe('Análise ainda inconclusiva por falta de documentos.')
    expect(result.facts).toEqual([])
    expect(result.nextAction).toContain('Revisar')
    expect(result.rawResponse).toContain('inconclusiva')
  })

  it('aceita títulos acentuados na mesma linha, inclusive em negrito', () => {
    const result = structureMissionResponse(`
Conclusão: ciclo válido
Fatos: fonte persistida
Riscos: nenhum no smoke
Lacunas: nenhuma
**Próxima ação:** liberar operação
    `)
    expect(result.conclusion).toBe('ciclo válido')
    expect(result.facts).toEqual(['fonte persistida'])
    expect(result.risks).toEqual(['nenhum no smoke'])
    expect(result.gaps).toEqual(['nenhuma'])
    expect(result.nextAction).toBe('liberar operação')
  })

  it('retoma do primeiro passo não concluído sem perder o progresso', async () => {
    const previousPg = process.env.ALETIS_PG_ENABLED
    process.env.ALETIS_PG_ENABLED = '0'
    const storageDir = await mkdtemp(join(tmpdir(), 'aletis-mission-'))
    try {
      const service = new AlixMissionService(storageDir)
      const created = await service.create({ sessionId: 'session-resume', prompt: 'Analisar operação', workMode: 'due_diligence' })
      await service.start(created.id)
      await service.advance(created.id, 'analyze')
      await service.cancel(created.id)
      const queued = await service.resume(created.id)
      const resumed = await service.start(created.id)

      expect(queued.currentStep).toBe('analyze')
      expect(resumed.currentStep).toBe('analyze')
      expect(resumed.progress).toBe(55)
      expect(resumed.steps.find((step) => step.code === 'scope')?.status).toBe('completed')
      expect(resumed.steps.find((step) => step.code === 'gather')?.status).toBe('completed')
      expect(resumed.steps.find((step) => step.code === 'analyze')?.status).toBe('running')
      const repeated = await service.advance(created.id, 'gather', 'Callback atrasado')
      expect(repeated.currentStep).toBe('analyze')
      expect(repeated.progress).toBe(55)
      expect(repeated.steps.find((step) => step.code === 'gather')?.status).toBe('completed')
    } finally {
      if (previousPg == null) delete process.env.ALETIS_PG_ENABLED
      else process.env.ALETIS_PG_ENABLED = previousPg
      await rm(storageDir, { recursive: true, force: true })
    }
  })

  it('resultado concluído permanece terminal diante de callbacks atrasados', async () => {
    const previousPg = process.env.ALETIS_PG_ENABLED
    process.env.ALETIS_PG_ENABLED = '0'
    const storageDir = await mkdtemp(join(tmpdir(), 'aletis-mission-terminal-'))
    try {
      const service = new AlixMissionService(storageDir)
      const mission = await service.create({ sessionId: 'terminal', prompt: 'Preparar plano' })
      await service.start(mission.id)
      await service.complete(mission.id, { response: 'Plano preparado.' })
      expect((await service.advance(mission.id, 'analyze')).status).toBe('completed')
      expect((await service.fail(mission.id, new Error('Callback tardio'))).status).toBe('completed')
      const persisted = await service.get(mission.id)
      expect(persisted?.progress).toBe(100)
      expect(persisted?.result?.rawResponse).toBe('Plano preparado.')
    } finally {
      if (previousPg == null) delete process.env.ALETIS_PG_ENABLED
      else process.env.ALETIS_PG_ENABLED = previousPg
      await rm(storageDir, { recursive: true, force: true })
    }
  })

  it('leitores concorrentes nunca recebem JSON parcial durante a publicação do resultado', async () => {
    const previousPg = process.env.ALETIS_PG_ENABLED
    process.env.ALETIS_PG_ENABLED = '0'
    const storageDir = await mkdtemp(join(tmpdir(), 'aletis-mission-atomic-'))
    try {
      const service = new AlixMissionService(storageDir)
      const mission = await service.create({ sessionId: 'atomic', prompt: 'Preparar plano' })
      const target = join(storageDir, `${mission.id}.json`)
      const update = service.complete(mission.id, { response: 'Evidência confirmada. '.repeat(30_000) })
      await Promise.all([update, ...Array.from({ length: 40 }, async () => {
        const snapshot = JSON.parse(await readFile(target, 'utf8'))
        expect(snapshot.id).toBe(mission.id)
        expect(['queued', 'completed']).toContain(snapshot.status)
      })])
      expect((await service.get(mission.id))?.status).toBe('completed')
      expect((await readdir(storageDir)).filter(file => file.endsWith('.tmp'))).toEqual([])
    } finally {
      if (previousPg == null) delete process.env.ALETIS_PG_ENABLED
      else process.env.ALETIS_PG_ENABLED = previousPg
      await rm(storageDir, { recursive: true, force: true })
    }
  })

  it('callbacks simultâneos preservam conclusão e fontes entre instâncias do serviço', async () => {
    const previousPg = process.env.ALETIS_PG_ENABLED
    process.env.ALETIS_PG_ENABLED = '0'
    const storageDir = await mkdtemp(join(tmpdir(), 'aletis-mission-concurrency-'))
    try {
      const first = new AlixMissionService(storageDir)
      const second = new AlixMissionService(storageDir)
      const mission = await first.create({ sessionId: 'concurrent', prompt: 'Preparar análise' })
      await first.start(mission.id)
      await Promise.all([
        first.addSources(mission.id, [{ kind: 'test', sourceId: 'a', label: 'Fonte A' }]),
        second.addSources(mission.id, [{ kind: 'test', sourceId: 'b', label: 'Fonte B' }]),
      ])
      await Promise.all([
        first.complete(mission.id, { response: 'Resultado final preservado.' }),
        second.advance(mission.id, 'gather', 'Callback atrasado'),
        first.fail(mission.id, new Error('Erro atrasado')),
        second.complete(mission.id, { response: 'Resultado que não deve sobrescrever.' }),
      ])
      const result = await second.get(mission.id)
      expect(result?.status).toBe('completed')
      expect(result?.progress).toBe(100)
      expect(result?.result?.rawResponse).toBe('Resultado final preservado.')
      expect(result?.sources.map(source => source.sourceId).sort()).toEqual(['a', 'b'])
      expect(result?.steps.every(step => step.status === 'completed')).toBe(true)
      const interrupted = await first.create({ sessionId: 'failed', prompt: 'Análise interrompida' })
      await first.start(interrupted.id)
      await first.fail(interrupted.id, new Error('Consulta não concluída'))
      expect((await second.complete(interrupted.id, { response: 'Callback atrasado' })).status).toBe('failed')
      expect((await first.get(interrupted.id))?.result).toBeUndefined()
    } finally {
      if (previousPg == null) delete process.env.ALETIS_PG_ENABLED
      else process.env.ALETIS_PG_ENABLED = previousPg
      await rm(storageDir, { recursive: true, force: true })
    }
  })
})

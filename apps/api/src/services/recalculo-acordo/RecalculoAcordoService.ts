import { randomUUID } from 'node:crypto'
import {
  calcularRecalculoAcordo,
  RECALCULO_INDICES_REGISTRY,
  type RecalculoAcordoInput,
  type RecalculoAcordoResultado,
  type RecalculoIndiceMensal,
} from '@aletis/financial-calc'
import { auditAsync } from '../../db/AuditLog.js'
import { getPool, isPgEnabled } from '../../db/client.js'

export interface RecalculoAcordoRecord {
  id: string
  codigo: string
  organizationId: string
  usuarioId?: string
  usuarioNome?: string
  clienteId?: string
  propostaId?: string
  negociacaoId?: string
  titulo: string
  indiceCode: string
  corrigirAte: string
  moraMensalPct: string
  metodologia: string
  inputs: RecalculoAcordoInput
  resultado: RecalculoAcordoResultado
  snapshot: { serie: RecalculoIndiceMensal[]; capturedAt: string; source: string }
  versao: number
  arquivadoEm?: string
  criadoEm: string
  atualizadoEm: string
}

const records = new Map<string, RecalculoAcordoRecord>()
const series = new Map<string, RecalculoIndiceMensal[]>()
let sequence = 0

function nextCode(): string {
  sequence += 1
  return `REC-${new Date().getUTCFullYear()}-${String(sequence).padStart(6, '0')}`
}

function registry(code: string) {
  const value = RECALCULO_INDICES_REGISTRY.find((item) => item.code === code)
  if (!value) throw new Error(`Índice não cadastrado: ${code}`)
  return value
}

export class RecalculoAcordoService {
  listIndices() {
    return RECALCULO_INDICES_REGISTRY.map((item) => {
      const values = series.get(item.code) ?? []
      const last = values.slice().sort((a, b) => a.periodo.localeCompare(b.periodo)).at(-1)
      return { ...item, ultimoPeriodo: last?.periodo ?? null, status: last ? 'ATUALIZADO_LOCAL' : 'SEM_DADOS_LOCAIS' }
    })
  }

  setSeries(code: string, values: RecalculoIndiceMensal[]): void {
    registry(code)
    const unique = new Map(values.map((value) => [value.periodo, value]))
    series.set(code, [...unique.values()].sort((a, b) => a.periodo.localeCompare(b.periodo)))
  }

  getSeries(code: string, from?: string, to?: string): RecalculoIndiceMensal[] {
    registry(code)
    return (series.get(code) ?? []).filter((value) => (!from || value.periodo >= from) && (!to || value.periodo <= to))
  }

  calculate(input: Omit<RecalculoAcordoInput, 'serie'>): RecalculoAcordoResultado {
    registry(input.indiceCode)
    const available = series.get(input.indiceCode) ?? []
    if (available.length === 0) throw new Error(`Não há série local sincronizada para ${input.indiceCode}. Atualize os índices e tente novamente.`)
    return calcularRecalculoAcordo({ ...input, serie: available })
  }

  async save(input: Omit<RecalculoAcordoInput, 'serie'> & { titulo: string; organizationId?: string; usuarioId?: string; usuarioNome?: string; clienteId?: string; propostaId?: string; negociacaoId?: string }, actor = 'system'): Promise<RecalculoAcordoRecord> {
    const result = this.calculate(input)
    const now = new Date().toISOString()
    const source = registry(input.indiceCode).provider
    const record: RecalculoAcordoRecord = {
      id: randomUUID(), codigo: nextCode(), organizationId: input.organizationId ?? 'default', usuarioId: input.usuarioId, usuarioNome: input.usuarioNome,
      clienteId: input.clienteId, propostaId: input.propostaId, negociacaoId: input.negociacaoId, titulo: input.titulo,
      indiceCode: input.indiceCode, corrigirAte: input.corrigirAte, moraMensalPct: input.moraMensalPct,
      metodologia: 'compatibilidade_planilha_v1', inputs: { ...input, serie: undefined as never }, resultado: result,
      snapshot: { serie: this.getSeries(input.indiceCode), capturedAt: now, source }, versao: 1, criadoEm: now, atualizadoEm: now,
    }
    records.set(record.id, record)
    if (isPgEnabled()) {
      try {
        await getPool().query(`INSERT INTO recalculo_acordo (id,codigo,organization_id,usuario_id,usuario_nome,cliente_id,proposta_id,negociacao_id,titulo,indice_code,corrigir_ate,mora_mensal_pct,metodologia,inputs,resultado,snapshot,versao,criado_em,atualizado_em) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$18)`, [record.id, record.codigo, record.organizationId, record.usuarioId ?? null, record.usuarioNome ?? null, record.clienteId ?? null, record.propostaId ?? null, record.negociacaoId ?? null, record.titulo, record.indiceCode, record.corrigirAte, record.moraMensalPct, record.metodologia, JSON.stringify(record.inputs), JSON.stringify(record.resultado), JSON.stringify(record.snapshot), record.versao, now])
      } catch (error) { console.warn('[recalculo] persistência PG indisponível; mantendo cálculo em memória:', (error as Error).message) }
    }
    auditAsync({ ator: actor, acao: 'create', recurso: `recalculo_acordo:${record.id}`, dadosDepois: { codigo: record.codigo, indiceCode: record.indiceCode, resultado: result } })
    return record
  }

  async hydrate(): Promise<void> {
    if (!isPgEnabled()) return
    const { rows } = await getPool().query('SELECT * FROM recalculo_acordo WHERE arquivado_em IS NULL ORDER BY criado_em DESC')
    for (const row of rows) records.set(row.id, { ...row, organizationId: row.organization_id, usuarioId: row.usuario_id, usuarioNome: row.usuario_nome, clienteId: row.cliente_id, propostaId: row.proposta_id, negociacaoId: row.negociacao_id, indiceCode: row.indice_code, corrigirAte: row.corrigir_ate, moraMensalPct: String(row.mora_mensal_pct), arquivadoEm: row.arquivado_em?.toISOString?.(), criadoEm: row.criado_em.toISOString(), atualizadoEm: row.atualizado_em.toISOString(), inputs: row.inputs, resultado: row.resultado, snapshot: row.snapshot })
  }

  async hydrateSeries(): Promise<void> {
    if (!isPgEnabled()) return
    const { rows } = await getPool().query('SELECT mi.code, v.reference_period, v.monthly_rate, v.cumulative_factor, v.provider, v.source_url, v.fetched_at FROM monetary_index_value v JOIN monetary_index mi ON mi.id=v.monetary_index_id WHERE v.revision=(SELECT max(v2.revision) FROM monetary_index_value v2 WHERE v2.monetary_index_id=v.monetary_index_id AND v2.reference_period=v.reference_period) ORDER BY mi.code, v.reference_period')
    for (const row of rows) {
      const list = series.get(row.code) ?? []
      list.push({ periodo: row.reference_period, taxaMensal: String(row.monthly_rate), fatorAcumulado: String(row.cumulative_factor), fonte: row.provider, sourceUrl: row.source_url, fetchedAt: row.fetched_at?.toISOString?.() })
      series.set(row.code, list)
    }
  }

  get(id: string, organizationId = 'default'): RecalculoAcordoRecord | null {
    const record = records.get(id)
    return record && record.organizationId === organizationId && !record.arquivadoEm ? record : null
  }

  list(organizationId = 'default'): RecalculoAcordoRecord[] {
    return [...records.values()].filter((record) => record.organizationId === organizationId && !record.arquivadoEm).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }

  async duplicate(id: string, actor = 'system', organizationId = 'default'): Promise<RecalculoAcordoRecord> {
    const original = this.get(id, organizationId)
    if (!original) throw new Error('Recálculo não encontrado.')
    return this.save({ ...original.inputs, titulo: `${original.titulo} (cópia)`, organizationId, usuarioId: original.usuarioId, usuarioNome: original.usuarioNome, clienteId: original.clienteId, propostaId: original.propostaId, negociacaoId: original.negociacaoId }, actor)
  }

  async archive(id: string, actor = 'system', organizationId = 'default'): Promise<void> {
    const record = this.get(id, organizationId)
    if (!record) throw new Error('Recálculo não encontrado.')
    record.arquivadoEm = new Date().toISOString(); record.atualizadoEm = record.arquivadoEm
    if (isPgEnabled()) await getPool().query('UPDATE recalculo_acordo SET arquivado_em=$1, atualizado_em=$1 WHERE id=$2 AND organization_id=$3', [record.arquivadoEm, id, organizationId])
    auditAsync({ ator: actor, acao: 'archive', recurso: `recalculo_acordo:${id}` })
  }

  clearForTests(): void { records.clear(); series.clear(); sequence = 0 }
}

let singleton: RecalculoAcordoService | undefined
export function getRecalculoAcordoService(): RecalculoAcordoService {
  singleton ??= new RecalculoAcordoService()
  return singleton
}

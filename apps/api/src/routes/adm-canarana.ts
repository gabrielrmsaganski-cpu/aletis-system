/**
 * ADM Canarana — Rotas administrativas do escritório de Canarana.
 *
 * Prefixo: /api/adm-canarana
 *
 * Recursos:
 *   - Dashboard (receitas, despesas, folha, saldo, metas, alertas)
 *   - DRE (Demonstração do Resultado do Exercício)
 *   - Funcionários (CRUD)
 *   - Receitas do escritório (CRUD)
 *   - Despesas do escritório (CRUD)
 *   - Folha de pagamento (CRUD)
 *   - Metas (CRUD)
 *   - Projetos / Pipeline comercial (CRUD)
 *   - Comentários (CRUD)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { eq, and } from 'drizzle-orm'

/* ─── Serviços ALIX Intake (OCR + Extração LLM) ─── */
let _parsePdf: any, _processImage: any, _extractDocViaLlm: any, _extractEntitiesFromDocument: any
async function lazyLoadIntake() {
  if (!_parsePdf) {
    const mod = await import('../services/alix/intake/PdfParser.js')
    _parsePdf = mod.parsePdf
  }
  if (!_processImage) {
    const mod = await import('../services/alix/intake/ImageProcessor.js')
    _processImage = mod.processImage
  }
  if (!_extractDocViaLlm) {
    const mod = await import('../services/alix/intake/LlmDocExtractor.js')
    _extractDocViaLlm = mod.extractDocViaLlm
  }
  if (!_extractEntitiesFromDocument) {
    const mod = await import('../services/alix/intake/DocEntityExtractor.js')
    _extractEntitiesFromDocument = mod.extractEntitiesFromDocument
  }
  return { parsePdf: _parsePdf, processImage: _processImage, extractDocViaLlm: _extractDocViaLlm, extractEntitiesFromDocument: _extractEntitiesFromDocument }
}
import { getDb, isPgEnabled } from '../db/client.js'
import {
  admFuncionario as funcionarioTable,
  admReceita as receitaTable,
  admDespesa as despesaTable,
  admFolhaPagamento as folhaTable,
  admMeta as metaTable,
  admProjeto as projetoTable,
  admComentario as comentarioTable,
} from '../db/schema.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

/* ─── In-Memory Stores ─── */
interface Funcionario {
  id: string; nome: string; cargo: string; escritorio: string; salarioBase: number
  dataContratacao?: string; telefone?: string; email?: string
  status: 'ativo' | 'ferias' | 'afastado' | 'desligado'
  observacoes?: string; criadoEm: string; atualizadoEm: string
}
interface Receita {
  id: string; escritorio: string; competencia: string; descricao: string
  origem?: string; valor: number; dataRecebimento?: string
  formaPagamento?: string; status: 'recebida' | 'previsto' | 'atrasada'
  criadoEm: string; atualizadoEm: string
}
interface Despesa {
  id: string; escritorio: string; competencia: string; descricao: string
  categoria: string; fornecedor?: string; valor: number
  dataPagamento?: string; dataVencimento?: string
  status: 'pago' | 'pendente' | 'atrasado'
  criadoEm: string; atualizadoEm: string
}
interface FolhaPagamento {
  id: string; funcionarioId: string; escritorio: string; competencia: string
  salarioBase: number; bonus: number; descontos: number; valorLiquido: number
  dataPagamento?: string; status: 'pago' | 'previsto' | 'atrasado'
  criadoEm: string; atualizadoEm: string
}
interface Meta {
  id: string; escritorio: string; competencia: string; tipo: 'receita' | 'despesa' | 'folha' | 'contratos' | 'clientes'
  valorMeta: number; atual: number; criadoEm: string; atualizadoEm: string
}
interface Projeto {
  id: string; escritorio: string; titulo: string; cliente?: string; consultor?: string
  valorEstimado: number; valorFechado: number
  etapa: 'prospeccao' | 'analise' | 'proposta' | 'negociacao' | 'contrato' | 'concluido' | 'perdido'
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente'
  dataPrevisaoFechamento?: string; observacoes?: string
  criadoEm: string; atualizadoEm: string
}
interface Comentario {
  id: string; escritorio: string; entidadeTipo: string; entidadeId: string
  autor: string; conteudo: string; criadoEm: string
}

const funcionarios = new Map<string, Funcionario>()
const receitas = new Map<string, Receita>()
const despesas = new Map<string, Despesa>()
const folhas = new Map<string, FolhaPagamento>()
const metas = new Map<string, Meta>()
const projetos = new Map<string, Projeto>()
const comentarios = new Map<string, Comentario>()

const PG = isPgEnabled()
const db = PG ? getDb() : null

/* ─── Helpers ─── */
function novoId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function agora(): string {
  return new Date().toISOString()
}

function compAnterior(comp: string): string {
  const [y, m] = comp.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

/* ─── CRUD Funcionários ─── */
async function listarFuncionarios(escritorio: string): Promise<Funcionario[]> {
  if (PG && db) {
    const rows = await db.select().from(funcionarioTable).where(eq(funcionarioTable.escritorio, escritorio)).orderBy(funcionarioTable.nome)
    return rows.map((r) => ({
      id: r.id, nome: r.nome, cargo: r.cargo, escritorio: r.escritorio,
      salarioBase: Number(r.salarioBase ?? 0), dataContratacao: r.dataContratacao ?? undefined,
      telefone: r.telefone ?? undefined, email: r.email ?? undefined,
      status: r.status as Funcionario['status'], observacoes: r.observacoes ?? undefined,
      criadoEm: r.criadoEm.toISOString(), atualizadoEm: r.atualizadoEm.toISOString(),
    }))
  }
  return Array.from(funcionarios.values()).filter((f) => f.escritorio === escritorio).sort((a, b) => a.nome.localeCompare(b.nome))
}

async function criarFuncionario(data: Omit<Funcionario, 'id' | 'criadoEm' | 'atualizadoEm'>): Promise<Funcionario> {
  const f: Funcionario = { ...data, id: novoId('func'), criadoEm: agora(), atualizadoEm: agora() }
  if (PG && db) {
    await db.insert(funcionarioTable).values({
      id: f.id, nome: f.nome, cargo: f.cargo, escritorio: f.escritorio,
      salarioBase: String(f.salarioBase), dataContratacao: f.dataContratacao,
      telefone: f.telefone, email: f.email, status: f.status,
      observacoes: f.observacoes, payload: {},
      criadoEm: new Date(), atualizadoEm: new Date(),
    })
  }
  funcionarios.set(f.id, f)
  return f
}

async function atualizarFuncionario(id: string, data: Partial<Omit<Funcionario, 'id' | 'criadoEm' | 'atualizadoEm'>>): Promise<Funcionario | null> {
  const atual = funcionarios.get(id) || Array.from(funcionarios.values()).find((f) => f.id === id)
  if (!atual) return null
  const att = { ...atual, ...data, atualizadoEm: agora() }
  if (PG && db) {
    await db.update(funcionarioTable).set({
      nome: att.nome, cargo: att.cargo, escritorio: att.escritorio,
      salarioBase: String(att.salarioBase), dataContratacao: att.dataContratacao,
      telefone: att.telefone, email: att.email, status: att.status,
      observacoes: att.observacoes, atualizadoEm: new Date(),
    }).where(eq(funcionarioTable.id, id))
  }
  funcionarios.set(id, att)
  return att
}

async function excluirFuncionario(id: string): Promise<boolean> {
  if (PG && db) await db.delete(funcionarioTable).where(eq(funcionarioTable.id, id))
  return funcionarios.delete(id)
}

/* ─── CRUD Receitas ─── */
async function listarReceitas(escritorio: string, competencia?: string): Promise<Receita[]> {
  if (PG && db) {
    const cond = competencia
      ? and(eq(receitaTable.escritorio, escritorio), eq(receitaTable.competencia, competencia))
      : eq(receitaTable.escritorio, escritorio)
    const rows = await db.select().from(receitaTable).where(cond).orderBy(receitaTable.dataRecebimento)
    return rows.map((r) => ({
      id: r.id, escritorio: r.escritorio, competencia: r.competencia, descricao: r.descricao,
      origem: r.origem ?? undefined, valor: Number(r.valor), dataRecebimento: r.dataRecebimento ?? undefined,
      formaPagamento: r.formaPagamento ?? undefined, status: r.status as Receita['status'],
      criadoEm: r.criadoEm.toISOString(), atualizadoEm: r.atualizadoEm.toISOString(),
    }))
  }
  return Array.from(receitas.values())
    .filter((r) => r.escritorio === escritorio && (!competencia || r.competencia === competencia))
    .sort((a, b) => (a.dataRecebimento || '').localeCompare(b.dataRecebimento || ''))
}

async function criarReceita(data: Omit<Receita, 'id' | 'criadoEm' | 'atualizadoEm'>): Promise<Receita> {
  const r: Receita = { ...data, id: novoId('rec'), criadoEm: agora(), atualizadoEm: agora() }
  if (PG && db) {
    await db.insert(receitaTable).values({
      id: r.id, escritorio: r.escritorio, competencia: r.competencia, descricao: r.descricao,
      origem: r.origem, valor: String(r.valor), dataRecebimento: r.dataRecebimento,
      formaPagamento: r.formaPagamento, status: r.status, payload: {},
      criadoEm: new Date(), atualizadoEm: new Date(),
    })
  }
  receitas.set(r.id, r)
  return r
}

async function atualizarReceita(id: string, data: Partial<Omit<Receita, 'id' | 'criadoEm' | 'atualizadoEm'>>): Promise<Receita | null> {
  const atual = receitas.get(id) || Array.from(receitas.values()).find((r) => r.id === id)
  if (!atual) return null
  const att = { ...atual, ...data, atualizadoEm: agora() }
  if (PG && db) {
    await db.update(receitaTable).set({
      escritorio: att.escritorio, competencia: att.competencia, descricao: att.descricao,
      origem: att.origem, valor: String(att.valor), dataRecebimento: att.dataRecebimento,
      formaPagamento: att.formaPagamento, status: att.status, atualizadoEm: new Date(),
    }).where(eq(receitaTable.id, id))
  }
  receitas.set(id, att)
  return att
}

async function excluirReceita(id: string): Promise<boolean> {
  if (PG && db) await db.delete(receitaTable).where(eq(receitaTable.id, id))
  return receitas.delete(id)
}

/* ─── CRUD Despesas ─── */
async function listarDespesas(escritorio: string, competencia?: string): Promise<Despesa[]> {
  if (PG && db) {
    const cond = competencia
      ? and(eq(despesaTable.escritorio, escritorio), eq(despesaTable.competencia, competencia))
      : eq(despesaTable.escritorio, escritorio)
    const rows = await db.select().from(despesaTable).where(cond).orderBy(despesaTable.dataPagamento)
    return rows.map((r) => ({
      id: r.id, escritorio: r.escritorio, competencia: r.competencia, descricao: r.descricao,
      categoria: r.categoria, fornecedor: r.fornecedor ?? undefined, valor: Number(r.valor),
      dataPagamento: r.dataPagamento ?? undefined, dataVencimento: r.dataVencimento ?? undefined,
      status: r.status as Despesa['status'], criadoEm: r.criadoEm.toISOString(), atualizadoEm: r.atualizadoEm.toISOString(),
    }))
  }
  return Array.from(despesas.values())
    .filter((d) => d.escritorio === escritorio && (!competencia || d.competencia === competencia))
    .sort((a, b) => (a.dataPagamento || '').localeCompare(b.dataPagamento || ''))
}

async function criarDespesa(data: Omit<Despesa, 'id' | 'criadoEm' | 'atualizadoEm'>): Promise<Despesa> {
  const d: Despesa = { ...data, id: novoId('desp'), criadoEm: agora(), atualizadoEm: agora() }
  if (PG && db) {
    await db.insert(despesaTable).values({
      id: d.id, escritorio: d.escritorio, competencia: d.competencia, descricao: d.descricao,
      categoria: d.categoria, fornecedor: d.fornecedor, valor: String(d.valor),
      dataPagamento: d.dataPagamento, dataVencimento: d.dataVencimento,
      status: d.status, payload: {}, criadoEm: new Date(), atualizadoEm: new Date(),
    })
  }
  despesas.set(d.id, d)
  return d
}

async function atualizarDespesa(id: string, data: Partial<Omit<Despesa, 'id' | 'criadoEm' | 'atualizadoEm'>>): Promise<Despesa | null> {
  const atual = despesas.get(id) || Array.from(despesas.values()).find((d) => d.id === id)
  if (!atual) return null
  const att = { ...atual, ...data, atualizadoEm: agora() }
  if (PG && db) {
    await db.update(despesaTable).set({
      escritorio: att.escritorio, competencia: att.competencia, descricao: att.descricao,
      categoria: att.categoria, fornecedor: att.fornecedor, valor: String(att.valor),
      dataPagamento: att.dataPagamento, dataVencimento: att.dataVencimento,
      status: att.status, atualizadoEm: new Date(),
    }).where(eq(despesaTable.id, id))
  }
  despesas.set(id, att)
  return att
}

async function excluirDespesa(id: string): Promise<boolean> {
  if (PG && db) await db.delete(despesaTable).where(eq(despesaTable.id, id))
  return despesas.delete(id)
}

/* ─── CRUD Folha de Pagamento ─── */
async function listarFolha(escritorio: string, competencia?: string): Promise<FolhaPagamento[]> {
  if (PG && db) {
    const cond = competencia
      ? and(eq(folhaTable.escritorio, escritorio), eq(folhaTable.competencia, competencia))
      : eq(folhaTable.escritorio, escritorio)
    const rows = await db.select().from(folhaTable).where(cond).orderBy(folhaTable.dataPagamento)
    return rows.map((r) => ({
      id: r.id, funcionarioId: r.funcionarioId, escritorio: r.escritorio, competencia: r.competencia,
      salarioBase: Number(r.salarioBase), bonus: Number(r.bonus ?? 0), descontos: Number(r.descontos ?? 0),
      valorLiquido: Number(r.valorLiquido), dataPagamento: r.dataPagamento ?? undefined,
      status: r.status as FolhaPagamento['status'], criadoEm: r.criadoEm.toISOString(), atualizadoEm: r.atualizadoEm.toISOString(),
    }))
  }
  return Array.from(folhas.values())
    .filter((f) => f.escritorio === escritorio && (!competencia || f.competencia === competencia))
    .sort((a, b) => (a.dataPagamento || '').localeCompare(b.dataPagamento || ''))
}

async function criarFolha(data: Omit<FolhaPagamento, 'id' | 'criadoEm' | 'atualizadoEm'>): Promise<FolhaPagamento> {
  const f: FolhaPagamento = { ...data, id: novoId('fol'), criadoEm: agora(), atualizadoEm: agora() }
  if (PG && db) {
    await db.insert(folhaTable).values({
      id: f.id, funcionarioId: f.funcionarioId, escritorio: f.escritorio, competencia: f.competencia,
      salarioBase: String(f.salarioBase), bonus: String(f.bonus), descontos: String(f.descontos),
      valorLiquido: String(f.valorLiquido), dataPagamento: f.dataPagamento, status: f.status, payload: {},
      criadoEm: new Date(), atualizadoEm: new Date(),
    })
  }
  folhas.set(f.id, f)
  return f
}

async function atualizarFolha(id: string, data: Partial<Omit<FolhaPagamento, 'id' | 'criadoEm' | 'atualizadoEm'>>): Promise<FolhaPagamento | null> {
  const atual = folhas.get(id) || Array.from(folhas.values()).find((f) => f.id === id)
  if (!atual) return null
  const att = { ...atual, ...data, atualizadoEm: agora() }
  if (PG && db) {
    await db.update(folhaTable).set({
      funcionarioId: att.funcionarioId, escritorio: att.escritorio, competencia: att.competencia,
      salarioBase: String(att.salarioBase), bonus: String(att.bonus), descontos: String(att.descontos),
      valorLiquido: String(att.valorLiquido), dataPagamento: att.dataPagamento, status: att.status,
      atualizadoEm: new Date(),
    }).where(eq(folhaTable.id, id))
  }
  folhas.set(id, att)
  return att
}

async function excluirFolha(id: string): Promise<boolean> {
  if (PG && db) await db.delete(folhaTable).where(eq(folhaTable.id, id))
  return folhas.delete(id)
}

/* ─── CRUD Metas ─── */
async function listarMetas(escritorio: string, competencia?: string): Promise<Meta[]> {
  if (PG && db) {
    const cond = competencia
      ? and(eq(metaTable.escritorio, escritorio), eq(metaTable.competencia, competencia))
      : eq(metaTable.escritorio, escritorio)
    const rows = await db.select().from(metaTable).where(cond)
    return rows.map((r) => ({
      id: r.id, escritorio: r.escritorio, competencia: r.competencia, tipo: r.tipo as Meta['tipo'],
      valorMeta: Number(r.valorMeta), atual: Number(r.atual ?? 0),
      criadoEm: r.criadoEm.toISOString(), atualizadoEm: r.atualizadoEm.toISOString(),
    }))
  }
  return Array.from(metas.values())
    .filter((m) => m.escritorio === escritorio && (!competencia || m.competencia === competencia))
}

async function criarMeta(data: Omit<Meta, 'id' | 'criadoEm' | 'atualizadoEm'>): Promise<Meta> {
  const m: Meta = { ...data, id: novoId('meta'), criadoEm: agora(), atualizadoEm: agora() }
  if (PG && db) {
    await db.insert(metaTable).values({
      id: m.id, escritorio: m.escritorio, competencia: m.competencia, tipo: m.tipo,
      valorMeta: String(m.valorMeta), atual: String(m.atual), payload: {},
      criadoEm: new Date(), atualizadoEm: new Date(),
    })
  }
  metas.set(m.id, m)
  return m
}

async function atualizarMeta(id: string, data: Partial<Omit<Meta, 'id' | 'criadoEm' | 'atualizadoEm'>>): Promise<Meta | null> {
  const atual = metas.get(id) || Array.from(metas.values()).find((m) => m.id === id)
  if (!atual) return null
  const att = { ...atual, ...data, atualizadoEm: agora() }
  if (PG && db) {
    await db.update(metaTable).set({
      escritorio: att.escritorio, competencia: att.competencia, tipo: att.tipo,
      valorMeta: String(att.valorMeta), atual: String(att.atual), atualizadoEm: new Date(),
    }).where(eq(metaTable.id, id))
  }
  metas.set(id, att)
  return att
}

async function excluirMeta(id: string): Promise<boolean> {
  if (PG && db) await db.delete(metaTable).where(eq(metaTable.id, id))
  return metas.delete(id)
}

/* ─── CRUD Projetos ─── */
async function listarProjetos(escritorio: string, etapa?: string): Promise<Projeto[]> {
  if (PG && db) {
    const cond = etapa
      ? and(eq(projetoTable.escritorio, escritorio), eq(projetoTable.etapa, etapa))
      : eq(projetoTable.escritorio, escritorio)
    const rows = await db.select().from(projetoTable).where(cond).orderBy(projetoTable.prioridade)
    return rows.map((r) => ({
      id: r.id, escritorio: r.escritorio, titulo: r.titulo, cliente: r.cliente ?? undefined,
      consultor: r.consultor ?? undefined, valorEstimado: Number(r.valorEstimado ?? 0),
      valorFechado: Number(r.valorFechado ?? 0), etapa: r.etapa as Projeto['etapa'],
      prioridade: r.prioridade as Projeto['prioridade'], dataPrevisaoFechamento: r.dataPrevisaoFechamento ?? undefined,
      observacoes: r.observacoes ?? undefined, criadoEm: r.criadoEm.toISOString(), atualizadoEm: r.atualizadoEm.toISOString(),
    }))
  }
  let list = Array.from(projetos.values()).filter((p) => p.escritorio === escritorio)
  if (etapa) list = list.filter((p) => p.etapa === etapa)
  return list.sort((a, b) => {
    const prio = { urgente: 0, alta: 1, media: 2, baixa: 3 }
    return (prio[a.prioridade] ?? 2) - (prio[b.prioridade] ?? 2)
  })
}

async function criarProjeto(data: Omit<Projeto, 'id' | 'criadoEm' | 'atualizadoEm'>): Promise<Projeto> {
  const p: Projeto = { ...data, id: novoId('proj'), criadoEm: agora(), atualizadoEm: agora() }
  if (PG && db) {
    await db.insert(projetoTable).values({
      id: p.id, escritorio: p.escritorio, titulo: p.titulo, cliente: p.cliente,
      consultor: p.consultor, valorEstimado: String(p.valorEstimado), valorFechado: String(p.valorFechado),
      etapa: p.etapa, prioridade: p.prioridade, dataPrevisaoFechamento: p.dataPrevisaoFechamento,
      observacoes: p.observacoes, payload: {}, criadoEm: new Date(), atualizadoEm: new Date(),
    })
  }
  projetos.set(p.id, p)
  return p
}

async function atualizarProjeto(id: string, data: Partial<Omit<Projeto, 'id' | 'criadoEm' | 'atualizadoEm'>>): Promise<Projeto | null> {
  const atual = projetos.get(id) || Array.from(projetos.values()).find((p) => p.id === id)
  if (!atual) return null
  const att = { ...atual, ...data, atualizadoEm: agora() }
  if (PG && db) {
    await db.update(projetoTable).set({
      escritorio: att.escritorio, titulo: att.titulo, cliente: att.cliente, consultor: att.consultor,
      valorEstimado: String(att.valorEstimado), valorFechado: String(att.valorFechado),
      etapa: att.etapa, prioridade: att.prioridade, dataPrevisaoFechamento: att.dataPrevisaoFechamento,
      observacoes: att.observacoes, atualizadoEm: new Date(),
    }).where(eq(projetoTable.id, id))
  }
  projetos.set(id, att)
  return att
}

async function excluirProjeto(id: string): Promise<boolean> {
  if (PG && db) await db.delete(projetoTable).where(eq(projetoTable.id, id))
  return projetos.delete(id)
}

/* ─── CRUD Comentários ─── */
async function listarComentarios(escritorio: string, entidadeTipo: string, entidadeId: string): Promise<Comentario[]> {
  if (PG && db) {
    const rows = await db.select().from(comentarioTable)
      .where(and(eq(comentarioTable.escritorio, escritorio), eq(comentarioTable.entidadeTipo, entidadeTipo), eq(comentarioTable.entidadeId, entidadeId)))
      .orderBy(comentarioTable.criadoEm)
    return rows.map((r) => ({
      id: r.id, escritorio: r.escritorio, entidadeTipo: r.entidadeTipo, entidadeId: r.entidadeId,
      autor: r.autor, conteudo: r.conteudo, criadoEm: r.criadoEm.toISOString(),
    }))
  }
  return Array.from(comentarios.values())
    .filter((c) => c.escritorio === escritorio && c.entidadeTipo === entidadeTipo && c.entidadeId === entidadeId)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
}

async function criarComentario(data: Omit<Comentario, 'id' | 'criadoEm'>): Promise<Comentario> {
  const c: Comentario = { ...data, id: novoId('comm'), criadoEm: agora() }
  if (PG && db) {
    await db.insert(comentarioTable).values({
      id: c.id, escritorio: c.escritorio, entidadeTipo: c.entidadeTipo, entidadeId: c.entidadeId,
      autor: c.autor, conteudo: c.conteudo, payload: {}, criadoEm: new Date(),
    })
  }
  comentarios.set(c.id, c)
  return c
}

async function excluirComentario(id: string): Promise<boolean> {
  if (PG && db) await db.delete(comentarioTable).where(eq(comentarioTable.id, id))
  return comentarios.delete(id)
}

/* ════════════════════════════════════════════════
 * ROUTES
 * ════════════════════════════════════════════════ */
export default async function (fastify: FastifyInstance) {
  const ESCRITORIO = 'Canarana'

  /* ═══ DASHBOARD ═══ */
  fastify.get('/api/adm-canarana/dashboard', async (req: FastifyRequest) => {
    const { competencia } = req.query as { competencia?: string }
    const comp = competencia || new Date().toISOString().slice(0, 7)

    const [funcs, recs, dsps, pays, metasAtuais, projs] = await Promise.all([
      listarFuncionarios(ESCRITORIO),
      listarReceitas(ESCRITORIO, comp),
      listarDespesas(ESCRITORIO, comp),
      listarFolha(ESCRITORIO, comp),
      listarMetas(ESCRITORIO, comp),
      listarProjetos(ESCRITORIO),
    ])

    const totalReceitas = recs.reduce((s, r) => s + r.valor, 0)
    const totalDespesas = dsps.reduce((s, d) => s + d.valor, 0)
    const totalFolha = pays.reduce((s, p) => s + p.valorLiquido, 0)
    const saldo = totalReceitas - totalDespesas - totalFolha

    const receitasPorCategoria: Record<string, number> = {}
    const despesasPorCategoria: Record<string, number> = {}
    for (const r of recs) { receitasPorCategoria[r.origem || 'Outro'] = (receitasPorCategoria[r.origem || 'Outro'] || 0) + r.valor }
    for (const d of dsps) { despesasPorCategoria[d.categoria] = (despesasPorCategoria[d.categoria] || 0) + d.valor }

    const funcionariosAtivos = funcs.filter((f) => f.status === 'ativo')
    const folhaMensal = funcionariosAtivos.reduce((s, f) => s + f.salarioBase, 0)

    // Métricas comerciais
    const pipelineValor = projs.reduce((s, p) => s + p.valorEstimado, 0)
    const pipelineFechado = projs.filter((p) => p.etapa === 'concluido').reduce((s, p) => s + p.valorFechado, 0)
    const propostasAtivas = projs.filter((p) => ['proposta', 'negociacao'].includes(p.etapa)).length
    const novosClientes = projs.filter((p) => p.etapa !== 'perdido' && p.criadoEm.startsWith(comp)).length

    // Meta vs realizado
    const metaReceita = metasAtuais.find((m) => m.tipo === 'receita')
    const metaDespesa = metasAtuais.find((m) => m.tipo === 'despesa')
    const metaFolha = metasAtuais.find((m) => m.tipo === 'folha')

    // Alertas
    const alertas: Array<{ tipo: 'receita' | 'despesa' | 'folha'; mensagem: string; severidade: 'alta' | 'media' | 'baixa' }> = []
    const receitasAtrasadas = recs.filter((r) => r.status === 'atrasada')
    const despesasVencidas = dsps.filter((d) => d.status === 'atrasado')
    const folhaPendente = pays.filter((p) => p.status === 'previsto' || p.status === 'atrasado')
    if (receitasAtrasadas.length) alertas.push({ tipo: 'receita', mensagem: `${receitasAtrasadas.length} receita(s) atrasada(s) — ${fmtCurrency(receitasAtrasadas.reduce((s, r) => s + r.valor, 0))}`, severidade: 'alta' })
    if (despesasVencidas.length) alertas.push({ tipo: 'despesa', mensagem: `${despesasVencidas.length} despesa(s) vencida(s) — ${fmtCurrency(despesasVencidas.reduce((s, d) => s + d.valor, 0))}`, severidade: 'alta' })
    if (folhaPendente.length) alertas.push({ tipo: 'folha', mensagem: `${folhaPendente.length} pagamento(s) de folha pendente(s)`, severidade: 'media' })
    const margem = totalReceitas > 0 ? ((totalReceitas - totalDespesas - totalFolha) / totalReceitas) * 100 : 0
    if (margem < 10) alertas.push({ tipo: 'receita', mensagem: `Margem operacional está em ${margem.toFixed(1)}% — abaixo do ideal`, severidade: 'media' })

    return ok({
      competencia: comp,
      resumo: {
        totalReceitas, totalDespesas, totalFolha, saldo,
        margemPercentual: margem,
        numFuncionarios: funcs.length,
        numFuncionariosAtivos: funcionariosAtivos.length,
        folhaMensalPrevista: folhaMensal,
        ticketMedio: recs.length ? totalReceitas / recs.length : 0,
        pipelineValor,
        pipelineFechado,
        propostasAtivas,
        novosClientes,
      },
      receitasPorCategoria,
      despesasPorCategoria,
      metas: metasAtuais,
      alertas,
      funcionarios: funcs,
      receitas: recs,
      despesas: dsps,
      folha: pays,
      projetos: projs,
    })
  })

  /* ═══ FLUXO ACUMULADO (12 meses) ═══ */
  fastify.get('/api/adm-canarana/fluxo-anual/:ano', async (req: FastifyRequest) => {
    const { ano } = req.params as { ano: string }
    const y = Number(ano)
    const meses = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
    const resultado = []
    for (const comp of meses) {
      const [recs, dsps, pays] = await Promise.all([
        listarReceitas(ESCRITORIO, comp),
        listarDespesas(ESCRITORIO, comp),
        listarFolha(ESCRITORIO, comp),
      ])
      const receita = recs.reduce((s, r) => s + r.valor, 0)
      const despesa = dsps.reduce((s, d) => s + d.valor, 0) + pays.reduce((s, p) => s + p.valorLiquido, 0)
      const folha = pays.reduce((s, p) => s + p.valorLiquido, 0)
      resultado.push({ competencia: comp, receita, despesa, folha, saldo: receita - despesa })
    }
    return ok(resultado)
  })

  /* ═══ DRE ═══ */
  fastify.get('/api/adm-canarana/dre', async (req: FastifyRequest) => {
    const { competencia } = req.query as { competencia?: string }
    const comp = competencia || new Date().toISOString().slice(0, 7)
    const [recs, dsps, pays] = await Promise.all([
      listarReceitas(ESCRITORIO, comp),
      listarDespesas(ESCRITORIO, comp),
      listarFolha(ESCRITORIO, comp),
    ])

    const receitaBruta = recs.filter((r) => r.status === 'recebida').reduce((s, r) => s + r.valor, 0)
    const receitaPrevista = recs.filter((r) => r.status === 'previsto').reduce((s, r) => s + r.valor, 0)
    const receitaTotal = recs.reduce((s, r) => s + r.valor, 0)
    const impostoSimplificado = receitaBruta * 0.06 // ISS / DAS aproximado
    const receitaLiquida = receitaBruta - impostoSimplificado

    const despesasOperacionais = dsps.filter((d) => !['salario', 'folha', 'imposto'].includes(d.categoria.toLowerCase())).reduce((s, d) => s + d.valor, 0)
    const totalFolha = pays.reduce((s, p) => s + p.valorLiquido, 0)
    const provisaoINSS = totalFolha * 0.2 // ~20% INSS patronal
    const provisaoFGTS = totalFolha * 0.08 // 8% FGTS
    const provisao13 = totalFolha / 12
    const custoTotalFolha = totalFolha + provisaoINSS + provisaoFGTS + provisao13

    const ebitda = receitaLiquida - despesasOperacionais - custoTotalFolha
    const depreciacao = receitaBruta * 0.02
    const lucroOperacional = ebitda - depreciacao
    const ir = lucroOperacional > 0 ? lucroOperacional * 0.15 : 0
    const lucroLiquido = lucroOperacional - ir

    return ok({
      competencia: comp,
      dre: {
        receitaBruta,
        receitaPrevista,
        receitaTotal,
        impostoSimplificado,
        receitaLiquida,
        despesasOperacionais,
        totalFolha,
        provisaoINSS,
        provisaoFGTS,
        provisao13,
        custoTotalFolha,
        ebitda,
        margemEbitda: receitaBruta > 0 ? (ebitda / receitaBruta) * 100 : 0,
        depreciacao,
        lucroOperacional,
        margemOperacional: receitaBruta > 0 ? (lucroOperacional / receitaBruta) * 100 : 0,
        ir,
        lucroLiquido,
        margemLiquida: receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0,
      },
    })
  })

  /* ═══ ALERTAS ═══ */
  fastify.get('/api/adm-canarana/alertas', async (req: FastifyRequest) => {
    const { competencia } = req.query as { competencia?: string }
    const comp = competencia || new Date().toISOString().slice(0, 7)
    const [recs, dsps, pays] = await Promise.all([
      listarReceitas(ESCRITORIO, comp),
      listarDespesas(ESCRITORIO, comp),
      listarFolha(ESCRITORIO, comp),
    ])
    const alertas: Array<{ id: string; tipo: string; mensagem: string; severidade: 'alta' | 'media' | 'baixa'; valor?: number }> = []
    const hoje = new Date().toISOString().slice(0, 10)

    for (const r of recs) {
      if (r.status === 'atrasada') {
        alertas.push({ id: `rec-${r.id}`, tipo: 'receita', mensagem: `Receita "${r.descricao}" atrasada (${r.origem || 'sem origem'})`, severidade: 'alta', valor: r.valor })
      } else if (r.status === 'previsto' && r.dataRecebimento && r.dataRecebimento < hoje) {
        alertas.push({ id: `rec-${r.id}`, tipo: 'receita', mensagem: `Receita "${r.descricao}" vencida e não recebida`, severidade: 'alta', valor: r.valor })
      }
    }
    for (const d of dsps) {
      if (d.status === 'atrasado') {
        alertas.push({ id: `desp-${d.id}`, tipo: 'despesa', mensagem: `Despesa "${d.descricao}" atrasada (${d.categoria})`, severidade: 'alta', valor: d.valor })
      } else if (d.status === 'pendente' && d.dataVencimento && d.dataVencimento < hoje) {
        alertas.push({ id: `desp-${d.id}`, tipo: 'despesa', mensagem: `Despesa "${d.descricao}" vencida e não paga`, severidade: 'alta', valor: d.valor })
      }
    }
    for (const p of pays) {
      if (p.status === 'atrasado') {
        alertas.push({ id: `fol-${p.id}`, tipo: 'folha', mensagem: `Pagamento de folha atrasado`, severidade: 'media', valor: p.valorLiquido })
      }
    }

    const totalRec = recs.reduce((s, r) => s + r.valor, 0)
    const saldo = totalRec - dsps.reduce((s, d) => s + d.valor, 0) - pays.reduce((s, p) => s + p.valorLiquido, 0)
    if (saldo < 0) alertas.push({ id: 'saldo-neg', tipo: 'geral', mensagem: `Saldo negativo no mês: ${fmtCurrency(saldo)}`, severidade: 'alta', valor: saldo })

    // Projetos com previsão próxima
    const projs = await listarProjetos(ESCRITORIO)
    for (const p of projs) {
      if (p.etapa === 'contrato' && p.dataPrevisaoFechamento) {
        const diff = Math.ceil((new Date(p.dataPrevisaoFechamento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        if (diff >= 0 && diff <= 7) {
          alertas.push({ id: `proj-${p.id}`, tipo: 'projeto', mensagem: `Projeto "${p.titulo}" previsto para fechar em ${diff} dia(s)`, severidade: 'baixa' })
        }
      }
    }

    return ok({ alertas, total: alertas.length, criticos: alertas.filter((a) => a.severidade === 'alta').length })
  })

  /* ═══ FUNCIONÁRIOS ═══ */
  fastify.get('/api/adm-canarana/funcionarios', async () => ok(await listarFuncionarios(ESCRITORIO)))

  fastify.post('/api/adm-canarana/funcionarios', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Omit<Funcionario, 'id' | 'criadoEm' | 'atualizadoEm'>
    if (!body.nome?.trim()) { reply.status(400); return fail('Nome é obrigatório') }
    if (!body.cargo?.trim()) { reply.status(400); return fail('Cargo é obrigatório') }
    const f = await criarFuncionario({ ...body, escritorio: ESCRITORIO })
    reply.status(201)
    return ok(f)
  })

  fastify.put('/api/adm-canarana/funcionarios/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<Omit<Funcionario, 'id' | 'criadoEm' | 'atualizadoEm'>>
    const f = await atualizarFuncionario(id, body)
    if (!f) { reply.status(404); return fail('Funcionário não encontrado') }
    return ok(f)
  })

  fastify.delete('/api/adm-canarana/funcionarios/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = await excluirFuncionario(id)
    if (!okDel) { reply.status(404); return fail('Funcionário não encontrado') }
    return ok({ deleted: true })
  })

  /* ═══ RECEITAS ═══ */
  fastify.get('/api/adm-canarana/receitas', async (req: FastifyRequest) => {
    const { competencia } = req.query as { competencia?: string }
    return ok(await listarReceitas(ESCRITORIO, competencia))
  })

  fastify.post('/api/adm-canarana/receitas', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Omit<Receita, 'id' | 'criadoEm' | 'atualizadoEm'>
    if (!body.descricao?.trim()) { reply.status(400); return fail('Descrição é obrigatória') }
    if (!body.valor || body.valor <= 0) { reply.status(400); return fail('Valor deve ser maior que zero') }
    const r = await criarReceita({ ...body, escritorio: ESCRITORIO })
    reply.status(201)
    return ok(r)
  })

  fastify.put('/api/adm-canarana/receitas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<Omit<Receita, 'id' | 'criadoEm' | 'atualizadoEm'>>
    const r = await atualizarReceita(id, body)
    if (!r) { reply.status(404); return fail('Receita não encontrada') }
    return ok(r)
  })

  fastify.delete('/api/adm-canarana/receitas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = await excluirReceita(id)
    if (!okDel) { reply.status(404); return fail('Receita não encontrada') }
    return ok({ deleted: true })
  })

  /* ═══ DESPESAS ═══ */
  fastify.get('/api/adm-canarana/despesas', async (req: FastifyRequest) => {
    const { competencia } = req.query as { competencia?: string }
    return ok(await listarDespesas(ESCRITORIO, competencia))
  })

  fastify.post('/api/adm-canarana/despesas', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Omit<Despesa, 'id' | 'criadoEm' | 'atualizadoEm'>
    if (!body.descricao?.trim()) { reply.status(400); return fail('Descrição é obrigatória') }
    if (!body.categoria?.trim()) { reply.status(400); return fail('Categoria é obrigatória') }
    if (!body.valor || body.valor <= 0) { reply.status(400); return fail('Valor deve ser maior que zero') }
    const d = await criarDespesa({ ...body, escritorio: ESCRITORIO })
    reply.status(201)
    return ok(d)
  })

  fastify.put('/api/adm-canarana/despesas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<Omit<Despesa, 'id' | 'criadoEm' | 'atualizadoEm'>>
    const d = await atualizarDespesa(id, body)
    if (!d) { reply.status(404); return fail('Despesa não encontrada') }
    return ok(d)
  })

  fastify.delete('/api/adm-canarana/despesas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = await excluirDespesa(id)
    if (!okDel) { reply.status(404); return fail('Despesa não encontrada') }
    return ok({ deleted: true })
  })

  /* ═══ FOLHA DE PAGAMENTO ═══ */
  fastify.get('/api/adm-canarana/folha', async (req: FastifyRequest) => {
    const { competencia } = req.query as { competencia?: string }
    return ok(await listarFolha(ESCRITORIO, competencia))
  })

  fastify.post('/api/adm-canarana/folha', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Omit<FolhaPagamento, 'id' | 'criadoEm' | 'atualizadoEm'>
    if (!body.funcionarioId?.trim()) { reply.status(400); return fail('Funcionário é obrigatório') }
    if (!body.valorLiquido || body.valorLiquido <= 0) { reply.status(400); return fail('Valor líquido deve ser maior que zero') }
    const bonus = body.bonus ?? 0
    const descontos = body.descontos ?? 0
    const func = funcionarios.get(body.funcionarioId)
    const salario = func ? func.salarioBase : body.salarioBase
    const liquido = salario + bonus - descontos
    const f = await criarFolha({ ...body, escritorio: ESCRITORIO, valorLiquido: liquido })
    reply.status(201)
    return ok(f)
  })

  fastify.put('/api/adm-canarana/folha/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<Omit<FolhaPagamento, 'id' | 'criadoEm' | 'atualizadoEm'>>
    const f = await atualizarFolha(id, body)
    if (!f) { reply.status(404); return fail('Pagamento não encontrado') }
    return ok(f)
  })

  fastify.delete('/api/adm-canarana/folha/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = await excluirFolha(id)
    if (!okDel) { reply.status(404); return fail('Pagamento não encontrado') }
    return ok({ deleted: true })
  })

  /* ═══ METAS ═══ */
  fastify.get('/api/adm-canarana/metas', async (req: FastifyRequest) => {
    const { competencia } = req.query as { competencia?: string }
    return ok(await listarMetas(ESCRITORIO, competencia))
  })

  fastify.post('/api/adm-canarana/metas', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Omit<Meta, 'id' | 'criadoEm' | 'atualizadoEm'>
    if (!body.tipo) { reply.status(400); return fail('Tipo é obrigatório') }
    if (body.valorMeta == null || body.valorMeta < 0) { reply.status(400); return fail('Valor da meta deve ser >= 0') }
    const m = await criarMeta({ ...body, escritorio: ESCRITORIO })
    reply.status(201)
    return ok(m)
  })

  fastify.put('/api/adm-canarana/metas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<Omit<Meta, 'id' | 'criadoEm' | 'atualizadoEm'>>
    const m = await atualizarMeta(id, body)
    if (!m) { reply.status(404); return fail('Meta não encontrada') }
    return ok(m)
  })

  fastify.delete('/api/adm-canarana/metas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = await excluirMeta(id)
    if (!okDel) { reply.status(404); return fail('Meta não encontrada') }
    return ok({ deleted: true })
  })

  /* ═══ PROJETOS ═══ */
  fastify.get('/api/adm-canarana/projetos', async (req: FastifyRequest) => {
    const { etapa } = req.query as { etapa?: string }
    return ok(await listarProjetos(ESCRITORIO, etapa))
  })

  fastify.post('/api/adm-canarana/projetos', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Omit<Projeto, 'id' | 'criadoEm' | 'atualizadoEm'>
    if (!body.titulo?.trim()) { reply.status(400); return fail('Título é obrigatório') }
    const p = await criarProjeto({ ...body, escritorio: ESCRITORIO })
    reply.status(201)
    return ok(p)
  })

  fastify.put('/api/adm-canarana/projetos/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<Omit<Projeto, 'id' | 'criadoEm' | 'atualizadoEm'>>
    const p = await atualizarProjeto(id, body)
    if (!p) { reply.status(404); return fail('Projeto não encontrado') }
    return ok(p)
  })

  fastify.delete('/api/adm-canarana/projetos/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = await excluirProjeto(id)
    if (!okDel) { reply.status(404); return fail('Projeto não encontrado') }
    return ok({ deleted: true })
  })

  /* ═══ COMENTÁRIOS ═══ */
  fastify.get('/api/adm-canarana/comentarios', async (req: FastifyRequest) => {
    const { entidadeTipo, entidadeId } = req.query as { entidadeTipo: string; entidadeId: string }
    if (!entidadeTipo || !entidadeId) return fail('entidadeTipo e entidadeId são obrigatórios')
    return ok(await listarComentarios(ESCRITORIO, entidadeTipo, entidadeId))
  })

  fastify.post('/api/adm-canarana/comentarios', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Omit<Comentario, 'id' | 'criadoEm'>
    if (!body.conteudo?.trim()) { reply.status(400); return fail('Conteúdo é obrigatório') }
    if (!body.autor?.trim()) { reply.status(400); return fail('Autor é obrigatório') }
    const c = await criarComentario({ ...body, escritorio: ESCRITORIO })
    reply.status(201)
    return ok(c)
  })

  fastify.delete('/api/adm-canarana/comentarios/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = await excluirComentario(id)
    if (!okDel) { reply.status(404); return fail('Comentário não encontrado') }
    return ok({ deleted: true })
  })

  /* ════════════════════════════════════════════════
   * DOCUMENTOS & ANEXOS
   * ════════════════════════════════════════════════ */
  const ANEXOS_DIR = join(process.cwd(), 'storage', 'adm-canarana', 'anexos')
  try { mkdirSync(ANEXOS_DIR, { recursive: true }) } catch { /* noop */ }

  interface Anexo {
    id: string
    nomeOriginal: string
    nomeArmazenado: string
    tipo: string
    tamanho: number
    uploadEm: string
  }

  const anexosPorEntidade: Record<string, Anexo[]> = {} // key: `${tipo}:${id}`

  function salvarAnexo(competencia: string, categoria: string, nomeOriginal: string, buffer: Buffer): Anexo {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const safe = nomeOriginal.replace(/[^a-zA-Z0-9._-]/g, '_')
    const subdir = join(ANEXOS_DIR, competencia, categoria)
    try { mkdirSync(subdir, { recursive: true }) } catch { /* noop */ }
    const nomeArmazenado = join(competencia, categoria, `${id}_${safe}`)
    writeFileSync(join(ANEXOS_DIR, nomeArmazenado), buffer)
    return { id, nomeOriginal, nomeArmazenado, tipo: nomeOriginal.split('.').pop()?.toLowerCase() || 'outro', tamanho: buffer.length, uploadEm: agora() }
  }

  function lerAnexo(nomeArmazenado: string): Buffer | null {
    try { return readFileSync(join(ANEXOS_DIR, nomeArmazenado)) } catch { return null }
  }

  function listarAnexos(entidadeTipo: string, entidadeId: string): Anexo[] {
    return anexosPorEntidade[`${entidadeTipo}:${entidadeId}`] || []
  }

  function adicionarAnexo(entidadeTipo: string, entidadeId: string, anexo: Anexo) {
    const key = `${entidadeTipo}:${entidadeId}`
    if (!anexosPorEntidade[key]) anexosPorEntidade[key] = []
    anexosPorEntidade[key].push(anexo)
  }

  /* ─── Clientes do CRM integrados ─── */
  fastify.get('/api/adm-canarana/clientes', async () => {
    // Reutiliza a mesma fonte do CRM: lista clientes do escritório Canarana
    const { clientes } = await import('./clientes.js')
    const todos = Array.from(clientes.values())
      .filter((c: any) => (c.escritorio || '').toLowerCase() === ESCRITORIO.toLowerCase())
      .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''))
    return ok(todos)
  })

  /* ─── Extração OCR/LLM (preview antes de salvar) ─── */
  fastify.post('/api/adm-canarana/documentos/extrair', async (req: FastifyRequest, reply: FastifyReply) => {
    const parts = req.parts()
    let arquivoBuf: Buffer | null = null
    let filename = 'documento.bin'
    let mimetype = 'application/octet-stream'

    for await (const part of parts) {
      if (part.type === 'file') {
        arquivoBuf = await part.toBuffer()
        filename = part.filename || 'documento.bin'
        mimetype = part.mimetype || 'application/octet-stream'
        break // só processa o primeiro arquivo
      }
    }

    if (!arquivoBuf) { reply.status(400); return fail('Nenhum arquivo enviado') }

    const extraido = await extrairDadosDocumento(arquivoBuf, filename, mimetype)
    return ok({ extraido, filename, mimetype, tamanho: arquivoBuf.length })
  })

  /* ─── Upload inteligente de documentos ─── */
  fastify.post('/api/adm-canarana/documentos/upload', async (req: FastifyRequest, reply: FastifyReply) => {
    const parts = req.parts()
    let tipoDoc = 'despesa' // receita | despesa | folha | comprovante
    let competencia = new Date().toISOString().slice(0, 7)
    let valor = 0
    let descricao = ''
    let categoria = 'outro'
    let fornecedor = ''
    let origem = ''
    let status = 'pendente'
    let dataDoc = ''
    let entidadeTipo = ''
    let entidadeId = ''
    let autoExtrair = false
    const anexos: Anexo[] = []
    let arquivoBuf: Buffer | null = null
    let filename = 'documento.bin'
    let mimetype = 'application/octet-stream'

    for await (const part of parts) {
      if (part.type === 'file') {
        const buf = await part.toBuffer()
        arquivoBuf = buf
        filename = part.filename || 'documento.bin'
        mimetype = part.mimetype || 'application/octet-stream'
        const anexo = salvarAnexo(competencia, tipoDoc, part.filename || 'documento.bin', buf)
        anexos.push(anexo)
      } else {
        const v = await part.value
        switch (part.fieldname) {
          case 'tipoDoc': tipoDoc = v as string; break
          case 'competencia': competencia = v as string; break
          case 'valor': valor = Number((v as string).replace(/\./g, '').replace(',', '.')); break
          case 'descricao': descricao = v as string; break
          case 'categoria': categoria = v as string; break
          case 'fornecedor': fornecedor = v as string; break
          case 'origem': origem = v as string; break
          case 'status': status = v as string; break
          case 'dataDoc': dataDoc = v as string; break
          case 'entidadeTipo': entidadeTipo = v as string; break
          case 'entidadeId': entidadeId = v as string; break
          case 'autoExtrair': autoExtrair = v === '1' || v === 'true'; break
        }
      }
    }

    // ── OCR automático quando campos estão vazios e há arquivo ──
    let extraido: DadosExtraidos | null = null
    if (autoExtrair && arquivoBuf) {
      extraido = await extrairDadosDocumento(arquivoBuf, filename, mimetype)
      if (!descricao.trim() && extraido.descricao) descricao = extraido.descricao
      if ((!valor || valor <= 0) && extraido.valor != null) valor = extraido.valor
      if (!dataDoc && extraido.data) dataDoc = extraido.data
      if (tipoDoc === 'despesa' && categoria === 'outro' && extraido.categoria) categoria = extraido.categoria
      if (tipoDoc === 'receita' && !origem && extraido.emissor) origem = extraido.emissor
      if (tipoDoc === 'despesa' && !fornecedor && extraido.emissor) fornecedor = extraido.emissor
    }

    let resultado: any = null
    let entCriada = ''

    if (tipoDoc === 'receita') {
      if (!descricao.trim()) return fail('Descrição é obrigatória para receita')
      if (!valor || valor <= 0) return fail('Valor deve ser maior que zero')
      const r = await criarReceita({
        escritorio: ESCRITORIO, competencia, descricao,
        origem: origem || 'documento', valor,
        dataRecebimento: dataDoc || undefined,
        formaPagamento: 'documento',
        status: (status as any) || 'previsto',
      })
      resultado = r
      entCriada = r.id
      for (const a of anexos) adicionarAnexo('receita', r.id, a)
    } else if (tipoDoc === 'despesa') {
      if (!descricao.trim()) return fail('Descrição é obrigatória para despesa')
      if (!categoria.trim()) return fail('Categoria é obrigatória para despesa')
      if (!valor || valor <= 0) return fail('Valor deve ser maior que zero')
      const d = await criarDespesa({
        escritorio: ESCRITORIO, competencia, descricao,
        categoria: categoria || 'outro', fornecedor: fornecedor || undefined,
        valor, dataPagamento: dataDoc || undefined, dataVencimento: dataDoc || undefined,
        status: (status as any) || 'pendente',
      })
      resultado = d
      entCriada = d.id
      for (const a of anexos) adicionarAnexo('despesa', d.id, a)
    } else if (entidadeTipo && entidadeId) {
      for (const a of anexos) adicionarAnexo(entidadeTipo, entidadeId, a)
      return ok({ anexos, entidadeTipo, entidadeId })
    }

    return ok({ resultado, anexos, entidadeCriada: entCriada, extraido })
  })

  /* ─── Listar anexos de entidade ─── */
  fastify.get('/api/adm-canarana/documentos/:entidadeTipo/:entidadeId', async (req: FastifyRequest) => {
    const { entidadeTipo, entidadeId } = req.params as { entidadeTipo: string; entidadeId: string }
    return ok(listarAnexos(entidadeTipo, entidadeId))
  })

  /* ─── Download de anexo ─── */
  fastify.get('/api/adm-canarana/anexos/*', async (req: FastifyRequest, reply: FastifyReply) => {
    const nomeArmazenado = (req.params as any)['*']
    const buf = lerAnexo(nomeArmazenado)
    if (!buf) { reply.status(404); return fail('Anexo não encontrado') }
    const ext = nomeArmazenado.split('.').pop()?.toLowerCase() || ''
    const mime = ext === 'pdf' ? 'application/pdf' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'xml' ? 'text/xml' : 'application/octet-stream'
    reply.header('Content-Type', mime)
    reply.header('Content-Disposition', `inline; filename="${nomeArmazenado.split('/').pop()}"`)
    return buf
  })

  /* ════════════════════════════════════════════════
   * FECHAMENTO MENSAL PARA CONTADOR
   * ════════════════════════════════════════════════ */

  function gerarCSVReceitas(recs: Receita[]): string {
    const h = ['ID','Competencia','Descricao','Origem','Valor','DataRecebimento','FormaPagamento','Status'].join(';')
    const rows = recs.map((r) => [r.id, r.competencia, r.descricao, r.origem || '', String(r.valor).replace('.', ','), r.dataRecebimento || '', r.formaPagamento || '', r.status].join(';'))
    return [h, ...rows].join('\n')
  }
  function gerarCSVDespesas(dsps: Despesa[]): string {
    const h = ['ID','Competencia','Descricao','Categoria','Fornecedor','Valor','DataPagamento','DataVencimento','Status'].join(';')
    const rows = dsps.map((d) => [d.id, d.competencia, d.descricao, d.categoria, d.fornecedor || '', String(d.valor).replace('.', ','), d.dataPagamento || '', d.dataVencimento || '', d.status].join(';'))
    return [h, ...rows].join('\n')
  }
  function gerarCSVFolha(pays: FolhaPagamento[]): string {
    const h = ['ID','FuncionarioId','Competencia','SalarioBase','Bonus','Descontos','ValorLiquido','DataPagamento','Status'].join(';')
    const rows = pays.map((p) => [p.id, p.funcionarioId, p.competencia, String(p.salarioBase).replace('.', ','), String(p.bonus).replace('.', ','), String(p.descontos).replace('.', ','), String(p.valorLiquido).replace('.', ','), p.dataPagamento || '', p.status].join(';'))
    return [h, ...rows].join('\n')
  }

  fastify.get('/api/adm-canarana/fechamento/:competencia/gerar', async (req: FastifyRequest, reply: FastifyReply) => {
    const { competencia } = req.params as { competencia: string }
    const [recs, dsps, pays, funcs] = await Promise.all([
      listarReceitas(ESCRITORIO, competencia),
      listarDespesas(ESCRITORIO, competencia),
      listarFolha(ESCRITORIO, competencia),
      listarFuncionarios(ESCRITORIO),
    ])
    const totalRec = recs.reduce((s, r) => s + r.valor, 0)
    const totalDesp = dsps.reduce((s, d) => s + d.valor, 0)
    const totalFolha = pays.reduce((s, p) => s + p.valorLiquido, 0)
    const saldo = totalRec - totalDesp - totalFolha

    const fechDir = join(process.cwd(), 'storage', 'adm-canarana', 'fechamentos', competencia)
    try { mkdirSync(fechDir, { recursive: true }) } catch { /* noop */ }

    // CSVs
    writeFileSync(join(fechDir, 'receitas.csv'), gerarCSVReceitas(recs), 'utf-8')
    writeFileSync(join(fechDir, 'despesas.csv'), gerarCSVDespesas(dsps), 'utf-8')
    writeFileSync(join(fechDir, 'folha.csv'), gerarCSVFolha(pays), 'utf-8')

    // Manifesto
    const manifesto = {
      competencia, escritorio: ESCRITORIO, geradoEm: agora(),
      resumo: { totalReceitas: totalRec, totalDespesas: totalDesp, totalFolha, saldo, numFuncionarios: funcs.length },
      contagens: { receitas: recs.length, despesas: dsps.length, folha: pays.length },
      checklist: {
        receitasCadastradas: recs.length > 0,
        despesasCadastradas: dsps.length > 0,
        folhaLancada: pays.length > 0,
        documentosAnexados: Object.keys(anexosPorEntidade).length > 0,
        saldoPositivo: saldo >= 0,
      },
    }
    writeFileSync(join(fechDir, 'manifesto.json'), JSON.stringify(manifesto, null, 2), 'utf-8')

    // Anexos organizados por categoria
    const anexosDir = join(fechDir, 'anexos')
    try { mkdirSync(anexosDir, { recursive: true }) } catch { /* noop */ }
    for (const [key, anexos] of Object.entries(anexosPorEntidade)) {
      if (!anexos.length) continue
      try { mkdirSync(join(anexosDir, key), { recursive: true }) } catch { /* noop */ }
      for (const a of anexos) {
        const buf = lerAnexo(a.nomeArmazenado)
        if (buf) writeFileSync(join(anexosDir, key, a.nomeOriginal), buf)
      }
    }

    // HTML formal para impressão
    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Fechamento ${competencia}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:40px;color:#222}
.header{border-bottom:3px solid #17251b;padding-bottom:16px;margin-bottom:24px}
.header h1{color:#17251b;margin:0;font-size:28px}
.header p{color:#666;margin:6px 0 0}
.kpi{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
.kpi-box{background:#f8f8f6;border:1px solid #ddd;border-radius:8px;padding:16px;min-width:160px;text-align:center}
.kpi-box .label{font-size:10px;text-transform:uppercase;color:#777;margin-bottom:6px;letter-spacing:.5px}
.kpi-box .value{font-size:22px;font-weight:700;color:#17251b}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
th{text-align:left;background:#17251b;color:#fff;padding:8px;font-weight:600}
td{padding:7px;border-bottom:1px solid #eee}
tr:nth-child(even){background:#f9f9f9}
.section{margin-bottom:32px}
.section h2{font-size:18px;color:#17251b;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:12px}</style></head>
<body>
<div class="header"><h1>Fechamento Administrativo — ${ESCRITORIO}</h1><p>Competência: ${competencia} | Gerado em: ${fmtDate2(agora())}</p></div>
<div class="kpi">
  <div class="kpi-box"><div class="label">Receitas</div><div class="value">${fmtBRL2(totalRec)}</div></div>
  <div class="kpi-box"><div class="label">Despesas</div><div class="value">${fmtBRL2(totalDesp)}</div></div>
  <div class="kpi-box"><div class="label">Folha</div><div class="value">${fmtBRL2(totalFolha)}</div></div>
  <div class="kpi-box"><div class="label">Saldo</div><div class="value" style="color:${saldo>=0?'#047857':'#b91c1c'}">${fmtBRL2(saldo)}</div></div>
</div>
<div class="section"><h2>Receitas (${recs.length})</h2>
<table><thead><tr><th>Descrição</th><th>Origem</th><th>Valor</th><th>Status</th></tr></thead><tbody>
${recs.map(r=>`<tr><td>${r.descricao}</td><td>${r.origem||'—'}</td><td>${fmtBRL2(r.valor)}</td><td>${r.status}</td></tr>`).join('')}
</tbody></table></div>
<div class="section"><h2>Despesas (${dsps.length})</h2>
<table><thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Status</th></tr></thead><tbody>
${dsps.map(d=>`<tr><td>${d.descricao}</td><td>${d.categoria}</td><td>${fmtBRL2(d.valor)}</td><td>${d.status}</td></tr>`).join('')}
</tbody></table></div>
<div class="section"><h2>Folha de Pagamento (${pays.length})</h2>
<table><thead><tr><th>Funcionário</th><th>Salário</th><th>Bônus</th><th>Descontos</th><th>Líquido</th><th>Status</th></tr></thead><tbody>
${pays.map(p=>`<tr><td>${p.funcionarioId}</td><td>${fmtBRL2(p.salarioBase)}</td><td>${fmtBRL2(p.bonus)}</td><td>${fmtBRL2(p.descontos)}</td><td>${fmtBRL2(p.valorLiquido)}</td><td>${p.status}</td></tr>`).join('')}
</tbody></table></div>
<div class="section"><h2>Funcionários (${funcs.length})</h2>
<table><thead><tr><th>Nome</th><th>Cargo</th><th>Salário Base</th><th>Status</th></tr></thead><tbody>
${funcs.map(f=>`<tr><td>${f.nome}</td><td>${f.cargo}</td><td>${fmtBRL2(f.salarioBase)}</td><td>${f.status}</td></tr>`).join('')}
</tbody></table></div>
<div style="margin-top:40px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:12px">
Documento gerado automaticamente pelo Sistema ALETIS — ADM Canarana. Inclua os anexos (notas, recibos, comprovantes) no pacote enviado ao contador.
</div></body></html>`
    writeFileSync(join(fechDir, 'fechamento.html'), html, 'utf-8')

    // Pacote ZIP
    const zipPath = join(fechDir, `fechamento-${competencia}.zip`)
    try {
      const { execSync } = await import('child_process')
      execSync(`cd "${fechDir}" && zip -r "${zipPath}" manifesto.json receitas.csv despesas.csv folha.csv fechamento.html anexos/ 2>/dev/null || true`)
    } catch {
      // Se zip falhar, continua sem ZIP
    }

    return ok({
      competencia, geradoEm: agora(),
      resumo: manifesto.resumo, checklist: manifesto.checklist,
      download: `/api/adm-canarana/fechamento/${competencia}/download`,
      preview: `/api/adm-canarana/fechamento/${competencia}/preview`,
    })
  })

  fastify.get('/api/adm-canarana/fechamento/:competencia/download', async (req: FastifyRequest, reply: FastifyReply) => {
    const { competencia } = req.params as { competencia: string }
    const zipPath = join(process.cwd(), 'storage', 'adm-canarana', 'fechamentos', competencia, `fechamento-${competencia}.zip`)
    try {
      const buf = readFileSync(zipPath)
      reply.header('Content-Type', 'application/zip')
      reply.header('Content-Disposition', `attachment; filename="fechamento-canarana-${competencia}.zip"`)
      return buf
    } catch {
      reply.status(404)
      return fail('Pacote de fechamento não encontrado. Gere-o primeiro via /fechamento/:competencia/gerar')
    }
  })

  fastify.get('/api/adm-canarana/fechamento/:competencia/preview', async (req: FastifyRequest, reply: FastifyReply) => {
    const { competencia } = req.params as { competencia: string }
    const htmlPath = join(process.cwd(), 'storage', 'adm-canarana', 'fechamentos', competencia, 'fechamento.html')
    try {
      const html = readFileSync(htmlPath, 'utf-8')
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return html
    } catch {
      reply.status(404)
      return fail('Preview não encontrado. Gere-o primeiro via /fechamento/:competencia/gerar')
    }
  })
}


/* ─── Extração OCR/LLM de Documentos ─── */

interface DadosExtraidos {
  tipo: 'receita' | 'despesa' | 'desconhecido'
  valor?: number
  data?: string
  descricao?: string
  cnpj?: string
  emissor?: string
  numeroDocumento?: string
  categoria?: string
  confianca: number
  fonte: 'tesseract' | 'llm-vision' | 'llm-text' | 'regex' | 'nenhuma'
  textoBruto?: string
}

function detectarTipoDoc(tipoClassificado: string, texto: string): 'receita' | 'despesa' | 'desconhecido' {
  const t = (tipoClassificado || '').toUpperCase()
  const txt = (texto || '').toLowerCase()
  // Receita: nota de serviço, honorários, proposta aceita, etc.
  const receitaKeywords = ['nota fiscal de serviço', 'nfs-e', 'nfs', 'honorários', 'recebimento', 'fatura', 'duplicata', 'proposta aceita', 'nf-e de entrada']
  for (const kw of receitaKeywords) if (txt.includes(kw)) return 'receita'
  // Despesa: nota fiscal, cupom fiscal, comprovante de pagamento, etc.
  const despesaKeywords = ['nota fiscal eletrônica', 'nfe', 'cupom fiscal', 'cfe', 'comprovante de pagamento', 'boleto', 'recibo de pagamento', 'despesa']
  for (const kw of despesaKeywords) if (txt.includes(kw)) return 'despesa'
  if (t.includes('NFE') || t.includes('NF') || t.includes('COMPROVANTE') || t.includes('EXTRATO')) return 'despesa'
  if (t.includes('NFS') || t.includes('SERVICO') || t.includes('HONORARIO')) return 'receita'
  return 'desconhecido'
}

function inferirCategoria(texto: string): string {
  const txt = texto.toLowerCase()
  if (txt.includes('aluguel') || txt.includes('locação')) return 'aluguel'
  if (txt.includes('combustível') || txt.includes('gasolina') || txt.includes('diesel') || txt.includes('etanol')) return 'combustivel'
  if (txt.includes('material') || txt.includes('papelaria') || txt.includes('escritório')) return 'material'
  if (txt.includes('alimentação') || txt.includes('refeição') || txt.includes('restaurante') || txt.includes('lanche')) return 'alimentacao'
  if (txt.includes('viagem') || txt.includes('hotel') || txt.includes('hospedagem') || txt.includes('passagem')) return 'viagem'
  if (txt.includes('imposto') || txt.includes('das') || txt.includes('iss') || txt.includes('irrf') || txt.includes('inss')) return 'imposto'
  if (txt.includes('serviço') || txt.includes('terceirizado') || txt.includes('prestação de serviço')) return 'servico'
  if (txt.includes('marketing') || txt.includes('publicidade') || txt.includes('propaganda')) return 'marketing'
  if (txt.includes('telefone') || txt.includes('internet') || txt.includes('telecom')) return 'telecom'
  return 'outro'
}

function normalizarData(dt?: string): string | undefined {
  if (!dt) return undefined
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) return dt
  // DD/MM/YYYY
  const m1 = dt.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  // Brasileiro com traço ou ponto
  const m2 = dt.match(/(\d{2})[-.](\d{2})[-.](\d{4})/)
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`
  return undefined
}

function normalizarValor(val?: any): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  const s = String(val).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return isNaN(n) ? undefined : n
}

async function extrairDadosDocumento(buffer: Buffer, filename: string, mimetype: string): Promise<DadosExtraidos> {
  try {
    const { parsePdf, processImage, extractDocViaLlm, extractEntitiesFromDocument } = await lazyLoadIntake()
    let extractedText = ''
    let imageBase64: string | undefined
    let imageMediaType: string | undefined
    let pageCount = 1
    let fonte: DadosExtraidos['fonte'] = 'nenhuma'

    // ─── Fase 1: Parser específico por tipo ───
    if (mimetype === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      const parsed = await parsePdf(buffer)
      extractedText = parsed.extractedText || ''
      pageCount = parsed.pageCount || 1
      imageBase64 = parsed.imageBase64
      imageMediaType = parsed.imageMediaType
      fonte = parsed.evidences?.some((e: any) => e.source?.includes('ocr')) ? 'tesseract' : 'regex'
    } else if (mimetype.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(filename)) {
      const parsed = await processImage(buffer, filename, mimetype)
      imageBase64 = parsed.imageBase64
      imageMediaType = parsed.imageMediaType
      // Para imagens precisamos de OCR; usaremos LLM Vision direto
      fonte = 'llm-vision'
    } else {
      // Texto/XML/OFX/CSV
      extractedText = buffer.toString('utf-8').slice(0, 50000)
      fonte = 'regex'
    }

    // ─── Fase 2: Extração de entidades via texto ───
    let entidades: any = null
    let classificacao: any = null

    if (extractedText && extractedText.length > 20) {
      entidades = await extractEntitiesFromDocument({ text: extractedText, filename, kind: mimetype.includes('pdf') ? 'pdf' : 'text', pageCount })
      fonte = 'llm-text'
    }

    // ─── Fase 3: Classificação via LLM Vision (imagem) ───
    if (imageBase64 && imageMediaType) {
      classificacao = await extractDocViaLlm({ imageBase64, imageMediaType, textContext: extractedText })
      fonte = 'llm-vision'
    }

    // ─── Fase 4: Normalizar saída ───
    const tipoClassificado = classificacao?.tipo || entidades?.tipoDocumento || 'OUTRO'
    const tipoDoc = detectarTipoDoc(tipoClassificado, extractedText)
    const campos = classificacao?.camposExtraidos || entidades?.camposEstruturados || {}

    // Buscar valor em múltiplos lugares possíveis
    let valor: number | undefined = normalizarValor(campos?.valorTotal) || normalizarValor(campos?.valor)
    if (valor == null && entidades?.entidades) {
      const ve = entidades.entidades.find((e: any) => e.tipo === 'valor')
      if (ve?.valor != null) valor = Number(ve.valor)
    }
    if (valor == null) {
      // Regex fallback: procura R$ XXX,XX ou R$ X.XXX,XX no texto
      const m = extractedText.match(/R\$\s*[\d.]+,?\d{0,2}/g)
      if (m) {
        const nums = m.map((s: string) => normalizarValor(s)).filter((v: any): v is number => v != null && v > 0)
        if (nums.length) valor = Math.max(...nums)
        fonte = 'regex'
      }
    }

    // Buscar data
    let data: string | undefined = normalizarData(campos?.dataEmissao) || normalizarData(campos?.data)
    if (data == null && entidades?.entidades) {
      const de = entidades.entidades.find((e: any) => e.tipo === 'data')
      if (de?.data) data = normalizarData(de.data)
    }
    if (data == null) {
      const m = extractedText.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      if (m) data = `${m[3]}-${m[2]}-${m[1]}`
      fonte = 'regex'
    }

    // Buscar CNPJ/CPF
    let cnpj: string | undefined = (campos?.cpfCnpj || '')
    if (!cnpj && entidades?.entidades) {
      const ce = entidades.entidades.find((e: any) => e.cpfCnpj)
      if (ce?.cpfCnpj) cnpj = ce.cpfCnpj
    }
    if (!cnpj) {
      const m = extractedText.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{11})/)
      if (m) cnpj = m[1].replace(/\D/g, '')
    }

    // Descrição / emissor / número
    const descricao = entidades?.resumoExecutivo
      || (campos?.discriminacao as string)
      || (campos?.nome as string)
      || extractedText.slice(0, 200).replace(/\s+/g, ' ')
    const emissor = (campos?.emissor as string) || (campos?.emissorNome as string)
    const numeroDocumento = (campos?.numeroDocumento as string) || ''
    const categoria = inferirCategoria(extractedText)

    const confianca = classificacao?.confianca || (entidades ? 0.7 : 0.3)

    return {
      tipo: tipoDoc,
      valor, data, descricao, cnpj, emissor, numeroDocumento,
      categoria, confianca, fonte,
      textoBruto: extractedText.slice(0, 5000),
    }
  } catch (err: any) {
    console.warn('[ADM-OCR] Falha na extração:', err.message)
    return { tipo: 'desconhecido', confianca: 0, fonte: 'nenhuma', textoBruto: buffer.toString('utf-8').slice(0, 1000) }
  }
}

const fmtBRL2 = (v: number): string => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)
const fmtDate2 = (iso?: string): string => {
  if (!iso) return '—'
  const s = iso.slice(0, 10)
  const parts = s.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
function fmtCurrency(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)
}

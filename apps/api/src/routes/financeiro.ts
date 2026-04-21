/**
 * Rotas do Financeiro INTERNO do negócio ALETIS.
 *
 * Prefixo: /api/financeiro
 *
 * Recursos:
 *   - Dashboard + DRE mensal/anual
 *   - Receitas (CRUD + upload NF + parse NFS-e XML)
 *   - Despesas (CRUD + upload comprovante)
 *   - Impostos (CRUD + cálculo DAS automático)
 *   - Lançamentos bancários (CRUD + import OFX)
 *   - Configuração da empresa e do contador
 *   - Fechamento mensal (checklist + geração ZIP/PDF + download)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { getFinanceiroService } from '../services/financeiro/FinanceiroService.js'
import { getFechamentoService } from '../services/financeiro/FechamentoContadorService.js'
import { calcularDAS } from '../services/financeiro/simples-nacional.js'
import { parseNfseXml, parseOfx, sugerirCategoriaLancamento } from '../services/financeiro/parsers.js'
import type {
  Receita,
  Despesa,
  Imposto,
  LancamentoBancario,
  ConfiguracaoFinanceiro,
  CategoriaDespesa,
  Anexo,
} from '../services/financeiro/types.js'
import { CATEGORIAS_DESPESA } from '../services/financeiro/types.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

export default async function (fastify: FastifyInstance) {
  const svc = getFinanceiroService()

  /* ════════════════ DASHBOARD / DRE ════════════════ */

  fastify.get('/api/financeiro/dashboard', async () => ok(svc.calcularDashboard()))

  fastify.get('/api/financeiro/dre/:competencia', async (req: FastifyRequest) => {
    const { competencia } = req.params as { competencia: string }
    return ok(svc.calcularDREMensal(competencia))
  })

  fastify.get('/api/financeiro/dre-anual/:ano', async (req: FastifyRequest) => {
    const { ano } = req.params as { ano: string }
    return ok(svc.calcularDREAnual(Number(ano)))
  })

  fastify.get('/api/financeiro/rbt12', async (req: FastifyRequest) => {
    const { competencia } = req.query as { competencia?: string }
    const comp = competencia ?? new Date().toISOString().slice(0, 7)
    return ok({ competencia: comp, rbt12: svc.calcularRBT12(comp) })
  })

  fastify.get('/api/financeiro/categorias', async () => ok(CATEGORIAS_DESPESA))

  /* ════════════════ RECEITAS ════════════════ */

  fastify.get('/api/financeiro/receitas', async (req: FastifyRequest) => {
    const { competencia, status, cliente } = req.query as {
      competencia?: string; status?: Receita['status']; cliente?: string
    }
    return ok(svc.listarReceitas({ competencia, status, clienteBusca: cliente }))
  })

  fastify.get('/api/financeiro/receitas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const r = svc.getReceita(id)
    if (!r) { reply.status(404); return fail('Receita não encontrada', 'NOT_FOUND') }
    return ok(r)
  })

  fastify.post('/api/financeiro/receitas', async (req: FastifyRequest) => {
    const body = req.body as Omit<Receita, 'id' | 'criadoEm' | 'atualizadoEm' | 'valorLiquido' | 'status'>
    return ok(svc.criarReceita(body))
  })

  fastify.put('/api/financeiro/receitas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const patch = req.body as Partial<Receita>
    const updated = svc.atualizarReceita(id, patch)
    if (!updated) { reply.status(404); return fail('Receita não encontrada', 'NOT_FOUND') }
    return ok(updated)
  })

  fastify.delete('/api/financeiro/receitas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = svc.deletarReceita(id)
    if (!okDel) { reply.status(404); return fail('Receita não encontrada', 'NOT_FOUND') }
    return ok({ deleted: true })
  })

  /** Upload de NF (XML NFS-e ou PDF) — se XML é parseado e pré-preenche a receita. */
  fastify.post('/api/financeiro/receitas/upload-nf', async (req: FastifyRequest, reply: FastifyReply) => {
    const parts = req.parts()
    const fields: Record<string, string> = {}
    const anexos: Anexo[] = []
    let nfseParsed: ReturnType<typeof parseNfseXml> | undefined

    for await (const part of parts) {
      if (part.type === 'file') {
        const file = part as MultipartFile
        const buf = await file.toBuffer()
        const competencia = fields.competencia ?? new Date().toISOString().slice(0, 7)
        const anexo = svc.saveAnexo(competencia, 'receitas', file.filename, buf)
        anexos.push(anexo)
        if (anexo.tipo === 'xml') {
          try {
            nfseParsed = parseNfseXml(buf.toString('utf-8'))
          } catch (err) {
            req.log.warn({ err }, '[financeiro] falha ao parsear XML NFS-e')
          }
        }
      } else {
        fields[part.fieldname] = part.value as string
      }
    }

    if (!nfseParsed && anexos.length === 0) {
      reply.status(400)
      return fail('Nenhum arquivo recebido', 'NO_FILE')
    }

    if (nfseParsed) {
      const competencia = fields.competencia ?? nfseParsed.dataEmissao?.slice(0, 7) ?? new Date().toISOString().slice(0, 7)
      const receita = svc.criarReceita({
        competencia,
        descricao: nfseParsed.discriminacao ?? `NFS-e ${nfseParsed.numero}`,
        cliente: nfseParsed.tomador ? {
          nome: nfseParsed.tomador.razaoSocial ?? 'Tomador',
          cpfCnpj: nfseParsed.tomador.cpfCnpj,
        } : undefined,
        valorBruto: nfseParsed.valorServicos,
        retencoes: {
          iss: nfseParsed.valorIss,
          ir: nfseParsed.valorIr,
          inss: nfseParsed.valorInss,
          csll: nfseParsed.valorCsll,
          pis: nfseParsed.valorPis,
          cofins: nfseParsed.valorCofins,
        },
        nfse: {
          numero: nfseParsed.numero,
          serie: nfseParsed.serie,
          municipio: nfseParsed.codigoMunicipio,
          dataEmissao: nfseParsed.dataEmissao ?? new Date().toISOString().slice(0, 10),
          codigoVerificacao: nfseParsed.codigoVerificacao,
          discriminacao: nfseParsed.discriminacao,
        },
        dataEmissao: nfseParsed.dataEmissao ?? new Date().toISOString().slice(0, 10),
        anexos,
      })
      return ok({ receita, parsed: nfseParsed })
    }

    return ok({ anexos, mensagem: 'Anexo(s) carregado(s). Crie a receita manualmente vinculando este anexo.' })
  })

  /** Upload avulso de anexo (sem criar receita — vincula depois). */
  fastify.post('/api/financeiro/anexos/:categoria', async (req: FastifyRequest, reply: FastifyReply) => {
    const { categoria } = req.params as { categoria: 'receitas' | 'despesas' | 'impostos' | 'extratos' }
    if (!['receitas', 'despesas', 'impostos', 'extratos'].includes(categoria)) {
      reply.status(400)
      return fail('Categoria inválida', 'INVALID_CATEGORY')
    }
    const parts = req.parts()
    const fields: Record<string, string> = {}
    const anexos: Anexo[] = []
    for await (const part of parts) {
      if (part.type === 'file') {
        const file = part as MultipartFile
        const buf = await file.toBuffer()
        const competencia = fields.competencia ?? new Date().toISOString().slice(0, 7)
        anexos.push(svc.saveAnexo(competencia, categoria, file.filename, buf))
      } else {
        fields[part.fieldname] = part.value as string
      }
    }
    return ok(anexos)
  })

  /** Download de anexo. */
  fastify.get('/api/financeiro/anexos/*', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.params as { '*': string }
    const nomeArmazenado = params['*']
    const buf = svc.lerAnexo(nomeArmazenado)
    if (!buf) { reply.status(404); return fail('Anexo não encontrado', 'NOT_FOUND') }
    const ext = nomeArmazenado.split('.').pop()?.toLowerCase() ?? 'bin'
    const contentType = ext === 'pdf' ? 'application/pdf'
      : ext === 'xml' ? 'application/xml'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : 'application/octet-stream'
    reply.header('Content-Type', contentType)
    reply.header('Content-Disposition', `inline; filename="${nomeArmazenado.split('/').pop()}"`)
    return reply.send(buf)
  })

  /* ════════════════ DESPESAS ════════════════ */

  fastify.get('/api/financeiro/despesas', async (req: FastifyRequest) => {
    const { competencia, categoria, status } = req.query as {
      competencia?: string; categoria?: CategoriaDespesa; status?: Despesa['status']
    }
    return ok(svc.listarDespesas({ competencia, categoria, status }))
  })

  fastify.get('/api/financeiro/despesas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const d = svc.getDespesa(id)
    if (!d) { reply.status(404); return fail('Despesa não encontrada', 'NOT_FOUND') }
    return ok(d)
  })

  fastify.post('/api/financeiro/despesas', async (req: FastifyRequest) => {
    const body = req.body as Omit<Despesa, 'id' | 'criadoEm' | 'atualizadoEm' | 'status'>
    return ok(svc.criarDespesa(body))
  })

  fastify.put('/api/financeiro/despesas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const patch = req.body as Partial<Despesa>
    const updated = svc.atualizarDespesa(id, patch)
    if (!updated) { reply.status(404); return fail('Despesa não encontrada', 'NOT_FOUND') }
    return ok(updated)
  })

  fastify.delete('/api/financeiro/despesas/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = svc.deletarDespesa(id)
    if (!okDel) { reply.status(404); return fail('Despesa não encontrada', 'NOT_FOUND') }
    return ok({ deleted: true })
  })

  /* ════════════════ IMPOSTOS ════════════════ */

  fastify.get('/api/financeiro/impostos', async (req: FastifyRequest) => {
    const { competencia, tipo } = req.query as { competencia?: string; tipo?: Imposto['tipo'] }
    return ok(svc.listarImpostos({ competencia, tipo }))
  })

  fastify.post('/api/financeiro/impostos', async (req: FastifyRequest) => {
    const body = req.body as Omit<Imposto, 'id' | 'criadoEm' | 'atualizadoEm' | 'status'>
    return ok(svc.criarImposto(body))
  })

  fastify.put('/api/financeiro/impostos/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const patch = req.body as Partial<Imposto>
    const updated = svc.atualizarImposto(id, patch)
    if (!updated) { reply.status(404); return fail('Imposto não encontrado', 'NOT_FOUND') }
    return ok(updated)
  })

  fastify.delete('/api/financeiro/impostos/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = svc.deletarImposto(id)
    if (!okDel) { reply.status(404); return fail('Imposto não encontrado', 'NOT_FOUND') }
    return ok({ deleted: true })
  })

  /** Calcular DAS do mês e opcionalmente criar o imposto. */
  fastify.post('/api/financeiro/impostos/calcular-das', async (req: FastifyRequest) => {
    const body = req.body as { competencia?: string; criar?: boolean }
    const config = svc.getConfig()
    const comp = body.competencia ?? new Date().toISOString().slice(0, 7)
    const receita = svc.receitaBrutaMes(comp)
    const rbt12 = svc.calcularRBT12(comp)
    const calc = calcularDAS(receita, rbt12, config.anexoSimples, comp)

    let imposto: Imposto | undefined
    if (body.criar && calc.valorDAS > 0) {
      imposto = svc.criarImposto({
        competencia: comp,
        tipo: 'das_simples',
        descricao: `DAS Simples Nacional — ${comp}`,
        baseCalculo: calc.receitaBrutaMes,
        aliquota: calc.aliquotaEfetiva,
        valor: calc.valorDAS,
        dataVencimento: calc.vencimento,
        anexos: [],
        memoriaCalculo: calc.memoriaCalculo,
      })
    }

    return ok({ calc, imposto })
  })

  /* ════════════════ LANÇAMENTOS BANCÁRIOS ════════════════ */

  fastify.get('/api/financeiro/lancamentos', async (req: FastifyRequest) => {
    const { contaId, dataInicio, dataFim, naoClassificados } = req.query as {
      contaId?: string; dataInicio?: string; dataFim?: string; naoClassificados?: string
    }
    return ok(svc.listarLancamentos({
      contaId,
      dataInicio,
      dataFim,
      naoClassificados: naoClassificados === 'true',
    }))
  })

  fastify.post('/api/financeiro/lancamentos', async (req: FastifyRequest) => {
    const body = req.body as Omit<LancamentoBancario, 'id' | 'criadoEm'>
    return ok(svc.criarLancamento(body))
  })

  fastify.put('/api/financeiro/lancamentos/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const patch = req.body as Partial<LancamentoBancario>
    const updated = svc.atualizarLancamento(id, patch)
    if (!updated) { reply.status(404); return fail('Lançamento não encontrado', 'NOT_FOUND') }
    return ok(updated)
  })

  fastify.delete('/api/financeiro/lancamentos/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const okDel = svc.deletarLancamento(id)
    if (!okDel) { reply.status(404); return fail('Lançamento não encontrado', 'NOT_FOUND') }
    return ok({ deleted: true })
  })

  /** Importar extrato OFX — cria lançamentos e sugere categoria para cada um. */
  fastify.post('/api/financeiro/lancamentos/importar-ofx', async (req: FastifyRequest, reply: FastifyReply) => {
    const parts = req.parts()
    const fields: Record<string, string> = {}
    let ofxContent: string | undefined
    let anexo: Anexo | undefined

    for await (const part of parts) {
      if (part.type === 'file') {
        const file = part as MultipartFile
        const buf = await file.toBuffer()
        ofxContent = buf.toString('utf-8')
        const competencia = fields.competencia ?? new Date().toISOString().slice(0, 7)
        anexo = svc.saveAnexo(competencia, 'extratos', file.filename, buf)
      } else {
        fields[part.fieldname] = part.value as string
      }
    }

    if (!ofxContent) { reply.status(400); return fail('Arquivo OFX não enviado', 'NO_FILE') }

    const contaId = fields.contaId ?? 'default'
    const parsed = parseOfx(ofxContent)

    const existentesFitid = new Set(
      svc.listarLancamentos({ contaId }).map((l) => l.fitid).filter((f): f is string => !!f)
    )

    const criados: LancamentoBancario[] = []
    const duplicados: Array<{ fitid: string; motivo: string }> = []

    for (const tx of parsed.transactions) {
      if (tx.fitid && existentesFitid.has(tx.fitid)) {
        duplicados.push({ fitid: tx.fitid, motivo: 'FITID já importado anteriormente' })
        continue
      }
      const catSugerida = sugerirCategoriaLancamento(tx.descricao)
      const l = svc.criarLancamento({
        contaId,
        data: tx.data,
        descricao: tx.descricao,
        valor: tx.valor,
        tipo: tx.tipo,
        categoria: catSugerida as LancamentoBancario['categoria'],
        fitid: tx.fitid,
        origem: 'ofx',
      })
      criados.push(l)
    }

    return ok({
      conta: { bankId: parsed.bankId, accountId: parsed.accountId, accountType: parsed.accountType, balanceAmt: parsed.balanceAmt, balanceDate: parsed.balanceDate },
      periodo: { inicio: parsed.periodStart, fim: parsed.periodEnd },
      totais: {
        transacoesRecebidas: parsed.transactions.length,
        criados: criados.length,
        duplicados: duplicados.length,
      },
      criados,
      duplicados,
      anexo,
    })
  })

  /** Vincular lançamento a receita/despesa/imposto. */
  fastify.post('/api/financeiro/lancamentos/:id/vincular', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const { tipo, entidadeId } = req.body as { tipo: 'receita' | 'despesa' | 'imposto'; entidadeId: string }
    const updated = svc.atualizarLancamento(id, { vinculadoA: { tipo, id: entidadeId } })
    if (!updated) { reply.status(404); return fail('Lançamento não encontrado', 'NOT_FOUND') }
    return ok(updated)
  })

  /* ════════════════ CONFIGURAÇÃO ════════════════ */

  fastify.get('/api/financeiro/config', async () => ok(svc.getConfig()))

  fastify.put('/api/financeiro/config', async (req: FastifyRequest) => {
    const patch = req.body as Partial<ConfiguracaoFinanceiro>
    return ok(svc.atualizarConfig(patch))
  })

  /* ════════════════ FECHAMENTO ════════════════ */

  fastify.get('/api/financeiro/fechamento/:competencia/checklist', async (req: FastifyRequest) => {
    const { competencia } = req.params as { competencia: string }
    return ok(svc.gerarChecklistFechamento(competencia))
  })

  fastify.post('/api/financeiro/fechamento/:competencia/gerar', async (req: FastifyRequest) => {
    const { competencia } = req.params as { competencia: string }
    const fech = getFechamentoService(svc)
    const pacote = await fech.gerarPacote(competencia)
    return ok(pacote)
  })

  fastify.get('/api/financeiro/fechamento/:competencia/download-zip', async (req: FastifyRequest, reply: FastifyReply) => {
    const { competencia } = req.params as { competencia: string }
    const fech = getFechamentoService(svc)
    const pacote = await fech.gerarPacote(competencia)
    const buf = fech.lerArquivo(pacote.caminhoZip)
    if (!buf) { reply.status(500); return fail('Falha ao gerar ZIP', 'ZIP_ERROR') }
    reply.header('Content-Type', 'application/zip')
    reply.header('Content-Disposition', `attachment; filename="fechamento-${competencia}.zip"`)
    return reply.send(buf)
  })

  fastify.get('/api/financeiro/fechamento/:competencia/download-pdf', async (req: FastifyRequest, reply: FastifyReply) => {
    const { competencia } = req.params as { competencia: string }
    const fech = getFechamentoService(svc)
    const pacote = await fech.gerarPacote(competencia)
    const buf = fech.lerArquivo(pacote.caminhoPdf)
    if (!buf) { reply.status(500); return fail('Falha ao gerar PDF', 'PDF_ERROR') }
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="fechamento-${competencia}.pdf"`)
    return reply.send(buf)
  })
}

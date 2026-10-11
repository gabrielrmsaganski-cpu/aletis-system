// ============================================================
// alix-power — tools que cobrem gaps críticos de capacidade da ALIX
// ============================================================
// Inclui: CRUD de planos de custeio, DSCR + simulação multi-cenário,
// reestruturação de dívida, geração de contrato, magic-link/pendência
// no portal do cliente, envio de WhatsApp on-demand, busca de preços
// de commodities e ingestão estruturada de documentos.
//
// Tools com side-effect (criar plano, enviar mensagem, criar pendência)
// usam o flag de "sensitive" no description e são auditadas via Portal
// /Telemetry. Tools puras (DSCR, simulação, leitura) são chamáveis
// livremente pelo Orchestrator.
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { isPgEnabled } from '../../../db/client.js'
import { getCusteioService } from '../../custeio/CusteioService.js'
import { clientes } from '../../../routes/clientes.js'
import {
  emitirToken,
} from '../../PortalTokenService.js'
import {
  enviarMagicLink,
  enviarBoasVindas,
  enviarResetSenha,
  notificarMensagemConsultor,
} from '../../PortalNotificationService.js'
import {
  registrarEvento,
} from '../../PortalStore.js'
import { portalDocumentService, PortalDocumentError } from '../../portal/PortalDocumentService.js'
import { portalDocumentCreateSchema } from '../../portal/PortalDocumentSchemas.js'
import { publicPortalRequest } from '../../portal/PortalDocumentPresentation.js'

const portalRequestToolSchema = portalDocumentCreateSchema.extend({ clienteId: z.string().trim().min(1).max(100) })

/* ────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────── */

function formatBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function safeRequire(loader: () => Promise<unknown>): Promise<any | null> {
  return loader().then((m) => m as any).catch(() => null)
}

/* ────────────────────────────────────────────────────────────
 * Build
 * ──────────────────────────────────────────────────────────── */

export function buildAlixPowerTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  // ───────────────────────────────────────────────────────────
  // 1. criar_plano_custeio
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'criar_plano_custeio',
    description:
      'Cria um novo plano de custeio agrícola para um cliente. Use quando precisar registrar formalmente um cenário de financiamento de safra com proponente, glebas, itens de orçamento, desembolsos e cronograma. Side-effect: persiste no storage. Retorna o plano criado com ID gerado.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        proponente: {
          type: 'object',
          properties: {
            nome: { type: 'string' },
            cpfCnpj: { type: 'string' },
            cidade: { type: 'string' },
            uf: { type: 'string' },
          },
          required: ['nome'],
        },
        safra: { type: 'string', description: 'YYYY/YY ex: 2026/27' },
        cultura: { type: 'string', description: 'Cultura principal (soja/milho/algodao/...)' },
        glebas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nome: { type: 'string' },
              areaHa: { type: 'number' },
              cultura: { type: 'string' },
              produtividadeEsperada: { type: 'number' },
            },
            required: ['nome', 'areaHa'],
          },
        },
        valorSolicitado: { type: 'number' },
        observacoes: { type: 'string' },
      },
      required: ['clienteId', 'proponente', 'safra', 'cultura'],
    },
  })
  registry['criar_plano_custeio'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const svc = getCusteioService()
      const plano = svc.criar({
        clienteId: i.clienteId,
        proponente: i.proponente,
        safra: i.safra,
        cultura: i.cultura,
        glebas: i.glebas ?? [],
        valorSolicitado: i.valorSolicitado ?? 0,
        observacoes: i.observacoes,
      } as any)
      return { ok: true, plano }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 2. listar_planos_custeio_cliente
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'listar_planos_custeio_cliente',
    description:
      'Lista todos os planos de custeio cadastrados para um cliente, ordenados por data de atualização.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
      },
      required: ['clienteId'],
    },
  })
  registry['listar_planos_custeio_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const svc = getCusteioService()
      return { planos: svc.listarPorCliente(i.clienteId) }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 3. atualizar_plano_custeio
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'atualizar_plano_custeio',
    description:
      'Atualiza campos de um plano de custeio existente (status, glebas, itens de orçamento, desembolsos, observações). Side-effect: sobrescreve no storage. Retorna o plano atualizado.',
    input_schema: {
      type: 'object',
      properties: {
        planoId: { type: 'string' },
        patch: {
          type: 'object',
          description: 'Campos a alterar — qualquer subset de PlanoCusteio',
        },
      },
      required: ['planoId', 'patch'],
    },
  })
  registry['atualizar_plano_custeio'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const svc = getCusteioService()
      const updated = svc.atualizar(i.planoId, i.patch)
      if (!updated) return { ok: false, error: 'Plano não encontrado' }
      return { ok: true, plano: updated }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 4. duplicar_plano_custeio
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'duplicar_plano_custeio',
    description:
      'Clona um plano de custeio existente para uma nova safra (ex.: replicar plano 2025/26 para 2026/27 mantendo glebas e estrutura).',
    input_schema: {
      type: 'object',
      properties: {
        planoId: { type: 'string' },
        novaSafra: { type: 'string', description: 'YYYY/YY' },
      },
      required: ['planoId', 'novaSafra'],
    },
  })
  registry['duplicar_plano_custeio'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const svc = getCusteioService()
      const novo = svc.duplicar(i.planoId, i.novaSafra)
      if (!novo) return { ok: false, error: 'Plano original não encontrado' }
      return { ok: true, plano: novo }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 5. calcular_dscr_cliente
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'calcular_dscr_cliente',
    description:
      'Calcula o DSCR (Debt Service Coverage Ratio) anual de um cliente a partir de receita projetada e serviço da dívida (parcela mensal × 12). Classifica em saudável (≥1.5), atenção (1.2-1.5), crítico (1.0-1.2) ou insolvente (<1.0). Base: MCR 2-6-4 BCB, CMN 5.152/2024.',
    input_schema: {
      type: 'object',
      properties: {
        receitaAnualProjetada: { type: 'number' },
        servicoMensalDivida: { type: 'number' },
        observacao: { type: 'string' },
      },
      required: ['receitaAnualProjetada', 'servicoMensalDivida'],
    },
  })
  registry['calcular_dscr_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const servicoAnual = i.servicoMensalDivida * 12
      const dscr = servicoAnual > 0 ? i.receitaAnualProjetada / servicoAnual : 0
      let classificacao: string
      if (dscr >= 1.5) classificacao = 'saudavel'
      else if (dscr >= 1.2) classificacao = 'atencao'
      else if (dscr >= 1.0) classificacao = 'critico'
      else classificacao = 'insolvente'
      return {
        dscr: Number(dscr.toFixed(3)),
        servicoAnualDivida: Number(servicoAnual.toFixed(2)),
        receitaAnualProjetada: i.receitaAnualProjetada,
        classificacao,
        recomendacao:
          classificacao === 'saudavel'
            ? 'Manter estrutura atual; cliente tem folga para tomar mais crédito se preciso.'
            : classificacao === 'atencao'
            ? 'Reforçar reservas de safra; evitar novo crédito sem hedge ou alongamento.'
            : classificacao === 'critico'
            ? 'Renegociar carência ou prazo imediatamente; sem reestruturação, default provável em estresse de safra.'
            : 'Insolvente no cenário atual — reestruturação obrigatória, considerar Lei 14.181/21 ou alongamento via MP rural.',
        fundamentacao: 'MCR 2-6-4 BCB · CMN 5.152/2024.',
      }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 6. simular_reestruturacao_divida
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'simular_reestruturacao_divida',
    description:
      'Simula amortização PRICE de uma dívida com 4 cenários de stress (otimista/realista/pessimista/estresse) sobre preço de commodity, produtividade e taxa. Retorna parcela mensal, juros totais, DSCR e classificação por cenário.',
    input_schema: {
      type: 'object',
      properties: {
        saldoDevedor: { type: 'number' },
        taxaAnualBase: { type: 'number', description: 'Decimal: 0.13 = 13%a.a.' },
        prazoMeses: { type: 'number' },
        exposicaoCommodity: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              commodity: { type: 'string' },
              areaHa: { type: 'number' },
              produtividade: { type: 'number' },
              precoReferencia: { type: 'number' },
            },
            required: ['commodity', 'areaHa', 'produtividade', 'precoReferencia'],
          },
        },
      },
      required: ['saldoDevedor', 'taxaAnualBase', 'prazoMeses'],
    },
  })
  registry['simular_reestruturacao_divida'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const cenarios = [
        { nome: 'otimista', shockPrecoPct: 10, shockProdutividadePct: 8, shockTaxaPp: -1 },
        { nome: 'realista', shockPrecoPct: 0, shockProdutividadePct: 0, shockTaxaPp: 0 },
        { nome: 'pessimista', shockPrecoPct: -20, shockProdutividadePct: -15, shockTaxaPp: 2 },
        { nome: 'estresse', shockPrecoPct: -35, shockProdutividadePct: -25, shockTaxaPp: 4 },
      ]
      const exposicao = i.exposicaoCommodity || []
      const receitaBaseAnual = exposicao.reduce(
        (acc: number, e: any) => acc + e.areaHa * e.produtividade * e.precoReferencia,
        0,
      )
      const resultados = cenarios.map((c) => {
        const taxaCenario = i.taxaAnualBase + c.shockTaxaPp / 100
        const taxaMensal = Math.pow(1 + taxaCenario, 1 / 12) - 1
        const parcela =
          (i.saldoDevedor * taxaMensal) /
          (1 - Math.pow(1 + taxaMensal, -i.prazoMeses))
        const totalPago = parcela * i.prazoMeses
        const juros = totalPago - i.saldoDevedor
        const fatorPreco = 1 + c.shockPrecoPct / 100
        const fatorProd = 1 + c.shockProdutividadePct / 100
        const receitaCenario = receitaBaseAnual * fatorPreco * fatorProd
        const servicoAnualDivida = parcela * 12
        const dscr = receitaCenario > 0 ? receitaCenario / servicoAnualDivida : 0
        let classificacao: string
        if (dscr >= 1.5) classificacao = 'saudavel'
        else if (dscr >= 1.2) classificacao = 'atencao'
        else if (dscr >= 1.0) classificacao = 'critico'
        else classificacao = 'insolvente'
        return {
          nome: c.nome,
          taxaAnualCenario: Number((taxaCenario * 100).toFixed(3)),
          parcelaMensal: Number(parcela.toFixed(2)),
          totalPago: Number(totalPago.toFixed(2)),
          jurosTotais: Number(juros.toFixed(2)),
          receitaAnualCenario: Number(receitaCenario.toFixed(2)),
          servicoAnualDivida: Number(servicoAnualDivida.toFixed(2)),
          dscr: Number(dscr.toFixed(3)),
          classificacao,
        }
      })
      const realista = resultados.find((r) => r.nome === 'realista')!
      const pessimista = resultados.find((r) => r.nome === 'pessimista')!
      return {
        parametros: {
          saldoDevedor: i.saldoDevedor,
          taxaAnualBase: i.taxaAnualBase,
          prazoMeses: i.prazoMeses,
          receitaBaseAnual: Number(receitaBaseAnual.toFixed(2)),
        },
        cenarios: resultados,
        resumo: {
          dscrRealista: realista.dscr,
          dscrPessimista: pessimista.dscr,
          alertaInsolvencia: resultados.some((r) => r.classificacao === 'insolvente'),
        },
        fundamentacao: 'MCR 2-6-4 BCB · CMN 5.152/2024 · DSCR ≥ 1.5 saudável.',
      }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 7. enviar_magic_link_portal
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'enviar_magic_link_portal',
    description:
      'Gera e envia um magic-link de acesso ao Portal do Cliente via WhatsApp e/ou e-mail (15min de validade). Use quando o cliente perdeu o acesso, primeiro acesso, ou para retomar contato. Side-effect: dispara mensagem real (em produção). Retorna URL e canais usados.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        motivo: {
          type: 'string',
          enum: ['primeiro_acesso', 'recuperacao', 'reengajamento'],
          description: 'Influencia copy da mensagem',
        },
      },
      required: ['clienteId'],
    },
  })
  registry['enviar_magic_link_portal'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const c = clientes.get(i.clienteId)
      if (!c) return { ok: false, error: 'Cliente não encontrado' }
      if (!c.portalAcesso) return { ok: false, error: 'Cliente sem credenciais de portal — chame criar_acesso_portal primeiro.' }
      const { token } = emitirToken({
        clienteId: i.clienteId,
        tipo: 'magic',
        canal: c.email ? 'email' : 'whatsapp',
        metadata: { motivo: i.motivo, origem: 'alix' },
      })
      const base = process.env.ALETIS_PORTAL_BASE_URL || 'http://localhost:5173'
      const url = `${base.replace(/\/$/, '')}/portal-cliente?magic=${encodeURIComponent(token)}`
      const sendFn = i.motivo === 'recuperacao' ? enviarResetSenha : enviarMagicLink
      const res = await sendFn({
        destinatario: { email: c.email, whatsapp: c.telefone },
        nome: c.nome,
        url,
        consultor: c.consultor,
      } as any)
      registrarEvento({
        clienteId: i.clienteId,
        tipo: 'magic_solicitado',
        canal: 'consultor',
        detalhes: { origem: 'alix', motivo: i.motivo, resultado: res },
      })
      return { ok: true, url, canais: res, motivo: i.motivo }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 8. criar_pendencia_portal_cliente
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'criar_pendencia_portal_cliente',
    description:
      'Publica uma solicitação de documento no Portal do Cliente, com instruções, prioridade, prazo e tipo esperado. O cliente pode enviar versões e receber orientação de correção. Consulte os pedidos existentes antes de criar; a mesma chave de idempotência retorna o pedido já criado. Não envia notificações externas. Use prazo somente quando informado pela equipe, nunca invente urgência.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        titulo: { type: 'string', description: 'Ex: "IRPF 2024"' },
        descricao: { type: 'string', description: 'Instrução curta para o cliente' },
        categoria: {
          type: 'string',
          enum: ['fiscal', 'contrato', 'identidade', 'patrimonio', 'agro', 'outros'],
        },
        obrigatorio: { type: 'boolean' },
        prioridade: { type: 'string', enum: ['normal', 'alta', 'urgente'] },
        prazo: { type: 'string', description: 'Data YYYY-MM-DD combinada com a equipe, opcional.' },
        tipoDocumento: { type: 'string', description: 'Tipo específico esperado, por exemplo IRPF completo do exercício 2025.' },
        idempotencyKey: { type: 'string', description: 'Chave estável da solicitação (8 a 200 caracteres); reutilize em tentativas da mesma operação.' },
      },
      required: ['clienteId', 'titulo'],
    },
  })
  registry['criar_pendencia_portal_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const parsed = portalRequestToolSchema.safeParse(i)
      if (!parsed.success) return { ok: false, error: 'Dados da solicitação inválidos.', code: 'PORTAL_DOCUMENT_INVALID', detalhes: parsed.error.issues.map(issue => ({ campo: issue.path.join('.'), mensagem: issue.message })) }
      const { clienteId, ...data } = parsed.data
      if (!isPgEnabled() && !clientes.has(clienteId)) return { ok: false, error: 'Cliente não encontrado.', code: 'PORTAL_DOCUMENT_NOT_FOUND' }
      const request = { ...data, solicitadoPor: 'ALIX (assistente)' }
      const key = data.idempotencyKey ?? `alix-doc:${createHash('sha256').update(JSON.stringify({ clienteId, ...request })).digest('hex')}`
      try {
        const record = await portalDocumentService.criarPendencia(clienteId, { ...request, idempotencyKey: key }, { ator: 'alix', canal: 'consultor' })
        return { ok: true, pendencia: publicPortalRequest(record) }
      } catch (error) {
        if (error instanceof PortalDocumentError) return { ok: false, error: error.message, code: error.code }
        throw error
      }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 9. enviar_whatsapp_cliente
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'enviar_whatsapp_cliente',
    description:
      'Envia mensagem WhatsApp on-demand para o cliente (texto livre). Use para confirmar agendamento, alertar vencimento, parabenizar pagamento ou avisar que o consultor vai retornar. Side-effect: dispara via WhatsApp Cloud API. Em DRY-RUN se Meta não estiver configurada.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        mensagem: { type: 'string', description: 'Texto livre, máx 2000 chars' },
        previa: { type: 'boolean', description: 'Se true, retorna o texto sem enviar (preview)' },
      },
      required: ['clienteId', 'mensagem'],
    },
  })
  registry['enviar_whatsapp_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const c = clientes.get(i.clienteId)
      if (!c) return { ok: false, error: 'Cliente não encontrado' }
      if (!c.telefone) return { ok: false, error: 'Cliente sem telefone cadastrado' }
      const texto = String(i.mensagem || '').slice(0, 2000)
      if (i.previa) {
        return { ok: true, modo: 'previa', destinatario: c.telefone, texto }
      }
      const res = await notificarMensagemConsultor({
        destinatario: { whatsapp: c.telefone },
        nomeCliente: c.nome,
        preview: texto,
        consultor: c.consultor || 'Equipe ALETIS',
        urlPortal: process.env.ALETIS_PORTAL_BASE_URL || 'https://app.aletis.com.br',
      })
      registrarEvento({
        clienteId: i.clienteId,
        tipo: 'mensagem_enviada',
        canal: 'consultor',
        detalhes: { origem: 'alix', canal: 'whatsapp', resultado: res },
      })
      return { ok: true, canais: res }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 10. gerar_contrato_prestacao_servico
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'gerar_contrato_prestacao_servico',
    description:
      'Gera contrato de prestação de serviços (CPS) ALETIS-cliente em PDF — diagnóstico financeiro, reestruturação ou retainer mensal. Side-effect: cria PDF no storage e devolve URL de download.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        modalidade: {
          type: 'string',
          enum: ['diagnostico', 'reestruturacao', 'retainer_mensal', 'hibrido'],
        },
        valorFixo: { type: 'number' },
        valorMensal: { type: 'number' },
        percentualExito: { type: 'number', description: '% sobre economia (0-30)' },
        prazoMeses: { type: 'number' },
      },
      required: ['clienteId', 'modalidade'],
    },
  })
  registry['gerar_contrato_prestacao_servico'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const c = clientes.get(i.clienteId)
      if (!c) return { ok: false, error: 'Cliente não encontrado' }
      // Tenta usar ContratoGenerator real; caímos pra stub se não disponível
      const mod = await safeRequire(() => import('../../ContratoGenerator.js' as string) as any)
      if (!mod || !mod.gerarContratoPrestacaoServico) {
        return {
          ok: true,
          modo: 'stub',
          aviso: 'ContratoGenerator não plugado — geração real ainda não disponível, contrato salvo apenas como rascunho lógico.',
          rascunho: {
            cliente: { nome: c.nome, cpfCnpj: c.cpfCnpj },
            modalidade: i.modalidade,
            valorFixo: i.valorFixo,
            valorMensal: i.valorMensal,
            percentualExito: i.percentualExito,
            prazoMeses: i.prazoMeses,
            geradoEm: new Date().toISOString(),
          },
        }
      }
      const out = await mod.gerarContratoPrestacaoServico({
        cliente: c,
        modalidade: i.modalidade,
        valorFixo: i.valorFixo,
        valorMensal: i.valorMensal,
        percentualExito: i.percentualExito,
        prazoMeses: i.prazoMeses,
      })
      return { ok: true, ...out }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 11. gerar_relatorio_gerencial
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'gerar_relatorio_gerencial',
    description:
      'Gera relatório gerencial do cliente: posição de carteira, DSCR atual, próximos vencimentos, recomendações. Útil para reuniões de status mensais. PDF salvo no storage.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        periodoMeses: { type: 'number', description: 'Range a olhar (default 6)' },
      },
      required: ['clienteId'],
    },
  })
  registry['gerar_relatorio_gerencial'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const c = clientes.get(i.clienteId)
      if (!c) return { ok: false, error: 'Cliente não encontrado' }
      const mod = await safeRequire(() => import('../../RelatorioGerencialGenerator.js' as string) as any)
      const periodo = Number(i.periodoMeses) || 6
      if (!mod || !mod.gerarRelatorioGerencial) {
        // Fallback: relatório textual estruturado (resumo)
        const economia = c.dividas.reduce(
          (acc: number, d: any) => acc + Math.max(0, d.valorOriginal - d.valorAtualizado),
          0,
        )
        return {
          ok: true,
          modo: 'resumo',
          resumo: {
            cliente: { id: c.id, nome: c.nome, estagio: c.estagio },
            posicao: {
              dividaOriginal: c.dividas.reduce((a: number, d: any) => a + d.valorOriginal, 0),
              dividaAtualizada: c.dividas.reduce((a: number, d: any) => a + d.valorAtualizado, 0),
              jaPago: c.valorTotalPago,
              economia,
              economiaFmt: formatBRL(economia),
            },
            ultimosEventos: (c.timeline || []).slice(-5),
            periodoMeses: periodo,
          },
        }
      }
      const out = await mod.gerarRelatorioGerencial({ cliente: c, periodoMeses: periodo })
      return { ok: true, ...out }
    },
  }

  // ───────────────────────────────────────────────────────────
  // 12. extrair_dados_documento
  // ───────────────────────────────────────────────────────────
  tools.push({
    name: 'extrair_dados_documento',
    description:
      'Extrai dados estruturados de um documento já enviado (PDF/imagem/Excel/DOCX) usando o pipeline DocumentIntakeService + LlmDocExtractor. Identifica CPF, valores, datas, partes contratantes etc. Use quando consultor enviou um documento e quer que ALIX leia e popule os campos do CRM.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'ID da sessão Alix onde o documento foi enviado' },
        documentoId: { type: 'string', description: 'ID retornado pelo upload' },
        tipo: {
          type: 'string',
          enum: ['irpf', 'certidao', 'ccb', 'cpr', 'comprovante_pagamento', 'identidade', 'auto'],
          description: 'Auto deixa o LLM detectar; tipos específicos guiam a extração',
        },
        camposEsperados: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Lista opcional de campos a extrair (ex: ["cpf", "nome", "valor_total", "vencimento"])',
        },
      },
      required: ['sessionId', 'documentoId'],
    },
  })
  registry['extrair_dados_documento'] = {
    spec: tools[tools.length - 1],
    handler: async (i: any) => {
      const intake = await safeRequire(() => import('../intake/DocumentIntakeService.js' as string) as any)
      if (!intake) {
        return { ok: false, error: 'Pipeline de intake indisponível neste deployment.' }
      }
      const intakeSvc = intake.getDocumentIntakeService?.() || intake.default
      if (!intakeSvc) {
        return { ok: false, error: 'Servicos de intake não inicializados.' }
      }
      try {
        const doc = await intakeSvc.get(String(i.sessionId), String(i.documentoId))
        if (!doc) return { ok: false, error: 'Documento não encontrado nesta sessão.' }
        return {
          ok: true,
          documentoId: i.documentoId,
          dados: {
            tipoDocumento: (doc.metadata as any)?.entitySummary || 'Não classificado',
            entidades: (doc.metadata as any)?.entities || [],
            camposEstruturados: (doc.metadata as any)?.entityStructured || {},
            suggestedActions: (doc.metadata as any)?.suggestedActions || [],
            extractedTextPreview: doc.extractedText?.slice(0, 2000),
          },
        }
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Falha na extração' }
      }
    },
  }

  return { tools, registry }
}

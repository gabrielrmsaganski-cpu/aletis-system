// ============================================================
// ALETIS — Eventos operacionais para memória da ALIX
//
// Grava memória real a partir de acontecimentos do CRM. A intenção é
// manter um rastro consultivo por cliente sem depender de o usuário abrir
// a página da ALIX ou conversar explicitamente com ela.
// ============================================================

import { getAlixMemoryService } from './AlixMemoryService.js'

type ClienteLike = Record<string, any>
type PropostaLike = Record<string, any>

function clean(value: unknown, max = 240): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text
}

function fmtBRL(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(n)
}

function clienteNome(cliente: ClienteLike): string {
  return clean(cliente?.nome || cliente?.clienteNome || cliente?.id || 'Cliente', 160)
}

function clienteId(clienteOrId: ClienteLike | string): string {
  if (typeof clienteOrId === 'string') return clienteOrId
  return String(clienteOrId?.id || clienteOrId?.clienteId || '').trim()
}

function perfilFromCliente(cliente: ClienteLike): string[] {
  const parts: string[] = []
  if (cliente?.cpfCnpj) parts.push(`Documento: ${clean(cliente.cpfCnpj, 40)}`)
  if (cliente?.cidade || cliente?.uf) parts.push(`Localização: ${[cliente.cidade, cliente.uf].filter(Boolean).join('/')}`)
  if (cliente?.atividade) parts.push(`Atividade: ${clean(cliente.atividade, 120)}`)
  if (Number(cliente?.areaTotalHa) > 0) parts.push(`Área declarada: ${Number(cliente.areaTotalHa).toLocaleString('pt-BR')} ha`)
  if (Array.isArray(cliente?.culturas) && cliente.culturas.length > 0) {
    parts.push(`Culturas: ${cliente.culturas.slice(0, 6).map((c: unknown) => clean(c, 40)).join(', ')}`)
  }
  if (cliente?.consultor) parts.push(`Consultor responsável: ${clean(cliente.consultor, 80)}`)
  return parts
}

function dividasFromCliente(cliente: ClienteLike): string[] {
  const out: string[] = []
  if (Array.isArray(cliente?.dividas) && cliente.dividas.length > 0) {
    for (const d of cliente.dividas.slice(0, 8)) {
      const credor = clean(d?.credor || d?.banco || d?.instituicao || cliente?.credor || 'Credor a confirmar', 80)
      const valor = fmtBRL(d?.valorAtualizado ?? d?.valor ?? d?.saldoDevedor ?? d?.valorOriginal)
      const contrato = d?.contrato || d?.numeroContrato ? ` · contrato ${clean(d.contrato || d.numeroContrato, 80)}` : ''
      out.push(`${credor}${valor ? ` · ${valor}` : ''}${contrato}`)
    }
  } else {
    const valor = fmtBRL(cliente?.valorTotalDivida ?? cliente?.valorDivida)
    if (valor || cliente?.credor) out.push(`${clean(cliente?.credor || 'Credor a confirmar', 80)}${valor ? ` · ${valor}` : ''}`)
  }
  return out
}

export async function rememberClienteSnapshot(
  cliente: ClienteLike,
  evento: string,
  detalhes?: string,
): Promise<void> {
  const id = clienteId(cliente)
  if (!id) return
  const now = new Date().toISOString()
  const historico = [clean([evento, detalhes].filter(Boolean).join(' — '), 900)]
  const proximasAcoes: string[] = []
  const alertas: string[] = []

  const acao = cliente?.proximaAcao && typeof cliente.proximaAcao === 'object' ? cliente.proximaAcao : null
  if (acao?.data || acao?.descricao) {
    proximasAcoes.push(`${clean(acao.descricao || 'Próxima ação sem descrição', 240)}${acao.data ? ` (${clean(acao.data, 20)})` : ''}`)
  }
  if (Number(cliente?.saudeFinanceira) > 0 && Number(cliente.saudeFinanceira) < 45) {
    alertas.push(`Saúde financeira baixa no CRM: ${Number(cliente.saudeFinanceira)}/100`)
  }
  if (cliente?.estagio && ['proposta', 'negociacao', 'acordo'].includes(String(cliente.estagio).toLowerCase()) && !acao) {
    alertas.push(`Cliente em estágio ${cliente.estagio} sem próxima ação cadastrada.`)
  }

  try {
    await getAlixMemoryService().upsert(id, {
      clienteNome: clienteNome(cliente),
      perfil: perfilFromCliente(cliente),
      dividasAtivas: dividasFromCliente(cliente),
      proximasAcoes,
      alertas,
      historico: historico.map((texto) => ({ data: now, texto })),
    })
  } catch (err) {
    console.warn('[AlixMemoryEvents] falha ao gravar snapshot de cliente:', (err as Error).message)
  }
}

export function rememberClienteHistorico(
  clienteOrId: ClienteLike | string,
  texto: string,
  clienteNomeHint?: string,
): void {
  const id = clienteId(clienteOrId)
  const t = clean(texto, 900)
  if (!id || !t) return
  const patch: ClienteLike = typeof clienteOrId === 'string'
    ? { id, nome: clienteNomeHint || id }
    : clienteOrId
  void getAlixMemoryService().upsert(id, {
    clienteNome: clienteNome(patch),
    historico: [{ data: new Date().toISOString(), texto: t }],
  }).catch((err) => {
    console.warn('[AlixMemoryEvents] falha ao gravar histórico:', (err as Error).message)
  })
}

export function rememberDocumentoCliente(params: {
  clienteId: string
  clienteNome?: string
  nome: string
  categoria?: string
  resumo?: string
}): void {
  rememberClienteHistorico(
    { id: params.clienteId, nome: params.clienteNome || params.clienteId },
    [
      `Documento anexado ao cliente: ${clean(params.nome, 180)}`,
      params.categoria ? `categoria ${clean(params.categoria, 60)}` : '',
      params.resumo ? `resumo: ${clean(params.resumo, 520)}` : '',
    ].filter(Boolean).join(' · '),
  )
}

export function rememberPropostaCliente(proposta: PropostaLike, evento = 'Proposta atualizada no CRM'): void {
  const id = clienteId(proposta)
  if (!id) return
  const valorDivida = fmtBRL(proposta?.valorDivida)
  const valorProposta = fmtBRL(proposta?.valorProposta)
  const desconto = Number(proposta?.descontoPercentual)
  const bits = [
    evento,
    proposta?.titulo ? clean(proposta.titulo, 180) : '',
    proposta?.credor ? `credor ${clean(proposta.credor, 100)}` : '',
    valorDivida ? `dívida ${valorDivida}` : '',
    valorProposta ? `proposta ${valorProposta}` : '',
    Number.isFinite(desconto) && desconto > 0 ? `desconto ${desconto.toFixed(1).replace('.', ',')}%` : '',
    proposta?.status ? `status ${clean(proposta.status, 60)}` : '',
    proposta?.dataValidade ? `validade ${clean(proposta.dataValidade, 24)}` : '',
  ].filter(Boolean)

  rememberClienteHistorico(
    { id, nome: proposta?.clienteNome || id },
    bits.join(' · '),
  )
}

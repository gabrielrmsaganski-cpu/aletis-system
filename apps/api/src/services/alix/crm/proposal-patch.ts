import { propostaPatchSchema } from '../../../lib/crm-write-validation.js'

/** Converte apenas aliases conhecidos; campos sem efeito nunca viram sucesso. */
export function normalizeAlixProposalPatch(input: Record<string, unknown>) {
  const patch = { ...input }
  for (const [alias, canonical] of Object.entries({ valor: 'valorProposta', dividaTotal: 'valorDivida', observacao: 'observacoes' })) {
    if (patch[alias] === undefined) continue
    if (patch[canonical] !== undefined && String(patch[alias]) !== String(patch[canonical])) {
      throw new Error(`Informe apenas um valor para ${canonical}.`)
    }
    patch[canonical] = patch[alias]
    delete patch[alias]
  }
  const parsed = propostaPatchSchema.safeParse(patch)
  if (!parsed.success) throw new Error('Campos inválidos para atualizar a proposta. Confira os valores, o status e as datas.')
  const unsupported = Object.keys(patch).filter(key => !(key in parsed.data))
  if (unsupported.length) throw new Error(`Campos não suportados na proposta: ${unsupported.join(', ')}. Use os campos do editor de propostas.`)
  return parsed.data
}

class AlixReliabilityProvider {
  id() {
    return 'aletis-alix-reliability-guard'
  }

  async callApi(_prompt, context) {
    const vars = context?.vars || {}
    const payload = vars.payload || {}
    const operation = String(vars.operation || 'onboarding_cliente_completo')
    if (operation === 'document_grounding_baseline') {
      const input = payload.anonymizedInput || {}
      const expected = payload.expectedOutput || {}
      const observable = input.observable || {}
      const correctSources = Array.isArray(payload.correctSources) ? payload.correctSources : []
      const sensitiveKeys = /^(clienteId|documentId|sessionId|runId|sourceSha256|valueText|normalizedValue|evidenceText|filename|cpf|cnpj|email|telefone)$/i
      const hasSensitiveKey = (value) => {
        if (Array.isArray(value)) return value.some(hasSensitiveKey)
        if (!value || typeof value !== 'object') return false
        return Object.entries(value).some(([key, item]) => sensitiveKeys.test(key) || hasSensitiveKey(item))
      }
      const reasons = []
      if (!/^SRC-[a-f0-9]{16}$/.test(String(input.sourceRef || ''))) reasons.push('fonte anônima inválida')
      if (expected.sourceRef !== input.sourceRef) reasons.push('fonte esperada divergente')
      if (expected.pipelineDecision !== observable.pipelineStatus) reasons.push('decisão divergente')
      if (expected.requiresCitation !== true) reasons.push('citação não obrigatória')
      if (!correctSources.some((source) => source.sourceRef === input.sourceRef)) reasons.push('fonte correta ausente')
      if (hasSensitiveKey(payload)) reasons.push('shape contém chave sensível')
      return { output: `${reasons.length === 0 ? 'PASS' : 'FAIL'}: ${reasons.join('; ') || 'caso real anonimizado e rastreável.'}` }
    }
    const evidencias = Array.isArray(payload.evidencias) ? payload.evidencias : []
    const evidenceText = evidencias
      .flatMap((ev) => [ev.field, ev.campo, ev.fonte, ev.trecho, ev.text])
      .filter(Boolean)
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    const confidence = typeof payload.confiancaDocumento === 'number' ? payload.confiancaDocumento : undefined
    const reasons = []
    if (!payload.documentoId) reasons.push('sem documentoId')
    if (confidence === undefined || confidence < 0.65) reasons.push('confianca baixa/ausente')
    if (evidencias.length === 0) reasons.push('sem evidencias')
    if (operation === 'onboarding_cliente_completo') {
      for (const field of ['nome', 'cpfCnpj', 'dividaTotal']) {
        if (!payload[field]) reasons.push(`sem ${field}`)
      }
      if (!/(nome|cliente|contratante|devedor)/.test(evidenceText)) reasons.push('sem evidencia de nome')
      if (!/(cpf|cnpj|cpfcnpj|documento)/.test(evidenceText)) reasons.push('sem evidencia de cpfCnpj')
      if (!/(divida|debito|saldo|valor|contrato)/.test(evidenceText)) reasons.push('sem evidencia de dividaTotal')
    }
    const ok = reasons.length === 0
    return {
      output: `${ok ? 'ALLOW' : 'BLOCK'}: ${reasons.join('; ') || 'operação documental com lastro mínimo.'}`,
    }
  }
}

module.exports = AlixReliabilityProvider

/**
 * ContratoGenerator — gerador de instrumentos contratuais para
 * reestruturação de dívida rural e comercialização de safra.
 *
 * Tipos suportados:
 *   1. CPR Financeira (Lei 8.929/94) — devedor paga em dinheiro na data de
 *      vencimento, garantido por safra futura.
 *   2. CPR Física — devedor entrega produto físico (sacas, arrobas, etc).
 *   3. Confissão de Dívida com Novação (arts. 360-367 CC).
 *   4. Termo de Renegociação Bancária — reestruturação de contrato de crédito.
 *   5. Acordo Extrajudicial — composição de litígio em curso.
 *   6. Transação Excepcional — modalidade BB/Desenrola Rural.
 *
 * Cada template é:
 *   - Fundamentado em lei/normativa específica
 *   - Juridicamente completo (qualificação, cláusulas, foro, assinaturas)
 *   - Auto-preenchido a partir dos dados estruturados
 *   - Pronto pra assinatura (após revisão do consultor)
 *
 * NÃO substitui revisão jurídica. Todo contrato gerado deve passar
 * por advogado antes da assinatura.
 */

export type TipoContrato =
  | 'cpr_financeira'
  | 'cpr_fisica'
  | 'confissao_divida'
  | 'termo_renegociacao'
  | 'acordo_extrajudicial'
  | 'transacao_excepcional'
  | 'prestacao_servicos_aletis'

export interface DadosParte {
  nomeCompleto: string
  cpfCnpj: string
  rgOuIe?: string
  estadoCivil?: string
  profissao?: string
  enderecoCompleto: string
  cidade: string
  uf: string
  cep?: string
  email?: string
  telefone?: string
  representanteLegal?: {
    nome: string
    cpf: string
    cargo: string
  }
}

export interface DadosImovelRural {
  denominacao: string
  matricula: string
  cartorio: string
  areaTotalHa: number
  municipio: string
  uf: string
  nirfCar?: string
  ccir?: string
  itr?: string
}

export interface ItemDacao {
  descricao: string
  valor: number
  matricula?: string
  localizacao?: string
}

export interface ParcelaPagamento {
  numero: number
  valor: number
  vencimento: string // ISO date
  formaPagamento?: 'boleto' | 'ted' | 'pix' | 'dinheiro' | 'produto_fisico'
}

export interface GarantiaCedula {
  tipo: 'penhor_agricola' | 'hipoteca' | 'alienacao_fiduciaria' | 'aval' | 'fianca' | 'cpr_fisica'
  descricao: string
  valorAvaliado?: number
}

/**
 * Dados específicos do contrato de Prestação de Serviços ALETIS → Cliente.
 * Formaliza a contratação da consultoria de estruturação financeira (OBRIGAÇÃO
 * DE MEIO) após o fechamento comercial.
 *
 * Observação: no `DadosContrato`, o campo `devedor` representa o CONTRATANTE
 * (cliente que contrata e paga os honorários) e o campo `credor` representa
 * a CONTRATADA (ALETIS). A nomenclatura é mantida por compatibilidade com os
 * demais templates — a renderização aplica rótulos apropriados.
 */
export interface DadosPrestacaoServicos {
  /** Módulos de serviço contratados. Controla quais seções entram no escopo. */
  escopo: {
    diagnosticoFinanceiro: boolean
    memoriaCalculoAuditavel: boolean
    deteccaoAbusividadeEAnatocismo: boolean
    deteccaoDescaracterizacaoCreditoRural: boolean
    projecaoFluxoCaixaEStressTest: boolean
    propostaEstruturadaReestruturacao: boolean
    negociacaoCredoresMulti: boolean
    estruturacaoGarantiasDacao: boolean
    minutasContratuais: boolean // CPR, Confissão, Renegociação, Acordo
    suportePericialRevisional: boolean // apoio ao advogado do cliente
    acompanhamentoExecucao: boolean
  }

  /** Modelo de honorários da operação. */
  modeloHonorarios:
    | 'fixo' // valor único
    | 'mensal' // retainer mensal
    | 'exito' // só % sobre economia
    | 'hibrido_fixo_exito' // entrada + % êxito
    | 'hibrido_mensal_exito' // mensalidade + % êxito

  /** Honorário fixo (para modelos 'fixo' e 'hibrido_fixo_exito'). */
  honorarioFixo?: number

  /** Mensalidade (para modelos 'mensal' e 'hibrido_mensal_exito'). */
  mensalidade?: number

  /** Nº de mensalidades contratadas. */
  mesesRetainer?: number

  /** % sobre economia/redução (para modelos 'exito' e 'hibrido_*'). Ex: 20 = 20%. */
  percentualExito?: number

  /** Base de cálculo do êxito. */
  baseCalculoExito?:
    | 'economia_total' // (valor original − valor final) em todos credores
    | 'reducao_saldo' // redução contratada vs saldo atualizado
    | 'valor_renegociado' // % sobre o valor total renegociado

  /**
   * Piso e teto de honorários de êxito (proteção do cliente).
   * Ex: piso R$ 5.000, teto R$ 500.000.
   */
  pisoExito?: number
  tetoExito?: number

  /** Prazo total contratado (em meses). */
  prazoVigenciaMeses: number

  /** Dados da operação-base do cliente (resumo do caso). */
  operacao?: {
    saldoDevedorAtualizado: number
    numeroCredores?: number
    credoresListados?: string[] // "Sicoob Credisul, BB, Fertiflora"
    descricaoSituacao?: string // 1-2 linhas resumindo o caso
  }

  /** Entrega de honorário de êxito: à vista, em parcelas ou pró-rata. */
  condicaoPagamentoExito?: 'a_vista_liquidacao' | 'pro_rata_parcelas_credor' | 'parcelado_ate_180d'

  /**
   * Aplica CDC (Lei 8.078/90)? Só quando CONTRATANTE é pessoa física
   * destinatária final dos serviços. Pessoa jurídica produtora rural
   * geralmente NÃO se enquadra como consumidor.
   */
  aplicaCdc?: boolean

  /** Aplica proteção superendividado (Lei 14.181/21)? Só para PF consumidor. */
  aplicaSuperendividamento?: boolean

  /** Contato operacional da ALETIS. */
  contatoAletis?: {
    consultorResponsavel: string // "Christian Kohler"
    email: string
    telefone?: string
  }

  /** Assinatura eletrônica via ICP-Brasil ou plataforma (DocuSign, Clicksign, D4Sign, Gov.br). */
  plataformaAssinaturaEletronica?: string

  /** Cláusula de arbitragem? Se sim, câmara indicada. Caso contrário, só foro judicial. */
  arbitragem?: {
    adotar: boolean
    camara?: string // "CAM-CCBC", "CAMARB", "CBMA"
    idioma?: string // "português"
    sede?: string
    tipo?: 'ad_hoc' | 'institucional'
  }
}

/**
 * Entrada comum para geração de contrato.
 */
export interface DadosContrato {
  tipo: TipoContrato
  devedor: DadosParte
  credor: DadosParte

  // CPR-específicos
  cpr?: {
    produto?: string // para CPR física: "SOJA EM GRÃOS, tipo exportação"
    quantidade?: number
    unidade?: string // 'sacas de 60kg', '@', 'toneladas'
    localEntrega?: string
    precoUnitario?: number // para CPR financeira
    valorTotal?: number
    dataVencimento?: string
    imovel?: DadosImovelRural
    safra?: string // "2025/26"
  }

  // Dívida / Renegociação-específicos
  divida?: {
    valorOriginal?: number
    valorAtualizado: number
    contratosOriginais?: Array<{ numero: string; dataAssinatura: string; valor: number }>
    fundamento?: string // "CCB n. XXX firmada em..."
  }

  // Parcelamento / Pagamento
  parcelas?: ParcelaPagamento[]
  dacoes?: ItemDacao[]

  // Garantias extras
  garantias?: GarantiaCedula[]

  // Prestação de Serviços ALETIS — específico
  servicos?: DadosPrestacaoServicos

  // Metadata
  local: string
  uf: string
  dataAssinatura?: string
  testemunhas?: Array<{ nome: string; cpf: string }>
  foro?: string
  observacoes?: string
}

export interface ContratoGerado {
  id: string
  tipo: TipoContrato
  titulo: string
  dataGeracao: string
  dataVencimentoOrVigencia?: string
  partes: { devedor: string; credor: string }
  valorTotal: number
  conteudoMarkdown: string
  metadados: {
    clausulas: number
    fundamentoLegal: string[]
    necessarioRevisao: string[]
  }
}

/* ========================================================================
 *  Helpers
 * ======================================================================== */

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (iso?: string): string => {
  if (!iso) return '___/___/______'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const fmtDateExtenso = (iso?: string): string => {
  if (!iso) return '____ de _________ de ______'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ]
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

const numeroExtenso = (v: number): string => {
  if (!isFinite(v)) return ''
  const reais = Math.floor(v)
  const centavos = Math.round((v - reais) * 100)
  const rS = reais.toLocaleString('pt-BR')
  if (centavos === 0) return `R$ ${rS} (${rS} reais)`
  return `R$ ${v.toFixed(2).replace('.', ',')} (${rS} reais e ${centavos.toString().padStart(2, '0')} centavos)`
}

const qualificaParte = (p: DadosParte, papel: string): string => {
  const isCnpj = p.cpfCnpj.replace(/\D/g, '').length === 14
  const tipo = isCnpj ? 'pessoa jurídica de direito privado' : 'pessoa física'
  const docLabel = isCnpj ? 'CNPJ' : 'CPF'

  const partes: string[] = []
  partes.push(`**${papel}:** ${p.nomeCompleto}`)
  partes.push(`${tipo}, inscrito(a) no ${docLabel} sob n. ${p.cpfCnpj}`)
  if (p.rgOuIe) partes.push(isCnpj ? `Inscrição Estadual n. ${p.rgOuIe}` : `portador(a) do RG n. ${p.rgOuIe}`)
  if (!isCnpj && p.estadoCivil) partes.push(p.estadoCivil)
  if (!isCnpj && p.profissao) partes.push(p.profissao)
  partes.push(`com endereço em ${p.enderecoCompleto}, ${p.cidade}-${p.uf}${p.cep ? `, CEP ${p.cep}` : ''}`)
  if (p.email) partes.push(`e-mail: ${p.email}`)
  if (p.representanteLegal) {
    partes.push(
      `neste ato representado(a) por ${p.representanteLegal.nome}, ${p.representanteLegal.cargo}, inscrito no CPF n. ${p.representanteLegal.cpf}`
    )
  }
  return partes.join(', ') + '.'
}

const rodapeAssinaturas = (d: DadosContrato): string => {
  const localData = `${d.local}, ${fmtDateExtenso(d.dataAssinatura ?? new Date().toISOString())}`

  const testemunhas = (d.testemunhas ?? []).slice(0, 2)
  while (testemunhas.length < 2) testemunhas.push({ nome: '', cpf: '' })

  return `
${localData}.

---

**${d.devedor.nomeCompleto}**
Devedor(a) — ${d.devedor.cpfCnpj.replace(/\D/g, '').length === 14 ? 'CNPJ' : 'CPF'}: ${d.devedor.cpfCnpj}

---

**${d.credor.nomeCompleto}**
Credor(a) — ${d.credor.cpfCnpj.replace(/\D/g, '').length === 14 ? 'CNPJ' : 'CPF'}: ${d.credor.cpfCnpj}

---

**Testemunhas:**

1. Nome: ${testemunhas[0].nome || '________________________________'}  CPF: ${testemunhas[0].cpf || '___.___.___-__'}

2. Nome: ${testemunhas[1].nome || '________________________________'}  CPF: ${testemunhas[1].cpf || '___.___.___-__'}
`.trim()
}

/* ========================================================================
 *  TEMPLATES
 * ======================================================================== */

function gerarCPRFinanceira(d: DadosContrato): string {
  const cpr = d.cpr ?? {}
  const valor = cpr.valorTotal ?? 0
  const qt = cpr.quantidade ?? 0
  const preco = cpr.precoUnitario ?? (qt > 0 ? valor / qt : 0)

  return `# CÉDULA DE PRODUTO RURAL FINANCEIRA — CPR-F

**Número:** ${d.tipo.toUpperCase()}-${new Date().getTime().toString().slice(-8)}
**Safra:** ${cpr.safra ?? '_____/_____'}
**Local:** ${d.local}, ${d.uf}
**Data:** ${fmtDateExtenso(d.dataAssinatura)}

---

## I — Identificação das Partes

${qualificaParte(d.devedor, 'EMITENTE (Devedor)')}

${qualificaParte(d.credor, 'CREDOR (Beneficiário)')}

---

## II — Objeto e Fundamentação Legal

A presente **Cédula de Produto Rural Financeira (CPR-F)**, emitida nos termos da **Lei n. 8.929/94**, com as alterações das Leis n. 10.200/01 e n. 11.076/04, representa promessa líquida, certa e exigível de pagamento em dinheiro pelo EMITENTE em favor do CREDOR, vinculada à produção rural da safra ${cpr.safra ?? '_____/_____'} do imóvel abaixo identificado.

## III — Produto Vinculado

- **Produto:** ${cpr.produto ?? '_________________________'}
- **Quantidade vinculada:** ${qt.toLocaleString('pt-BR')} ${cpr.unidade ?? 'unidades'}
- **Preço unitário de referência:** ${fmtBRL(preco)} / ${cpr.unidade ?? 'unidade'}
- **Valor total da CPR:** ${numeroExtenso(valor)}

## IV — Imóvel Rural Vinculado

${cpr.imovel ? `
- **Denominação:** ${cpr.imovel.denominacao}
- **Matrícula:** n. ${cpr.imovel.matricula}
- **Cartório:** ${cpr.imovel.cartorio}
- **Área total:** ${cpr.imovel.areaTotalHa.toLocaleString('pt-BR')} hectares
- **Município:** ${cpr.imovel.municipio}-${cpr.imovel.uf}
${cpr.imovel.nirfCar ? `- **CAR/NIRF:** ${cpr.imovel.nirfCar}\n` : ''}${cpr.imovel.ccir ? `- **CCIR:** ${cpr.imovel.ccir}\n` : ''}` : '_A ser preenchido conforme certidão atualizada do imóvel rural vinculado._'}

## V — Vencimento e Forma de Pagamento

O EMITENTE se obriga a pagar ao CREDOR, em moeda corrente nacional, o valor total de ${fmtBRL(valor)} até o dia **${fmtDate(cpr.dataVencimento)}**, por meio de TED/PIX em conta indicada pelo CREDOR.

${d.parcelas && d.parcelas.length > 1 ? `
**Parcelamento acordado:**

${d.parcelas.map((p) => `- Parcela ${p.numero}/${d.parcelas!.length}: ${fmtBRL(p.valor)} — Vencimento ${fmtDate(p.vencimento)}`).join('\n')}
` : ''}

## VI — Garantias

${d.garantias && d.garantias.length > 0 ? d.garantias.map((g, i) => `**${i + 1}.** ${g.tipo.replace(/_/g, ' ').toUpperCase()}: ${g.descricao}${g.valorAvaliado ? ` — valor avaliado: ${fmtBRL(g.valorAvaliado)}` : ''}`).join('\n\n') : `**Penhor Agrícola** sobre a safra vinculada, nos termos do art. 1.442 do Código Civil e da Lei 8.929/94.`}

## VII — Hipóteses de Vencimento Antecipado

Consideram-se **antecipadamente vencidas** as obrigações desta CPR, com cobrança imediata, nos casos de:
a) inadimplência de qualquer parcela (quando parcelada);
b) protesto contra o EMITENTE;
c) instauração de processo de insolvência ou recuperação judicial;
d) desvio do produto vinculado ou alienação do imóvel sem anuência do CREDOR;
e) constatação de plantio em área inferior à informada;
f) sinistro não comunicado ao CREDOR em 48h.

## VIII — Encargos em Caso de Inadimplemento

Havendo inadimplemento, incidirão sobre o valor em atraso:
- **Juros moratórios:** 1% (um por cento) ao mês;
- **Multa:** 2% (dois por cento) sobre o valor devido;
- **Correção monetária:** pelo IPCA/IBGE;
- **Honorários advocatícios:** 10% em caso de cobrança judicial;
- **Despesas** de cobrança e execução.

## IX — Registro Cartorial

Esta CPR será registrada no **Cartório de Registro de Imóveis** da comarca de ${d.local} para eficácia de penhor agrícola e oponibilidade a terceiros, nos termos do art. 12 da Lei 8.929/94.

## X — Foro

Fica eleito o **Foro da Comarca de ${d.foro ?? d.local}-${d.uf}** para dirimir controvérsias, renunciando as partes a qualquer outro, por mais privilegiado que seja.

${d.observacoes ? `\n## XI — Disposições Gerais\n\n${d.observacoes}\n` : ''}

---

${rodapeAssinaturas(d)}
`
}

function gerarCPRFisica(d: DadosContrato): string {
  const cpr = d.cpr ?? {}

  return `# CÉDULA DE PRODUTO RURAL FÍSICA — CPR

**Número:** CPR-F${new Date().getTime().toString().slice(-8)}
**Safra:** ${cpr.safra ?? '_____/_____'}
**Local:** ${d.local}, ${d.uf}
**Data:** ${fmtDateExtenso(d.dataAssinatura)}

---

## I — Identificação das Partes

${qualificaParte(d.devedor, 'EMITENTE (Produtor Rural)')}

${qualificaParte(d.credor, 'CREDOR (Adquirente)')}

---

## II — Objeto e Fundamentação Legal

A presente **Cédula de Produto Rural (CPR Física)**, emitida nos termos da **Lei n. 8.929/94**, representa promessa líquida, certa e exigível de **entrega de produto rural** pelo EMITENTE ao CREDOR, vinculada à produção da safra ${cpr.safra ?? '_____/_____'}.

## III — Produto, Quantidade e Qualidade

- **Produto:** ${cpr.produto ?? '_________________________'}
- **Quantidade:** ${(cpr.quantidade ?? 0).toLocaleString('pt-BR')} ${cpr.unidade ?? 'unidades'}
- **Padrão de qualidade:** conforme especificações do MAPA/Instrução Normativa aplicável ao produto. Rejeita-se produto ardido >8%, avariado >8% (padrão CEPEA/soja exportação).
- **Local de entrega:** ${cpr.localEntrega ?? 'a combinar'}

## IV — Data de Entrega

A entrega do produto deverá ocorrer até **${fmtDate(cpr.dataVencimento)}**, em quantidade e qualidade pactuadas.

## V — Imóvel Rural Vinculado

${cpr.imovel ? `- **Denominação:** ${cpr.imovel.denominacao}
- **Matrícula:** ${cpr.imovel.matricula} / ${cpr.imovel.cartorio}
- **Área:** ${cpr.imovel.areaTotalHa.toLocaleString('pt-BR')} ha em ${cpr.imovel.municipio}-${cpr.imovel.uf}` : '_A ser preenchido._'}

## VI — Preço Recebido / Valor da Operação

Valor total da operação: ${numeroExtenso(cpr.valorTotal ?? 0)}, pago ${d.parcelas && d.parcelas.length ? 'conforme parcelamento abaixo' : 'integralmente neste ato'}.

${d.parcelas && d.parcelas.length > 0 ? `
**Parcelas:**
${d.parcelas.map((p) => `- ${p.numero}/${d.parcelas!.length} — ${fmtBRL(p.valor)} em ${fmtDate(p.vencimento)}`).join('\n')}
` : ''}

## VII — Obrigações do Emitente

O EMITENTE obriga-se a:
a) plantar, cultivar e entregar o produto na quantidade e qualidade pactuadas;
b) não alienar, onerar ou desviar o produto vinculado;
c) comunicar sinistro agronômico em até 48h;
d) permitir inspeção técnica do CREDOR na propriedade durante todo o ciclo;
e) contratar **seguro agrícola / Proagro** (quando aplicável) sobre a safra vinculada.

## VIII — Obrigações do Credor

O CREDOR obriga-se a receber o produto na data e local pactuados e a pagar o preço acordado.

## IX — Hipóteses de Rescisão

Configuram-se justa causa para rescisão:
a) frustração total da safra por caso fortuito/força maior;
b) inadimplemento de obrigação pelo EMITENTE;
c) descumprimento do padrão de qualidade.

Em caso de rescisão por culpa do EMITENTE, o valor recebido deverá ser devolvido com atualização monetária + 20% de multa.

## X — Garantias

${d.garantias && d.garantias.length > 0 ? d.garantias.map((g, i) => `${i + 1}. ${g.tipo.replace(/_/g, ' ').toUpperCase()}: ${g.descricao}`).join('\n\n') : '**Penhor Agrícola** sobre a safra vinculada, nos termos do art. 1.442 do CC.'}

## XI — Foro

Foro da comarca de **${d.foro ?? d.local}-${d.uf}**.

${d.observacoes ? `\n## XII — Disposições Gerais\n\n${d.observacoes}\n` : ''}

---

${rodapeAssinaturas(d)}
`
}

function gerarConfissaoDivida(d: DadosContrato): string {
  const divida = d.divida ?? { valorAtualizado: 0 }
  const parcelas = d.parcelas ?? []
  const totalParcelas = parcelas.reduce((acc, p) => acc + p.valor, 0)

  return `# INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA COM NOVAÇÃO E PARCELAMENTO

**Local:** ${d.local}, ${d.uf}
**Data:** ${fmtDateExtenso(d.dataAssinatura)}

---

## I — Partes

${qualificaParte(d.devedor, 'DEVEDOR CONFITENTE')}

${qualificaParte(d.credor, 'CREDOR')}

---

## II — Fundamentação Legal

O presente instrumento é celebrado com base nos **artigos 360 a 367 do Código Civil** (novação de obrigações), **art. 389 do CC** (inadimplemento), e nos precedentes do STJ relativos à novação de dívidas rurais (**Súmula 474/STJ** — capitalização; **Súmula 296/STJ** — CET; **Resolução CMN 4.966/2021** — provisionamento).

## III — Reconhecimento da Dívida

O DEVEDOR reconhece dever ao CREDOR a importância certa, líquida e exigível de ${numeroExtenso(divida.valorAtualizado)}, já devidamente atualizada até a presente data, decorrente dos seguintes títulos/operações:

${divida.contratosOriginais && divida.contratosOriginais.length > 0
  ? divida.contratosOriginais.map((c) => `- **Contrato/título n. ${c.numero}** — firmado em ${fmtDate(c.dataAssinatura)} — valor original: ${fmtBRL(c.valor)}`).join('\n')
  : divida.fundamento ?? '_Contratos/títulos a identificar._'}

${divida.valorOriginal && divida.valorOriginal !== divida.valorAtualizado ? `\n**Valor originalmente contratado:** ${fmtBRL(divida.valorOriginal)}\n**Valor atualizado até ${fmtDate(d.dataAssinatura)}:** ${fmtBRL(divida.valorAtualizado)}` : ''}

## IV — Novação

As partes **novam** as obrigações anteriores, que se extinguem com a assinatura deste instrumento, sendo substituídas pela obrigação ora constituída, nos termos do art. 360, I, do CC.

O CREDOR declara que **nada mais terá a reclamar** do DEVEDOR a título dos contratos/títulos acima identificados, após a integral quitação conforme abaixo.

## V — Forma de Pagamento e Parcelamento

O DEVEDOR pagará o valor reconhecido em ${parcelas.length} parcela(s), conforme cronograma:

${parcelas.length > 0
  ? parcelas.map((p) => `- **Parcela ${p.numero}/${parcelas.length}:** ${fmtBRL(p.valor)} — Vencimento **${fmtDate(p.vencimento)}** ${p.formaPagamento ? `(${p.formaPagamento.toUpperCase()})` : ''}`).join('\n')
  : '_Parcelamento a ser definido._'}

${totalParcelas > 0 ? `\n**Soma das parcelas:** ${fmtBRL(totalParcelas)}` : ''}

## VI — Encargos e Atualização Monetária

As parcelas serão corrigidas monetariamente pelo **IPCA/IBGE** do período. Não há incidência de juros remuneratórios sobre o principal novado.

## VII — Inadimplemento

O atraso de **qualquer parcela por mais de 30 (trinta) dias** acarreta vencimento antecipado integral da dívida, com incidência de:
- **Juros moratórios:** 1% (um por cento) ao mês;
- **Multa:** 2% (dois por cento) sobre o saldo devedor;
- **Honorários advocatícios:** 10% em caso de cobrança judicial.

## VIII — Dação em Pagamento (se aplicável)

${d.dacoes && d.dacoes.length > 0 ? `
Compõem ainda o pagamento, a título de **dação em pagamento** (arts. 356 a 359 do CC):

${d.dacoes.map((dc, i) => `${i + 1}. ${dc.descricao}${dc.matricula ? ` (matrícula ${dc.matricula})` : ''}${dc.localizacao ? ` — ${dc.localizacao}` : ''} — avaliado em ${fmtBRL(dc.valor)}`).join('\n\n')}
` : '_Não há dação em pagamento neste instrumento._'}

## IX — Garantias

${d.garantias && d.garantias.length > 0 ? d.garantias.map((g) => `- **${g.tipo.replace(/_/g, ' ').toUpperCase()}:** ${g.descricao}${g.valorAvaliado ? ` — ${fmtBRL(g.valorAvaliado)}` : ''}`).join('\n') : '_Nenhuma garantia adicional além daquelas já existentes nos contratos originais._'}

## X — Quitação

Após o pagamento integral da última parcela, o CREDOR fornecerá ao DEVEDOR **termo de quitação plena e irrevogável**, bem como procederá à **baixa de eventuais restritivos** (SPC, Serasa, cartórios de protesto) no prazo de **30 (trinta) dias**.

## XI — Foro

Fica eleito o foro da comarca de **${d.foro ?? d.local}-${d.uf}**.

${d.observacoes ? `\n## XII — Disposições Finais\n\n${d.observacoes}\n` : ''}

---

${rodapeAssinaturas(d)}
`
}

function gerarTermoRenegociacao(d: DadosContrato): string {
  const divida = d.divida ?? { valorAtualizado: 0 }
  const parcelas = d.parcelas ?? []

  return `# TERMO DE RENEGOCIAÇÃO DE OPERAÇÃO DE CRÉDITO RURAL

**Local:** ${d.local}, ${d.uf}
**Data:** ${fmtDateExtenso(d.dataAssinatura)}

---

## I — Partes

${qualificaParte(d.credor, 'BANCO CREDOR / INSTITUIÇÃO FINANCEIRA')}

${qualificaParte(d.devedor, 'MUTUÁRIO / PRODUTOR RURAL')}

---

## II — Fundamentação Regulatória

O presente termo é celebrado com base nas seguintes normas:

- **Manual de Crédito Rural (MCR)**, Capítulos 2 e 3, no que couber;
- **Resolução CMN n. 4.966/2021** — provisionamento e classificação;
- **Lei n. 13.340/2016** e suas alterações (alongamentos, Lei Rural);
- **Súmula 322/STJ** (para mútuo rural);
- **Súmula 298/STJ** (alongamento de dívidas rurais);
- **Plano Safra 2025/26** (Resolução CMN específica);
- Políticas internas da instituição credora.

## III — Operação Originária

O DEVEDOR é titular da(s) operação(ões) de crédito rural abaixo, contratada(s) junto ao CREDOR:

${divida.contratosOriginais && divida.contratosOriginais.length > 0
  ? divida.contratosOriginais.map((c) => `- **Operação n. ${c.numero}** — assinada em ${fmtDate(c.dataAssinatura)} — valor contratado: ${fmtBRL(c.valor)}`).join('\n')
  : '_Operação a identificar._'}

**Saldo devedor atualizado em ${fmtDate(d.dataAssinatura)}:** ${numeroExtenso(divida.valorAtualizado)}

## IV — Justificativa da Renegociação

${d.observacoes ?? `O DEVEDOR declara, sob as penas da lei, encontrar-se em situação que compromete o fiel cumprimento das obrigações originárias, justificando a presente repactuação — seja em razão de adversidades climáticas, oscilação de preços de commodities, elevação de custos de insumos ou outros eventos externos à sua gestão.`}

## V — Nova Estrutura da Operação

5.1. **Saldo devedor consolidado:** ${fmtBRL(divida.valorAtualizado)}
5.2. **Forma de liquidação:** parcelamento conforme cronograma abaixo
5.3. **Prazo total:** ${parcelas.length > 0 ? `${parcelas.length} parcelas` : 'a ser definido'}
5.4. **Taxa de juros remuneratórios pactuada:** ___% ao ano (tabela Plano Safra vigente ou taxa de mercado)
5.5. **Correção monetária:** conforme índice setorial pactuado
5.6. **Carência:** ${parcelas[0]?.vencimento ? `até ${fmtDate(parcelas[0].vencimento)}` : 'a definir'}

## VI — Cronograma de Pagamentos

${parcelas.length > 0
  ? parcelas.map((p) => `- **Parcela ${p.numero}/${parcelas.length}:** ${fmtBRL(p.valor)} — Vencimento ${fmtDate(p.vencimento)}`).join('\n')
  : '_A ser detalhado em anexo._'}

## VII — Alinhamento ao Fluxo de Safra

As parcelas foram dimensionadas e datadas de forma a serem **compatíveis com o fluxo de caixa da atividade rural** do DEVEDOR (cronograma de comercialização da safra vinculada), em atendimento ao princípio do **adimplemento substancial** e à **Súmula 298/STJ** (alongamento rural).

## VIII — Garantias

${d.garantias && d.garantias.length > 0 ? d.garantias.map((g) => `- ${g.tipo.replace(/_/g, ' ').toUpperCase()}: ${g.descricao}`).join('\n') : '_Preservam-se as garantias existentes nas operações originárias._'}

## IX — Obrigações do Devedor

9.1. Manter **CAR ativo** durante toda a vigência desta operação.
9.2. Comunicar em 48h qualquer sinistro que afete a safra vinculada.
9.3. Permitir inspeção técnica pelo CREDOR.
9.4. Apresentar **Plano de Fluxo de Caixa** da safra ${d.cpr?.safra ?? '_____'} quando solicitado.
9.5. Manter regularidade fiscal (Receita Federal, FGTS, Cadin).

## X — Vencimento Antecipado

Ocorrendo qualquer dos eventos abaixo, o saldo devedor será declarado antecipadamente vencido:

a) atraso de qualquer parcela por período superior a **60 (sessenta) dias**;
b) inscrição do DEVEDOR em cadastros restritivos (excetuadas discussões judiciais);
c) alienação de garantias sem anuência prévia do CREDOR;
d) informação inverídica fornecida para a celebração deste termo;
e) protesto/execução por terceiro de valor relevante (>10% do saldo).

## XI — Encargos de Mora

Em caso de inadimplemento, incidem: juros moratórios de **1% ao mês**, multa de **2%**, correção monetária pelo IPCA e honorários advocatícios de **10%** em cobrança judicial, nos limites do **CDC** quando aplicável e dos **arts. 389 e 406 do CC**.

## XII — Foro

Foro eleito: comarca de **${d.foro ?? d.local}-${d.uf}**.

${d.observacoes ? `\n## XIII — Disposições Finais\n\n${d.observacoes}\n` : ''}

---

${rodapeAssinaturas(d)}
`
}

function gerarAcordoExtrajudicial(d: DadosContrato): string {
  const divida = d.divida ?? { valorAtualizado: 0 }

  return `# ACORDO EXTRAJUDICIAL DE COMPOSIÇÃO DE LITÍGIO

**Local:** ${d.local}, ${d.uf}
**Data:** ${fmtDateExtenso(d.dataAssinatura)}

---

## I — Partes

${qualificaParte(d.devedor, 'DEVEDOR')}

${qualificaParte(d.credor, 'CREDOR')}

---

## II — Fundamentação

Celebram este acordo nos termos dos **arts. 840 e 841 do Código Civil** (transação extrajudicial), com finalidade de **prevenir litígio ou pôr fim a demanda em curso**, extinguindo reciprocamente as pretensões controvertidas.

## III — Dos Fatos Controvertidos

${d.observacoes ?? `As partes mantêm controvérsia em torno da operação identificada em "IV — Objeto", cuja discussão — seja em fase judicial, pré-judicial ou de protesto — gera insegurança e custo para ambas, justificando a presente composição.`}

## IV — Objeto da Controvérsia

${divida.contratosOriginais && divida.contratosOriginais.length > 0
  ? divida.contratosOriginais.map((c) => `- **Operação n. ${c.numero}**, assinada em ${fmtDate(c.dataAssinatura)} — valor: ${fmtBRL(c.valor)}`).join('\n')
  : divida.fundamento ?? '_Contrato(s) a identificar._'}

**Valor consolidado objeto da transação:** ${numeroExtenso(divida.valorAtualizado)}

## V — Composição

As partes, fazendo-se **concessões recíprocas** (art. 840 CC), convencionam:

**5.1.** Do lado do DEVEDOR:
- reconhece a dívida no valor ajustado neste instrumento;
- compromete-se ao pagamento conforme cronograma;
- desiste expressamente de quaisquer ações/recursos/pretensões relativas ao objeto.

**5.2.** Do lado do CREDOR:
- aceita o valor transacionado como quitação integral;
- compromete-se a retirar qualquer protesto, ação ou restrição;
- renuncia a juros, multas e demais acréscimos que excedam o valor ajustado.

## VI — Pagamento

${d.parcelas && d.parcelas.length > 0
  ? `Pagamento em ${d.parcelas.length} parcelas:\n\n${d.parcelas.map((p) => `- Parcela ${p.numero}: ${fmtBRL(p.valor)} em ${fmtDate(p.vencimento)}`).join('\n')}`
  : `Pagamento à vista no valor de ${fmtBRL(divida.valorAtualizado)}.`}

${d.dacoes && d.dacoes.length > 0 ? `\n**Dação em pagamento adicional (arts. 356-359 CC):**\n\n${d.dacoes.map((dc) => `- ${dc.descricao}: ${fmtBRL(dc.valor)}`).join('\n')}` : ''}

## VII — Efeitos da Quitação

Cumprido o pagamento, o presente acordo:
a) extingue **integralmente** a obrigação objeto da controvérsia;
b) autoriza o arquivamento/extinção de ações judiciais em curso;
c) determina **baixa de protestos** e restritivos em 30 dias;
d) tem eficácia de **título executivo extrajudicial** (art. 784, III, CPC), em caso de descumprimento.

## VIII — Inadimplemento

O descumprimento de qualquer parcela acarreta:
- vencimento antecipado integral;
- **execução direta** desta transação como título executivo;
- incidência de multa de **20%** sobre o saldo;
- honorários advocatícios de **15%**.

## IX — Confidencialidade

Os termos deste acordo são **confidenciais**, salvo necessidade de apresentação em juízo ou exigência legal.

## X — Foro

Foro eleito: **${d.foro ?? d.local}-${d.uf}**.

---

${rodapeAssinaturas(d)}
`
}

function gerarTransacaoExcepcional(d: DadosContrato): string {
  const divida = d.divida ?? { valorAtualizado: 0 }
  const descontoAplicavel = divida.valorOriginal && divida.valorOriginal > divida.valorAtualizado
    ? ((divida.valorOriginal - divida.valorAtualizado) / divida.valorOriginal) * 100
    : null

  return `# TERMO DE TRANSAÇÃO EXCEPCIONAL — CRÉDITO RURAL

**Modalidade:** Transação por adesão (modalidade excepcional rural)
**Local:** ${d.local}, ${d.uf}
**Data:** ${fmtDateExtenso(d.dataAssinatura)}

---

## I — Partes

${qualificaParte(d.credor, 'INSTITUIÇÃO FINANCEIRA CREDORA')}

${qualificaParte(d.devedor, 'PRODUTOR RURAL DEVEDOR')}

---

## II — Fundamentação

- **Lei n. 14.375/2022** — transação tributária e extensões a operações oficiais;
- **Resolução CMN / Instruções específicas** da instituição credora (programas de recuperação de crédito rural — "Desenrola Rural", refinanciamentos estruturados);
- **MCR 2** — refinanciamentos;
- **Súmula 298/STJ** — alongamento;
- Discricionariedade administrativa da instituição, fundamentada em **análise de capacidade de pagamento** e **classificação de risco** do DEVEDOR (Res. 4.966/21).

## III — Qualificação do Caso

**Situação do DEVEDOR:** inadimplente há ____ dias, classificação de risco: ___.

**Evento adverso alegado:** ${d.observacoes ?? '_Seca / Quebra de safra / Oscilação cambial / Volatilidade de preços._'}

## IV — Saldo Devedor

- **Valor original contratado:** ${fmtBRL(divida.valorOriginal ?? divida.valorAtualizado)}
- **Valor atualizado na data de adesão:** ${fmtBRL(divida.valorAtualizado)}
- **Valor transacionado (consolidado para pagamento):** ${fmtBRL(divida.valorAtualizado)}

${descontoAplicavel ? `\n**Desconto concedido pela instituição:** ${descontoAplicavel.toFixed(1)}% (${fmtBRL((divida.valorOriginal ?? 0) - divida.valorAtualizado)}) — aplicado sobre juros/encargos acessórios, preservado o principal.\n` : ''}

## V — Condições da Transação

**5.1. Entrada:** ${d.parcelas?.[0] ? fmtBRL(d.parcelas[0].valor) + ' no ato da adesão' : 'A definir'}
**5.2. Parcelas restantes:** ${d.parcelas && d.parcelas.length > 1 ? `${d.parcelas.length - 1} parcelas` : 'A definir'}
**5.3. Encargos pactuados:** atualização pelo IPCA + juros de ___ % a.a. (conforme política vigente)
**5.4. Prazo total:** ${d.parcelas && d.parcelas.length > 0 ? `${d.parcelas.length} meses` : 'A definir'}

## VI — Cronograma

${d.parcelas && d.parcelas.length > 0
  ? d.parcelas.map((p) => `- ${p.numero === 1 ? '**Entrada**' : `Parcela ${p.numero}/${d.parcelas!.length}`}: ${fmtBRL(p.valor)} em ${fmtDate(p.vencimento)}`).join('\n')
  : '_A ser detalhado em anexo._'}

## VII — Declarações do Devedor

O DEVEDOR, ao aderir a esta transação:
a) **confessa** a dívida nos exatos valores pactuados;
b) **renuncia** a qualquer ação, exceção ou defesa relativa ao objeto transacionado;
c) autoriza a **consolidação** de eventuais contratos múltiplos em operação única;
d) **não terá** direito a restituição em caso de posterior anulação dos atos anteriores;
e) declara conhecer e **concordar expressamente** com todos os termos desta modalidade excepcional.

## VIII — Hipóteses de Rescisão

Configura **rescisão automática** da transação:
a) **inadimplência de 3 parcelas consecutivas** ou 6 alternadas;
b) **alienação de garantia** sem anuência;
c) **violação** de declaração prestada;
d) **falência ou recuperação judicial** do DEVEDOR.

**Efeitos da rescisão:** retorno integral das condições originárias do contrato, com restabelecimento de juros, encargos e multas anteriores à transação, sem restituição de valores já pagos.

## IX — Garantias

Preservam-se as garantias reais (hipoteca, alienação fiduciária, penhor) e fidejussórias (aval, fiança) das operações originárias, que **passam a garantir a operação transacionada**.

## X — Foro

Foro: **${d.foro ?? d.local}-${d.uf}**.

${d.observacoes ? `\n## XI — Disposições Finais\n\n${d.observacoes}\n` : ''}

---

${rodapeAssinaturas(d)}
`
}

/* ========================================================================
 *  TEMPLATE — Prestação de Serviços ALETIS → Cliente
 *  Obrigação de meio. Consultoria para estruturação financeira e
 *  reestruturação de dívidas.
 * ======================================================================== */

function gerarPrestacaoServicosAletis(d: DadosContrato): string {
  const s = d.servicos
  if (!s) {
    throw new Error(
      'Contrato de prestação de serviços ALETIS requer o objeto `servicos` preenchido.',
    )
  }

  const contratante = d.devedor
  const contratada = d.credor

  const aplicaCdc = Boolean(s.aplicaCdc)
  const aplicaSuper = Boolean(s.aplicaSuperendividamento)

  // Vigência
  const vigMeses = Math.max(1, s.prazoVigenciaMeses || 6)
  const dataInicio = new Date(d.dataAssinatura ?? new Date().toISOString())
  const dataFim = new Date(dataInicio)
  dataFim.setMonth(dataFim.getMonth() + vigMeses)

  // Escopo — rendering modular
  const modulos: Array<{ on: boolean; titulo: string; descricao: string }> = [
    {
      on: s.escopo.diagnosticoFinanceiro,
      titulo: 'Diagnóstico financeiro-contratual',
      descricao:
        'mapeamento integral das operações de crédito (rurais, comerciais e bancárias), cálculo do Custo Efetivo Total (CET), identificação de encargos, tarifas, seguros e tributos capitalizados, atualização de saldos devedores e elaboração de parecer técnico consolidado.',
    },
    {
      on: s.escopo.memoriaCalculoAuditavel,
      titulo: 'Memória de cálculo auditável',
      descricao:
        'reconstituição matemática período a período (juros remuneratórios, moratórios, atualização monetária, encargos e pagamentos já efetuados), entregue em planilha auditável e parecer metodológico acessível.',
    },
    {
      on: s.escopo.deteccaoAbusividadeEAnatocismo,
      titulo: 'Detecção de abusividade e anatocismo',
      descricao:
        'análise de capitalização não autorizada (Súmula 93/STJ), comissão de permanência cumulada com encargos (Súmulas 30, 294, 296, 472/STJ), cobrança de tarifas indevidas e encargos de mora abusivos, com fundamentação jurídica para contestação administrativa ou judicial.',
    },
    {
      on: s.escopo.deteccaoDescaracterizacaoCreditoRural,
      titulo: 'Detecção de descaracterização de crédito rural',
      descricao:
        'conferência de enquadramento da operação no Manual de Crédito Rural (MCR 2 e 3), verificação de migração indevida para crédito pessoal/empresarial com perda de taxa equalizada e identificação de violação ao Plano Safra vigente, com recomendação de recálculo.',
    },
    {
      on: s.escopo.projecaoFluxoCaixaEStressTest,
      titulo: 'Projeção de fluxo de caixa e stress test',
      descricao:
        'modelagem plurianual da atividade agropecuária (receita × custo × arrendamento × dívida), cenários de estresse (queda de preço, quebra de safra, oscilação cambial), cálculo de break-even e recomendação de hedge.',
    },
    {
      on: s.escopo.propostaEstruturadaReestruturacao,
      titulo: 'Proposta estruturada de reestruturação',
      descricao:
        'elaboração de proposta completa no padrão ALETIS (15 seções) contendo sumário executivo, diagnóstico, memória, análise de abusividade, fluxo, proposta estruturada, garantias, fundamentação jurídica (súmulas, MCR, precedentes, Resoluções CMN) e cronograma.',
    },
    {
      on: s.escopo.negociacaoCredoresMulti,
      titulo: 'Condução de negociação junto aos credores',
      descricao:
        'interlocução formal com credores (bancos, cooperativas, tradings, fornecedores de insumos), priorização por score de viabilidade, condução de reuniões, elaboração de contrapropostas e fechamento de acordo extrajudicial.',
    },
    {
      on: s.escopo.estruturacaoGarantiasDacao,
      titulo: 'Estruturação de garantias e dação em pagamento',
      descricao:
        'avaliação técnica de bens ofertáveis, modelagem de dação em pagamento (arts. 356-359 CC), penhor agrícola, hipoteca e alienação fiduciária, apoio à obtenção de laudos CREA e conferência de matrículas.',
    },
    {
      on: s.escopo.minutasContratuais,
      titulo: 'Elaboração de minutas contratuais',
      descricao:
        'redação de CPR-F, CPR-Física, Confissão de Dívida com Novação, Termo de Renegociação, Acordo Extrajudicial e Transação Excepcional, prontos para revisão jurídica e assinatura.',
    },
    {
      on: s.escopo.suportePericialRevisional,
      titulo: 'Suporte técnico-pericial à ação revisional',
      descricao:
        'fornecimento de memória de cálculo, parecer de abusividade e subsídios técnicos a advogado indicado pelo(a) CONTRATANTE em eventual ação revisional. A propositura e condução da ação são exclusivas do advogado contratado, nos termos do Estatuto da OAB (Lei 8.906/94).',
    },
    {
      on: s.escopo.acompanhamentoExecucao,
      titulo: 'Acompanhamento da execução do acordo',
      descricao:
        'monitoramento do cumprimento das obrigações pactuadas, conferência de boletos e pagamentos, acompanhamento de baixa de restritivos, reportes periódicos e suporte a eventuais questionamentos pós-fechamento durante a vigência deste contrato.',
    },
  ]
  const modulosAtivos = modulos.filter((m) => m.on)

  // Honorários
  const hon = renderHonorarios(s)

  // Resumo operação
  const op = s.operacao

  // Foro
  const foroPadrao = d.foro ?? `${d.local}-${d.uf}`

  // Valor base do contrato para metricas (para preencher ContratoGerado.valorTotal)
  // Usa honorário fixo + (mensalidade × meses) + estimativa de êxito (quando aplicável).

  return `# CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONSULTORIA EM ESTRUTURAÇÃO FINANCEIRA E REESTRUTURAÇÃO DE DÍVIDAS

**Instrumento particular celebrado com fundamento nos arts. 593 a 609 do Código Civil**
${aplicaCdc ? '**Aplica-se a Lei nº 8.078/1990 (CDC) no que couber**\n' : ''}
**Local:** ${d.local}, ${d.uf}
**Data de assinatura:** ${fmtDateExtenso(d.dataAssinatura ?? new Date().toISOString())}
**Número de referência:** PS-ALETIS-${Date.now().toString().slice(-8)}

---

## PREÂMBULO — DAS PARTES

${qualificaParte(contratante, 'CONTRATANTE')}

${qualificaParte(contratada, 'CONTRATADA')}

${s.contatoAletis ? `**Consultor(a) responsável:** ${s.contatoAletis.consultorResponsavel} — e-mail ${s.contatoAletis.email}${s.contatoAletis.telefone ? ` — telefone ${s.contatoAletis.telefone}` : ''}.\n` : ''}
As partes acima qualificadas, a partir deste ponto designadas individualmente como "Parte" e coletivamente como "Partes", têm entre si, por livre e espontânea vontade, justo e contratado o presente **Contrato de Prestação de Serviços de Consultoria em Estruturação Financeira e Reestruturação de Dívidas** ("Contrato"), que se regerá pelas cláusulas e condições a seguir.

---

## CONSIDERANDOS

**Considerando que:**

(i) a CONTRATADA é empresa especializada em consultoria financeira para o agronegócio, com atuação em diagnóstico contratual, detecção de abusividade, estruturação de reestruturação de dívidas, elaboração de propostas técnico-jurídicas e negociação com credores rurais, comerciais e bancários;

(ii) o(a) CONTRATANTE manifestou interesse na contratação dos serviços prestados pela CONTRATADA ${op?.descricaoSituacao ? `em razão da seguinte situação: *${op.descricaoSituacao}*` : 'com o propósito de buscar a melhor estrutura para as suas operações de crédito'};

${op?.saldoDevedorAtualizado ? `(iii) o saldo devedor consolidado da(s) operação(ões) objeto desta consultoria totaliza, nesta data, ${numeroExtenso(op.saldoDevedorAtualizado)}${op.numeroCredores ? `, distribuído(s) entre ${op.numeroCredores} credor(es)` : ''}${op.credoresListados?.length ? ` (${op.credoresListados.join(', ')})` : ''};\n` : ''}
(${op?.saldoDevedorAtualizado ? 'iv' : 'iii'}) as Partes reconhecem expressamente que os serviços aqui contratados configuram **OBRIGAÇÃO DE MEIO**, e não de resultado, sendo certo que a CONTRATADA empregará todos os meios técnicos disponíveis sem, contudo, garantir resultado específico de renegociação, desconto ou êxito em demanda judicial;

(${op?.saldoDevedorAtualizado ? 'v' : 'iv'}) as Partes leram e compreenderam integralmente os termos deste Contrato, tiveram oportunidade de tirar dúvidas e negociar as suas cláusulas${aplicaCdc ? ', em especial as limitativas de direito, que foram redigidas de forma destacada para ciência inequívoca do(a) CONTRATANTE, nos termos do art. 54, §4º, do CDC' : ''}.

**Resolvem as Partes celebrar o presente Contrato, mediante as cláusulas e condições seguintes:**

---

## CLÁUSULA I — DO OBJETO

**1.1.** O presente Contrato tem por objeto a prestação, pela CONTRATADA em favor do(a) CONTRATANTE, de serviços técnicos especializados de **consultoria em estruturação financeira e reestruturação de dívidas**, nos módulos especificados na Cláusula II, realizados de forma diligente e qualificada, conforme o estado da arte da atividade.

**1.2.** Integra este Contrato, para todos os fins, qualquer **Proposta Técnica** previamente apresentada pela CONTRATADA ao(à) CONTRATANTE e aceita por este(a), cujos termos serão complementares aos aqui definidos, prevalecendo, em caso de conflito, este instrumento.

**1.3.** Os serviços **não incluem**:
a) patrocínio de causa em juízo, ato privativo de advogado regularmente inscrito na OAB (Lei 8.906/94);
b) emissão de parecer jurídico vinculante;
c) perícia judicial com investidura do Poder Judiciário (art. 156 CPC);
d) representação bancária formal em nome do(a) CONTRATANTE perante o Banco Central;
e) gestão patrimonial continuada, salvo se especificamente contratada em módulo próprio.

---

## CLÁUSULA II — DO ESCOPO DOS SERVIÇOS

**2.1.** A CONTRATADA prestará ao(à) CONTRATANTE os seguintes **módulos** de serviço, conforme selecionados nesta contratação:

${modulosAtivos.length > 0 ? modulosAtivos.map((m, i) => `**2.1.${i + 1}.** _${m.titulo}_ — ${m.descricao}`).join('\n\n') : '_Escopo a definir em aditivo contratual específico._'}

**2.2.** Qualquer serviço não listado acima exigirá **aditivo contratual** ou nova contratação, respeitando-se a autonomia das Partes.

**2.3.** O escopo ora contratado é limitado às operações de crédito expressamente identificadas nos Considerandos ou em anexo específico, não se estendendo automaticamente a novas operações que o(a) CONTRATANTE venha a celebrar durante a vigência.

---

## CLÁUSULA III — DOS ENTREGÁVEIS E PRODUTOS DE CONSULTORIA

**3.1.** Ao longo da execução do Contrato, a CONTRATADA entregará ao(à) CONTRATANTE, conforme aplicável aos módulos contratados:

a) **Relatório de Diagnóstico Financeiro-Contratual** — documento técnico consolidado com CET efetivo, multiplicador de despesas, indícios de abusividade e recomendações;
b) **Memória de Cálculo** — planilha auditável período a período, acompanhada de parecer metodológico;
c) **Proposta Estruturada** — documento no padrão ALETIS (15 seções) contendo o plano de reestruturação e fundamentação jurídica;
d) **Minutas contratuais** — CPR-F, CPR-Física, Confissão de Dívida, Termo de Renegociação, Acordo Extrajudicial ou Transação Excepcional, conforme aplicável;
e) **Atas / relatórios de negociação** com os credores;
f) **Relatórios periódicos de acompanhamento** durante a vigência, quando contratado o módulo correspondente.

**3.2.** Os entregáveis serão disponibilizados em formato **PDF** (e, quando aplicável, em formato de planilha editável), por e-mail ou portal eletrônico da CONTRATADA, mediante confirmação de recebimento pelo(a) CONTRATANTE.

**3.3.** O(a) CONTRATANTE disporá de **prazo de 7 (sete) dias corridos** contados do recebimento para apresentar, por escrito, **manifestação fundamentada** de reparos a qualquer entregável. O silêncio além desse prazo importará **aceite tácito** do produto, para todos os fins — ressalvadas, sempre, as hipóteses de vício oculto e de inobservância do dever de informação.

---

## CLÁUSULA IV — DO PRAZO DE EXECUÇÃO E DA VIGÊNCIA

**4.1.** O presente Contrato vigerá pelo prazo de **${vigMeses} (${numeroPorExtensoSimples(vigMeses)}) meses**, iniciando-se em **${fmtDate(dataInicio.toISOString())}** e encerrando-se em **${fmtDate(dataFim.toISOString())}**, prorrogável por igual período mediante aditivo escrito firmado por ambas as Partes.

**4.2.** A execução dos serviços observará **cronograma** previamente acordado, podendo ser ajustado em função da disponibilidade documental do(a) CONTRATANTE, da agenda dos credores envolvidos e de eventos externos (feriados bancários, recesso forense, colheita/plantio).

**4.3.** **Suspensão do prazo.** Correrão suspensos os prazos em favor da CONTRATADA enquanto pendente qualquer providência a cargo do(a) CONTRATANTE (entrega de documentos, pagamentos, confirmações), reiniciando-se a contagem a partir do efetivo cumprimento.

---

## CLÁUSULA V — DA NATUREZA DA OBRIGAÇÃO

**5.1.** As Partes reconhecem, inequivocamente, que os serviços objeto deste Contrato configuram **OBRIGAÇÃO DE MEIO**, e não de resultado. A CONTRATADA obriga-se a empregar diligência técnica, boa-fé, melhores esforços e estado da arte de mercado, **sem garantir**:

a) obtenção de desconto específico ou aceitação integral da proposta pelo credor;
b) êxito em demanda judicial promovida pelo(a) CONTRATANTE ou por advogado por ele(a) indicado;
c) manutenção de classificação de crédito ou relacionamento bancário;
d) aprovação de operação de crédito complementar por qualquer instituição;
e) ausência de protesto, inscrição em cadastros restritivos ou execução durante a negociação.

**5.2.** A não obtenção de resultado esperado pelo(a) CONTRATANTE, isoladamente, **não configura inadimplemento** da CONTRATADA, desde que observada a diligência técnica esperada.

---

## CLÁUSULA VI — DOS HONORÁRIOS E DA FORMA DE PAGAMENTO

${hon}

---

## CLÁUSULA VII — DA EMISSÃO DE NOTA FISCAL E DA TRIBUTAÇÃO

**7.1.** A CONTRATADA emitirá **Nota Fiscal de Serviços Eletrônica (NFS-e)** para cada recebimento, destacando o **ISSQN** (LC 116/2003) e demais tributos incidentes, observada a legislação municipal aplicável ao local de prestação.

**7.2.** Tributos e contribuições incidentes sobre a prestação do serviço são de responsabilidade exclusiva da CONTRATADA, na qualidade de contribuinte, ressalvadas eventuais **retenções na fonte** obrigatórias ao(à) CONTRATANTE por força de lei (ex: IRRF, INSS, CSLL, PIS/COFINS — quando o(a) CONTRATANTE for pessoa jurídica tomadora com tal obrigação), cuja comprovação de recolhimento será anexada aos autos da operação.

**7.3.** Em caso de alteração da legislação tributária que impacte materialmente o equilíbrio econômico-financeiro deste Contrato, as Partes revisarão, de boa-fé, o valor dos honorários.

---

## CLÁUSULA VIII — DA ATUALIZAÇÃO MONETÁRIA, DOS JUROS DE MORA E DA MULTA

**8.1.** Os honorários não pagos no vencimento sujeitarão o(a) CONTRATANTE aos seguintes encargos, cumulativamente:

a) **correção monetária** pelo **IPCA/IBGE** (ou, na sua ausência, pelo IGP-M/FGV);
b) **juros de mora** de **1% (um por cento) ao mês**, pro rata die (art. 406 do CC c/c art. 161, §1º, do CTN);
c) **multa moratória** de **2% (dois por cento)** sobre o valor em atraso${aplicaCdc ? ' (limite do art. 52, §1º, do CDC)' : ''};
d) **honorários advocatícios** de 10% em caso de cobrança judicial e reembolso de custas e despesas processuais.

**8.2.** O inadimplemento superior a **30 (trinta) dias** autoriza a CONTRATADA a **suspender a execução** dos serviços, comunicando o(a) CONTRATANTE por escrito, sem prejuízo da cobrança dos valores em aberto.

---

## CLÁUSULA IX — DAS OBRIGAÇÕES DO(A) CONTRATANTE

**9.1.** São obrigações do(a) CONTRATANTE:

a) fornecer, de forma **completa, verdadeira, tempestiva e atualizada**, todas as informações, documentos e acessos necessários à execução dos serviços (cédulas de crédito, extratos, contratos, matrículas, certidões, comprovantes de pagamento, laudos técnicos, CAR, DAP/CAF, declarações de IR, entre outros);
b) **não omitir** fatos relevantes à análise (ações judiciais em curso, garantias cruzadas, débitos trabalhistas, restritivos ativos, operações não formalizadas);
c) manter **canal de comunicação** ativo (e-mail e/ou telefone declarado), respondendo a solicitações da CONTRATADA no prazo máximo de 5 (cinco) dias úteis;
d) **pagar os honorários** nos prazos e condições pactuados (Cláusula VI);
e) **não contratar, paralelamente**, outra consultoria ou profissional para os mesmos serviços objeto deste instrumento, sem prévia comunicação por escrito à CONTRATADA, sob pena de rescisão e perda dos honorários de êxito (Cláusula XX);
f) **confirmar por escrito** a aceitação das propostas apresentadas pelos credores antes do fechamento de qualquer acordo formal;
g) suportar as **despesas de terceiros** necessárias à operação (cartórios, laudos CREA, ITBI em dação, custas forenses, honorários de advogados por si contratados), as quais **não integram os honorários** da CONTRATADA.

**9.2.** O(a) CONTRATANTE declara, sob as penas da lei, que **as informações prestadas são verdadeiras** e que tem plena capacidade civil e poderes para firmar este instrumento.

---

## CLÁUSULA X — DAS OBRIGAÇÕES DA CONTRATADA

**10.1.** São obrigações da CONTRATADA:

a) executar os serviços com **diligência técnica**, boa-fé objetiva e observância das melhores práticas de mercado;
b) manter o(a) CONTRATANTE informado(a) sobre a evolução dos serviços, com relatórios periódicos;
c) guardar **sigilo profissional** sobre as informações conhecidas em razão deste Contrato (Cláusula XII);
d) indicar, no início do Contrato, **consultor responsável** pela execução, comunicando eventual substituição;
e) **comunicar imediatamente** ao(à) CONTRATANTE qualquer fato superveniente que possa afetar a execução (conflito de interesses, indisponibilidade, mudança regulatória relevante);
f) entregar os produtos contratados (Cláusula III) dentro do cronograma ajustado;
g) observar a legislação aplicável, em especial as normas do **Código Civil**, do **Manual de Crédito Rural (MCR)**, das **Resoluções do CMN**, do **Banco Central** e, no que couber, da **OAB** (quando atuar em articulação com advogado do(a) CONTRATANTE).

**10.2.** A CONTRATADA declara possuir **estrutura técnica, humana e operacional** compatível com a complexidade do objeto.

---

## CLÁUSULA XI — DA NÃO-EXCLUSIVIDADE, CONFLITO DE INTERESSES E ATUAÇÃO PARALELA

**11.1.** A CONTRATADA poderá prestar os mesmos serviços a **outros clientes**, inclusive do mesmo segmento econômico, sendo vedada apenas a atuação simultânea em favor de **parte adversa** direta do(a) CONTRATANTE no mesmo litígio ou negociação.

**11.2.** Identificado **conflito de interesses** durante a execução, a CONTRATADA comunicará o(a) CONTRATANTE por escrito em até 5 (cinco) dias úteis, oportunidade em que as Partes decidirão pela manutenção, suspensão ou rescisão do Contrato, sem ônus recíprocos além das parcelas já devidas.

**11.3.** O(a) CONTRATANTE compromete-se a informar previamente a CONTRATADA caso contrate **outros profissionais** (advogado, contador, perito, outra consultoria) cuja atuação possa interferir nos serviços objeto deste Contrato, para fins de coordenação técnica.

---

## CLÁUSULA XII — DA CONFIDENCIALIDADE

**12.1.** As Partes obrigam-se a manter **sigilo absoluto** sobre todas as **informações confidenciais** trocadas em razão deste Contrato, ainda que verbais, escritas, digitais ou sob qualquer forma, aí incluídos, sem limitação: dados financeiros, contratuais, patrimoniais, tributários, estratégicos, comerciais e pessoais; estrutura de dívida; nomes de credores; valores negociados; estratégias de negociação; metodologias proprietárias; planilhas e cálculos; correspondências e memorandos.

**12.2.** A obrigação de sigilo persistirá pelo prazo de **5 (cinco) anos** após o encerramento deste Contrato, a qualquer título, e **não se aplica** às informações que:
a) já sejam de domínio público na data do recebimento, ou tornem-se públicas sem culpa da Parte receptora;
b) tenham de ser reveladas por **determinação judicial, ordem de autoridade competente ou exigência legal**, caso em que a Parte obrigada comunicará imediatamente a outra, sempre que possível, para possibilitar medidas protetivas;
c) já fossem previamente conhecidas pela Parte receptora por meio lícito, conforme registros documentais;
d) sejam reveladas a **advogados, contadores, peritos ou auditores** vinculados à execução, observada a mesma obrigação de sigilo mediante NDA próprio.

**12.3.** A violação da confidencialidade sujeitará a Parte infratora ao pagamento de **multa não compensatória de 2 (duas) vezes o valor total dos honorários contratados**, sem prejuízo de perdas e danos cabíveis e das sanções penais (art. 154 do CP — violação de segredo profissional).

---

## CLÁUSULA XIII — DO TRATAMENTO DE DADOS PESSOAIS (LGPD — LEI 13.709/2018)

**13.1.** As Partes comprometem-se a tratar os dados pessoais envolvidos na execução deste Contrato em conformidade com a **Lei Geral de Proteção de Dados Pessoais (Lei 13.709/2018 — "LGPD")**, observando os princípios da finalidade, adequação, necessidade, livre acesso, transparência, segurança e prevenção (art. 6º da LGPD).

**13.2.** **Bases legais do tratamento:** execução de contrato (art. 7º, V), cumprimento de obrigação legal (art. 7º, II), exercício regular de direitos em processo judicial, administrativo ou arbitral (art. 7º, VI) e, subsidiariamente, legítimo interesse (art. 7º, IX), sempre restrito aos dados estritamente necessários à prestação do serviço.

**13.3.** **Papéis.** Para os dados fornecidos pelo(a) CONTRATANTE, a CONTRATADA atua como **operadora**, tratando-os exclusivamente conforme as instruções do(a) CONTRATANTE, salvo tratamento próprio necessário à execução (ex: cálculos, pareceres) em que poderá atuar como controladora autônoma.

**13.4.** **Direitos do titular.** A CONTRATADA cooperará com o(a) CONTRATANTE para viabilizar o atendimento aos direitos dos titulares (acesso, correção, anonimização, portabilidade, eliminação — arts. 18 e 19 da LGPD), observados os prazos legais.

**13.5.** **Medidas de segurança.** A CONTRATADA adotará medidas técnicas e administrativas razoáveis para proteger os dados: criptografia em trânsito e em repouso, controle de acesso por perfil, logs de auditoria, política de backup, descarte seguro, contrato de sigilo com colaboradores e subcontratados.

**13.6.** **Incidentes de segurança.** Havendo incidente envolvendo dados pessoais, a Parte que tiver ciência comunicará a outra em até **48 (quarenta e oito) horas**, com descrição dos fatos, dados afetados e medidas tomadas, nos termos do art. 48 da LGPD.

**13.7.** **Retenção e descarte.** Encerrado o Contrato, a CONTRATADA manterá os dados pelo prazo necessário ao cumprimento de obrigações legais (notadamente o prescricional de **5 anos**) e, vencido esse prazo, procederá ao descarte seguro, salvo autorização expressa em contrário.

---

## CLÁUSULA XIV — DA PROPRIEDADE INTELECTUAL

**14.1.** Os **produtos de consultoria** entregues (relatórios, pareceres, memórias de cálculo, propostas, minutas) são de **uso exclusivo do(a) CONTRATANTE** para os fins deste Contrato, não podendo ser reproduzidos, cedidos ou comercializados a terceiros sem autorização escrita da CONTRATADA.

**14.2.** As **metodologias, modelos, planilhas-matriz, templates, know-how e softwares** desenvolvidos e utilizados pela CONTRATADA permanecem de sua **titularidade exclusiva**, assim como bases de conhecimento, precedentes catalogados, ementas e fundamentação.

**14.3.** A marca, o nome empresarial e os sinais distintivos da CONTRATADA são de uso restrito, sendo vedada ao(à) CONTRATANTE qualquer utilização sem prévia autorização escrita, inclusive em material publicitário.

---

## CLÁUSULA XV — DA LIMITAÇÃO DE RESPONSABILIDADE

**15.1.** A responsabilidade total da CONTRATADA, em hipótese alguma, excederá o **valor total dos honorários efetivamente pagos** por este Contrato nos 12 (doze) meses anteriores ao evento que deu causa à reclamação.

**15.2.** A CONTRATADA **não responde**, em nenhuma hipótese, por:
a) decisões de terceiros (credores, juízes, autoridades administrativas);
b) inadimplemento ou atrasos do(a) CONTRATANTE no pagamento a seus credores;
c) danos indiretos, lucros cessantes, perda de chance ou dano reflexo;
d) caso fortuito e força maior (art. 393 CC);
e) omissões, informações inverídicas ou incompletas fornecidas pelo(a) CONTRATANTE.

**15.3.** A limitação acima **não se aplica** em caso de dolo ou culpa grave da CONTRATADA, nem às obrigações legais indisponíveis${aplicaCdc ? ', respeitado o disposto nos arts. 25 e 51, I, do CDC' : ''}.

${aplicaCdc ? `**15.4.** As Partes reconhecem que as limitações desta Cláusula foram redigidas com **destaque** e lidas previamente, nos termos do art. 54, §4º, do CDC, atendendo ao dever de informação e clareza contratual.\n` : ''}

---

## CLÁUSULA XVI — DA CONFORMIDADE ANTICORRUPÇÃO E INTEGRIDADE

**16.1.** As Partes comprometem-se a cumprir integralmente a **Lei nº 12.846/2013 (Lei Anticorrupção)**, a Lei nº 9.613/1998 (Prevenção à Lavagem de Dinheiro), a Lei nº 8.429/1992 (Improbidade Administrativa) e demais normas aplicáveis.

**16.2.** É expressamente **vedado** a qualquer das Partes, seus sócios, empregados, representantes ou prepostos, direta ou indiretamente, oferecer, prometer, entregar ou autorizar a entrega de **qualquer vantagem indevida** a agente público ou terceiro, nacional ou estrangeiro, com o fim de obter, reter ou direcionar negócio objeto ou vinculado a este Contrato.

**16.3.** Descoberta violação desta Cláusula, a Parte inocente poderá promover a **rescisão imediata** deste Contrato, sem ônus indenizatório em favor da Parte infratora, sem prejuízo da responsabilização civil, administrativa e penal cabível e do dever de colaboração com as autoridades competentes.

---

## CLÁUSULA XVII — ${aplicaCdc ? 'DA APLICAÇÃO DO CÓDIGO DE DEFESA DO CONSUMIDOR E DA PREVENÇÃO AO SUPERENDIVIDAMENTO' : 'DA RELAÇÃO CIVIL E COMERCIAL ENTRE AS PARTES'}

${aplicaCdc
  ? `**17.1.** As Partes reconhecem que ao(à) CONTRATANTE, pessoa física consumidora final dos serviços, aplicam-se as disposições da **Lei nº 8.078/1990 (CDC)** no que couber.

**17.2.** ${aplicaSuper ? `A CONTRATADA observará os deveres de **prevenção ao superendividamento** previstos na **Lei nº 14.181/2021**, em especial: (a) oferta clara e adequada; (b) informação prévia sobre custo efetivo dos honorários e seus parcelamentos; (c) respeito ao princípio do **mínimo existencial** do(a) CONTRATANTE; (d) abstenção de assédio de consumo.` : 'A CONTRATADA observará o dever de informação clara sobre o custo efetivo dos honorários.'}

**17.3.** Eventuais **controvérsias** envolvendo a interpretação deste Contrato serão resolvidas, sempre que possível, pela solução mais favorável ao(à) CONTRATANTE, na forma do art. 47 do CDC.

**17.4.** O(a) CONTRATANTE poderá exercer o **direito de arrependimento** previsto no art. 49 do CDC em até **7 (sete) dias** contados da assinatura, desde que a contratação tenha ocorrido **fora do estabelecimento comercial** da CONTRATADA.`
  : `**17.1.** As Partes declaram tratar-se de relação civil e comercial entre pessoas físicas ou jurídicas, **não consumidora**, nos termos do art. 2º do CDC interpretado **a contrario sensu**, aplicando-se integralmente o regime do Código Civil às obrigações ora pactuadas.

**17.2.** O(a) CONTRATANTE, no uso de sua capacidade técnica e negocial, declara ter analisado detidamente todas as cláusulas, inclusive as de exclusão e limitação de responsabilidade, dispensando a aplicação subsidiária do CDC.`}

---

## CLÁUSULA XVIII — DO CASO FORTUITO E DA FORÇA MAIOR

**18.1.** Nenhuma das Partes será responsabilizada pelo descumprimento de obrigações decorrentes de **caso fortuito ou força maior**, assim compreendidos os eventos imprevisíveis e inevitáveis, nos termos do art. 393 do Código Civil (pandemias, desastres naturais, atos de guerra, comoções civis, greves gerais, atos do Poder Público com impacto generalizado, falhas sistêmicas do Banco Central, instabilidade regulatória grave).

**18.2.** A Parte afetada comunicará imediatamente à outra o evento e suas consequências, buscando, de boa-fé, alternativas para mitigar o impacto. Persistindo o evento por mais de **60 (sessenta) dias**, qualquer Parte poderá rescindir o Contrato sem ônus, ressalvados os honorários proporcionais pelos serviços já executados.

---

## CLÁUSULA XIX — DA CESSÃO E DA SUBCONTRATAÇÃO

**19.1.** **É vedada** a cessão ou transferência da posição contratual por qualquer das Partes sem anuência prévia e expressa da outra, nos termos dos arts. 286 e seguintes do Código Civil.

**19.2.** A CONTRATADA poderá **subcontratar** profissionais especializados (contadores, peritos, engenheiros agrônomos, avaliadores CREA, advogados) para tarefas específicas, sob sua inteira responsabilidade técnica e contratual, mediante NDA e observância da LGPD.

---

## CLÁUSULA XX — DA RESCISÃO

**20.1.** O presente Contrato poderá ser rescindido:

a) **por cumprimento integral do objeto** (termo normal);
b) **de comum acordo** entre as Partes, mediante termo de distrato escrito, acertando-se os valores devidos até a data;
c) **por inadimplemento** de obrigação essencial por qualquer Parte, após notificação escrita à Parte infratora, concedendo-se prazo de **15 (quinze) dias** para purgação da mora, findos os quais opera-se a rescisão de pleno direito (art. 474 do CC);
d) **unilateralmente**, a qualquer tempo, mediante **pré-aviso escrito** de 30 (trinta) dias, respeitadas as consequências da Cláusula XXI;
e) **por força maior ou caso fortuito** prolongado (Cláusula 18.2);
f) em caso de **conflito de interesses** insanável (Cláusula 11.2);
g) em caso de **violação à confidencialidade** (Cláusula 12.3), à LGPD (Cláusula XIII) ou à legislação anticorrupção (Cláusula XVI);
h) **falência, recuperação judicial** (Lei 11.101/05) ou insolvência declarada do(a) CONTRATANTE.

---

## CLÁUSULA XXI — DOS EFEITOS FINANCEIROS DA RESCISÃO

**21.1.** Em caso de **rescisão imotivada** pelo(a) CONTRATANTE **antes da conclusão dos serviços**, são devidos à CONTRATADA:

a) a **totalidade dos honorários fixos / mensalidades** relativos ao período efetivamente trabalhado, acrescidos de eventuais despesas já incorridas e não reembolsadas;
b) **multa rescisória** equivalente a **20% (vinte por cento)** sobre a parcela remanescente dos honorários fixos e/ou mensalidades previstos até o final da vigência, a título de indenização por interrupção do cronograma;
c) **honorários de êxito**, proporcionais, caso (i) proposta estruturada já tenha sido enviada a credor e aceita, ou (ii) exista cronograma de pagamentos com credor em razão de negociação conduzida pela CONTRATADA, ou (iii) cessão/transferência do caso para terceiro gere economia decorrente do trabalho técnico já realizado pela CONTRATADA.

**21.2.** Em caso de **rescisão por culpa exclusiva da CONTRATADA**, serão devidos ao(à) CONTRATANTE:
a) restituição proporcional dos honorários fixos relativos a serviços não executados;
b) entrega imediata de todos os produtos técnicos já elaborados e dados sob custódia;
c) multa compensatória, quando demonstrado prejuízo, limitada ao **valor dos honorários pagos nos 12 meses anteriores** (Cláusula 15.1).

---

## CLÁUSULA XXII — DAS COMUNICAÇÕES

**22.1.** Toda comunicação entre as Partes, para fins deste Contrato, será feita preferencialmente por **e-mail**, considerando-se válidas as enviadas para os endereços abaixo, que poderão ser atualizados mediante comunicação escrita.

**CONTRATANTE:** ${contratante.email ?? '_e-mail a informar_'}
**CONTRATADA:** ${contratada.email ?? s.contatoAletis?.email ?? 'contato@aletis.com.br'}

**22.2.** Comunicações via **WhatsApp Business** e **mensageria eletrônica** são válidas para fins operacionais (agendamentos, pedidos de documento, atualizações de andamento), mas **não substituem a notificação formal** por e-mail ou meio equivalente nas hipóteses de constituição em mora, rescisão ou ativação de penalidades.

**22.3.** Presume-se recebida a comunicação eletrônica no **primeiro dia útil seguinte** ao envio, salvo retorno automático de erro.

---

## CLÁUSULA XXIII — DA ASSINATURA ELETRÔNICA E DA VALIDADE DO INSTRUMENTO

**23.1.** Este Contrato poderá ser assinado **eletronicamente**, reconhecendo-se a plena validade jurídica da assinatura digital realizada com certificado **ICP-Brasil** (MP 2.200-2/2001) ou por meio de plataforma de assinatura eletrônica${s.plataformaAssinaturaEletronica ? ` — neste ato ${s.plataformaAssinaturaEletronica}` : ' (ex: DocuSign, Clicksign, D4Sign, Gov.br)'}, com registro de log de auditoria, IP, data e hora, nos termos da **Lei nº 14.063/2020**.

**23.2.** A assinatura eletrônica **qualificada** (ICP-Brasil) produz os mesmos efeitos jurídicos da assinatura manuscrita. A assinatura eletrônica **avançada** (plataforma com autenticação multifatorial) é igualmente válida entre as Partes para todos os fins aqui previstos, que expressamente a aceitam.

**23.3.** Assinado na presença de **2 (duas) testemunhas**, este instrumento constitui **título executivo extrajudicial**, nos termos do art. 784, III, do Código de Processo Civil.

---

## CLÁUSULA XXIV — DAS DISPOSIÇÕES GERAIS

**24.1.** **Integralidade.** Este Contrato, com seus anexos e eventuais aditivos, representa o **entendimento integral** entre as Partes sobre o objeto, substituindo quaisquer acordos, entendimentos, propostas, cartas de intenção ou comunicações prévias, orais ou escritas.

**24.2.** **Alterações.** Qualquer alteração deste Contrato somente será válida se formalizada por **aditivo escrito**, assinado por ambas as Partes.

**24.3.** **Renúncia.** A tolerância de uma Parte quanto ao descumprimento de qualquer obrigação pela outra **não importará renúncia ou novação**, mantendo-se íntegros os direitos originários.

**24.4.** **Independência das cláusulas.** A eventual declaração de nulidade de qualquer cláusula **não afetará a validade das demais**, que subsistirão e serão interpretadas de forma a preservar o negócio.

**24.5.** **Inexistência de vínculo empregatício ou societário.** Este Contrato não gera vínculo trabalhista, previdenciário, societário ou de representação comercial entre as Partes, tratando-se de típica prestação autônoma de serviços.

**24.6.** **Ausência de exclusividade recíproca.** As Partes são livres para contratar outros profissionais ou clientes, observadas as restrições pontuais previstas neste Contrato.

**24.7.** **Idioma.** O idioma oficial do Contrato é o **português do Brasil**; traduções são referenciais.

${s.arbitragem?.adotar
  ? `---

## CLÁUSULA XXV — DA MEDIAÇÃO E DA ARBITRAGEM

**25.1.** Qualquer controvérsia decorrente deste Contrato será, preliminarmente, submetida à **mediação** nos termos da **Lei nº 13.140/2015**, por mediador escolhido de comum acordo, pelo prazo de até **30 (trinta) dias**.

**25.2.** Frustrada a mediação, a controvérsia será **definitivamente resolvida por arbitragem**, nos termos da **Lei nº 9.307/1996**, na modalidade ${s.arbitragem.tipo === 'institucional' ? 'institucional' : 'ad hoc'}, ${s.arbitragem.camara ? `administrada pela **${s.arbitragem.camara}**` : 'por 3 (três) árbitros'}, com sede em **${s.arbitragem.sede ?? d.local + '-' + d.uf}**, em **${s.arbitragem.idioma ?? 'português'}**, aplicando-se o Direito Brasileiro.

**25.3.** As Partes poderão, contudo, recorrer ao Poder Judiciário exclusivamente para **tutelas de urgência** anteriores à instituição do tribunal arbitral, comprometendo-se a submeter o mérito, após constituído o juízo arbitral, à competência da arbitragem.

---

## CLÁUSULA XXVI — DO FORO`
  : `---

## CLÁUSULA XXV — DO FORO`}

${s.arbitragem?.adotar ? '**26.1.**' : '**25.1.**'} Para dirimir as questões residuais que não comportem solução pela via pactuada${s.arbitragem?.adotar ? ' (mediação/arbitragem)' : ''}, incluindo as **tutelas de urgência**, fica eleito o Foro da Comarca de **${foroPadrao}**, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

${aplicaCdc ? `${s.arbitragem?.adotar ? '**26.2.**' : '**25.2.**'} Em respeito ao art. 101, I, do CDC, o(a) CONTRATANTE pessoa física consumidora poderá optar pelo Foro de seu **domicílio**, prevalecendo esta cláusula quando mais favorável.\n` : ''}

${d.observacoes ? `---

## DISPOSIÇÕES COMPLEMENTARES

${d.observacoes}
` : ''}

---

E, por estarem assim justas e contratadas, as Partes firmam o presente instrumento em ${d.testemunhas && d.testemunhas.length > 0 ? '1 (uma) via digital com registro eletrônico' : '2 (duas) vias de igual teor'}, na presença das testemunhas abaixo identificadas.

${rodapeAssinaturas(d)}
`
}

/* ------------------------------------------------------------------------
 *  Sub-helpers — exclusivos do template de Prestação de Serviços ALETIS
 * ------------------------------------------------------------------------ */

function numeroPorExtensoSimples(n: number): string {
  const base: Record<number, string> = {
    1: 'um', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis',
    7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez', 11: 'onze', 12: 'doze',
    18: 'dezoito', 24: 'vinte e quatro', 36: 'trinta e seis',
  }
  return base[n] ?? String(n)
}

function renderHonorarios(s: DadosPrestacaoServicos): string {
  const linhas: string[] = []

  const pushFixo = () => {
    const v = s.honorarioFixo ?? 0
    linhas.push(`**6.1. Honorário fixo.** ${numeroExtenso(v)}, devido(s) pelo(a) CONTRATANTE à CONTRATADA como remuneração pelos serviços técnicos contratados.`)
  }
  const pushMensalidade = () => {
    const m = s.mensalidade ?? 0
    const meses = s.mesesRetainer ?? 6
    linhas.push(
      `**6.1. Honorário mensal (retainer).** ${numeroExtenso(m)} por mês, pelo prazo de ${meses} (${numeroPorExtensoSimples(meses)}) meses, devidos até o **5º (quinto) dia útil** de cada mês-calendário, totalizando o montante estimado de ${fmtBRL(m * meses)} no período.`,
    )
  }
  const pushExito = (clausulaNum: string) => {
    const pct = s.percentualExito ?? 0
    const base: Record<NonNullable<DadosPrestacaoServicos['baseCalculoExito']>, string> = {
      economia_total: 'sobre a **economia total** gerada, assim entendida a diferença entre (i) o somatório dos saldos devedores atualizados apresentados na data da contratação e (ii) o somatório efetivamente pago pelo(a) CONTRATANTE para liquidar as operações (inclusive mediante dação, compensação ou novação)',
      reducao_saldo: 'sobre a **redução de saldo** contratada perante os credores (diferença entre saldo atualizado inicial e saldo final acordado)',
      valor_renegociado: 'sobre o **valor total renegociado** (soma dos valores submetidos a reestruturação, conforme termos firmados com cada credor)',
    }
    const texto = base[s.baseCalculoExito ?? 'economia_total']

    const piso = s.pisoExito ? `, com piso de ${fmtBRL(s.pisoExito)},` : ''
    const teto = s.tetoExito ? ` e teto de ${fmtBRL(s.tetoExito)}` : ''
    linhas.push(
      `**${clausulaNum}. Honorário de êxito.** ${pct.toLocaleString('pt-BR')}% (${numeroPorExtensoSimples(Math.round(pct))} por cento) ${texto}${piso}${teto}.`,
    )

    const cond: Record<NonNullable<DadosPrestacaoServicos['condicaoPagamentoExito']>, string> = {
      a_vista_liquidacao: 'em parcela única, no ato da liquidação/assinatura do instrumento definitivo com o(s) credor(es)',
      pro_rata_parcelas_credor: 'em parcelas **pro rata** acompanhando as parcelas efetivamente pagas pelo(a) CONTRATANTE ao(s) credor(es) — devido a cada liquidação, proporcionalmente',
      parcelado_ate_180d: 'em até 6 (seis) parcelas mensais e sucessivas, vencíveis em até 180 (cento e oitenta) dias contados da assinatura do acordo definitivo com o(s) credor(es)',
    }
    linhas.push(
      `**${clausulaNum.replace(/(\d+\.\d+)$/, (m) => {
        const parts = m.split('.')
        return `${parts[0]}.${parseInt(parts[1]) + 1}`
      })}. Forma de pagamento do êxito.** ${cond[s.condicaoPagamentoExito ?? 'a_vista_liquidacao']}.`,
    )
  }

  // Compose por modelo
  switch (s.modeloHonorarios) {
    case 'fixo':
      pushFixo()
      linhas.push(
        `**6.2. Forma de pagamento.** O valor será pago em parcela única, em até **10 (dez) dias** contados da assinatura deste Contrato, mediante TED ou PIX em conta titularizada pela CONTRATADA e emissão da respectiva Nota Fiscal de Serviços Eletrônica (NFS-e).`,
      )
      break

    case 'mensal':
      pushMensalidade()
      linhas.push(
        `**6.2. Forma de pagamento.** Via TED/PIX em conta titularizada pela CONTRATADA, contra emissão mensal da NFS-e.`,
      )
      break

    case 'exito':
      pushExito('6.1')
      break

    case 'hibrido_fixo_exito':
      pushFixo()
      linhas.push(
        `**6.2. Forma de pagamento do fixo.** Em parcela única, em até **10 (dez) dias** contados da assinatura deste Contrato.`,
      )
      pushExito('6.3')
      break

    case 'hibrido_mensal_exito':
      pushMensalidade()
      pushExito('6.3')
      break
  }

  linhas.push(
    `**6.${linhas.length}. Despesas de terceiros.** Não estão compreendidas nos honorários acima: (a) emolumentos cartorários, ITBI e registros; (b) laudos técnicos e avaliações (CREA/CFT); (c) custas e honorários advocatícios em processos judiciais; (d) diligências fora da sede de prestação (deslocamento, hospedagem, quando solicitados pelo(a) CONTRATANTE), as quais serão previamente orçadas e reembolsadas contra comprovante.`,
  )

  return linhas.join('\n\n')
}

/* ========================================================================
 *  GERADOR PRINCIPAL
 * ======================================================================== */

const METADATA_POR_TIPO: Record<TipoContrato, { titulo: string; fundamento: string[]; revisao: string[] }> = {
  cpr_financeira: {
    titulo: 'Cédula de Produto Rural Financeira',
    fundamento: ['Lei 8.929/94', 'Lei 10.200/01', 'Lei 11.076/04', 'CC art. 1.442 (penhor agrícola)'],
    revisao: [
      'Verificar matrícula e averbações do imóvel rural',
      'Conferir Inscrição Estadual do Produtor Rural',
      'Registrar a CPR no Cartório de Registro de Imóveis para oponibilidade',
      'Validar cálculo de sacas vs valor total',
    ],
  },
  cpr_fisica: {
    titulo: 'Cédula de Produto Rural Física',
    fundamento: ['Lei 8.929/94', 'CC art. 1.442', 'IN MAPA padrão do produto'],
    revisao: [
      'Definir padrão de qualidade em cláusula específica',
      'Verificar armazenagem do comprador',
      'Avaliar cobertura Proagro/seguro agrícola',
      'Registrar a CPR no Cartório de Registro de Imóveis',
    ],
  },
  confissao_divida: {
    titulo: 'Confissão de Dívida com Novação',
    fundamento: ['CC arts. 360-367 (novação)', 'CC art. 389', 'Súmula 474/STJ', 'Súmula 296/STJ'],
    revisao: [
      'Conferir documentação dos contratos originais novados',
      'Validar que o valor atualizado não inclui anatocismo',
      'Certificar que há efetiva extinção da obrigação anterior',
      'Conferir se há garantia real a ser registrada',
    ],
  },
  termo_renegociacao: {
    titulo: 'Termo de Renegociação de Crédito Rural',
    fundamento: ['MCR 2 e 3', 'Res. CMN 4.966/21', 'Súmula 298/STJ', 'Lei 13.340/16', 'Plano Safra 2025/26'],
    revisao: [
      'Validar taxa de juros contra tabela vigente do Plano Safra',
      'Confirmar preservação de garantias originárias',
      'Verificar fluxo de caixa da safra vinculada',
      'Auferir se há necessidade de aditivo contratual',
    ],
  },
  acordo_extrajudicial: {
    titulo: 'Acordo Extrajudicial',
    fundamento: ['CC arts. 840-841', 'CPC art. 784, III (título executivo)', 'Lei 13.140/15 (mediação)'],
    revisao: [
      'Anexar ao acordo a certidão de ações em curso',
      'Protocolar o acordo em juízo, se houver ação em andamento',
      'Providenciar baixa de protestos em 30 dias',
    ],
  },
  prestacao_servicos_aletis: {
    titulo: 'Contrato de Prestação de Serviços ALETIS',
    fundamento: [
      'CC arts. 593-609 (prestação de serviços)',
      'Lei 13.709/18 (LGPD)',
      'Lei 12.846/13 (Anticorrupção)',
      'MP 2.200-2/01 + Lei 14.063/20 (assinatura eletrônica)',
      'LC 116/03 (ISS)',
      'CPC art. 784, III (título executivo)',
      'Lei 14.181/21 (superendividamento — quando PF consumidor)',
      'CDC (Lei 8.078/90 — quando aplicável)',
    ],
    revisao: [
      'Conferir qualificação completa das Partes (CPF/CNPJ, endereço, representante legal)',
      'Validar modelo e valores de honorários (fixo, êxito, piso/teto)',
      'Definir base de cálculo do êxito (economia_total, reducao_saldo ou valor_renegociado)',
      'Revisar escopo: cada módulo selecionado deve refletir o efetivo acordo comercial',
      'Confirmar aplicabilidade do CDC e da Lei 14.181/21 (se CONTRATANTE é PF consumidor)',
      'Analisar foro do domicílio do consumidor (art. 101, I, CDC) vs foro de eleição',
      'Conferir plataforma de assinatura eletrônica declarada (ICP-Brasil, Clicksign, DocuSign, Gov.br)',
      'Se houver arbitragem, validar câmara indicada e compromisso arbitral',
      'Coletar assinaturas de 2 testemunhas para eficácia de título executivo (CPC 784, III)',
    ],
  },
  transacao_excepcional: {
    titulo: 'Transação Excepcional — Crédito Rural',
    fundamento: ['Lei 14.375/22', 'Res. CMN 4.966/21', 'MCR 2', 'Normas internas da instituição credora'],
    revisao: [
      'Confirmar elegibilidade na modalidade de adesão vigente',
      'Verificar prazo de adesão (programas têm janela temporal)',
      'Auditar desconto concedido vs tabela publicada',
      'Validar condições de rescisão (muito rígidas na modalidade)',
    ],
  },
}

export class ContratoGenerator {
  gerar(d: DadosContrato): ContratoGerado {
    const meta = METADATA_POR_TIPO[d.tipo]
    if (!meta) {
      throw new Error(`Tipo de contrato não suportado: ${d.tipo}`)
    }

    let conteudo: string
    switch (d.tipo) {
      case 'cpr_financeira':
        conteudo = gerarCPRFinanceira(d)
        break
      case 'cpr_fisica':
        conteudo = gerarCPRFisica(d)
        break
      case 'confissao_divida':
        conteudo = gerarConfissaoDivida(d)
        break
      case 'termo_renegociacao':
        conteudo = gerarTermoRenegociacao(d)
        break
      case 'acordo_extrajudicial':
        conteudo = gerarAcordoExtrajudicial(d)
        break
      case 'transacao_excepcional':
        conteudo = gerarTransacaoExcepcional(d)
        break
      case 'prestacao_servicos_aletis':
        conteudo = gerarPrestacaoServicosAletis(d)
        break
      default:
        throw new Error(`Tipo ${d.tipo} não implementado`)
    }

    const clausulas = (conteudo.match(/^## [IVX]+/gm) ?? []).length

    // Cálculo de valorTotal específico por tipo
    let valorTotal: number
    if (d.tipo === 'prestacao_servicos_aletis' && d.servicos) {
      const s = d.servicos
      const fixo = s.honorarioFixo ?? 0
      const retainer = (s.mensalidade ?? 0) * (s.mesesRetainer ?? 0)
      // Exito é estimativa: % sobre saldo devedor (referência), limitado por piso/teto se houver
      const baseExito = s.operacao?.saldoDevedorAtualizado ?? 0
      let exitoEstimado = baseExito * ((s.percentualExito ?? 0) / 100)
      if (s.pisoExito) exitoEstimado = Math.max(exitoEstimado, s.pisoExito)
      if (s.tetoExito) exitoEstimado = Math.min(exitoEstimado, s.tetoExito)
      valorTotal = fixo + retainer + exitoEstimado
    } else {
      valorTotal =
        d.cpr?.valorTotal ?? d.divida?.valorAtualizado ?? (d.parcelas?.reduce((a, p) => a + p.valor, 0) ?? 0)
    }

    const id = `ctr-${d.tipo.slice(0, 4)}-${Date.now().toString(36)}`

    // Data de vigência/vencimento por tipo
    let dataVencimentoOrVigencia: string | undefined
    if (d.tipo === 'prestacao_servicos_aletis' && d.servicos?.prazoVigenciaMeses) {
      const inicio = new Date(d.dataAssinatura ?? new Date().toISOString())
      const fim = new Date(inicio)
      fim.setMonth(fim.getMonth() + d.servicos.prazoVigenciaMeses)
      dataVencimentoOrVigencia = fim.toISOString().slice(0, 10)
    } else {
      dataVencimentoOrVigencia = d.cpr?.dataVencimento ?? d.parcelas?.[d.parcelas.length - 1]?.vencimento
    }

    return {
      id,
      tipo: d.tipo,
      titulo: meta.titulo,
      dataGeracao: new Date().toISOString(),
      dataVencimentoOrVigencia,
      partes: { devedor: d.devedor.nomeCompleto, credor: d.credor.nomeCompleto },
      valorTotal,
      conteudoMarkdown: conteudo,
      metadados: {
        clausulas,
        fundamentoLegal: meta.fundamento,
        necessarioRevisao: meta.revisao,
      },
    }
  }

  listarTipos(): Array<{ tipo: TipoContrato; titulo: string; fundamento: string[]; quando: string }> {
    return [
      {
        tipo: 'cpr_financeira',
        titulo: METADATA_POR_TIPO.cpr_financeira.titulo,
        fundamento: METADATA_POR_TIPO.cpr_financeira.fundamento,
        quando: 'Pré-venda de safra financeira. Produtor recebe dinheiro adiantado e paga em moeda no vencimento.',
      },
      {
        tipo: 'cpr_fisica',
        titulo: METADATA_POR_TIPO.cpr_fisica.titulo,
        fundamento: METADATA_POR_TIPO.cpr_fisica.fundamento,
        quando: 'Pré-venda de safra física. Produtor recebe dinheiro e entrega o produto no vencimento.',
      },
      {
        tipo: 'confissao_divida',
        titulo: METADATA_POR_TIPO.confissao_divida.titulo,
        fundamento: METADATA_POR_TIPO.confissao_divida.fundamento,
        quando: 'Consolidação de dívidas múltiplas com credor comercial/insumos em instrumento único parcelado.',
      },
      {
        tipo: 'termo_renegociacao',
        titulo: METADATA_POR_TIPO.termo_renegociacao.titulo,
        fundamento: METADATA_POR_TIPO.termo_renegociacao.fundamento,
        quando: 'Reestruturação de operação bancária de crédito rural (BB, Sicredi, Sicoob, bancos privados).',
      },
      {
        tipo: 'acordo_extrajudicial',
        titulo: METADATA_POR_TIPO.acordo_extrajudicial.titulo,
        fundamento: METADATA_POR_TIPO.acordo_extrajudicial.fundamento,
        quando: 'Composição de litígio (ação em curso ou iminente). Extingue controvérsia com concessões recíprocas.',
      },
      {
        tipo: 'transacao_excepcional',
        titulo: METADATA_POR_TIPO.transacao_excepcional.titulo,
        fundamento: METADATA_POR_TIPO.transacao_excepcional.fundamento,
        quando: 'Adesão a programa oficial da instituição credora (ex: Desenrola Rural, refinanciamentos estruturados).',
      },
      {
        tipo: 'prestacao_servicos_aletis',
        titulo: METADATA_POR_TIPO.prestacao_servicos_aletis.titulo,
        fundamento: METADATA_POR_TIPO.prestacao_servicos_aletis.fundamento,
        quando: 'Formalização da contratação da ALETIS pelo cliente. Serviço de consultoria em estruturação financeira (obrigação de meio) — honorários fixos, mensais, de êxito ou híbridos.',
      },
    ]
  }
}

export const contratoGenerator = new ContratoGenerator()

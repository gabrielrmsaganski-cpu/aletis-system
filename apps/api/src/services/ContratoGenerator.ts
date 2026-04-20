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
      default:
        throw new Error(`Tipo ${d.tipo} não implementado`)
    }

    const clausulas = (conteudo.match(/^## [IVX]+/gm) ?? []).length
    const valorTotal =
      d.cpr?.valorTotal ?? d.divida?.valorAtualizado ?? (d.parcelas?.reduce((a, p) => a + p.valor, 0) ?? 0)

    const id = `ctr-${d.tipo.slice(0, 4)}-${Date.now().toString(36)}`

    return {
      id,
      tipo: d.tipo,
      titulo: meta.titulo,
      dataGeracao: new Date().toISOString(),
      dataVencimentoOrVigencia: d.cpr?.dataVencimento ?? d.parcelas?.[d.parcelas.length - 1]?.vencimento,
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
    ]
  }
}

export const contratoGenerator = new ContratoGenerator()

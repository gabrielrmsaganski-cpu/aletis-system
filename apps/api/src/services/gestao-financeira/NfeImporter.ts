// ============================================================
// NfeImporter — parser de XML NF-e (SEFAZ Brasil) para popular
// receitas/produtos no sistema de gestão financeira.
// ============================================================
// NF-e padrão SEFAZ tem estrutura:
//   <nfeProc>
//     <NFe>
//       <infNFe>
//         <ide>
//           <nNF>123</nNF>
//           <dhEmi>2025-08-15T...</dhEmi>
//           <natOp>Venda de produção do estabelecimento</natOp>
//         </ide>
//         <emit>...emitente...</emit>
//         <dest>...destinatário...</dest>
//         <det nItem="1">
//           <prod>
//             <cProd>SOJA001</cProd>
//             <xProd>Soja em Grão</xProd>
//             <CFOP>5101</CFOP>
//             <uCom>SACA</uCom>
//             <qCom>1500</qCom>
//             <vUnCom>135.00</vUnCom>
//             <vProd>202500.00</vProd>
//           </prod>
//         </det>
//         <total>
//           <ICMSTot>
//             <vNF>...</vNF>
//           </ICMSTot>
//         </total>
//       </infNFe>
//     </NFe>
//   </nfeProc>
// ============================================================

export interface NfeProduto {
  nItem: number
  cProd: string
  xProd: string
  cfop: string
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
}

export interface NfeParsed {
  numeroNF?: string
  serie?: string
  dataEmissao?: string
  natOperacao?: string
  emitente?: { cnpj?: string; razaoSocial?: string; uf?: string }
  destinatario?: { cnpjCpf?: string; razaoSocial?: string }
  produtos: NfeProduto[]
  valorTotal: number
  warnings: string[]
}

function grab(text: string, tag: string): string | undefined {
  // permite namespace prefix opcional
  const re = new RegExp(`<(?:[A-Za-z]+:)?${tag}\\b[^>]*>([^<]*)</(?:[A-Za-z]+:)?${tag}>`, 'i')
  const m = re.exec(text)
  return m ? m[1].trim() || undefined : undefined
}

function grabBlock(text: string, tag: string): string | undefined {
  const re = new RegExp(`<(?:[A-Za-z]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z]+:)?${tag}>`, 'i')
  const m = re.exec(text)
  return m ? m[1] : undefined
}

function grabAllBlocks(text: string, tag: string): Array<{ inner: string; attrs: string }> {
  const re = new RegExp(`<(?:[A-Za-z]+:)?${tag}\\b([^>]*)>([\\s\\S]*?)</(?:[A-Za-z]+:)?${tag}>`, 'gi')
  const out: Array<{ inner: string; attrs: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ attrs: m[1] ?? '', inner: m[2] })
  }
  return out
}

export function parseNfe(xml: string): NfeParsed {
  const warnings: string[] = []
  // Remove BOM e espaços
  let txt = xml.replace(/^﻿/, '').trim()

  const ide = grabBlock(txt, 'ide') ?? ''
  const emit = grabBlock(txt, 'emit') ?? ''
  const dest = grabBlock(txt, 'dest') ?? ''
  const totalBlock = grabBlock(txt, 'ICMSTot') ?? grabBlock(txt, 'total') ?? ''

  const numeroNF = grab(ide, 'nNF')
  const serie = grab(ide, 'serie')
  const dataEmissao = grab(ide, 'dhEmi') ?? grab(ide, 'dEmi')
  const natOperacao = grab(ide, 'natOp')

  const emitente = {
    cnpj: grab(emit, 'CNPJ'),
    razaoSocial: grab(emit, 'xNome'),
    uf: grab(emit, 'UF') ?? grab(grabBlock(emit, 'enderEmit') ?? '', 'UF'),
  }

  const destinatario = {
    cnpjCpf: grab(dest, 'CNPJ') ?? grab(dest, 'CPF'),
    razaoSocial: grab(dest, 'xNome'),
  }

  const detBlocks = grabAllBlocks(txt, 'det')
  const produtos: NfeProduto[] = []
  for (const det of detBlocks) {
    const prodBlock = grabBlock(det.inner, 'prod')
    if (!prodBlock) continue
    const nItemMatch = det.attrs.match(/nItem="(\d+)"/)
    const nItem = nItemMatch ? parseInt(nItemMatch[1], 10) : produtos.length + 1
    const qCom = parseFloat(grab(prodBlock, 'qCom') ?? '0')
    const vUnCom = parseFloat(grab(prodBlock, 'vUnCom') ?? '0')
    const vProd = parseFloat(grab(prodBlock, 'vProd') ?? '0')
    if (!isFinite(qCom) || !isFinite(vUnCom)) {
      warnings.push(`Item ${nItem}: quantidade ou preço inválido`)
      continue
    }
    produtos.push({
      nItem,
      cProd: grab(prodBlock, 'cProd') ?? '',
      xProd: grab(prodBlock, 'xProd') ?? '',
      cfop: grab(prodBlock, 'CFOP') ?? '',
      unidade: grab(prodBlock, 'uCom') ?? '',
      quantidade: qCom,
      valorUnitario: vUnCom,
      valorTotal: isFinite(vProd) ? vProd : qCom * vUnCom,
    })
  }

  const valorTotal = parseFloat(grab(totalBlock, 'vNF') ?? '0')

  return {
    numeroNF,
    serie,
    dataEmissao,
    natOperacao,
    emitente,
    destinatario,
    produtos,
    valorTotal,
    warnings,
  }
}

/** Detecta cultura provável a partir do nome do produto. */
const CULTURA_KEYWORDS: Array<{ test: RegExp; cultura: string }> = [
  { test: /soja/i, cultura: 'Soja Sequeiro' },
  { test: /milho/i, cultura: 'Milho' },
  { test: /caf[ée]/i, cultura: 'Café' },
  { test: /arroz/i, cultura: 'Arroz' },
  { test: /trigo/i, cultura: 'Trigo' },
  { test: /cana|a[çc][uú]car|etanol/i, cultura: 'Cana de Açúcar' },
  { test: /algod[ãa]o/i, cultura: 'Algodão' },
  { test: /boi|gado|bovino|carne/i, cultura: 'Pecuária' },
  { test: /leite/i, cultura: 'Leite' },
  { test: /sorgo/i, cultura: 'Sorgo' },
]

export function detectarCulturaProduto(xProd: string): string | null {
  for (const k of CULTURA_KEYWORDS) {
    if (k.test.test(xProd)) return k.cultura
  }
  return null
}

/** Detecta se é venda (CFOP 5xxx) ou outra operação */
export function isVendaCfop(cfop: string): boolean {
  return /^5/.test(cfop) || /^6/.test(cfop) || /^7/.test(cfop)
}

export interface NfeResumoPorCultura {
  cultura: string
  produtos: number
  quantidadeTotal: number
  valorTotal: number
  precoMedio: number
  unidade: string
  exemplos: string[]
}

export function resumirNfePorCultura(parsedList: NfeParsed[]): NfeResumoPorCultura[] {
  const map = new Map<string, NfeResumoPorCultura>()
  for (const nfe of parsedList) {
    for (const p of nfe.produtos) {
      if (!isVendaCfop(p.cfop)) continue
      const cultura = detectarCulturaProduto(p.xProd) ?? 'Outros produtos'
      const cur = map.get(cultura) ?? {
        cultura,
        produtos: 0,
        quantidadeTotal: 0,
        valorTotal: 0,
        precoMedio: 0,
        unidade: p.unidade,
        exemplos: [],
      }
      cur.produtos += 1
      cur.quantidadeTotal += p.quantidade
      cur.valorTotal += p.valorTotal
      if (!cur.unidade) cur.unidade = p.unidade
      if (cur.exemplos.length < 3 && p.xProd) cur.exemplos.push(p.xProd.slice(0, 50))
      map.set(cultura, cur)
    }
  }
  const list = Array.from(map.values())
  for (const r of list) {
    r.precoMedio = r.quantidadeTotal > 0 ? r.valorTotal / r.quantidadeTotal : 0
  }
  return list.sort((a, b) => b.valorTotal - a.valorTotal)
}

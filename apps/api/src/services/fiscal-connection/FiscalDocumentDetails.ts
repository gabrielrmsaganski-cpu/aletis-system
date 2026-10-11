import { z } from 'zod'
import type { FiscalDocumentDetails } from '@aletis/shared-types'

const text = z.string().max(20000)
const decimal = z.string().regex(/^\d{1,15}(?:\.\d{1,10})?$/)
export const fiscalDetailsSchema = z.object({
  versao: z.literal(1), numero: text.optional(), serie: text.optional(), natureza: text.optional(), finalidade: text.optional(), tipoOperacao: text.optional(),
  situacao: z.enum(['autorizada','cancelada','denegada','nao_informada']), protocolo: text.optional(), codigoStatus: text.optional(), eventoTipo: text.optional(), eventoDescricao: text.optional(),
  emitenteUF: text.optional(), destinatarioUF: text.optional(), emitenteIE: text.optional(), destinatarioIE: text.optional(),
  totais: z.record(decimal),
  itens: z.array(z.object({numero:text,codigo:text.optional(),descricao:text.optional(),ncm:text.optional(),cfop:text.optional(),unidade:text.optional(),quantidade:decimal.optional(),valorUnitario:decimal.optional(),total:decimal.optional()})).max(990),
  parcelas: z.array(z.object({numero:text.optional(),vencimento:text.optional(),valor:decimal.optional()})).max(120),
  transporte: z.object({modalidade:text.optional(),nome:text.optional(),documento:text.optional(),placa:text.optional(),uf:text.optional(),pesoBruto:decimal.optional(),pesoLiquido:decimal.optional()}).optional(),
  informacoes:text.optional(),
})

const ns = 'http://www.portalfiscal.inf.br/nfe'
const one = (node: Element | undefined, name: string) => Array.from(node?.children ?? []).find(e => e.localName === name && e.namespaceURI === ns)
const many = (node: Element | undefined, name: string) => Array.from(node?.children ?? []).filter(e => e.localName === name && e.namespaceURI === ns)
const value = (node: Element | undefined, name: string) => one(node,name)?.textContent?.trim().slice(0,20000) || undefined
const number = (node: Element | undefined, name: string) => { const v=value(node,name); return v && decimal.safeParse(v).success ? v : undefined }

/** Metadados documentais; não inferem pagamento, dívida ou receita contábil. O DOM já passou pelos limites do conector. */
export function extractFiscalDetails(root: Element, kind: string): FiscalDocumentDetails {
  const result: FiscalDocumentDetails = {versao:1,situacao:'nao_informada',totais:{},itens:[],parcelas:[]}
  if(kind==='nfe_summary') {
    result.situacao=({1:'autorizada',2:'denegada',3:'cancelada'} as const)[value(root,'cSitNFe') as '1'] ?? 'nao_informada'
    result.protocolo=value(root,'nProt')
  } else if(kind==='event'||kind==='event_summary') {
    const event=kind==='event'?one(one(root,'evento'),'infEvento'):root
    const response=kind==='event'?one(one(root,'retEvento'),'infEvento'):root
    result.eventoTipo=value(event,'tpEvento'); result.eventoDescricao=value(one(event,'detEvento'),'descEvento')??value(root,'xEvento')
    result.codigoStatus=value(response,'cStat');result.protocolo=value(response,'nProt')
    // Somente eventos aceitos e vinculados podem indicar cancelamento da nota.
    if(['110111','110112'].includes(result.eventoTipo??'') && (kind==='event_summary'||['135','155'].includes(result.codigoStatus??'')))result.situacao='cancelada'
  } else if(kind==='nfe') {
    const info=one(one(root,'NFe'),'infNFe'),ide=one(info,'ide'),emit=one(info,'emit'),dest=one(info,'dest'),prot=one(one(root,'protNFe'),'infProt')
    result.numero=value(ide,'nNF');result.serie=value(ide,'serie');result.natureza=value(ide,'natOp');result.finalidade=value(ide,'finNFe');result.tipoOperacao=value(ide,'tpNF')
    result.protocolo=value(prot,'nProt');result.codigoStatus=value(prot,'cStat')
    result.situacao=['100','150'].includes(result.codigoStatus??'')?'autorizada':['101','151','155'].includes(result.codigoStatus??'')?'cancelada':['110','301','302','303'].includes(result.codigoStatus??'')?'denegada':'nao_informada'
    result.emitenteUF=value(one(emit,'enderEmit'),'UF');result.destinatarioUF=value(one(dest,'enderDest'),'UF');result.emitenteIE=value(emit,'IE');result.destinatarioIE=value(dest,'IE')
    const totals=one(one(info,'total'),'ICMSTot')
    for(const field of ['vBC','vICMS','vICMSDeson','vFCP','vBCST','vST','vFCPST','vProd','vFrete','vSeg','vDesc','vII','vIPI','vPIS','vCOFINS','vOutro','vNF','vTotTrib']) {const v=number(totals,field);if(v!==undefined)result.totais[field]=v}
    result.itens=many(info,'det').slice(0,990).map(det=>{const prod=one(det,'prod');return {numero:det.getAttribute('nItem')??'',codigo:value(prod,'cProd'),descricao:value(prod,'xProd'),ncm:value(prod,'NCM'),cfop:value(prod,'CFOP'),unidade:value(prod,'uCom'),quantidade:number(prod,'qCom'),valorUnitario:number(prod,'vUnCom'),total:number(prod,'vProd')}})
    result.parcelas=many(one(info,'cobr'),'dup').slice(0,120).map(dup=>({numero:value(dup,'nDup'),vencimento:value(dup,'dVenc'),valor:number(dup,'vDup')}))
    const transport=one(info,'transp'),carrier=one(transport,'transporta'),vehicle=one(transport,'veicTransp'),vol=one(transport,'vol')
    if(transport)result.transporte={modalidade:value(transport,'modFrete'),nome:value(carrier,'xNome'),documento:value(carrier,'CNPJ')??value(carrier,'CPF'),placa:value(vehicle,'placa'),uf:value(vehicle,'UF'),pesoBruto:number(vol,'pesoB'),pesoLiquido:number(vol,'pesoL')}
    result.informacoes=[value(one(info,'infAdic'),'infCpl'),value(one(info,'infAdic'),'infAdFisco')].filter(Boolean).join('\n').slice(0,20000)||undefined
  }
  return fiscalDetailsSchema.parse(result)
}

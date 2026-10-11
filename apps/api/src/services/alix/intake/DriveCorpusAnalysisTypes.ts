import { createHash } from 'node:crypto'
import { z } from 'zod'

export const DRIVE_ANALYZER_VERSION = '2026-09-08-v1'
export const analysisHash = (value: string) => createHash('sha256').update(value).digest('hex')
export const analysisCategory = z.enum(['identity','contact','finance','property','deadline','obligation','other'])
export const driveAnalysisCandidate = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/), label: z.string().min(1).max(120), category: analysisCategory,
  value: z.string().min(1).max(1000), subject: z.string().max(180).default(''), context: z.string().max(180).default(''),
  status: z.literal('pending_review'),
  evidence: z.object({ chunkId:z.string(), quoteHash:z.string().regex(/^[a-f0-9]{64}$/), excerpt:z.string().min(3).max(2200),
    excerptHash:z.string().regex(/^[a-f0-9]{64}$/), ordinal:z.number().int().nonnegative(), page:z.number().int().positive().optional(), sheet:z.string().optional() }),
})
export type DriveAnalysisCandidate = z.infer<typeof driveAnalysisCandidate>
export const driveAnalysisPayload = z.object({ candidates:z.array(driveAnalysisCandidate).max(256), documentTypes:z.array(z.string().max(80)).max(32).default([]), rejectedCandidates:z.number().int().nonnegative().default(0) })
export const analysisModelOutput = z.object({ documentType:z.string().min(1).max(80), candidates:z.array(z.object({
  label:z.string().min(1).max(120), category:analysisCategory, value:z.string().min(1).max(1000),
  subject:z.string().max(180).default(''), context:z.string().max(180).default(''), evidenceText:z.string().min(3).max(1800),
})).max(16) })
export interface DriveAnalysisJob { analysisId:string; tenantId:string; clienteId:string; pass:number; jobId?:string }
export interface AnalysisChunk { id:string; ordinal:number; text:string; page?:number|null; sheet?:string|null }

const normalized = (value:string) => value.normalize('NFC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('pt-BR')
export function driveExcerptContainsValue(excerpt:string,value:string):boolean {
  const haystack=normalized(excerpt),needle=normalized(value)
  if(!needle)return false
  let start=haystack.indexOf(needle)
  while(start>=0){
    const before=haystack.slice(0,start),after=haystack.slice(start+needle.length)
    const cutsWord=/[\p{L}\p{M}\p{N}_]$/u.test(before)&&/^[\p{L}\p{M}\p{N}_]/u.test(needle)
      || /[\p{L}\p{M}\p{N}_]$/u.test(needle)&&/^[\p{L}\p{M}\p{N}_]/u.test(after)
    const cutsNumber=/^\d/u.test(needle)&&/(?:[+−-]\s*|\d[.,:/-])$/u.test(before)
      || /\d$/u.test(needle)&&/^[.,:/-]\d/u.test(after)
    if(!cutsWord&&!cutsNumber)return true
    start=haystack.indexOf(needle,start+1)
  }
  return false
}
function literalExcerpt(text:string, quote:string):string|null {
  if (text.includes(quote)) return quote
  const pattern=quote.trim().split(/\s+/u).map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+')
  const match=new RegExp(pattern,'u').exec(text)
  return match?.[0] && match[0].length<=2200 ? match[0] : null
}

/** O modelo propõe; somente texto localizado na fonte pode virar candidato de revisão. */
export function groundDriveAnalysis(output:unknown,chunk:AnalysisChunk) {
  const result=analysisModelOutput.parse(output)
  let rejected=0
  const candidates=result.candidates.flatMap(item=>{
    const excerpt=literalExcerpt(chunk.text,item.evidenceText)
    if(!excerpt || !driveExcerptContainsValue(excerpt,item.value)) { rejected++; return [] }
    const subject=item.subject && normalized(chunk.text).includes(normalized(item.subject)) ? item.subject : ''
    const context=item.context && normalized(chunk.text).includes(normalized(item.context)) ? item.context : ''
    return [driveAnalysisCandidate.parse({ id:analysisHash(JSON.stringify([item.category,item.label,item.value,subject,context,chunk.id,excerpt])),
      label:item.label,category:item.category,value:item.value,subject,context,status:'pending_review',
      evidence:{chunkId:chunk.id,quoteHash:analysisHash(chunk.text),excerpt,excerptHash:analysisHash(excerpt),ordinal:chunk.ordinal,
        ...(chunk.page && chunk.page>0?{page:chunk.page}:{}),...(chunk.sheet?{sheet:chunk.sheet}:{})} })]
  })
  return {documentType:result.documentType,candidates,rejected}
}

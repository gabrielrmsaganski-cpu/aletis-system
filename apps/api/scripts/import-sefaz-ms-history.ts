import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Decimal from 'decimal.js'
import { z } from 'zod'
import { closeDb, getPool } from '../src/db/client.js'
import { fiscalDetailsSchema } from '../src/services/fiscal-connection/FiscalDocumentDetails.js'

const recordSchema = z.object({
  ano: z.number().int().min(2006).max(2100),
  tipo: z.enum(['destinatario', 'emitente']),
  idnfe: z.string().regex(/^\d{1,20}$/),
  nfe_chave_acesso: z.string().regex(/^\d{44}$/),
  nfe_ie_destinatario: z.string().max(30),
  nfe_razao_social_destinatario: z.string().max(400),
  nfe_cnpj_cpf_destinatario: z.string().regex(/^\d{11,14}$/),
  nfe_ie_emitente: z.string().max(30),
  nfe_razao_social_emitente: z.string().max(400),
  nfe_cnpj_cpf_emitente: z.string().regex(/^\d{11,14}$/),
  nfe_numero: z.string().regex(/^\d{1,20}$/),
  nfe_data_emissao: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  nfe_uf_destinatario: z.string().regex(/^[A-Z]{2}$/),
  nfe_uf_sigla_emitente: z.string().regex(/^[A-Z]{2}$/),
  nfe_vlr_total: z.string().max(40),
  nfe_bc_icms: z.string().max(40),
  nfe_vlr_total_icms: z.string().max(40),
  nfe_situacao: z.enum(['A', 'C', 'D']),
  nfe_possui_xml: z.enum(['true', 'false']),
}).strict()

const sourceSchema = z.object({
  fonte: z.literal('SEFAZ-MS e-Fazenda / Informações Fiscais'),
  geradoEm: z.string().datetime({ offset: true }),
  periodo: z.object({ inicio: z.string().date(), fim: z.string().date() }).strict(),
  resumo: z.array(z.object({
    ano: z.number().int(), tipo: z.enum(['destinatario', 'emitente']),
    registrosInformados: z.number().int().nonnegative(), registrosColetados: z.number().int().nonnegative(),
  }).strict()),
  registros: z.array(recordSchema).min(1).max(5000),
  inscricaoEstadual: z.string().max(30),
}).strict()

const xmlEscape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const brMoney = (value: string) => {
  const normalized = value.replaceAll('.', '').replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Valor monetário inválido na extração do e-Fazenda/MS.')
  return new Decimal(normalized).toFixed(2)
}
const isoDay = (value: string) => {
  const [day, month, year] = value.split('/')
  const result = `${year}-${month}-${day}`
  if (new Date(result + 'T00:00:00.000Z').toISOString().slice(0, 10) !== result) throw new Error('Data inválida na extração do e-Fazenda/MS.')
  return result
}
const idFor = (prefix: string, value: string) => `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
const portalNsu = (key: string) => {
  const hash = BigInt('0x' + createHash('sha256').update(key).digest('hex').slice(0, 16))
  return '9' + (hash % 100_000_000_000_000n).toString().padStart(14, '0')
}

async function main() {
  const input = process.argv[2]
  if (!input) throw new Error('Informe o JSON validado da extração do e-Fazenda/MS.')
  const source = sourceSchema.parse(JSON.parse(await readFile(resolve(input), 'utf8')))
  const keys = new Set(source.registros.map(record => record.nfe_chave_acesso))
  const expected = source.resumo.reduce((total, row) => total + row.registrosInformados, 0)
  if (keys.size !== source.registros.length || expected !== source.registros.length) throw new Error('A extração não passou pela conferência de total e chaves únicas.')
  if (source.registros.some(record => isoDay(record.nfe_data_emissao).slice(0, 4) !== String(record.ano))) throw new Error('A extração contém data fora do ano consultado.')

  const pool = getPool()
  const tx = await pool.connect()
  try {
    await tx.query('BEGIN')
    const credential = (await tx.query("SELECT id,cliente_id,documento FROM fiscal_credential WHERE cliente_id='cli-002' AND status='ativa' ORDER BY updated_at DESC LIMIT 1 FOR SHARE")).rows[0]
    if (!credential) throw new Error('Credencial fiscal ativa do cliente não encontrada.')
    const queryId = idFor('fq-msportal', `${credential.cliente_id}:${source.periodo.inicio}:${source.periodo.fim}`)
    const idempotencyKey = `sefaz-ms-portal:${source.periodo.inicio}:${source.periodo.fim}`
    await tx.query(`INSERT INTO fiscal_query(id,cliente_id,credential_id,status,message,code,document_count,idempotency_key,started_at,completed_at,modalidade,alvo)
      VALUES($1,$2,$3,'sucesso',$4,'SEFAZ_MS_PORTAL',$5,$6,$7,$7,'distribuicao',$8)
      ON CONFLICT(cliente_id,idempotency_key) DO UPDATE SET status='sucesso',message=excluded.message,code=excluded.code,
        document_count=excluded.document_count,completed_at=excluded.completed_at,alvo=excluded.alvo`,
      [queryId, credential.cliente_id, credential.id, `Histórico oficial importado do e-Fazenda/MS (${source.periodo.inicio} a ${source.periodo.fim}).`, source.registros.length, idempotencyKey, source.geradoEm, `${source.periodo.inicio}:${source.periodo.fim}`])

    let inserted = 0
    for (const record of source.registros) {
      const issuedAt = isoDay(record.nfe_data_emissao)
      const value = brMoney(record.nfe_vlr_total)
      const baseIcms = brMoney(record.nfe_bc_icms)
      const valueIcms = brMoney(record.nfe_vlr_total_icms)
      const situation = record.nfe_situacao === 'A' ? 'autorizada' : record.nfe_situacao === 'C' ? 'cancelada' : 'denegada'
      const details = fiscalDetailsSchema.parse({
        versao: 1, numero: record.nfe_numero, situacao: situation,
        emitenteUF: record.nfe_uf_sigla_emitente, destinatarioUF: record.nfe_uf_destinatario,
        emitenteIE: record.nfe_ie_emitente, destinatarioIE: record.nfe_ie_destinatario,
        totais: { vNF: value, vBC: baseIcms, vICMS: valueIcms }, itens: [], parcelas: [],
        informacoes: `Resumo histórico oficial do e-Fazenda/MS. XML original indicado pelo portal: ${record.nfe_possui_xml === 'true' ? 'sim' : 'não'}.`,
      })
      const payload = {
        kind: 'nfe_summary', key: record.nfe_chave_acesso,
        issuer: { documento: record.nfe_cnpj_cpf_emitente, nome: record.nfe_razao_social_emitente },
        recipient: { documento: record.nfe_cnpj_cpf_destinatario, nome: record.nfe_razao_social_destinatario },
        issuedAt, value,
        summary: `Resumo oficial do e-Fazenda/MS; situação ${situation}; XML original ${record.nfe_possui_xml === 'true' ? 'indicado como disponível' : 'não disponibilizado'}.`,
        details,
        origin: { source: 'sefaz_ms_efazenda', stateRecordId: record.idnfe, extractedAt: source.geradoEm, originalXmlAvailable: record.nfe_possui_xml === 'true' },
      }
      const xml = `<aletisFiscalSummary versao="1" fonte="SEFAZ-MS-e-Fazenda"><chave>${record.nfe_chave_acesso}</chave><idNFe>${record.idnfe}</idNFe><emissao>${issuedAt}</emissao><situacao>${situation}</situacao><emitente><documento>${record.nfe_cnpj_cpf_emitente}</documento><nome>${xmlEscape(record.nfe_razao_social_emitente)}</nome><ie>${xmlEscape(record.nfe_ie_emitente)}</ie><uf>${record.nfe_uf_sigla_emitente}</uf></emitente><destinatario><documento>${record.nfe_cnpj_cpf_destinatario}</documento><nome>${xmlEscape(record.nfe_razao_social_destinatario)}</nome><ie>${xmlEscape(record.nfe_ie_destinatario)}</ie><uf>${record.nfe_uf_destinatario}</uf></destinatario><totais><vNF>${value}</vNF><vBC>${baseIcms}</vBC><vICMS>${valueIcms}</vICMS></totais><xmlOriginalDisponivel>${record.nfe_possui_xml}</xmlOriginalDisponivel></aletisFiscalSummary>`
      const sha256 = createHash('sha256').update(xml).digest('hex')
      const result = await tx.query(`INSERT INTO fiscal_document(id,cliente_id,query_id,documento,nsu,schema_name,payload,xml,sha256,received_at,bridge_next_at,bridge_attempts)
        VALUES($1,$2,$3,$4,$5,'sefaz-ms-portal-summary-v1',$6::jsonb,$7,$8,$9,'infinity',0)
        ON CONFLICT(id) DO UPDATE SET query_id=excluded.query_id,payload=excluded.payload,xml=excluded.xml,sha256=excluded.sha256,received_at=excluded.received_at
        WHERE fiscal_document.schema_name='sefaz-ms-portal-summary-v1'`,
        [idFor('fd-msportal', record.nfe_chave_acesso), credential.cliente_id, queryId, credential.documento, portalNsu(record.nfe_chave_acesso), JSON.stringify(payload), xml, sha256, source.geradoEm])
      inserted += result.rowCount ?? 0
    }
    const years = [...new Set(source.registros.map(record => String(record.ano)))]
    const imported = (await tx.query("SELECT count(DISTINCT payload->>'key')::int total FROM fiscal_document WHERE cliente_id=$1 AND schema_name='sefaz-ms-portal-summary-v1' AND left(payload->>'issuedAt',4)=ANY($2::text[])", [credential.cliente_id, years])).rows[0].total
    if (imported !== source.registros.length) throw new Error(`A conferência no acervo encontrou ${imported} de ${source.registros.length} notas.`)
    await tx.query("INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES('sistema:sefaz-ms','fiscal_historico_estadual_importado',$1,$2)", [`cliente:${credential.cliente_id}`, JSON.stringify({ queryId, source: source.fonte, period: source.periodo, records: source.registros.length, inserted })])
    await tx.query('COMMIT')
    process.stdout.write(JSON.stringify({ queryId, records: source.registros.length, imported, inserted, years: years.map(Number).sort() }) + '\n')
  } catch (error) {
    await tx.query('ROLLBACK')
    throw error
  } finally {
    tx.release()
  }
}

main().catch(error => {
  process.stderr.write((error instanceof Error ? error.message : 'Falha na importação do histórico fiscal.') + '\n')
  process.exitCode = 1
}).finally(closeDb)

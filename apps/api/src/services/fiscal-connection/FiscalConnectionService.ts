import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { FISCAL_UFS, FISCAL_SERVICES, type FiscalConnectionData, type FiscalCredentialDTO, type FiscalQueryDTO, type FiscalDocumentDTO } from '@aletis/shared-types'
import { getPool, isPgEnabled } from '../../db/client.js'
import { FISCAL_CATALOG } from '../portal/PortalFiscalCatalog.js'
import { inspectCertificate, sealCertificate, openCertificate, isFiscalVaultConfigured } from './FiscalCertificateVault.js'
import { queryNfeDistribution, NfeDistributionError, normalizeNfeLookup } from './NfeDistributionConnector.js'
import { fiscalDetailsSchema } from './FiscalDocumentDetails.js'

export class FiscalConnectionError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code = 'FISCAL_CONNECTION_INVALID') { super(message) }
}
const idSchema = z.string().min(1).max(100).regex(/^[\w:-]+$/)
const keySchema = z.string().min(8).max(160).regex(/^[\w.:-]+$/)
const stampSchema = z.string().datetime({ offset: true })
const metadataSchema = z.object({
  documentType: z.enum(['CPF','CNPJ']), document: z.string().max(14), maskedDocument: z.string().max(40),
  subject: z.string().max(4000), issuer: z.string().max(4000), serialNumber: z.string().max(200), fingerprint256: z.string().max(200),
  validFrom: stampSchema, validTo: stampSchema, keyType: z.literal('rsa'), keyBits: z.number().int(),
  chainVerified: z.literal(true), revocationChecked: z.literal(false),
})
const docSchema = z.object({
  details: fiscalDetailsSchema.optional(),
  kind: z.enum(['nfe_summary','nfe','event_summary','event']), key: z.string().max(44).optional(),
  issuer: z.object({ documento: z.string().max(14).optional(), nome: z.string().max(400).optional() }).optional(),
  recipient: z.object({ documento: z.string().max(14).optional(), nome: z.string().max(400).optional() }).optional(),
  issuedAt: z.string().max(40).optional(), value: z.string().regex(/^\d{1,15}\.\d{2}$/).optional(), summary: z.string().max(2000).optional(),
})
const iso = (v: string | Date) => new Date(v).toISOString()
const optionalIso = (v: string | Date | null) => v ? iso(v) : undefined
export function fiscalDocument(value: string): string {
  const normalized = value.toUpperCase().replace(/[.\s\/-]/g, '')
  if (!/^(?:\d{11}|[A-Z0-9]{12}\d{2})$/.test(normalized)) throw new FiscalConnectionError('Informe um CPF ou CNPJ completo, igual ao cadastro do cliente.')
  return normalized
}
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, any>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new FiscalConnectionError('Os dados estão incompletos ou inválidos. Confira os campos e tente novamente.')
  return result.data
}
type Row = Record<string, any>
interface Options {
  pool?: Pool; pgEnabled?: () => boolean; now?: () => number; configured?: () => Promise<boolean>;
  inspect?: typeof inspectCertificate; seal?: typeof sealCertificate; open?: typeof openCertificate; query?: typeof queryNfeDistribution;
}

/** PG é a única autoridade. Material privado jamais é copiado para Maps, logs ou o acervo. */
export class FiscalConnectionService {
  constructor(private readonly options: Options = {}) {}
  private now() { return (this.options.now ?? Date.now)() }
  private pool() {
    if (!(this.options.pgEnabled ?? isPgEnabled)()) throw new FiscalConnectionError('Conexão fiscal temporariamente indisponível.', 503)
    return this.options.pool ?? getPool()
  }
  private caFile() { return process.env.ALETIS_FISCAL_CA_FILE || '/etc/aletis/fiscal/icp-brasil.pem' }
  private keyFile() { return process.env.ALETIS_FISCAL_VAULT_KEY_FILE || '/etc/aletis/fiscal/vault.key' }
  async configured() {
    if (this.options.configured) return this.options.configured()
    return isFiscalVaultConfigured({caFile:this.caFile(),keyFile:this.keyFile()})
  }
  private async transaction<T>(work: (tx: PoolClient) => Promise<T>) {
    const tx = await this.pool().connect()
    try { await tx.query('BEGIN'); const result = await work(tx); await tx.query('COMMIT'); return result }
    catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
  }
  private async audit(tx: PoolClient, clienteId: string, actor: string, action: string, data: { credentialId?: string; queryId?: string; status?: string; automation?: boolean; count?: number }) {
    await tx.query('INSERT INTO audit_log(ator,acao,recurso,dados_depois) VALUES($1,$2,$3,$4)', [actor, 'fiscal_' + action, 'cliente:' + clienteId, JSON.stringify(data)])
  }
  private async assertIdentity(tx: Pool | PoolClient, clienteId: string, documento: string) {
    const row = (await tx.query("SELECT payload FROM cliente WHERE id=$1 AND (payload->'identityMerge'->>'status') IS DISTINCT FROM 'merged'", [clienteId])).rows[0]
    if (!row) throw new FiscalConnectionError('Cliente não encontrado.', 404)
    if (typeof row.payload?.cpfCnpj !== 'string' || fiscalDocument(row.payload.cpfCnpj) !== documento) throw new FiscalConnectionError('O titular do certificado precisa coincidir com o CPF/CNPJ completo do cliente no CRM. Peça à equipe para conferir o cadastro.', 422, 'FISCAL_IDENTITY_MISMATCH')
  }
  private credential(row: Row): FiscalCredentialDTO {
    const meta = metadataSchema.parse(row.metadata)
    const expired = Date.parse(meta.validTo) <= this.now()
    return { id: row.id, titular: meta.subject, documentoMascarado: meta.maskedDocument, uf: row.uf,
      status: row.status === 'suspensa' ? 'suspensa' : expired ? 'expirada' : 'ativa', validadeInicio: meta.validFrom, validadeFim: meta.validTo,
      automacaoAtiva: row.automacao && row.status === 'ativa' && !expired, verificadaNoOrgao: Boolean(row.credential_success),
      ultimaConsultaEm: optionalIso(row.last_attempt_at), ultimoSucessoEm: optionalIso(row.last_success_at),
      proximaConsultaEm: optionalIso(row.next_allowed_at), proximaConsultaPontualEm:optionalIso(row.target_next_at), atualizadoEm: iso(row.updated_at) }
  }
  private run(row: Row): FiscalQueryDTO {
    return { id: row.id, credencialId: row.credential_id, status: row.status, mensagem: row.message, codigo: row.code ?? undefined,
      modalidade:row.modalidade??'distribuicao',alvo:row.alvo??undefined,iniciadaEm: iso(row.started_at), concluidaEm: optionalIso(row.completed_at), documentosRecebidos: row.document_count }
  }
  private document(row: Row): FiscalDocumentDTO {
    const p = docSchema.parse(row.payload)
    return { id: row.id, chave: p.key, nsu: row.nsu??'', tipo: p.kind === 'nfe' ? 'nfe' : p.kind === 'nfe_summary' ? 'resumo' : 'evento',
      emitente: p.issuer?.nome ?? p.issuer?.documento, destinatario: p.recipient?.nome ?? p.recipient?.documento,
      emissao: p.issuedAt, valor: p.value, recebidoEm: iso(row.received_at), arquivoNome: `SEFAZ-${p.kind}-${row.nsu??row.id}.xml`, portalUploadId: row.portal_upload_id ?? undefined, processamento:row.portal_upload_id||row.schema_name==='sefaz-ms-portal-summary-v1'?'encaminhado':row.bridge_attempts>=5?'erro':'pendente' }
  }
  async list(clienteId: string): Promise<FiscalConnectionData> {
    const pool = this.pool()
    const [credentials, queries, documents, configured, totals, cursors] = await Promise.all([
      pool.query(`SELECT c.*,s.last_attempt_at,s.last_success_at,s.next_allowed_at,s.target_next_at,
        COALESCE((SELECT q.status IN ('sucesso','sem_documentos') FROM fiscal_query q WHERE q.credential_id=c.id AND q.status<>'executando' ORDER BY q.started_at DESC,q.id DESC LIMIT 1),false) credential_success
        FROM fiscal_credential c LEFT JOIN fiscal_nfe_cursor s ON s.documento=c.documento AND s.cliente_id=c.cliente_id
        WHERE c.cliente_id=$1 ORDER BY c.created_at DESC LIMIT 50`, [clienteId]),
      pool.query('SELECT * FROM fiscal_query WHERE cliente_id=$1 ORDER BY started_at DESC,id DESC LIMIT 50', [clienteId]),
      pool.query('SELECT id,payload,nsu,schema_name,received_at,portal_upload_id,bridge_attempts FROM fiscal_document WHERE cliente_id=$1 ORDER BY received_at DESC,id DESC LIMIT 100', [clienteId]), this.configured(),
      pool.query('SELECT count(*)::int n FROM fiscal_document WHERE cliente_id=$1',[clienteId]),
      pool.query('SELECT ult_nsu,max_nsu,next_allowed_at,sync_requested FROM fiscal_nfe_cursor WHERE cliente_id=$1',[clienteId]),
    ])
    const credenciais = credentials.rows.map(row => this.credential(row))
    const connected = credenciais.some(c => c.status === 'ativa' && c.verificadaNoOrgao)
    const cursor=cursors.rows[0]
    return { configurado: configured, credenciais, consultas: queries.rows.map(row => this.run(row)), documentos: documents.rows.map(row => this.document(row)), atualizadoEm: new Date(this.now()).toISOString(),
      totalDocumentos:totals.rows[0].n,sincronizacao:cursor?{ultimoNsu:cursor.ult_nsu,maiorNsu:cursor.max_nsu,emDia:cursor.ult_nsu===cursor.max_nsu,emAndamento:cursor.sync_requested,proximaConsultaEm:iso(cursor.next_allowed_at)}:undefined,
      avisos: ['Consulta exclusiva de distribuição de NF-e do titular, conforme documentos disponibilizados pelo Ambiente Nacional. Não representa certidão de regularidade nem consulta de débitos.',
        'O serviço pode fornecer resumos em vez do XML completo. Não fazemos manifestação do destinatário ou ciência para liberar documentos.',
        'A distribuição tem janela de até 90 dias e não garante acervo retroativo para novos usuários. Outros sistemas do mesmo CPF/CNPJ precisam coordenar a sequência de consultas.',
        'A busca do acervo consulta todos os documentos recebidos. O histórico completo está disponível por páginas.',
        ...(configured ? [] : ['O recebimento do certificado aguarda a configuração do cofre pela equipe.'])],
      cobertura: FISCAL_CATALOG.map(state => ({ uf: state.uf, nome: state.nome, portalUrl: state.portalUrl, servicos: [
        { id: 'nfe_distribuicao', nome: 'Distribuição nacional de NF-e', status: connected ? 'conectado' : 'disponivel', descricao: 'Consulta nacional com certificado A1 do próprio titular. A disponibilidade de documentos é decidida pelo órgão.' },
        ...Object.entries(FISCAL_SERVICES).filter(([id]) => id !== 'notas').map(([id,nome]) => ({ id, nome, status: 'portal_oficial' as const, descricao: 'Consultar no portal oficial com os poderes exigidos. Este serviço ainda não possui conector automatizado no ALETIS.' })),
      ] })) }
  }
  async receive(clienteId: string, input: { file: Buffer; filename: string; fields: Record<string, unknown> }, key: unknown) {
    const body = parse(z.object({ senha: z.string().min(1).max(1024), uf: z.enum(FISCAL_UFS), documento: z.string().max(30), consentimento: z.literal('true') }).strict(), input.fields)
    const requestKey = parse(keySchema, key)
    if (!/\.(pfx|p12)$/i.test(input.filename) || input.file.length < 64 || input.file.length > 256 * 1024) throw new FiscalConnectionError('Envie um certificado A1 .pfx ou .p12 de até 256 KB.')
    if (!await this.configured()) throw new FiscalConnectionError('O cofre de certificados ainda não está disponível. Fale com a equipe.', 503)
    const documento = fiscalDocument(body.documento)
    await this.assertIdentity(this.pool(), clienteId, documento)
    const meta = metadataSchema.parse(await (this.options.inspect ?? inspectCertificate)(input.file, body.senha, { caFile: this.caFile(), now: new Date(this.now()) }))
    if (meta.document !== documento) throw new FiscalConnectionError('O certificado pertence a outro CPF/CNPJ. Envie o certificado do titular deste cadastro.', 422, 'FISCAL_IDENTITY_MISMATCH')
    const requestHash = createHash('sha256').update(input.file).update(JSON.stringify([documento,body.uf,'consulta-nfe-2026-09-13'])).digest('hex')
    const credentialId = 'fc-' + randomUUID()
    const envelope = await (this.options.seal ?? sealCertificate)({ pfx: input.file, password: body.senha, clienteId, credentialId }, { keyFile: this.keyFile() })
    return this.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['fiscal-receive:' + documento])
      await this.assertIdentity(tx, clienteId, documento)
      const old = (await tx.query('SELECT * FROM fiscal_credential WHERE cliente_id=$1 AND idempotency_key=$2', [clienteId,requestKey])).rows[0]
      if (old) { if (old.request_hash !== requestHash) throw new FiscalConnectionError('Este envio já foi usado. Inicie um novo envio.', 409); return { credencial: this.credential(old), replayed: true } }
      const cursor = (await tx.query('SELECT cliente_id FROM fiscal_nfe_cursor WHERE documento=$1', [documento])).rows[0]
      if (cursor && cursor.cliente_id !== clienteId) throw new FiscalConnectionError('Este titular já possui conexão em outro cadastro. A equipe precisa revisar a duplicidade.', 409)
      if ((await tx.query('SELECT count(*)::int n FROM fiscal_credential WHERE cliente_id=$1', [clienteId])).rows[0].n >= 50) throw new FiscalConnectionError('Limite de substituições atingido. Fale com a equipe.', 429)
      await tx.query("UPDATE fiscal_credential SET status='suspensa',envelope=NULL,automacao=false,updated_at=$2 WHERE documento=$1 AND status='ativa'", [documento,new Date(this.now())])
      await tx.query('INSERT INTO fiscal_nfe_cursor(documento,cliente_id) VALUES($1,$2) ON CONFLICT(documento) DO NOTHING', [documento,clienteId])
      const row = (await tx.query(`INSERT INTO fiscal_credential(id,cliente_id,documento,uf,status,metadata,envelope,valid_until,idempotency_key,request_hash,created_at,updated_at)
        VALUES($1,$2,$3,$4,'ativa',$5,$6,$7,$8,$9,$10,$10) RETURNING *`, [credentialId,clienteId,documento,body.uf,JSON.stringify(meta),JSON.stringify(envelope),meta.validTo,requestKey,requestHash,new Date(this.now())])).rows[0]
      await this.audit(tx,clienteId,'portal:'+clienteId,'certificado_recebido',{credentialId,status:'ativa',automation:false})
      return { credencial: this.credential(row), replayed: false }
    })
  }
  async change(clienteId: string, credentialId: string, input: unknown, actor: string, suspend: boolean) {
    parse(idSchema,credentialId)
    const body = parse(z.object({ expectedUpdatedAt: stampSchema, ativa: z.boolean().optional() }).strict(),input)
    if (!suspend && typeof body.ativa !== 'boolean') throw new FiscalConnectionError('Informe se deseja ativar o acompanhamento.')
    return this.transaction(async tx => {
      const row = (await tx.query('SELECT * FROM fiscal_credential WHERE id=$1 AND cliente_id=$2 FOR UPDATE',[credentialId,clienteId])).rows[0]
      if (!row) throw new FiscalConnectionError('Certificado não encontrado.',404)
      if (iso(row.updated_at) !== iso(body.expectedUpdatedAt)) throw new FiscalConnectionError('O certificado mudou. Atualize antes de continuar.',409)
      if (row.status !== 'ativa') throw new FiscalConnectionError('Envie um novo certificado para retomar o acesso suspenso.',409)
      if (!suspend && body.ativa && Date.parse(iso(row.valid_until)) <= this.now()) throw new FiscalConnectionError('O certificado venceu. Envie o novo certificado.',422)
      const stamp = new Date(Math.max(this.now(),Date.parse(iso(row.updated_at))+1))
      const updated = (await tx.query(suspend
        ? "UPDATE fiscal_credential SET status='suspensa',envelope=NULL,automacao=false,updated_at=$3 WHERE id=$1 AND cliente_id=$2 RETURNING *"
        : 'UPDATE fiscal_credential SET automacao=$4,updated_at=$3 WHERE id=$1 AND cliente_id=$2 RETURNING *',suspend?[credentialId,clienteId,stamp]:[credentialId,clienteId,stamp,body.ativa])).rows[0]
      if(suspend||body.ativa===false)await tx.query('UPDATE fiscal_nfe_cursor SET sync_requested=false WHERE documento=$1',[row.documento])
      await this.audit(tx,clienteId,actor,suspend?'certificado_suspenso':'automacao_alterada',{credentialId,status:updated.status,automation:updated.automacao})
      return this.credential(updated)
    })
  }
  async consult(clienteId: string, input: unknown, key: unknown, actor: string): Promise<FiscalQueryDTO> {
    const body = parse(z.object({ credencialId: idSchema, modalidade:z.enum(['distribuicao','chave','nsu']).default('distribuicao'), alvo:z.string().max(44).optional(),completa:z.boolean().optional() }).strict().refine(v=>v.modalidade==='distribuicao'?!v.alvo:!!v.alvo && (v.modalidade==='chave'?/^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/.test(v.alvo):/^[0-9]{1,15}$/.test(v.alvo)&&!/^0+$/.test(v.alvo))),input); const requestKey = parse(keySchema,key)
    const targeted=body.modalidade!=='distribuicao'
    const target=body.modalidade==='nsu'?body.alvo!.padStart(15,'0'):body.alvo
    if(targeted)try{normalizeNfeLookup({tipo:body.modalidade as 'chave'|'nsu',valor:target!})}catch(e){throw new FiscalConnectionError(e instanceof NfeDistributionError?e.message:'Consulta pontual inválida.')}
    const matches=(row:Row)=>row.credential_id===body.credencialId&&(row.modalidade??'distribuicao')===body.modalidade&&(row.alvo??undefined)===target
    const tx = await this.pool().connect(); let lock = ''; let queryId = ''; let credential: Row | undefined
    try {
      const previous = (await tx.query('SELECT * FROM fiscal_query WHERE cliente_id=$1 AND idempotency_key=$2',[clienteId,requestKey])).rows[0]
      if (previous) { if (!matches(previous)) throw new FiscalConnectionError('Chave de consulta já utilizada.',409); return this.run(previous) }
      credential = (await tx.query('SELECT * FROM fiscal_credential WHERE id=$1 AND cliente_id=$2',[body.credencialId,clienteId])).rows[0]
      if (!credential) throw new FiscalConnectionError('Certificado não encontrado.',404)
      const lockKey = 'fiscal-nfe:' + credential.documento
      if (!(await tx.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) locked',[lockKey])).rows[0].locked) throw new FiscalConnectionError('Já existe uma consulta em andamento para este titular.',409)
      lock = lockKey
      const replay = (await tx.query('SELECT * FROM fiscal_query WHERE cliente_id=$1 AND idempotency_key=$2',[clienteId,requestKey])).rows[0]
      if (replay) { if(!matches(replay))throw new FiscalConnectionError('Chave de consulta já utilizada.',409);return this.run(replay) }
      await tx.query('BEGIN')
      credential = (await tx.query('SELECT * FROM fiscal_credential WHERE id=$1 AND cliente_id=$2 FOR UPDATE',[body.credencialId,clienteId])).rows[0]
      if (!credential || credential.status !== 'ativa' || Date.parse(iso(credential.valid_until)) <= this.now()) throw new FiscalConnectionError('O certificado está suspenso ou venceu. Envie um certificado vigente.',422)
      await this.assertIdentity(tx,clienteId,credential.documento)
      const state = (await tx.query('SELECT * FROM fiscal_nfe_cursor WHERE documento=$1 AND cliente_id=$2 FOR UPDATE',[credential.documento,clienteId])).rows[0]
      if (!state) throw new FiscalConnectionError('Sequência de consultas indisponível. Fale com a equipe.',503)
      if (Date.parse(iso(targeted?state.target_next_at:state.next_allowed_at)) > this.now()) throw new FiscalConnectionError('Aguarde o próximo horário permitido, mostrado no painel. Isso evita bloqueio pelo órgão.',429,'FISCAL_COOLDOWN')
      if(targeted) {
        const recent=(await tx.query("SELECT count(*)::int n FROM fiscal_query q JOIN fiscal_credential c ON c.id=q.credential_id WHERE c.documento=$1 AND q.modalidade<>'distribuicao' AND q.started_at>$2",[credential.documento,new Date(this.now()-3600000)])).rows[0].n
        if(recent>=20)throw new FiscalConnectionError('Limite de 20 consultas pontuais por hora atingido. Aguarde antes de consultar novamente.',429,'FISCAL_COOLDOWN')
      }
      if (!await this.configured()) throw new FiscalConnectionError('Conexão fiscal temporariamente indisponível.',503)
      queryId = 'fq-' + randomUUID()
      await tx.query("INSERT INTO fiscal_query(id,cliente_id,credential_id,status,message,idempotency_key,started_at,modalidade,alvo) VALUES($1,$2,$3,'executando','Consulta em andamento no Ambiente Nacional.',$4,$5,$6,$7)",[queryId,clienteId,credential.id,requestKey,new Date(this.now()),body.modalidade,target??null])
      // Pausa é persistida ANTES da rede: crash/restart não causa repetição agressiva.
      await tx.query(`UPDATE fiscal_nfe_cursor SET ${targeted?'target_next_at':'next_allowed_at'}=$2,last_attempt_at=$3 WHERE documento=$1`,[credential.documento,new Date(this.now()+3600000),new Date(this.now())])
      if(!targeted&&body.completa)await tx.query('UPDATE fiscal_nfe_cursor SET sync_requested=true WHERE documento=$1',[credential.documento])
      await this.audit(tx,clienteId,actor,'consulta_iniciada',{credentialId:credential.id,queryId})
      await tx.query('COMMIT')
      let result: Awaited<ReturnType<typeof queryNfeDistribution>>
      const material = await (this.options.open ?? openCertificate)(credential.envelope,{clienteId,credentialId:credential.id},{keyFile:this.keyFile()})
      try {
        const checked = await (this.options.inspect ?? inspectCertificate)(material.pfx,material.passphrase,{caFile:this.caFile(),now:new Date(this.now())})
        if (checked.document !== credential.documento || checked.fingerprint256 !== metadataSchema.parse(credential.metadata).fingerprint256) throw new FiscalConnectionError('Identidade do certificado divergente. Envie novamente.',422)
        // Suspensão antes do envio impede o uso, inclusive se ocorreu durante a abertura do cofre.
        if (!(await tx.query("SELECT id FROM fiscal_credential WHERE id=$1 AND cliente_id=$2 AND status='ativa'",[credential.id,clienteId])).rowCount) throw new FiscalConnectionError('O acesso foi suspenso.',409)
        result = await (this.options.query ?? queryNfeDistribution)({pfx:material.pfx,passphrase:material.passphrase,documento:credential.documento,uf:credential.uf,ultNSU:state.ult_nsu,...(targeted?{consulta:{tipo:body.modalidade as 'chave'|'nsu',valor:target!}}:{})})
      } finally { material.dispose() }
      const success = ['137','138'].includes(result.statusCode)
      if (success && !targeted && (result.ultNSU < state.ult_nsu || result.maxNSU < result.ultNSU)) throw new FiscalConnectionError('O órgão retornou uma sequência divergente. A consulta será revista.',502)
      const parsedDocuments = result.documents.map(doc => ({ ...doc, payload: docSchema.parse(doc), hash: createHash('sha256').update(doc.xml).digest('hex') }))
      const status = result.statusCode === '138' ? 'sucesso' : result.statusCode === '137' ? 'sem_documentos' : result.statusCode === '656' ? 'bloqueada' : 'erro'
      const message = result.statusCode === '138' ? `${result.documents.length} documento(s) disponibilizado(s) pelo Ambiente Nacional. XML completo e resumo são identificados separadamente.`
        : result.statusCode === '137' ? 'O Ambiente Nacional não disponibilizou novos documentos nesta consulta. Isso não comprova ausência de notas, débitos ou pendências.'
        : result.statusCode === '656' ? 'O órgão aplicou um intervalo de espera. A automação foi pausada. Aguarde pelo menos uma hora e confira se outro sistema consulta este titular antes de retomar.'
        : `Consulta ${targeted?'pontual ':''}não concluída pelo órgão (código ${result.statusCode}): ${result.message}. Confira ${targeted?'a chave ou NSU, o vínculo do titular e a janela de disponibilidade':'a habilitação do titular e o estado da automação'} antes de retomar após o horário indicado.`
      await tx.query('BEGIN')
      let count = 0
      if (success) {
        for (const doc of parsedDocuments) {
          if (!targeted && (doc.nsu <= state.ult_nsu || doc.nsu > result.ultNSU)) throw new FiscalConnectionError('Sequência de documentos divergente.',502)
          const existing = (await tx.query('SELECT id,cliente_id,sha256,nsu FROM fiscal_document WHERE documento=$1 AND (nsu=$2 OR sha256=$3) ORDER BY (nsu=$2) DESC NULLS LAST LIMIT 1',[credential.documento,doc.nsu||null,doc.hash])).rows[0]
          if (existing && (existing.cliente_id !== clienteId || existing.sha256 !== doc.hash)) throw new FiscalConnectionError('Documento fiscal divergente da sequência recebida.',502)
          if(existing&&!existing.nsu&&doc.nsu)await tx.query('UPDATE fiscal_document SET nsu=$2 WHERE id=$1 AND cliente_id=$3',[existing.id,doc.nsu,clienteId])
          if (!existing) { await tx.query(`INSERT INTO fiscal_document(id,cliente_id,query_id,documento,nsu,schema_name,payload,xml,sha256,received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,['fd-'+randomUUID(),clienteId,queryId,credential.documento,doc.nsu||null,doc.schema,JSON.stringify(doc.payload),doc.xml,doc.hash,new Date(this.now())]); count++ }
        }
        if (!targeted) {
        // Só avança quando o lote inteiro foi persistido. XML inválido não provoca perda de NSU.
        await tx.query('UPDATE fiscal_nfe_cursor SET ult_nsu=$2,max_nsu=$3,last_success_at=$4,next_allowed_at=$5 WHERE documento=$1',[credential.documento,result.ultNSU,result.maxNSU,new Date(this.now()),new Date(this.now()+(result.statusCode==='138'&&result.ultNSU<result.maxNSU?60000:3600000))])
        await tx.query('UPDATE fiscal_nfe_cursor SET sync_requested=sync_requested AND $2 WHERE documento=$1',[credential.documento,result.statusCode==='138'&&result.ultNSU<result.maxNSU])
        } else { await tx.query('UPDATE fiscal_nfe_cursor SET target_next_at=$2,last_success_at=$2 WHERE documento=$1',[credential.documento,new Date(this.now())]) }
      }
      if (!success&&(!targeted||result.statusCode==='656')&&!['108','109'].includes(result.statusCode)) await tx.query('UPDATE fiscal_credential SET automacao=false,updated_at=greatest(updated_at+interval \'1 millisecond\',$2) WHERE id=$1',[credential.id,new Date(this.now())])
      if (!success) await tx.query(`UPDATE fiscal_nfe_cursor SET ${targeted?'target_next_at=greatest(target_next_at,$2)':'next_allowed_at=greatest(next_allowed_at,$2)'},sync_requested=false WHERE documento=$1`,[credential.documento,new Date(this.now()+3600000)])
      if(result.statusCode==='656')await tx.query('UPDATE fiscal_nfe_cursor SET target_next_at=greatest(target_next_at,$2),next_allowed_at=greatest(next_allowed_at,$2),sync_requested=false WHERE documento=$1',[credential.documento,new Date(this.now()+3600000)])
      const done = (await tx.query('UPDATE fiscal_query SET status=$3,message=$4,code=$5,document_count=$6,completed_at=$7 WHERE id=$1 AND cliente_id=$2 RETURNING *',[queryId,clienteId,status,message,result.statusCode,count,new Date(this.now())])).rows[0]
      await this.audit(tx,clienteId,actor,'consulta_concluida',{credentialId:credential.id,queryId,status,count})
      await tx.query('COMMIT'); return this.run(done)
    } catch (error) {
      await tx.query('ROLLBACK').catch(() => {})
      if (queryId) {
        const publicCode = error instanceof NfeDistributionError ? 'NFE_'+error.code : error instanceof z.ZodError ? 'FISCAL_RESPONSE_INVALID' : typeof (error as any)?.code === 'string' && /^(?:NFE|FISCAL)_[A-Z_]{1,80}$/.test((error as any).code) ? (error as any).code : 'FISCAL_QUERY_FAILED'
        const needsReview = !['NFE_TIMEOUT','NFE_TRANSPORT_ERROR','NFE_HTTP_ERROR','NFE_ABORTED'].includes(publicCode)
        await tx.query('BEGIN')
        if (credential) await tx.query(`UPDATE fiscal_nfe_cursor SET ${targeted?'target_next_at=greatest(target_next_at,$2)':'next_allowed_at=greatest(next_allowed_at,$2)'},sync_requested=false WHERE documento=$1`,[credential.documento,new Date(this.now()+3600000)])
        if (needsReview&&credential) await tx.query("UPDATE fiscal_credential SET automacao=false,updated_at=greatest(updated_at+interval '1 millisecond',$2) WHERE id=$1",[credential.id,new Date(this.now())])
        const failed = (await tx.query("UPDATE fiscal_query SET status='erro',message='Não foi possível concluir a consulta. O histórico foi preservado; confira o certificado, o estado da automação e o próximo horário permitido. Se o erro persistir, a equipe deve revisar a conexão.',code=$3,completed_at=$4 WHERE id=$1 AND cliente_id=$2 RETURNING *",[queryId,clienteId,publicCode,new Date(this.now())])).rows[0]
        if (failed) { await this.audit(tx,clienteId,actor,'consulta_falhou',{credentialId:body.credencialId,queryId,status:'erro'}); await tx.query('COMMIT'); return this.run(failed) }
        await tx.query('ROLLBACK')
      }
      throw error
    } finally { if (lock) await tx.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[lock]).catch(() => {}); tx.release() }
  }
  async download(clienteId: string, documentId: string, actor: string) {
    parse(idSchema,documentId)
    return this.transaction(async tx => {
      const row = (await tx.query('SELECT * FROM fiscal_document WHERE id=$1 AND cliente_id=$2',[documentId,clienteId])).rows[0]
      if (!row) throw new FiscalConnectionError('Documento não encontrado.',404)
      await this.audit(tx,clienteId,actor,'documento_baixado',{queryId:row.query_id})
      return { filename:this.document(row).arquivoNome, xml:row.xml as string }
    })
  }
  async tick() {
    if (!await this.configured()) return
    await this.transaction(async tx => {
      const interrupted=(await tx.query("UPDATE fiscal_query SET status='erro',message='A execução foi interrompida. A automação foi pausada; a equipe deve conferir a sequência antes de retomar.',code='FISCAL_INTERRUPTED',completed_at=now() WHERE status='executando' AND started_at<now()-interval '5 minutes' RETURNING id,cliente_id,credential_id")).rows
      for(const row of interrupted){
        await tx.query("UPDATE fiscal_credential SET automacao=false,updated_at=greatest(updated_at+interval '1 millisecond',now()) WHERE id=$1",[row.credential_id])
        await tx.query("UPDATE fiscal_nfe_cursor SET next_allowed_at=greatest(next_allowed_at,now()+interval '1 hour'),target_next_at=greatest(target_next_at,now()+interval '1 hour'),sync_requested=false WHERE documento=(SELECT documento FROM fiscal_credential WHERE id=$1)",[row.credential_id])
        await this.audit(tx,row.cliente_id,'sistema:fiscal','consulta_interrompida',{credentialId:row.credential_id,queryId:row.id,status:'erro'})
      }
    })
    const rows = (await this.pool().query("SELECT c.id,c.cliente_id FROM fiscal_credential c JOIN fiscal_nfe_cursor s ON s.documento=c.documento AND s.cliente_id=c.cliente_id WHERE c.status='ativa' AND (c.automacao=true OR s.sync_requested=true) AND c.valid_until>now() AND s.next_allowed_at<=now() ORDER BY s.next_allowed_at LIMIT 5")).rows
    for (const row of rows) { try { await this.consult(row.cliente_id,{credencialId:row.id},'auto-'+randomUUID(),'sistema:fiscal') } catch { /* O próximo ciclo respeita a trava e o intervalo persistido. */ } }
  }
}
export const fiscalConnectionService = new FiscalConnectionService()

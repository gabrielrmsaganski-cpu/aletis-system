import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { beforeAll,beforeEach,afterAll,describe,it,expect } from 'vitest'
import { FiscalArchiveService } from '../../src/services/fiscal-connection/FiscalArchiveService.js'

describe.skipIf(!process.env.ALETIS_PORTAL_FIXTURE_FILE)('acervo fiscal completo no CRM',()=>{
  const schema='fiscal_archive_'+randomUUID().replaceAll('-','');let admin:pg.Pool,pool:pg.Pool,service:FiscalArchiveService
  beforeAll(async()=>{
    const connectionString=(await readFile(process.env.ALETIS_PORTAL_FIXTURE_FILE!,'utf8')).trim(),u=new URL(connectionString)
    if(u.hostname!=='127.0.0.1'||u.port!=='55436'||u.pathname!=='/aletis_implementation_fixture')throw Error('Isolated fixture required')
    admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString,options:'-c search_path='+schema})
    await pool.query('CREATE TABLE portal_upload(id text PRIMARY KEY,cliente_id text,metadata jsonb);CREATE TABLE cliente(id text PRIMARY KEY);CREATE TABLE audit_log(ator text,acao text,recurso text,dados_depois jsonb)')
    for(const file of ['0048_fiscal_connections.sql','0049_fiscal_archive.sql'])await pool.query(await readFile(new URL('../../src/db/migrations/'+file,import.meta.url),'utf8'))
    service=new FiscalArchiveService(pool)
  })
  afterAll(async()=>{await pool?.end();if(admin){await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end()}})
  beforeEach(async()=>{
    await pool.query('TRUNCATE fiscal_document,fiscal_query,fiscal_credential,fiscal_nfe_cursor,audit_log,cliente CASCADE')
    await pool.query("INSERT INTO cliente VALUES('a'),('b');INSERT INTO fiscal_credential(id,cliente_id,documento,uf,status,metadata,envelope,valid_until,idempotency_key,request_hash) VALUES('c','a','12345678909','MS','ativa','{}','{}',now()+interval '1 year','key','hash');INSERT INTO fiscal_query(id,cliente_id,credential_id,status,message,idempotency_key) VALUES('q','a','c','sucesso','Consulta','q')")
  })
  const insert=async(id:string,kind='nfe',key=id,extra:Record<string,unknown>={},overrides:{bridge?:number;nsu?:string|null;upload?:string}={})=>{
    const payload={kind,key,issuer:{documento:'11222333000181',nome:'Fornecedor'},recipient:{documento:'12345678909',nome:'Titular'},issuedAt:'2026-09-01T12:00:00-03:00',value:'100.10',details:{versao:1,situacao:'autorizada',numero:id,totais:{vNF:'100.10'},itens:[],parcelas:[]},...extra}
    await pool.query('INSERT INTO fiscal_document(id,cliente_id,query_id,documento,nsu,schema_name,payload,xml,sha256,bridge_attempts,portal_upload_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,'a','q','12345678909',overrides.nsu===null?null:overrides.nsu??id.replace(/\D/g,'').padStart(15,'0'),'procNFe_v4.00.xsd',JSON.stringify(payload),'<nfe>documento sintético '+id+'</nfe>',id,overrides.bridge??0,overrides.upload??null])
  }
  it('pesquisa e pagina registros anteriores ao antigo limite de100',async()=>{
    for(let i=1;i<=125;i++)await insert('doc-'+i)
    const found=await service.search('a',{busca:'doc-1',limite:10});expect(found.total).toBe(37);expect(found.documentos).toHaveLength(10)
    const all=await service.search('a',{pagina:5});expect(all.total).toBe(125);expect(all.paginas).toBe(5);expect(all.documentos).toHaveLength(25)
    expect(all.resumo.valorRecebidas).toBe('12512.50')
  })
  it('conta a chave uma vez, exclui cancelamento aceito e nunca soma eventos',async()=>{
    await insert('doc-1','nfe','nota-A');await insert('doc-2','nfe_summary','nota-A');await insert('doc-3','nfe','nota-B')
    await insert('doc-4','event','nota-B',{details:{versao:1,situacao:'cancelada',eventoTipo:'110111',codigoStatus:'135',totais:{},itens:[],parcelas:[]}})
    const result=await service.search('a',{});expect(result.resumo).toMatchObject({registros:4,notasUnicas:2,canceladas:1,valorRecebidas:'100.10',semXml:0})
    expect(result.documentos.find(d=>d.id==='doc-3')?.situacao).toBe('cancelada')
    const detail=await service.detail('a','doc-2');expect(detail.documento.relacionadoCompletoId).toBe('doc-1');expect(detail.relacionados).toHaveLength(1)
  })
  it('filtros por produto, período, identidade, vínculo e valor consultam o servidor',async()=>{
    await insert('doc-1','nfe','key-1',{details:{versao:1,situacao:'autorizada',numero:'9548',totais:{},itens:[{numero:'1',descricao:'Semente de soja',cfop:'5102',ncm:'12011000'}],parcelas:[]}})
    for(const busca of ['soja','5102','12011000','9548','11222333000181'])expect((await service.search('a',{busca})).total).toBe(1)
    expect((await service.search('a',{inicio:'2026-09-02'})).total).toBe(0)
    expect((await service.search('a',{minimo:'100.11'})).total).toBe(0)
    expect((await service.search('a',{direcao:'emitida'})).total).toBe(0)
    expect((await service.search('a',{busca:'%'})).total).toBe(0)
    expect((await service.search('a',{busca:"' OR true --"})).total).toBe(0)
  })
  it('seleciona um ou vários anos e aplica o mesmo recorte ao Excel',async()=>{
    await insert('doc-2026','nfe','key-2026')
    await insert('doc-2024','nfe','key-2024',{issuedAt:'2024-03-15T12:00:00Z'})
    await insert('doc-2023','nfe','key-2023',{issuedAt:'2023-03-15T12:00:00Z'})
    expect((await service.search('a',{anos:'2024,2026'})).total).toBe(2)
    expect((await service.search('a',{anos:'2023'})).total).toBe(1)
    const file=await service.export('a',{anos:'2024,2026'},'xlsx','consultor'),wb=new ExcelJS.Workbook();await wb.xlsx.load(file.body as never)
    expect(file.filename).toMatch(/-2024-2026-/)
    expect(wb.getWorksheet('Painel')!.getCell('A11').result).toBe(2)
    expect(wb.getWorksheet('Guia')!.getColumn('E').values.join(' ')).toContain('2024,2026')
  })
  it('escopo de cliente cobre busca, detalhe, exportação, histórico e reenvio',async()=>{
    await insert('doc-1');expect((await service.search('b',{})).total).toBe(0)
    await expect(service.detail('b','doc-1')).rejects.toMatchObject({statusCode:404})
    await expect(service.retryBridge('b','doc-1','staff')).rejects.toMatchObject({statusCode:404})
    expect((await service.history('b',{})).total).toBe(0)
    const exported=await service.export('b',{},'csv','staff');expect(exported.body.toString()).not.toContain('Fornecedor')
  })
  it('valores monetários grandes continuam decimais exatos',async()=>{
    await insert('doc-1','nfe','key-1',{value:'9999999999999.99'});await insert('doc-2','nfe','key-2',{value:'0.01'})
    expect((await service.search('a',{})).resumo.valorRecebidas).toBe('10000000000000.00')
  })
  it('recusa filtros inválidos e não recebe SQL ou identidade pelo filtro',async()=>{
    for(const f of [{clienteId:'b'},{inicio:'2026-02-30'},{pagina:0},{limite:10000},{minimo:'NaN'},{anos:'2024,2024'},{anos:'2024,abc'},{inicio:'2026-09-20',fim:'2026-09-01'}])await expect(service.search('a',f)).rejects.toMatchObject({statusCode:400})
  })
  it('exporta todo filtro e preserva XML sem NSU com nomes distintos',async()=>{
    await insert('doc-1','nfe','key-1',{issuer:{nome:'=HYPERLINK("evil")',documento:'11222333000181'}},{nsu:null})
    await insert('doc-2','nfe','key-2',{}, {nsu:null})
    const csv=await service.export('a',{pagina:50},'csv','staff');expect(csv.body.toString()).toContain("'=HYPERLINK");expect(csv.body.toString().split('\r\n')).toHaveLength(3)
    const file=await service.export('a',{},'zip','staff'),zip=await JSZip.loadAsync(file.body)
    expect(Object.keys(zip.files).filter(n=>n.endsWith('.xml'))).toHaveLength(2)
    expect(await zip.file('SEFAZ-nfe-doc-1.xml')!.async('string')).toContain('doc-1')
  })
  it('Excel exporta todas as páginas do filtro, audita e mantém isolamento do cliente',async()=>{
    await insert('doc-1','nfe','key-1');await insert('doc-2','nfe_summary','key-1');await insert('doc-3','nfe','key-3')
    const file=await service.export('a',{pagina:99},'xlsx','consultor'),wb=new ExcelJS.Workbook();await wb.xlsx.load(file.body as never)
    expect(file.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(file.filename).toMatch(/^ALETIS-Fiscal-a-.*\.xlsx$/)
    expect(wb.getWorksheet('Painel')!.getCell('A11').result).toBe(2)
    expect(wb.getWorksheet('Registros')!.getCell('A11').value).toBeTruthy()
    const isolated=await service.export('b',{},'xlsx','consultor'),other=new ExcelJS.Workbook();await other.xlsx.load(isolated.body as never)
    expect(other.getWorksheet('Painel')!.getCell('A11').result).toBe(0)
    const filtered=await service.export('a',{busca:'key-3'},'xlsx','consultor'),selected=new ExcelJS.Workbook();await selected.xlsx.load(filtered.body as never)
    expect(selected.getWorksheet('Painel')!.getCell('A11').result).toBe(1)
    expect((await pool.query("SELECT count(*)::int n FROM audit_log WHERE dados_depois->>'formato'='xlsx'")).rows[0].n).toBe(3)
  })
  it('reenvio auditado preserva documento; registro encaminhado não duplica',async()=>{
    await insert('doc-1','nfe','key-1',{}, {bridge:5});expect((await service.search('a',{processamento:'erro'})).total).toBe(1)
    expect(await service.retryBridge('a','doc-1','consultor')).toEqual({agendado:true});expect((await service.search('a',{processamento:'pendente'})).total).toBe(1)
    await pool.query("UPDATE fiscal_document SET portal_upload_id='up-1' WHERE id='doc-1'");expect(await service.retryBridge('a','doc-1','consultor')).toEqual({agendado:false})
    expect((await pool.query('SELECT count(*)::int n FROM audit_log')).rows[0].n).toBe(1)
  })
})

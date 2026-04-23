/**
 * Ingest diário do Diário Oficial da União.
 *
 * Busca atos recentes com keywords agro + crise (RJ, falência, leilão),
 * extrai CPF/CNPJ, persiste em storage/prospeccao/dou-leads.json.
 *
 * Run: pnpm --filter @aletis/api run ingest:dou
 */
import { join } from 'path';
import { DOUSource, ingestDOUOnce } from '../src/services/prospeccao/sources/DOUSource';

async function main() {
  const storageDir = join(process.cwd(), 'storage', 'prospeccao');
  const dou = new DOUSource(storageDir);
  const result = await ingestDOUOnce(dou);
  console.log('[ingest:dou] Concluído:', result);
  console.log(`  Atos varridos: ${result.scanned}`);
  console.log(`  Atos com match agro+crise: ${result.agroMatched}`);
  console.log(`  Leads novos (CPF/CNPJ): ${result.newLeads}`);
}

main().catch(err => {
  console.error('[ingest:dou] FALHOU:', err);
  process.exit(1);
});

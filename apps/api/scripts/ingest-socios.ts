/**
 * Ingest de sócios PF via BrasilAPI.
 *
 * Para cada PJ agro (top-N por score), consulta CNPJ na BrasilAPI e
 * extrai sócios-administradores. Persiste em storage/prospeccao/socios-expansion.json.
 *
 * Por default roda 100 PJs (rate-limited 1.6 req/s → ~1min/run).
 * Use --max=500 para maior cobertura.
 *
 * Run: pnpm --filter @aletis/api run ingest:socios [-- --max=500]
 */
import { join } from 'path';
import { getProspeccaoService } from '../src/services/prospeccao/ProspeccaoService';
import { expandSociosFromPJs } from '../src/services/prospeccao/sources/SocioExpansionSource';

function parseFlag(flag: string, fallback: number): number {
  const arg = process.argv.find(a => a.startsWith(`--${flag}=`));
  if (!arg) return fallback;
  return Number(arg.split('=')[1]) || fallback;
}

async function main() {
  const maxPerRun = parseFlag('max', 100);
  const svc = getProspeccaoService();

  // Iteramos TODOS os leads (raw, sem cap de pageSize do buscar()).
  // Filtra PJs e pega N em ordem de score (já pré-ordenado pelo ScoringEngine).
  const allRaw = svc.sourcesRegistry.all();
  const pjs = allRaw
    .filter(l => l.tipoPessoa === 'PJ' && l.cpfCnpj?.length >= 14)
    .sort((a, b) => (b.totalDivida || 0) - (a.totalDivida || 0))
    .slice(0, maxPerRun)
    .map(l => ({ cnpj: l.cpfCnpj, nome: l.nome, uf: l.uf }));

  console.log(`[ingest:socios] Expandindo sócios de ${pjs.length} PJs (max ${maxPerRun})...`);
  const ret = await expandSociosFromPJs(pjs, { maxPerRun, delayMs: 600 });
  svc.socios.saveSocios(ret.socios, {
    pjsScanned: ret.pjsScanned,
    sociosExtracted: ret.sociosExtracted,
    uniqueSocios: ret.uniqueSocios,
  });

  console.log('[ingest:socios] Concluído:');
  console.log(`  PJs scanned: ${ret.pjsScanned}`);
  console.log(`  Sócios extraídos: ${ret.sociosExtracted}`);
  console.log(`  Sócios únicos: ${ret.uniqueSocios}`);
}

main().catch(err => {
  console.error('[ingest:socios] FALHOU:', err);
  process.exit(1);
});

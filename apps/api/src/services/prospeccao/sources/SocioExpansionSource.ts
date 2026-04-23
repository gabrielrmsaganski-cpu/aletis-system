// ============================================================
// SocioExpansionSource — expande sócios PF das PJ agro existentes
// ============================================================
// Para cada PJ agro já ingerida (PGFN + DOU), consulta BrasilAPI,
// extrai lista de sócios-administradores e gera leads "associados":
//   cpfCnpjClean = nome-normalizado + data-entrada (hash determinístico)
//   tipoPessoa = 'PF'
//   agroSignals = ['SOCIO_ADMIN', 'AGRO_PJ:{cnpj}']
//
// NOTA IMPORTANTE: BrasilAPI mascara o CPF completo dos sócios (retorna
// apenas o nome completo + qualificação + faixa etária). Estes leads
// são "contatos qualificados" — pessoas acionáveis via busca manual
// no Google / redes sociais / WhatsApp, não clientes com dívida PGFN
// direta. Mas representam a rede de relacionamento agro do Christian.
//
// Persistência: storage/prospeccao/socios-expansion.json
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import type { LeadRaw } from '../types';
import type { LeadSource, LeadSourceManifest } from './LeadSource';

interface SocioEnriched {
  /** Pseudo-documento: hash determinístico do nome + data entrada (evita dupe). */
  pseudoDoc: string;
  nome: string;
  qualificacao: string;
  faixaEtaria?: string;
  dataEntrada?: string;
  /** CPF parcialmente mascarado pela Receita (ex: "***556900**"). Útil para match manual. */
  cpfParcial?: string;
  /** CNPJ da PJ onde é sócio-admin — ancora para referência. */
  cnpjOrigem: string;
  nomeOrigem: string;
  ufOrigem: string;
}

interface SocioFile {
  manifest: {
    generatedAt: string;
    source: string;
    stats: { pjsScanned: number; sociosExtracted: number; uniqueSocios: number };
  };
  socios: SocioEnriched[];
}

/**
 * Gera pseudo-documento determinístico para um sócio sem CPF completo.
 * Concatena nome + dataEntrada + CNPJ origem e faz hash.
 * Prefixo "SOC_" marca a origem e evita colisão com CPFs reais.
 */
function pseudoDocFromSocio(nome: string, cnpjOrigem: string, dataEntrada?: string): string {
  const normalized = nome.trim().toUpperCase().replace(/\s+/g, ' ');
  const hash = createHash('sha256').update(`${normalized}|${cnpjOrigem}|${dataEntrada ?? ''}`).digest('hex').slice(0, 14);
  return `SOC_${hash}`;
}

export class SocioExpansionSource implements LeadSource {
  readonly fonte = 'SOCIO_AGRO';

  private socios: SocioEnriched[] = [];
  private byPseudo = new Map<string, SocioEnriched>();
  private fileManifest: SocioFile['manifest'] | null = null;
  private loaded = false;

  constructor(private readonly storagePath: string) {}

  private indexPath(): string {
    return join(this.storagePath, 'socios-expansion.json');
  }

  load(): void {
    if (this.loaded) return;
    const path = this.indexPath();
    if (!existsSync(path)) {
      console.log('[SocioExpansionSource] Índice não encontrado — rode scripts/ingest-socios.ts ou cron');
      this.loaded = true;
      return;
    }
    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed: SocioFile = JSON.parse(raw);
      this.socios = parsed.socios;
      this.fileManifest = parsed.manifest;
      for (const s of this.socios) this.byPseudo.set(s.pseudoDoc, s);
      console.log(`[SocioExpansionSource] ${this.socios.length} sócios PF agro carregados`);
    } catch (err) {
      console.warn('[SocioExpansionSource] falha carregando:', (err as Error).message);
    }
    this.loaded = true;
  }

  all(): LeadRaw[] {
    this.load();
    return this.socios.map(s => ({
      cpfCnpj: s.pseudoDoc,
      cpfCnpjClean: s.pseudoDoc,
      tipoPessoa: 'PF' as const,
      nome: s.nome,
      uf: s.ufOrigem,
      agroSignals: [
        `SOCIO:${s.qualificacao}`,
        `PJ_ORIGEM:${s.cnpjOrigem}`,
        `PJ_NOME:${s.nomeOrigem.slice(0, 40)}`,
        ...(s.faixaEtaria ? [`IDADE:${s.faixaEtaria}`] : []),
        ...(s.cpfParcial ? [`CPF_PARCIAL:${s.cpfParcial}`] : []),
      ],
      debts: [],
      totalDivida: 0,
      qtdInscricoes: 0,
      primeiraInscricao: s.dataEntrada ?? '',
      ultimaInscricao: s.dataEntrada ?? '',
      temAjuizada: false,
    }));
  }

  find(cpfCnpj: string): LeadRaw | null {
    this.load();
    const match = this.byPseudo.get(cpfCnpj);
    if (!match) return null;
    return this.all().find(l => l.cpfCnpjClean === match.pseudoDoc) ?? null;
  }

  manifest(): LeadSourceManifest {
    this.load();
    return {
      fonte: this.fonte,
      descricao: 'Sócios-administradores PF de PJ agro (BrasilAPI) — contatos qualificados',
      contagem: this.socios.length,
      lastIngestAt: this.fileManifest?.generatedAt ?? null,
      extra: this.fileManifest?.stats,
    };
  }

  saveSocios(newSocios: SocioEnriched[], stats: { pjsScanned: number; sociosExtracted: number; uniqueSocios: number }): void {
    this.load();
    for (const s of newSocios) {
      if (!this.byPseudo.has(s.pseudoDoc)) {
        this.socios.push(s);
        this.byPseudo.set(s.pseudoDoc, s);
      }
    }
    this.fileManifest = {
      generatedAt: new Date().toISOString(),
      source: 'BrasilAPI CNPJ /cnpj/v1 (sócios-administradores)',
      stats,
    };
    const path = this.indexPath();
    mkdirSync(dirname(path), { recursive: true });
    const file: SocioFile = { manifest: this.fileManifest, socios: this.socios };
    writeFileSync(path, JSON.stringify(file, null, 2));
    console.log(`[SocioExpansionSource] Persistido ${this.socios.length} sócios únicos (+${newSocios.length} novos)`);
  }
}

// ─────────────────────────────────────────────────────────
// Pipeline de ingest — chamado por cron / script
// ─────────────────────────────────────────────────────────

/**
 * Expande sócios a partir de uma lista de PJs (CNPJs + nome + UF).
 * Usa BrasilAPI com rate limiting (2 req/s) para não estourar.
 */
export async function expandSociosFromPJs(
  pjs: Array<{ cnpj: string; nome: string; uf: string }>,
  opts: { maxPerRun?: number; delayMs?: number; checkpointEvery?: number; onCheckpoint?: (socios: SocioEnriched[], pjsScanned: number) => void } = {},
): Promise<{ pjsScanned: number; sociosExtracted: number; uniqueSocios: number; socios: SocioEnriched[] }> {
  const maxPerRun = opts.maxPerRun ?? 100;
  const delayMs = opts.delayMs ?? 600; // ~1.6 req/s
  const checkpointEvery = opts.checkpointEvery ?? 50;
  const target = pjs.slice(0, maxPerRun);

  const allSocios: SocioEnriched[] = [];
  const seen = new Set<string>();
  let pjsScanned = 0;

  for (const pj of target) {
    const clean = pj.cnpj.replace(/\D/g, '');
    if (clean.length !== 14) continue;
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'ALETIS-Alix/1.0' },
      });
      pjsScanned++;
      if (!r.ok) {
        await new Promise(res => setTimeout(res, delayMs));
        continue;
      }
      const data = (await r.json()) as {
        qsa?: Array<{
          nome_socio: string;
          qualificacao_socio?: string;
          faixa_etaria?: string;
          data_entrada_sociedade?: string;
          cnpj_cpf_do_socio?: string;
          identificador_de_socio?: number; // 2=PF, 1=PJ, 3=estrangeiro
        }>;
      };
      if (Array.isArray(data.qsa)) {
        for (const s of data.qsa) {
          if (!s.nome_socio) continue;
          // identificador_de_socio=2 é Pessoa Física
          const isPF = s.identificador_de_socio === 2;
          if (!isPF) continue; // Wave 4: só trazemos sócios PF como leads
          const pseudoDoc = pseudoDocFromSocio(s.nome_socio, clean, s.data_entrada_sociedade);
          if (seen.has(pseudoDoc)) continue;
          seen.add(pseudoDoc);
          allSocios.push({
            pseudoDoc,
            nome: s.nome_socio.trim().toUpperCase(),
            qualificacao: s.qualificacao_socio ?? 'sócio',
            faixaEtaria: s.faixa_etaria,
            dataEntrada: s.data_entrada_sociedade,
            cpfParcial: s.cnpj_cpf_do_socio,
            cnpjOrigem: clean,
            nomeOrigem: pj.nome,
            ufOrigem: pj.uf,
          });
        }
      }
    } catch (err) {
      console.warn(`[SocioExpansion] fetch falhou ${clean}:`, (err as Error).message);
    }
    // Checkpoint progressivo — salva a cada N para não perder tudo se der timeout
    if (opts.onCheckpoint && pjsScanned > 0 && pjsScanned % checkpointEvery === 0) {
      try { opts.onCheckpoint([...allSocios], pjsScanned); } catch { /* ignore */ }
    }
    await new Promise(res => setTimeout(res, delayMs));
  }

  return {
    pjsScanned,
    sociosExtracted: allSocios.length,
    uniqueSocios: allSocios.length,
    socios: allSocios,
  };
}

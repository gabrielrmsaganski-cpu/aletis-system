import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** Últimas respostas reais, separadas do TTL de coleta. Nunca recebe referências. */
export class LastObservationStore {
  private values: Record<string, unknown> = {};
  private readonly file: string | null;
  constructor(namespace: string) {
    const directory = process.env.ALETIS_MARKET_CACHE_DIR || fileURLToPath(new URL('../../../storage/market-observations/', import.meta.url));
    this.file = process.env.NODE_ENV === 'test' && !process.env.ALETIS_MARKET_CACHE_DIR ? null : join(directory, `${namespace}.json`);
    if (this.file) {
      try { this.values = JSON.parse(readFileSync(this.file, 'utf8')); } catch { /* Primeira coleta ou arquivo inválido. */ }
    }
  }
  get<T>(key: string): T | undefined { return this.values[key] as T | undefined; }
  set(key: string, value: unknown): void {
    this.values[key] = value;
    if (!this.file) return;
    try {
      mkdirSync(join(this.file, '..'), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(this.values));
      renameSync(temporary, this.file);
    } catch { /* Uma falha de disco conserva a observação real em memória. */ }
  }
}

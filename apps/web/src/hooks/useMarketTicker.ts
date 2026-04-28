import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './useApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TickerItem {
  id: string;
  commodity: string;
  unidade: string;
  preco: number;
  variacao: number;
  variacaoPercent: number;
}

interface UseMarketTickerReturn {
  /** The full array of current ticker items with slightly varied prices. */
  items: TickerItem[];
  /** The single item currently "highlighted" in the rotation. */
  active: TickerItem;
  /** Index of the active item within `items`. */
  activeIndex: number;
  /** Timestamp (ISO string) of the last simulated tick. */
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Seed data — realistic Brazilian commodity baseline prices
// ---------------------------------------------------------------------------

const SEED: Omit<TickerItem, 'variacao' | 'variacaoPercent'>[] = [
  { id: 'tk_soja',    commodity: 'Soja',         unidade: 'R$/sc',  preco: 128.50 },
  { id: 'tk_milho',   commodity: 'Milho',        unidade: 'R$/sc',  preco: 58.20  },
  { id: 'tk_boi',     commodity: 'Boi Gordo',    unidade: 'R$/@',   preco: 295.00 },
  { id: 'tk_cafe',    commodity: 'Cafe Arabica',  unidade: 'R$/sc',  preco: 1420.00 },
  { id: 'tk_algodao', commodity: 'Algodao',      unidade: 'R$/@',   preco: 125.30 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a random number in the range [min, max). */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Apply a small random variation to a base price (max +/- maxPct percent). */
function vary(base: number, maxPct: number = 0.35): number {
  const factor = 1 + rand(-maxPct, maxPct) / 100;
  return parseFloat((base * factor).toFixed(2));
}

/** Build a full TickerItem from seed + previous price. */
function tick(
  seed: (typeof SEED)[number],
  previousPrice: number,
): TickerItem {
  const newPrice = vary(previousPrice);
  const variacao = parseFloat((newPrice - seed.preco).toFixed(2));
  const variacaoPercent = parseFloat(
    ((variacao / seed.preco) * 100).toFixed(2),
  );
  return {
    ...seed,
    preco: newPrice,
    variacao,
    variacaoPercent,
  };
}

function buildInitialItems(): TickerItem[] {
  return SEED.map((s) => tick(s, s.preco));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Simulates a real-time market ticker by slightly varying commodity prices
 * every `intervalMs` milliseconds (default 15 000 ms = 15 s) and rotating
 * through the items so the UI can highlight one at a time.
 */
export function useMarketTicker(intervalMs: number = 15000): UseMarketTickerReturn {
  const [items, setItems] = useState<TickerItem[]>(buildInitialItems);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(new Date().toISOString());

  // Keep a ref to the latest prices so the interval callback always reads
  // fresh data without needing `items` in its dependency array.
  const pricesRef = useRef<number[]>(items.map((i) => i.preco));

  // Fetch real prices from API on mount (apiFetch já extrai .data)
  useEffect(() => {
    apiFetch<any[]>('/mercado/precos')
      .then(precos => {
        if (Array.isArray(precos)) {
          const mapped: TickerItem[] = precos.slice(0, 6).map((c: any, i: number) => ({
            id: `tk_${i}`,
            commodity: c.cultura,
            unidade: c.unidade?.replace('/saca 60kg', '/sc').replace('/arroba', '/@') || 'R$',
            preco: c.precoAtual,
            variacao: c.precoAtual * (c.variacao24h / 100),
            variacaoPercent: c.variacao24h,
          }))
          if (mapped.length > 0) {
            pricesRef.current = mapped.map(m => m.preco)
            setItems(mapped)
            setLastUpdated(new Date().toISOString())
          }
        }
      })
      .catch(() => { /* fallback to SEED data */ })
  }, [])

  const tickAll = useCallback(() => {
    setItems(prev => {
      const seeds = prev.length > 0 ? prev : SEED.map(s => tick(s, s.preco))
      const updated = seeds.map((item, idx) => {
        const prevPrice = pricesRef.current[idx] || item.preco
        const newPrice = vary(prevPrice)
        const basePrice = SEED[idx]?.preco || item.preco
        const variacao = parseFloat((newPrice - basePrice).toFixed(2))
        const variacaoPercent = parseFloat(((variacao / basePrice) * 100).toFixed(2))
        return { ...item, preco: newPrice, variacao, variacaoPercent }
      })
      pricesRef.current = updated.map(i => i.preco)
      return updated
    })
    setActiveIndex(prev => (prev + 1) % Math.max(items.length, SEED.length))
    setLastUpdated(new Date().toISOString())
  }, [items.length])

  useEffect(() => {
    const id = setInterval(tickAll, intervalMs);
    return () => clearInterval(id);
  }, [tickAll, intervalMs]);

  return {
    items,
    active: items[activeIndex],
    activeIndex,
    lastUpdated,
  };
}

export default useMarketTicker;

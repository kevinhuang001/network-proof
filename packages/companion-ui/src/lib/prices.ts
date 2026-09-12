import { useEffect, useState } from 'react';
import { fetchUsdPrices, chainMeta, priceableSymbols } from '@netproof/companion';

/**
 * The current dollar price of the coin a fee is paid in, or null.
 *
 * One price per symbol per minute, shared by every screen: the send form and the approval
 * screen both ask, and asking twice would be two requests to a third party for one number.
 * The cache is module-level on purpose — it outlives a screen, which is exactly what a
 * one-minute price should do.
 *
 * A failure is silent. The fee in the chain's own coin is the number that decides anything;
 * a dollar figure that could not be fetched is simply absent, and nothing is invented in its
 * place.
 */

const CACHE_MS = 60_000;

interface Cached {
  price: number;
  at: number;
}

const cache = new Map<string, Cached>();
/** In-flight requests, so two screens opening together share one fetch. */
const inFlight = new Map<string, Promise<number | null>>();

async function load(symbol: string): Promise<number | null> {
  const existing = inFlight.get(symbol);
  if (existing) return existing;

  const request = fetchUsdPrices([symbol], async (url) => {
    /*
     * A price is a nice-to-have, so it gets a deadline. Without one, a hanging request would
     * keep the promise — and the in-flight map — alive for as long as the browser allows,
     * and no later screen could ask again.
     */
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as unknown;
    } finally {
      window.clearTimeout(timer);
    }
  })
    .then((prices) => prices[symbol] ?? null)
    .catch(() => null)
    .finally(() => inFlight.delete(symbol));

  inFlight.set(symbol, request);
  return request;
}

export function useUsdPrice(symbol: string | null, enabled: boolean): number | null {
  const [price, setPrice] = useState<number | null>(() => {
    const cached = symbol === null ? undefined : cache.get(symbol);
    return cached && Date.now() - cached.at < CACHE_MS ? cached.price : null;
  });

  useEffect(() => {
    if (!enabled || symbol === null || !priceableSymbols().includes(symbol)) {
      setPrice(null);
      return;
    }
    let cancelled = false;

    const read = async (): Promise<void> => {
      const cached = cache.get(symbol);
      if (cached && Date.now() - cached.at < CACHE_MS) {
        if (!cancelled) setPrice(cached.price);
        return;
      }
      const fresh = await load(symbol);
      if (fresh === null) return;
      cache.set(symbol, { price: fresh, at: Date.now() });
      if (!cancelled) setPrice(fresh);
    };

    void read();
    // A fee can sit on screen for a while; a minute-old dollar figure is still honest, an
    // hour-old one is not.
    const timer = window.setInterval(() => void read(), CACHE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbol, enabled]);

  return price;
}

/** Whether this chain's fee can be priced in dollars at all. */
export function chainShowsFiat(chainId: number): boolean {
  const meta = chainMeta(chainId);
  if (!meta || meta.testnet === true) return false;
  return priceableSymbols().includes(meta.symbol);
}

/**
 * What an amount of wei is worth at a spot price, or null when there is no price.
 *
 * 1e18, the wei in a coin, is exactly representable as a double (5^18 × 2^18, and 5^18 fits in
 * 53 bits), so `Number(wei) / 1e18` is exact for any realistic fee and loses only the last
 * bits of an absurd one. A dollar estimate does not need more than that.
 */
export function usdValue(wei: bigint, price: number | null): number | null {
  if (price === null) return null;
  return (Number(wei) / 1e18) * price;
}

/**
 * Dollars, at the precision the number deserves.
 *
 * Under a cent is "<$0.01" rather than "$0.00", because a fee that rounds to zero looks free
 * and is not; above a thousand the cents are noise.
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value < 0.01) return '<$0.01';
  const digits = value < 1000 ? 2 : 0;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

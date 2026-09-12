import { useEffect, useState } from 'react';
import { chainMeta, fetchUsdPrice, priceableSymbols, priceSourceLabels } from '@netproof/companion';
import type { PriceQuoteCurrency } from '@netproof/companion';

/**
 * The current dollar price of the coin a fee is paid in, and who said so.
 *
 * One price per symbol per minute, shared by every screen: the send form and the approval
 * screen both ask, and asking twice would be two rounds of requests to a third party for one
 * number. The cache is module-level on purpose — it outlives a screen, which is exactly what a
 * one-minute price should do.
 *
 * The sources are tried in order, and the one that answers is remembered so the next request
 * starts there. On a network where the first source is unreachable, that is the difference
 * between one timeout per screen and six.
 *
 * A failure is silent. The fee in the chain's own coin is the number that decides anything; a
 * dollar figure that could not be fetched is simply absent, and nothing is invented in its
 * place.
 */

const CACHE_MS = 60_000;
/** Per source. Six of these is the worst case, and only when nothing answers at all. */
const SOURCE_TIMEOUT_MS = 4_000;

export interface UsdQuote {
  price: number;
  /** The name of the source that produced it, for the line under the fee. */
  source: string;
  quote: PriceQuoteCurrency;
  at: number;
}

const cache = new Map<string, UsdQuote>();
/** In-flight requests, so two screens opening together share one round of requests. */
const inFlight = new Map<string, Promise<UsdQuote | null>>();
/** Whoever answered last is asked first next time. */
let preferred: string | undefined;
/**
 * Sources that just failed, and until when.
 *
 * A rate limit is not a one-off: CoinGecko's public endpoint answers 429 to a burst, and a
 * wallet that re-asks it on every screen would stay rate-limited for as long as the user keeps
 * opening screens. Two minutes is long enough for the window to pass and short enough that a
 * source coming back is noticed.
 */
const COOLDOWN_MS = 120_000;
const onIce = new Map<string, number>();

function cooledDown(): string[] {
  const now = Date.now();
  const skipped: string[] = [];
  for (const [id, until] of onIce) {
    if (until > now) skipped.push(id);
    else onIce.delete(id);
  }
  return skipped;
}

async function load(symbol: string): Promise<UsdQuote | null> {
  const existing = inFlight.get(symbol);
  if (existing) return existing;

  const request = fetchUsdPrice(
    symbol,
    async (url) => {
      /*
       * A price is a nice-to-have, so each source gets a deadline: without one, a hanging
       * request would hold the whole chain — and the in-flight entry — open indefinitely, and
       * no later screen could ask again.
       */
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as unknown;
      } finally {
        window.clearTimeout(timer);
      }
    },
    {
      ...(preferred === undefined ? {} : { prefer: preferred }),
      skip: cooledDown(),
      onAttempt: (sourceId, ok) => {
        if (ok) onIce.delete(sourceId);
        else onIce.set(sourceId, Date.now() + COOLDOWN_MS);
      },
    },
  )
    .then((quote) =>
      quote === null
        ? null
        : { price: quote.usd, source: quote.sourceLabel, quote: quote.quote, at: Date.now() },
    )
    .then((quote) => {
      if (quote !== null) preferred = quote.source;
      return quote;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(symbol));

  inFlight.set(symbol, request);
  return request;
}

export function useUsdPrice(symbol: string | null, enabled: boolean): UsdQuote | null {
  const [quote, setQuote] = useState<UsdQuote | null>(() => {
    const cached = symbol === null ? undefined : cache.get(symbol);
    return cached && Date.now() - cached.at < CACHE_MS ? cached : null;
  });

  useEffect(() => {
    if (!enabled || symbol === null || !priceableSymbols().includes(symbol)) {
      setQuote(null);
      return;
    }
    let cancelled = false;

    const read = async (): Promise<void> => {
      const cached = cache.get(symbol);
      if (cached && Date.now() - cached.at < CACHE_MS) {
        if (!cancelled) setQuote(cached);
        return;
      }
      const fresh = await load(symbol);
      if (fresh === null) return;
      cache.set(symbol, fresh);
      if (!cancelled) setQuote(fresh);
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

  return quote;
}

/** Whether this chain's fee can be priced in dollars at all. */
export function chainShowsFiat(chainId: number): boolean {
  const meta = chainMeta(chainId);
  if (!meta || meta.testnet === true) return false;
  return priceableSymbols().includes(meta.symbol);
}

/** What an amount of wei is worth at a spot price, or null when there is no price. */
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

/** The names of every source, for the settings text. */
export { priceSourceLabels };

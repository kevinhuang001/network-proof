/**
 * What a fee is worth in dollars.
 *
 * A transaction fee is a number in the chain's own coin, and nobody has an intuition for
 * 0.00042 ETH. The point of this module is to turn that into a number the user can judge —
 * and to do it without pretending to more precision than a spot price has.
 *
 * Two consequences worth stating plainly:
 *
 *   - The rate comes from a third-party price API, so opening a screen that shows a fee makes
 *     a request to that API. It reveals the user's IP address and which chains they are on, and
 *     nothing else: no address, no amount, no request id. A wallet that says it never talks to
 *     anyone would be lying; this one says exactly who it talks to. `showFiat` in settings
 *     turns it off.
 *   - It is a *spot* price, and the transaction will settle later at whatever the market does.
 *     The UI therefore says "≈": an estimate of an estimate.
 *
 * Only the coin a fee is paid in is ever looked up, on mainnets only — pricing testnet ETH is
 * a number that means nothing.
 */

/** The chains whose coin has a price, by symbol, in the ids CoinGecko uses. */
const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  BNB: 'binancecoin',
  POL: 'matic-network',
  AVAX: 'avalanche-2',
};

/** The same coins in the symbols CryptoCompare uses, as the fallback. */
const CRYPTOCOMPARE_SYMBOLS: Record<string, string> = {
  ETH: 'ETH',
  BNB: 'BNB',
  POL: 'POL',
  AVAX: 'AVAX',
};

/** A price older than this is not worth showing next to a live fee. */
export const PRICE_TTL_MS = 60_000;

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';
const CRYPTOCOMPARE_URL = 'https://min-api.cryptocompare.com/data/pricemulti';

/** Coins this wallet has a price source for. */
export function priceableSymbols(): string[] {
  return Object.keys(COINGECKO_IDS);
}

export function coingeckoUrl(symbols: string[]): string | null {
  const ids = symbols.map((symbol) => COINGECKO_IDS[symbol]).filter((id): id is string => id !== undefined);
  if (ids.length === 0) return null;
  return `${COINGECKO_URL}?ids=${[...new Set(ids)].join(',')}&vs_currencies=usd`;
}

export function cryptoCompareUrl(symbols: string[]): string | null {
  const names = symbols
    .map((symbol) => CRYPTOCOMPARE_SYMBOLS[symbol])
    .filter((name): name is string => name !== undefined);
  if (names.length === 0) return null;
  return `${CRYPTOCOMPARE_URL}?fsyms=${[...new Set(names)].join(',')}&tsyms=USD`;
}

function positiveNumber(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
}

/** Read CoinGecko's `{ ethereum: { usd: 3000 } }` into `{ ETH: 3000 }`. */
export function parseCoinGecko(payload: unknown, symbols: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof payload !== 'object' || payload === null) return out;
  for (const symbol of symbols) {
    const id = COINGECKO_IDS[symbol];
    if (id === undefined) continue;
    const entry = (payload as Record<string, unknown>)[id];
    const price = positiveNumber((entry as { usd?: unknown } | undefined)?.usd);
    if (price !== null) out[symbol] = price;
  }
  return out;
}

/** Read CryptoCompare's `{ ETH: { USD: 3000 } }` into `{ ETH: 3000 }`. */
export function parseCryptoCompare(payload: unknown, symbols: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof payload !== 'object' || payload === null) return out;
  for (const symbol of symbols) {
    const name = CRYPTOCOMPARE_SYMBOLS[symbol];
    if (name === undefined) continue;
    const entry = (payload as Record<string, unknown>)[name];
    const price = positiveNumber((entry as { USD?: unknown } | undefined)?.USD);
    if (price !== null) out[symbol] = price;
  }
  return out;
}

export interface PriceFetch {
  (url: string): Promise<unknown>;
}

/**
 * Spot prices in USD, keyed by the symbol a fee is paid in.
 *
 * A symbol with no answer is simply absent from the result, and the screens show no dollar
 * figure rather than a stale or invented one. Both sources failing is a normal outcome, not
 * an error the user needs to see: the fee in the chain's own coin is the number that matters.
 */
export async function fetchUsdPrices(symbols: string[], get: PriceFetch): Promise<Record<string, number>> {
  const wanted = symbols.filter((symbol) => COINGECKO_IDS[symbol] !== undefined);
  if (wanted.length === 0) return {};

  const first = coingeckoUrl(wanted);
  if (first !== null) {
    try {
      const parsed = parseCoinGecko(await get(first), wanted);
      if (Object.keys(parsed).length > 0) return parsed;
    } catch {
      // Falls through to the second source.
    }
  }

  const second = cryptoCompareUrl(wanted);
  if (second !== null) {
    try {
      return parseCryptoCompare(await get(second), wanted);
    } catch {
      return {};
    }
  }
  return {};
}

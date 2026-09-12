/**
 * What a fee is worth in dollars, from whichever price source answers first.
 *
 * A transaction fee is a number in the chain's own coin, and nobody has an intuition for
 * 0.00042 ETH. The point of this module is to turn that into a number the user can judge —
 * and to do it without pretending to more precision than a spot price has.
 *
 * One source is a single point of failure, so there are six, each with its own URL shape,
 * its own idea of what a coin is called and its own response format. They are tried in order
 * until one returns a number, which is why this file looks like a translation table: that is
 * what it is. Every one of them is a public API with no key, because a wallet that needs an
 * API key to show a fee would be a wallet that stops showing fees.
 *
 * Two consequences worth stating plainly:
 *
 *   - The rate comes from a third party, so opening a screen that shows a fee makes a request
 *     to one of these. It reveals the user's IP address and which chain is open, and nothing
 *     else: no address, no amount, no request id. A wallet that says it never talks to anyone
 *     would be lying; this one says exactly who it talks to, and which one answered is printed
 *     next to the number. `showFiat` in settings turns the whole thing off.
 *   - It is a *spot* price and the transaction settles later at whatever the market does, so
 *     the UI says "≈".
 */

export type PriceQuoteCurrency = 'USD' | 'USDT';

export interface PriceSource {
  id: string;
  /** What the UI calls this source, next to the number it produced. */
  label: string;
  /**
   * The coin symbols this source can price, mapped to whatever id it wants for them.
   *
   * A symbol that is missing here is a symbol this source cannot answer for at all — Kraken
   * has never listed BNB — and it is skipped rather than attempted.
   */
  coins: Record<string, string>;
  /** What one unit is quoted in. USDT is not USD, and the UI says when it was USDT. */
  quote: PriceQuoteCurrency;
  url(coin: string): string;
  parse(payload: unknown, coin: string): number | null;
}

function positiveNumber(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The sources, in the order they are tried.
 *
 * CoinGecko first because it is the reference everyone else quotes; DefiLlama second because
 * it is the most permissive about rate limits; the exchanges after that because they price one
 * pair at a time and quote the dollar only approximately (a USDT pair is not a USD pair).
 */
export const PRICE_SOURCES: PriceSource[] = [
  {
    id: 'coingecko',
    label: 'CoinGecko',
    quote: 'USD',
    coins: {
      ETH: 'ethereum',
      BNB: 'binancecoin',
      // NOT `matic-network`: that is the old MATIC token, still trading at a different price.
      // Measured while writing this: MATIC 0.1262 against POL 0.0965 on every exchange, so the
      // wrong id would have shown a Polygon fee a third too expensive.
      POL: 'polygon-ecosystem-token',
      AVAX: 'avalanche-2',
    },
    url: (coin) =>
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=usd`,
    parse: (payload, coin) => positiveNumber(record(record(payload)?.[coin])?.['usd']),
  },
  {
    id: 'llama',
    label: 'DefiLlama',
    quote: 'USD',
    coins: {
      ETH: 'ethereum',
      BNB: 'binancecoin',
      POL: 'polygon-ecosystem-token',
      AVAX: 'avalanche-2',
    },
    url: (coin) => `https://coins.llama.fi/prices/current/coingecko:${encodeURIComponent(coin)}`,
    parse: (payload, coin) =>
      positiveNumber(record(record(record(payload)?.['coins'])?.[`coingecko:${coin}`])?.['price']),
  },
  {
    id: 'binance',
    label: 'Binance（USDT 交易对）',
    quote: 'USDT',
    coins: { ETH: 'ETHUSDT', BNB: 'BNBUSDT', POL: 'POLUSDT', AVAX: 'AVAXUSDT' },
    url: (coin) => `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(coin)}`,
    parse: (payload, coin) => {
      // One symbol asked for, but the plural endpoint answers with a list; both are handled.
      if (Array.isArray(payload)) {
        const match = payload.find((entry) => record(entry)?.['symbol'] === coin);
        return positiveNumber(record(match)?.['price']);
      }
      const single = record(payload);
      return single?.['symbol'] === coin ? positiveNumber(single['price']) : null;
    },
  },
  {
    id: 'coinbase',
    label: 'Coinbase',
    quote: 'USD',
    coins: { ETH: 'ETH-USD', BNB: 'BNB-USD', POL: 'POL-USD', AVAX: 'AVAX-USD' },
    url: (coin) => `https://api.coinbase.com/v2/prices/${encodeURIComponent(coin)}/spot`,
    parse: (payload) => positiveNumber(record(record(payload)?.['data'])?.['amount']),
  },
  {
    id: 'kraken',
    label: 'Kraken',
    quote: 'USD',
    // Kraken has no BNB market. It also renames pairs in its answers — ETHUSD comes back as
    // XETHZUSD — which is why `parse` reads the only entry instead of looking up a key.
    coins: { ETH: 'ETHUSD', POL: 'POLUSD', AVAX: 'AVAXUSD' },
    url: (coin) => `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(coin)}`,
    parse: (payload) => {
      const result = record(record(payload)?.['result']);
      if (result === null) return null;
      for (const entry of Object.values(result)) {
        const close = record(entry)?.['c'];
        if (Array.isArray(close)) {
          const price = positiveNumber(close[0]);
          if (price !== null) return price;
        }
      }
      return null;
    },
  },
  {
    id: 'coinpaprika',
    label: 'CoinPaprika',
    quote: 'USD',
    // No POL: CoinPaprika's Polygon ticker is not a POL pair, and a wrong id is worse than a
    // missing source.
    coins: { ETH: 'eth-ethereum', BNB: 'bnb-binance-coin', AVAX: 'avax-avalanche' },
    url: (coin) => `https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(coin)}?quotes=USD`,
    parse: (payload) =>
      positiveNumber(record(record(record(payload)?.['quotes'])?.['USD'])?.['price']),
  },
];

export interface PriceQuote {
  symbol: string;
  usd: number;
  /** Which source answered, for the line the UI prints under the fee. */
  sourceId: string;
  sourceLabel: string;
  quote: PriceQuoteCurrency;
}

/** Coins this wallet has any way to price. */
export function priceableSymbols(): string[] {
  const symbols = new Set<string>();
  for (const source of PRICE_SOURCES) for (const symbol of Object.keys(source.coins)) symbols.add(symbol);
  return [...symbols];
}

/** The sources that can answer for this symbol, in the order they will be tried. */
export function sourcesFor(symbol: string, prefer?: string): PriceSource[] {
  const usable = PRICE_SOURCES.filter((source) => source.coins[symbol] !== undefined);
  if (prefer === undefined) return usable;
  // Whichever source worked last is tried first: on a network where CoinGecko is blocked,
  // every screen would otherwise start by waiting for it to time out.
  return [...usable].sort((a, b) => (a.id === prefer ? -1 : b.id === prefer ? 1 : 0));
}

export interface PriceFetch {
  (url: string): Promise<unknown>;
}

export interface PriceOptions {
  /** The source to try first — normally whichever one answered last. */
  prefer?: string;
  /** Sources not to try at all, for a while after they failed. */
  skip?: string[];
  /** Called after each attempt, so a caller can put a failing source on ice. */
  onAttempt?: (sourceId: string, ok: boolean) => void;
}

/**
 * The first source that answers, or nothing.
 *
 * Each source is asked once and a failure moves on. That includes the failure that is not an
 * exception: a 200 carrying an empty body, which is what a rate limit sometimes looks like,
 * and which must never be mistaken for "this coin is worth nothing".
 *
 * `skip` exists because a rate limit is not a one-off. Retrying a source that just answered
 * 429 on every screen is how a wallet turns a busy minute into a blocked hour.
 */
export async function fetchUsdPrice(
  symbol: string,
  get: PriceFetch,
  options: PriceOptions = {},
): Promise<PriceQuote | null> {
  const candidates = sourcesFor(symbol, options.prefer);
  const skipped = new Set(options.skip ?? []);
  // Never skip everything: a stale rate limit on all six is still better answered than not.
  const usable = candidates.filter((source) => !skipped.has(source.id));
  const order = usable.length > 0 ? usable : candidates;

  for (const source of order) {
    const coin = source.coins[symbol];
    if (coin === undefined) continue;
    try {
      const price = source.parse(await get(source.url(coin)), coin);
      options.onAttempt?.(source.id, price !== null);
      if (price !== null) {
        return {
          symbol,
          usd: price,
          sourceId: source.id,
          sourceLabel: source.label,
          quote: source.quote,
        };
      }
    } catch {
      options.onAttempt?.(source.id, false);
    }
  }
  return null;
}

/** The names of every source, for the settings text and the line under the fee. */
export function priceSourceLabels(): string[] {
  return PRICE_SOURCES.map((source) => source.label);
}

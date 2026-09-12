import { describe, expect, it } from 'vitest';
import {
  coingeckoUrl,
  cryptoCompareUrl,
  fetchUsdPrices,
  parseCoinGecko,
  parseCryptoCompare,
  priceableSymbols,
} from '../src/prices';

/**
 * Tests for the dollar price of a fee.
 *
 * Two things matter here and neither is the number itself: that a price is never invented
 * (a failure shows no figure, rather than a stale or zero one), and that the only host the
 * wallet talks to for it is the one in these URLs — this is the single outbound request the
 * companion makes that is not an RPC call to a node the user configured.
 */

describe('the price sources', () => {
  it('asks for exactly the coins it needs, by the id each service uses', () => {
    expect(coingeckoUrl(['ETH', 'BNB'])).toBe(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin&vs_currencies=usd',
    );
    expect(coingeckoUrl(['ETH', 'ETH'])).toBe(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    );
    expect(cryptoCompareUrl(['ETH', 'BNB'])).toBe(
      'https://min-api.cryptocompare.com/data/pricemulti?fsyms=ETH,BNB&tsyms=USD',
    );
  });

  it('has nothing to ask for a coin it cannot price', () => {
    // A chain whose coin is not on either list gets no request, not a wrong one.
    expect(coingeckoUrl(['SOL'])).toBeNull();
    expect(cryptoCompareUrl(['SOL'])).toBeNull();
    expect(priceableSymbols()).not.toContain('SOL');
  });

  it('reads both response shapes', () => {
    expect(parseCoinGecko({ ethereum: { usd: 3123.45 }, binancecoin: { usd: 601 } }, ['ETH', 'BNB'])).toEqual({
      ETH: 3123.45,
      BNB: 601,
    });
    expect(parseCryptoCompare({ ETH: { USD: 3123.45 }, BNB: { USD: 601 } }, ['ETH', 'BNB'])).toEqual({
      ETH: 3123.45,
      BNB: 601,
    });
  });

  it('accepts numeric strings and rejects anything unusable', () => {
    // Both services have returned strings for prices at some point; a zero or a null is not a
    // price and must not become "$0.00" next to a real fee.
    expect(parseCoinGecko({ ethereum: { usd: '3123.45' } }, ['ETH'])).toEqual({ ETH: 3123.45 });
    expect(parseCoinGecko({ ethereum: { usd: 0 } }, ['ETH'])).toEqual({});
    expect(parseCoinGecko({ ethereum: { usd: -1 } }, ['ETH'])).toEqual({});
    expect(parseCoinGecko({ ethereum: {} }, ['ETH'])).toEqual({});
    expect(parseCoinGecko({ ethereum: { usd: 'not a number' } }, ['ETH'])).toEqual({});
    expect(parseCoinGecko(null, ['ETH'])).toEqual({});
    expect(parseCoinGecko([1, 2], ['ETH'])).toEqual({});
  });
});

describe('fetching prices', () => {
  const symbols = ['ETH', 'BNB'];

  it('uses the first source and stops there', async () => {
    const urls: string[] = [];
    const prices = await fetchUsdPrices(symbols, async (url) => {
      urls.push(url);
      return { ethereum: { usd: 3000 }, binancecoin: { usd: 600 } };
    });
    expect(prices).toEqual({ ETH: 3000, BNB: 600 });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('api.coingecko.com');
  });

  it('falls back to the second source when the first fails', async () => {
    const urls: string[] = [];
    const prices = await fetchUsdPrices(symbols, async (url) => {
      urls.push(url);
      if (url.includes('coingecko')) throw new Error('HTTP 429');
      return { ETH: { USD: 3000 }, BNB: { USD: 600 } };
    });
    expect(prices).toEqual({ ETH: 3000, BNB: 600 });
    expect(urls).toHaveLength(2);
  });

  it('falls back when the first answers with something useless', async () => {
    // A 200 with an empty body is the shape a rate limit sometimes takes: it must not be
    // mistaken for "ether is worth nothing".
    const prices = await fetchUsdPrices(symbols, async (url) =>
      url.includes('coingecko') ? {} : { ETH: { USD: 3000 } },
    );
    expect(prices).toEqual({ ETH: 3000 });
  });

  it('returns nothing rather than a guess when both fail', async () => {
    const prices = await fetchUsdPrices(symbols, async () => {
      throw new Error('offline');
    });
    expect(prices).toEqual({});
  });

  it('makes no request for a coin it cannot price', async () => {
    let calls = 0;
    const prices = await fetchUsdPrices(['SOL'], async () => {
      calls += 1;
      return {};
    });
    expect(prices).toEqual({});
    expect(calls).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  PRICE_SOURCES,
  fetchUsdPrice,
  priceSourceLabels,
  priceableSymbols,
  sourcesFor,
} from '../src/prices';

/**
 * Tests for the dollar price of a fee.
 *
 * Two things matter here and neither is the number itself: that a price is never invented (a
 * failure shows no figure, rather than a stale or zero one), and that every source's own
 * conventions are handled correctly — its URL, its names for things, its response shape. Each
 * of the payloads below is the real shape of that API's answer, captured while writing this.
 */

describe('the price sources', () => {
  const byId = (id: string) => PRICE_SOURCES.find((source) => source.id === id)!;

  it('names every source, so the UI can say which one produced a number', () => {
    expect(priceSourceLabels()).toEqual([
      'CoinGecko',
      'DefiLlama',
      'Binance（USDT 交易对）',
      'Coinbase',
      'Kraken',
      'CoinPaprika',
    ]);
  });

  it('asks each API in the shape that API wants', () => {
    expect(byId('coingecko').url('polygon-ecosystem-token')).toBe(
      'https://api.coingecko.com/api/v3/simple/price?ids=polygon-ecosystem-token&vs_currencies=usd',
    );
    expect(byId('llama').url('ethereum')).toBe(
      'https://coins.llama.fi/prices/current/coingecko:ethereum',
    );
    expect(byId('binance').url('ETHUSDT')).toBe(
      'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT',
    );
    expect(byId('coinbase').url('ETH-USD')).toBe('https://api.coinbase.com/v2/prices/ETH-USD/spot');
    expect(byId('kraken').url('ETHUSD')).toBe(
      'https://api.kraken.com/0/public/Ticker?pair=ETHUSD',
    );
    expect(byId('coinpaprika').url('eth-ethereum')).toBe(
      'https://api.coinpaprika.com/v1/tickers/eth-ethereum?quotes=USD',
    );
  });

  it('reads each API’s own response shape', () => {
    expect(byId('coingecko').parse({ ethereum: { usd: 2513.18 } }, 'ethereum')).toBe(2513.18);
    expect(
      byId('llama').parse(
        { coins: { 'coingecko:ethereum': { price: 2513.28, symbol: 'ETH', confidence: 0.99 } } },
        'ethereum',
      ),
    ).toBe(2513.28);
    expect(byId('binance').parse({ symbol: 'ETHUSDT', price: '2512.77' }, 'ETHUSDT')).toBe(2512.77);
    // The plural endpoint answers with a list even for one symbol.
    expect(
      byId('binance').parse([{ symbol: 'ETHUSDT', price: '2512.77' }], 'ETHUSDT'),
    ).toBe(2512.77);
    expect(byId('coinbase').parse({ data: { amount: '2512.615', base: 'ETH', currency: 'USD' } }, 'ETH-USD')).toBe(
      2512.615,
    );
    // Kraken renames the pair it was asked about: ETHUSD comes back as XETHZUSD.
    expect(
      byId('kraken').parse(
        { error: [], result: { XETHZUSD: { c: ['2512.36', '2', '2.0'] } } },
        'ETHUSD',
      ),
    ).toBe(2512.36);
    expect(
      byId('coinpaprika').parse(
        { symbol: 'ETH', quotes: { USD: { price: 2513.559 } } },
        'eth-ethereum',
      ),
    ).toBe(2513.559);
  });

  it('rejects a payload that carries no usable price', () => {
    // A 200 with an empty body is what a rate limit sometimes looks like; it must not be read
    // as "ether is worth nothing".
    for (const source of PRICE_SOURCES) {
      const coin = Object.values(source.coins)[0]!;
      expect(source.parse({}, coin), `${source.id} on an empty object`).toBeNull();
      expect(source.parse(null, coin), `${source.id} on null`).toBeNull();
      expect(source.parse('nonsense', coin), `${source.id} on a string`).toBeNull();
    }
    expect(byId('coingecko').parse({ ethereum: { usd: 0 } }, 'ethereum')).toBeNull();
    expect(byId('coingecko').parse({ ethereum: { usd: -3 } }, 'ethereum')).toBeNull();
    expect(byId('kraken').parse({ error: ['EQuery:Unknown asset pair'], result: {} }, 'ETHUSD')).toBeNull();
  });

  it('prices POL as POL, not as the old MATIC token', () => {
    /*
     * The bug this test exists for: CoinGecko's `matic-network` is the *old* MATIC token, still
     * trading at 0.1262 while POL — the coin Polygon fees are actually paid in — is 0.0965 on
     * every exchange. Using the wrong id would have shown every Polygon fee about a third too
     * expensive, in the one row where the user is deciding how much to spend.
     */
    expect(byId('coingecko').coins['POL']).toBe('polygon-ecosystem-token');
    expect(byId('llama').coins['POL']).toBe('polygon-ecosystem-token');
    for (const source of PRICE_SOURCES) {
      expect(Object.values(source.coins), source.id).not.toContain('matic-network');
    }
  });

  it('says which currencies are not exactly the dollar', () => {
    // A USDT pair is not a USD pair, and the label admits it rather than printing "$" as if
    // it were.
    expect(byId('binance').quote).toBe('USDT');
    for (const source of PRICE_SOURCES.filter((entry) => entry.id !== 'binance')) {
      expect(source.quote, source.id).toBe('USD');
    }
  });
});

describe('choosing a source', () => {
  it('skips sources that cannot price the coin at all', () => {
    // Kraken has no BNB market, so asking it would be a wasted round trip on every screen.
    expect(sourcesFor('BNB').map((source) => source.id)).toEqual([
      'coingecko',
      'llama',
      'binance',
      'coinbase',
      'coinpaprika',
    ]);
    expect(sourcesFor('ETH').map((source) => source.id)).toContain('kraken');
    expect(priceableSymbols().sort()).toEqual(['AVAX', 'BNB', 'ETH', 'POL']);
  });

  it('tries the source that worked last first', () => {
    // On a network where CoinGecko is unreachable, every screen would otherwise open by
    // waiting for it to time out.
    expect(sourcesFor('ETH', 'kraken')[0]!.id).toBe('kraken');
    expect(sourcesFor('BNB', 'kraken')[0]!.id).toBe('coingecko');
  });
});

describe('fetching a price', () => {
  it('takes the first source that answers and stops', async () => {
    const asked: string[] = [];
    const quote = await fetchUsdPrice('ETH', async (url) => {
      asked.push(url);
      return { ethereum: { usd: 2513.18 } };
    });
    expect(quote).toEqual({
      symbol: 'ETH',
      usd: 2513.18,
      sourceId: 'coingecko',
      sourceLabel: 'CoinGecko',
      quote: 'USD',
    });
    expect(asked).toHaveLength(1);
  });

  it('walks the list when a source is down, and names the one that answered', async () => {
    const asked: string[] = [];
    const quote = await fetchUsdPrice('AVAX', async (url) => {
      asked.push(url);
      if (url.includes('coingecko') || url.includes('llama')) throw new Error('HTTP 429');
      if (url.includes('binance')) return []; // A rate limit that arrives as an empty 200.
      if (url.includes('coinbase')) return { data: { amount: '7.4455' } };
      return {};
    });
    expect(quote?.usd).toBe(7.4455);
    expect(quote?.sourceLabel).toBe('Coinbase');
    expect(asked.map((url) => new URL(url).host)).toEqual([
      'api.coingecko.com',
      'coins.llama.fi',
      'api.binance.com',
      'api.coinbase.com',
    ]);
  });

  it('admits when a USDT quote answered', async () => {
    const quote = await fetchUsdPrice('ETH', async (url) =>
      url.includes('binance') ? { symbol: 'ETHUSDT', price: '2512.77' } : Promise.reject(new Error('down')),
    );
    expect(quote?.usd).toBe(2512.77);
    expect(quote?.quote).toBe('USDT');
  });

  it('returns nothing rather than a guess when every source fails', async () => {
    expect(await fetchUsdPrice('ETH', async () => {
      throw new Error('offline');
    })).toBeNull();
  });

  it('makes no request at all for a coin it cannot price', async () => {
    let calls = 0;
    const quote = await fetchUsdPrice('SOL', async () => {
      calls += 1;
      return {};
    });
    expect(quote).toBeNull();
    expect(calls).toBe(0);
  });

  it('stays away from a source it was told to skip, and says which ones failed', async () => {
    // A 429 is not a one-off. The caller keeps the failing source on ice for a while rather
    // than re-asking it on every screen.
    const asked: string[] = [];
    const attempts: [string, boolean][] = [];
    const quote = await fetchUsdPrice(
      'ETH',
      async (url) => {
        const host = new URL(url).host;
        asked.push(host);
        if (host === 'coins.llama.fi') throw new Error('HTTP 500');
        return { data: { amount: '2512.61' } };
      },
      {
        skip: ['coingecko'],
        onAttempt: (id, ok) => attempts.push([id, ok]),
      },
    );
    expect(quote?.sourceId).toBe('coinbase');
    expect(asked).toEqual(['coins.llama.fi', 'api.binance.com', 'api.coinbase.com']);
    expect(attempts).toEqual([
      ['llama', false],
      ['binance', false],
      ['coinbase', true],
    ]);
  });

  it('never skips its way out of every source', async () => {
    // If everything is on ice, an answer from a cooled-down source still beats no answer.
    const quote = await fetchUsdPrice(
      'ETH',
      async () => ({ ethereum: { usd: 2513.18 } }),
      { skip: PRICE_SOURCES.map((source) => source.id) },
    );
    expect(quote?.usd).toBe(2513.18);
  });

  it('honours a preferred source without asking the others', async () => {
    const asked: string[] = [];
    const quote = await fetchUsdPrice(
      'ETH',
      async (url) => {
        asked.push(new URL(url).host);
        return { data: { amount: '2512.61' } };
      },
      { prefer: 'coinbase' },
    );
    expect(quote?.sourceId).toBe('coinbase');
    expect(asked).toEqual(['api.coinbase.com']);
  });
});

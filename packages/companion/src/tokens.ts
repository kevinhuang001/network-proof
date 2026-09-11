/**
 * Tokens every wallet shows without being asked.
 *
 * A wallet whose asset list starts empty makes the user paste a contract address before they
 * can see the two stablecoins they almost certainly hold. USDT and USDC are on every chain
 * this wallet supports, so they are seeded here.
 *
 * Two properties this list must have, and both were checked rather than assumed:
 *
 *  1. **The addresses are right.** A wrong address means a wrong balance and — worse — a
 *     transfer built against the wrong contract. Every entry below was verified by asking
 *     the contract itself for `symbol()`, `name()` and `decimals()` on its own chain. Where
 *     the on-chain symbol has since changed (`USDT0` on Polygon and Arbitrum, `USD₮` on
 *     Avalanche), the familiar ticker is kept, because "USDT0" in an asset row reads as a
 *     bug rather than as the same coin.
 *  2. **It leaks nothing.** A shipped list is not a network request: balances are read from
 *     the RPC the user configured, so no third party learns which of these they hold. This
 *     is the opposite of the curated-token-list-plus-price-API approach, which is why the
 *     user can still add any other contract by hand.
 *
 * Nothing is fetched from upstream and nothing is priced: a stale list would be worse than a
 * short one, and prices would require an indexer this wallet refuses to talk to.
 */
export interface SeedToken {
  /** Contract address, checksummed as published. */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

/** Chain id → the tokens shown before the user adds any. */
export const DEFAULT_TOKENS: Record<number, SeedToken[]> = {
  1: [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
  56: [
    { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether USD', decimals: 18 },
    { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18 },
  ],
  137: [
    { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
  10: [
    { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
  42161: [
    { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
  43114: [
    { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
  // Base has no canonical USDT: what circulates there is a bridged wrapper, and seeding a
  // bridged ticker next to the real one is how a user sends the wrong asset.
  8453: [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
  // Testnet: one stablecoin is enough to see something move.
  11155111: [
    { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
};

export function defaultTokens(chainId: number): SeedToken[] {
  return DEFAULT_TOKENS[chainId] ?? [];
}

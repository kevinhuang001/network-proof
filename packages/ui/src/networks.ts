/**
 * The networks these apps support, and their real logos.
 *
 * One list, used by the device (which shows which networks a login covers), by the
 * companion (network picker, chain badge) and by the protocol layer's chain ids. It was
 * previously three hard-coded arrays that had already started to disagree — the device
 * listed six networks, the companion eight.
 *
 * Logos are static files served from each app's `public/logos/` directory rather than
 * imported here, so that all three apps resolve them the same way (`./logos/<file>.png`)
 * without depending on how a bundler treats assets inside a workspace package. See
 * `./logos/README.md` for provenance.
 */

export interface NetworkInfo {
  chainId: number;
  /** User-facing name. */
  label: string;
  /** Ticker, for balances and fee rows. */
  symbol: string;
  /** Native-asset decimals. */
  decimals: number;
  /** File name under `public/logos/`. */
  logo: string;
  /** Solana is not an EVM chain: different curve, different address format. */
  family: 'evm' | 'solana';
}

export const NETWORKS: readonly NetworkInfo[] = [
  { chainId: 1, label: 'Ethereum', symbol: 'ETH', decimals: 18, logo: 'ethereum.png', family: 'evm' },
  { chainId: 56, label: 'BNB Chain', symbol: 'BNB', decimals: 18, logo: 'bnb.png', family: 'evm' },
  { chainId: 137, label: 'Polygon', symbol: 'POL', decimals: 18, logo: 'polygon.png', family: 'evm' },
  { chainId: 10, label: 'OP Mainnet', symbol: 'ETH', decimals: 18, logo: 'optimism.png', family: 'evm' },
  { chainId: 42161, label: 'Arbitrum One', symbol: 'ETH', decimals: 18, logo: 'arbitrum.png', family: 'evm' },
  { chainId: 8453, label: 'Base', symbol: 'ETH', decimals: 18, logo: 'base.png', family: 'evm' },
  { chainId: 43114, label: 'Avalanche', symbol: 'AVAX', decimals: 18, logo: 'avalanche.png', family: 'evm' },
  { chainId: 11155111, label: 'Sepolia', symbol: 'ETH', decimals: 18, logo: 'sepolia.png', family: 'evm' },
  { chainId: 501, label: 'Solana', symbol: 'SOL', decimals: 9, logo: 'solana.png', family: 'solana' },
] as const;

const BY_ID = new Map(NETWORKS.map((network) => [network.chainId, network]));

export function networkById(chainId: number): NetworkInfo | undefined {
  return BY_ID.get(chainId);
}

export function networkLabel(chainId: number): string {
  return BY_ID.get(chainId)?.label ?? `Chain ${chainId}`;
}

/**
 * Logo URL for a chain.
 *
 * Relative on purpose: both apps are built with `base: './'` and the device loads its
 * bundle from the filesystem inside the APK, so an absolute `/logos/...` would 404 there.
 */
export function networkLogoUrl(chainId: number): string | null {
  const network = BY_ID.get(chainId);
  return network ? `./logos/${network.logo}` : null;
}

/** The EVM chains, in display order — what a single device export covers. */
export const EVM_NETWORKS: readonly NetworkInfo[] = NETWORKS.filter((n) => n.family === 'evm');

/**
 * Token marks, by ticker.
 *
 * Keyed by symbol rather than by contract address: the same stablecoin is a different
 * contract on every chain, and a wallet that looked up its icon by address would show a
 * blank chip on eight chains out of nine. These are shipped files, not a fetch — the same
 * privacy property as the chain logos next to them.
 */
const TOKEN_LOGOS: Record<string, string> = {
  USDT: 'usdt.png',
  USDC: 'usdc.png',
};

/** Logo for a token ticker, or null when there is none and the caller should show a chip. */
export function tokenLogoUrl(symbol: string): string | null {
  const file = TOKEN_LOGOS[symbol.toUpperCase()];
  return file ? `./logos/${file}` : null;
}

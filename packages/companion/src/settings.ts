import type { CompanionSettings } from './types';

/**
 * Default settings.
 *
 * The RPC endpoints are public nodes. They are deliberately user-editable: a wallet
 * that hard-codes one provider leaks every address the user owns to that provider,
 * and hands it the power to censor or delay broadcasts. The UI says so explicitly.
 */
export const DEFAULT_SETTINGS: CompanionSettings = {
  chainId: 1,
  rpcUrls: {
    1: 'https://ethereum-rpc.publicnode.com',
    10: 'https://mainnet.optimism.io',
    56: 'https://bsc-dataseed.binance.org',
    137: 'https://polygon-bor-rpc.publicnode.com',
    8453: 'https://mainnet.base.org',
    42161: 'https://arb1.arbitrum.io/rpc',
    43114: 'https://api.avax.network/ext/bc/C/rpc',
    11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
    // Solana is not an EVM chain: different JSON-RPC methods (getBalance returns
    // lamports), different address format, 9 decimals. It lives here because the user
    // experiences it as "another network in the picker".
    // NOT `api.mainnet-beta.solana.com`: that endpoint answers HTTP 403 to any request
    // carrying an `Origin` header, which is every request a browser makes. Verified by
    // sending the same JSON-RPC call with and without `Origin` — 200 without, 403 with.
    // PublicNode answers both and sends `access-control-allow-origin: *`.
    501: 'https://solana-rpc.publicnode.com',
  },
  accountIndex: 0,
  schemeId: 'bip44',
  addressIndex: 0,
  addressCount: 20,
  visibleAccounts: 1,
  accountNames: {},
  hiddenAccounts: [],
  qrFragmentLength: 300,
  qrFrameDurationMs: 420,
  autoBroadcast: true,
};

export interface ChainMeta {
  chainId: number;
  name: string;
  shortName: string;
  symbol: string;
  /** Decimals of the native coin. 18 on every chain this wallet supports. */
  decimals: number;
  explorerUrl: string;
}

export const CHAINS: ChainMeta[] = [
  { chainId: 1, name: 'Ethereum Mainnet', shortName: 'Ethereum', symbol: 'ETH', decimals: 18, explorerUrl: 'https://etherscan.io' },
  { chainId: 10, name: 'OP Mainnet', shortName: 'Optimism', symbol: 'ETH', decimals: 18, explorerUrl: 'https://optimistic.etherscan.io' },
  { chainId: 56, name: 'BNB Smart Chain', shortName: 'BNB Chain', symbol: 'BNB', decimals: 18, explorerUrl: 'https://bscscan.com' },
  { chainId: 137, name: 'Polygon PoS', shortName: 'Polygon', symbol: 'POL', decimals: 18, explorerUrl: 'https://polygonscan.com' },
  { chainId: 8453, name: 'Base', shortName: 'Base', symbol: 'ETH', decimals: 18, explorerUrl: 'https://basescan.org' },
  { chainId: 42161, name: 'Arbitrum One', shortName: 'Arbitrum', symbol: 'ETH', decimals: 18, explorerUrl: 'https://arbiscan.io' },
  { chainId: 43114, name: 'Avalanche C-Chain', shortName: 'Avalanche', symbol: 'AVAX', decimals: 18, explorerUrl: 'https://snowtrace.io' },
  { chainId: 11155111, name: 'Sepolia Testnet', shortName: 'Sepolia', symbol: 'ETH', decimals: 18, explorerUrl: 'https://sepolia.etherscan.io' },
  { chainId: 501, name: 'Solana', shortName: 'Solana', symbol: 'SOL', decimals: 9, explorerUrl: 'https://solscan.io' },
];

export function chainMeta(chainId: number): ChainMeta | undefined {
  return CHAINS.find((chain) => chain.chainId === chainId);
}

/** Solana's chain id in this app. It is not CAIP-2; it is just an internal key. */
export const SOLANA_CHAIN_ID = 501;

export function isSolanaChain(chainId: number): boolean {
  return chainId === SOLANA_CHAIN_ID;
}

/**
 * The symbol of a chain's own coin.
 *
 * Fees are always paid in it, whatever token is being moved, so any screen that prices a
 * transaction needs it. The fallback keeps an unknown chain readable instead of blank.
 */
export function nativeSymbol(chainId: number): string {
  return chainMeta(chainId)?.symbol ?? 'ETH';
}

export function chainLabel(chainId: number): string {
  return chainMeta(chainId)?.shortName ?? `Chain ${chainId}`;
}

export function explorerTxUrl(chainId: number, hash: string): string | null {
  const meta = chainMeta(chainId);
  return meta ? `${meta.explorerUrl}/tx/${hash}` : null;
}

import { deriveAddressFromXpub } from '@netproof/core';
import { SOLANA_CHAIN_ID, isSolanaChain } from './settings';
import type { XpubExportMessage } from '@netproof/core';
import type { ConnectedWallet, CompanionSettings } from './types';

/**
 * Watch-only account derivation.
 *
 * The single most important property of a companion wallet: **no private key ever
 * exists here.** Everything this module touches is derived from extended public
 * keys, so a full compromise of the browser profile yields the ability to *watch*
 * the wallet and to *ask* the device for signatures — never the ability to sign.
 *
 * It also means the companion and the device must agree on derivation, or the
 * device would refuse every signature. `deriveAddressFromXpub` is the same helper
 * the device uses, which is why there is no separate implementation to drift.
 */

/** A conservative ceiling, so a mistyped setting cannot trigger a huge derivation. */
export const MAX_ADDRESSES_PER_ACCOUNT = 200;

export interface ResolvedAccount {
  address: string;
  path: string;
  scheme: string;
  account: number;
  index: number;
}

/**
 * Every account the device exported for a scheme, in display order.
 *
 * A guided wallet is never one address: `m/44'/60'/0'` alone owns unbounded
 * receiving addresses, and a user with funds spread over several accounts owns
 * several of those trees. The companion therefore shows accounts as first-class
 * objects and derives addresses *within* whichever one is selected.
 *
 * Note what is impossible here, and why the device must export each account: the
 * account key itself is hardened (`m/44'/60'/i'`), and hardened children cannot be
 * derived from a public key. So the companion can never invent account 7 — it can
 * only enumerate accounts the device chose to reveal.
 */
/**
 * A Solana wallet's accounts are the addresses the device exported.
 *
 * There is no derivation to do: the companion cannot walk further, and it cannot
 * verify a path against an address without the private key. Both checks happen on the
 * device at signing time, which is why a lying export fails closed rather than
 * silently showing the wrong account.
 */
export function solanaAccounts(wallet: ConnectedWallet): ResolvedAccount[] {
  return (wallet.addresses ?? []).map((entry, index) => ({
    address: entry.address,
    path: entry.path,
    scheme: 'solana',
    account: index,
    index: 0,
  }));
}

/** True when this export contains anything for the given chain. */
export function supportsChain(wallet: ConnectedWallet, chainId: number): boolean {
  return chainId === SOLANA_CHAIN_ID ? (wallet.addresses?.length ?? 0) > 0 : wallet.accounts.length > 0;
}

export function listAccounts(
  wallet: ConnectedWallet,
  schemeId?: string,
): ConnectedWallet['accounts'] {
  const entries = schemeId
    ? wallet.accounts.filter((entry) => entry.scheme === schemeId)
    : wallet.accounts;
  return [...entries].sort((a, b) => a.account - b.account);
}

/** Derive the first `count` receiving addresses of one exported account. */
export function deriveAccountAddresses(
  wallet: ConnectedWallet,
  schemeId: string,
  account: number,
  count: number,
): ResolvedAccount[] {
  const entry = wallet.accounts.find(
    (candidate) => candidate.scheme === schemeId && candidate.account === account,
  );
  if (!entry) return [];
  const bounded = Math.max(1, Math.min(count, MAX_ADDRESSES_PER_ACCOUNT));
  const addresses: ResolvedAccount[] = [];
  for (let index = 0; index < bounded; index++) {
    try {
      const derived = deriveAddressFromXpub(entry.xpub, entry.scheme, entry.account, index);
      addresses.push({
        address: derived.address,
        path: derived.path,
        scheme: entry.scheme,
        account: entry.account,
        index,
      });
    } catch {
      // A scheme whose template cannot be walked from this xpub simply yields fewer
      // addresses; that is a property of the scheme, not an error to surface.
      break;
    }
  }
  return addresses;
}

/** The addresses of the currently selected account. */
export function resolveAccounts(wallet: ConnectedWallet, settings: CompanionSettings): ResolvedAccount[] {
  if (isSolanaChain(settings.chainId)) {
    const all = solanaAccounts(wallet);
    return all.slice(settings.accountIndex, settings.accountIndex + 1);
  }
  return deriveAccountAddresses(
    wallet,
    settings.schemeId,
    settings.accountIndex,
    settings.addressCount,
  );
}

/**
 * Every address the companion can see, across every exported account.
 *
 * This is what gets handed to a dApp through `eth_accounts`, so its size is a
 * deliberate trade-off: more addresses means a dApp can find funds the user spread
 * around, but it also discloses more of the user's wallet structure to that site.
 * `addressCount` bounds the disclosure and is user-configurable.
 */
export function allAddresses(wallet: ConnectedWallet, settings: CompanionSettings): ResolvedAccount[] {
  if (isSolanaChain(settings.chainId)) {
    // Lazy by construction: only the addresses the user has revealed are returned, so
    // a build of 20 exported addresses does not dump 20 accounts into the UI.
    return solanaAccounts(wallet).slice(0, Math.max(1, settings.visibleAccounts));
  }
  const accounts = listAccounts(wallet, settings.schemeId);
  return accounts.flatMap((entry) =>
    deriveAccountAddresses(wallet, entry.scheme, entry.account, settings.addressCount),
  );
}

export function primaryAccount(wallet: ConnectedWallet, settings: CompanionSettings): ResolvedAccount | null {
  const accounts = resolveAccounts(wallet, settings);
  return accounts[settings.addressIndex] ?? accounts[0] ?? null;
}

/**
 * Convert a scanned `NP-XPUB` message into the shape the companion stores.
 *
 * This boundary conversion lives here rather than in each host so the extension and
 * the web page cannot end up storing subtly different wallets from the same QR
 * code. Note what is *not* copied: nothing secret, because the message contains
 * nothing secret.
 */
export function walletFromXpubMessage(
  message: XpubExportMessage,
  connectedAt = Date.now(),
): ConnectedWallet {
  // A device exports both families in one payload: EVM account xpubs (usable on every
  // EVM chain) plus Solana addresses. The companion stores all of it and picks per
  // network, so the device never has to ask which chain the user wants.
  if (message.accounts.length === 0 && (message.addresses?.length ?? 0) === 0) {
    throw new Error('设备没有导出任何账户或地址');
  }
  return {
    ...(message.addresses !== undefined
      ? { addresses: message.addresses.map((entry) => ({ path: entry.path, address: entry.address })) }
      : {}),
    masterFingerprint: message.fingerprint,
    passphraseProtected: message.passphraseProtected,
    rootXpub: message.rootXpub,
    coinType: message.coinType,
    device: message.device,
    accounts: message.accounts.map((account) => ({
      account: account.account,
      scheme: account.scheme,
      schemeLabel: account.schemeLabel,
      xpubPath: account.xpubPath,
      xpub: account.xpub,
      firstAddress: account.firstAddress,
      firstAddressPath: account.firstAddressPath,
    })),
    schemes: message.schemes,
    connectedAt,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { feeTiers, forwardToNode } from '@netproof/companion';
import type { FeeTier } from '@netproof/companion';

/**
 * The chain's current prices, as three choices, for any screen that is about to sign.
 *
 * Every transaction needs a price and the user is the only one who knows whether they are in
 * a hurry, so both places that build a transaction — the send form and the dApp approval
 * screen — offer the same three tiers, read from the same block, on every chain: an EIP-1559
 * chain gives a base fee plus a tip, an older one a single price.
 *
 * The read repeats while the screen is open, because a fee that was right when the screen
 * opened is not necessarily right when the user presses send.
 */

/** Gas price fields for a JSON-RPC transaction: a ceiling and a tip, or one legacy price. */
export interface FeeFields {
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

/** How often to re-read, in milliseconds. One block is 12s on mainnet; this catches up. */
const REFRESH_MS = 20_000;

export interface FeeChoice {
  tiers: FeeTier[];
  tierId: FeeTier['id'];
  select: (id: FeeTier['id']) => void;
  /**
   * Bumped by every `select`, including one that picks the tier already chosen.
   *
   * Prices move while a screen is open, and the transaction is built once from a snapshot of
   * the price the user picked — rebuilding it on every poll would throw away a QR the user may
   * be halfway through scanning. Tapping a price is the way to say "at today's numbers".
   */
  version: number;
  /** The chosen tier, or null while the node has not answered. */
  tier: FeeTier | null;
  /** Percent of the last block's gas limit that was used, or null before the first answer. */
  load: number | null;
  /** True when the last read failed and there is nothing usable yet. */
  feeError: boolean;
  /** The chosen tier in the shape a JSON-RPC transaction wants, or null. */
  fields: FeeFields | null;
}

export function useFeeTiers({
  rpcUrl,
  chainId,
}: {
  rpcUrl: string | undefined;
  chainId: number;
}): FeeChoice {
  const [tiers, setTiers] = useState<FeeTier[]>([]);
  const [tierId, setTierId] = useState<FeeTier['id']>('market');
  const [version, setVersion] = useState(0);
  const [load, setLoad] = useState<number | null>(null);
  const [feeError, setFeeError] = useState(false);

  useEffect(() => {
    if (!rpcUrl) return;
    let cancelled = false;

    const read = async (): Promise<void> => {
      const forward = (method: string, params: unknown[]): Promise<unknown> =>
        forwardToNode(method, params, { rpcUrl, chainId });
      try {
        const [block, gasPrice] = await Promise.all([
          forward('eth_getBlockByNumber', ['latest', false]).catch(() => null),
          forward('eth_gasPrice', []),
        ]);
        const latest = block as {
          baseFeePerGas?: string;
          gasUsed?: string;
          gasLimit?: string;
        } | null;
        const priority = await forward('eth_maxPriorityFeePerGas', [])
          .then((value) => BigInt(value as string))
          .catch(() => undefined);
        if (cancelled) return;
        const base = latest?.baseFeePerGas;
        setTiers(
          feeTiers({
            ...(typeof base === 'string' ? { baseFeePerGas: BigInt(base) } : {}),
            ...(priority !== undefined ? { priorityFeePerGas: priority } : {}),
            gasPrice: BigInt(gasPrice as string),
          }),
        );
        /*
         * Congestion, from the same block: how much of the gas limit the last block used.
         * That number is what the base fee is computed from — a full block pushes it up and a
         * cheap tier waits — so it is a fact from the chain rather than a guess about
         * inclusion.
         */
        const used = latest?.gasUsed;
        const limit = latest?.gasLimit;
        setLoad(
          typeof used === 'string' && typeof limit === 'string' && BigInt(limit) > 0n
            ? Number((BigInt(used) * 100n) / BigInt(limit))
            : null,
        );
        setFeeError(false);
      } catch {
        // Keep whatever was read before: a single failed poll should not take the choices
        // away from a user who is halfway through a form.
        if (!cancelled) setFeeError(true);
      }
    };

    void read();
    const timer = window.setInterval(() => void read(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rpcUrl, chainId]);

  const select = useCallback((id: FeeTier['id']): void => {
    setTierId(id);
    setVersion((current) => current + 1);
  }, []);

  const tier = tiers.find((entry) => entry.id === tierId) ?? tiers[1] ?? null;

  /*
   * One shape per chain, matching what the tier carries: a ceiling plus a tip where the chain
   * has a base fee, a single price where it does not. Hex, because that is what JSON-RPC
   * numbers look like on the wire.
   */
  const fields: FeeFields | null =
    tier === null
      ? null
      : tier.gasPrice !== undefined
        ? { gasPrice: `0x${tier.gasPrice.toString(16)}` }
        : {
            maxFeePerGas: `0x${(tier.maxFeePerGas ?? 0n).toString(16)}`,
            maxPriorityFeePerGas: `0x${(tier.maxPriorityFeePerGas ?? 0n).toString(16)}`,
          };

  return { tiers, tierId, select, version, tier, load, feeError, fields };
}

/**
 * One word for how full the last block was, or null when the chain has not answered.
 *
 * Shown next to the fee, because "慢" costs the same whether the chain is quiet or on fire —
 * what changes is whether the transaction lands in the next block or in an hour, and the
 * block's own fill level is the honest half of that answer the wallet can actually know.
 */
export function busyLabel(load: number | null): string | null {
  if (load === null) return null;
  if (load >= 90) return '网络繁忙';
  if (load >= 60) return '网络正常';
  return '网络空闲';
}

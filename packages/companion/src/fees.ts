/**
 * Fee tiers, from the chain's own numbers.
 *
 * A wallet that offers one fee is a wallet that is wrong most of the time: what a transfer
 * costs swings by an order of magnitude between a quiet Sunday and a popular mint, and the
 * user is the only one who knows whether they are in a hurry. So there are three, and they
 * are computed from what the node reports rather than from constants — the previous version
 * subtracted a hard-coded 30 gwei, which on a cheap chain told a user with 0.001 ETH that
 * they could send 0.00037 of it.
 *
 * The inputs, all from the node:
 *   - `baseFeePerGas` from the latest block: what the chain charges everyone, burned. Its
 *     absence means the chain is not EIP-1559, and the split below does not apply.
 *   - `priorityFeePerGas`: the tip the node thinks gets included next.
 *   - `gasPrice`: the node's all-in suggestion, used as the fallback and as a floor.
 *
 * Anything derived here is an estimate, and the screen says so — the wallet cannot promise
 * inclusion, only price, and pricing it honestly is the part it can do.
 */
export interface FeeTier {
  id: 'slow' | 'market' | 'fast';
  label: string;
  /** EIP-1559 chains: the ceiling this transaction will pay per gas. */
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  /** Pre-EIP-1559 chains: the single price. */
  gasPrice?: bigint;
}

export interface FeeInputs {
  /** From the latest block; absent on a chain without EIP-1559. */
  baseFeePerGas?: bigint;
  /** The node's tip suggestion. */
  priorityFeePerGas?: bigint;
  /** The node's all-in suggestion, always present. */
  gasPrice: bigint;
}

/** A tenth of a gwei: below this a tip is not meaningfully different from zero. */
const MIN_TIP = 100_000_000n;

function max(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** Multiply by a fraction given as (numerator, denominator), rounding up. */
function scale(value: bigint, numerator: bigint, denominator: bigint): bigint {
  return (value * numerator + denominator - 1n) / denominator;
}

export function feeTiers(inputs: FeeInputs): FeeTier[] {
  const { baseFeePerGas, gasPrice } = inputs;
  const tip = inputs.priorityFeePerGas ?? 0n;

  if (baseFeePerGas !== undefined && baseFeePerGas > 0n) {
    /*
     * EIP-1559. The base fee is burned and moves every block, so the ceiling has to leave room
     * for it to rise while the transaction waits: +12.5% for the next block, more for the one
     * after that. The tip is what buys position in the queue.
     */
    const slowTip = max(scale(tip, 1n, 2n), MIN_TIP);
    const fastTip = max(scale(tip, 3n, 2n), MIN_TIP);
    const marketTip = max(tip, MIN_TIP);

    const tier = (
      id: FeeTier['id'],
      label: string,
      priority: bigint,
      baseMultiplier: [bigint, bigint],
    ): FeeTier => ({
      id,
      label,
      maxPriorityFeePerGas: priority,
      maxFeePerGas: scale(baseFeePerGas, baseMultiplier[0], baseMultiplier[1]) + priority,
    });

    return [
      tier('slow', '慢', slowTip, [11n, 10n]),
      tier('market', '标准', marketTip, [13n, 10n]),
      tier('fast', '快', fastTip, [16n, 10n]),
    ];
  }

  /*
   * No base fee: a chain that prices gas the old way, where there is one number and the only
   * lever is nudging it. `gasPrice` from the node is the market rate.
   */
  return [
    { id: 'slow', label: '慢', gasPrice: scale(gasPrice, 9n, 10n) },
    { id: 'market', label: '标准', gasPrice },
    { id: 'fast', label: '快', gasPrice: scale(gasPrice, 5n, 4n) },
  ];
}

/** What a tier costs for a given amount of gas, in wei. */
export function tierCost(tier: FeeTier, gasLimit: bigint): bigint {
  const perGas = tier.maxFeePerGas ?? tier.gasPrice ?? 0n;
  return perGas * gasLimit;
}

import type { ReactNode } from 'react';
import { tierCost } from '@netproof/companion';
import type { FeeTier } from '@netproof/companion';
import { formatEth } from '../screens/Wallet';
import { busyLabel } from '../lib/fees';
import { formatUsd, usdValue } from '../lib/prices';

/**
 * 慢 / 标准 / 快, with what each one costs for this particular transaction.
 *
 * The cost is per transaction, not per gas: the chips are shown with the transaction's own gas
 * amount, so an ERC-20 transfer is priced at its ~46 000 gas and a plain send at 21 000, and
 * the two numbers are comparable to the amount the user is sending. When the amount of gas is
 * not known yet — a form with no recipient — the chips show the names alone rather than a
 * price that would be wrong.
 */
export function FeeSelector({
  tiers,
  tierId,
  onSelect,
  gas,
  load,
  feeError,
  unit,
  pendingHint,
  /** Spot price of `unit` in dollars, or null when there is none to show. */
  usd,
}: {
  tiers: FeeTier[];
  tierId: FeeTier['id'];
  onSelect: (id: FeeTier['id']) => void;
  /** Gas this transaction is expected to use, or null when that is not known yet. */
  gas: bigint | null;
  load: number | null;
  feeError: boolean;
  /** The symbol the fee is paid in — the chain's own coin, even for a token transfer. */
  unit: string;
  /** What to say while the cost cannot be shown yet. */
  pendingHint: string;
  usd?: number | null;
}): ReactNode {
  const chosen = tiers.find((entry) => entry.id === tierId) ?? tiers[1] ?? null;
  const cost = chosen === null || gas === null ? null : tierCost(chosen, gas);
  const busy = busyLabel(load);
  // The dollar figure rides with the number it is derived from, and is silent when there is
  // no price: an invented or stale one is worse than none.
  const dollars = cost === null ? null : usdValue(cost, usd ?? null);

  return (
    <div className="np-field">
      <div className="np-row np-row--between">
        <label className="np-label">手续费</label>
        {cost !== null ? (
          <span className="np-body np-body--tight np-num">
            预计 {formatEth(cost)} {unit}
            {dollars === null ? '' : ` ≈ ${formatUsd(dollars)}`}
          </span>
        ) : null}
      </div>
      <div className="np-chip-row" style={{ marginTop: 6 }}>
        {tiers.map((entry) => {
          const each = gas === null ? null : tierCost(entry, gas);
          return (
            <button
              key={entry.id}
              type="button"
              className={`np-chip${entry.id === tierId ? ' np-chip--active' : ''}`}
              onClick={() => onSelect(entry.id)}
            >
              {each === null ? entry.label : `${entry.label} · ${formatEth(each)}`}
            </button>
          );
        })}
        {tiers.length === 0 ? (
          <span className={`np-body np-body--tight${feeError ? ' np-down' : ' np-ink-3'}`}>
            {feeError ? '无法读取当前费率，请检查网络后重试' : '正在读取费率…'}
          </span>
        ) : null}
      </div>
      {tiers.length > 0 && cost === null ? (
        <div className="np-body np-body--tight np-ink-3">{pendingHint}</div>
      ) : tiers.length > 0 && busy !== null ? (
        <div className="np-body np-body--tight np-ink-3">{`${busy} · 区块占用 ${load}%`}</div>
      ) : null}
    </div>
  );
}

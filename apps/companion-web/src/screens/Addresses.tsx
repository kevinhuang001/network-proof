import type { ReactNode } from 'react';
import { chainLabel, isSolanaChain } from '@netproof/companion';
import { useCompanion } from '../App';
import { CopyButton, Header, KeyValue } from '../ui/kit';
import { useVisibleAccounts } from './Wallet';
import { AddressQr } from './Wallet';

/**
 * Address details for the account you are on.
 *
 * One address, where it comes from, and a way to hand it to someone: a scannable code, the
 * full string, a copy button, and the derivation path. The list of every other address the
 * wallet could derive was here too, and it answered a question nobody asks from this screen
 * — the account list already *is* those addresses, one row each.
 */
export function AddressesScreen(): ReactNode {
  const { wallet, settings, navigate } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const current = accounts[settings.addressIndex] ?? accounts[0];
  const solana = isSolanaChain(settings.chainId);

  return (
    <>
      <Header
        title="地址详情"
        subtitle={wallet?.name}
        onBack={() => navigate({ name: 'home' })}
      />
      <div className="np-main">
        {current ? (
          <>
            <AddressQr value={current.address} />

            <div className="np-card">
              <div className="np-address">{current.address}</div>
              <div className="np-row" style={{ marginTop: 10 }}>
                <CopyButton value={current.address} label="复制地址" />
              </div>
            </div>

            <div className="np-card">
              <KeyValue label="HD 派生路径" value={current.path} mono />
              <KeyValue label="网络" value={chainLabel(settings.chainId)} />
              <KeyValue label={solana ? '地址序号' : '账户序号'} value={String(current.index + 1)} />
            </div>
          </>
        ) : (
          <div className="np-card np-card--sunken">
            <div className="np-body np-body--tight">这条链上没有可用地址。</div>
          </div>
        )}

      </div>
    </>
  );
}

import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  allAddresses,
  isSolanaChain,
  listAccounts,
  type CompanionSettings,
  type ResolvedAccount,
} from '@netproof/companion';
import { useCompanion } from '../App';
import { Alert, Button, Header, Toast, shortAddress, useToast } from '../ui/kit';
import { CheckIcon } from '../ui/icons';
import { TextField } from '@netproof/ui/text-field';
import type { WalletRecord } from '../lib/store';

/**
 * Wallets, then accounts.
 *
 * The outermost object in this app is a wallet — a paired device, one mnemonic, one
 * fingerprint — and its derivations are the accounts. That is MetaMask's shape, and the
 * shape of every wallet a person has used: you are always somewhere in a wallet, and
 * "switch account" and "switch wallet" are different actions that must not be confused.
 *
 * An earlier version supported exactly one, so pairing a second device silently replaced
 * the first. Everything the user had set up — names, the visible account list, which
 * account they were on — went with it.
 */
export function ManageScreen(): ReactNode {
  const {
    wallets,
    wallet,
    activateWallet,
    renameWallet,
    forgetWallet,
    unpair,
    navigate,
    settings,
    updateSettings,
    show: notify,
  } = useCompanion();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const { toast, show } = useToast();

  return (
    <>
      <Header title="管理" onBack={() => navigate({ name: 'home' })} />
      <div className="np-main">
        {wallets.length === 0 ? <Alert tone="info">还没有配对的硬件钱包。</Alert> : null}

        {wallets.map((entry) => {
          const active = entry.id === wallet?.id;
          const itsAccounts = accountsOf(entry, settings);
          return (
            <div className="np-card" key={entry.id}>
              <div className="np-row">
                <button
                  type="button"
                  className="np-icon-btn"
                  style={{
                    background: active ? 'var(--np-ink)' : 'var(--np-bg-sunken)',
                    color: active ? '#fff' : 'var(--np-ink-3)',
                    border: 0,
                  }}
                  onClick={() => activateWallet(entry.id)}
                  aria-label={active ? '当前钱包' : '切换到该钱包'}
                >
                  {active ? <CheckIcon size={16} /> : <span style={{ fontSize: 11 }}>{entry.name.slice(0, 1)}</span>}
                </button>
                <div className="np-grow" style={{ minWidth: 0 }}>
                  {renaming === entry.id ? (
                    <TextField
                      className="np-input"
                      style={{ padding: '6px 10px', fontSize: 14 }}
                      value={draft}
                      autoFocus
                      maxLength={24}
                      onChange={setDraft}
                      onBlur={() => {
                        renameWallet(entry.id, draft);
                        setRenaming(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 0,
                        padding: 0,
                        textAlign: 'left',
                        font: 'inherit',
                        color: 'inherit',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setRenaming(entry.id);
                        setDraft(entry.name);
                      }}
                    >
                      <div className="np-subtitle">{entry.name} ✎</div>
                    </button>
                  )}
                  <div className="np-mono np-ink-3" style={{ fontSize: 12 }}>
                    {entry.masterFingerprint}
                  </div>
                </div>
                <Button size="small" variant="danger-soft" onClick={() => setConfirming(entry.id)}>
                  移除
                </Button>
              </div>

              {/* Accounts belong to a wallet. Shown inside it, never as a separate list
                  elsewhere — that split is what made this screen hard to follow. */}
              <div className="np-list" style={{ marginTop: 12, borderRadius: 14 }}>
                {itsAccounts.map((account, index) => (
                  <button
                    key={account.path}
                    type="button"
                    className="np-list__item"
                    style={{ borderRadius: 12 }}
                    onClick={() => {
                      if (!active) activateWallet(entry.id);
                      updateSettings({ addressIndex: index });
                    }}
                  >
                    <span className="np-grow" style={{ minWidth: 0 }}>
                      {renaming === account.address ? (
                        <TextField
                          className="np-input"
                          style={{ padding: '6px 10px', fontSize: 14 }}
                          value={draft}
                          autoFocus
                          onChange={setDraft}
                          onBlur={() => {
                            updateSettings({
                              accountNames: {
                                ...settings.accountNames,
                                [account.address.toLowerCase()]: draft.trim() || account.name,
                              },
                            });
                            setRenaming(null);
                          }}
                        />
                      ) : (
                        <span style={{ display: 'block' }}>
                          <span className="np-subtitle" style={{ display: 'block' }}>
                            {account.name}
                          </span>
                          <span className="np-mono np-ink-3" style={{ fontSize: 12 }}>
                            {shortAddress(account.address, 8, 6)}
                          </span>
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="np-btn np-btn--ghost np-btn--small"
                      onClick={(event) => {
                        event.stopPropagation();
                        setRenaming(account.address);
                        setDraft(account.name);
                      }}
                    >
                      改名
                    </button>
                    {active && index === settings.addressIndex ? <CheckIcon size={18} /> : null}
                  </button>
                ))}
                <button
                  type="button"
                  className="np-list__item"
                  style={{ borderRadius: 12 }}
                  onClick={() => {
                    if (!active) activateWallet(entry.id);
                    const max = maxAccounts(entry, settings);
                    if (itsAccounts.length >= max) {
                      notify('没有更多可显示地址了，请到「账户与派生」提高派生数量');
                      return;
                    }
                    updateSettings({ visibleAccounts: itsAccounts.length + 1 });
                  }}
                >
                  <span className="np-grow">+ 添加账户</span>
                  <span className="np-body np-body--tight np-ink-3">
                    {itsAccounts.length} / {maxAccounts(entry, settings)}
                  </span>
                </button>
              </div>
            </div>
          );
        })}

        <div className="np-grid-2">
          <Button onClick={() => navigate({ name: 'connect' })}>添加钱包</Button>
          <Button variant="secondary" onClick={() => navigate({ name: 'advanced' })}>
            账户与派生
          </Button>
        </div>

        {confirming ? (
          <div className="np-mask" onClick={() => setConfirming(null)}>
            <div className="np-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="np-title">
                移除「{wallets.find((entry) => entry.id === confirming)?.name}」？
              </div>
              <div className="np-body np-body--tight">
                只删除本机的观察记录，设备上的资产不受影响，随时可以重新扫码加回来。
              </div>
              <Button
                variant="danger"
                block
                onClick={() => {
                  forgetWallet(confirming);
                  setConfirming(null);
                  show('已移除');
                }}
              >
                移除
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                取消
              </Button>
            </div>
          </div>
        ) : null}

        {wallets.length > 0 ? (
          <Button
            variant="ghost"
            block
            onClick={() => {
              unpair();
              show('已清除本机全部数据');
            }}
          >
            清除本机全部数据
          </Button>
        ) : null}
      </div>
      <Toast message={toast} />
    </>
  );
}

/** The accounts a wallet shows, honouring that wallet's own visible count. */
function accountsOf(entry: WalletRecord, settings: CompanionSettings): NamedAccount[] {
  const scoped: CompanionSettings = {
    ...settings,
    addressIndex: entry.addressIndex,
    visibleAccounts: entry.visibleAccounts,
  };
  return allAddresses(entry, scoped)
    .slice(0, Math.max(1, entry.visibleAccounts))
    .map((account, index) => ({
      ...account,
      ordinal: index + 1,
      name: settings.accountNames[account.address.toLowerCase()] ?? `账户 ${index + 1}`,
    }));
}

interface NamedAccount extends ResolvedAccount {
  ordinal: number;
  name: string;
}

/** How many accounts a wallet can reveal: what the device exported, times the depth. */
function maxAccounts(entry: WalletRecord, settings: CompanionSettings): number {
  if (isSolanaChain(settings.chainId)) return entry.addresses?.length ?? 0;
  return listAccounts(entry, settings.schemeId).length * Math.max(1, settings.addressCount);
}

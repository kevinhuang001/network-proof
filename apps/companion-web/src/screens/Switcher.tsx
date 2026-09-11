import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  MAX_ADDRESSES_PER_ACCOUNT,
  isSolanaChain,
  visibleAccounts,
  type CompanionSettings,
  type ResolvedAccount,
} from '@netproof/companion';
import { TextField } from '@netproof/ui/text-field';
import { useCompanion } from '../App';
import { Button, shortAddress } from '../ui/kit';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  InfoIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '../ui/icons';
import type { WalletRecord } from '../lib/store';

/**
 * The switcher, and the only place wallets and accounts are managed.
 *
 * There used to be a separate 管理 screen behind a 管理 button, and the switcher was a
 * read-only list. That split meant two screens showed the same two levels, and the one you
 * were looking at was never the one that could act: you had to leave the list to rename
 * something you could see in it, then come back. Switching and managing are the same
 * intent, so they are the same screen.
 *
 * Shape, following the reference wallet: wallets are collapsible groups, accounts are what
 * you pick, the current one is checked, and "+ 添加账户" sits at the same level as the
 * accounts it adds to.
 */
export interface NamedAccount extends ResolvedAccount {
  ordinal: number;
  name: string;
}

/** The accounts a wallet shows, honouring that wallet's own visible count. */
export function accountsOf(entry: WalletRecord, settings: CompanionSettings): NamedAccount[] {
  const scoped: CompanionSettings = {
    ...settings,
    addressIndex: entry.addressIndex,
    visibleAccounts: entry.visibleAccounts,
    hiddenAccounts: entry.hiddenAccounts ?? [],
  };
  return visibleAccounts(entry, scoped, MAX_ADDRESSES_PER_ACCOUNT).map((account, index) => ({
    ...account,
    ordinal: index + 1,
    name: settings.accountNames[account.address.toLowerCase()] ?? `账户 ${index + 1}`,
  }));
}

/**
 * How many accounts a wallet can reveal.
 *
 * Solana is bounded by what the device exported, because its paths are hardened-only and the
 * companion cannot compute another address. EVM is bounded only by the hard cap: the accounts
 * are derived from one xpub, so "how many can I have" has no interesting answer below 200.
 */
export function maxAccounts(entry: WalletRecord, settings: CompanionSettings): number {
  if (isSolanaChain(settings.chainId)) return entry.addresses?.length ?? 0;
  return MAX_ADDRESSES_PER_ACCOUNT;
}

export function Switcher({ onClose }: { onClose: () => void }): ReactNode {
  const {
    wallets,
    patchWallet,
    wallet,
    settings,
    updateSettings,
    activateWallet,
    addAccountToWallet,
    renameWallet,
    forgetWallet,
    navigate,
    show,
  } = useCompanion();
  const [expanded, setExpanded] = useState<string | null>(wallet?.id ?? null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  /** Address of the account whose removal is being confirmed. */
  const [removing, setRemoving] = useState<string | null>(null);

  const close = (action: () => void) => () => {
    onClose();
    action();
  };

  /**
   * Remove an account from the list.
   *
   * The derivation still exists — `m/44'/60'/0'/0/i` is arithmetic, not an object — so this
   * records the address as hidden. Recording it by address rather than by index is what keeps
   * the action stable: hiding the third account and later adding a fourth must not reveal a
   * different one in its place.
   */
  const removeAccount = (entry: WalletRecord, address: string): void => {
    const hidden = [...(entry.hiddenAccounts ?? []), address.toLowerCase()];
    if (entry.id !== wallet?.id) {
      // A non-active wallet cannot go through `updateSettings`, which writes to the active
      // one — but it still has to reach React, not just storage.
      patchWallet(entry.id, { hiddenAccounts: hidden });
      return;
    }
    updateSettings({ hiddenAccounts: hidden });
    // If the removed account was the selected one, fall back to the first that is left.
    const remaining = accountsOf({ ...entry, hiddenAccounts: hidden }, settings);
    if (settings.addressIndex >= remaining.length) updateSettings({ addressIndex: 0 });
  };

  const saveAccountName = (): void => {
    if (!renaming) return;
    updateSettings({
      accountNames: { ...settings.accountNames, [renaming.toLowerCase()]: draft.trim() || '账户' },
    });
    setRenaming(null);
  };

  return (
    <>
      {wallets.map((entry) => {
        const open = expanded === entry.id;
        const active = entry.id === wallet?.id;
        const itsAccounts = accountsOf(entry, settings);
        const cap = maxAccounts(entry, settings);
        return (
          <div key={entry.id}>
            {confirming === entry.id ? (
              <div className="np-list__item" style={{ borderRadius: 12 }}>
                <span className="np-grow np-body--tight">移除「{entry.name}」？</span>
                <button
                  type="button"
                  className="np-icon-btn np-icon-btn--plain np-down"
                  aria-label="确认移除"
                  onClick={() => {
                    forgetWallet(entry.id);
                    setConfirming(null);
                    show('已移除钱包');
                  }}
                >
                  <CheckIcon size={18} />
                </button>
                <button
                  type="button"
                  className="np-icon-btn np-icon-btn--plain"
                  aria-label="取消"
                  onClick={() => setConfirming(null)}
                >
                  <CloseIcon />
                </button>
              </div>
            ) : (
              <div className="np-list__item" style={{ borderRadius: 12 }}>
                <button
                  type="button"
                  className="np-icon-btn np-icon-btn--plain"
                  onClick={() => setExpanded(open ? null : entry.id)}
                  aria-expanded={open}
                  aria-label={open ? '收起' : '展开'}
                >
                  {open ? <ChevronUpIcon size={20} /> : <ChevronDownIcon size={20} />}
                </button>

                {renaming === entry.id ? (
                  <>
                    <TextField
                      className="np-input np-grow"
                      style={{ padding: '6px 10px', fontSize: 14 }}
                      value={draft}
                      autoFocus
                      maxLength={24}
                      onChange={setDraft}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          renameWallet(entry.id, draft);
                          setRenaming(null);
                        }
                        if (event.key === 'Escape') setRenaming(null);
                      }}
                    />
                    <button
                      type="button"
                      className="np-icon-btn np-icon-btn--plain"
                      aria-label="保存名称"
                      onClick={() => {
                        renameWallet(entry.id, draft);
                        setRenaming(null);
                      }}
                    >
                      <CheckIcon size={18} />
                    </button>
                    <button
                      type="button"
                      className="np-icon-btn np-icon-btn--plain"
                      aria-label="取消"
                      onClick={() => setRenaming(null)}
                    >
                      <CloseIcon />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="np-grow"
                    style={ROW_BUTTON}
                    onClick={() => setExpanded(open ? null : entry.id)}
                  >
                    <span className="np-subtitle">{entry.name}</span>
                  </button>
                )}

                <button
                  type="button"
                  className="np-icon-btn np-icon-btn--plain"
                  aria-label="重命名钱包"
                  onClick={() => {
                    setRenaming(entry.id);
                    setDraft(entry.name);
                  }}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className="np-icon-btn np-icon-btn--plain"
                  aria-label="移除钱包"
                  onClick={() => setConfirming(entry.id)}
                >
                  <TrashIcon />
                </button>
              </div>
            )}

            {open
              ? itsAccounts.map((account, index) => (
                  <div
                    key={account.path}
                    className="np-list__item"
                    style={{ borderRadius: 12, paddingLeft: 14 }}
                  >
                    {removing === account.address ? (
                      <>
                        <span className="np-grow np-body--tight">移除此账户？</span>
                        <button
                          type="button"
                          className="np-icon-btn np-icon-btn--plain np-down"
                          aria-label="确认移除账户"
                          onClick={() => {
                            removeAccount(entry, account.address);
                            setRemoving(null);
                          }}
                        >
                          <CheckIcon size={18} />
                        </button>
                        <button
                          type="button"
                          className="np-icon-btn np-icon-btn--plain"
                          aria-label="取消"
                          onClick={() => setRemoving(null)}
                        >
                          <CloseIcon />
                        </button>
                      </>
                    ) : renaming === account.address ? (
                      <>
                        <TextField
                          className="np-input np-grow"
                          style={{ padding: '6px 10px', fontSize: 14 }}
                          value={draft}
                          autoFocus
                          onChange={setDraft}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') saveAccountName();
                            if (event.key === 'Escape') setRenaming(null);
                          }}
                        />
                        <button
                          type="button"
                          className="np-icon-btn np-icon-btn--plain"
                          aria-label="保存名称"
                          onClick={saveAccountName}
                        >
                          <CheckIcon size={18} />
                        </button>
                        <button
                          type="button"
                          className="np-icon-btn np-icon-btn--plain"
                          aria-label="取消"
                          onClick={() => setRenaming(null)}
                        >
                          <CloseIcon />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="np-grow"
                        style={{ ...ROW_BUTTON, minWidth: 0 }}
                        onClick={() => {
                          if (!active) activateWallet(entry.id);
                          updateSettings({ addressIndex: index });
                          onClose();
                        }}
                      >
                        <span style={{ display: 'block', minWidth: 0 }}>
                          <span className="np-subtitle" style={{ display: 'block' }}>
                            {account.name}
                          </span>
                          <span className="np-mono np-ink-3" style={{ fontSize: 12 }}>
                            {shortAddress(account.address, 6, 4)}
                          </span>
                        </span>
                      </button>
                    )}

                    {removing === account.address ? null : (
                      <>
                        {active && index === settings.addressIndex ? (
                          <span className="np-badge np-badge--accent">使用中</span>
                        ) : null}
                        <button
                          type="button"
                          className="np-icon-btn np-icon-btn--plain"
                          aria-label="查看地址详情"
                          onClick={() => {
                            if (!active) activateWallet(entry.id);
                            updateSettings({ addressIndex: index });
                            onClose();
                            navigate({ name: 'addresses' });
                          }}
                        >
                          <InfoIcon />
                        </button>
                        <button
                          type="button"
                          className="np-icon-btn np-icon-btn--plain"
                          aria-label="重命名账户"
                          onClick={() => {
                            setRenaming(account.address);
                            setDraft(account.name);
                          }}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="np-icon-btn np-icon-btn--plain"
                          aria-label="移除账户"
                          onClick={() => setRemoving(account.address)}
                        >
                          <TrashIcon />
                        </button>
                      </>
                    )}
                  </div>
                ))
              : null}

            {/* Same rank as an account row, because that is what pressing it produces. */}
            {open ? (
              <button
                type="button"
                className="np-list__item"
                style={{ borderRadius: 12, paddingLeft: 14 }}
                onClick={() => {
                  if (itsAccounts.length >= cap) {
                    show(
                      isSolanaChain(settings.chainId)
                        ? 'Solana 只能用设备导出的地址，换个链就能继续添加账户'
                        : '已达到地址派生上限',
                    );
                    return;
                  }
                  if (!active) activateWallet(entry.id);
                  // Deliberately no `onClose()`: the point of the button is the account that
                  // appears underneath it, and closing the sheet on the same tap hid the only
                  // evidence that anything happened.
                  addAccountToWallet(entry.id);
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    minWidth: 30,
                    borderRadius: 999,
                    background: 'var(--np-bg-sunken)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <PlusIcon size={16} />
                </span>
                <span className="np-grow np-subtitle">添加账户</span>
                <span className="np-body np-body--tight np-ink-3">
                  {itsAccounts.length} / {cap}
                </span>
              </button>
            ) : null}
          </div>
        );
      })}

      <Button size="small" variant="secondary" block onClick={close(() => navigate({ name: 'connect' }))}>
        添加钱包
      </Button>
    </>
  );
}

const ROW_BUTTON = {
  background: 'none',
  border: 0,
  padding: 0,
  textAlign: 'left' as const,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
};

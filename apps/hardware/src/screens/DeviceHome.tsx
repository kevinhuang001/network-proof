import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  buildXpubMessage,
  deriveSolanaKeypair,
  framesForMessage,
  mnemonicToSeed,
  solanaAccountPaths,
} from '@netproof/core';
import { Alert, Button, Header, haptic } from '../components/primitives';
import { QrDisplay } from '../components/QrDisplay';
import {
  ChainBadge,
  CheckIcon,
  GearIcon,
  EyeIcon,
  KeyIcon,
  PlusIcon,
  ShieldIcon,
  TrashIcon,
  WalletIcon,
} from '../components/icons';
import { useSession } from '../state/session';

/**
 * Device screens after unlock.
 *
 * Two jobs, two buttons. Everything else here exists only so those two jobs can be
 * pointed at the right wallet and the right network.
 */

export function DeviceHomeScreen({
  onOpenWallet,
  onManage,
  onSettings,
}: {
  /** Enter the wallet whose hero card was tapped. */
  onOpenWallet: (id: string) => void;
  onManage: () => void;
  onSettings: () => void;
}): ReactNode {
  const { wallets, selectWallet } = useSession();

  return (
    <>
      <Header
        title="NetProof Air"
        action={
          <button
            type="button"
            className="np-icon-btn np-icon-btn--plain"
            onClick={onSettings}
            aria-label="设置"
          >
            <GearIcon size={22} />
          </button>
        }
      />
      <div className="np-main">
        {wallets.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            className="np-card np-card--hero"
            style={{ ...CARD_BUTTON, border: 0 }}
            onClick={() => {
              haptic(12);
              selectWallet(entry.id);
              onOpenWallet(entry.id);
            }}
          >
            <div className="np-row np-row--between">
              <span className="np-label">钱包 {index + 1}</span>
              <ShieldIcon size={16} />
            </div>
            <div className="np-hero-amount" style={{ marginTop: 8, fontSize: 24 }}>
              {entry.label}
            </div>
            <div className="np-row" style={{ marginTop: 10, gap: 12 }}>
              <span className="np-body np-body--tight" style={{ color: 'rgba(255,255,255,.6)' }}>
                {entry.words} 词
              </span>
              <span className="np-body np-body--tight" style={{ color: 'rgba(255,255,255,.6)' }}>
                {entry.provenance.source === 'imported-mnemonic' ? '导入' : '摄像头熵'}
              </span>
            </div>
          </button>
        ))}

        <Button variant="secondary" block onClick={onManage}>
          管理钱包（新建 / 导入 / 删除）
        </Button>
      </div>
    </>
  );
}

/** Inside one wallet: its two jobs. */
export function WalletHomeScreen({
  walletId,
  onLogin,
  onSign,
  onBack,
}: {
  walletId: string;
  onLogin: () => void;
  onSign: () => void;
  onBack: () => void;
}): ReactNode {
  const { wallets, wallet, passphrase, passphraseRequired } = useSession();
  const entry = wallets.find((candidate) => candidate.id === walletId);

  return (
    <>
      <Header title={entry?.label ?? '钱包'} subtitle="两个操作" onBack={onBack} />
      <div className="np-main">
        {passphraseRequired && passphrase.length === 0 ? (
          <Alert tone="warn">未载入 passphrase——将使用不带 passphrase 的账户。</Alert>
        ) : null}

        <BigAction
          icon={<EyeIcon size={26} />}
          title="登录插件钱包"
          hint="显示二维码，让电脑扫描"
          onClick={onLogin}
        />
        <BigAction
          icon={<KeyIcon size={26} />}
          title="扫描并签名"
          hint="扫请求 → 本机确认 → 显示签名"
          onClick={onSign}
        />

        <div className="np-row" style={{ gap: 8, justifyContent: 'center', opacity: 0.55 }}>
          <span className="np-mono" style={{ fontSize: 11 }}>
            {wallet?.masterFingerprint ?? ''}
          </span>
        </div>
      </div>
    </>
  );
}

const CARD_BUTTON = {
  display: 'block' as const,
  width: '100%',
  textAlign: 'left' as const,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
};

function BigAction({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="np-card np-card--raised"
      style={CARD_BUTTON}
      onClick={() => {
        haptic(12);
        onClick();
      }}
    >
      <div className="np-row">
        <span
          style={{
            width: 44,
            height: 44,
            minWidth: 44,
            borderRadius: 14,
            background: 'var(--np-ink)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {icon}
        </span>
        <div className="np-grow">
          <div className="np-title" style={{ fontSize: 18 }}>
            {title}
          </div>
          <div className="np-body np-body--tight">{hint}</div>
        </div>
        <span style={{ opacity: 0.3, fontSize: 20 }}>›</span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export function WalletsScreen({
  onCreate,
  onImport,
  onBack,
}: {
  onCreate: () => void;
  onImport: () => void;
  onBack: () => void;
}): ReactNode {
  const { wallets, activeWallet, selectWallet, deleteWallet, renameWallet } = useSession();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Header title="钱包" subtitle={`${wallets.length} 个 · 共用一个设备密码`} onBack={onBack} />
      <div className="np-main">
        <div className="np-list">
          {wallets.map((entry) => {
            const active = entry.id === activeWallet?.id;
            return (
              <div className="np-list__item" key={entry.id}>
                <button
                  type="button"
                  className="np-icon-btn"
                  style={{
                    background: active ? 'var(--np-ink)' : 'var(--np-bg-sunken)',
                    color: active ? '#fff' : 'var(--np-ink-3)',
                    border: 0,
                  }}
                  onClick={() => selectWallet(entry.id)}
                  aria-label={active ? '当前钱包' : '切换到该钱包'}
                >
                  {active ? <CheckIcon size={16} /> : <WalletIcon size={16} />}
                </button>
                <div className="np-grow" style={{ minWidth: 0 }}>
                  {renaming === entry.id ? (
                    <input
                      className="np-input"
                      style={{ padding: '6px 10px', fontSize: 14 }}
                      value={draft}
                      autoFocus
                      onChange={(event) => setDraft(event.target.value)}
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
                        setDraft(entry.label);
                      }}
                    >
                      <div className="np-subtitle">{entry.label} ✎</div>
                    </button>
                  )}
                  <div className="np-body np-body--tight">
                    {entry.words} 词 ·{' '}
                    {entry.provenance.source === 'imported-mnemonic' ? '导入' : '摄像头熵'}
                  </div>
                </div>
                <button
                  type="button"
                  className="np-icon-btn np-icon-btn--plain"
                  onClick={() => setConfirming(entry.id)}
                  aria-label="删除钱包"
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="np-grid-2">
          <Button onClick={onCreate}>
            <PlusIcon size={18} /> 新建钱包
          </Button>
          <Button variant="secondary" onClick={onImport}>
            导入钱包
          </Button>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {confirming ? (
          <div className="np-mask" onClick={() => setConfirming(null)}>
            <div className="np-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="np-title">
                删除「{wallets.find((entry) => entry.id === confirming)?.label}」？
              </div>
              <div className="np-body np-body--tight">
                只删除本机记录。只要还留着助记词，之后可以重新导入；
                <span className="np-ink">没有备份的助记词删掉就永久失去了。</span>
              </div>
              <Button
                variant="danger"
                block
                onClick={() => {
                  try {
                    deleteWallet(confirming);
                    setError(null);
                  } catch (caught) {
                    setError((caught as Error).message);
                  }
                  setConfirming(null);
                }}
              >
                删除
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                取消
              </Button>
            </div>
          </div>
        ) : null}

        <div className="np-row" style={{ gap: 8, alignItems: 'center', opacity: 0.7 }}>
          <ShieldIcon size={16} />
          <span className="np-body np-body--tight">全部钱包在同一个加密文件里，共用一个密码</span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Login (action 1)
// ---------------------------------------------------------------------------

/**
 * One export, every network.
 *
 * The device does not ask which chain to log into, because it does not need to know:
 * EVM account xpubs are identical on Ethereum, BNB Chain, Polygon, Arbitrum, Base and
 * every other EVM chain (they all share coin type 60), and the Solana addresses ride
 * along in the same payload. The *companion* decides which network to display, so
 * choosing here would only be a second place to get it wrong.
 */
/**
 * Networks this export covers, shown with their marks.
 *
 * One export serves all of them: EVM account xpubs are identical across every EVM
 * chain, and the Solana addresses travel in the same payload. The device does not pick
 * — the companion does — so this is a statement of what is included, not a choice.
 */
const SUPPORTED_NETWORKS = [
  { chainId: 1, label: 'Ethereum' },
  { chainId: 56, label: 'BNB Chain' },
  { chainId: 137, label: 'Polygon' },
  { chainId: 42161, label: 'Arbitrum' },
  { chainId: 8453, label: 'Base' },
  { chainId: 501, label: 'Solana' },
] as const;

export function LoginQrScreen({ onBack }: { onBack: () => void }): ReactNode {
  const { wallet, deviceInfo, settings, activeWallet, mnemonic, passphrase } = useSession();

  const frames = useMemo(() => {
    if (!wallet) return [];
    const message = buildXpubMessage(
      {
        masterFingerprint: wallet.masterFingerprint,
        passphraseProtected: wallet.passphraseProtected,
        rootXpub: wallet.rootXpub,
        coinType: wallet.coinType,
        accounts: wallet.accounts,
        schemes: wallet.schemes,
        // Solana has no watchable account key, so the addresses themselves travel.
        addresses:
          mnemonic === null
            ? []
            : solanaAccountPaths(settings.solanaAddressCount).map((path) => ({
                path,
                address: deriveSolanaKeypair(mnemonicToSeed(mnemonic, passphrase), path).address,
              })),
      },
      deviceInfo,
    );
    return framesForMessage('NP-XPUB', message, settings.qrFragmentLength).frames;
  }, [
    wallet,
    deviceInfo,
    settings.qrFragmentLength,
    settings.solanaAddressCount,
    mnemonic,
    passphrase,
  ]);

  if (!wallet) return null;

  return (
    <>
      <Header title="登录插件钱包" subtitle={activeWallet?.label} onBack={onBack} />
      <div className="np-main">
        <QrDisplay
          frames={frames}
          frameDurationMs={settings.qrFrameDurationMs}
          caption="用电脑上的插件钱包扫描"
        />

        <div className="np-card np-card--sunken">
          <div className="np-label">支持的网络</div>
          <div className="np-grid-3" style={{ marginTop: 10 }}>
            {SUPPORTED_NETWORKS.map((network) => (
              <div
                key={network.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ChainBadge chainId={network.chainId} size={30} />
                <span style={{ fontSize: 11, opacity: 0.75 }}>{network.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

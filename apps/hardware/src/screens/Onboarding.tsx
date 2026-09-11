import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { assessPassword, entropyToMnemonic, validateMnemonic } from '@netproof/core';
import type { EntropyResult } from '@netproof/core';
import {
  Alert,
  Badge,
  Button,
  Header,
  PasswordField,
  PasswordMeter,
} from '../components/primitives';
import { MnemonicGrid, MnemonicQuiz } from '../components/Mnemonic';
import { ShieldIcon } from '../components/icons';
import { useSession } from '../state/session';

/**
 * The wallet creation flow.
 *
 * Order matters and is deliberate: seed first, then the BIP39 passphrase, then the
 * vault password. The passphrase screen states plainly that losing it loses the
 * wallet, because that is the single most common way a passphrase-protected wallet
 * is destroyed, and there is no recovery path on an offline device.
 */

export function WelcomeScreen({
  onCreate,
  onImport,
  onUnlock,
  onDiagnostics,
  hasVault,
}: {
  onCreate: () => void;
  /** Import an existing wallet from a mnemonic. */
  onImport: () => void;
  onUnlock: () => void;
  onDiagnostics: () => void;
  hasVault: boolean;
}): ReactNode {
  return (
    <div className="np-fullscreen">
      <div className="np-fullscreen__top">
        <button
          type="button"
          className="np-icon-btn np-icon-btn--plain"
          onClick={onDiagnostics}
          aria-label="设置"
        >
          ⚙
        </button>
      </div>

      <div className="np-fullscreen__body">
        <span className="np-brand-mark">
          <ShieldIcon size={44} />
        </span>
        <h1 className="np-headline">NetProof Air</h1>
        <p className="np-body" style={{ maxWidth: 250 }}>
          私钥只在这台离线设备上。全程不联网。
        </p>
      </div>

      <div className="np-fullscreen__actions">
        {hasVault ? (
          <Button block onClick={onUnlock}>
            解锁
          </Button>
        ) : (
          <>
            <Button block onClick={onCreate}>
              新建钱包
            </Button>
            <Button variant="secondary" block onClick={onImport}>
              导入钱包
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function BackupScreen({
  entropy,
  onNext,
  onBack,
}: {
  entropy: EntropyResult;
  onNext: () => void;
  onBack: () => void;
}): ReactNode {
  const mnemonic = useMemo(() => entropyToMnemonic(entropy.bytes), [entropy]);
  const words = useMemo(() => mnemonic.split(' '), [mnemonic]);
  const [revealed, setRevealed] = useState(false);
  const [step, setStep] = useState<'show' | 'quiz'>('show');

  return (
    <>
      <Header title="备份助记词" subtitle="第 2 / 4 步" onBack={onBack} />
      <div className="np-main">
        {step === 'show' ? (
          <>
            <h2 className="np-headline">
              {words.length} 个单词，
              <br />
              抄在纸上
            </h2>
            <Alert tone="danger" title="不要截图、不要拍照、不要联网">
              这是你资产的唯一凭证。任何拿到这串单词的人都能转走全部资金。设备不会上传，也不会有第二份。
            </Alert>
            <MnemonicGrid words={words} hidden={!revealed} onReveal={() => setRevealed(true)} />
            <div className="np-card np-card--sunken">
              <div className="np-label">生成来源</div>
              <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
                {entropy.sources
                  .filter((source) => source.estimatedMinEntropyBits > 0)
                  .map((source) => `${source.name} (${source.estimatedMinEntropyBits.toFixed(0)} bit)`)
                  .join(' + ')}
              </div>
              <div className="np-mono np-ink-3" style={{ marginTop: 8 }}>
                审计摘要 {entropy.transcriptDigest.slice(0, 32)}…
              </div>
            </div>
          </>
        ) : (
          <MnemonicQuiz words={words} onPassed={onNext} />
        )}
      </div>
      {step === 'show' ? (
        <div className="np-footer">
          <Button block disabled={!revealed} onClick={() => setStep('quiz')}>
            我已抄写完毕
          </Button>
          {!revealed ? <div className="np-body np-body--tight np-center">请先点击显示助记词</div> : null}
        </div>
      ) : null}
    </>
  );
}

export function PassphraseScreen({
  onNext,
  onBack,
}: {
  onNext: (passphrase: string) => void;
  onBack: () => void;
}): ReactNode {
  const [enabled, setEnabled] = useState(false);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const mismatch = enabled && second.length > 0 && first !== second;
  const ready = !enabled || (first.length > 0 && first === second);

  return (
    <>
      <Header title="BIP39 Passphrase" subtitle="第 3 / 4 步" onBack={onBack} />
      <div className="np-main">
        <h2 className="np-headline">可选的第 25 个词</h2>
        <p className="np-body">
          Passphrase 会与助记词一起推导出<span className="np-ink">完全不同的钱包</span>。它保护的是"助记词被看到"
          的场景：只拿到 24 个词的人，没有 passphrase 也打不开你的资产。
        </p>

        <div className="np-card">
          <label className="np-switch">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <div>
              <div className="np-subtitle">启用 passphrase</div>
              <div className="np-body np-body--tight">不启用则只使用助记词推导钱包</div>
            </div>
          </label>
        </div>

        {enabled ? (
          <>
            <Alert tone="danger" title="丢了就找不回来">
              passphrase 没有校验位、没有提示、无法暴力找回。请与助记词分开保管，并且自己确认拼写与大小写。
            </Alert>
            <div className="np-field">
              <label className="np-label" htmlFor="passphrase-1">
                输入 passphrase
              </label>
              <PasswordField value={first} onChange={setFirst} placeholder="任意字符，建议 12 位以上" />
            </div>
            <div className="np-field">
              <label className="np-label" htmlFor="passphrase-2">
                再输入一次
              </label>
              <PasswordField value={second} onChange={setSecond} placeholder="必须完全一致" />
            </div>
            {mismatch ? <Alert tone="warn">两次输入不一致。</Alert> : null}
            {first.length > 0 && first.length < 8 ? (
              <Alert tone="warn">passphrase 太短，容易被暴力尝试。建议至少 12 位。</Alert>
            ) : null}
          </>
        ) : (
          <Alert tone="info" title="只使用助记词">
            这样最不容易丢，但助记词一旦泄露资产即失守。
          </Alert>
        )}
      </div>
      <div className="np-footer">
        <Button block disabled={!ready} onClick={() => onNext(enabled ? first : '')}>
          下一步
        </Button>
      </div>
    </>
  );
}

export function VaultPasswordScreen({
  onNext,
  onBack,
  passphraseEnabled,
}: {
  onNext: (password: string, label: string) => void;
  onBack: () => void;
  passphraseEnabled: boolean;
}): ReactNode {
  const [label, setLabel] = useState('主钱包');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const assessment = assessPassword(password);
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = assessment.score >= 2 && password === confirm && password.length >= 8;

  return (
    <>
      <Header title="设备密码" subtitle="第 4 / 4 步" onBack={onBack} />
      <div className="np-main">
        <h2 className="np-headline">命名并加密</h2>
        <div className="np-field">
          <label className="np-label" htmlFor="create-name">
            钱包名称
          </label>
          <input
            id="create-name"
            className="np-input"
            value={label}
            maxLength={24}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="np-field">
          <label className="np-label">设备密码</label>
          <PasswordField value={password} onChange={setPassword} autoFocus placeholder="至少 8 位，建议 12 位以上" />
        </div>
        <PasswordMeter score={assessment.score} suggestions={assessment.suggestions} />
        <div className="np-field">
          <label className="np-label">确认密码</label>
          <PasswordField value={confirm} onChange={setConfirm} placeholder="再输入一次" />
        </div>
        {mismatch ? <Alert tone="warn">两次密码不一致。</Alert> : null}

        {passphraseEnabled ? (
          <div className="np-card np-card--sunken">
            <div className="np-label">passphrase 会一起加密保存</div>
            <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
              passphrase 与助记词一起用这个密码加密，存在本机。解锁后签名
              <span className="np-ink">不再需要重新输入</span>。
              <br />
              代价要说清楚：这样两者由同一个密码保护，设备被解锁（或密码被猜到）时
              助记词与 passphrase <span className="np-ink">会同时暴露</span>。请把设备密码当成
              你唯一的防线来保管。
            </div>
          </div>
        ) : null}

        <Alert tone="warn" title="写在纸上">
          忘记这个密码等于助记词被锁住。请把它与助记词分开记录。
        </Alert>
      </div>
      <div className="np-footer">
        <Button block disabled={!ready || label.trim().length === 0} onClick={() => onNext(password, label)}>
          创建钱包
        </Button>
      </div>
    </>
  );
}

export function UnlockScreen({
  onUnlocked,
  onBack,
}: {
  onUnlocked: () => void;
  onBack: () => void;
}): ReactNode {
  const { unlock } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attempt = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    // Argon2id with production parameters takes about a second; yield a frame so
    // the button shows its busy state before the main thread is occupied.
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    try {
      // No passphrase argument: every wallet's passphrase is stored with it, so it is
      // restored by the unlock itself. Asking here would be asking for something the
      // device already has.
      unlock(password);
      onUnlocked();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header title="解锁设备" onBack={onBack} />
      <div className="np-main">
        <h2 className="np-headline">解锁</h2>
        <div className="np-field">
          <PasswordField
            value={password}
            onChange={setPassword}
            autoFocus
            placeholder="设备密码"
            onEnter={() => {
              if (password.length > 0) void attempt();
            }}
          />
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}

      </div>
      <div className="np-footer">
        <Button block disabled={password.length === 0 || busy} onClick={() => void attempt()}>
          {busy ? '正在解密…' : '解锁'}
        </Button>
      </div>
    </>
  );
}

/** Shown after a successful unlock, so the user sees which wallet they opened. */
export function UnlockedBanner({ fingerprint, words }: { fingerprint: string; words: number }): ReactNode {
  return (
    <div className="np-row np-row--between">
      <span className="np-label">钱包指纹 {fingerprint}</span>
      <Badge tone="accent">{words} 词</Badge>
    </div>
  );
}

export { validateMnemonic };

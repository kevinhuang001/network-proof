import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  HDKey,
  assessPassword,
  buildWalletExport,
  inspectMnemonic,
  mnemonicToSeed,
  shortAddress,
} from '@netproof/core';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Header,
  KeyValue,
  PasswordField,
  PasswordMeter,
} from '../components/primitives';
import { NameWalletScreen } from './NameWallet';
import { useSession } from '../state/session';

/**
 * Import an existing wallet from a mnemonic.
 *
 * This flow is deliberately more suspicious than wallet creation, because every
 * expensive mistake in this product lives here:
 *
 *  - the phrase may have been typed on, photographed by, or pasted into an online
 *    device, in which case it is already compromised and importing it does not make
 *    it safe;
 *  - a transposed pair of words can still satisfy the BIP39 checksum, so a
 *    "valid" phrase is not proof that these are *your* words;
 *  - a passphrase typo silently produces a different, empty wallet.
 *
 * So the flow is three steps, and the middle one is the important one: the user must
 * compare the derived fingerprint and first address against their existing wallet
 * before the phrase is encrypted and stored.
 */

type Step =
  | { name: 'phrase' }
  /** `phrase` is the canonical single-spaced form, which is what gets derived. */
  | { name: 'verify'; phrase: string; passphrase: string }
  | { name: 'password'; phrase: string; passphrase: string };

export function ImportWalletScreen({
  onDone,
  onBack,
  addToExisting,
}: {
  onDone: () => void;
  onBack: () => void;
  /**
   * When true this adds a wallet to the device instead of creating the vault.
   *
   * The difference is only the last step: an existing vault is already unlocked and
   * its key is in memory, so re-asking for the device password would be friction with
   * no security benefit. The phrase is still validated and the fingerprint is still
   * shown for the user to compare.
   */
  addToExisting?: boolean;
}): ReactNode {
  const { importWallet, addWallet } = useSession();
  const [step, setStep] = useState<Step>({ name: 'phrase' });

  if (step.name === 'phrase') {
    return (
      <PhraseStep
        onBack={onBack}
        onNext={(phrase, passphrase) => setStep({ name: 'verify', phrase, passphrase })}
      />
    );
  }

  if (step.name === 'verify') {
    return (
      <VerifyStep
        phrase={step.phrase}
        passphrase={step.passphrase}
        onBack={() => setStep({ name: 'phrase' })}
        onNext={() => setStep({ name: 'password', phrase: step.phrase, passphrase: step.passphrase })}
      />
    );
  }

  if (addToExisting) {
    return (
      <NameWalletScreen
        title="保存钱包"
        subtitle="第 3 / 3 步"
        actionLabel="保存"
        defaultName="导入的钱包"
        onBack={() => setStep({ name: 'verify', phrase: step.phrase, passphrase: step.passphrase })}
        onConfirm={(label) => {
          addWallet({ mnemonic: step.phrase, passphrase: step.passphrase, label });
          onDone();
        }}
      />
    );
  }

  return (
    <PasswordStep
      onBack={() => setStep({ name: 'verify', phrase: step.phrase, passphrase: step.passphrase })}
      onSubmit={(password) => {
        importWallet({
          mnemonic: step.phrase,
          passphrase: step.passphrase,
          password,
        });
        onDone();
      }}
    />
  );
}



function PhraseStep({
  onNext,
  onBack,
}: {
  onNext: (canonicalPhrase: string, passphrase: string) => void;
  onBack: () => void;
}): ReactNode {
  const [text, setText] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const inspection = useMemo(() => inspectMnemonic(text), [text]);

  return (
    <>
      <Header title="导入已有钱包" subtitle="第 1 / 3 步" onBack={onBack} />
      <div className="np-main">
        <Alert tone="warn" title="先想清楚：这串助记词安全吗？">
          如果它曾经出现在联网设备上（手机备忘录、截图、网盘、聊天记录、任何网页钱包），
          它就应该被视为<span className="np-ink">已经泄露</span>。导入到这台离线设备不会让它重新变安全——
          这个程序无法替你判断，也不会阻止你，但它必须说清楚。
        </Alert>

        <div className="np-field">
          <label className="np-label" htmlFor="mnemonic-input">
            助记词（已识别 {inspection.wordCount} 个单词）
          </label>
          {/*
            No blur and no masking on this field, deliberately. An earlier version
            applied the read-only `np-blur` class here, which carries
            `pointer-events: none` — so the field could not be focused at all and the
            counter sat at "0 个单词" no matter what the user did. A control the user
            must type into has to stay interactive and legible; hiding the phrase
            while it is being entered helps nobody.
          */}
          <textarea
            id="mnemonic-input"
            className="np-textarea np-textarea--mono"
            value={text}
            placeholder={'按顺序输入或粘贴 12 / 15 / 18 / 21 / 24 个单词\n空格、换行、逗号分隔都可以，带序号（1. 2. 3.）也能识别'}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            rows={4}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="np-body np-body--tight">
            注意周围是否有人能看到屏幕。输入内容不会被保存，只用于推导这一次的钱包。
          </div>
        </div>

        {inspection.wordCount > 0 ? (
          <div className="np-card np-card--sunken">
            <div className="np-row np-row--between">
              <span className="np-label">识别到的单词</span>
              <Badge tone={inspection.checksumValid ? 'up' : 'neutral'}>{inspection.wordCount} 个</Badge>
            </div>
            <div className="np-mnemonic-grid" style={{ marginTop: 10 }}>
              {inspection.words.map((word, index) => {
                const bad = inspection.invalidWords.some((entry) => entry.index === index);
                return (
                  <div
                    className="np-mnemonic-word"
                    key={`${index}-${word}`}
                    style={bad ? { outline: '2px solid var(--np-down)' } : undefined}
                  >
                    <span className="np-mnemonic-word__index">{index + 1}</span>
                    <span style={bad ? { color: 'var(--np-down)' } : undefined}>{word || '—'}</span>
                  </div>
                );
              })}
            </div>
            <div className="np-body np-body--tight" style={{ marginTop: 10 }}>
              请核对以上单词与你纸上备份逐字一致。红框表示该词不在 BIP39 词表中。
            </div>
          </div>
        ) : null}

        {text.trim().length > 0 ? (
          <div className="np-card">
            <div className="np-row np-row--between">
              <span className="np-label">校验</span>
              <Badge tone={inspection.checksumValid ? 'up' : inspection.wordCount === 0 ? 'neutral' : 'down'}>
                {inspection.checksumValid
                  ? '通过'
                  : inspection.wordCount === 0
                    ? '等待输入'
                    : '未通过'}
              </Badge>
            </div>
            <KeyValue label="单词数量" value={`${inspection.wordCount}`} />
            <KeyValue label="熵强度" value={inspection.strength ? `${inspection.strength} bit` : '—'} />
            {inspection.issue ? (
              <div style={{ marginTop: 10 }}>
                <Alert tone="warn">{inspection.issue}</Alert>
              </div>
            ) : null}
            {inspection.invalidWords.length > 0 ? (
              <div className="np-stack" style={{ marginTop: 10 }}>
                {inspection.invalidWords.slice(0, 6).map((entry) => (
                  <div key={`${entry.index}-${entry.word}`} className="np-body np-body--tight">
                    第 {entry.index + 1} 个「{entry.word}」
                    {entry.suggestions.length > 0 ? (
                      <>
                        {' '}
                        → 是否想输入{' '}
                        <span className="np-ink">{entry.suggestions.slice(0, 3).join(' / ')}</span>？
                      </>
                    ) : (
                      ' 不在 BIP39 词表中'
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="np-field">
          <label className="np-label">BIP39 Passphrase（没有则留空）</label>
          <PasswordField
            value={passphrase}
            onChange={setPassphrase}
            placeholder="第 25 个词，区分大小写"
          />
          <div className="np-body np-body--tight">
            如果原钱包设置了 passphrase，这里必须完全一致，否则会导入到一个地址完全不同、
            余额为零的新钱包。
          </div>
        </div>

        <Alert tone="info" title="校验位不能证明这是你的助记词">
          两张单词顺序对调，仍有可能通过校验位。所以下一步会让你核对派生出的钱包指纹与第一个地址，
          请与原钱包逐位比对。
        </Alert>
      </div>
      <div className="np-footer">
        <Button
          block
          disabled={!inspection.checksumValid}
          onClick={() => onNext(inspection.canonical, passphrase)}
        >
          下一步：核对钱包
        </Button>
      </div>
    </>
  );
}

function VerifyStep({
  phrase,
  passphrase,
  onNext,
  onBack,
}: {
  phrase: string;
  passphrase: string;
  onNext: () => void;
  onBack: () => void;
}): ReactNode {
  const [acknowledged, setAcknowledged] = useState(false);

  const derived = useMemo(() => {
    try {
      const root = HDKey.fromMasterSeed(mnemonicToSeed(phrase, passphrase));
      const exported = buildWalletExport(root, { accounts: 1 });
      const first = exported.accounts.find((entry) => entry.scheme === 'bip44')!;
      return {
        fingerprint: exported.masterFingerprint,
        address: first.firstAddress,
        path: first.firstAddressPath,
        xpub: first.xpub,
        error: null as string | null,
      };
    } catch (error) {
      return { fingerprint: '', address: '', path: '', xpub: '', error: (error as Error).message };
    }
  }, [phrase, passphrase]);

  return (
    <>
      <Header title="核对钱包" subtitle="第 2 / 3 步" onBack={onBack} />
      <div className="np-main">
        <Alert tone="warn" title="这一步最重要">
          请把下面的地址与原钱包（例如 MetaMask 的账户详情）逐位比对。一致才继续——
          不一致说明助记词抄错了、顺序错了、或者 passphrase 不对，此时导入得到的是
          <span className="np-ink">另一个钱包</span>，往里转币会直接丢失。
        </Alert>

        {derived.error ? (
          <Alert tone="danger">{derived.error}</Alert>
        ) : (
          <>
            <div className="np-card np-card--hero">
              <div className="np-label">派生出的第一个地址</div>
              <div className="np-mono" style={{ color: '#fff', marginTop: 10, fontSize: 15, wordBreak: 'break-all' }}>
                {derived.address}
              </div>
              <div className="np-body" style={{ color: 'rgba(255,255,255,.6)', marginTop: 8 }}>
                {derived.path}
              </div>
            </div>

            <div className="np-card">
              <KeyValue label="钱包指纹 (BIP32)" value={derived.fingerprint} mono />
              <KeyValue label="账户 xpub" value={`${derived.xpub.slice(0, 24)}…`} mono />
              <KeyValue label="Passphrase" value={passphrase.length > 0 ? '已设置' : '未设置'} />
            </div>

            <div className="np-row">
              <CopyButton value={derived.address} label="复制地址以便比对" />
              <CopyButton value={derived.fingerprint} label="复制指纹" />
            </div>

            <div className="np-card np-card--sunken">
              <div className="np-label">没有原钱包可以比对？</div>
              <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
                不要跳过。至少把上面这个地址记下来，导入完成后先用小额转账验证一次，
                确认资金进入的是你熟悉的账户。
              </div>
            </div>

            <label className="np-switch np-card">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span className="np-body np-body--tight">
                我已核对该地址与原钱包一致
              </span>
            </label>
          </>
        )}
      </div>
      <div className="np-footer">
        <Button block disabled={!acknowledged || derived.error !== null} onClick={onNext}>
          下一步：设置设备密码
        </Button>
      </div>
    </>
  );
}

function PasswordStep({
  onSubmit,
  onBack,
}: {
  onSubmit: (password: string, label: string) => void;
  onBack: () => void;
}): ReactNode {
  const [label, setLabel] = useState('导入的钱包');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const assessment = assessPassword(password);
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = assessment.score >= 2 && password === confirm && password.length >= 8;

  return (
    <>
      <Header title="设备密码" subtitle="第 3 / 3 步" onBack={onBack} />
      <div className="np-main">
        <h2 className="np-headline">命名并加密</h2>
        <div className="np-field">
          <label className="np-label" htmlFor="import-name">
            钱包名称
          </label>
          <input
            id="import-name"
            className="np-input"
            value={label}
            maxLength={24}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="np-field">
          <label className="np-label">设备密码</label>
          <PasswordField value={password} onChange={setPassword} autoFocus placeholder="至少 8 位" />
        </div>
        <PasswordMeter score={assessment.score} suggestions={assessment.suggestions} />
        <div className="np-field">
          <label className="np-label">确认密码</label>
          <PasswordField value={confirm} onChange={setConfirm} placeholder="再输入一次" />
        </div>
        {mismatch ? <Alert tone="warn">两次密码不一致。</Alert> : null}

        <div className="np-card np-card--sunken">
          <div className="np-label">passphrase 会一起加密保存</div>
          <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
            与助记词用同一个设备密码加密存在本机，解锁后签名不再需要重新输入。
            代价是两者共用一个密码保护——设备被解锁时它们会同时暴露。
          </div>
        </div>

        <Alert tone="warn" title="写在纸上">
          忘记这个密码等于助记词被锁住。请与助记词分开记录。
        </Alert>
      </div>
      <div className="np-footer">
        <Button block disabled={!ready || label.trim().length === 0} onClick={() => onSubmit(password, label)}>
          导入并加密保存
        </Button>
      </div>
    </>
  );
}

export { shortAddress };

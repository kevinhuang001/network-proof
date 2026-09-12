import type { ReactNode } from 'react';
import { useState } from 'react';
import { assessPassword } from '@netproof/core';
import { useCompanion } from '../App';
import { Alert, Button, Header, PasswordField, Spinner } from '../ui/kit';
import { createPasscodeRecord } from '../lib/lock';

/**
 * The passcode a wallet is required to have.
 *
 * Reached at the end of pairing, and there is no way past it: no skip button, no cancel. A
 * wallet left without one is a wallet that anyone who picks up the machine can read — the
 * addresses, the balances, the history — and the only person who could have prevented that is
 * the one sitting in front of it. Changing it later is allowed, and lives in Settings.
 *
 * The lock is still only a lock: what it protects against is the person at the keyboard, not
 * someone who can read the disk. That is said here, where the choice is being made, because a
 * passcode prompt is the place people assume encryption.
 */
export function SetPasscodeScreen({ required }: {
  /** True when this is the mandatory one after pairing rather than a change. */
  required: boolean;
}): ReactNode {
  const { setPasscode, navigate } = useCompanion();
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const assessment = assessPassword(value);

  const save = (): void => {
    setError(null);
    if (value.length < 6) {
      setError('至少 6 位');
      return;
    }
    if (value !== confirm) {
      setError('两次输入不一致');
      return;
    }
    setBusy(true);
    // Let the button paint before the KDF blocks the main thread.
    setTimeout(() => {
      setPasscode(createPasscodeRecord(value));
      setBusy(false);
      navigate({ name: 'home' });
    }, 16);
  };

  return (
    <>
      <Header title={required ? '设置锁定密码' : '修改密码'} />
      <div className="np-main">
        <Alert tone="info" title={required ? '这一步不能跳过' : '修改锁定密码'}>
          锁定只遮挡界面，不加密数据——本机存的地址仍可被能读取本机存储的人看到。
        </Alert>

        <div className="np-stack">
          <PasswordField
            value={value}
            onChange={(next) => {
              setValue(next);
              setError(null);
            }}
            autoFocus
            placeholder="密码（至少 6 位）"
          />
          {value.length > 0 && assessment.suggestions.length > 0 ? (
            <div className="np-body np-body--tight np-ink-3">
              {assessment.suggestions.join(' · ')}
            </div>
          ) : null}
          <PasswordField
            value={confirm}
            onChange={setConfirm}
            placeholder="再输一次"
            onEnter={save}
          />
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </div>
      </div>
      <div className="np-footer">
        <Button block disabled={busy || value.length < 6} onClick={save}>
          {busy ? <Spinner /> : '保存密码'}
        </Button>
      </div>
    </>
  );
}

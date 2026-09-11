import type { ReactNode } from 'react';
import { TextArea, TextField } from '@netproof/ui/text-field';
import { useMemo, useState } from 'react';
import { parseUnits, shortAddress } from '@netproof/core';
import { chainLabel, fetchBalance, forwardToNode } from '@netproof/companion';
import { useCompanion } from '../App';
import { Alert, Badge, Button, KeyValue, Spinner } from '../ui/kit';
import { formatEth, useVisibleAccounts } from './Wallet';

/**
 * Send.
 *
 * MetaMask's send flow, with one difference that the whole product exists for: the
 * signature cannot happen here. Pressing send produces a QR for the offline device,
 * and the transaction only reaches the network after the user has approved it on the
 * device's own screen and scanned the answer back.
 *
 * The flow is form → review → 扫码签名, and the review step deliberately shows the
 * *worst case* cost (value + gas at the fee cap), because that is the number a user
 * can actually lose.
 */

export function SendScreen(): ReactNode {
  const { settings, navigate, wallet, requestSigning, show } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const current = accounts[settings.addressIndex] ?? accounts[0];

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [data, setData] = useState('0x');
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);

  const rpcUrl = settings.rpcUrls[settings.chainId];
  const forward = (method: string, params: unknown[]) =>
    forwardToNode(method, params, { rpcUrl: rpcUrl ?? '', chainId: settings.chainId });

  // Load the balance lazily, so the form appears instantly and the number arrives
  // when it can. It is a convenience, never a gate.
  useMemo(() => {
    if (!current || !rpcUrl) return;
    void fetchBalance(current.address, { rpcUrl, chainId: settings.chainId }).then(
      setBalance,
      () => setBalance(null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.address, rpcUrl, settings.chainId]);

  const parsed = useMemo(() => {
    if (amount.trim().length === 0) return null;
    try {
      return parseUnits(amount, 18);
    } catch {
      return null;
    }
  }, [amount]);

  const addressValid = /^0x[0-9a-fA-F]{40}$/u.test(to.trim());
  const dataValid = /^0x([0-9a-fA-F]{2})*$/u.test(data.trim());
  const amountValid = parsed !== null && parsed > 0n;
  const overBalance = parsed !== null && balance !== null && parsed > balance;
  const isContractCall = data.trim() !== '0x' && data.trim() !== '';

  const ready = wallet !== null && current !== undefined && addressValid && dataValid && (amountValid || isContractCall);

  const submit = async (): Promise<void> => {
    if (!current) return;
    setPreparing(true);
    setError(null);
    try {
      // Resolve nonce and fees *now*, before the QR, because the offline device has no
      // way to look them up. If the node cannot supply them, fail here rather than
      // putting a half-specified request in front of the user's device.
      const value = parsed ?? 0n;
      const nonce = Number(BigInt((await forward('eth_getTransactionCount', [current.address, 'pending'])) as string));
      const gas = BigInt(
        (await forward('eth_estimateGas', [
          {
            from: current.address,
            to: to.trim(),
            value: `0x${value.toString(16)}`,
            data: data.trim(),
          },
        ])) as string,
      );
      const gasPrice = BigInt((await forward('eth_gasPrice', [])) as string);
      const maxPriorityFeePerGas = await forward('eth_maxPriorityFeePerGas', [])
        .then((value) => BigInt(value as string))
        .catch(() => gasPrice);

      const id = requestSigning({
        kind: 'sendTransaction',
        origin: '本机钱包（发送）',
        chainId: settings.chainId,
        method: 'eth_sendTransaction',
        params: [
          {
            from: current.address,
            to: to.trim(),
            value: `0x${value.toString(16)}`,
            data: data.trim(),
            nonce: `0x${nonce.toString(16)}`,
            gas: `0x${gas.toString(16)}`,
            maxFeePerGas: `0x${gasPrice.toString(16)}`,
            maxPriorityFeePerGas: `0x${maxPriorityFeePerGas.toString(16)}`,
          },
        ],
      });
      void id;
      show('请用离线设备扫描二维码');
      navigate({ name: 'sign', id });
    } catch (caught) {
      setError(`无法准备这笔交易：${(caught as Error).message}`);
    } finally {
      setPreparing(false);
    }
  };

  if (!wallet || !current) {
    return (
      <div className="np-main">
        <Alert tone="warn">还没有连接硬件钱包。</Alert>
        <Button block onClick={() => navigate({ name: 'connect' })}>
          扫码连接
        </Button>
      </div>
    );
  }

  return (
    <div className="np-main">
      <h2 className="np-headline" style={{ fontSize: 22 }}>
        发送
      </h2>

      <div className="np-card">
        <div className="np-row np-row--between">
          <span className="np-label">从</span>
          <Badge tone="accent">{chainLabel(settings.chainId)}</Badge>
        </div>
        <div className="np-subtitle" style={{ marginTop: 6 }}>
          {current.name}
        </div>
        <div className="np-mono np-ink-3">{shortAddress(current.address, 10, 8)}</div>
        <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
          可用 {balance === null ? '—' : formatEth(balance)}
        </div>
      </div>

      <div className="np-field">
        <label className="np-label" htmlFor="send-to">
          收款地址
        </label>
        <TextField
          id="send-to"
          className="np-input np-input--mono"
          lang="en"
          value={to}
          placeholder="0x..."
          onChange={setTo}
        />
        {to.trim().length > 0 && !addressValid ? (
          <div className="np-body np-body--tight np-down">地址格式不正确（应为 0x + 40 位十六进制）</div>
        ) : null}
      </div>

      <div className="np-field">
        <label className="np-label" htmlFor="send-amount">
          金额（{settings.chainId === 56 ? 'BNB' : 'ETH'}）
        </label>
        <TextField
          id="send-amount"
          className="np-input"
          lang="en"
          value={amount}
          placeholder="0.0"
          inputMode="decimal"
          onChange={setAmount}
        />
        <div className="np-row np-row--between">
          <span className="np-body np-body--tight">
            {amount.trim().length > 0 && parsed === null ? (
              <span className="np-down">不是合法的十进制金额</span>
            ) : overBalance ? (
              <span className="np-down">超过可用余额</span>
            ) : (
              '金额以主链币计价'
            )}
          </span>
          {balance !== null ? (
            <button
              type="button"
              className="np-chip"
              onClick={() => {
                // Leave a little for gas: "MAX" that produces an unaffordable
                // transaction is a trap, so subtract a modest reserve.
                const reserve = 21_000n * 30_000_000_000n;
                const spendable = balance > reserve ? balance - reserve : 0n;
                setAmount(formatEth(spendable));
              }}
            >
              最大
            </button>
          ) : null}
        </div>
      </div>

      <Button variant="ghost" size="small" onClick={() => setAdvanced((value) => !value)}>
        {advanced ? '隐藏高级选项' : '高级选项（合约调用）'}
      </Button>
      {advanced ? (
        <div className="np-field">
          <label className="np-label" htmlFor="send-data">
            Calldata
          </label>
          <TextArea
            id="send-data"
            className="np-textarea np-textarea--mono"
            rows={3}
            value={data}
            onChange={setData}
          />
          {!dataValid ? (
            <div className="np-body np-body--tight np-down">calldata 必须是字节对齐的十六进制</div>
          ) : null}
          <div className="np-body np-body--tight">
            留空表示普通转账。填写后就是合约调用，设备会尝试解析它并给出风险提示。
          </div>
        </div>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Alert tone="info">
        点击下一步后会显示一个二维码。用离线设备扫描它并在设备屏幕上确认，
        设备会回传签名的二维码，扫回来即可广播。整个过程中私钥不离开设备。
      </Alert>

      <div className="np-row">
        <Button variant="ghost" onClick={() => navigate({ name: 'home' })}>
          取消
        </Button>
        <div className="np-grow" />
        <Button disabled={!ready || preparing} onClick={() => void submit()}>
          {preparing ? '正在准备…' : '下一步：扫码签名'}
        </Button>
      </div>
      {preparing ? (
        <div className="np-row np-center" style={{ justifyContent: 'center' }}>
          <Spinner />
          <span className="np-body np-body--tight">正在向节点查询 nonce 与 gas…</span>
        </div>
      ) : null}
    </div>
  );
}

export { KeyValue };

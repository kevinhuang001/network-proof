import type { ReactNode } from 'react';
import { TextArea, TextField } from '@netproof/ui/text-field';
import { useEffect, useMemo, useState } from 'react';
import { parseUnits, shortAddress } from '@netproof/core';
import { chainLabel, fetchBalance, forwardToNode, nativeSymbol, tierCost } from '@netproof/companion';
import { tokensForChain } from '../lib/store';
import { useFeeTiers } from '../lib/fees';
import { chainShowsFiat, useUsdPrice } from '../lib/prices';
import {
  encodeErc20Transfer,
  fetchTokenBalance,
  formatTokenAmount,
  type CallFn,
} from '../lib/tokens';
import { useCompanion } from '../App';
import { FeeSelector } from '../ui/FeeSelector';
import { Alert, Badge, Button, Header, KeyValue, Spinner } from '../ui/kit';
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

/**
 * Turn a node's complaint into something a person can act on.
 *
 * `execution reverted` is what a node says when the recipient's own code refused the transfer:
 * a contract with no payable `receive`, or one that rejects this particular call. Every wallet
 * shows the raw string, and it tells the user nothing except that wallet is broken — when in
 * fact the chain is working exactly as designed and the address is the problem.
 */
function explainPreparationFailure(error: Error, to: string, isToken: boolean): string {
  const message = error.message;
  if (/execution reverted|revert/u.test(message)) {
    return isToken
      ? `代币合约拒绝了这笔转账：${to} 的 transfer 调用被回退。请确认代币合约地址与收款地址。`
      : `${to} 拒绝了这笔转账（execution reverted）。常见原因是这个地址是合约，且它不接受直接转入主链币。` +
          `如果你要转的是代币，请在资产列表里选择那个代币再发送。`;
  }
  if (/insufficient funds/u.test(message)) {
    return '余额不足以支付金额加手续费。用「最大」可以按当前手续费算出可发的上限。';
  }
  if (/nonce/u.test(message)) {
    return 'nonce 读取失败，稍后重试。';
  }
  return `无法准备这笔交易：${message}`;
}

export function SendScreen({ token: tokenAddress }: { token?: string } = {}): ReactNode {
  const { settings, navigate, wallet, requestSigning, show } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const current = accounts[settings.addressIndex] ?? accounts[0];
  /*
   * Sending a token is sending a contract call, not a value transfer: the amount goes in
   * `transfer(address,uint256)` calldata and `value` stays zero. The device re-parses those
   * bytes and shows the recipient and the amount on its own screen, so this path produces
   * the same review the user gets for a plain send — it just builds the payload here
   * instead of asking them to paste it.
   */
  const token = useMemo(
    () =>
      tokenAddress
        ? tokensForChain(settings.chainId).find(
            (entry) => entry.address.toLowerCase() === tokenAddress.toLowerCase(),
          ) ?? null
        : null,
    [tokenAddress, settings.chainId],
  );
  // Gas is paid in the chain's own coin even when the transfer is a token — so on Polygon the
  // fee is in POL while the amount is in USDC, and the two rows must not share a symbol.
  const feeSymbol = nativeSymbol(settings.chainId);
  const symbol = token?.symbol ?? feeSymbol;
  const decimals = token?.decimals ?? 18;

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [data, setData] = useState('0x');
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);

  const rpcUrl = settings.rpcUrls[settings.chainId];
  const forward = (method: string, params: unknown[]) =>
    forwardToNode(method, params, { rpcUrl: rpcUrl ?? '', chainId: settings.chainId });
  const { tiers, tierId, select, tier, load, feeError, fields } = useFeeTiers({
    rpcUrl,
    chainId: settings.chainId,
  });
  const usd = useUsdPrice(feeSymbol, settings.showFiat && chainShowsFiat(settings.chainId));

  // Load the balance lazily, so the form appears instantly and the number arrives
  // when it can. It is a convenience, never a gate.
  useMemo(() => {
    if (!current || !rpcUrl) return;
    const call: CallFn = (method, params) =>
      forwardToNode(method, params, { rpcUrl, chainId: settings.chainId });
    const read = token
      ? fetchTokenBalance(
          {
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            chainId: token.chainId,
            native: false,
          },
          current.address,
          call,
        )
      : fetchBalance(current.address, { rpcUrl, chainId: settings.chainId });
    void read.then(setBalance, () => setBalance(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.address, rpcUrl, settings.chainId, token?.address]);

  const parsed = useMemo(() => {
    if (amount.trim().length === 0) return null;
    try {
      return parseUnits(amount, decimals);
    } catch {
      return null;
    }
  }, [amount, decimals]);

  const addressValid = /^0x[0-9a-fA-F]{40}$/u.test(to.trim());
  const dataValid = /^0x([0-9a-fA-F]{2})*$/u.test(data.trim());
  const amountValid = parsed !== null && parsed > 0n;
  const overBalance = parsed !== null && balance !== null && parsed > balance;
  const isContractCall = data.trim() !== '0x' && data.trim() !== '';

  /**
   * What actually goes on chain.
   *
   * A token send is `transfer(to, amount)` with `value: 0`; a plain send is the value with
   * empty data. Both end up as one request, so the device reviews exactly one shape.
   */
  const call = useMemo(() => {
    if (token) {
      if (!addressValid || parsed === null) return null;
      return { to: token.address, value: 0n, data: encodeErc20Transfer(to.trim(), parsed) };
    }
    return { to: to.trim(), value: parsed ?? 0n, data: data.trim() };
  }, [token, addressValid, parsed, to, data]);

  /*
   * How much gas this transaction actually needs, so the cost shown is this transaction's
   * cost and not a guess. An ERC-20 transfer is roughly 46 000 gas, more than twice a plain
   * value transfer: pricing the chips at 21 000 would understate every token send.
   *
   * The estimate can fail in ways that are not errors yet — an empty form, an amount above
   * the balance — and when it does the screen says nothing rather than something wrong.
   */
  useEffect(() => {
    if (!call || !current || !rpcUrl) {
      setGasEstimate(null);
      return;
    }
    let cancelled = false;
    // Debounced, because the amount is part of the call and this would otherwise be one
    // estimate per keystroke.
    const timer = window.setTimeout(() => {
      void forwardToNode(
        'eth_estimateGas',
        [
          {
            from: current.address,
            to: call.to,
            value: `0x${call.value.toString(16)}`,
            data: call.data,
          },
        ],
        { rpcUrl, chainId: settings.chainId },
      ).then(
        (value) => {
          if (!cancelled) setGasEstimate(BigInt(value as string));
        },
        () => {
          if (!cancelled) setGasEstimate(null);
        },
      );
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.to, call?.value, call?.data, current?.address, rpcUrl, settings.chainId]);

  // 21 000 is the exact cost of a value transfer to an account, so it is a real answer even
  // before the node replies; a contract call has no such default and waits for the estimate.
  const gas = gasEstimate ?? (token === null && !isContractCall ? 21_000n : null);
  const fee = tier && gas !== null ? tierCost(tier, gas) : null;

  // `tier !== null` is part of readiness: without a price from the node there is nothing to
  // put in the transaction, and a request with a zero fee cap is worse than a refusal.
  const ready =
    wallet !== null &&
    current !== undefined &&
    addressValid &&
    dataValid &&
    (amountValid || isContractCall) &&
    tier !== null;

  const submit = async (): Promise<void> => {
    if (!current) return;
    setPreparing(true);
    setError(null);
    try {
      // Resolve nonce and fees *now*, before the QR, because the offline device has no
      // way to look them up. If the node cannot supply them, fail here rather than
      // putting a half-specified request in front of the user's device.
      if (!call) throw new Error('收款地址或金额还不完整');
      const nonce = Number(BigInt((await forward('eth_getTransactionCount', [current.address, 'pending'])) as string));
      const gasLimit = BigInt(
        (await forward('eth_estimateGas', [
          {
            from: current.address,
            to: call.to,
            value: `0x${call.value.toString(16)}`,
            data: call.data,
          },
        ])) as string,
      );
      // The user's choice, in the shape this chain expects. `fields` is null only when the
      // node never answered, and then the send button is disabled — a transaction with a zero
      // fee cap is not a transaction.
      if (!fields) throw new Error('还没有读到当前费率，请稍后重试');

      const id = requestSigning({
        // The price was chosen in this form, so the signing screen shows it and cannot change
        // it: it is the number the user already read next to the amount.
        feeLocked: true,
        kind: 'sendTransaction',
        origin: '本机钱包（发送）',
        chainId: settings.chainId,
        method: 'eth_sendTransaction',
        params: [
          {
            from: current.address,
            to: call.to,
            value: `0x${call.value.toString(16)}`,
            data: call.data,
            nonce: `0x${nonce.toString(16)}`,
            gas: `0x${gasLimit.toString(16)}`,
            ...fields,
          },
        ],
      });
      void id;
      show('请用离线设备扫描二维码');
      navigate({ name: 'sign', id });
    } catch (caught) {
      setError(explainPreparationFailure(caught as Error, to.trim(), token !== null));
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
    <>
      {/* Back to the asset this was opened from: send is reached from a token screen, and
          returning home loses the context the user just spent a tap building. */}
      <Header
        title="发送"
        onBack={() => navigate({ name: 'asset', asset: tokenAddress ?? 'native' })}
      />
      <div className="np-main">

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
          可用{' '}
          {balance === null ? '—' : token ? formatTokenAmount(balance, token.decimals) : formatEth(balance)}
          {token ? '' : ` ${symbol}`}
          {fee !== null && !token ? ` · 预计手续费 ${formatEth(fee)} ${symbol}` : ''}
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
          金额（{symbol}）
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
                // For a token, the whole balance is spendable: gas is paid in the native
                // coin, not in the token. For the native coin, leave a modest reserve,
                // because a MAX that produces an unaffordable transaction is a trap.
                if (token) {
                  // Gas is paid in the native coin, so the whole token balance is spendable.
                  setAmount(formatTokenAmount(balance, token.decimals, token.decimals));
                  return;
                }
                // Reserve what the chosen speed actually costs for this transaction. If the
                // chain has not answered yet, reserve a mainnet-ish 30 gwei × 21 000 rather
                // than let the user build a transaction that cannot pay for itself.
                const reserve = fee ?? 21_000n * 30_000_000_000n;
                const spendable = balance > reserve ? balance - reserve : 0n;
                setAmount(formatEth(spendable));
              }}
            >
              最大
            </button>
          ) : null}
        </div>
      </div>

      <FeeSelector
        tiers={tiers}
        tierId={tierId}
        onSelect={select}
        gas={gas}
        load={load}
        feeError={feeError}
        unit={feeSymbol}
        usd={usd}
        pendingHint="填好收款地址后显示这笔交易的手续费"
      />

      {/*
        Outlined, not text-only: this one opens a field rather than navigating, and a bare
        label under the amount read as a caption instead of a control.
      */}
      {token ? null : (
        <Button variant="outline" size="small" onClick={() => setAdvanced((value) => !value)}>
          {advanced ? '隐藏高级选项' : '高级选项（合约调用）'}
        </Button>
      )}
      {advanced && !token ? (
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
          <div className="np-body np-body--tight">留空即普通转账。</div>
        </div>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Alert tone="info">
        点击下一步后会显示一个二维码。用离线设备扫描它并在设备屏幕上确认，
        设备会回传签名的二维码，扫回来即可广播。整个过程中私钥不离开设备。
      </Alert>

      <div className="np-row">
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
    </>
  );
}

export { KeyValue };

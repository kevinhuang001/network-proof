import { NetProofError } from '../errors';
import { bigIntToBytes, bytesToBigInt, toHex } from '../util/bytes';
import { checksumAddress, isAddress, normalizeAddress } from './hd';
import { serializeUnsigned, transactionSigningHash, validateTransactionRequest } from './evm';
import type { EvmTransactionRequest } from './evm';

export interface ChainInfo {
  chainId: number;
  name: string;
  shortName: string;
  symbol: string;
  decimals: number;
  /** Public RPC endpoint the companion may use; the device never touches it. */
  rpcUrl: string;
  explorerUrl: string;
}

export const KNOWN_CHAINS: ChainInfo[] = [
  { chainId: 1, name: 'Ethereum Mainnet', shortName: 'Ethereum', symbol: 'ETH', decimals: 18, rpcUrl: 'https://eth.llamarpc.com', explorerUrl: 'https://etherscan.io' },
  { chainId: 10, name: 'OP Mainnet', shortName: 'Optimism', symbol: 'ETH', decimals: 18, rpcUrl: 'https://mainnet.optimism.io', explorerUrl: 'https://optimistic.etherscan.io' },
  { chainId: 56, name: 'BNB Smart Chain', shortName: 'BNB Chain', symbol: 'BNB', decimals: 18, rpcUrl: 'https://bsc-dataseed.binance.org', explorerUrl: 'https://bscscan.com' },
  { chainId: 137, name: 'Polygon PoS', shortName: 'Polygon', symbol: 'POL', decimals: 18, rpcUrl: 'https://polygon-rpc.com', explorerUrl: 'https://polygonscan.com' },
  { chainId: 8453, name: 'Base', shortName: 'Base', symbol: 'ETH', decimals: 18, rpcUrl: 'https://mainnet.base.org', explorerUrl: 'https://basescan.org' },
  { chainId: 42161, name: 'Arbitrum One', shortName: 'Arbitrum', symbol: 'ETH', decimals: 18, rpcUrl: 'https://arb1.arbitrum.io/rpc', explorerUrl: 'https://arbiscan.io' },
  { chainId: 43114, name: 'Avalanche C-Chain', shortName: 'Avalanche', symbol: 'AVAX', decimals: 18, rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', explorerUrl: 'https://snowtrace.io' },
  { chainId: 11155111, name: 'Sepolia Testnet', shortName: 'Sepolia', symbol: 'ETH', decimals: 18, rpcUrl: 'https://rpc.sepolia.org', explorerUrl: 'https://sepolia.etherscan.io' },
];

export function chainInfo(chainId: number): ChainInfo | undefined {
  return KNOWN_CHAINS.find((chain) => chain.chainId === chainId);
}

export function chainName(chainId: number): string {
  return chainInfo(chainId)?.name ?? `Chain ${chainId}`;
}

/**
 * Fixed-point formatting without floating point, so no digit is ever lost.
 *
 * `maxFractionDigits` defaults to full precision. When it does truncate, it keeps
 * enough digits to stay non-zero: showing "0 ETH" for a non-zero amount would be
 * a gift to dust-amount and hidden-value attacks, so truncation is only ever
 * allowed to shorten trailing digits, never to erase the value.
 */
export function formatUnits(value: bigint, decimals = 18, maxFractionDigits = decimals): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  let fraction = (absolute % base).toString().padStart(decimals, '0');
  if (maxFractionDigits < fraction.length) {
    const truncated = fraction.slice(0, maxFractionDigits);
    if (/^0*$/u.test(truncated) && absolute % base !== 0n) {
      // Keep the leading zeros plus the first significant digit.
      const firstSignificant = fraction.search(/[1-9]/u);
      fraction = fraction.slice(0, Math.min(decimals, firstSignificant + 1));
    } else {
      fraction = truncated;
    }
  }
  fraction = fraction.replace(/0+$/u, '');
  const sign = negative ? '-' : '';
  return fraction.length > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

export function parseUnits(value: string, decimals = 18): bigint {
  const trimmed = value.trim();
  if (!/^\d*(\.\d*)?$/u.test(trimmed) || trimmed === '' || trimmed === '.') {
    throw new NetProofError('TX_INVALID_FIELD', `not a decimal amount: ${value}`);
  }
  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new NetProofError('TX_INVALID_FIELD', `too many decimal places for ${decimals}-decimal asset`);
  }
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

export interface DecodedParameter {
  name: string;
  type: string;
  /** Human-readable rendering, shown on the device screen. */
  value: string;
  /** Exact decimal string for integer types; warnings compare against this. */
  rawValue?: string;
}

export interface DecodedCall {
  selector: string;
  signature: string;
  name: string;
  standard: 'ERC-20' | 'ERC-721' | 'unknown';
  parameters: DecodedParameter[];
}

/** The call selectors a hardware wallet must be able to explain on screen. */
const KNOWN_SELECTORS: Record<
  string,
  { signature: string; name: string; standard: DecodedCall['standard']; types: string[]; names: string[] }
> = {
  '0xa9059cbb': {
    signature: 'transfer(address,uint256)',
    name: '转账代币',
    standard: 'ERC-20',
    types: ['address', 'uint256'],
    names: ['接收地址', '数量'],
  },
  '0x095ea7b3': {
    signature: 'approve(address,uint256)',
    name: '授权代币额度',
    standard: 'ERC-20',
    types: ['address', 'uint256'],
    names: ['被授权方', '额度'],
  },
  '0x23b872dd': {
    signature: 'transferFrom(address,address,uint256)',
    name: '代扣转账',
    standard: 'ERC-20',
    types: ['address', 'address', 'uint256'],
    names: ['付款方', '接收地址', '数量'],
  },
  '0x39509351': {
    signature: 'increaseAllowance(address,uint256)',
    name: '增加授权额度',
    standard: 'ERC-20',
    types: ['address', 'uint256'],
    names: ['被授权方', '增加量'],
  },
  '0xa457c2d7': {
    signature: 'decreaseAllowance(address,uint256)',
    name: '减少授权额度',
    standard: 'ERC-20',
    types: ['address', 'uint256'],
    names: ['被授权方', '减少量'],
  },
  '0xa22cb465': {
    signature: 'setApprovalForAll(address,bool)',
    name: '授权全部 NFT',
    standard: 'ERC-721',
    types: ['address', 'bool'],
    names: ['操作方', '是否授权'],
  },
};

export const UNLIMITED_ALLOWANCE = 2n ** 256n - 1n;
/** 2^255 — anything at or above this is "effectively unlimited" to a human reader. */
const HUGE_ALLOWANCE = 2n ** 255n;

export function decodeCall(data: string): DecodedCall | null {
  if (data === '0x' || data.length < 10) return null;
  const selector = data.slice(0, 10).toLowerCase();
  const body = data.slice(10);
  const known = KNOWN_SELECTORS[selector];
  if (!known) {
    return {
      selector,
      signature: 'unknown',
      name: '未知合约调用',
      standard: 'unknown',
      parameters: [{ name: '数据长度', type: 'bytes', value: `${Math.floor(body.length / 2)} 字节` }],
    };
  }
  const parameters: DecodedParameter[] = [];
  const words = body.length / 64;
  if (words < known.types.length) {
    throw new NetProofError('TX_INVALID_FIELD', `calldata for ${known.signature} is truncated`);
  }
  known.types.forEach((type, index) => {
    const word = body.slice(index * 64, index * 64 + 64);
    const decoded = decodeWord(type, word);
    parameters.push({
      name: known.names[index] ?? `arg${index}`,
      type,
      value: decoded.display,
      ...(decoded.raw !== undefined ? { rawValue: decoded.raw } : {}),
    });
  });
  return { selector, signature: known.signature, name: known.name, standard: known.standard, parameters };
}

function decodeWord(type: string, word: string): { display: string; raw?: string } {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Number.parseInt(word.slice(i * 2, i * 2 + 2), 16);
  if (type === 'address') {
    return { display: checksumAddress(toHex(bytes.subarray(12))) };
  }
  if (type === 'bool') {
    const value = bytesToBigInt(bytes) !== 0n;
    return { display: value ? 'true' : 'false', raw: value ? '1' : '0' };
  }
  if (type === 'uint256') {
    const value = bytesToBigInt(bytes);
    return {
      display: value === UNLIMITED_ALLOWANCE ? '无限 (2^256-1)' : value.toString(),
      raw: value.toString(),
    };
  }
  return { display: toHex(bytes, true) };
}

export type WarningLevel = 'info' | 'warn' | 'danger';

export interface TransactionWarning {
  level: WarningLevel;
  code: string;
  message: string;
}

export interface TransactionSummary {
  chainId: number;
  chainName: string;
  chainSymbol: string;
  type: 'eip1559' | 'legacy';
  nonce: number;
  /** EIP-55 checksummed recipient, or null for contract creation. */
  to: string | null;
  toKind: 'external-account' | 'contract-call' | 'contract-creation' | 'unknown';
  value: bigint;
  valueFormatted: string;
  /** Total value the user can lose: value + gas * maxFeePerGas. */
  maxTotalCost: bigint;
  maxTotalCostFormatted: string;
  gas: bigint;
  feePerGas: bigint;
  feePerGasLabel: string;
  dataLength: number;
  call: DecodedCall | null;
  warnings: TransactionWarning[];
  /** keccak256 of the unsigned payload — this is exactly what gets signed. */
  signingHash: string;
  unsignedSerialized: string;
}

/**
 * Decode everything the user needs to approve a transaction, and compute the
 * exact bytes that will be signed. The device renders this summary *and* signs the
 * recomputed payload, so a companion that lies about the request cannot get a
 * different transaction signed.
 */
export function describeTransaction(request: EvmTransactionRequest): TransactionSummary {
  validateTransactionRequest(request);
  const chain = chainInfo(request.chainId);
  const symbol = chain?.symbol ?? 'ETH';
  const decimals = chain?.decimals ?? 18;
  const feePerGas =
    request.type === 'eip1559' ? (request.maxFeePerGas ?? 0n) : (request.gasPrice ?? 0n);
  const gas = request.gas ?? 0n;
  const maxTotalCost = request.value + gas * feePerGas;
  const call = decodeCall(request.data);
  const hasData = request.data !== '0x' && request.data.length > 2;

  const warnings: TransactionWarning[] = [];
  let toKind: TransactionSummary['toKind'] = 'unknown';
  if (request.to === null) {
    toKind = 'contract-creation';
    warnings.push({
      level: 'danger',
      code: 'CONTRACT_CREATION',
      message: '这是一笔合约部署交易，没有任何收款地址，请确认你正在部署的合约代码。',
    });
  } else if (hasData) {
    toKind = 'contract-call';
  } else {
    toKind = 'external-account';
  }

  if (call && call.standard === 'ERC-20') {
    const amountParam = call.parameters[call.parameters.length - 1];
    if (amountParam?.type === 'uint256' && amountParam.rawValue !== undefined) {
      const amount = BigInt(amountParam.rawValue);
      if (call.signature.startsWith('approve')) {
        if (amount === UNLIMITED_ALLOWANCE) {
          warnings.push({
            level: 'danger',
            code: 'UNLIMITED_APPROVE',
            message: '无限授权：被授权方可以随时转走你该代币的全部余额。',
          });
        } else if (amount >= HUGE_ALLOWANCE) {
          warnings.push({
            level: 'danger',
            code: 'HUGE_APPROVE',
            message: '授权额度极大（接近 2^255），风险等同于无限授权。',
          });
        }
      }
    }
  }
  if (call && call.standard === 'ERC-721') {
    const approvedParam = call.parameters.find((p) => p.type === 'bool');
    if (approvedParam?.rawValue === '1') {
      warnings.push({
        level: 'danger',
        code: 'NFT_APPROVAL_FOR_ALL',
        message: '授权全部 NFT：操作方可以转走该合约下你持有的所有 NFT。',
      });
    }
  }
  if (call && call.standard === 'unknown') {
    warnings.push({
      level: 'warn',
      code: 'UNKNOWN_SELECTOR',
      message: `无法识别的合约方法 ${call.selector}，设备无法说明它的作用。`,
    });
  }
  if (hasData && request.value > 0n) {
    warnings.push({
      level: 'warn',
      code: 'VALUE_TO_CONTRACT',
      message: '这笔调用同时携带了主链币，请确认合约确实需要收款。',
    });
  }
  if (feePerGas > 500_000_000_000n) {
    warnings.push({
      level: 'warn',
      code: 'HIGH_FEE',
      message: `Gas 价格异常高（${formatUnits(feePerGas, 9)} Gwei）。`,
    });
  }
  if (request.nonce === 0) {
    warnings.push({ level: 'info', code: 'FIRST_TX', message: '这是该账户的第一笔交易 (nonce = 0)。' });
  }
  if (!chain) {
    warnings.push({
      level: 'warn',
      code: 'UNKNOWN_CHAIN',
      message: `未知链 ID ${request.chainId}，请确认你不是在被诱导到其他网络签名。`,
    });
  }
  if (request.to !== null && !isAddress(request.to)) {
    throw new NetProofError('TX_INVALID_FIELD', 'invalid recipient address');
  }

  return {
    chainId: request.chainId,
    chainName: chainName(request.chainId),
    chainSymbol: symbol,
    type: request.type,
    nonce: request.nonce,
    to: request.to === null ? null : checksumAddress(request.to),
    toKind,
    value: request.value,
    valueFormatted: `${formatUnits(request.value, decimals)} ${symbol}`,
    maxTotalCost,
    maxTotalCostFormatted: `${formatUnits(maxTotalCost, decimals)} ${symbol}`,
    gas,
    feePerGas,
    feePerGasLabel:
      request.type === 'eip1559'
        ? `${formatUnits(feePerGas, 9)} Gwei (max)`
        : `${formatUnits(feePerGas, 9)} Gwei`,
    dataLength: Math.max(0, (request.data.length - 2) / 2),
    call,
    warnings,
    signingHash: toHex(transactionSigningHash(request), true),
    unsignedSerialized: serializeUnsigned(request),
  };
}

export interface MessageSummary {
  kind: 'personal' | 'typed-data';
  title: string;
  body: string;
  digest: string;
  warnings: TransactionWarning[];
}

export function describePersonalMessage(message: string, digestHex: string): MessageSummary {
  const warnings: TransactionWarning[] = [];
  if (message.length > 2000) {
    warnings.push({
      level: 'warn',
      code: 'LONG_MESSAGE',
      message: '消息很长，请确认你没有在签署看不懂的内容。',
    });
  }
  if (/0x[0-9a-fA-F]{64}/u.test(message)) {
    warnings.push({
      level: 'warn',
      code: 'HASH_LIKE',
      message: '消息中包含 32 字节哈希，它可能是一笔被伪装成"签名登录"的交易。',
    });
  }
  return { kind: 'personal', title: '签名文本消息 (EIP-191)', body: message, digest: digestHex, warnings };
}

export function describeTypedData(
  payload: {
    domain?: Record<string, unknown>;
    primaryType?: string;
    message?: Record<string, unknown>;
  },
  digestHex: string,
): MessageSummary {
  const warnings: TransactionWarning[] = [];
  const domainName = typeof payload.domain?.name === 'string' ? payload.domain.name : '未知应用';
  const primaryType = payload.primaryType ?? 'unknown';
  const verifying = typeof payload.domain?.verifyingContract === 'string' ? payload.domain.verifyingContract : undefined;
  if (primaryType.toLowerCase().includes('permit')) {
    warnings.push({
      level: 'danger',
      code: 'PERMIT',
      message: '这是一份 Permit 授权签名：签名即代表同意对方划走你的代币，且不需要再发交易。',
    });
  }
  if (!verifying) {
    warnings.push({ level: 'warn', code: 'NO_VERIFYING_CONTRACT', message: '未指定验证合约地址，无法确认签名去向。' });
  }
  return {
    kind: 'typed-data',
    title: `签名结构化数据 (EIP-712) · ${primaryType}`,
    body: `${domainName}${verifying ? ` @ ${verifying}` : ''}\n${JSON.stringify(payload.message ?? {}, null, 2)}`,
    digest: digestHex,
    warnings,
  };
}

/** Short display form of an address: 0x1234…abcd. */
export function shortAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 2) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function addressesEqual(a: string, b: string): boolean {
  return normalizeAddress(a) === normalizeAddress(b);
}

export { bigIntToBytes };

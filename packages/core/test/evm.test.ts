import { describe, expect, it } from 'vitest';
import {
  Transaction as EthersTransaction,
  Wallet,
  getBytes,
  hexlify,
  recoverAddress,
  verifyMessage,
  verifyTypedData,
} from 'ethers';
import { HDKey } from '@scure/bip32';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { parseTransaction } from 'viem';
import { keccak_256 } from '@noble/hashes/sha3.js';
import {
  hashPersonalMessage,
  hashTypedDataPayload,
  privateKeyToAddress,
  serializeUnsigned,
  signHashWithKey,
  signPersonalMessage,
  signTransaction,
  signTypedData,
  transactionSigningHash,
  validatePrivateKey,
  validateTransactionRequest,
  verifySignedTransaction,
} from '../src/crypto/evm';
import type { EvmTransactionRequest } from '../src/crypto/evm';
import { mnemonicToSeed } from '../src/crypto/mnemonic';
import {
  KNOWN_CHAINS,
  UNLIMITED_ALLOWANCE,
  decodeCall,
  describePersonalMessage,
  describeTransaction,
  describeTypedData,
  formatUnits,
  parseUnits,
  shortAddress,
  addressesEqual,
} from '../src/crypto/txdescribe';
import { toHex } from '../src/util/bytes';
import { derivePath } from '../src/crypto/hd';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, ''));
const PRIVATE_KEY = derivePath(root, "m/44'/60'/0'/0/0").privateKey!;
const ADDRESS = privateKeyToAddress(PRIVATE_KEY);
const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const baseTx = (overrides: Partial<EvmTransactionRequest> = {}): EvmTransactionRequest => ({
  type: 'eip1559',
  chainId: 1,
  nonce: 7,
  to: RECIPIENT,
  value: 1_000_000_000_000_000_000n,
  data: '0x',
  gas: 21000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_500_000_000n,
  ...overrides,
});

describe('evm addresses and keys', () => {
  it('derives the documented address from the classic test mnemonic', () => {
    expect(ADDRESS).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it('rejects invalid private keys', () => {
    expect(() => validatePrivateKey(new Uint8Array(31))).toThrow(/32 bytes/);
    expect(() => validatePrivateKey(new Uint8Array(32))).toThrow(/valid secp256k1 range/);
    const order = getBytes('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
    expect(() => validatePrivateKey(order)).toThrow(/valid secp256k1 range/);
  });
});

describe('evm transaction signing (EIP-1559 / EIP-155)', () => {
  it('produces a signature ethers accepts, and recovers the right sender', () => {
    const signed = signTransaction(baseTx(), PRIVATE_KEY);
    const parsed = EthersTransaction.from(signed.rawTransaction);
    expect(parsed.from).toBe(ADDRESS);
    expect(parsed.type).toBe(2);
    expect(parsed.nonce).toBe(7);
    expect(parsed.to).toBe(RECIPIENT);
    expect(parsed.value).toBe(1_000_000_000_000_000_000n);
    expect(parsed.gasLimit).toBe(21000n);
    expect(parsed.maxFeePerGas).toBe(30_000_000_000n);
    expect(parsed.maxPriorityFeePerGas).toBe(1_500_000_000n);
    expect(parsed.chainId).toBe(1n);
    expect(parsed.hash).toBe(signed.hash);
  });

  it('is byte-identical to ethers for the same request', async () => {
    // Differential test against an independent implementation, including the
    // deterministic RFC 6979 nonce and the low-S normalisation.
    const ethersWallet = new Wallet(hexlify(PRIVATE_KEY));
    for (const request of [
      baseTx(),
      baseTx({ nonce: 0, value: 0n, data: '0xa9059cbb', gas: 60000n }),
      baseTx({ chainId: 137, to: null, data: '0x60806040', gas: 1_000_000n }),
      baseTx({ chainId: 42161, gas: 21000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 0n }),
    ]) {
      const mine = signTransaction(request, PRIVATE_KEY).rawTransaction;
      const theirs = await ethersWallet.signTransaction({
        type: 2,
        chainId: request.chainId,
        nonce: request.nonce,
        to: request.to,
        value: request.value,
        data: request.data,
        gasLimit: request.gas,
        maxFeePerGas: request.maxFeePerGas,
        maxPriorityFeePerGas: request.maxPriorityFeePerGas,
      });
      expect(mine, `nonce ${request.nonce} chain ${request.chainId}`).toBe(theirs);
    }
  });

  it('handles legacy (type 0) transactions with EIP-155 replay protection', async () => {
    const request = baseTx({ type: 'legacy', gasPrice: 20_000_000_000n });
    delete (request as unknown as Record<string, unknown>).maxFeePerGas;
    delete (request as unknown as Record<string, unknown>).maxPriorityFeePerGas;
    const signed = signTransaction(request, PRIVATE_KEY);
    const ethersWallet = new Wallet(hexlify(PRIVATE_KEY));
    const theirs = await ethersWallet.signTransaction({
      type: 0,
      chainId: 1,
      nonce: request.nonce,
      to: request.to,
      value: request.value,
      data: request.data,
      gasLimit: request.gas,
      gasPrice: request.gasPrice,
    });
    expect(signed.rawTransaction).toBe(theirs);
    expect(EthersTransaction.from(signed.rawTransaction).chainId).toBe(1n);
    // The raw payload must carry the EIP-155 offset (chainId*2+35), not 27/28.
    const parsedRaw = parseTransaction(signed.rawTransaction as `0x${string}`);
    expect(parsedRaw.v).toBeGreaterThanOrEqual(35n);
  });

  it('signs the exact payload the device displayed', () => {
    const request = baseTx();
    const summary = describeTransaction(request);
    const signed = signTransaction(request, PRIVATE_KEY);
    // The signing hash is a pure function of the displayed fields.
    expect(summary.signingHash).toBe(toHex(transactionSigningHash(request), true));
    expect(toHex(keccak_256(getBytes(signed.rawTransaction)), true)).toBe(signed.hash);
    expect(summary.unsignedSerialized).toBe(serializeUnsigned(request));
  });

  it('validates requests before signing anything', () => {
    expect(() => validateTransactionRequest(baseTx({ chainId: 0 }))).toThrow(/invalid chainId/);
    expect(() => validateTransactionRequest(baseTx({ nonce: -1 }))).toThrow(/invalid nonce/);
    expect(() => validateTransactionRequest(baseTx({ to: '0x123' }))).toThrow(/invalid to address/);
    expect(() => validateTransactionRequest(baseTx({ data: '0x123' }))).toThrow(/even-length/);
    expect(() => validateTransactionRequest(baseTx({ value: -1n }))).toThrow(/value cannot be negative/);
    expect(() => validateTransactionRequest(baseTx({ gas: undefined }))).toThrow(/gas limit is required/);
    expect(() => validateTransactionRequest(baseTx({ gas: 0n }))).toThrow(/gas limit is required/);
    expect(() =>
      validateTransactionRequest(baseTx({ maxPriorityFeePerGas: 99_000_000_000n })),
    ).toThrow(/cannot exceed maxFeePerGas/);
    const legacy = baseTx({ type: 'legacy', gasPrice: 1n });
    delete (legacy as unknown as Record<string, unknown>).gasPrice;
    expect(() => validateTransactionRequest(legacy)).toThrow(/requires gasPrice/);
    expect(() =>
      validateTransactionRequest({ ...baseTx(), type: 'eip2930' as never }),
    ).toThrow(/unsupported transaction type/);
  });

  it('verifies a signed payload and detects a mismatch', async () => {
    const signed = signTransaction(baseTx(), PRIVATE_KEY);
    const good = await verifySignedTransaction(signed.rawTransaction, {
      from: ADDRESS,
      hash: signed.hash,
      request: baseTx(),
    });
    expect(good.ok, good.reasons.join('; ')).toBe(true);

    // A different recipient than the one the user approved must be rejected.
    const tampered = signTransaction(baseTx({ to: '0x000000000000000000000000000000000000dEaD' }), PRIVATE_KEY);
    const bad = await verifySignedTransaction(tampered.rawTransaction, {
      from: ADDRESS,
      request: baseTx(),
    });
    expect(bad.ok).toBe(false);
    expect(bad.reasons.join(' ')).toMatch(/does not match the fields shown/);

    const wrongSender = await verifySignedTransaction(signed.rawTransaction, {
      from: RECIPIENT,
    });
    expect(wrongSender.ok).toBe(false);
    expect(wrongSender.reasons.join(' ')).toMatch(/sender mismatch/);

    const wrongHash = await verifySignedTransaction(signed.rawTransaction, {
      from: ADDRESS,
      hash: `0x${'00'.repeat(32)}`,
    });
    expect(wrongHash.ok).toBe(false);
    expect(wrongHash.reasons.join(' ')).toMatch(/hash mismatch/);
  });

  it('rejects garbage instead of throwing', async () => {
    const result = await verifySignedTransaction('0xdeadbeef', { from: ADDRESS });
    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

describe('evm message signing', () => {
  it('matches the EIP-191 prefix definition exactly', () => {
    const message = 'Hello NetProof';
    const manual = keccak_256(
      new Uint8Array([...new TextEncoder().encode(`\x19Ethereum Signed Message:\n${message.length}`), ...new TextEncoder().encode(message)]),
    );
    expect(toHex(hashPersonalMessage(message))).toBe(toHex(manual));
    // Length prefix must count bytes, not characters.
    const unicode = '你好';
    expect(toHex(hashPersonalMessage(unicode))).toBe(toHex(hashPersonalMessage(new TextEncoder().encode(unicode))));
  });

  it('produces a personal_sign signature ethers verifies', () => {
    const message = 'Sign in to NetProof Wallet\nNonce: 42';
    const signature = signPersonalMessage(message, PRIVATE_KEY);
    expect(signature.serialized).toHaveLength(132);
    expect(recoverAddress(hashPersonalMessage(message), signature.serialized)).toBe(ADDRESS);
    expect(verifyMessage(message, signature.serialized)).toBe(ADDRESS);
    expect(signature.v).toBe(BigInt(27 + signature.yParity));
  });

  it('produces an EIP-712 signature ethers verifies', () => {
    const payload = {
      domain: { name: 'NetProof', version: '1', chainId: 1, verifyingContract: '0x0000000000000000000000000000000000000001' },
      types: {
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallet', type: 'address' },
        ],
      },
      primaryType: 'Person',
      message: { name: 'Alice', wallet: RECIPIENT },
    };
    const signature = signTypedData(payload, PRIVATE_KEY);
    expect(recoverAddress(hashTypedDataPayload(payload), signature.serialized)).toBe(ADDRESS);
    expect(
      verifyTypedData(payload.domain, payload.types, payload.message, signature.serialized),
    ).toBe(ADDRESS);
  });

  it('signs an already-hashed digest deterministically (RFC 6979)', () => {
    const digest = keccak_256(new TextEncoder().encode('deterministic'));
    const a = signHashWithKey(digest, PRIVATE_KEY);
    const b = signHashWithKey(digest, PRIVATE_KEY);
    expect(a.r).toBe(b.r);
    expect(a.s).toBe(b.s);
    expect(a.recovery).toBe(b.recovery);
    expect(() => signHashWithKey(new Uint8Array(31), PRIVATE_KEY)).toThrow(/32 bytes/);
    // Low-S is required for Ethereum: s must sit in the lower half of the curve order.
    expect(a.s).toBeLessThan(secp256k1.Point.Fn.ORDER / 2n);
  });
});

describe('transaction description (what the device shows)', () => {
  it('formats and parses fixed-point amounts exactly', () => {
    expect(formatUnits(1_000_000_000_000_000_000n, 18)).toBe('1');
    expect(formatUnits(1n, 18)).toBe('0.000000000000000001');
    expect(formatUnits(0n, 18)).toBe('0');
    expect(formatUnits(123_456_789n, 6)).toBe('123.456789');
    expect(formatUnits(1_500_000_000_000_000_000n, 18)).toBe('1.5');
    expect(formatUnits(-1n, 18)).toBe('-0.000000000000000001');
    expect(formatUnits(1234567890123456789n, 18, 4)).toBe('1.2345');
    // Truncation must never turn a non-zero amount into "0".
    expect(formatUnits(1n, 18, 8)).toBe('0.000000000000000001');
    expect(formatUnits(10n ** 17n, 18, 8)).toBe('0.1');
    expect(parseUnits('1.5', 18)).toBe(1_500_000_000_000_000_000n);
    expect(parseUnits('0.000000000000000001', 18)).toBe(1n);
    expect(() => parseUnits('1.2.3', 18)).toThrow(/not a decimal amount/);
    expect(() => parseUnits('0.0000001', 6)).toThrow(/too many decimal places/);
  });

  it('decodes ERC-20 transfer calldata', () => {
    const data =
      '0xa9059cbb' +
      '00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8' +
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000';
    const call = decodeCall(data)!;
    expect(call.signature).toBe('transfer(address,uint256)');
    expect(call.standard).toBe('ERC-20');
    expect(call.parameters[0].value).toBe(RECIPIENT);
    expect(call.parameters[1].value).toBe('1000000000000000000');
    expect(decodeCall('0x')).toBeNull();
    expect(decodeCall('0x1234')).toBeNull();
  });

  it('flags an unlimited ERC-20 approval as dangerous', () => {
    const data =
      '0x095ea7b3' +
      '00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8' +
      UNLIMITED_ALLOWANCE.toString(16).padStart(64, '0');
    const summary = describeTransaction(baseTx({ to: '0x0000000000000000000000000000000000000002', data, value: 0n }));
    expect(summary.call?.parameters[1].value).toBe('无限 (2^256-1)');
    expect(summary.warnings.map((w) => w.code)).toContain('UNLIMITED_APPROVE');
    expect(summary.warnings.find((w) => w.code === 'UNLIMITED_APPROVE')?.level).toBe('danger');
  });

  it('flags a near-unlimited approval and an NFT approval-for-all', () => {
    const huge = (2n ** 255n).toString(16).padStart(64, '0');
    const approveData = `0x095ea7b3${RECIPIENT.slice(2).toLowerCase().padStart(64, '0')}${huge}`;
    expect(
      describeTransaction(baseTx({ data: approveData, value: 0n })).warnings.map((w) => w.code),
    ).toContain('HUGE_APPROVE');

    const nftData = `0xa22cb465${RECIPIENT.slice(2).toLowerCase().padStart(64, '0')}${'0'.repeat(63)}1`;
    const nft = describeTransaction(baseTx({ data: nftData, value: 0n }));
    expect(nft.warnings.map((w) => w.code)).toContain('NFT_APPROVAL_FOR_ALL');
    expect(nft.toKind).toBe('contract-call');
  });

  it('warns about unknown selectors instead of pretending to understand them', () => {
    const summary = describeTransaction(baseTx({ data: '0xdeadbeef', value: 0n }));
    expect(summary.call?.signature).toBe('unknown');
    expect(summary.warnings.map((w) => w.code)).toContain('UNKNOWN_SELECTOR');
  });

  it('flags contract creation, value-to-contract, high fees and unknown chains', () => {
    const creation = describeTransaction(baseTx({ to: null, data: '0x6080604052' }));
    expect(creation.toKind).toBe('contract-creation');
    expect(creation.to).toBeNull();
    expect(creation.warnings.map((w) => w.code)).toContain('CONTRACT_CREATION');

    const withValue = describeTransaction(baseTx({ data: '0xdeadbeef', value: 5n }));
    expect(withValue.warnings.map((w) => w.code)).toContain('VALUE_TO_CONTRACT');

    const expensive = describeTransaction(baseTx({ maxFeePerGas: 1_000_000_000_000n }));
    expect(expensive.warnings.map((w) => w.code)).toContain('HIGH_FEE');

    const unknownChain = describeTransaction(baseTx({ chainId: 999999 }));
    expect(unknownChain.chainName).toBe('Chain 999999');
    expect(unknownChain.warnings.map((w) => w.code)).toContain('UNKNOWN_CHAIN');
  });

  it('computes the maximum total cost including the worst-case fee', () => {
    const summary = describeTransaction(baseTx());
    // 1 ETH + 21000 * 30 gwei = 1.00063 ETH
    expect(summary.maxTotalCost).toBe(1_000_000_000_000_000_000n + 21000n * 30_000_000_000n);
    expect(summary.maxTotalCostFormatted).toBe('1.00063 ETH');
    expect(summary.valueFormatted).toBe('1 ETH');
    expect(summary.feePerGasLabel).toBe('30 Gwei (max)');
    expect(summary.chainSymbol).toBe('ETH');
    expect(summary.to).toBe(RECIPIENT);
  });

  it('labels known chains and exposes their RPC/explorer metadata', () => {
    expect(KNOWN_CHAINS.length).toBeGreaterThanOrEqual(8);
    for (const chain of KNOWN_CHAINS) {
      expect(chain.rpcUrl.startsWith('https://')).toBe(true);
      expect(chain.explorerUrl.startsWith('https://')).toBe(true);
      expect(chain.decimals).toBe(18);
    }
    expect(describeTransaction(baseTx({ chainId: 137 })).chainSymbol).toBe('POL');
    expect(describeTransaction(baseTx({ chainId: 43114 })).chainSymbol).toBe('AVAX');
  });

  it('raises an info note for the first transaction of an account', () => {
    expect(describeTransaction(baseTx({ nonce: 0 })).warnings.map((w) => w.code)).toContain('FIRST_TX');
    expect(describeTransaction(baseTx({ nonce: 1 })).warnings.map((w) => w.code)).not.toContain('FIRST_TX');
  });

  it('describes personal messages, warning about hash-like payloads', () => {
    const plain = describePersonalMessage('hello', `0x${'ab'.repeat(32)}`);
    expect(plain.kind).toBe('personal');
    expect(plain.warnings).toHaveLength(0);
    const hashLike = describePersonalMessage(`0x${'ab'.repeat(32)}`, `0x${'ab'.repeat(32)}`);
    expect(hashLike.warnings.map((w) => w.code)).toContain('HASH_LIKE');
    const long = describePersonalMessage('x'.repeat(2001), `0x${'ab'.repeat(32)}`);
    expect(long.warnings.map((w) => w.code)).toContain('LONG_MESSAGE');
  });

  it('describes EIP-712 payloads and warns about Permit signatures', () => {
    const permit = describeTypedData(
      {
        domain: { name: 'USD Coin', verifyingContract: RECIPIENT },
        primaryType: 'Permit',
        message: { owner: ADDRESS, spender: RECIPIENT, value: '1000' },
      },
      `0x${'cd'.repeat(32)}`,
    );
    expect(permit.title).toContain('Permit');
    expect(permit.body).toContain('USD Coin');
    expect(permit.body).toContain(RECIPIENT);
    expect(permit.warnings.map((w) => w.code)).toContain('PERMIT');

    const noContract = describeTypedData({ primaryType: 'Mail', message: {} }, `0x${'cd'.repeat(32)}`);
    expect(noContract.warnings.map((w) => w.code)).toContain('NO_VERIFYING_CONTRACT');
  });

  it('shortens addresses for narrow screens', () => {
    expect(shortAddress(ADDRESS)).toBe('0x9858…da94');
    expect(shortAddress('0x1234')).toBe('0x1234');
    expect(addressesEqual(ADDRESS, ADDRESS.toLowerCase())).toBe(true);
    expect(addressesEqual(ADDRESS, RECIPIENT)).toBe(false);
  });
});

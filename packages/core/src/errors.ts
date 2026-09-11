/**
 * Domain-separated error type. Every failure path in the core is explicit so that
 * callers (and tests) can branch on a stable `code` instead of matching strings.
 */
export type NetProofErrorCode =
  | 'ENTROPY_INSUFFICIENT'
  | 'ENTROPY_HEALTH_FAILED'
  | 'ENTROPY_NO_FRAMES'
  | 'MNEMONIC_INVALID'
  | 'MNEMONIC_STRENGTH'
  | 'PATH_INVALID'
  | 'DERIVATION_HARDENED_NEEDS_PRIVATE'
  | 'KEY_MISSING_PRIVATE'
  | 'TX_UNSUPPORTED_TYPE'
  | 'TX_INVALID_FIELD'
  | 'VAULT_DECRYPT_FAILED'
  | 'VAULT_FORMAT'
  | 'VAULT_KDF_UNSUPPORTED'
  | 'QR_FRAME_INVALID'
  | 'QR_CHECKSUM_MISMATCH'
  | 'QR_DECODE_FAILED'
  | 'CBOR_INVALID'
  | 'PROTOCOL_INVALID'
  | 'PROTOCOL_UNKNOWN_TYPE';

export class NetProofError extends Error {
  readonly code: NetProofErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: NetProofErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'NetProofError';
    this.code = code;
    this.details = details;
  }
}

export function fail(
  code: NetProofErrorCode,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new NetProofError(code, message, details);
}


import { describe, expect, it } from 'vitest';
import { HDKey, buildWalletExport, buildXpubMessage, mnemonicToSeed } from '@netproof/core';
import {
  DEFAULT_SETTINGS,
  visibleAccounts,
  walletFromXpubMessage,
} from '@netproof/companion';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('the export moved one level, and nothing else did', () => {
  it('gives the same addresses for a key exported at either level', () => {
    const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, ''));
    const exported = buildWalletExport(root);
    const account = exported.accounts[0]!;

    // What a wallet paired *before* this change holds.
    const legacy = walletFromXpubMessage(
      buildXpubMessage(
        {
          ...exported,
          accounts: [
            {
              ...account,
              xpubPath: "m/44'/60'/0'",
              xpub: root.derive("m/44'/60'/0'").publicExtendedKey,
            },
          ],
          schemes: [{ ...exported.schemes[0]!, xpubPath: "m/44'/60'/0'" }],
        },
        { name: 'NetProof Air', model: 'test' },
      ),
    );
    const fresh = walletFromXpubMessage(
      buildXpubMessage(exported, { name: 'NetProof Air', model: 'test' }),
    );

    const settings = { ...DEFAULT_SETTINGS, visibleAccounts: 5, addressCount: 5 };
    const before = visibleAccounts(legacy, settings, 5).map((a) => `${a.path} ${a.address}`);
    const after = visibleAccounts(fresh, settings, 5).map((a) => `${a.path} ${a.address}`);
    expect(after).toEqual(before);
    expect(after[0]).toMatch(new RegExp(`^m/44'/60'/0'/0/0 0x`));
  });
});

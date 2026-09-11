# Network logos

Real network logos, not redrawn approximations. A wallet that shows a hand-drawn
Ethereum diamond next to a real Ethereum balance is asking the user to trust a picture
that is already wrong about something visible.

## Source

`trustwallet/assets` (MIT), `blockchains/<chain>/info/logo.png`:

| File | Chain | chainId |
| --- | --- | --- |
| `ethereum.png` | Ethereum | 1 |
| `bnb.png` | BNB Chain | 56 |
| `polygon.png` | Polygon | 137 |
| `avalanche.png` | Avalanche C-Chain | 43114 |
| `optimism.png` | OP Mainnet | 10 |
| `arbitrum.png` | Arbitrum One | 42161 |
| `base.png` | Base | 8453 |
| `solana.png` | Solana | 501 |

Upstream files are 192×192; these are re-encoded to 96×96 (displayed at 22–40px) to keep
the app bundle small. Fetch command, for reproducibility:

```sh
curl -sS -o ethereum.png \
  https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png
```

## Copying

The same eight files exist in three places, on purpose:

- `apps/hardware/public/logos/` — the device app, bundled into the APK. It is offline
  forever, so these must be local files; the CSP allows `img-src 'self' data: blob:`.
- `apps/companion-web/public/logos/`
- `apps/extension/public/logos/`

They are static assets rather than imports from this package so that all three apps get
them through the same path (`./logos/<file>.png`) with no bundler coupling.
`packages/ui/src/networks.ts` holds the chainId → file mapping those apps share.

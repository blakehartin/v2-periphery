# QuantumSwap V2 Periphery

Peripheral smart contracts for interacting with QuantumSwap V2 on the QuantumCoin blockchain.

This is a modified fork of [Uniswap V2 periphery](https://github.com/Uniswap/v2-periphery) (GPL-3.0-or-later),
adapted for QuantumCoin: Solidity 0.7.6, 32-byte addresses, no `ecrecover`/permit, runtime
`INIT_CODE_HASH` lookup from the factory.

# Local Development

The following assumes the use of `node@>=18`. Contracts are compiled with the
[`@quantumcoin/solc`](https://www.npmjs.com/package/@quantumcoin/solc) npm package
(QuantumCoin's Solidity 0.7.6 with 32-byte address support).

## Install Dependencies

`npm install`

## Compile Contracts

`npm run compile`

Production artifacts are built via `node scripts/build-production.js` in the `v2-core` repository,
which compiles this router with pinned settings and generates a SHA-256 manifest.

## Run Tests

`npm test`

Tests run against a local QuantumCoin devnet using the `quantumcoin` SDK. The devnet is
downloaded, installed, and started automatically by `scripts/devnet.js` (Windows, macOS, and
Ubuntu). Overrides: `QC_RPC_URL`, `QC_DEVNET_DIR`, `QC_KEYSTORE`, `QC_KEY_PASSWORD`.

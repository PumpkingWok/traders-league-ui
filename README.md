```text
████████╗██████╗  █████╗ ██████╗ ███████╗██████╗ ███████╗
╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝
   ██║   ██████╔╝███████║██║  ██║█████╗  ██████╔╝███████╗
   ██║   ██╔══██╗██╔══██║██║  ██║██╔══╝  ██╔══██╗╚════██║
   ██║   ██║  ██║██║  ██║██████╔╝███████╗██║  ██║███████║
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝

██╗     ███████╗ █████╗  ██████╗ ██╗   ██╗███████╗
██║     ██╔════╝██╔══██╗██╔════╝ ██║   ██║██╔════╝
██║     █████╗  ███████║██║  ███╗██║   ██║█████╗
██║     ██╔══╝  ██╔══██║██║   ██║██║   ██║██╔══╝
███████╗███████╗██║  ██║╚██████╔╝╚██████╔╝███████╗
╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝
```

# Traders League interface

An open source interface for the Traders League onchain virtual trading game protocol.

Enabling users to:

- Create 1v1 matches with configurable assets, buy-in, and duration
- Join open or reserved matches and monitor match lifecycle status
- Track active and completed matches directly from the app

## How to use

Install it and run:

```bash
yarn install
yarn dev
```

Build for production:

```bash
yarn build
```

## Wallet setup

Create a `.env` file from `.env.example` and set:

- `WALLETCONNECT_PROJECT_ID` with your WalletConnect Cloud project id
- `GOLDSKY_SUBGRAPH_URL` as optional fallback endpoint
- `GOLDSKY_SUBGRAPH_URL_HYPEREVM_TESTNET` for Hyperliquid testnet subgraph
- `GOLDSKY_SUBGRAPH_URL_HYPEREVM_MAINNET` for Hyperliquid mainnet subgraph

The app will resolve Goldsky endpoint by connected `chainId` first (`998` / `999`), and fallback to `GOLDSKY_SUBGRAPH_URL` when no chain-specific value is set.

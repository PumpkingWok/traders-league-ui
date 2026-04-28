import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const goldskySubgraphUrlsByChainId = Object.entries(env).reduce<Record<string, string>>((accumulator, [key, value]) => {
    if (!key.startsWith('GOLDSKY_SUBGRAPH_URL_')) return accumulator;
    const chainId = key.slice('GOLDSKY_SUBGRAPH_URL_'.length);
    if (!chainId || !value) return accumulator;
    accumulator[chainId] = value;
    return accumulator;
  }, {});
  if (env.GOLDSKY_SUBGRAPH_URL_HYPEREVM_TESTNET) {
    goldskySubgraphUrlsByChainId['998'] = env.GOLDSKY_SUBGRAPH_URL_HYPEREVM_TESTNET;
  }
  if (env.GOLDSKY_SUBGRAPH_URL_HYPEREVM_MAINNET) {
    goldskySubgraphUrlsByChainId['999'] = env.GOLDSKY_SUBGRAPH_URL_HYPEREVM_MAINNET;
  }

  return {
    plugins: [react()],
    define: {
      __WALLETCONNECT_PROJECT_ID__: JSON.stringify(
        env.WALLETCONNECT_PROJECT_ID ?? 'REPLACE_WITH_YOUR_PROJECT_ID',
      ),
      __GOLDSKY_SUBGRAPH_URL__: JSON.stringify(env.GOLDSKY_SUBGRAPH_URL ?? ''),
      __GOLDSKY_SUBGRAPH_URL_BY_CHAIN_ID__: JSON.stringify(goldskySubgraphUrlsByChainId),
    },
    server: {
      port: 5173,
    },
  };
});

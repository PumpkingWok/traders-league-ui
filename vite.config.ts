import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      __WALLETCONNECT_PROJECT_ID__: JSON.stringify(
        env.WALLETCONNECT_PROJECT_ID ?? 'REPLACE_WITH_YOUR_PROJECT_ID',
      ),
      __GOLDSKY_SUBGRAPH_URL__: JSON.stringify(env.GOLDSKY_SUBGRAPH_URL ?? ''),
    },
    server: {
      port: 5173,
    },
  };
});
